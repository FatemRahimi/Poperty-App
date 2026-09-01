/**
 * Canonical landlord finance-input contract.
 *
 * Parses request-scoped user/scenario inputs into the existing financialEngine
 * annual/monthly keys. Does not calculate NOI/yield/DSCR. Does not invent
 * rates, terms, or costs. Listing tenancy deposit_amount is not mortgage deposit.
 */

const { FREQUENCY_TO_ANNUAL, CANONICAL_PERIOD } = require('./operatingCostEvidence');

const FINANCE_INPUT_VERSION = 'finance-input-1.0.0';

const FIELD_CONTRACT = Object.freeze({
  maintenance: Object.freeze({
    group: 'operatingCost',
    unit: 'gbp',
    implicitFrequency: 'annual',
    zeroValid: true,
  }),
  insurance: Object.freeze({
    group: 'operatingCost',
    unit: 'gbp',
    implicitFrequency: 'annual',
    zeroValid: true,
  }),
  managementFee: Object.freeze({
    group: 'operatingCost',
    unit: 'gbp',
    implicitFrequency: 'annual',
    zeroValid: true,
  }),
  taxes: Object.freeze({
    group: 'operatingCost',
    unit: 'gbp',
    implicitFrequency: 'annual',
    zeroValid: true,
    note: 'User-supplied landlord tax assumption. Not council tax and not a computed liability.',
  }),
  serviceCharge: Object.freeze({
    group: 'operatingCost',
    unit: 'gbp',
    implicitFrequency: 'annual',
    zeroValid: true,
    propertyFactPreferred: true,
    scenarioOverrideAllowed: true,
  }),
  groundRent: Object.freeze({
    group: 'operatingCost',
    unit: 'gbp',
    implicitFrequency: 'annual',
    zeroValid: true,
    propertyFactPreferred: true,
    scenarioOverrideAllowed: true,
  }),
  vacancyAssumption: Object.freeze({
    group: 'operatingCost',
    unit: 'percent',
    implicitFrequency: null,
    zeroValid: true,
  }),
  deposit: Object.freeze({
    group: 'finance',
    unit: 'gbp',
    implicitFrequency: null,
    zeroValid: true,
  }),
  mortgageAmount: Object.freeze({
    group: 'finance',
    unit: 'gbp',
    implicitFrequency: null,
    zeroValid: true,
  }),
  interestRate: Object.freeze({
    group: 'finance',
    unit: 'percent',
    implicitFrequency: null,
    zeroValid: true,
  }),
  mortgageTermYears: Object.freeze({
    group: 'finance',
    unit: 'years',
    implicitFrequency: null,
    zeroValid: false,
  }),
  purchasePrice: Object.freeze({
    group: 'property',
    unit: 'gbp',
    implicitFrequency: null,
    zeroValid: false,
  }),
  expectedRent: Object.freeze({
    group: 'income',
    unit: 'gbp',
    implicitFrequency: 'monthly',
    zeroValid: false,
    engineFrequency: 'monthly',
  }),
});

const ALIASES = Object.freeze({
  vacancy: 'vacancyAssumption',
  mortgageTerm: 'mortgageTermYears',
  termYears: 'mortgageTermYears',
  loanAmount: 'mortgageAmount',
  monthlyRent: 'expectedRent',
  rent: 'expectedRent',
});

/**
 * Documented frequency for a bare (flat) number. Not a guess: the field
 * contract already defined these implicit periods. Structured `{ value,
 * frequency }` always wins when frequency is present.
 *
 *   maintenance / insurance / managementFee / taxes / serviceCharge / groundRent
 *     → annual GBP
 *   expectedRent / monthlyRent / rent
 *     → monthly GBP
 *   vacancyAssumption / deposit / mortgageAmount / interestRate /
 *     mortgageTermYears / purchasePrice
 *     → no period
 */
const LEGACY_FLAT_FREQUENCY = Object.freeze({
  maintenance: 'annual',
  insurance: 'annual',
  managementFee: 'annual',
  taxes: 'annual',
  serviceCharge: 'annual',
  groundRent: 'annual',
  expectedRent: 'monthly',
  monthlyRent: 'monthly',
  rent: 'monthly',
});

const RECOGNISED_FREQUENCIES = Object.freeze(['weekly', 'monthly', 'annual']);

const INTERNAL_HTTP_KEYS = Object.freeze([
  'deps',
  'skipExplanation',
  'skipPostcodeMarket',
  'providerCallLog',
  'asOf',
  'skipValidation',
  'engine',
  'explainFn',
  'analyseRent',
  'calculatePropertyValuation',
  'generatePropertyExplanation',
  'testStubs',
  'providerConfig',
  'providerOptions',
  'skipFlood',
  'flood',
  'floodEvidence',
  'propertyFacts',
  'riskScore',
  'floodScore',
  'skipCache',
  'skipPlanning',
  'planning',
  'planningEvidence',
  'planningScore',
  'developmentScore',
  'skipSchools',
  'schools',
  'schoolEvidence',
  'schoolScore',
  'catchment',
  'educationScore',
  'skipListedBuilding',
  'listedBuilding',
  'listedBuildingEvidence',
  'listedBuildings',
  'listed',
  'heritageScore',
  'listedBuildingScore',
  'listedScore',
  'heritageRiskScore',
  'skipConservationArea',
  'conservationArea',
  'conservationAreaEvidence',
  'conservationEvidence',
  'conservationScore',
  'skipArticle4',
  'article4',
  'article4Evidence',
  'article4Direction',
  'article4Score',
  'article4Restrictions',
  'article4DirectionArea',
  'article4Areas',
  'article4Membership',
  'permittedDevelopmentRights',
  'permittedDevelopmentRight',
  'pdRights',
  'restrictionSchedule',
  'decisionIntelligence',
  'unresolvedDependencies',
  'investigationPriorities',
  'importance',
  'importanceScore',
  'evidenceRefs',
  'affects',
  'dependencyScore',
  'dependencyScores',
  'materialFindings',
  'materialFinding',
  'findingScore',
  'materialityScore',
  'effect',
  'findingImportance',
  'sensitivityDrivers',
  'sensitivityDriver',
  'sensitivityScore',
  'rankScore',
  'driverImportance',
  'directionality',
  'dependencyGraph',
  'explanation',
  'overview',
  'currentDriversSummary',
  'unresolvedSummary',
  'verificationSummary',
  'sensitivitySummary',
  'generatedExplanation',
  'llmInstructions',
  'systemPrompt',
  'systemPrompts',
]);

