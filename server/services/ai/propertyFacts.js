/**
 * Canonical property-fact layer.
 *
 * Projects verified listing + PropertyData /uprn evidence into a structured
 * fact/implication contract. Does not score, infer, or invent attributes.
 * Does not change valuation, rent, finance, demand, or Personal Decision weights.
 */

const { listingObservedCharges, listingObservedAmenities, frequencyForListingField } = require('./listingObservedFields');
const { sanitizeFloodFact, unattachedFloodFact } = require('./floodEvidence');
const { sanitizePlanningFact, unattachedPlanningFact } = require('./planningEvidence');
const { sanitizeSchoolFact, unattachedSchoolFact } = require('./schoolEvidence');
const { sanitizeListedBuildingFact, unattachedListedBuildingFact } = require('./listedBuildingEvidence');
const { sanitizeConservationAreaFact, unattachedConservationAreaFact } = require('./conservationAreaEvidence');
const { sanitizeArticle4Fact, unattachedArticle4Fact } = require('./article4Evidence');

const TRUST = Object.freeze({
  observed: 'observed',
  calculated: 'calculated',
  estimated: 'estimated',
  userSupplied: 'userSupplied',
  areaContext: 'areaContext',
  notAssessed: 'notAssessed',
  conflictingEvidence: 'conflictingEvidence',
});

const LAYER = Object.freeze({
  fact: 'fact',
  implication: 'implication',
  decision: 'decision',
});

const SOURCE_PRECEDENCE = Object.freeze({
  askingPrice: Object.freeze(['InternalListing']),
  askingRent: Object.freeze(['InternalListing']),
  listingIdentity: Object.freeze(['InternalListing']),
  uprn: Object.freeze(['property_identities', 'PropertyData_uprn']),
  epcRating: Object.freeze(['InternalListing', 'PropertyData_uprn']),
  epcScore: Object.freeze(['PropertyData_uprn_aligned_to_selected_rating']),
  epcCertificateNumber: Object.freeze(['PropertyData_uprn_aligned_to_selected_rating']),
  floorArea: Object.freeze(['InternalListing', 'PropertyData_uprn']),
  yearBuilt: Object.freeze(['InternalListing', 'PropertyData_uprn']),
  constructionAgeBand: Object.freeze(['PropertyData_uprn']),
  propertyType: Object.freeze(['InternalListing', 'PropertyData_uprn']),
  bedrooms: Object.freeze(['InternalListing', 'PropertyData_uprn']),
  bathrooms: Object.freeze(['InternalListing', 'PropertyData_uprn']),
  tenure: Object.freeze(['InternalListing', 'PropertyData_registeredLeases']),
  leaseRemaining: Object.freeze(['PropertyData_registeredLeases_calculated']),
  leaseStart: Object.freeze(['PropertyData_registeredLeases']),
  leaseEnd: Object.freeze(['PropertyData_registeredLeases']),
  groundRent: Object.freeze(['InternalListing']),
  serviceCharge: Object.freeze(['InternalListing']),
  councilTaxBand: Object.freeze(['InternalListing', 'PropertyData_uprn']),
  councilTaxAmount: Object.freeze(['PropertyData_uprn']),
  lastSold: Object.freeze(['InternalListing_achieved_or_last_sold', 'PropertyData_uprn']),
  achievedPrice: Object.freeze(['InternalListing_outcome']),
  achievedRent: Object.freeze(['InternalListing_outcome']),
  outdoorSpace: Object.freeze(['InternalListing_explicit_true']),
  garage: Object.freeze(['InternalListing_explicit_true']),
  parkingSpaces: Object.freeze(['InternalListing_positive_count']),
  heating: Object.freeze(['InternalListing']),
  broadband: Object.freeze(['InternalListing']),
  flood: Object.freeze(['EnvironmentAgency_FloodMapForPlanning']),
  planning: Object.freeze(['MHCLG_PlanningData']),
  schools: Object.freeze(['MHCLG_PlanningData_EducationalEstablishment']),
  listedBuilding: Object.freeze(['MHCLG_PlanningData_ListedBuilding']),
  conservationArea: Object.freeze(['MHCLG_PlanningData_ConservationArea']),
  article4: Object.freeze(['MHCLG_PlanningData_Article4DirectionArea']),
});

