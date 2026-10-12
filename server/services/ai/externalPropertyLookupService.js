/**
 * Resolve any UK address/postcode for Property Intelligence via PropertyData + internal search.
 * Does NOT create marketplace listings — only intelligence_subjects records.
 */

const { getProviderRegistry } = require('../providers/ProviderRegistry');
const { isPropertyDataConfigured, getPropertyDataSetupStatus, propertyIntelligenceConfig } = require('../../config/propertyIntelligence.config');
const {
  normalisePostcode,
  extractPostcodeFromAddress,
  parseCityFromAddress,
  inferMatchConfidenceFromRank,
  normalizeIdentitySearchAddress,
} = require('../../utils/ukAddress');
const { searchUserProperties } = require('./propertyDataAggregator');
const { searchPublicPropertiesForIntelligence } = require('./propertyIntelligenceSearch');
const {
  upsertSubject,
  findSubjectById,
  findSubjectByUprn,
  findEnrichmentBySubject,
  upsertSubjectEnrichment,
  recordSubjectLookup,
  listRecentSubjectsForUser,
  userHasSubjectLookup,
} = require('../enrichment/intelligenceSubjectRepository');
const {
  lookupQueryInvalid,
  checkExpensiveProviderQuota,
  hasReusableUprnProfile,
  classifyProviderFailure,
  logProviderCostEvent,
  PROVIDER_LOOKUP_LIMIT,
} = require('../providers/cache/providerCostProtection');
const {
  linkSubjectToMarketplaceListing,
  getListingSummaryById,
  resolveAuthoritativeLinkedListing,
} = require('./listingUprnLinkService');
const { getPostcodeMarketIntelligence } = require('./postcodeMarketIntelligenceService');
const { parseUprnProfile } = require('../providers/propertyData/propertyDataParsers');
const { applyPropertyDataEvidence } = require('../providers/propertyData/propertyDataEvidence');
const {
  buildSoldPriceFilters,
  buildValuationSaleRequest,
} = require('../providers/propertyData/propertyTypeMapping');
const { isSubjectNativeValuationContext } = require('./subjectNativeSaleValuation');
const { acquisitionFromContext } = require('../identity/marketAcquisitionPolicy');
const { mergeSources, createProvenance } = require('../../utils/provenance');
const { reusedUprnProfileFromSubject } = require('../enrichment/propertyEnrichmentService');
const {
  logIntelligenceFailure,
  POSTCODE_INTEL_UNAVAILABLE_PUBLIC,
  UPRN_PROFILE_FAILED_PUBLIC,
} = require('./propertyIntelligenceProduction');
const {
  UPRNS_MAX_RESULTS,
  mergeMatcherAndDiscovery,
  rankDiscoveryRows,
  shouldSuppressShellAsExactUnit,
  isPostcodeOnlyQuery,
  queryLooksLikeNamedUnit,
} = require('../../utils/uprnDiscovery');

function profileToAttributes(profileData) {
  const parsed = parseUprnProfile(profileData);
  return {
    bedrooms: parsed.bedrooms,
    bathrooms: parsed.bathrooms,
    square_feet: parsed.internalArea,
    property_type: parsed.propertyType,
    epc_rating: parsed.epcRating,
    tenure: parsed.legalTenure,
    occupancy_tenure: parsed.occupancyTenure,
    council_tax_band: parsed.councilTaxBand,
    epc_score: parsed.epcScore,
    lease_years_remaining: parsed.leaseYearsRemaining,
    year_built: parsed.yearBuilt,
    last_sold_price: parsed.lastSoldPrice,
    last_sold_date: parsed.lastSoldDate,
    current_sale_estimate: parsed.currentSaleEstimate,
  };
}

