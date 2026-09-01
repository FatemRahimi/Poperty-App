/**
 * Sale-valuation evidence eligibility.
 * Categorical only — not a quality score and not a confidence replacement.
 *
 * INVALID evidence is handled by valuationIntegrity (Phase 1A).
 * This module answers: is remaining valid evidence grounded enough to assess?
 */

const {
  isValidBlendEstimate,
  parsePositiveMoney,
  isAskingListingMethod,
} = require('./valuationIntegrity');

const METHOD_FAMILY = {
  valuation_sale_avm: 'PROVIDER_MODEL',
  uprn_profile: 'PROVIDER_MODEL',
  sold_prices_statistics: 'TRANSACTION_STATISTICS',
  sqft_implied: 'TRANSACTION_STATISTICS',
  internal_sale_comparables: 'ASKING_LISTING',
};

const FAMILY_PREFERENCE = {
  PROVIDER_MODEL: ['valuation_sale_avm', 'uprn_profile'],
  TRANSACTION_STATISTICS: ['sqft_implied', 'sold_prices_statistics'],
};

function subjectPostcode(property = {}) {
  const raw = property.zip_code || property.postcode || '';
  const text = String(raw).trim();
  return text || null;
}

function subjectUprn(property = {}, profile = {}) {
  const raw = property.uprn || profile.uprn || '';
  const text = String(raw).trim();
  return text || null;
}

function classifyEvidenceDate(raw, asOf = Date.now()) {
  if (raw === null || raw === undefined || raw === '') {
    return { state: 'unknown', iso: null, reason: 'missing' };
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return { state: 'unknown', iso: null, reason: 'malformed' };
  }
  if (parsed.getTime() > asOf) {
    return { state: 'invalid', iso: parsed.toISOString(), reason: 'future' };
  }
  return {
    state: 'valid',
    iso: typeof raw === 'string' ? raw : parsed.toISOString(),
    reason: null,
  };
}

/**
 * Recover a single type token. Ambiguous multi-value shapes stay unknown.
 * Does not write back to the catalogue.
 */
function canonicalPropertyTypeToken(value) {
  if (value == null || value === '') return null;
  if (Array.isArray(value)) {
    const tokens = [
      ...new Set(value.map((v) => String(v).toLowerCase().trim()).filter(Boolean)),
    ];
    return tokens.length === 1 ? tokens[0] : null;
  }
  const text = String(value).trim();
  const pgArray = text.match(/^\{([\s\S]*)\}$/);
  if (pgArray) {
    const tokens = [
      ...new Set(
        pgArray[1]
          .split(',')
          .map((part) => part.trim().replace(/^"|"$/g, '').toLowerCase())
          .filter(Boolean)
      ),
    ];
    return tokens.length === 1 ? tokens[0] : null;
  }
  const norm = text.toLowerCase().trim();
  return norm || null;
}

function typesAreExactMatch(a, b) {
  const left = canonicalPropertyTypeToken(a);
  const right = canonicalPropertyTypeToken(b);
  if (!left || !right) return false;
  return left === right;
}

function emptyEligibility(method, extras = {}) {
  return {
    method,
    methodFamily: METHOD_FAMILY[method] || 'UNKNOWN',
    sourceKind: extras.sourceKind || 'unknown',
    propertySpecificity: extras.propertySpecificity || 'unknown',
    transactionBasis: extras.transactionBasis || 'unknown',
    eligibleForAssessment: false,
    canAssessAlone: false,
    limitations: extras.limitations || [],
    rejectionReasons: extras.rejectionReasons || [],
  };
}

function evaluateAvmEligibility(parsed, property = {}) {
  const method = 'valuation_sale_avm';
  const limitations = [];
  if (!parsed || !isValidBlendEstimate(parsed.centralEstimate)) {
    return emptyEligibility(method, {
      sourceKind: 'provider_model',
      propertySpecificity: 'property',
      transactionBasis: 'model',
      rejectionReasons: ['missing_or_invalid_estimate'],
    });
  }
  if (parsed.margin == null) limitations.push('bounds_not_supplied');
  if (!parsed.confidence) limitations.push('provider_confidence_not_supplied');
  limitations.push('sample_size_not_in_parser_contract');
  limitations.push('as_of_date_not_in_parser_contract');

  if (!subjectPostcode(property)) {
    return emptyEligibility(method, {
      sourceKind: 'provider_model',
      propertySpecificity: 'unknown',
      transactionBasis: 'model',
      limitations,
      rejectionReasons: ['missing_geographic_identity'],
    });
  }

  return {
    method,
    methodFamily: 'PROVIDER_MODEL',
    sourceKind: 'provider_model',
    propertySpecificity: 'property',
    transactionBasis: 'model',
    eligibleForAssessment: true,
    canAssessAlone: true,
    limitations,
    rejectionReasons: [],
  };
}

