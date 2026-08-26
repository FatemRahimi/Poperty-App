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

function finiteNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
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
  const originalValue = finiteNumber(entry.value);
  if (originalValue == null) return missing;
  if (originalValue < 0) {
    return { ...missing, state: 'invalid', reason: 'negative_not_accepted' };
  }
  if (originalValue === 0 && spec.zeroValid === false) return missing;

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
    .filter(([, field]) => !field.available)
    .map(([key, field]) => ({
      key,
      state: field.state || 'notAssessed',
      reason: field.reason || 'missing',
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
  FIELD_CONTRACT,
  ALIASES,
  LEGACY_FLAT_FREQUENCY,
  RECOGNISED_FREQUENCIES,
  OPERATING_COST_KEYS,
  FINANCE_KEYS,
  METRIC_DEPENDENCIES,
  ANALYSE_FINANCE_REQUEST_EXAMPLE,
  parseFinancePayload,
  parseField,
  parseAnalyseFinanceRequest,
  pickRecognisedFinanceKeys,
  invalidFinanceHttpResponse,
  publicFinanceInputsForExplanation,
  attachFinanceInputsToDecisionContext,
  buildFinanceRequestTransparency,
};