function buildSyntheticPropertyFromSubject(subject) {
  const attrs = typeof subject.attributes === 'string'
    ? JSON.parse(subject.attributes)
    : subject.attributes || {};
  const profile = typeof subject.profile_snapshot === 'string'
    ? JSON.parse(subject.profile_snapshot)
    : subject.profile_snapshot || {};
  const parsed = parseUprnProfile(profile);
  const postcode = subject.postcode || extractPostcodeFromAddress(subject.normalized_address);
  const city = parseCityFromAddress(subject.normalized_address);
  const sqft = attrs.square_feet || parsed.internalArea || null;
  // Asking / estimate price: never seed from historical last sold (temporal leakage firewall).
  const price =
    attrs.current_sale_estimate
    || parsed.currentSaleEstimate
    || null;
  const lastSoldDate = attrs.last_sold_date || parsed.lastSoldDate || null;

  return {
    id: null,
    subjectId: subject.id,
    valuationExecutionMode: 'subject_native',
    uprn: subject.uprn,
    title: subject.normalized_address,
    description: '',
    // Listing workflow category is not fabricated as identity for subjects.
    category: null,
    property_type: attrs.property_type || parsed.propertyType || null,
    // Subjects are not classified as residential by default. UNKNOWN is valid.
    property_category: null,
    status: 'external',
    zip_code: postcode,
    postcode,
    city,
    address_display: subject.normalized_address,
    bedrooms: attrs.bedrooms ?? parsed.bedrooms,
    bathrooms: attrs.bathrooms ?? parsed.bathrooms,
    square_feet: sqft,
    price,
    monthly_rent: null,
    weekly_rent: null,
    latitude: subject.latitude ?? parsed.latitude,
    longitude: subject.longitude ?? parsed.longitude,
    epc_rating: attrs.epc_rating || parsed.epcRating || null,
    tenure: attrs.tenure || parsed.legalTenure || null,
    council_tax_band: attrs.council_tax_band || parsed.councilTaxBand || null,
    year_built: attrs.year_built || parsed.yearBuilt || null,
    last_sold_price: attrs.last_sold_price || parsed.lastSoldPrice || null,
    last_sold_date: lastSoldDate,
    sold_date: lastSoldDate,
    furnished: null,
    has_garden: null,
    has_garage: null,
    parking_spaces: null,
    service_charge: null,
    images: [],
    amenities: [],
    main_image: null,
    source: 'external_intelligence_subject',
    provider: subject.provider,
  };
}

function ttlToExpiresAt(ttlMs) {
  return new Date(Date.now() + ttlMs);
}

/**
 * Enrich external subject with postcode/UPRN market data (cached on subject_id).
 */
