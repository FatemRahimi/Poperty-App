/**
 * Overlay PropertyData evidence onto a listing/subject for analysis.
 * Listing/user-supplied values win. Missing PropertyData fields stay null/notAssessed.
 * Does not write to the listings table.
 */

const { createProvenance } = require('../../../utils/provenance');
const {
  parseUprnProfile,
  parseSoldTransactionsFromPayload,
} = require('./propertyDataParsers');

function isPresent(value) {
  if (value === undefined || value === null || value === '') return false;
  if (typeof value === 'number' && !Number.isFinite(value)) return false;
  return true;
}

function pdProvenance({
  observedAt = null,
  notes = null,
  method = 'uprn_profile',
  retrievedAt = null,
  matchBasis = 'uprn',
} = {}) {
  const provenance = createProvenance({
    source: 'PropertyData',
    method,
    observedAt,
    retrievedAt: retrievedAt || undefined,
    providerEndpoint: method === 'sold_prices' ? '/sold-prices' : '/uprn',
    notes,
  });
  provenance.matchBasis = matchBasis;
  provenance.propertyScope = matchBasis === 'uprn' ? 'property' : 'unavailable';
  provenance.dataset = method === 'sold_prices' ? 'sold-prices' : 'uprn';
  return provenance;
}

function observed(value, provenance) {
  if (!isPresent(value)) {
    return {
      available: false,
      value: null,
      state: 'notAssessed',
      provenance,
    };
  }
  return {
    available: true,
    value,
    state: 'observed',
    provenance,
  };
}

function enrichmentPayload(enrichment) {
  if (!enrichment || enrichment.success === false) return null;
  return enrichment.data || enrichment.profile || enrichment.payload || null;
}

function listingSoldDate(property = {}) {
  return property.sold_date || property.last_sold_date || property.sold_at || property.transfer_date || null;
}

function hasUprnMatch(property, identity, profile) {
  return Boolean(
    isPresent(property?.uprn) || isPresent(identity?.uprn) || isPresent(profile?.uprn)
  );
}