function evaluateUprnEstimateEligibility(parsed, property = {}, profile = {}) {
  const method = 'uprn_profile';
  if (!parsed || !isValidBlendEstimate(parsed.centralEstimate)) {
    return emptyEligibility(method, {
      sourceKind: 'provider_model',
      propertySpecificity: 'property',
      transactionBasis: 'model',
      rejectionReasons: ['missing_or_invalid_estimate'],
    });
  }
  if (!subjectUprn(property, profile)) {
    return emptyEligibility(method, {
      sourceKind: 'provider_model',
      propertySpecificity: 'unknown',
      transactionBasis: 'model',
      limitations: ['no_interval_in_parser_contract', 'no_confidence_in_parser_contract'],
      rejectionReasons: ['missing_uprn_identity'],
    });
  }
  return {
    method,
    methodFamily: 'PROVIDER_MODEL',
    sourceKind: 'provider_model',
    propertySpecificity: 'property',
    transactionBasis: 'model',
    eligibleForAssessment: true,
    canAssessAlone: true,
    limitations: [
      'no_interval_in_parser_contract',
      'no_confidence_in_parser_contract',
      'same_provider_model_family_as_valuation_sale_avm',
    ],
    rejectionReasons: [],
  };
}

function evaluateSoldStatsEligibility(stats) {
  const method = 'sold_prices_statistics';
  if (!stats || !isValidBlendEstimate(stats.average)) {
    return emptyEligibility(method, {
      sourceKind: 'area_statistics',
      propertySpecificity: 'area',
      transactionBasis: 'sold_statistics',
      rejectionReasons: ['missing_or_invalid_average'],
    });
  }
  const limitations = [
    'postcode_area_statistic_not_property_specific',
    'transaction_period_not_in_parser_contract',
    'same_sold_price_dataset_as_sqft_implied',
  ];
  if (stats.sampleSize == null) limitations.push('sample_size_unknown');
  return {
    method,
    methodFamily: 'TRANSACTION_STATISTICS',
    sourceKind: 'area_statistics',
    propertySpecificity: 'area',
    transactionBasis: 'sold_statistics',
    eligibleForAssessment: true,
    canAssessAlone: false,
    limitations,
    rejectionReasons: [],
  };
}

function evaluateSqftImpliedEligibility(estimate) {
  const method = 'sqft_implied';
  if (!estimate || !isValidBlendEstimate(estimate.centralEstimate)) {
    return emptyEligibility(method, {
      sourceKind: 'area_rate',
      propertySpecificity: 'area',
      transactionBasis: 'sold_statistics',
      rejectionReasons: ['missing_provenanced_area_or_rate'],
    });
  }
  return {
    method,
    methodFamily: 'TRANSACTION_STATISTICS',
    sourceKind: 'area_rate',
    propertySpecificity: 'area',
    transactionBasis: 'sold_statistics',
    eligibleForAssessment: true,
    canAssessAlone: false,
    limitations: [
      'rate_is_postcode_area_average',
      'transaction_period_not_in_parser_contract',
      'sample_size_not_in_parser_contract',
      'same_sold_price_dataset_as_sold_prices_statistics',
    ],
    rejectionReasons: [],
  };
}

function evaluateAskingListingEligibility() {
  return emptyEligibility('internal_sale_comparables', {
    sourceKind: 'asking_listing',
    propertySpecificity: 'unknown',
    transactionBasis: 'asking',
    limitations: ['asking_listings_are_not_sold_transactions'],
    rejectionReasons: ['asking_listings_cannot_assess_sale_value'],
  });
}

function evaluateComponentEligibility(component, context = {}) {
  if (!component) return emptyEligibility('unknown', { rejectionReasons: ['missing_component'] });
  if (isAskingListingMethod(component.method)) return evaluateAskingListingEligibility();
  if (component.method === 'valuation_sale_avm') {
    return evaluateAvmEligibility(component, context.property);
  }
  if (component.method === 'uprn_profile') {
    return evaluateUprnEstimateEligibility(component, context.property, context.uprnProfile);
  }
  if (component.method === 'sold_prices_statistics') {
    return evaluateSoldStatsEligibility({
      average: component.centralEstimate,
      sampleSize: component.sampleSize,
    });
  }
  if (component.method === 'sqft_implied') {
    return evaluateSqftImpliedEligibility(component);
  }
  return emptyEligibility(component.method, { rejectionReasons: ['unknown_method'] });
}

function decideAssessment(eligibilities = []) {
  const assessable = (eligibilities || []).filter((row) => row && row.eligibleForAssessment);
  const propertySpecific = assessable.filter((row) => row.canAssessAlone);
  if (propertySpecific.length) {
    return {
      assess: true,
      reason: 'property_specific_independent_method',
      families: [...new Set(assessable.map((row) => row.methodFamily))],
    };
  }
  const transactionFamilies = [
    ...new Set(
      assessable
        .filter((row) => row.transactionBasis === 'sold_statistics' || row.transactionBasis === 'sold_transaction')
        .map((row) => row.methodFamily)
    ),
  ];
  if (transactionFamilies.length >= 2) {
    return {
      assess: true,
      reason: 'independent_transaction_corroboration',
      families: transactionFamilies,
    };
  }
  return {
    assess: false,
    reason: 'insufficient_eligible_evidence',
    families: [...new Set(assessable.map((row) => row.methodFamily))],
  };
}