const DEPENDENCY_MODEL = Object.freeze({
  serviceCharge: {
    mayAffect: Object.freeze(['operatingCosts', 'NOI', 'netYield', 'cashFlow', 'landlordDecision']),
    productionScoringActivated: false,
    financialUseActivated: true,
  },
  groundRent: {
    mayAffect: Object.freeze(['operatingCosts', 'NOI', 'netYield', 'cashFlow']),
    productionScoringActivated: false,
    financialUseActivated: true,
  },
  leaseRemaining: {
    mayAffect: Object.freeze(['leaseRisk', 'financingContext', 'resaleContext', 'decisionContext']),
    productionScoringActivated: false,
  },
  epc: {
    mayAffect: Object.freeze(['energyEfficiencyContext', 'userSpecificRelevance']),
    productionScoringActivated: false,
  },
  councilTax: {
    mayAffect: Object.freeze(['occupancyCost', 'affordability', 'personalDecision']),
    productionScoringActivated: false,
  },
  floorArea: {
    mayAffect: Object.freeze(['pricePerArea', 'comparableMatching']),
    productionScoringActivated: false,
  },
  outdoorSpace: {
    mayAffect: Object.freeze(['buyerLifestyleContext', 'reportContext']),
    productionScoringActivated: false,
    note: 'buyer_general lifestyle still reads listing has_garden directly; this fact is report/context only.',
  },
  parking: {
    mayAffect: Object.freeze(['buyerLifestyleContext', 'reportContext']),
    productionScoringActivated: false,
  },
  heating: {
    mayAffect: Object.freeze(['runningCostContext', 'reportContext']),
    productionScoringActivated: false,
    note: 'Heating type is not converted into a monetary running cost.',
  },
  flood: {
    mayAffect: Object.freeze(['riskContext']),
    productionScoringActivated: false,
    financialUseActivated: false,
    note: 'Flood Map for Planning (rivers and sea) is report/context evidence only. Flood is not a valuation adjustment and is not a Personal Decision input.',
  },
  planning: {
    mayAffect: Object.freeze(['developmentContext']),
    productionScoringActivated: false,
    financialUseActivated: false,
    note: 'MHCLG Planning Data applications are report/context evidence only. Planning is not a valuation adjustment, development-opportunity score, or Personal Decision input.',
  },
  listedBuilding: {
    mayAffect: Object.freeze(['heritageContext']),
    productionScoringActivated: false,
    financialUseActivated: false,
    note: 'Historic England listed-building status is report/context evidence only. Native grade is not a heritage score, valuation adjustment, or Personal Decision input. Unknown remains notAssessed, not “not listed”.',
  },
  conservationArea: {
    mayAffect: Object.freeze(['heritageContext']),
    productionScoringActivated: false,
    financialUseActivated: false,
    note: 'Conservation-area membership is report/context evidence only. Point-in-polygon membership is not a listed-building designation, permission outcome, valuation adjustment, or Personal Decision input. Unknown remains notAssessed, not “not in a conservation area”.',
  },
  article4: {
    mayAffect: Object.freeze(['developmentContext']),
    productionScoringActivated: false,
    financialUseActivated: false,
    note: 'Article 4 direction-area membership is report/context evidence only. Point-in-polygon membership is geographic only and is not a restriction schedule, permission outcome, valuation adjustment, or Personal Decision input. Restricted permitted-development rights stay notAssessed. Unknown remains notAssessed, not “not in an Article 4 area”.',
  },
  note:
    'Causal usage documentation only. New facts in this phase are report/context evidence unless an existing scorer already consumed the listing field.',
});

function emptyFact(field, extras = {}) {
  return {
    field,
    value: null,
    available: false,
    state: 'notAssessed',
    trust: TRUST.notAssessed,
    layer: LAYER.fact,
    source: null,
    provider: null,
    scope: extras.scope || 'property',
    method: extras.method || null,
    observedAt: null,
    retrievedAt: null,
    matchBasis: extras.matchBasis || null,
    role: 'property_fact',
    scoringActivated: false,
    ...extras,
    field,
    value: extras.value === undefined ? null : extras.value,
    available: extras.available === true,
  };
}

const OVERLAY_CONFLICT_FIELDS = Object.freeze({
  epcRating: 'epc_rating',
  epcScore: 'epc_score',
  epcCertificateNumber: 'epc_certificate_number',
  floorArea: 'square_feet',
  yearBuilt: 'year_built',
  constructionAgeBand: 'construction_age_band',
  propertyType: 'property_type',
  bathrooms: 'bathrooms',
  tenure: 'tenure',
  occupancyTenure: 'occupancy_tenure',
  leaseYearsRemaining: 'lease_years_remaining',
  councilTaxBand: 'council_tax_band',
  councilTaxAmount: 'council_tax_rate',
  lastSoldPrice: 'last_sold_price',
  lastSoldDate: 'last_sold_date',
});