async function enrichSubjectForIntelligence(subject, property, userId, deps = {}) {
  if (!isPropertyDataConfigured() && !deps.marketProvider) {
    return {
      available: false,
      message: 'External enrichment not configured',
      enrichments: {},
      sources: ['PropertyData_UPRN'],
      partial: true,
    };
  }

  const registry = deps.getProviderRegistry ? deps.getProviderRegistry() : getProviderRegistry();
  const marketProvider = deps.marketProvider || registry.getPrimaryMarketDataProvider();
  const ctx = { userId, propertyId: null, subjectId: subject.id };
  const enrichments = {};
  let totalCreditsUsed = 0;
  const postcode = normalisePostcode(subject.postcode || property.zip_code);
  const acquisition = deps.acquisition || acquisitionFromContext(deps, property);

  async function fetchAndPersist(type, method, ttlKey, fetchFn) {
    const findCached = deps.findEnrichmentBySubject || findEnrichmentBySubject;
    const persist = deps.upsertSubjectEnrichment || upsertSubjectEnrichment;
    const cached = await findCached(subject.id, type, 'PropertyData');
    if (cached) {
      enrichments[type] = {
        success: true,
        data: cached.payload,
        provenance: cached.provenance,
        fromPersistence: true,
      };
      return;
    }
    const fetched = await fetchFn();
    if (!fetched?.success) {
      enrichments[type] = fetched;
      return;
    }
    await persist({
      subjectId: subject.id,
      enrichmentType: type,
      source: 'PropertyData',
      payload: fetched.data || fetched.profile || fetched.valuation,
      provenance: fetched.provenance || { source: 'PropertyData', method: type },
      expiresAt: ttlToExpiresAt(propertyIntelligenceConfig.cacheTtl[ttlKey]),
    });
    enrichments[type] = fetched;
    if (fetched.creditsUsed) totalCreditsUsed += fetched.creditsUsed;
  }

  if (marketProvider?.isAvailable() && postcode) {
    const soldFilters = buildSoldPriceFilters(property);
    if (acquisition.fetchSoldPrices) {
      await fetchAndPersist('sold_prices', 'getSoldPrices', 'soldPrices', () =>
        marketProvider.getSoldPrices(postcode, ctx, soldFilters)
      );
    }
    if (acquisition.fetchSoldPricesPerSqf) {
      await fetchAndPersist('sold_prices_per_sqf', 'getSoldPricesPerSqf', 'soldPricesPerSqf', () =>
        marketProvider.getSoldPricesPerSqf(postcode, ctx, soldFilters)
      );
    }
    if (acquisition.fetchRents) {
      await fetchAndPersist('rents', 'getRents', 'rents', () =>
        marketProvider.getRents(postcode, ctx, soldFilters)
      );
    }
    if (acquisition.fetchDemand && typeof marketProvider.getDemand === 'function') {
      await fetchAndPersist('demand', 'getDemand', 'marketDemand', () =>
        marketProvider.getDemand(postcode, ctx)
      );
    }
    if (acquisition.fetchDemandRent && typeof marketProvider.getDemandRent === 'function') {
      await fetchAndPersist('demand_rent', 'getDemandRent', 'marketDemand', () =>
        marketProvider.getDemandRent(postcode, ctx)
      );
    }
  }

  const reusedProfile = reusedUprnProfileFromSubject(subject);
  if (reusedProfile) {
    enrichments.uprn_profile = reusedProfile;
  } else if (marketProvider?.isAvailable() && subject.uprn) {
    await fetchAndPersist('uprn_profile', 'getUprnProfile', 'uprnProfile', () =>
      marketProvider.getUprnProfile(subject.uprn, ctx)
    );
  } else {
    enrichments.uprn_profile = {
      success: true,
      data: subject.profile_snapshot,
      fromSubject: true,
      provenance: createProvenance({
        source: 'PropertyData',
        method: 'uprn_profile',
        providerEndpoint: '/uprn',
        retrievedAt: subject.updated_at || subject.created_at || new Date(),
        notes: 'Subject profile_snapshot used without a freshness window. Not newly retrieved.',
      }),
    };
  }

  const identity = {
    uprn: subject.uprn,
    normalized_address: subject.normalized_address,
    postcode: subject.postcode,
    provider: subject.provider,
    subjectId: subject.id,
  };
  const avmBase = {
    ...property,
    id: null,
    subjectId: subject.id,
    valuationExecutionMode: 'subject_native',
    category: null,
    price: null,
    last_sold_price: null,
    last_sold_date: null,
    sold_date: null,
  };
  const avmProperty = applyPropertyDataEvidence(avmBase, { enrichments, identity }).property;
  const avmReadiness = buildValuationSaleRequest(avmProperty);

  if (
    acquisition.fetchSaleValuation
    && marketProvider?.isAvailable()
    && isSubjectNativeValuationContext(avmProperty)
    && avmReadiness.canRequestAvm
  ) {
    await fetchAndPersist('valuation_sale', 'getSaleValuation', 'valuation', () =>
      marketProvider.getSaleValuation(avmProperty, ctx)
    );
  }

  return {
    available: true,
    identity,
    enrichments,
    sources: mergeSources('PropertyData', 'HM_Land_Registry'),
    totalCreditsUsed,
    partial: false,
  };
}

function buildInternalMatchRow(p) {
  return {
    type: 'internal',
    propertyId: p.id,
    address: p.address_display,
    postcode: p.zip_code,
    uprn: p.uprn || null,
    source: p.source || 'marketplace',
    matchMethod: p.matchMethod || 'text',
    matchConfidence: p.matchConfidence || 'medium',
    property: p,
  };
}