function applyPropertyDataEvidence(property = {}, externalEnrichment = null) {
  const enrichments = externalEnrichment?.enrichments || {};
  const identity = externalEnrichment?.identity || {};
  const uprnPayload = enrichmentPayload(enrichments.uprn_profile);
  const profile = parseUprnProfile(uprnPayload);
  const propertyLevelMatch = hasUprnMatch(property, identity, profile);
  const soldTransactions = [
    ...parseSoldTransactionsFromPayload(enrichmentPayload(enrichments.sold_prices)),
    ...(profile.transactions || []),
  ];

  const overlays = {};
  const filledFrom = {};
  const conflicts = [];
  const retrievedAt = enrichments.uprn_profile?.provenance?.retrievedAt || null;

  function soldObservedAt(field, externalValue) {
    if (field === 'last_sold_date' || field === 'sold_date') return externalValue || null;
    if (field === 'last_sold_price') return profile.lastSoldDate || null;
    return null;
  }

  function fill(field, listingValue, pdValue, notes, { propertyLevel = true } = {}) {
    const externalValue = propertyLevel && !propertyLevelMatch ? null : pdValue;
    const matchBasis = propertyLevelMatch ? 'uprn' : 'none';
    const provenance = pdProvenance({
      observedAt: soldObservedAt(field, externalValue),
      notes,
      retrievedAt,
      matchBasis: propertyLevelMatch ? 'uprn' : 'none',
    });
    if (isPresent(listingValue) && isPresent(externalValue) && String(listingValue) !== String(externalValue)) {
      conflicts.push({
        field,
        listing: listingValue,
        external: externalValue,
        selected: listingValue,
        sourceSelected: 'InternalListing',
        matchBasis: 'listing',
        notes: `${field} listing evidence retained; PropertyData value preserved as conflict only. Values were not averaged.`,
      });
    }
    if (isPresent(listingValue)) {
      overlays[field] = {
        available: true,
        value: listingValue,
        state: 'observed',
        source: 'InternalListing',
        matchBasis: 'listing',
        propertyScope: 'property',
        provenance: createProvenance({
          source: 'InternalListing',
          method: 'listing_field',
          notes: `${field} retained from listing; PropertyData did not overwrite it.`,
        }),
      };
      return listingValue;
    }
    if (isPresent(externalValue)) {
      overlays[field] = {
        ...observed(externalValue, provenance),
        source: 'PropertyData',
        matchBasis,
        propertyScope: 'property',
      };
      filledFrom[field] = 'PropertyData';
      return externalValue;
    }
    overlays[field] = {
      available: false,
      value: null,
      state: propertyLevel && !propertyLevelMatch ? 'unavailable' : 'notAssessed',
      source: null,
      matchBasis,
      propertyScope: propertyLevelMatch ? 'property' : 'unavailable',
      provenance,
    };
    return listingValue === undefined ? null : listingValue;
  }

  const merged = { ...property };

  const uprn = isPresent(property.uprn)
    ? property.uprn
    : identity.uprn || profile.uprn || null;
  if (isPresent(uprn) && !isPresent(property.uprn)) {
    merged.uprn = String(uprn);
    filledFrom.uprn = 'PropertyData';
  }

  merged.property_type = fill(
    'property_type',
    property.property_type,
    profile.propertyType,
    'UPRN/profile property_type. Unknown types are not mapped to flat.'
  );
  merged.bedrooms = fill('bedrooms', property.bedrooms, profile.bedrooms, 'UPRN/profile bedrooms where supplied.');
  merged.bathrooms = fill(
    'bathrooms',
    property.bathrooms,
    profile.bathrooms,
    'UPRN/profile bathrooms where supplied.'
  );
  merged.square_feet = fill(
    'square_feet',
    property.square_feet,
    profile.internalArea,
    'UPRN/profile internal area. Not inferred from style or postcode.'
  );
  merged.epc_rating = fill(
    'epc_rating',
    property.epc_rating,
    profile.epcRating,
    'UPRN energyScore / current_energy_rating from MHCLG EPC via PropertyData. Listing EPC is retained when present. Not inferred from age or property type.'
  );
  const listingEpc = isPresent(property.epc_rating) ? String(property.epc_rating).trim().toUpperCase() : null;
  const pdEpc = propertyLevelMatch && isPresent(profile.epcRating)
    ? String(profile.epcRating).trim().toUpperCase()
    : null;
  const epcExtrasAligned = Boolean(pdEpc) && (!listingEpc || listingEpc === pdEpc);
  fill(
    'epc_score',
    null,
    epcExtrasAligned ? profile.epcScore : null,
    'Numeric EPC score from PropertyData energyScoreNumerical. Attached only when it belongs to the selected rating. Not written as a listing rating and not inferred.'
  );
  fill(
    'epc_certificate_number',
    null,
    epcExtrasAligned ? profile.epcCertificateNumber : null,
    'EPC certificate reference (certNum) when supplied on the UPRN profile and aligned with the selected rating.'
  );
  merged.tenure = fill(
    'tenure',
    property.tenure,
    profile.legalTenure,
    'Legal tenure is listing tenure, or Leasehold when HM Land Registry registered leases exist on the UPRN. EPC occupancy tenure is not legal tenure. Missing leases are not inferred as freehold. Property type is not used.'
  );
  fill(
    'occupancy_tenure',
    null,
    propertyLevelMatch ? profile.occupancyTenure : null,
    'EPC occupancy (owner-occupied / rented) from PropertyData tenure. Not copied onto listing.tenure.'
  );
  merged.council_tax_band = fill(
    'council_tax_band',
    property.council_tax_band,
    profile.councilTaxBand,
    'Property-level council tax band from PropertyData taxBand on /uprn. Area /council-tax averages are not used. Neighbour bands are not used.'
  );
  fill(
    'council_tax_rate',
    null,
    propertyLevelMatch ? profile.councilTaxRate : null,
    'PropertyData taxRate when supplied. Not derived from the band and not used as a financialEngine cost input.'
  );
  fill(
    'lease_years_remaining',
    null,
    propertyLevelMatch ? profile.leaseYearsRemaining : null,
    'Years remaining from registered lease dates or provider years_remaining. Not inferred from the word leasehold or from property type.'
  );
  merged.year_built = fill(
    'year_built',
    property.year_built,
    profile.yearBuilt,
    'UPRN/profile year_built only. Construction band is not inferred.'
  );

  const listingLastSoldPrice = isPresent(property.achieved_price)
    ? Number(property.achieved_price)
    : isPresent(property.last_sold_price)
      ? Number(property.last_sold_price)
      : null;
  merged.last_sold_price = fill(
    'last_sold_price',
    listingLastSoldPrice,
    profile.lastSoldPrice,
    'HM Land Registry last sold via PropertyData UPRN. Asking price is not used.'
  );

  const listingDate = listingSoldDate(property);
  merged.last_sold_date = fill(
    'last_sold_date',
    listingDate,
    profile.lastSoldDate,
    'Transaction date from last_sold_date only. created_at/updated_at are not used.'
  );
  if (isPresent(merged.last_sold_date) && !isPresent(merged.sold_date)) {
    merged.sold_date = merged.last_sold_date;
  }

  if (propertyLevelMatch && !isPresent(property.latitude) && isPresent(profile.latitude)) {
    merged.latitude = profile.latitude;
    filledFrom.latitude = 'PropertyData';
  }
  if (propertyLevelMatch && !isPresent(property.longitude) && isPresent(profile.longitude)) {
    merged.longitude = profile.longitude;
    filledFrom.longitude = 'PropertyData';
  }

  fill(
    'construction_age_band',
    null,
    propertyLevelMatch ? profile.constructionAgeBand : null,
    'EPC construction age band from the UPRN profile. Never written to year_built and never inferred from style.'
  );

  const evidence = {
    source: 'PropertyData',
    identity: {
      listingId: property.id ?? null,
      subjectId: property.subjectId ?? null,
      uprn: merged.uprn || null,
      listingIdRemainsCanonicalForListings: true,
      uprnIsCandidateCanonicalPropertyId: Boolean(merged.uprn),
      propertyLevelMatch,
      matchBasis: propertyLevelMatch ? 'uprn' : 'none',
    },
    fields: overlays,
    lastSold: {
      price: overlays.last_sold_price,
      date: overlays.last_sold_date,
    },
    transactions: soldTransactions,
    registeredLeases: propertyLevelMatch ? profile.registeredLeases : [],
    unmatchedPropertyLevelEvidence: propertyLevelMatch
      ? null
      : {
          preserved: true,
          writtenToCanonicalRecord: false,
          reason: 'insufficient_identity_match',
          matchBasis: 'none',
          parsed: {
            epcRating: profile.epcRating,
            epcScore: profile.epcScore,
            epcCertificateNumber: profile.epcCertificateNumber,
            legalTenure: profile.legalTenure,
            occupancyTenure: profile.occupancyTenure,
            councilTaxBand: profile.councilTaxBand,
            councilTaxRate: profile.councilTaxRate,
            leaseYearsRemaining: profile.leaseYearsRemaining,
            registeredLeases: profile.registeredLeases,
          },
        },
    conflicts,
    filledFrom,
    retrievedAt,
  };
  evidence.openDataAttributes = buildOpenDataAttributes(merged, evidence);

  return { property: merged, evidence };
}