function present(value) {
  if (value === undefined || value === null || value === '') return false;
  if (typeof value === 'number' && !Number.isFinite(value)) return false;
  return true;
}

function findConflict(conflicts, field, overlayField) {
  const keys = new Set([field, overlayField, OVERLAY_CONFLICT_FIELDS[field]].filter(Boolean));
  return (conflicts || []).find((item) => keys.has(item.field)) || null;
}

function fromOverlay(field, overlay, conflicts = [], extras = {}) {
  const { overlayField, ...publicExtras } = extras;
  const conflict = findConflict(conflicts, field, overlayField);
  if (!overlay || !overlay.available || !present(overlay.value)) {
    return emptyFact(field, {
      state: overlay?.state || 'notAssessed',
      matchBasis: overlay?.matchBasis || publicExtras.matchBasis || null,
      retrievedAt: overlay?.provenance?.retrievedAt || publicExtras.retrievedAt || null,
      provenance: overlay?.provenance || null,
      ...publicExtras,
    });
  }
  const listingSource = overlay.source === 'InternalListing';
  return {
    field,
    value: overlay.value,
    available: true,
    state: overlay.state || 'observed',
    trust: conflict ? TRUST.conflictingEvidence : listingSource ? TRUST.userSupplied : TRUST.observed,
    layer: LAYER.fact,
    source: overlay.source,
    provider: listingSource ? null : 'PropertyData',
    scope: overlay.propertyScope || 'property',
    method: overlay.provenance?.method || (listingSource ? 'listing_field' : 'uprn_profile'),
    observedAt: overlay.provenance?.observedAt || null,
    retrievedAt: overlay.provenance?.retrievedAt || publicExtras.retrievedAt || null,
    matchBasis: overlay.matchBasis || null,
    provenance: overlay.provenance || null,
    conflict: conflict
      ? {
          listing: conflict.listing,
          external: conflict.external,
          selected: conflict.selected,
          sourceSelected: conflict.sourceSelected,
          averaged: false,
        }
      : null,
    role: 'property_fact',
    scoringActivated: false,
    ...publicExtras,
    field,
    value: overlay.value,
    available: true,
  };
}

function fromListingNumber(field, value, extras = {}) {
  if (!present(value) || !Number.isFinite(Number(value))) {
    return emptyFact(field, extras);
  }
  return {
    ...emptyFact(field, extras),
    available: true,
    value: Number(value),
    state: 'observed',
    trust: extras.trust || TRUST.userSupplied,
    source: extras.source || 'InternalListing',
    method: extras.method || 'listing_field',
    scope: 'property',
  };
}

function fromListingText(field, value, extras = {}) {
  if (!present(value)) return emptyFact(field, extras);
  return {
    ...emptyFact(field, extras),
    available: true,
    value: String(value).trim(),
    state: 'observed',
    trust: extras.trust || TRUST.userSupplied,
    source: extras.source || 'InternalListing',
    method: extras.method || 'listing_field',
    scope: 'property',
  };
}

function listingFallback(fact, field, listingValue, extras = {}) {
  if (fact.available || !present(listingValue)) return fact;
  if (typeof listingValue === 'number' || Number.isFinite(Number(listingValue))) {
    return fromListingNumber(field, listingValue, extras);
  }
  return fromListingText(field, listingValue, extras);
}

function fromObservedCharge(field, observed, extras = {}) {
  const listingField = observed?.field || extras.listingField || null;
  const originalFrequency = frequencyForListingField(listingField);
  if (!observed || !observed.available) {
    return emptyFact(field, {
      state: observed?.state || 'notAssessed',
      method: 'listing_field',
      note: extras.missingNote,
      provenance: observed?.provenance || null,
      listingField,
      originalValue: null,
      originalFrequency,
      financiallyUsable: false,
    });
  }
  return {
    ...emptyFact(field),
    available: true,
    value: observed.value,
    state: observed.state || 'observed',
    trust: TRUST.userSupplied,
    source: 'InternalListing',
    method: 'listing_field',
    scope: 'property',
    observedAt: observed.provenance?.observedAt || null,
    provenance: observed.provenance || null,
    note: extras.note || null,
    scoringActivated: false,
    listingField,
    originalValue: observed.value,
    originalFrequency,
    financiallyUsable: Boolean(originalFrequency),
  };
}