function buildExternalMatchRow(m) {
  return {
    type: 'external',
    uprn: m.uprn,
    address: m.address,
    latitude: m.latitude,
    longitude: m.longitude,
    matchConfidence: m.matchConfidence,
    classificationCode: m.classificationCode || null,
    classificationCodeDesc: m.classificationCodeDesc,
    addressParts: m.addressParts || null,
    secondary: m.secondary || m.addressParts?.secondary || null,
    primary: m.primary || m.addressParts?.primary || null,
    street: m.street || m.addressParts?.street || null,
    kind: m.kind || null,
    source: m.source || null,
    matcherHit: Boolean(m.matcherHit),
    exactUnitUnconfirmed: Boolean(m.exactUnitUnconfirmed),
  };
}

async function lookupPropertyIntelligence(query, userId, deps = {}) {
  const invalid = lookupQueryInvalid(query);
  if (invalid) return invalid;

  const q = (query || '').trim();

  const searchMine = deps.searchUserProperties || searchUserProperties;
  const searchBrowse = deps.searchPublicPropertiesForIntelligence || searchPublicPropertiesForIntelligence;
  let internalMine = [];
  let internalBrowse = [];
  try {
    [internalMine, internalBrowse] = await Promise.all([
      userId ? searchMine(userId, q) : [],
      searchBrowse(q, { limit: 40 }),
    ]);
  } catch (err) {
    logIntelligenceFailure('lookupPropertyIntelligence.internal', err);
  }

  const internalIds = new Set(internalMine.map((p) => p.id));
  const internal = [
    ...internalMine.map((p) => ({ ...p, source: 'my_listing' })),
    ...internalBrowse.filter((p) => !internalIds.has(p.id)).map((p) => ({ ...p, source: 'marketplace' })),
  ].slice(0, 30);

  const basePayload = {
    success: true,
    query: q,
    internal,
    matches: internal.map(buildInternalMatchRow),
  };

  const postcodeForMarket = extractPostcodeFromAddress(q);
  if (postcodeForMarket) {
    try {
      const postcodeFn = deps.getPostcodeMarketIntelligence || getPostcodeMarketIntelligence;
      basePayload.postcodeIntelligence = await postcodeFn(postcodeForMarket, { userId });
    } catch (err) {
      logIntelligenceFailure('lookupPropertyIntelligence.postcode', err);
      basePayload.postcodeIntelligence = {
        success: false,
        message: POSTCODE_INTEL_UNAVAILABLE_PUBLIC,
      };
    }
  }

  const configured = deps.isPropertyDataConfigured
    ? deps.isPropertyDataConfigured()
    : isPropertyDataConfigured();
  if (!configured) {
    const setup = deps.getPropertyDataSetupStatus
      ? deps.getPropertyDataSetupStatus()
      : getPropertyDataSetupStatus();
    return {
      ...basePayload,
      external: {
        available: false,
        reason: setup.reason,
        message: internal.length
          ? `${internal.length} listing${internal.length === 1 ? '' : 's'} found on our platform. External UK lookup requires PropertyData configuration.`
          : setup.message,
        matches: [],
      },
    };
  }

  const quotaFn = deps.checkExpensiveProviderQuota || checkExpensiveProviderQuota;
  const quota = await quotaFn(userId);
  if (!quota.allowed) {
    logProviderCostEvent({
      event: 'lookup_quota',
      outcome: PROVIDER_LOOKUP_LIMIT,
      endpoint: 'address-match-uprn',
      userId,
    });
    return {
      ...basePayload,
      normalizedSearch: {
        searchAddress: normalizeIdentitySearchAddress(q),
        postcode: extractPostcodeFromAddress(q),
      },
      external: {
        available: true,
        matches: [],
        code: PROVIDER_LOOKUP_LIMIT,
        message: quota.message,
      },
    };
  }

  const registry = deps.getProviderRegistry ? deps.getProviderRegistry() : getProviderRegistry();
  const provider = deps.identityProvider || registry.getPrimaryIdentityProvider();
  const postcode = extractPostcodeFromAddress(q);
  const searchAddress = normalizeIdentitySearchAddress(q);
  const postcodeOnly = isPostcodeOnlyQuery(q, postcode);
  const syntheticProperty = {
    address_line1: q,
    zip_code: postcode,
    postcode,
    city: parseCityFromAddress(q),
    searchAddress,
  };

  const resolveIdentity =
    deps.resolveIdentity || ((property, ctx) => provider.resolveIdentity(property, ctx));
  const listUprnsInPostcode =
    typeof deps.listUprnsInPostcode === 'function'
      ? deps.listUprnsInPostcode
      : !deps.resolveIdentity && provider && typeof provider.listUprnsInPostcode === 'function'
        ? (pc, ctx) => provider.listUprnsInPostcode(pc, ctx)
        : null;

  let matcherRows = [];
  let lastSearchAddress = searchAddress;
  let matcherError = null;
  let discovery = { success: true, skipped: true, rows: [], potentiallyTruncated: false };
  let discoveryError = null;

  const runMatcher = async () => {
    if (postcodeOnly) return;
    const resolved = await resolveIdentity(syntheticProperty, {
      userId,
      propertyId: null,
    });
    lastSearchAddress = resolved.address || searchAddress;
    const uniqueRow =
      resolved.success && resolved.uprn
        ? {
            uprn: String(resolved.uprn),
            address: resolved.address || q,
            latitude: resolved.latitude,
            longitude: resolved.longitude,
            matchConfidence: resolved.matchConfidence,
            classificationCode: resolved.classificationCode || null,
            classificationCodeDesc: resolved.classificationCodeDesc,
          }
        : null;
    if (uniqueRow) {
      if (shouldSuppressShellAsExactUnit(q, uniqueRow)) {
        matcherRows.push({
          ...uniqueRow,
          matchConfidence: 'low',
          kind: 'shell',
          exactUnitUnconfirmed: true,
          source: 'address_match',
        });
      } else {
        matcherRows.push(uniqueRow);
      }
    }
    (resolved.alternativeMatches || []).forEach((m, i) => {
      if (m.uprn && !matcherRows.some((e) => String(e.uprn) === String(m.uprn))) {
        matcherRows.push({
          uprn: String(m.uprn),
          address: m.address || q,
          latitude: m.latitude ?? m.lat,
          longitude: m.longitude ?? m.lng,
          matchConfidence: inferMatchConfidenceFromRank(
            i + 1,
            (resolved.alternativeMatches?.length || 0) + 1
          ),
          classificationCode: m.classificationCode || null,
          classificationCodeDesc: m.classificationCodeDesc,
          source: 'address_match',
        });
      }
    });
  };

  const runDiscovery = async () => {
    if (!postcode || typeof listUprnsInPostcode !== 'function') return;
    const listed = await listUprnsInPostcode(postcode, { userId, propertyId: null });
    discovery = listed && typeof listed === 'object' ? listed : { success: false, rows: [] };
  };

  try {
    await Promise.all([
      runMatcher().catch((err) => {
        matcherError = err;
      }),
      runDiscovery().catch((err) => {
        discoveryError = err;
      }),
    ]);
  } catch (err) {
    matcherError = matcherError || err;
  }

  if (!matcherRows.length && !(discovery.rows || []).length) {
    const failErr = discoveryError || matcherError;
    if (failErr) {
      logIntelligenceFailure('lookupPropertyIntelligence.external', failErr);
      const classified = classifyProviderFailure(failErr);
      return {
        ...basePayload,
        normalizedSearch: { searchAddress, postcode },
        external: {
          available: true,
          matches: [],
          code: classified.code,
          discoveryFailed: Boolean(discoveryError),
          message: internal.length
            ? `${internal.length} listing${internal.length === 1 ? '' : 's'} on our platform. External lookup failed — you can still analyse a platform listing above.`
            : classified.message,
        },
      };
    }
    if (!postcode) {
      return {
        ...basePayload,
        normalizedSearch: { searchAddress, postcode: null },
        external: {
          available: true,
          matches: [],
          message: internal.length
            ? `${internal.length} listing${internal.length === 1 ? '' : 's'} on our platform. For external UK addresses, add a valid postcode (e.g. B1 2UJ).`
            : 'Could not detect a UK postcode. Add a valid postcode (e.g. B1 2UJ) — spaces are optional.',
        },
      };
    }
  } else if (discoveryError) {
    logIntelligenceFailure('lookupPropertyIntelligence.uprns', discoveryError);
  } else if (matcherError) {
    logIntelligenceFailure('lookupPropertyIntelligence.external', matcherError);
  }

  const merged = mergeMatcherAndDiscovery({
    query: q,
    matcherRows,
    discoveryRows: discovery.rows || [],
  });
  const namedUnitUnconfirmed =
    matcherRows.some((row) => row.exactUnitUnconfirmed)
    || (queryLooksLikeNamedUnit(q) && merged.some((row) => row.kind === 'shell'));
  if (namedUnitUnconfirmed) {
    merged.forEach((row) => {
      if (row.exactUnitUnconfirmed || row.kind === 'shell') {
        row.exactUnitUnconfirmed = row.exactUnitUnconfirmed || queryLooksLikeNamedUnit(q);
      }
    });
  }
  const ranked = rankDiscoveryRows(merged, q, postcode).slice(0, UPRNS_MAX_RESULTS);
  const externalRows = ranked.map(buildExternalMatchRow);
  const potentiallyTruncated = Boolean(discovery.potentiallyTruncated);

  let message;
  if (ranked.length) {
    message = `${ranked.length} UK address${ranked.length === 1 ? '' : 'es'} found — select the exact property.`;
    if (potentiallyTruncated) {
      message += ' Results may be incomplete because the provider returned its maximum page size.';
    }
    if (namedUnitUnconfirmed) {
      message +=
        ' The named unit was not confirmed. A building/shell is not that named flat — choose a returned address.';
    }
  } else if (internal.length) {
    message = `${internal.length} listing${internal.length === 1 ? '' : 's'} on our platform. No additional UK address match for "${lastSearchAddress}".`;
  } else if (postcode) {
    message = `No UK address match for "${lastSearchAddress}". Check flat number, building name spelling, and postcode (parsed as ${postcode}).`;
  } else {
    message = 'No UK address match — include a valid UK postcode.';
  }

  return {
    ...basePayload,
    matches: [...basePayload.matches, ...externalRows],
    normalizedSearch: { searchAddress: lastSearchAddress, postcode },
    external: {
      available: true,
      matches: ranked,
      potentiallyTruncated,
      requestedResults: discovery.requestedResults || UPRNS_MAX_RESULTS,
      returnedCount: ranked.length,
      namedUnitUnconfirmed,
      postcodeOnly,
      discoveryUsed: Boolean(postcode && listUprnsInPostcode && !discovery.skipped),
      message,
    },
  };
}

