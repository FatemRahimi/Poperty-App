/**
 * Property enrichment orchestrator — resolve identity, fetch external data, cache, persist.
 *
 * Architecture: Internal DB (system of record) + external provider enrichment layer.
 * Never replaces listing data; supplements intelligence with licensed external sources.
 */

const {
  isExternalEnrichmentAvailable,
  propertyIntelligenceConfig,
} = require('../../config/propertyIntelligence.config');
const { buildSoldPriceFilters } = require('../providers/propertyData/propertyTypeMapping');
const { applyPropertyDataEvidence } = require('../providers/propertyData/propertyDataEvidence');
const { getProviderRegistry } = require('../providers/ProviderRegistry');
const { mergeSources, createProvenance } = require('../../utils/provenance');
const { normalisePostcode, buildAddressFromProperty } = require('../../utils/ukAddress');
const { hasReusableUprnProfile } = require('../providers/cache/providerCostProtection');
const {
  findIdentityByPropertyId,
  upsertIdentity,
  createListingFallbackIdentity,
  findEnrichment,
  upsertEnrichment,
  listEnrichmentsForProperty,
} = require('./propertyIdentityRepository');
const {
  findSubjectByUprn,
  findSubjectById,
  findSubjectByPropertyId,
} = require('./intelligenceSubjectRepository');
const { acquisitionFromContext } = require('../identity/marketAcquisitionPolicy');
const { extractCanonicalAddress } = require('../identity/canonicalAddress');
const {
  hasReusableUprn,
  uprnResolutionAlreadyAttempted,
  persistUniqueUprn,
} = require('../identity/canonicalIdentityService');
const {
  IDENTITY_VERIFICATION_STATE,
  IDENTITY_EVIDENCE_SOURCE_TYPE,
  selectUniqueUprnMatch,
} = require('../../architecture/canonicalIdentity');

function ttlToExpiresAt(ttlMs) {
  return new Date(Date.now() + ttlMs);
}

function parseSubjectSnapshot(subject) {
  if (!subject) return null;
  let snap = subject.profile_snapshot;
  if (typeof snap === 'string') {
    try {
      snap = JSON.parse(snap);
    } catch {
      return null;
    }
  }
  if (!snap || typeof snap !== 'object' || Array.isArray(snap) || !Object.keys(snap).length) {
    return null;
  }
  return snap;
}

function reusedUprnProfileFromSubject(subject) {
  const snap = parseSubjectSnapshot(subject);
  if (!snap || !hasReusableUprnProfile(subject)) return null;
  const retrievedAt = subject.updated_at || subject.created_at || null;
  return {
    success: true,
    enrichmentType: 'uprn_profile',
    source: 'PropertyData',
    data: snap,
    fromSubject: true,
    cacheHit: true,
    creditsUsed: 0,
    provenance: createProvenance({
      source: 'PropertyData',
      method: 'uprn_profile',
      providerEndpoint: '/uprn',
      retrievedAt: retrievedAt || new Date(),
      notes:
        'Reused fresh intelligence_subjects.profile_snapshot. Not newly retrieved from PropertyData.',
    }),
  };
}

async function findCanonicalSubject(property = {}, context = {}, deps = {}) {
  const findById = deps.findSubjectById || findSubjectById;
  const findByUprn = deps.findSubjectByUprn || findSubjectByUprn;
  const findByProperty = deps.findSubjectByPropertyId || findSubjectByPropertyId;
  if (context.subjectId) {
    const byId = await findById(context.subjectId);
    if (byId) return byId;
  }
  if (property.id) {
    const byProperty = await findByProperty(property.id);
    if (byProperty) return byProperty;
  }
  const uprn = property.uprn || context.uprn;
  if (uprn) return findByUprn(uprn);
  return null;
}