function fromObservedAmenity(field, observed, extras = {}) {
  if (!observed || !observed.available) {
    return emptyFact(field, {
      state: observed?.state || 'notAssessed',
      method: 'listing_field',
      note: extras.missingNote || observed?.provenance?.notes || extras.note,
      provenance: observed?.provenance || null,
      listingField: observed?.field || extras.listingField || null,
      decisionClass: extras.decisionClass || 'report_context_evidence',
      scoringActivated: false,
    });
  }
  return {
    ...emptyFact(field),
    available: true,
    value: observed.value,
    state: observed.state || 'observed',
    trust: TRUST.userSupplied,
    source: 'InternalListing',
    method: 'listing_field',
    scope: 'property',
    observedAt: observed.provenance?.observedAt || null,
    provenance: observed.provenance || null,
    listingField: observed.field || extras.listingField || null,
    note: extras.note || null,
    decisionClass: extras.decisionClass || 'report_context_evidence',
    scoringActivated: false,
  };
}

function selectedRegisteredLease(leases = []) {
  const list = Array.isArray(leases) ? leases.filter(Boolean) : [];
  const withRemaining = list.filter((lease) => Number.isFinite(Number(lease.yearsRemaining)));
  if (withRemaining.length) {
    return withRemaining.reduce((best, row) =>
      Number(row.yearsRemaining) < Number(best.yearsRemaining) ? row : best
    );
  }
  return list[0] || null;
}

function fromRegisteredLeaseDate(field, value, lease, extras = {}) {
  if (!present(value)) {
    return emptyFact(field, {
      note: extras.missingNote,
      method: extras.method || null,
      decisionClass: 'report_context_evidence',
    });
  }
  return {
    ...emptyFact(field),
    available: true,
    value,
    state: 'observed',
    trust: TRUST.observed,
    source: 'PropertyData_registeredLeases',
    provider: 'PropertyData',
    method: extras.method || 'registered_lease_date',
    scope: 'property',
    layer: LAYER.fact,
    leaseId: lease?.leaseId || null,
    decisionClass: 'report_context_evidence',
    scoringActivated: false,
  };
}

function unavailableSourceFact(field, note) {
  return emptyFact(field, {
    note,
    method: null,
    scope: 'property',
    decisionClass: 'insufficient_semantic_basis',
    scoringActivated: false,
    providerRequired: true,
  });
}