const NESTING_KEYS = Object.freeze(['finance', 'operatingCosts']);
const ALLOWED_ENTRY_KEYS = Object.freeze(['value', 'amount', 'frequency', 'period', 'unitPeriod']);

const ANALYSE_FINANCE_REQUEST_EXAMPLE = Object.freeze({
  finance: Object.freeze({
    purchasePrice: 185000,
    expectedRent: 1100,
    operatingCosts: Object.freeze({
      maintenance: Object.freeze({ value: 100, frequency: 'monthly' }),
      insurance: Object.freeze({ value: 600, frequency: 'annual' }),
      managementFee: Object.freeze({ value: 0, frequency: 'annual' }),
      taxes: Object.freeze({ value: 150, frequency: 'annual' }),
      vacancyAssumption: 0,
    }),
    deposit: 50000,
    interestRate: 5,
    mortgageTermYears: 25,
  }),
});

const OPERATING_COST_KEYS = Object.freeze([
  'maintenance',
  'insurance',
  'managementFee',
  'serviceCharge',
  'groundRent',
  'taxes',
  'vacancyAssumption',
]);

const FINANCE_KEYS = Object.freeze(['deposit', 'interestRate', 'mortgageTermYears']);

const METRIC_DEPENDENCIES = Object.freeze({
  grossYield: Object.freeze(['purchasePrice', 'expectedRent']),
  noi: Object.freeze([...OPERATING_COST_KEYS, 'expectedRent']),
  netYield: Object.freeze(['noi', 'purchasePrice']),
  annualCashFlow: Object.freeze(['noi', ...FINANCE_KEYS]),
  dscr: Object.freeze(['noi', ...FINANCE_KEYS]),
});

const NUMERIC_STATES = Object.freeze({
  MISSING: 'MISSING',
  EXPLICIT_ZERO: 'EXPLICIT_ZERO',
  POSITIVE_VALUE: 'POSITIVE_VALUE',
  INVALID: 'INVALID',
});

const FINANCE_SEMANTIC_VERSION = 'finance-semantic-1.0.0';

const RENT_BASIS = Object.freeze({
  LISTING: 'LISTING',
  MARKET: 'MARKET',
  SCENARIO: 'SCENARIO',
  NONE: 'NONE',
});

const FINANCING_KIND = Object.freeze({
  UNKNOWN: 'UNKNOWN',
  EXPLICIT_MORTGAGE: 'EXPLICIT_MORTGAGE',
  EXPLICIT_CASH: 'EXPLICIT_CASH',
  DERIVED_MORTGAGE: 'DERIVED_MORTGAGE',
  DERIVED_CASH: 'DERIVED_CASH',
});

/**
 * Distinguishes missing, explicit zero, positive numeric, and invalid.
 * Does not use truthiness. Empty string is missing, not zero and not invalid.
 */
function parseCanonicalNumber(value) {
  if (value === undefined || value === null || value === '') {
    return { state: NUMERIC_STATES.MISSING, value: null, raw: value };
  }
  if (typeof value === 'boolean' || Array.isArray(value) || (typeof value === 'object' && value !== null)) {
    return { state: NUMERIC_STATES.INVALID, value: null, raw: value, reason: 'not_finite' };
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return { state: NUMERIC_STATES.INVALID, value: null, raw: value, reason: 'not_finite' };
  }
  if (n === 0) {
    return { state: NUMERIC_STATES.EXPLICIT_ZERO, value: 0, raw: value };
  }
  if (n > 0) {
    return { state: NUMERIC_STATES.POSITIVE_VALUE, value: n, raw: value };
  }
  return { state: NUMERIC_STATES.INVALID, value: null, raw: value, reason: 'negative_not_accepted' };
}

function isNumericPresent(parsed) {
  return parsed?.state === NUMERIC_STATES.EXPLICIT_ZERO || parsed?.state === NUMERIC_STATES.POSITIVE_VALUE;
}

function finiteNumber(value) {
  return parseCanonicalNumber(value).value;
}

function classifyFinanceInputs(input = {}) {
  const keys = [
    'purchasePrice',
    'expectedRent',
    'annualRent',
    'vacancyAssumption',
    'maintenance',
    'insurance',
    'managementFee',
    'serviceCharge',
    'groundRent',
    'taxes',
    'otherExpenses',
    'deposit',
    'mortgageAmount',
    'interestRate',
    'mortgageTermYears',
    'renovationCost',
    'expectedAppreciation',
    'holdingPeriod',
  ];
  const fields = {};
  keys.forEach((key) => {
    fields[key] = parseCanonicalNumber(input[key]);
  });
  return fields;
}