async function finishResolvedSubject({
  subject,
  userId,
  uprnStr,
  profile,
  matchConfidence,
  address,
  providerExecution,
  creditsUsed = 0,
  deps = {},
}) {
  const attrs = profileToAttributes(profile);
  const normalizedAddress =
    address ||
    subject?.normalized_address ||
    profile.address ||
    profile.full_address ||
    `UPRN ${uprnStr}`;
  const postcode =
    normalisePostcode(extractPostcodeFromAddress(normalizedAddress)) ||
    normalisePostcode(profile.postcode || subject?.postcode);

  const linkFn = deps.linkSubjectToMarketplaceListing || linkSubjectToMarketplaceListing;
  const upsert = deps.upsertSubject || upsertSubject;
  const recordLookup = deps.recordSubjectLookup || recordSubjectLookup;
  const linkResult = await linkFn({
    uprn: uprnStr,
    postcode,
    normalizedAddress,
    latitude: profile.latitude ?? profile.lat ?? subject?.latitude ?? null,
    longitude: profile.longitude ?? profile.lng ?? subject?.longitude ?? null,
  });

  const saved = await upsert({
    uprn: uprnStr,
    normalizedAddress,
    postcode,
    latitude: profile.latitude ?? profile.lat ?? subject?.latitude ?? null,
    longitude: profile.longitude ?? profile.lng ?? subject?.longitude ?? null,
    // Only UPRN-backed linkage may persist property_id. Do not write
    // postcode_address matches. Passing null leaves any historical FK in place
    // (COALESCE); analysis fail-safe ignores unsafe FKs.
    propertyId: linkResult.linked ? linkResult.listing.id : null,
    attributes: attrs,
    profileSnapshot: profile && Object.keys(profile).length ? profile : {},
    matchConfidence,
    matchMethod: 'propertydata_address_match',
    createdBy: userId,
  });

  if (userId) {
    await recordLookup(userId, saved.id);
  }

  const property = buildSyntheticPropertyFromSubject(saved);
  return {
    success: true,
    subject: saved,
    property,
    linkedListing: linkResult.linked ? linkResult.listing : null,
    linkMeta: linkResult.linked
      ? { matchMethod: linkResult.matchMethod, confidence: linkResult.confidence }
      : null,
    accessContext: {
      relationship: linkResult.linked ? 'external_linked_listing' : 'external_lookup',
      accessLevel: 'public_intelligence',
      source: 'PropertyData',
      uprn: uprnStr,
      subjectId: saved.id,
      linkedPropertyId: linkResult.linked ? linkResult.listing.id : null,
    },
    providerExecution,
    creditsUsed,
  };
}