function assemblePropertyFacts({
  property = {},
  evidence = null,
  identity = {},
  listingCharges = null,
  floodEvidence = null,
  planningEvidence = null,
  schoolEvidence = null,
  listedBuildingEvidence = null,
  conservationAreaEvidence = null,
  article4Evidence = null,
} = {}) {
  const fields = evidence?.fields || {};
  const conflicts = evidence?.conflicts || [];
  const retrievedAt = evidence?.retrievedAt || null;
  const charges = listingCharges || listingObservedCharges(property);
  const amenities = listingObservedAmenities(property);
  const matchBasis = evidence?.identity?.propertyLevelMatch ? 'uprn' : evidence?.identity?.matchBasis || null;
  const selectedLease = selectedRegisteredLease(evidence?.registeredLeases);

  const epcRating = listingFallback(
    fromOverlay('epcRating', fields.epc_rating, conflicts, { inferredFromAgeOrType: false }),
    'epcRating',
    property.epc_rating,
    { inferredFromAgeOrType: false }
  );
  const epcScore = fromOverlay('epcScore', fields.epc_score, conflicts, {
    inferred: false,
    alignedToSelectedRating: Boolean(fields.epc_score?.available),
  });
  const epcCertificateNumber = fromOverlay(
    'epcCertificateNumber',
    fields.epc_certificate_number,
    conflicts
  );
  const epcCertificateDate = emptyFact('epcCertificateDate', {
    note: 'EPC lodgement/expiry date is not present in verified listing or /uprn payloads.',
  });

  const tenure = listingFallback(
    fromOverlay('tenure', fields.tenure, conflicts, { inferredFromPropertyType: false }),
    'tenure',
    property.tenure,
    { inferredFromPropertyType: false }
  );
  const occupancyTenure = fromOverlay('occupancyTenure', fields.occupancy_tenure, conflicts, {
    notLegalTenure: true,
  });
  const leaseYearsOverlay = fromOverlay('leaseYearsRemaining', fields.lease_years_remaining, conflicts);
  const leaseRemaining = {
    ...leaseYearsOverlay,
    field: 'leaseRemaining',
    layer: LAYER.implication,
    trust: leaseYearsOverlay.available ? TRUST.calculated : TRUST.notAssessed,
    method: leaseYearsOverlay.available
      ? 'min_registered_lease_years_remaining'
      : null,
    inputs: leaseYearsOverlay.available
      ? {
          registeredLeases: evidence?.registeredLeases || [],
          selectedLeaseId: selectedLease?.leaseId || null,
          termStartDate: selectedLease?.termStartDate || null,
          termEndDate: selectedLease?.termEndDate || null,
          formula:
            'min(lease.yearsRemaining) where yearsRemaining is provider years_remaining, else years from term_end_date, else start+term_years',
        }
      : null,
    decisionRelevanceImplemented: false,
    inferredFromPropertyType: false,
    inferredFromLeaseholdWord: false,
  };

  const councilTaxBand = listingFallback(
    fromOverlay('councilTaxBand', fields.council_tax_band, conflicts),
    'councilTaxBand',
    property.council_tax_band
  );
  const councilTaxAmount = fromOverlay('councilTaxAmount', fields.council_tax_rate, conflicts, {
    derivedFromBand: false,
    usedAsFinancialInput: false,
  });
  const councilTaxAuthority = emptyFact('councilTaxBillingAuthority', {
    note: 'Billing authority is not present in verified evidence.',
  });
  const councilTaxYear = emptyFact('councilTaxYear', {
    note: 'Tax year is not present in verified evidence. Current band/rate is not historical tax.',
  });

  const facts = {
    epcRating,
    epcScore,
    epcCertificateNumber,
    epcCertificateDate,
    floorArea: listingFallback(
      fromOverlay('floorArea', fields.square_feet, conflicts, {
        unit: present(property.floor_area_unit) ? String(property.floor_area_unit) : null,
        inferred: false,
      }),
      'floorArea',
      property.square_feet,
      { inferred: false, unit: present(property.floor_area_unit) ? String(property.floor_area_unit) : null }
    ),
    yearBuilt: listingFallback(
      fromOverlay('yearBuilt', fields.year_built, conflicts, { inferred: false }),
      'yearBuilt',
      property.year_built,
      { inferred: false }
    ),
    constructionAgeBand: fromOverlay('constructionAgeBand', fields.construction_age_band, conflicts, {
      neverWrittenToYearBuilt: true,
    }),
    propertyType: listingFallback(
      fromOverlay('propertyType', fields.property_type, conflicts, { unknownNotDefaultedToFlat: true }),
      'propertyType',
      property.property_type,
      { unknownNotDefaultedToFlat: true }
    ),
    bedrooms: listingFallback(
      fromOverlay('bedrooms', fields.bedrooms, conflicts),
      'bedrooms',
      property.bedrooms
    ),
    bathrooms: listingFallback(
      fromOverlay('bathrooms', fields.bathrooms, conflicts),
      'bathrooms',
      property.bathrooms
    ),
    tenure,
    occupancyTenure,
    freeholdOrLeasehold: {
      ...tenure,
      field: 'freeholdOrLeasehold',
      inferredFromPropertyType: false,
    },
    leaseStart: fromRegisteredLeaseDate('leaseStart', selectedLease?.termStartDate, selectedLease, {
      method: 'registered_lease_term_start',
      missingNote:
        'Residential listing has no lease start column. Populated only from the registered lease used for remaining term.',
    }),
    leaseEnd: fromRegisteredLeaseDate('leaseEnd', selectedLease?.termEndDate, selectedLease, {
      method: 'registered_lease_term_end',
      missingNote:
        'Residential listing has no lease end column. Populated only from the registered lease used for remaining term.',
    }),
    groundRent: fromObservedCharge('groundRent', charges.groundRent, {
      missingNote: 'Missing ground rent is notAssessed and must not be treated as 0.',
    }),
    serviceCharge: fromObservedCharge('serviceCharge', charges.serviceCharge, {
      missingNote: 'Missing service charge is notAssessed and must not be treated as 0.',
    }),
    councilTaxBand,
    councilTaxAmount,
    councilTaxAuthority,
    councilTaxYear,
    councilTaxStatus: fromListingText('councilTaxStatus', property.council_tax_status),
    askingPrice: fromListingNumber('askingPrice', property.price, {
      listingTruth: true,
      mustNotOverwrite: true,
    }),
    askingRent: fromListingNumber('askingRent', property.monthly_rent, {
      listingTruth: true,
      mustNotOverwrite: true,
      areaRentsAreNotPropertyFact: true,
      missingNote: 'Missing listing rent is notAssessed and must not be treated as 0.',
    }),
    achievedPrice: fromListingNumber('achievedPrice', property.achieved_price, {
      trust: TRUST.userSupplied,
      method: 'listing_outcome',
      copiedFromAsking: false,
    }),
    achievedRent: fromListingNumber('achievedRent', property.achieved_rent, {
      trust: TRUST.userSupplied,
      method: 'listing_outcome',
      copiedFromAsking: false,
    }),
    lastSoldPrice: fromOverlay('lastSoldPrice', fields.last_sold_price, conflicts),
    lastSoldDate: fromOverlay('lastSoldDate', fields.last_sold_date, conflicts),
    outdoorSpace: fromObservedAmenity('outdoorSpace', amenities.outdoorSpace, {
      missingNote:
        'Outdoor space is notAssessed unless has_garden is explicitly true. Schema default false is not “no garden”.',
      decisionClass: 'report_context_evidence',
    }),
    garage: fromObservedAmenity('garage', amenities.garage, {
      missingNote:
        'Garage is notAssessed unless has_garage is explicitly true. Schema default false is not “no garage”.',
      decisionClass: 'report_context_evidence',
    }),
    parkingSpaces: fromObservedAmenity('parkingSpaces', amenities.parkingSpaces, {
      missingNote:
        'Parking spaces are notAssessed unless a positive count is supplied. Schema default 0 is not “no parking”.',
      decisionClass: 'report_context_evidence',
    }),
    heating: fromObservedAmenity('heating', amenities.heating, {
      missingNote: 'Heating type was not supplied on the listing and is not inferred.',
      decisionClass: 'report_context_evidence',
    }),
    broadband: fromObservedAmenity('broadband', amenities.broadband, {
      missingNote: 'Broadband availability was not supplied on the listing and is not inferred.',
      decisionClass: 'report_context_evidence',
    }),
    flood: floodEvidence ? sanitizeFloodFact(floodEvidence) : unattachedFloodFact(),
    planning: planningEvidence ? sanitizePlanningFact(planningEvidence) : unattachedPlanningFact(),
    schools: schoolEvidence ? sanitizeSchoolFact(schoolEvidence) : unattachedSchoolFact(),
    listedBuilding: listedBuildingEvidence
      ? sanitizeListedBuildingFact(listedBuildingEvidence)
      : unattachedListedBuildingFact(),
    conservationArea: conservationAreaEvidence
      ? sanitizeConservationAreaFact(conservationAreaEvidence)
      : unattachedConservationAreaFact(),
    article4: article4Evidence
      ? sanitizeArticle4Fact(article4Evidence)
      : unattachedArticle4Fact(),
  };

  const listingId = property.id ?? identity.listingId ?? evidence?.identity?.listingId ?? null;
  const uprn = property.uprn || identity.uprn || evidence?.identity?.uprn || null;

  return {
    engine: 'propertyFacts',
    version: 'property-facts-1.1.0',
    scoringActivated: false,
    propertyFactScore: null,
    layers: LAYER,
    trust: TRUST,
    precedence: SOURCE_PRECEDENCE,
    dependencies: DEPENDENCY_MODEL,
    identity: {
      listingId: {
        value: listingId,
        role: 'listing_identity',
        trust: present(listingId) ? TRUST.observed : TRUST.notAssessed,
        listingIdRemainsCanonicalForListings: true,
      },
      uprn: {
        value: uprn || null,
        role: 'property_identity_candidate',
        trust: present(uprn) ? TRUST.observed : TRUST.notAssessed,
        uprnIsCandidateCanonicalPropertyId: Boolean(uprn),
        listingIdRemainsCanonicalForListings: true,
        matchBasis: matchBasis,
      },
    },
    facts,
    implications: {
      leaseRemaining,
    },
    decisions: {
      implemented: false,
      note:
        'User-specific decision relevance (affordability, bad EPC, lease materiality) is not scored in this phase.',
    },
    registeredLeases: evidence?.registeredLeases || [],
    conflicts: conflicts.map((item) => ({
      field: item.field,
      listing: item.listing,
      external: item.external,
      selected: item.selected,
      sourceSelected: item.sourceSelected,
      averaged: false,
      resolvedByLlm: false,
    })),
    retrievedAt,
    propertyLevelMatch: Boolean(evidence?.identity?.propertyLevelMatch),
  };
}