function describeFinancingState(fields) {
  const mortgage = fields.mortgageAmount;
  const price = fields.purchasePrice;
  const deposit = fields.deposit;
  if (isNumericPresent(mortgage)) {
    return {
      kind: mortgage.value === 0 ? FINANCING_KIND.EXPLICIT_CASH : FINANCING_KIND.EXPLICIT_MORTGAGE,
      amount: mortgage.value,
      inferredCashFromOmission: false,
    };
  }
  if (price.state === NUMERIC_STATES.POSITIVE_VALUE && isNumericPresent(deposit)) {
    const derived = Math.max(0, price.value - deposit.value);
    return {
      kind: derived === 0 ? FINANCING_KIND.DERIVED_CASH : FINANCING_KIND.DERIVED_MORTGAGE,
      amount: derived,
      inferredCashFromOmission: false,
    };
  }
  return {
    kind: FINANCING_KIND.UNKNOWN,
    amount: null,
    inferredCashFromOmission: false,
  };
}

function operatingCostCompleteness(fields) {
  const missing = [];
  const invalid = [];
  OPERATING_COST_KEYS.forEach((key) => {
    const parsed = fields[key];
    if (parsed.state === NUMERIC_STATES.MISSING) missing.push(key);
    else if (parsed.state === NUMERIC_STATES.INVALID) invalid.push(key);
  });
  return {
    complete: missing.length === 0 && invalid.length === 0,
    missing,
    invalid,
  };
}

function financeInputCompleteness(fields) {
  const missing = [];
  const invalid = [];
  FINANCE_KEYS.forEach((key) => {
    const parsed = fields[key];
    if (parsed.state === NUMERIC_STATES.MISSING) missing.push(key);
    else if (parsed.state === NUMERIC_STATES.INVALID) invalid.push(key);
    else if (key === 'mortgageTermYears' && parsed.state === NUMERIC_STATES.EXPLICIT_ZERO) {
      invalid.push(key);
    }
  });
  return {
    complete: missing.length === 0 && invalid.length === 0,
    missing,
    invalid,
  };
}

function resolveAnnualRent(fields) {
  const monthly = fields.expectedRent;
  const annual = fields.annualRent;
  if (monthly.state === NUMERIC_STATES.POSITIVE_VALUE) {
    return { assessed: true, value: monthly.value * 12, basis: 'expectedRent', missingInputs: [] };
  }
  if (annual.state === NUMERIC_STATES.POSITIVE_VALUE) {
    return { assessed: true, value: annual.value, basis: 'annualRent', missingInputs: [] };
  }
  const missingInputs = [];
  if (monthly.state === NUMERIC_STATES.EXPLICIT_ZERO || annual.state === NUMERIC_STATES.EXPLICIT_ZERO) {
    missingInputs.push('expectedRent_zero_not_valid');
  } else if (monthly.state === NUMERIC_STATES.INVALID || annual.state === NUMERIC_STATES.INVALID) {
    missingInputs.push('expectedRent_invalid');
  } else {
    missingInputs.push('expectedRent');
  }
  return { assessed: false, value: null, basis: null, missingInputs };
}

function notAssessedMetric(missingInputs, reason) {
  return { state: 'notAssessed', missingInputs, reason };
}

function assessedMetric(extra = {}) {
  return { state: 'assessed', missingInputs: [], ...extra };
}

function assessFinanceMetrics(input = {}) {
  const fields = classifyFinanceInputs(input);
  const annualRent = resolveAnnualRent(fields);
  const price = fields.purchasePrice;
  const priceOk = price.state === NUMERIC_STATES.POSITIVE_VALUE;
  const costs = operatingCostCompleteness(fields);
  const finance = financeInputCompleteness(fields);
  const financing = describeFinancingState(fields);
  const vacancyPresent = isNumericPresent(fields.vacancyAssumption);
  const ratePresent = isNumericPresent(fields.interestRate);
  const termOk = fields.mortgageTermYears.state === NUMERIC_STATES.POSITIVE_VALUE;
  const cashPurchase =
    financing.kind === FINANCING_KIND.EXPLICIT_CASH || financing.kind === FINANCING_KIND.DERIVED_CASH;
  const mortgageKnown = financing.kind !== FINANCING_KIND.UNKNOWN;
  const debtServiceInputs = mortgageKnown && (cashPurchase || (ratePresent && termOk));

  const annualRentMetric = annualRent.assessed
    ? assessedMetric({ basis: annualRent.basis })
    : notAssessedMetric(annualRent.missingInputs, 'Annual rent requires a valid positive rent basis.');

  const vacancyAdjusted = annualRent.assessed && vacancyPresent
    ? assessedMetric()
    : notAssessedMetric(
        [
          ...(annualRent.assessed ? [] : annualRent.missingInputs),
          ...(vacancyPresent ? [] : ['vacancyAssumption']),
        ],
        vacancyPresent
          ? 'Vacancy-adjusted income requires a valid rent basis.'
          : 'Missing vacancy is not 0% occupancy.'
      );

  const operatingCosts = costs.complete
    ? assessedMetric({ completeness: 'COMPLETE_EVIDENCE' })
    : notAssessedMetric(
        [...costs.missing, ...costs.invalid],
        costs.invalid.length
          ? 'Operating costs include invalid values and are not treated as zero.'
          : 'Missing operating costs are not a £0 cost assumption. Partial evidence is not complete.'
      );

  const noi = annualRent.assessed && costs.complete
    ? assessedMetric()
    : notAssessedMetric(
        [
          ...(annualRent.assessed ? [] : annualRent.missingInputs),
          ...costs.missing,
          ...costs.invalid,
        ],
        'NOI requires a valid rent basis and complete operating-cost evidence.'
      );

  const grossYield = annualRent.assessed && priceOk
    ? assessedMetric()
    : notAssessedMetric(
        [
          ...(annualRent.assessed ? [] : annualRent.missingInputs),
          ...(priceOk ? [] : [price.state === NUMERIC_STATES.EXPLICIT_ZERO ? 'purchasePrice_zero_not_valid' : 'purchasePrice']),
        ],
        'Gross yield requires a valid purchase price and rent basis.'
      );

  const netYield = noi.state === 'assessed' && priceOk
    ? assessedMetric()
    : notAssessedMetric(
        [
          ...(noi.state === 'assessed' ? [] : noi.missingInputs),
          ...(priceOk ? [] : ['purchasePrice']),
        ],
        'Net yield requires assessed NOI and a valid purchase price.'
      );

  const mortgagePayment = debtServiceInputs
    ? assessedMetric({ financingKind: financing.kind })
    : notAssessedMetric(
        [
          ...(mortgageKnown ? [] : ['mortgageAmount']),
          ...(cashPurchase || ratePresent ? [] : ['interestRate']),
          ...(cashPurchase || termOk ? [] : ['mortgageTermYears']),
        ],
        'Missing mortgage amount is not a cash purchase. Missing rate or term is not a zero-cost loan.'
      );

  const cashFlow =
    noi.state === 'assessed' && finance.complete && mortgageKnown
      ? assessedMetric({ financingKind: financing.kind })
      : notAssessedMetric(
          [
            ...(noi.state === 'assessed' ? [] : noi.missingInputs),
            ...finance.missing,
            ...finance.invalid,
            ...(mortgageKnown ? [] : ['financing_state']),
          ],
          'Cash flow requires assessed NOI and an explicit financing state. Omitted mortgage fields are not a cash buyer.'
        );

  const dscr =
    noi.state === 'assessed' && finance.complete && mortgageKnown && !cashPurchase
      ? assessedMetric({ financingKind: financing.kind })
      : notAssessedMetric(
          [
            ...(noi.state === 'assessed' ? [] : noi.missingInputs),
            ...finance.missing,
            ...finance.invalid,
            ...(mortgageKnown ? [] : ['financing_state']),
            ...(cashPurchase ? ['no_debt_service'] : []),
          ],
          cashPurchase
            ? 'DSCR is not assessed for an explicit cash purchase — there is no debt service.'
            : 'DSCR requires assessed NOI and valid debt-service inputs.'
        );

  return {
    version: FINANCE_SEMANTIC_VERSION,
    fields,
    financing,
    annualRent: annualRentMetric,
    vacancyAdjustedIncome: vacancyAdjusted,
    operatingCosts,
    grossYield,
    noi,
    netYield,
    mortgagePayment,
    cashFlow,
    dscr,
    annualRentValue: annualRent.value,
    purchasePriceValue: priceOk ? price.value : null,
  };
}