async function resolveExternalSubject({
  uprn,
  address,
  userId,
  matchConfidence = 'medium',
  deps = {},
} = {}) {
  if (!isPropertyDataConfigured() && !deps.getUprnProfile && !deps.findSubjectByUprn) {
    return { success: false, message: 'PropertyData API is not configured on this server.' };
  }

  const uprnStr = String(uprn);
  const findSubject = deps.findSubjectByUprn || findSubjectByUprn;
  const existing = await findSubject(uprnStr);

  if (hasReusableUprnProfile(existing)) {
    logProviderCostEvent({
      event: 'resolve_reuse',
      endpoint: 'uprn',
      outcome: 'reused_subject',
      userId,
    });
    const subject = existing;
    const linkFn = deps.linkSubjectToMarketplaceListing || linkSubjectToMarketplaceListing;
    const linkResult = await linkFn({
      uprn: uprnStr,
      postcode: existing.postcode,
      normalizedAddress: address || existing.normalized_address,
      latitude: existing.latitude,
      longitude: existing.longitude,
    });
    if (userId) {
      if (deps.recordSubjectLookup) await deps.recordSubjectLookup(userId, subject.id);
      else await recordSubjectLookup(userId, subject.id);
    }
    return {
      success: true,
      subject: existing,
      property: buildSyntheticPropertyFromSubject(existing),
      linkedListing: linkResult.linked ? linkResult.listing : null,
      linkMeta: linkResult.linked
        ? { matchMethod: linkResult.matchMethod, confidence: linkResult.confidence }
        : null,
      accessContext: {
        relationship: linkResult.linked ? 'external_linked_listing' : 'external_lookup',
        accessLevel: 'public_intelligence',
        source: existing.provider || 'PropertyData',
        uprn: uprnStr,
        subjectId: existing.id,
        linkedPropertyId: linkResult.linked ? linkResult.listing.id : null,
      },
      providerExecution: 'reused_subject',
      creditsUsed: 0,
    };
  }

  const quotaFn = deps.checkExpensiveProviderQuota || checkExpensiveProviderQuota;
  const quota = await quotaFn(userId);
  if (!quota.allowed) {
    return {
      success: false,
      code: PROVIDER_LOOKUP_LIMIT,
      message: quota.message,
    };
  }

  const registry = getProviderRegistry();
  const provider = deps.marketProvider || registry.getPrimaryMarketDataProvider();
  const getUprnProfile =
    deps.getUprnProfile || ((id, ctx) => provider.getUprnProfile(id, ctx));

  let profileResult = null;
  try {
    profileResult = await getUprnProfile(uprnStr, { userId, propertyId: null });
  } catch (err) {
    logIntelligenceFailure('resolveExternalSubject.uprnProfile', err);
    const classified = classifyProviderFailure(err);
    return { success: false, code: classified.code, message: UPRN_PROFILE_FAILED_PUBLIC };
  }

  const profile = profileResult.profile || profileResult.data || {};
  const persistMeta = { createdBy: userId, matchConfidence };
  return finishResolvedSubject({
    subject: existing,
    userId: persistMeta.createdBy,
    uprnStr,
    profile,
    matchConfidence: persistMeta.matchConfidence,
    address,
    providerExecution: profileResult.cacheHit ? 'cache_hit' : 'provider_execution',
    creditsUsed: profileResult.creditsUsed || 0,
    deps,
  });
}