async function persistListingFields(property, existing, upsert) {
  const listing = extractCanonicalAddress(property);
  const existingLimitations = existing?.identity_limitations || existing?.identityLimitations || {};
  const notes = typeof existingLimitations === 'object' && existingLimitations.notes
    ? existingLimitations.notes
    : listing.limitations;
  const attempted = Boolean(
    existing?.uprn_retrieved_at
    || existing?.uprnRetrievedAt
    || existingLimitations.uprnResolutionAttempted
  );
  return upsert({
    propertyId: property.id,
    uprn: existing?.uprn || null,
    uprnMode: 'preserve',
    normalizedAddress: listing.canonicalAddress || existing?.normalized_address || existing?.normalizedAddress || buildAddressFromProperty(property),
    postcode: listing.postcode || existing?.postcode || normalisePostcode(property.zip_code || property.postcode) || null,
    latitude: existing?.latitude || property.latitude,
    longitude: existing?.longitude || property.longitude,
    matchConfidence: existing?.match_confidence || existing?.matchConfidence || (listing.paon && listing.postcodeCompact ? 'medium' : 'low'),
    matchMethod: existing?.match_method || existing?.matchMethod || 'listing_fields',
    provider: existing?.provider || 'InternalListing',
    providerPayload: existing?.provider_payload || existing?.providerPayload || { source: 'application_database' },
    paon: listing.paon,
    saon: listing.saon,
    postcodeCompact: listing.postcodeCompact || existing?.postcode_compact || existing?.postcodeCompact,
    identityState: existing?.uprn ? IDENTITY_VERIFICATION_STATE.SOURCE_ASSERTED : listing.identityState,
    identitySource: existing?.identity_source || existing?.identitySource || listing.identitySource,
    evidenceSourceType: existing?.evidence_source_type || existing?.evidenceSourceType || listing.evidenceSourceType,
    verificationState: existing?.uprn
      ? IDENTITY_VERIFICATION_STATE.SOURCE_ASSERTED
      : listing.verificationState,
    retrievedAt: existing?.retrieved_at || existing?.retrievedAt || listing.retrievedAt,
    uprnRetrievedAt: existing?.uprn_retrieved_at || existing?.uprnRetrievedAt || null,
    identityLimitations: {
      notes,
      uprnResolutionAttempted: attempted,
    },
    sourceAddress: listing.sourceAddress,
  });
}