function resolveRentBasis({
  listingMonthlyRent = null,
  marketRent = null,
  scenarioExpectedRent = null,
} = {}) {
  const listing = parseCanonicalNumber(listingMonthlyRent);
  const market = parseCanonicalNumber(marketRent);
  const scenario = parseCanonicalNumber(scenarioExpectedRent);
  const listingUsable = listing.state === NUMERIC_STATES.POSITIVE_VALUE;
  const marketUsable = market.state === NUMERIC_STATES.POSITIVE_VALUE;
  const scenarioUsable = scenario.state === NUMERIC_STATES.POSITIVE_VALUE;

  if (scenarioUsable) {
    return {
      kind: RENT_BASIS.SCENARIO,
      selectedRent: scenario.value,
      listingMonthlyRent: listingUsable ? listing.value : listing.state === NUMERIC_STATES.EXPLICIT_ZERO ? 0 : null,
      marketRent: marketUsable ? market.value : null,
      scenarioExpectedRent: scenario.value,
      marketSubstitutedForMissingListing: false,
      label: 'SCENARIO_RENT',
      expectedRentIsNotMarketRent: true,
      expectedRentIsNotListingRent: true,
    };
  }
  if (listingUsable) {
    return {
      kind: RENT_BASIS.LISTING,
      selectedRent: listing.value,
      listingMonthlyRent: listing.value,
      marketRent: marketUsable ? market.value : null,
      scenarioExpectedRent: null,
      marketSubstitutedForMissingListing: false,
      label: 'LISTING_RENT',
      expectedRentIsNotMarketRent: true,
      expectedRentIsNotListingRent: false,
    };
  }
  if (marketUsable) {
    return {
      kind: RENT_BASIS.MARKET,
      selectedRent: market.value,
      listingMonthlyRent: listing.state === NUMERIC_STATES.EXPLICIT_ZERO ? 0 : null,
      marketRent: market.value,
      scenarioExpectedRent: null,
      marketSubstitutedForMissingListing: true,
      label: 'MARKET_RENT',
      expectedRentIsNotMarketRent: false,
      expectedRentIsNotListingRent: true,
    };
  }
  return {
    kind: RENT_BASIS.NONE,
    selectedRent: null,
    listingMonthlyRent: listing.state === NUMERIC_STATES.EXPLICIT_ZERO ? 0 : null,
    marketRent: null,
    scenarioExpectedRent: null,
    marketSubstitutedForMissingListing: false,
    label: null,
    expectedRentIsNotMarketRent: true,
    expectedRentIsNotListingRent: true,
  };
}

function resolvePurchasePriceBasis({ listingAskingPrice = null, scenarioPurchasePrice = null } = {}) {
  const listing = parseCanonicalNumber(listingAskingPrice);
  const scenario = parseCanonicalNumber(scenarioPurchasePrice);
  if (scenario.state === NUMERIC_STATES.POSITIVE_VALUE) {
    return {
      kind: 'SCENARIO',
      selectedPrice: scenario.value,
      listingAskingPrice: listing.state === NUMERIC_STATES.POSITIVE_VALUE ? listing.value : null,
      scenarioPurchasePrice: scenario.value,
    };
  }
  if (listing.state === NUMERIC_STATES.POSITIVE_VALUE) {
    return {
      kind: 'LISTING',
      selectedPrice: listing.value,
      listingAskingPrice: listing.value,
      scenarioPurchasePrice: null,
    };
  }
  return {
    kind: 'NONE',
    selectedPrice: null,
    listingAskingPrice: listing.state === NUMERIC_STATES.EXPLICIT_ZERO ? 0 : null,
    scenarioPurchasePrice: null,
  };
}