function projectPropertyFactsForDecision(propertyFacts) {
  if (!propertyFacts) {
    return {
      role: 'fact_context',
      scoringActivated: false,
      available: false,
    };
  }
  return {
    role: 'fact_context',
    scoringActivated: false,
    note:
      'Property facts are context only. They do not alter buyer_general, landlord, valuation, rent, demand, or confidence.',
    identity: propertyFacts.identity,
    facts: {
      epcRating: propertyFacts.facts.epcRating,
      tenure: propertyFacts.facts.tenure,
      leaseRemaining: propertyFacts.implications.leaseRemaining,
      leaseStart: propertyFacts.facts.leaseStart,
      leaseEnd: propertyFacts.facts.leaseEnd,
      bathrooms: propertyFacts.facts.bathrooms,
      outdoorSpace: propertyFacts.facts.outdoorSpace,
      garage: propertyFacts.facts.garage,
      parkingSpaces: propertyFacts.facts.parkingSpaces,
      heating: propertyFacts.facts.heating,
      broadband: propertyFacts.facts.broadband,
      flood: propertyFacts.facts.flood,
      planning: propertyFacts.facts.planning,
      schools: propertyFacts.facts.schools,
      listedBuilding: propertyFacts.facts.listedBuilding,
      conservationArea: propertyFacts.facts.conservationArea,
      article4: propertyFacts.facts.article4,
      councilTaxBand: propertyFacts.facts.councilTaxBand,
      councilTaxAmount: propertyFacts.facts.councilTaxAmount,
      groundRent: propertyFacts.facts.groundRent,
      serviceCharge: propertyFacts.facts.serviceCharge,
      floorArea: propertyFacts.facts.floorArea,
      yearBuilt: propertyFacts.facts.yearBuilt,
    },
  };
}