async function resolvePropertyIdentity(property, context = {}) {
  const deps = context.deps || {};
  const findIdentity = deps.findIdentityByPropertyId || findIdentityByPropertyId;
  const upsert = deps.upsertIdentity || upsertIdentity;
  const createFallback = deps.createListingFallbackIdentity || createListingFallbackIdentity;
  let existing = await findIdentity(property.id);
  try {
    existing = await persistListingFields(property, existing, upsert);
  } catch {
    existing = existing || null;
  }
  if (hasReusableUprn(existing) && existing.match_confidence !== 'low') {
    return { success: true, identity: existing, fromCache: true, externalResolution: false };
  }

  const subject = await findCanonicalSubject(property, context, deps);
  const knownUprn = existing?.uprn || property.uprn || context.uprn || subject?.uprn || null;
  if (knownUprn) {
    const listing = extractCanonicalAddress(property);
    const identity = await upsert({
      propertyId: property.id,
      uprn: String(knownUprn),
      uprnMode: 'set',
      normalizedAddress:
        subject?.normalized_address || existing?.normalized_address || listing.canonicalAddress
        || buildAddressFromProperty(property),
      postcode: listing.postcode || normalisePostcode(
        property.zip_code || property.postcode || subject?.postcode || existing?.postcode
      ),
      latitude: subject?.latitude || existing?.latitude || property.latitude,
      longitude: subject?.longitude || existing?.longitude || property.longitude,
      matchConfidence: subject?.match_confidence || existing?.match_confidence || 'high',
      matchMethod: 'canonical_uprn_reuse',
      provider: subject?.provider || existing?.provider || 'PropertyData',
      providerPayload: {
        reusedFrom: subject ? 'intelligence_subject' : 'known_uprn',
        subjectId: subject?.id || context.subjectId || null,
      },
      paon: listing.paon,
      saon: listing.saon,
      postcodeCompact: listing.postcodeCompact,
      identityState: IDENTITY_VERIFICATION_STATE.SOURCE_ASSERTED,
      identitySource: subject?.provider || existing?.identity_source || 'PropertyData',
      evidenceSourceType: IDENTITY_EVIDENCE_SOURCE_TYPE.LICENSED_PROVIDER,
      verificationState: IDENTITY_VERIFICATION_STATE.SOURCE_ASSERTED,
      sourceAddress: listing.sourceAddress,
      identityLimitations: {
        notes: listing.limitations,
        uprnResolutionAttempted: true,
        uprnIsNotVerifiedExact: true,
      },
    });
    return {
      success: true,
      identity,
      fromCache: true,
      externalResolution: false,
      reusedSubject: Boolean(subject),
    };
  }

  const allowPaid = context.allowPaidIdentity !== false;
  if (!allowPaid) {
    return {
      success: true,
      identity: existing || (await createFallback(property)),
      fromCache: Boolean(existing),
      externalResolution: false,
      paidSkipped: true,
    };
  }

  if (uprnResolutionAlreadyAttempted(existing) && !hasReusableUprn(existing)) {
    return {
      success: true,
      identity: existing,
      fromCache: true,
      externalResolution: false,
    };
  }

  const registry = deps.getProviderRegistry ? deps.getProviderRegistry() : getProviderRegistry();
  const identityProvider = deps.identityProvider || registry.getPrimaryIdentityProvider();

  if (!identityProvider?.isAvailable()) {
    const fallback = existing || (await createFallback(property));
    return {
      success: true,
      identity: fallback,
      fromCache: Boolean(existing),
      externalResolution: false,
      message: 'External identity provider unavailable — using listing address only',
    };
  }

  try {
    const resolved = await identityProvider.resolveIdentity(property, {
      userId: context.userId,
      propertyId: property.id,
    });

    const unique = selectUniqueUprnMatch(
      resolved.unresolved
        ? (resolved.alternativeMatches || [])
        : (resolved.uprn ? [{ uprn: resolved.uprn }, ...(resolved.alternativeMatches || [])] : [])
    );

    if (resolved.unresolved || !resolved.success || !unique.unique) {
      const identity = await persistUniqueUprn(property, {
        ...resolved,
        uprn: unique.uprn,
        alternativeMatches: resolved.alternativeMatches || [],
      }, existing, deps);
      return {
        success: true,
        identity,
        externalResolution: Boolean(resolved && resolved.provider),
        unresolved: true,
        resolutionAttempt: resolved,
      };
    }

    const identity = await persistUniqueUprn(property, {
      ...resolved,
      uprn: unique.uprn,
      alternativeMatches: [],
    }, existing, deps);

    return { success: true, identity, externalResolution: true, resolution: resolved };
  } catch (error) {
    const fallback = existing || (await createFallback(property));
    return {
      success: true,
      identity: fallback,
      externalResolution: false,
      error: error.message,
    };
  }
}

async function fetchAndPersistEnrichment({
  property,
  enrichmentType,
  source,
  fetchFn,
  ttlMs,
  context,
}) {
  const deps = context?.deps || {};
  const findCached = deps.findEnrichment || findEnrichment;
  const persist = deps.upsertEnrichment || upsertEnrichment;
  const cached = await findCached(property.id, enrichmentType, source);
  if (cached) {
    return {
      success: true,
      enrichmentType,
      source,
      data: cached.payload,
      provenance: cached.provenance,
      fromPersistence: true,
    };
  }

  const fetched = await fetchFn();
  if (!fetched?.success) {
    return fetched;
  }

  const expiresAt = ttlToExpiresAt(ttlMs);
  await persist({
    propertyId: property.id,
    enrichmentType,
    source,
    payload: fetched.data || fetched.profile || fetched.valuation || fetched,
    provenance: fetched.provenance || { source, method: enrichmentType },
    expiresAt,
  });

  return {
    success: true,
    enrichmentType,
    source,
    data: fetched.data || fetched.profile || fetched.valuation,
    provenance: fetched.provenance,
    cacheHit: fetched.cacheHit,
    creditsUsed: fetched.creditsUsed || 0,
  };
}