function unwrapEntry(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return {
      value: raw.value ?? raw.amount ?? null,
      frequency: raw.frequency || raw.period || raw.unitPeriod || null,
      enteredAt: raw.enteredAt || raw.retrievedAt || null,
    };
  }
  return { value: raw, frequency: null, enteredAt: null };
}

function normaliseMoney(value, frequency, implicitFrequency, engineFrequency = CANONICAL_PERIOD) {
  const originalFrequency = frequency || implicitFrequency || null;
  if (!originalFrequency) {
    return { usable: false, reason: 'unknown_frequency', originalFrequency: null, normalisedValue: null };
  }
  if (engineFrequency === 'monthly') {
    if (originalFrequency === 'monthly') {
      return {
        usable: true,
        originalFrequency,
        normalisedValue: value,
        normalisedFrequency: 'monthly',
        conversionMethod: 'monthly_passthrough',
      };
    }
    if (originalFrequency === 'annual') {
      return {
        usable: true,
        originalFrequency,
        normalisedValue: value / 12,
        normalisedFrequency: 'monthly',
        conversionMethod: 'annual_div_12',
      };
    }
    if (originalFrequency === 'weekly') {
      return {
        usable: true,
        originalFrequency,
        normalisedValue: (value * 52) / 12,
        normalisedFrequency: 'monthly',
        conversionMethod: 'weekly_times_52_div_12',
      };
    }
    return { usable: false, reason: 'unknown_frequency', originalFrequency, normalisedValue: null };
  }
  const conversion = FREQUENCY_TO_ANNUAL[originalFrequency];
  if (!conversion) {
    return { usable: false, reason: 'unknown_frequency', originalFrequency, normalisedValue: null };
  }
  return {
    usable: true,
    originalFrequency,
    normalisedValue: value * conversion.multiplier,
    normalisedFrequency: CANONICAL_PERIOD,
    conversionMethod: conversion.method,
  };
}

function parseField(key, raw) {
  const spec = FIELD_CONTRACT[key];
  const missing = {
    key,
    available: false,
    value: null,
    state: 'notAssessed',
    sourceKind: 'unavailable',
    userSupplied: false,
    observed: false,
    calculated: false,
    defaulted: false,
    group: spec.group,
    unit: spec.unit,
  };
  if (raw === undefined || raw === null || raw === '') return missing;

  const entry = unwrapEntry(raw);
  const parsed = parseCanonicalNumber(entry.value);
  if (parsed.state === NUMERIC_STATES.MISSING) return missing;
  if (parsed.state === NUMERIC_STATES.INVALID) {
    return { ...missing, state: 'invalid', reason: parsed.reason || 'not_finite', invalid: true };
  }
  const originalValue = parsed.value;
  if (originalValue === 0 && spec.zeroValid === false) {
    return { ...missing, state: 'invalid', reason: 'zero_not_valid', invalid: true };
  }

  if (spec.unit === 'percent' && originalValue > 100) {
    return { ...missing, state: 'invalid', reason: 'percent_out_of_range' };
  }

  const field = {
    key,
    available: true,
    originalValue,
    originalFrequency: entry.frequency || spec.implicitFrequency || null,
    unit: spec.unit,
    group: spec.group,
    source: 'user_supplied',
    sourceKind: 'user_supplied',
    userSupplied: true,
    observed: false,
    calculated: false,
    defaulted: false,
    state: 'observed',
    enteredAt: entry.enteredAt || null,
    role: spec.propertyFactPreferred ? 'scenario_override' : 'user_scenario_input',
    note: spec.note || null,
  };

  if (spec.unit === 'gbp' && (spec.implicitFrequency || spec.engineFrequency === 'monthly')) {
    const normalised = normaliseMoney(
      originalValue,
      entry.frequency,
      spec.implicitFrequency,
      spec.engineFrequency || CANONICAL_PERIOD
    );
    if (!normalised.usable) {
      return {
        ...field,
        available: false,
        financiallyUsable: false,
        excluded: true,
        reason: normalised.reason,
        state: 'notAssessed',
        normalisedValue: null,
      };
    }
    field.originalFrequency = normalised.originalFrequency;
    field.normalisedValue = normalised.normalisedValue;
    field.normalisedFrequency = normalised.normalisedFrequency;
    field.conversionMethod = normalised.conversionMethod;
    field.financiallyUsable = true;
    field.value = normalised.normalisedValue;
  } else {
    field.normalisedValue = originalValue;
    field.normalisedFrequency = spec.unit === 'percent' || spec.unit === 'years' ? spec.unit : null;
    field.conversionMethod = 'passthrough';
    field.financiallyUsable = true;
    field.value = originalValue;
  }

  return field;
}

function collectRawPayload(source = {}) {
  const nested = source.finance && typeof source.finance === 'object' ? source.finance : {};
  const operatingCosts =
    nested.operatingCosts && typeof nested.operatingCosts === 'object'
      ? nested.operatingCosts
      : source.operatingCosts && typeof source.operatingCosts === 'object'
        ? source.operatingCosts
        : {};
  return { ...source, ...nested, ...operatingCosts };
}

