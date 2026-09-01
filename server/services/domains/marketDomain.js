/**
 * Market domain adapter.
 * Normalises already-acquired listing, transaction, and area-market evidence.
 * Does not query providers, invent valuations, or promote transactions to comparables.
 */

const {
  createDomainEnvelope,
  composeDomainOutputs,
  createEvidence,
  DOMAIN_ID,
  DOMAIN_STATUS,
  KERNEL_ASSESSMENT,
  EVIDENCE_CLASS,
  SOURCE_TYPE,
  SPATIAL_RELATION,
  ASSET_CLASS,
  MARKET_DOMAIN_VERSION,
} = require('../../architecture');
const { subjectRefFromIdentity } = require('./subjectRef');
const { residentialMethodologyGate } = require('../identity/assetClassificationRuntime');
const {
  parseSoldPricesStats,
  parseSoldTransactionsFromPayload,
  demandEvidenceFromEnrichment,
  rentalDemandEvidenceFromEnrichment,
} = require('../providers/propertyData/propertyDataParsers');
const { officialSalesForMarket } = require('../market/officialSaleTransactionQuery');
const {
  IMPORT_STATUS,
  SOURCE_GEOGRAPHY,
  HMLR_OGL_ATTRIBUTION,
} = require('../../architecture/officialSaleTransaction');

const ENVELOPE_LIMITATIONS = Object.freeze([
  'Asking price is not an achieved sale price.',
  'A transaction observation is not automatically a valuation comparable.',
  'Area sold-price and demand statistics are AREA_CONTEXT, not property facts.',
  'PropertyData sold-price stats are HM Land Registry residential-oriented market context, not class-specific commercial, industrial, agricultural, land, or development transactions.',
  'Missing evidence is missing. It is not zero value and not a safe market.',
  'This is not a valuation, ERV, lease-income, GDV, or residual assessment.',
  'Official completed sales are HM Land Registry Price Paid Data for England and Wales. They are not automatically valuation comparables.',
]);

function positiveNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function enrichmentPayload(entry) {
  if (!entry) return null;
  return entry.data || entry.payload || entry.valuation || null;
}

function soldObservationCoverage(enrichments = {}) {
  const sold = enrichments.sold_prices;
  if (!sold) {
    return {
      available: false,
      status: 'NOT_FETCHED',
      transactionObservationCount: null,
      transactions: [],
      stats: null,
      retrievedAt: null,
    };
  }
  if (sold.success === false) {
    return {
      available: false,
      status: 'PROVIDER_FAILED',
      transactionObservationCount: null,
      transactions: [],
      stats: null,
      retrievedAt: sold.provenance?.retrievedAt || null,
      message: sold.message || 'Sold-price source failed.',
    };
  }
  const payload = enrichmentPayload(sold);
  const transactions = parseSoldTransactionsFromPayload(payload || {});
  const stats = parseSoldPricesStats(payload);
  const fromStats = Number(stats?.sampleSize);
  const count = transactions.length || (Number.isFinite(fromStats) ? fromStats : 0);
  return {
    available: true,
    status: 'OBSERVED',
    transactionObservationCount: count,
    transactions,
    stats,
    retrievedAt: sold.provenance?.retrievedAt || null,
  };
}

function sourceCoverage(property, enrichments, sold, officialSales) {
  const sources = [];
  if (property) sources.push('ApplicationDatabase');
  if (sold.available) {
    sources.push('PropertyData');
    sources.push('HM_Land_Registry');
  }
  if (officialSales && officialSales.officialTransactionSourceAvailable) {
    sources.push('HMLR_PRICE_PAID_DATA');
  }
  if (enrichments.demand?.success) sources.push('PropertyData_Demand');
  if (enrichments.demand_rent?.success) sources.push('PropertyData_DemandRent');
  return [...new Set(sources)];
}