function attachPropertyFactsToDecisionContext(decisionContext, propertyFacts) {
  const slice = projectPropertyFactsForDecision(propertyFacts);
  if (!decisionContext) return decisionContext;
  return { ...decisionContext, propertyFacts: slice };
}

function publicSchoolsSlice(fact) {
  if (!fact?.available) return null;
  return {
    value: fact.value,
    available: true,
    source: fact.source || null,
    provider: fact.provider || null,
    scope: fact.scope || 'area',
    searchRadiusMetres: fact.searchRadiusMetres ?? null,
    summary: fact.summary || null,
    nearbySchools: Array.isArray(fact.nearbySchools) ? fact.nearbySchools : [],
    catchment: {
      available: false,
      state: 'notAssessed',
      reason: fact.catchment?.reason || 'no_authoritative_catchment_source_integrated',
    },
    retrievedAt: fact.retrievedAt || null,
    limitations: fact.limitations || [],
    notAScore: true,
    notCatchment: true,
    notAdmissionEvidence: true,
    notAValuationAdjustment: true,
    notPersonalDecisionInput: true,
  };
}

function publicPlanningSlice(fact) {
  if (!fact?.available) return null;
  return {
    value: fact.value,
    available: true,
    source: fact.source || null,
    provider: fact.provider || null,
    scope: fact.scope || null,
    searchRadiusMetres: fact.searchRadiusMetres ?? null,
    summary: fact.summary || null,
    subjectApplications: Array.isArray(fact.subjectApplications) ? fact.subjectApplications : [],
    nearbyApplications: Array.isArray(fact.nearbyApplications) ? fact.nearbyApplications : [],
    retrievedAt: fact.retrievedAt || null,
    limitations: fact.limitations || [],
    notAScore: true,
    notAValuationAdjustment: true,
    notPersonalDecisionInput: true,
  };
}

function publicArticle4Slice(fact) {
  if (!fact?.available) return null;
  return {
    value: fact.value,
    available: true,
    source: fact.source || null,
    provider: fact.provider || null,
    scope: fact.scope || 'coordinate_point_in_polygon',
    summary: fact.summary || null,
    areas: Array.isArray(fact.areas) ? fact.areas : [],
    restrictions: {
      available: false,
      state: 'notAssessed',
      assessed: false,
      reason: fact.restrictions?.reason || 'authoritative_restriction_schedule_not_integrated',
      note: fact.restrictions?.note
        || 'The specific permitted-development rights affected have not been assessed.',
    },
    retrievedAt: fact.retrievedAt || null,
    evidenceAsOf: fact.evidenceAsOf || null,
    geographicResolution: fact.geographicResolution || null,
    geographicMembershipOnly: true,
    restrictionsAssessed: false,
    legalEffectivenessAssessed: false,
    limitations: fact.limitations || [],
    notAScore: true,
    notLegalAdvice: true,
    notAValuationAdjustment: true,
    notPersonalDecisionInput: true,
  };
}