function parseFinancePayload(source = {}) {
  const raw = collectRawPayload(source);
  const fields = {};
  const engineInputs = {};
  const provenanceHints = {};
  const scenarioOverrides = {};

  Object.keys(FIELD_CONTRACT).forEach((key) => {
    let candidate = raw[key];
    if (candidate === undefined) {
      const alias = Object.keys(ALIASES).find((a) => ALIASES[a] === key && raw[a] !== undefined);
      if (alias) candidate = raw[alias];
    }
    // Never treat listing tenancy deposit as mortgage deposit.
    if (key === 'deposit' && candidate === undefined && raw.deposit_amount !== undefined) {
      fields[key] = parseField(key, undefined);
      fields[key].note = 'Listing deposit_amount is a tenancy deposit and is not used as mortgage deposit.';
      return;
    }
    const parsed = parseField(key, candidate);
    fields[key] = parsed;
    if (parsed.financiallyUsable) {
      engineInputs[key] = parsed.value;
      provenanceHints[key] = 'user_supplied';
      if (FIELD_CONTRACT[key].scenarioOverrideAllowed) scenarioOverrides[key] = true;
    }
  });

  return {
    version: FINANCE_INPUT_VERSION,
    sourceKind: 'user_supplied',
    role: 'scenario_input',
    notMarketEvidence: true,
    notPropertyFact: true,
    notAchievedOutcome: true,
    fields,
    engineInputs,
    provenanceHints,
    scenarioOverrides,
    councilTaxMappedToTaxes: false,
    listingDepositUsedAsMortgageDeposit: false,
    mortgageTypeSupported: false,
    persistence: 'request_scoped',
  };
}

function publicFinanceInputsForExplanation(contract) {
  if (!contract) return null;
  const supplied = Object.entries(contract.fields || {})
    .filter(([, field]) => field.available)
    .map(([key, field]) => ({
      key,
      value: field.originalValue,
      normalisedValue: field.normalisedValue,
      frequency: field.originalFrequency,
      sourceKind: field.sourceKind,
      role: field.role,
    }));
  const missing = Object.entries(contract.fields || {})
    .filter(([, field]) => !field.available)
    .map(([key]) => key);
  return {
    version: contract.version,
    sourceKind: 'user_supplied',
    analysisKind: supplied.length ? 'user_scenario' : 'listing_evidence',
    expectedRentIsNotMarketRent: true,
    scenarioIsNotObservedResult: true,
    supplied,
    missing,
    scenarioOverrides: contract.scenarioOverrides,
  };
}

function attachFinanceInputsToDecisionContext(decisionContext, financeInputs) {
  if (!decisionContext) return decisionContext;
  return {
    ...decisionContext,
    financeInputs: {
      role: 'scenario_input',
      scoringActivated: false,
      sourceKind: 'user_supplied',
      note: 'User finance/cost inputs are scenario assumptions, not market evidence. They do not change landlord weights or demand.',
      public: publicFinanceInputsForExplanation(financeInputs),
    },
  };
}

function isCanonicalOrAliasKey(key) {
  return Object.prototype.hasOwnProperty.call(FIELD_CONTRACT, key)
    || Object.prototype.hasOwnProperty.call(ALIASES, key);
}

function isAllowedRequestKey(key) {
  return NESTING_KEYS.includes(key) || isCanonicalOrAliasKey(key);
}

function fieldError(field, reason, detail) {
  const error = { field, reason };
  if (detail != null && detail !== '') error.detail = detail;
  return error;
}

function validateSemantic(key, spec, n, path) {
  if (n < 0) return fieldError(path, 'negative_not_accepted');
  if (n === 0 && spec.zeroValid === false) return fieldError(path, 'zero_not_valid');
  if (spec.unit === 'percent' && n > 100) return fieldError(path, 'percent_out_of_range');
  if (spec.unit === 'years' && !(n > 0)) return fieldError(path, 'term_not_positive');
  return null;
}

function validateSubmittedField(key, raw, path) {
  const spec = FIELD_CONTRACT[key];
  if (Array.isArray(raw) || typeof raw === 'boolean') {
    return { error: fieldError(path, 'malformed_value') };
  }
  if (raw && typeof raw === 'object') {
    const extra = Object.keys(raw).filter((k) => !ALLOWED_ENTRY_KEYS.includes(k));
    if (extra.length) {
      return { error: fieldError(path, 'unknown_field', extra.join(',')) };
    }
    const hasValue =
      Object.prototype.hasOwnProperty.call(raw, 'value')
      || Object.prototype.hasOwnProperty.call(raw, 'amount');
    if (!hasValue) {
      return { error: fieldError(path, 'malformed_object', 'missing value') };
    }
    const valueRaw = raw.value ?? raw.amount;
    if (valueRaw === undefined || valueRaw === null || valueRaw === '') {
      return { error: fieldError(path, 'malformed_value') };
    }
    const n = Number(valueRaw);
    if (!Number.isFinite(n)) {
      return { error: fieldError(path, 'not_finite') };
    }
    const frequency = raw.frequency || raw.period || raw.unitPeriod || null;
    const moneyPeriod = spec.unit === 'gbp' && (spec.implicitFrequency || spec.engineFrequency === 'monthly');
    if (moneyPeriod) {
      if (frequency != null && frequency !== '' && !RECOGNISED_FREQUENCIES.includes(frequency)) {
        return { error: fieldError(path, 'unknown_frequency', String(frequency)) };
      }
    } else if (frequency != null && frequency !== '') {
      return { error: fieldError(path, 'frequency_not_applicable') };
    }
    const semantic = validateSemantic(key, spec, n, path);
    if (semantic) return { error: semantic };
    const entry = { value: n };
    if (frequency) entry.frequency = frequency;
    return {
      value: entry,
      originalValue: n,
      frequency: frequency || spec.implicitFrequency || null,
      shape: 'structured',
    };
  }
  if (raw === '') {
    return { skip: true };
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    return { error: fieldError(path, 'not_finite') };
  }
  const semantic = validateSemantic(key, spec, n, path);
  if (semantic) return { error: semantic };
  return {
    value: n,
    originalValue: n,
    frequency: spec.implicitFrequency || LEGACY_FLAT_FREQUENCY[key] || null,
    shape: 'scalar',
  };
}