function missingEvidenceTypes({ assetClass, gate, sold, lastSold, askingPrice, officialSales }) {
  const missing = [];
  if (!askingPrice) missing.push('LISTING_ASKING_PRICE');
  if (!lastSold) missing.push('SUBJECT_TRANSACTION');
  if (!sold.available) missing.push('AREA_TRANSACTION_OBSERVATIONS');
  if (officialSales) {
    const status = officialSales.status;
    if (status === 'IMPORT_NOT_RUN') missing.push('OFFICIAL_SALE_IMPORT');
    else if (status === 'IMPORT_FAILED') missing.push('OFFICIAL_SALE_IMPORT');
    else if (status === 'SOURCE_NOT_AVAILABLE') missing.push('OFFICIAL_SALE_SOURCE');
    else if (status === 'SOURCE_OUTSIDE_GEOGRAPHY') missing.push('OFFICIAL_SALE_SOURCE_GEOGRAPHY');
    else if (!officialSales.subjectOfficialTransactionCount) missing.push('SUBJECT_OFFICIAL_TRANSACTION');
  }
  if (assetClass !== ASSET_CLASS.RESIDENTIAL && assetClass !== ASSET_CLASS.UNKNOWN) {
    missing.push('CLASS_SPECIFIC_TRANSACTIONS');
    missing.push('CLASS_SPECIFIC_COMPARABLES');
  }
  if (!gate.allowed) {
    missing.push('SPECIALISED_VALUATION_METHODOLOGY');
    if (assetClass !== ASSET_CLASS.LAND && assetClass !== ASSET_CLASS.DEVELOPMENT_SITE) {
      missing.push('CLASS_SPECIFIC_RENTAL_OR_LEASE_EVIDENCE');
    }
  }
  if (assetClass === ASSET_CLASS.LAND || assetClass === ASSET_CLASS.DEVELOPMENT_SITE) {
    missing.push('DEVELOPMENT_VALUE_IDENTITY');
  }
  if (assetClass === ASSET_CLASS.MIXED_USE) missing.push('COMPONENT_LEVEL_MARKET_EVIDENCE');
  missing.push('VERIFIED_FIRST_PARTY_OUTCOMES');
  return missing;
}