function publicConservationAreaSlice(fact) {
  if (!fact?.available) return null;
  return {
    value: fact.value,
    available: true,
    source: fact.source || null,
    provider: fact.provider || null,
    scope: fact.scope || 'coordinate_point_in_polygon',
    summary: fact.summary || null,
    areas: Array.isArray(fact.areas) ? fact.areas : [],
    retrievedAt: fact.retrievedAt || null,
    geographicResolution: fact.geographicResolution || null,
    limitations: fact.limitations || [],
    notAScore: true,
    notAListedBuilding: true,
    notAPlanningApplication: true,
    notAValuationAdjustment: true,
    notPersonalDecisionInput: true,
  };
}

function publicListedBuildingSlice(fact) {
  if (!fact?.available) return null;
  return {
    value: fact.value,
    available: true,
    source: fact.source || null,
    provider: fact.provider || null,
    scope: fact.scope || 'property',
    nativeGrade: fact.nativeGrade || null,
    searchRadiusMetres: fact.searchRadiusMetres ?? null,
    summary: fact.summary || null,
    listings: Array.isArray(fact.listings) ? fact.listings : [],
    retrievedAt: fact.retrievedAt || null,
    limitations: fact.limitations || [],
    notAScore: true,
    notAValuationAdjustment: true,
    notPersonalDecisionInput: true,
  };
}

function publicFloodSlice(fact) {
  if (!fact?.available) return null;
  return {
    value: fact.value,
    available: true,
    source: fact.source || null,
    provider: fact.provider || null,
    floodTypes: fact.floodTypes || ['rivers_and_sea'],
    zone: fact.zone ?? null,
    geographicResolution: fact.geographicResolution || null,
    retrievedAt: fact.retrievedAt || null,
    notAScore: true,
    notAValuationAdjustment: true,
    notPersonalDecisionInput: true,
  };
}

function publicPropertyFactsForExplanation(propertyFacts) {
  if (!propertyFacts) return null;
  return {
    epcRating: propertyFacts.facts.epcRating?.value ?? null,
    epcTrust: propertyFacts.facts.epcRating?.trust ?? TRUST.notAssessed,
    tenure: propertyFacts.facts.tenure?.value ?? null,
    tenureTrust: propertyFacts.facts.tenure?.trust ?? TRUST.notAssessed,
    leaseRemaining: propertyFacts.implications.leaseRemaining?.value ?? null,
    leaseRemainingTrust: propertyFacts.implications.leaseRemaining?.trust ?? TRUST.notAssessed,
    leaseStart: propertyFacts.facts.leaseStart?.value ?? null,
    leaseEnd: propertyFacts.facts.leaseEnd?.value ?? null,
    bathrooms: propertyFacts.facts.bathrooms?.value ?? null,
    outdoorSpace: propertyFacts.facts.outdoorSpace?.available ? true : null,
    heating: propertyFacts.facts.heating?.value ?? null,
    broadband: propertyFacts.facts.broadband?.value ?? null,
    flood: publicFloodSlice(propertyFacts.facts.flood),
    planning: publicPlanningSlice(propertyFacts.facts.planning),
    schools: publicSchoolsSlice(propertyFacts.facts.schools),
    listedBuilding: publicListedBuildingSlice(propertyFacts.facts.listedBuilding),
    conservationArea: publicConservationAreaSlice(propertyFacts.facts.conservationArea),
    article4: publicArticle4Slice(propertyFacts.facts.article4),
    councilTaxBand: propertyFacts.facts.councilTaxBand?.value ?? null,
    councilTaxAmount: propertyFacts.facts.councilTaxAmount?.value ?? null,
    councilTaxAmountUsedAsFinance: false,
    groundRent: propertyFacts.facts.groundRent?.value ?? null,
    serviceCharge: propertyFacts.facts.serviceCharge?.value ?? null,
    floorArea: propertyFacts.facts.floorArea?.value ?? null,
    yearBuilt: propertyFacts.facts.yearBuilt?.value ?? null,
    conflicts: propertyFacts.conflicts,
    missing: Object.entries(propertyFacts.facts)
      .filter(([, fact]) => fact && !fact.available)
      .map(([key]) => key),
    scoringActivated: false,
  };
}

module.exports = {
  TRUST,
  LAYER,
  SOURCE_PRECEDENCE,
  DEPENDENCY_MODEL,
  assemblePropertyFacts,
  projectPropertyFactsForDecision,
  attachPropertyFactsToDecisionContext,
  publicPropertyFactsForExplanation,
};