function collectUnknownKeyErrors(body, errors) {
  Object.keys(body).forEach((key) => {
    if (INTERNAL_HTTP_KEYS.includes(key)) {
      errors.push(fieldError(key, 'internal_option_not_allowed'));
      return;
    }
    if (!isAllowedRequestKey(key)) {
      errors.push(fieldError(key, 'unknown_field'));
    }
  });
  if (body.finance != null) {
    if (typeof body.finance !== 'object' || Array.isArray(body.finance)) {
      errors.push(fieldError('finance', 'malformed_object'));
    } else {
      Object.keys(body.finance).forEach((key) => {
        if (key !== 'operatingCosts' && !isCanonicalOrAliasKey(key)) {
          errors.push(fieldError(`finance.${key}`, 'unknown_field'));
        }
      });
      if (body.finance.operatingCosts != null) {
        if (
          typeof body.finance.operatingCosts !== 'object'
          || Array.isArray(body.finance.operatingCosts)
        ) {
          errors.push(fieldError('finance.operatingCosts', 'malformed_object'));
        } else {
          Object.keys(body.finance.operatingCosts).forEach((key) => {
            if (!isCanonicalOrAliasKey(key)) {
              errors.push(fieldError(`finance.operatingCosts.${key}`, 'unknown_field'));
            }
          });
        }
      }
    }
  }
  if (body.operatingCosts != null) {
    if (typeof body.operatingCosts !== 'object' || Array.isArray(body.operatingCosts)) {
      errors.push(fieldError('operatingCosts', 'malformed_object'));
    } else {
      Object.keys(body.operatingCosts).forEach((key) => {
        if (!isCanonicalOrAliasKey(key)) {
          errors.push(fieldError(`operatingCosts.${key}`, 'unknown_field'));
        }
      });
    }
  }
}

function pickRecognisedFinanceKeys(source = {}) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {};
  const raw = collectRawPayload(source);
  const out = {};
  Object.keys(FIELD_CONTRACT).forEach((key) => {
    if (raw[key] !== undefined) {
      out[key] = raw[key];
      return;
    }
    const alias = Object.keys(ALIASES).find((a) => ALIASES[a] === key && raw[a] !== undefined);
    if (alias) out[key] = raw[alias];
  });
  return out;
}

function parseAnalyseFinanceRequest(body) {
  if (body == null || body === '') {
    return {
      ok: true,
      errors: [],
      options: {},
      snapshot: {
        version: FINANCE_INPUT_VERSION,
        sourceKind: 'user_supplied',
        role: 'scenario_input',
        persistence: 'request_scoped',
        notPropertyTruth: true,
        notUserFinanceProfile: true,
        notListingAttribute: true,
        submitted: {},
        options: {},
      },
    };
  }
  if (typeof body !== 'object' || Array.isArray(body)) {
    return {
      ok: false,
      errors: [fieldError('body', 'malformed_request')],
      options: {},
      snapshot: null,
    };
  }

  const errors = [];
  collectUnknownKeyErrors(body, errors);

  const raw = collectRawPayload(body);
  const sanitized = {};
  const submitted = {};

  Object.keys(FIELD_CONTRACT).forEach((key) => {
    let candidate = raw[key];
    let aliasUsed = null;
    if (candidate === undefined) {
      const alias = Object.keys(ALIASES).find((a) => ALIASES[a] === key && raw[a] !== undefined);
      if (alias) {
        candidate = raw[alias];
        aliasUsed = alias;
      }
    }
    if (candidate === undefined) return;
    const path = aliasUsed
      ? aliasUsed
      : key;
    const validated = validateSubmittedField(key, candidate, path);
    if (validated.skip) return;
    if (validated.error) {
      errors.push(validated.error);
      return;
    }
    sanitized[key] = validated.value;
    submitted[key] = {
      value: validated.originalValue,
      frequency: validated.frequency,
      alias: aliasUsed,
      shape: validated.shape,
      sourceKind: 'user_supplied',
    };
  });

  if (errors.length) {
    return { ok: false, errors, options: {}, snapshot: null };
  }

  return {
    ok: true,
    errors: [],
    options: sanitized,
    snapshot: {
      version: FINANCE_INPUT_VERSION,
      sourceKind: 'user_supplied',
      role: 'scenario_input',
      persistence: 'request_scoped',
      notPropertyTruth: true,
      notUserFinanceProfile: true,
      notListingAttribute: true,
      submitted,
      options: sanitized,
    },
  };
}

function invalidFinanceHttpResponse(errors) {
  return {
    success: false,
    code: 'INVALID_FINANCE_INPUT',
    message: 'Finance inputs are invalid.',
    errors,
  };
}

function publicFactSlice(fact) {
  if (!fact) return null;
  return {
    value: fact.value ?? null,
    state: fact.state || null,
    frequency: fact.frequency || fact.period || null,
    source: fact.source || null,
    trust: fact.trust || null,
    listingField: fact.listingField || null,
    financiallyUsable: fact.financiallyUsable ?? null,
  };
}