function adaptMarketDomain({
  property = {},
  identity = {},
  assetClassification = {},
  externalEnrichment = {},
  comparableCount = null,
  saleComparableCount = null,
  analysisAt = null,
  officialSales = null,
} = {}) {
  const subjectRef = subjectRefFromIdentity(identity);
  const assetClass = assetClassification.assetClass || ASSET_CLASS.UNKNOWN;
  const gate = residentialMethodologyGate(assetClassification);
  const enrichments = externalEnrichment.enrichments || {};
  const sold = soldObservationCoverage(enrichments);
  const askingPrice = positiveNumber(property.price);
  const lastSoldPrice = positiveNumber(property.last_sold_price);
  const lastSoldDate = property.last_sold_date || property.sold_date || null;
  const declaredUse = property.property_type || property.property_category || null;
  const listingCategory = property.category || null;
  const postcode = property.zip_code || property.postcode || identity.postcode || null;
  const evidence = [];
  const findings = [];
  const unresolvedDependencies = [];
  const investigationPriorities = [];

  if (declaredUse || listingCategory || assetClass) {
    evidence.push(createEvidence({
      domain: DOMAIN_ID.MARKET,
      subjectRef,
      factType: 'declaredUseAndClassification',
      classification: EVIDENCE_CLASS.USER_INPUT,
      sourceType: SOURCE_TYPE.FIRST_PARTY,
      provenance: {
        source: 'ApplicationDatabase',
        method: 'listing_and_runtime_classification',
      },
      value: {
        assetClass,
        classificationState: assetClassification.state || null,
        declaredUse,
        listingCategory,
      },
      retrievedAt: analysisAt,
      evidenceAsOf: analysisAt,
      spatialRelation: SPATIAL_RELATION.SUBJECT,
      assessmentState: 'assessed',
      sharedPropertyEvidence: true,
      authoritative: false,
      limitations: ['Listing type text is not an official use class. UNKNOWN is valid.'],
    }));
    findings.push({
      id: 'subject_identity_classification',
      text: `Subject classification is ${assetClass}. Declared listing use is ${declaredUse || 'not recorded'}.`,
    });
  }

  if (askingPrice != null) {
    evidence.push(createEvidence({
      domain: DOMAIN_ID.MARKET,
      subjectRef,
      factType: 'listingAskingPrice',
      classification: EVIDENCE_CLASS.USER_INPUT,
      sourceType: SOURCE_TYPE.FIRST_PARTY,
      provenance: { source: 'ApplicationDatabase', method: 'listing_price' },
      value: askingPrice,
      unit: 'GBP',
      retrievedAt: analysisAt,
      evidenceAsOf: analysisAt,
      spatialRelation: SPATIAL_RELATION.SUBJECT,
      assessmentState: 'assessed',
      sharedPropertyEvidence: true,
      authoritative: false,
      limitations: ['Asking price is not an achieved transaction price and is not a valuation.'],
    }));
    findings.push({
      id: 'asking_not_transaction',
      text: 'A listing asking price is present. It is not treated as an achieved sale.',
    });
  }

  if (lastSoldPrice != null) {
    evidence.push(createEvidence({
      domain: DOMAIN_ID.MARKET,
      subjectRef,
      factType: 'userReportedSubjectTransaction',
      classification: EVIDENCE_CLASS.USER_INPUT,
      sourceType: SOURCE_TYPE.USER_REPORTED,
      provenance: { source: 'ApplicationDatabase', method: 'listing_last_sold' },
      value: lastSoldPrice,
      unit: 'GBP',
      observedAt: lastSoldDate,
      retrievedAt: analysisAt,
      evidenceAsOf: lastSoldDate || analysisAt,
      spatialRelation: SPATIAL_RELATION.SUBJECT,
      assessmentState: 'assessed',
      sharedPropertyEvidence: true,
      authoritative: false,
      limitations: [
        'User-reported last sale is not an independently verified official transaction.',
        'It is not automatically a valuation comparable.',
      ],
    }));
    findings.push({
      id: 'user_reported_transaction_not_comparable',
      text: 'A user-reported last-sale observation is present. It is not promoted to a valuation comparable.',
    });
  }

  if (askingPrice != null && lastSoldPrice != null && askingPrice !== lastSoldPrice) {
    findings.push({
      id: 'conflicting_price_observations_preserved',
      text: 'Asking price and user-reported last sale disagree. Both observations are preserved.',
    });
  }

  if (officialSales) {
    officialSalesForMarket(officialSales, identity).forEach((item) => evidence.push(item));
    if (officialSales.status === IMPORT_STATUS.SOURCE_OUTSIDE_GEOGRAPHY) {
      findings.push({
        id: 'official_sale_outside_geography',
        text: `HM Land Registry Price Paid Data covers ${SOURCE_GEOGRAPHY}. This subject is outside that coverage. Missing official sales are unavailable, not zero transactions.`,
      });
    } else if (officialSales.status === IMPORT_STATUS.IMPORT_NOT_RUN) {
      findings.push({
        id: 'official_sale_import_not_run',
        text: 'Official sale import has not been run. This is not a finding of no sales.',
      });
    } else if (officialSales.status === IMPORT_STATUS.IMPORT_FAILED) {
      findings.push({
        id: 'official_sale_import_failed',
        text: 'Official sale import failed. This is not a finding of no sales.',
      });
    } else if (officialSales.status === IMPORT_STATUS.SOURCE_NOT_AVAILABLE) {
      findings.push({
        id: 'official_sale_source_unavailable',
        text: 'The official sale source is not available. This is not a finding of no sales.',
      });
    } else if (officialSales.status === IMPORT_STATUS.TRANSACTION_FOUND) {
      findings.push({
        id: 'official_subject_sale_not_comparable',
        text: `Official completed sale evidence is attached for the subject (${officialSales.matchMethod}). It is not a comparable and not a current valuation.`,
      });
    } else if (officialSales.status === IMPORT_STATUS.NO_MATCH) {
      findings.push({
        id: 'official_area_sales_not_subject_sale',
        text: 'Official postcode sales are area context. They are not an exact subject sale.',
      });
    } else if (officialSales.status === IMPORT_STATUS.NO_TRANSACTIONS_FOUND) {
      findings.push({
        id: 'official_sales_none_in_source',
        text: 'No matching official Price Paid transactions were found in the imported England and Wales source.',
      });
    }
  }

  if (sold.available) {
    evidence.push(createEvidence({
      domain: DOMAIN_ID.MARKET,
      subjectRef,
      factType: 'areaTransactionObservations',
      classification: EVIDENCE_CLASS.AREA_CONTEXT,
      sourceType: SOURCE_TYPE.LICENSED_PROVIDER,
      provenance: {
        source: 'PropertyData',
        method: 'sold_prices',
        providerEndpoint: '/sold-prices',
        underlyingSource: 'HM Land Registry',
      },
      value: {
        observationCount: sold.transactionObservationCount,
        average: sold.stats?.average || null,
      },
      retrievedAt: sold.retrievedAt,
      evidenceAsOf: sold.retrievedAt,
      spatialRelation: SPATIAL_RELATION.AREA_CONTEXT,
      assessmentState: 'assessed',
      sharedPropertyEvidence: true,
      authoritative: false,
      limitations: [
        'Nearby or postcode sold-price observations are area context.',
        'They do not prove subject value and are not valuation comparables.',
      ],
    }));
    findings.push({
      id: 'area_transactions_not_comparables',
      text: `${sold.transactionObservationCount} area sold-price observation(s) are held as transaction evidence, not comparables.`,
    });
  } else if (sold.status === 'PROVIDER_FAILED') {
    findings.push({
      id: 'sold_price_source_failed',
      text: 'The sold-price source failed. No fabricated transaction evidence was created.',
    });
  }

  const saleDemand = demandEvidenceFromEnrichment(externalEnrichment);
  if (saleDemand?.available) {
    evidence.push(createEvidence({
      domain: DOMAIN_ID.MARKET,
      subjectRef,
      factType: 'areaSalesMarketActivity',
      classification: EVIDENCE_CLASS.AREA_CONTEXT,
      sourceType: SOURCE_TYPE.LICENSED_PROVIDER,
      provenance: {
        source: 'PropertyData',
        method: 'demand_area_buyer_market',
        providerEndpoint: '/demand',
      },
      value: {
        band: saleDemand.band || null,
        totalForSale: saleDemand.totalForSale || null,
        monthsOfInventory: saleDemand.monthsOfInventory || null,
        daysOnMarket: saleDemand.daysOnMarket || null,
      },
      retrievedAt: saleDemand.retrievedAt,
      evidenceAsOf: saleDemand.retrievedAt,
      spatialRelation: SPATIAL_RELATION.AREA_CONTEXT,
      assessmentState: 'assessed',
      sharedPropertyEvidence: true,
      authoritative: false,
      limitations: [
        'Area sales-market activity is AREA_CONTEXT, not property-specific demand.',
        'PropertyData /demand is a residential-oriented area snapshot. It is not commercial, industrial, agricultural, land, or development demand.',
        'The provider band is not a numeric demand score and is not a valuation input.',
      ],
    }));
    findings.push({
      id: 'area_sales_demand_not_subject_demand',
      text: 'Area sales-market activity is held as context. It does not prove subject demand or value.',
    });
  }

  const rentDemand = gate.allowed ? rentalDemandEvidenceFromEnrichment(externalEnrichment) : null;
  if (rentDemand?.available) {
    evidence.push(createEvidence({
      domain: DOMAIN_ID.MARKET,
      subjectRef,
      factType: 'areaRentalMarketActivity',
      classification: EVIDENCE_CLASS.AREA_CONTEXT,
      sourceType: SOURCE_TYPE.LICENSED_PROVIDER,
      provenance: {
        source: 'PropertyData',
        method: 'demand_area_rental_market',
        providerEndpoint: '/demand-rent',
      },
      value: {
        band: rentDemand.band || null,
        totalForRent: rentDemand.totalForRent || null,
        monthsOfInventory: rentDemand.monthsOfInventory || null,
        daysOnMarket: rentDemand.daysOnMarket || null,
      },
      retrievedAt: rentDemand.retrievedAt,
      evidenceAsOf: rentDemand.retrievedAt,
      spatialRelation: SPATIAL_RELATION.AREA_CONTEXT,
      assessmentState: 'assessed',
      sharedPropertyEvidence: true,
      authoritative: false,
      limitations: [
        'Area rental-market activity is AREA_CONTEXT, not property-specific tenant demand.',
        'It is not ERV, contractual rent, or a residential rent recommendation.',
      ],
    }));
    findings.push({
      id: 'area_rental_demand_not_subject_rent',
      text: 'Area rental-market activity is held as context. It is not a rent valuation.',
    });
  }

  if (postcode) {
    evidence.push(createEvidence({
      domain: DOMAIN_ID.MARKET,
      subjectRef,
      factType: 'subjectGeography',
      classification: EVIDENCE_CLASS.FACT,
      sourceType: SOURCE_TYPE.FIRST_PARTY,
      provenance: { source: 'ApplicationDatabase', method: 'listing_postcode' },
      value: postcode,
      retrievedAt: analysisAt,
      evidenceAsOf: analysisAt,
      spatialRelation: SPATIAL_RELATION.SUBJECT,
      assessmentState: 'assessed',
      sharedPropertyEvidence: true,
      authoritative: false,
      limitations: ['Postcode locates the subject. It does not establish catchment, permission, or value.'],
    }));
  }

  const residentialComparableCount = gate.allowed
    ? (Number(saleComparableCount) || 0) + (Number(comparableCount) || 0)
    : null;
  if (!gate.allowed) {
    findings.push({
      id: 'no_class_valuation_comparables',
      text: `Residential comparable methodology is not applied to ${assetClass}. Nearby observations are not ${assetClass.toLowerCase()} valuation comparables.`,
    });
  } else if (residentialComparableCount != null) {
    findings.push({
      id: 'residential_comparable_candidates',
      text: 'Residential comparable candidates, where present, remain separate from raw transaction observations.',
    });
  }

  const missing = missingEvidenceTypes({
    assetClass,
    gate,
    sold,
    lastSold: lastSoldPrice != null,
    askingPrice: askingPrice != null,
    officialSales,
  });
  missing.forEach((type) => {
    unresolvedDependencies.push({
      id: `missing_${type.toLowerCase()}`,
      text: `${type} is not available from current sources.`,
    });
  });

  if (!gate.allowed) {
    investigationPriorities.push({
      id: 'class_specific_market_source',
      text: `A future licensed source of ${assetClass} completed transactions is required before specialised market/comparable methodology.`,
    });
  }
  if (!sold.available && askingPrice == null && lastSoldPrice == null
    && !(officialSales && officialSales.subjectOfficialTransactionCount)) {
    investigationPriorities.push({
      id: 'no_price_evidence',
      text: 'No listing asking price, subject transaction, or area sold-price observations are attached.',
    });
  }

  const hasMaterialEvidence = evidence.length > 0;
  const status = !hasMaterialEvidence
    ? DOMAIN_STATUS.NOT_ASSESSED
    : sold.status === 'PROVIDER_FAILED' && evidence.length <= 2
      ? DOMAIN_STATUS.PARTIAL
      : DOMAIN_STATUS.PARTIAL;
  const assessmentState = hasMaterialEvidence
    ? KERNEL_ASSESSMENT.ASSESSED
    : KERNEL_ASSESSMENT.INSUFFICIENT_EVIDENCE;

  const coverage = {
    transactionObservationCount: sold.available ? sold.transactionObservationCount : null,
    listingAskingPricePresent: askingPrice != null,
    userReportedSubjectTransactionPresent: lastSoldPrice != null,
    officialTransactionSourceAvailable: officialSales
      ? officialSales.officialTransactionSourceAvailable === true
      : null,
    officialTransactionStatus: officialSales ? officialSales.status : null,
    subjectOfficialTransactionCount: officialSales ? officialSales.subjectOfficialTransactionCount : null,
    areaOfficialTransactionCount: officialSales ? officialSales.areaOfficialTransactionCount : null,
    uprnMatchedTransactionCount: officialSales ? officialSales.uprnMatchedTransactionCount : null,
    unmatchedTransactionCount: officialSales ? officialSales.unmatchedTransactionCount : null,
    latestOfficialTransactionDate: officialSales ? officialSales.latestOfficialTransactionDate : null,
    officialMatchMethod: officialSales ? officialSales.matchMethod : null,
    sourceGeography: officialSales ? (officialSales.sourceGeography || SOURCE_GEOGRAPHY) : null,
    areaSalesMarketActivityPresent: Boolean(saleDemand?.available),
    areaRentalMarketActivityPresent: Boolean(rentDemand?.available),
    comparableCandidateCount: residentialComparableCount,
    comparableCandidatesAreValuationComparables: Boolean(gate.allowed && (Number(saleComparableCount) || 0) > 0),
    sourceCoverage: sourceCoverage(property, enrichments, sold, officialSales),
    geographicCoverage: postcode || null,
    recencyCoverage: sold.retrievedAt || analysisAt || null,
    missingEvidenceTypes: missing,
    classSpecificTransactionStatus: (
      assetClass === ASSET_CLASS.RESIDENTIAL || assetClass === ASSET_CLASS.UNKNOWN
        ? (sold.available || (officialSales && officialSales.officialTransactionSourceAvailable)
          ? 'RESIDENTIAL_ORIENTED_AREA_CONTEXT'
          : 'NO_DATA')
        : 'BLOCKED_BY_EVIDENCE'
    ),
  };

  const envelope = createDomainEnvelope({
    domain: DOMAIN_ID.MARKET,
    version: MARKET_DOMAIN_VERSION,
    subject: {
      ...subjectRef,
      assetClass,
      classificationState: assetClassification.state || null,
    },
    status,
    evidenceAsOf: sold.retrievedAt || analysisAt || null,
    analysisAt: analysisAt || null,
    assessment: {
      state: assessmentState,
      residentialMethodology: gate,
      askingPriceIsNotAchievedPrice: true,
      transactionIsNotComparable: true,
      areaContextIsNotSubjectFact: true,
      missingIsNotZero: true,
      specialisedValuation: 'NOT_ASSESSED',
      coverage,
    },
    findings,
    evidence,
    limitations: officialSales
      ? [...ENVELOPE_LIMITATIONS, HMLR_OGL_ATTRIBUTION]
      : ENVELOPE_LIMITATIONS,
    unresolvedDependencies,
    investigationPriorities,
    provenance: {
      source: officialSales && officialSales.officialTransactionSourceAvailable
        ? 'HMLR_PRICE_PAID_DATA'
        : (sold.available ? 'PropertyData' : 'ApplicationDatabase'),
      sourceType: officialSales && officialSales.officialTransactionSourceAvailable
        ? SOURCE_TYPE.OFFICIAL
        : (sold.available ? SOURCE_TYPE.LICENSED_PROVIDER : SOURCE_TYPE.FIRST_PARTY),
      method: 'market-domain-normalisation',
      retrievedAt: sold.retrievedAt || null,
      evidenceAsOf: sold.retrievedAt || analysisAt || null,
      adapter: MARKET_DOMAIN_VERSION,
      wrapsExistingEvidence: true,
      noAdditionalProviderCall: true,
      officialSaleImportNotOnAnalysePath: true,
    },
  });

  return {
    envelope,
    coverage,
    assetClassUnchanged: assetClass,
  };
}

function attachMarketDomain(args) {
  try {
    const adapted = adaptMarketDomain(args);
    return {
      marketDomain: adapted.envelope,
      domains: composeDomainOutputs([adapted.envelope]),
    };
  } catch {
    return {
      marketDomain: createDomainEnvelope({
        domain: DOMAIN_ID.MARKET,
        version: MARKET_DOMAIN_VERSION,
        status: DOMAIN_STATUS.NOT_ASSESSED,
        assessment: { state: KERNEL_ASSESSMENT.NOT_ASSESSED },
        limitations: ENVELOPE_LIMITATIONS,
        findings: [{
          id: 'adapter_degraded',
          text: 'Market domain could not be assembled from the attached evidence.',
        }],
      }),
      domains: null,
    };
  }
}

module.exports = {
  ENVELOPE_LIMITATIONS,
  adaptMarketDomain,
  attachMarketDomain,
  soldObservationCoverage,
};