function attributeFromOverlay(overlay, extra = {}) {
  if (!overlay) {
    return {
      available: false,
      value: null,
      state: 'notAssessed',
      ...extra,
    };
  }
  return {
    available: Boolean(overlay.available),
    value: overlay.value ?? null,
    state: overlay.state || (overlay.available ? 'observed' : 'notAssessed'),
    source: overlay.source || null,
    matchBasis: overlay.matchBasis || null,
    propertyScope: overlay.propertyScope || null,
    provenance: overlay.provenance || null,
    ...extra,
  };
}

function buildOpenDataAttributes(property, evidence) {
  const fields = evidence?.fields || {};
  return {
    epc: {
      rating: attributeFromOverlay(fields.epc_rating, { field: 'epc_rating' }),
      score: attributeFromOverlay(fields.epc_score, { field: 'epc_score' }),
      certificateNumber: attributeFromOverlay(fields.epc_certificate_number, {
        field: 'epc_certificate_number',
      }),
      listingDocumentPresent: Boolean(property?.epc_document_url || property?.epc_document_name),
      estimated: false,
    },
    tenure: {
      legal: attributeFromOverlay(fields.tenure, { field: 'tenure' }),
      occupancy: attributeFromOverlay(fields.occupancy_tenure, { field: 'occupancy_tenure' }),
      leaseYearsRemaining: attributeFromOverlay(fields.lease_years_remaining, {
        field: 'lease_years_remaining',
      }),
      registeredLeases: evidence?.registeredLeases || [],
      inferredFromPropertyType: false,
    },
    councilTax: {
      band: attributeFromOverlay(fields.council_tax_band, { field: 'council_tax_band' }),
      annualRate: attributeFromOverlay(fields.council_tax_rate, {
        field: 'council_tax_rate',
        usedAsFinancialInput: false,
      }),
      status: {
        available: Boolean(property?.council_tax_status),
        value: property?.council_tax_status || null,
        state: property?.council_tax_status ? 'observed' : 'notAssessed',
        source: property?.council_tax_status ? 'InternalListing' : null,
      },
    },
    groundRent: {
      available: false,
      value: null,
      state: 'notAssessed',
      note: 'Registered leases do not supply ground rent. Missing ground rent remains null, not 0.',
    },
    serviceCharge: {
      available: false,
      value: null,
      state: 'notAssessed',
      note: 'UPRN profile does not supply service charge. Missing service charge remains null, not 0.',
    },
    conflicts: evidence?.conflicts || [],
    propertyLevelMatch: Boolean(evidence?.identity?.propertyLevelMatch),
    matchBasis: evidence?.identity?.propertyLevelMatch ? 'uprn' : 'none',
    retrievedAt: evidence?.retrievedAt || null,
    unmatchedPropertyLevelEvidence: evidence?.unmatchedPropertyLevelEvidence || null,
  };
}

module.exports = {
  applyPropertyDataEvidence,
  buildOpenDataAttributes,
  isPresent,
  hasUprnMatch,
};