function selectAssessableComponents(components = [], eligibilities = []) {
  const byMethod = new Map(eligibilities.map((row) => [row.method, row]));
  const eligible = (components || []).filter((item) => byMethod.get(item.method)?.eligibleForAssessment);
  const grouped = new Map();
  eligible.forEach((item) => {
    const family = METHOD_FAMILY[item.method];
    if (!family) return;
    if (!grouped.has(family)) grouped.set(family, []);
    grouped.get(family).push(item);
  });

  const selected = [];
  grouped.forEach((items, family) => {
    const preference = FAMILY_PREFERENCE[family] || [];
    const chosen =
      preference.map((method) => items.find((item) => item.method === method)).find(Boolean) || items[0];
    if (chosen) selected.push(chosen);
  });
  return selected;
}

function transactionDedupeKeys(tx) {
  const address = String(tx.address || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  const keys = [`${tx.price}|${tx.sold_date || ''}|${address}`];
  if (tx.id && !String(tx.id).startsWith('pd-')) keys.push(`id:${tx.id}`);
  return keys;
}

function normaliseSoldTransaction(row, asOf = Date.now()) {
  const price = parsePositiveMoney(row?.price ?? row?.amount ?? row?.sold_price);
  if (!price) return null;
  const dated = classifyEvidenceDate(row.sold_date || row.date || row.transfer_date, asOf);
  const future = dated.state === 'invalid' && dated.reason === 'future';
  return {
    id: row.id || null,
    address: row.address || row.full_address || null,
    price,
    sold_date: dated.state === 'valid' ? row.sold_date || row.date || row.transfer_date : null,
    rawSoldDate: row.sold_date || row.date || row.transfer_date || null,
    dateState: dated.state,
    dateReason: dated.reason,
    property_type: row.property_type || row.type || null,
    bedrooms: row.bedrooms ?? null,
    square_feet: row.square_feet ?? null,
    distance_km: row.distance_km ?? row.distance ?? null,
    source: row.source || 'PropertyData',
    underlyingSource: row.underlyingSource || 'HM Land Registry',
    eligibleAsDatedEvidence: dated.state === 'valid',
    eligibleAsTransactionEvidence: !future,
    evidenceKind: 'sold_transaction',
  };
}

function prepareSoldTransactions(rows = [], asOf = Date.now()) {
  const normalised = (rows || []).map((row) => normaliseSoldTransaction(row, asOf)).filter(Boolean);
  const seen = new Set();
  const unique = [];
  normalised.forEach((tx) => {
    const keys = transactionDedupeKeys(tx);
    if (keys.some((key) => seen.has(key))) return;
    keys.forEach((key) => seen.add(key));
    unique.push(tx);
  });
  return {
    transactions: unique,
    validDatedCount: unique.filter((tx) => tx.eligibleAsDatedEvidence).length,
    futureRejectedCount: normalised.filter((tx) => tx.dateReason === 'future').length,
    duplicateDroppedCount: normalised.length - unique.length,
  };
}

function lastSoldFact(profile = {}, asOf = Date.now()) {
  const price = parsePositiveMoney(profile.lastSoldPrice);
  const dated = classifyEvidenceDate(profile.lastSoldDate, asOf);
  if (!price && dated.state === 'unknown') {
    return { available: false, price: null, date: null, state: 'notAssessed' };
  }
  if (dated.state === 'invalid' && dated.reason === 'future') {
    return {
      available: false,
      price,
      date: profile.lastSoldDate || null,
      state: 'invalid',
      reason: 'future_sold_date',
    };
  }
  if (price || dated.state === 'valid') {
    return {
      available: true,
      price,
      date: dated.state === 'valid' ? profile.lastSoldDate : null,
      dateState: dated.state,
      state: 'observed',
    };
  }
  return { available: false, price, date: null, state: 'notAssessed' };
}

module.exports = {
  METHOD_FAMILY,
  classifyEvidenceDate,
  canonicalPropertyTypeToken,
  typesAreExactMatch,
  evaluateAvmEligibility,
  evaluateUprnEstimateEligibility,
  evaluateSoldStatsEligibility,
  evaluateSqftImpliedEligibility,
  evaluateAskingListingEligibility,
  evaluateComponentEligibility,
  decideAssessment,
  selectAssessableComponents,
  normaliseSoldTransaction,
  prepareSoldTransactions,
  lastSoldFact,
  subjectPostcode,
  subjectUprn,
};