function buildFinanceRequestTransparency({
  contract,
  presented = null,
  submitted = null,
  listingAskingPrice = null,
  listingMonthlyRent = null,
  marketRent = null,
  propertyFacts = null,
  calculationInput = null,
} = {}) {
  const fields = contract?.fields || {};
  const received = Object.entries(submitted || {})
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => {
      if (value && typeof value === 'object' && !Array.isArray(value) && value.value != null && value.sourceKind) {
        return {
          key,
          value: value.value,
          frequency: value.frequency || null,
          sourceKind: 'user_supplied',
        };
      }
      if (value && typeof value === 'object' && !Array.isArray(value) && (value.value != null || value.amount != null)) {
        return {
          key,
          value: value.value ?? value.amount,
          frequency: value.frequency || value.period || null,
          sourceKind: 'user_supplied',
        };
      }
      return { key, value, frequency: LEGACY_FLAT_FREQUENCY[key] || null, sourceKind: 'user_supplied' };
    });
  const used = Object.entries(fields)
    .filter(([, field]) => field.financiallyUsable)
    .map(([key, field]) => ({
      key,
      value: field.value,
      originalValue: field.originalValue,
      frequency: field.originalFrequency,
      normalisedFrequency: field.normalisedFrequency,
      conversionMethod: field.conversionMethod,
      sourceKind: 'user_supplied',
      role: field.role,
    }));
  const missing = Object.entries(fields)
    .filter(([, field]) => !field.available && field.state !== 'invalid')
    .map(([key, field]) => ({
      key,
      state: field.state || 'notAssessed',
      reason: field.reason || 'missing',
    }));
  const invalid = Object.entries(fields)
    .filter(([, field]) => field.state === 'invalid')
    .map(([key, field]) => ({
      key,
      state: 'invalid',
      reason: field.reason || 'invalid',
    }));
  const facts = propertyFacts?.facts || {};
  const costEvidence = presented?.costEvidence || null;
  const financeEvidence = presented?.financeEvidence || null;
  const applicationDefaults = [
    ...(costEvidence?.costs || []),
    ...(financeEvidence?.inputs || []),
  ]
    .filter((row) => row.defaulted)
    .map((row) => ({
      key: row.key,
      sourceKind: 'application_default',
      userSupplied: false,
      value: row.value,
    }));
  const metrics = {};
  ['grossYield', 'noi', 'netYield', 'annualCashFlow', 'monthlyCashFlow', 'dscr'].forEach((key) => {
    const metric = presented?.[key];
    if (!metric) return;
    metrics[key] = metric.available
      ? { state: 'assessed', value: metric.value }
      : { state: 'notAssessed', reason: metric.reason };
  });

  return {
    version: contract?.version || FINANCE_INPUT_VERSION,
    received,
    used,
    missing,
    invalid,
    missingRequired: {
      operatingCosts: costEvidence?.missing || [],
      finance: financeEvidence?.missing || [],
    },
    operatingCostCompleteness: costEvidence?.completeness || null,
    financeCompleteness: financeEvidence?.completeness || null,
    metrics,
    applicationDefaultsAreNotUserInputs: true,
    applicationDefaults,
    serviceCharge: {
      propertyFact: publicFactSlice(facts.serviceCharge),
      scenarioInput: fields.serviceCharge?.userSupplied
        ? {
            value: fields.serviceCharge.originalValue,
            frequency: fields.serviceCharge.originalFrequency,
            sourceKind: 'user_supplied',
            role: 'scenario_override',
          }
        : null,
      calculationSelectedValue: calculationInput?.serviceCharge ?? null,
      scenarioOverridesPropertyFact: Boolean(contract?.scenarioOverrides?.serviceCharge),
    },
    groundRent: {
      propertyFact: publicFactSlice(facts.groundRent),
      scenarioInput: fields.groundRent?.userSupplied
        ? {
            value: fields.groundRent.originalValue,
            frequency: fields.groundRent.originalFrequency,
            sourceKind: 'user_supplied',
            role: 'scenario_override',
          }
        : null,
      calculationSelectedValue: calculationInput?.groundRent ?? null,
      scenarioOverridesPropertyFact: Boolean(contract?.scenarioOverrides?.groundRent),
    },
    expectedRent: {
      label: 'user_supplied_scenario_input',
      isNotMarketRent: true,
      isNotRecommendedRent: true,
      isNotAchievedRent: true,
      isNotPropertyDataRentEvidence: true,
      scenarioInput: fields.expectedRent?.available ? fields.expectedRent.originalValue : null,
      listingMonthlyRent: listingMonthlyRent,
      marketRentEvidence: marketRent,
      calculationSelectedValue: calculationInput?.expectedRent ?? null,
    },
    purchasePrice: {
      listingAskingPrice,
      scenarioPurchasePrice: fields.purchasePrice?.available ? fields.purchasePrice.value : null,
      calculationSelectedValue: calculationInput?.purchasePrice ?? null,
      scenarioIsNotListingAsking:
        Boolean(fields.purchasePrice?.available)
        && listingAskingPrice != null
        && Number(fields.purchasePrice.value) !== Number(listingAskingPrice),
      scenarioIsNotAchievedPrice: true,
      listingAskingNotOverwritten: true,
    },
  };
}

module.exports = {
  FINANCE_INPUT_VERSION,
  FINANCE_SEMANTIC_VERSION,
  FIELD_CONTRACT,
  ALIASES,
  LEGACY_FLAT_FREQUENCY,
  RECOGNISED_FREQUENCIES,
  OPERATING_COST_KEYS,
  FINANCE_KEYS,
  METRIC_DEPENDENCIES,
  NUMERIC_STATES,
  RENT_BASIS,
  FINANCING_KIND,
  ANALYSE_FINANCE_REQUEST_EXAMPLE,
  parseCanonicalNumber,
  isNumericPresent,
  classifyFinanceInputs,
  assessFinanceMetrics,
  resolveRentBasis,
  resolvePurchasePriceBasis,
  parseFinancePayload,
  parseField,
  parseAnalyseFinanceRequest,
  pickRecognisedFinanceKeys,
  invalidFinanceHttpResponse,
  publicFinanceInputsForExplanation,
  attachFinanceInputsToDecisionContext,
  buildFinanceRequestTransparency,
};