/**
 * Fetch external intelligence bundle for a property analysis run.
 * Cost-conscious: postcode market data first; UPRN profile only when UPRN exists.
 */
async function enrichPropertyForIntelligence(property, context = {}) {
  const deps = context.deps || {};
  const enrichmentAvailable = deps.isExternalEnrichmentAvailable
    ? deps.isExternalEnrichmentAvailable()
    : isExternalEnrichmentAvailable();
  if (!enrichmentAvailable) {
    let identity = extractCanonicalAddress(property);
    try {
      const createFallback = deps.createListingFallbackIdentity || createListingFallbackIdentity;
      identity = await createFallback(property);
    } catch {
      identity = extractCanonicalAddress(property);
    }
    return {
      available: false,
      enabled: propertyIntelligenceConfig.enabled,
      message: 'External enrichment disabled or no provider credentials configured',
      identity,
      enrichments: {},
      sources: ['ApplicationDatabase'],
      partial: true,
    };
  }

  const registry = deps.getProviderRegistry ? deps.getProviderRegistry() : getProviderRegistry();
  const marketProvider = deps.marketProvider || registry.getPrimaryMarketDataProvider();
  const ctx = { userId: context.userId, propertyId: property.id, deps };

  const identityResult = await resolvePropertyIdentity(property, context);
  const identity = identityResult.identity;
  const enrichments = {};
  const errors = [];
  let totalCreditsUsed = 0;
  const acquisition = acquisitionFromContext(context, property);

  const postcode = normalisePostcode(property.zip_code || property.postcode || identity.postcode);

  if (marketProvider?.isAvailable() && postcode) {
    const soldFilters = buildSoldPriceFilters(property);
    for (const [type, method, ttlKey] of [
      ...(acquisition.fetchSoldPrices ? [['sold_prices', 'getSoldPrices', 'soldPrices']] : []),
      ...(acquisition.fetchSoldPricesPerSqf
        ? [['sold_prices_per_sqf', 'getSoldPricesPerSqf', 'soldPricesPerSqf']]
        : []),
    ]) {
      try {
        const result = await fetchAndPersistEnrichment({
          property,
          enrichmentType: type,
          source: 'PropertyData',
          ttlMs: propertyIntelligenceConfig.cacheTtl[ttlKey],
          context: ctx,
          fetchFn: () => marketProvider[method](postcode, ctx, soldFilters),
        });
        enrichments[type] = result;
        if (result.creditsUsed) totalCreditsUsed += result.creditsUsed;
        if (!result.success) errors.push({ type, message: result.message });
      } catch (err) {
        errors.push({ type, message: err.message });
      }
    }

    if (acquisition.fetchRents) {
      const rentFilters = buildSoldPriceFilters(property);
      try {
        const rentsResult = await fetchAndPersistEnrichment({
          property,
          enrichmentType: 'rents',
          source: 'PropertyData',
          ttlMs: propertyIntelligenceConfig.cacheTtl.rents,
          context: ctx,
          fetchFn: () => marketProvider.getRents(postcode, ctx, rentFilters),
        });
        enrichments.rents = rentsResult;
        if (rentsResult.creditsUsed) totalCreditsUsed += rentsResult.creditsUsed;
        if (!rentsResult.success) errors.push({ type: 'rents', message: rentsResult.message });
      } catch (err) {
        errors.push({ type: 'rents', message: err.message });
      }
    }

    if (acquisition.fetchDemand && typeof marketProvider.getDemand === 'function') {
      try {
        const demandResult = await fetchAndPersistEnrichment({
          property,
          enrichmentType: 'demand',
          source: 'PropertyData',
          ttlMs: propertyIntelligenceConfig.cacheTtl.marketDemand,
          context: ctx,
          fetchFn: () => marketProvider.getDemand(postcode, ctx),
        });
        enrichments.demand = demandResult;
        if (demandResult.creditsUsed) totalCreditsUsed += demandResult.creditsUsed;
        if (!demandResult.success) errors.push({ type: 'demand', message: demandResult.message });
      } catch (err) {
        errors.push({ type: 'demand', message: err.message });
      }
    }

    if (acquisition.fetchDemandRent && typeof marketProvider.getDemandRent === 'function') {
      try {
        const demandRentResult = await fetchAndPersistEnrichment({
          property,
          enrichmentType: 'demand_rent',
          source: 'PropertyData',
          ttlMs: propertyIntelligenceConfig.cacheTtl.marketDemand,
          context: ctx,
          fetchFn: () => marketProvider.getDemandRent(postcode, ctx),
        });
        enrichments.demand_rent = demandRentResult;
        if (demandRentResult.creditsUsed) totalCreditsUsed += demandRentResult.creditsUsed;
        if (!demandRentResult.success) errors.push({ type: 'demand_rent', message: demandRentResult.message });
      } catch (err) {
        errors.push({ type: 'demand_rent', message: err.message });
      }
    }
  }

  if (identity?.uprn) {
    try {
      const subject =
        (await findCanonicalSubject(
          { ...property, uprn: identity.uprn },
          { ...context, uprn: identity.uprn },
          deps
        )) || null;
      const reused = reusedUprnProfileFromSubject(subject);
      if (reused) {
        enrichments.uprn_profile = reused;
      } else if (marketProvider?.isAvailable()) {
        const uprnResult = await fetchAndPersistEnrichment({
          property,
          enrichmentType: 'uprn_profile',
          source: 'PropertyData',
          ttlMs: propertyIntelligenceConfig.cacheTtl.uprnProfile,
          context: ctx,
          fetchFn: () => marketProvider.getUprnProfile(identity.uprn, ctx),
        });
        enrichments.uprn_profile = uprnResult;
        if (uprnResult.creditsUsed) totalCreditsUsed += uprnResult.creditsUsed;
      }
    } catch (err) {
      errors.push({ type: 'uprn_profile', message: err.message });
    }
  }

  if (acquisition.fetchSaleValuation && marketProvider?.isAvailable() && property.category === 'sale') {
    const avmProperty = applyPropertyDataEvidence(property, { enrichments, identity }).property;
    try {
      const valResult = await fetchAndPersistEnrichment({
        property,
        enrichmentType: 'valuation_sale',
        source: 'PropertyData',
        ttlMs: propertyIntelligenceConfig.cacheTtl.valuation,
        context: ctx,
        fetchFn: () => marketProvider.getSaleValuation(avmProperty, ctx),
      });
      enrichments.valuation_sale = valResult;
      if (valResult.creditsUsed) totalCreditsUsed += valResult.creditsUsed;
      if (!valResult.success && valResult.message) {
        errors.push({ type: 'valuation_sale', message: valResult.message });
      }
    } catch (err) {
      errors.push({ type: 'valuation_sale', message: err.message });
    }
  }

  const sources = mergeSources(
    'ApplicationDatabase',
    identity?.provider === 'propertydata' ? 'PropertyData' : identity?.provider,
    enrichments.sold_prices?.success ? 'PropertyData' : null,
    enrichments.sold_prices?.provenance?.source === 'PropertyData' ? 'HM_Land_Registry' : null
  );

  return {
    available: true,
    enabled: true,
    identity,
    identityResolution: identityResult,
    enrichments,
    sources,
    errors,
    totalCreditsUsed,
    partial: errors.length > 0,
    providers:
      typeof registry.getAvailableProviders === 'function' ? registry.getAvailableProviders() : ['PropertyData'],
  };
}

module.exports = {
  resolvePropertyIdentity,
  enrichPropertyForIntelligence,
  findCanonicalSubject,
  reusedUprnProfileFromSubject,
  listEnrichmentsForProperty,
};
