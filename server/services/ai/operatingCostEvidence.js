/**
 * Maps canonical propertyFacts operating costs onto the existing
 * financialEngine annual-input contract. Does not calculate NOI/yield.
 * Does not invent frequency, council-tax responsibility, or missing costs.
 */

const CANONICAL_PERIOD = 'annual';

const FREQUENCY_TO_ANNUAL = Object.freeze({
  annual: Object.freeze({ multiplier: 1, method: 'annual_passthrough' }),
  monthly: Object.freeze({ multiplier: 12, method: 'monthly_times_12' }),
  weekly: Object.freeze({ multiplier: 52, method: 'weekly_times_52' }),
});

const HINT_FROM_TRUST = Object.freeze({
  userSupplied: 'user_supplied',
  observed: 'property_data',
  conflictingEvidence: 'property_data',
});

function finiteNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function factRef(fact) {
  if (!fact) return null;
  return {
    field: fact.field || null,
    listingField: fact.listingField || null,
    source: fact.source || null,
    provider: fact.provider || null,
    trust: fact.trust || null,
    state: fact.state || null,
    provenance: fact.provenance || null,
  };
}

function financiallyUsableFact(fact) {
  if (!fact || fact.available !== true) return false;
  if (fact.scope === 'area' || fact.trust === 'areaContext') return false;
  if (fact.trust === 'estimated' || fact.trust === 'notAssessed') return false;
  const value = finiteNumber(fact.value);
  if (value == null || value < 0) return false;
  return true;
}

function describeMissing(key, fact) {
  return {
    key,
    included: false,
    missing: true,
    excluded: false,
    financiallyUsable: false,
    reason: 'notAssessed',
    originalValue: null,
    originalFrequency: fact?.originalFrequency || null,
    normalisedValue: null,
    normalisedFrequency: CANONICAL_PERIOD,
    conversionMethod: null,
    source: fact?.source || null,
    trust: fact?.trust || 'notAssessed',
    fact: factRef(fact),
  };
}

function normaliseCost(key, fact) {
  if (!financiallyUsableFact(fact)) return describeMissing(key, fact);

  const originalValue = finiteNumber(fact.value);
  const originalFrequency = fact.originalFrequency || null;
  const conversion = FREQUENCY_TO_ANNUAL[originalFrequency] || null;
  const base = {
    key,
    originalValue,
    originalFrequency,
    normalisedFrequency: CANONICAL_PERIOD,
    source: fact.source || 'InternalListing',
    trust: fact.trust || null,
    fact: factRef(fact),
  };

  if (!conversion) {
    return {
      ...base,
      included: false,
      missing: false,
      excluded: true,
      financiallyUsable: false,
      reason: 'unknown_frequency',
      normalisedValue: null,
      conversionMethod: null,
      note: 'Value is known but excluded from arithmetic because frequency cannot be determined safely.',
    };
  }

  return {
    ...base,
    included: true,
    missing: false,
    excluded: false,
    financiallyUsable: true,
    reason: null,
    normalisedValue: originalValue * conversion.multiplier,
    conversionMethod: conversion.method,
    hint: HINT_FROM_TRUST[fact.trust] || 'property_data',
  };
}

function councilTaxTreatment(propertyFacts) {
  const amount = propertyFacts?.facts?.councilTaxAmount || null;
  const band = propertyFacts?.facts?.councilTaxBand || null;
  return {
    treatedAsLandlordOperatingCost: false,
    mappedToTaxesInput: false,
    reason:
      'Council tax responsibility depends on occupancy/tenancy and is not assumed to be a landlord operating cost.',
    amount: amount?.value ?? null,
    band: band?.value ?? null,
    usedAsFinancialInput: false,
  };
}

function financialCostsFromPropertyFacts(propertyFacts) {
  const serviceCharge = normaliseCost('serviceCharge', propertyFacts?.facts?.serviceCharge);
  const groundRent = normaliseCost('groundRent', propertyFacts?.facts?.groundRent);
  const councilTax = councilTaxTreatment(propertyFacts);

  const inputs = {};
  const hints = {};
  if (serviceCharge.included) {
    inputs.serviceCharge = serviceCharge.normalisedValue;
    hints.serviceCharge = serviceCharge.hint;
  }
  if (groundRent.included) {
    inputs.groundRent = groundRent.normalisedValue;
    hints.groundRent = groundRent.hint;
  }

  const items = [serviceCharge, groundRent];
  return {
    source: 'propertyFacts',
    period: CANONICAL_PERIOD,
    inputs,
    hints,
    items,
    included: items.filter((item) => item.included),
    missing: items.filter((item) => item.missing),
    excluded: items.filter((item) => item.excluded),
    councilTax,
    evidence: {
      source: 'propertyFacts',
      period: CANONICAL_PERIOD,
      serviceCharge,
      groundRent,
      councilTax,
      included: items.filter((item) => item.included),
      missing: items.filter((item) => item.missing),
      excluded: items.filter((item) => item.excluded),
      formulaEngine: 'financialEngine.calculateInvestmentMetrics',
      formulaUnchanged: true,
    },
  };
}

module.exports = {
  CANONICAL_PERIOD,
  FREQUENCY_TO_ANNUAL,
  financialCostsFromPropertyFacts,
  financiallyUsableFact,
};