const SUBJECT_PREVIEW_NOT_FOUND_PUBLIC = 'Analysis subject not found.';

function subjectPreviewNotFoundBody() {
  return { success: false, message: SUBJECT_PREVIEW_NOT_FOUND_PUBLIC };
}

function evaluateSubjectPreviewAccess({
  userId,
  subjectId,
  hasLookup = false,
  createdBy = null,
} = {}) {
  const uid = Number(userId);
  const id = Number(subjectId);
  if (!Number.isFinite(uid) || uid <= 0 || !Number.isFinite(id) || id <= 0) return false;
  if (hasLookup) return true;
  return createdBy != null && Number(createdBy) === uid;
}

async function assertSubjectPreviewAccess(userId, subjectId) {
  const denied = { ok: false, status: 404, body: subjectPreviewNotFoundBody() };
  const uid = Number(userId);
  const id = Number(subjectId);
  if (!evaluateSubjectPreviewAccess({ userId: uid, subjectId: id, hasLookup: true })) {
    return denied;
  }
  if (await userHasSubjectLookup(uid, id)) {
    return { ok: true };
  }
  const subject = await findSubjectById(id);
  if (
    evaluateSubjectPreviewAccess({
      userId: uid,
      subjectId: id,
      hasLookup: false,
      createdBy: subject?.created_by,
    })
  ) {
    return { ok: true };
  }
  return denied;
}

async function getSubjectPreview(subjectId) {
  const subject = await findSubjectById(subjectId);
  if (!subject) {
    return { success: false, message: SUBJECT_PREVIEW_NOT_FOUND_PUBLIC };
  }

  const authoritative = await resolveAuthoritativeLinkedListing(subject);
  let linkedListing = null;
  if (authoritative.linked && authoritative.listing?.id) {
    linkedListing = await getListingSummaryById(authoritative.listing.id);
  }

  return {
    success: true,
    subject: { id: subject.id, uprn: subject.uprn, address: subject.normalized_address },
    property: buildSyntheticPropertyFromSubject(subject),
    linkedListing,
    accessContext: {
      relationship: linkedListing ? 'external_linked_listing' : 'external_lookup',
      accessLevel: 'public_intelligence',
      source: subject.provider || 'PropertyData',
      uprn: subject.uprn,
      subjectId: subject.id,
      linkedPropertyId: linkedListing?.id || null,
    },
  };
}

async function getRecentSubjectLookups(userId, limit = 12) {
  const rows = await listRecentSubjectsForUser(userId, limit);
  return {
    success: true,
    subjects: rows.map((row) => ({
      id: row.id,
      uprn: row.uprn,
      address: row.normalized_address,
      postcode: row.postcode,
      linkedPropertyId: row.property_id,
      lastAccessedAt: row.last_accessed_at,
      accessCount: row.access_count,
    })),
  };
}

module.exports = {
  lookupPropertyIntelligence,
  resolveExternalSubject,
  getSubjectPreview,
  getRecentSubjectLookups,
  enrichSubjectForIntelligence,
  buildSyntheticPropertyFromSubject,
  profileToAttributes,
  hasReusableUprnProfile,
  evaluateSubjectPreviewAccess,
  assertSubjectPreviewAccess,
  assertSubjectAccess: assertSubjectPreviewAccess,
  SUBJECT_PREVIEW_NOT_FOUND_PUBLIC,
};
