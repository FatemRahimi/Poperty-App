/**
 * Project cost evidence contracts.
 * Foundation only. Does not estimate, escalate, or assess viability.
 *
 * USER_BUDGET != PROJECT_COST
 * QUOTE != ACTUAL_COST
 * BENCHMARK != PROPERTY FACT
 * £/sqm != TOTAL £
 * MISSING != 0
 */

const { UNIT, assertCompatibleUnits } = require('./units');
const { SOURCE_TYPE, VISIBILITY, EVIDENCE_CLASS } = require('./evidenceContract');
const { KERNEL_ASSESSMENT } = require('./assessmentStates');
const { ASSET_CLASS } = require('./assetClassification');
const { assertEvidenceVisibility, markPrivate } = require('./privacyBoundary');
const { PROJECT_COST_CONTRACT_VERSION } = require('./versions');

const COST_KIND = Object.freeze({
  ACTUAL_COST: 'ACTUAL_COST',
  SUPPLIER_QUOTE: 'SUPPLIER_QUOTE',
  CONTRACTOR_QUOTE: 'CONTRACTOR_QUOTE',
  PROFESSIONAL_QUOTE: 'PROFESSIONAL_QUOTE',
  BENCHMARK: 'BENCHMARK',
  USER_BUDGET: 'USER_BUDGET',
  USER_ESTIMATE: 'USER_ESTIMATE',
  ASSUMPTION: 'ASSUMPTION',
  SCENARIO: 'SCENARIO',
  CALCULATED: 'CALCULATED',
  UNKNOWN: 'UNKNOWN',
});

const COST_CATEGORY = Object.freeze({
  CONSTRUCTION: 'CONSTRUCTION',
  DEMOLITION: 'DEMOLITION',
  STRUCTURAL: 'STRUCTURAL',
  ENVELOPE: 'ENVELOPE',
  INTERNAL: 'INTERNAL',
  MEP: 'MEP',
  SITE_WORKS: 'SITE_WORKS',
  EXTERNAL_WORKS: 'EXTERNAL_WORKS',
  PROFESSIONAL_FEES: 'PROFESSIONAL_FEES',
  STATUTORY_FEES: 'STATUTORY_FEES',
  SURVEYS: 'SURVEYS',
  TEMPORARY_WORKS: 'TEMPORARY_WORKS',
  PRELIMINARIES: 'PRELIMINARIES',
  CONTINGENCY: 'CONTINGENCY',
  FINANCE_RELATED: 'FINANCE_RELATED',
  TAX: 'TAX',
  OTHER: 'OTHER',
  UNKNOWN: 'UNKNOWN',
});

const COST_UNIT = Object.freeze({
  GBP_TOTAL: 'GBP_TOTAL',
  GBP_PER_SQM: UNIT.GBP_PER_SQM,
  GBP_PER_SQFT: UNIT.GBP_PER_SQFT,
  GBP_PER_UNIT: UNIT.GBP_PER_UNIT,
  GBP_PER_ITEM: UNIT.GBP_PER_ITEM,
  GBP_PER_DAY: UNIT.GBP_PER_DAY,
  GBP_PER_WEEK: UNIT.GBP_PER_WEEK,
  PERCENT: UNIT.PERCENT,
  QUANTITY: 'QUANTITY',
  GBP: UNIT.GBP,
});

const TAX_TREATMENT = Object.freeze({
  INCLUDED: 'INCLUDED',
  EXCLUDED: 'EXCLUDED',
  UNKNOWN: 'UNKNOWN',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
});

const COST_COMPLETENESS = Object.freeze({
  COMPLETE_FOR_DECLARED_SCOPE: 'COMPLETE_FOR_DECLARED_SCOPE',
  PARTIAL: 'PARTIAL',
  UNKNOWN: 'UNKNOWN',
  NOT_ASSESSED: 'NOT_ASSESSED',
});

const COST_SOURCE_TYPE = Object.freeze({
  PROFESSIONAL_QUOTE: 'PROFESSIONAL_QUOTE',
  CONTRACTOR_QUOTE: 'CONTRACTOR_QUOTE',
  SUPPLIER_QUOTE: 'SUPPLIER_QUOTE',
  ACTUAL_INVOICE: 'ACTUAL_INVOICE',
  FIRST_PARTY: SOURCE_TYPE.FIRST_PARTY,
  USER_REPORTED: SOURCE_TYPE.USER_REPORTED,
  LICENSED_PROVIDER: SOURCE_TYPE.LICENSED_PROVIDER,
  OFFICIAL: SOURCE_TYPE.OFFICIAL,
  BENCHMARK_SOURCE: 'BENCHMARK_SOURCE',
  DERIVED: SOURCE_TYPE.DERIVED,
  MODEL_ASSISTED: SOURCE_TYPE.MODEL_ASSISTED,
});

const QUOTE_KINDS = Object.freeze([
  COST_KIND.SUPPLIER_QUOTE,
  COST_KIND.CONTRACTOR_QUOTE,
  COST_KIND.PROFESSIONAL_QUOTE,
]);

const TOTAL_UNITS = new Set([COST_UNIT.GBP_TOTAL, COST_UNIT.GBP]);
const RATE_UNITS = new Set([
  COST_UNIT.GBP_PER_SQM,
  COST_UNIT.GBP_PER_SQFT,
  COST_UNIT.GBP_PER_UNIT,
  COST_UNIT.GBP_PER_ITEM,
  COST_UNIT.GBP_PER_DAY,
  COST_UNIT.GBP_PER_WEEK,
]);

const RATE_QUANTITY_UNIT = Object.freeze({
  [COST_UNIT.GBP_PER_SQM]: UNIT.SQM,
  [COST_UNIT.GBP_PER_SQFT]: UNIT.SQFT,
  [COST_UNIT.GBP_PER_ITEM]: COST_UNIT.QUANTITY,
  [COST_UNIT.GBP_PER_UNIT]: COST_UNIT.QUANTITY,
  [COST_UNIT.GBP_PER_DAY]: UNIT.DAYS,
  [COST_UNIT.GBP_PER_WEEK]: 'WEEKS',
});

const KIND_FACT_TYPE = Object.freeze({
  [COST_KIND.ACTUAL_COST]: 'actualProjectCost',
  [COST_KIND.SUPPLIER_QUOTE]: 'supplierQuote',
  [COST_KIND.CONTRACTOR_QUOTE]: 'contractorQuote',
  [COST_KIND.PROFESSIONAL_QUOTE]: 'projectQuote',
  [COST_KIND.USER_BUDGET]: 'projectBudget',
  [COST_KIND.USER_ESTIMATE]: 'projectBudget',
  [COST_KIND.ASSUMPTION]: 'costAssumption',
  [COST_KIND.SCENARIO]: 'costScenario',
  [COST_KIND.BENCHMARK]: 'projectQuote',
  [COST_KIND.CALCULATED]: 'costAssumption',
  [COST_KIND.UNKNOWN]: 'costAssumption',
});

function parseCostNumber(value) {
  if (value === undefined || value === null || value === '') {
    return { state: 'missing', value: null };
  }
  if (typeof value === 'string' && value.trim() === '') {
    return { state: 'missing', value: null };
  }
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return { state: 'invalid', value: null };
  }
  return { state: 'present', value: numeric };
}

function isQuoteKind(kind) {
  return QUOTE_KINDS.includes(kind);
}

function classifyLegacyRenovationCost() {
  return Object.freeze({
    field: 'renovationCost',
    classification: EVIDENCE_CLASS.USER_INPUT,
    costKind: COST_KIND.USER_BUDGET,
    canonicalLabel: 'PROJECT_COST_INPUT',
    isAssessedProjectCost: false,
    feedsCurrentFinance: true,
    feedsValuation: false,
    frozen: true,
    note: 'User-entered finance input. Not an assessed project cost, quote, or estimate.',
  });
}

function assertCostUnitsDistinct(left, right) {
  if (left === COST_UNIT.GBP_PER_SQM && right === COST_UNIT.GBP_PER_SQFT) {
    throw new Error('INCOMPATIBLE_UNITS');
  }
  if (left === COST_UNIT.GBP_PER_SQFT && right === COST_UNIT.GBP_PER_SQM) {
    throw new Error('INCOMPATIBLE_UNITS');
  }
  if (TOTAL_UNITS.has(left) && RATE_UNITS.has(right)) {
    throw new Error('TOTAL_IS_NOT_UNIT_RATE');
  }
  if (RATE_UNITS.has(left) && TOTAL_UNITS.has(right)) {
    throw new Error('TOTAL_IS_NOT_UNIT_RATE');
  }
  if (left && right && left !== right && !(TOTAL_UNITS.has(left) && TOTAL_UNITS.has(right))) {
    assertCompatibleUnits(left, right);
  }
  return true;
}

function deriveTotalFromRate({ unitRate, quantity, quantityUnit, rateUnit }) {
  const rate = parseCostNumber(unitRate);
  const qty = parseCostNumber(quantity);
  if (rate.state === 'missing' || qty.state === 'missing') {
    return { amount: null, derived: false, reason: 'RATE_OR_QUANTITY_MISSING' };
  }
  if (rate.state === 'invalid' || qty.state === 'invalid') {
    return { amount: null, derived: false, reason: 'INVALID_INPUT' };
  }
  const expectedQtyUnit = RATE_QUANTITY_UNIT[rateUnit];
  if (expectedQtyUnit && quantityUnit && quantityUnit !== expectedQtyUnit) {
    return { amount: null, derived: false, reason: 'INCOMPATIBLE_QUANTITY_UNIT' };
  }
  return {
    amount: rate.value * qty.value,
    derived: true,
    reason: null,
  };
}

function quoteCurrencyStatus({ validUntil, quoteDate, priceBaseDate, analysisAt }) {
  if (validUntil && analysisAt && String(validUntil) < String(analysisAt)) {
    return { expired: true, isCurrent: false };
  }
  if (!analysisAt) {
    return { expired: false, isCurrent: null };
  }
  if (validUntil && String(validUntil) >= String(analysisAt)) {
    return { expired: false, isCurrent: true };
  }
  const base = quoteDate || priceBaseDate;
  if (base && String(base) !== String(analysisAt)) {
    return { expired: false, isCurrent: false };
  }
  return { expired: false, isCurrent: null };
}

function createCostItem({
  costItemId,
  projectId,
  scenarioId = null,
  scopeId = null,
  subjectRefs = [],
  costKind = COST_KIND.UNKNOWN,
  category = COST_CATEGORY.UNKNOWN,
  description = null,
  quantity = null,
  quantityUnit = null,
  unit = COST_UNIT.GBP_TOTAL,
  unitRate = null,
  amount = null,
  currency = 'GBP',
  priceBaseDate = null,
  quoteDate = null,
  incurredAt = null,
  validUntil = null,
  retrievedAt = null,
  evidenceAsOf = null,
  analysisAt = null,
  sourceType = COST_SOURCE_TYPE.USER_REPORTED,
  source = null,
  evidenceRefs = [],
  provenance = null,
  inclusions = [],
  exclusions = [],
  taxTreatment = TAX_TREATMENT.UNKNOWN,
  limitations = [],
  issuer = null,
  documentRef = null,
  visibility = VISIBILITY.PRIVATE,
  asActualCost = false,
  asAssessedProjectCost = false,
  asPropertyFact = false,
  verifiedIndependently = false,
} = {}) {
  if (costItemId == null || costItemId === '') throw new Error('Cost item requires costItemId');
  if (projectId == null || projectId === '') throw new Error('Cost item requires projectId');
  const kind = COST_KIND[costKind] || COST_KIND.UNKNOWN;
  if (asActualCost && isQuoteKind(kind)) throw new Error('QUOTE_IS_NOT_ACTUAL_COST');
  if (asActualCost && kind === COST_KIND.USER_BUDGET) throw new Error('USER_BUDGET_IS_NOT_ACTUAL_COST');
  if (asAssessedProjectCost && kind === COST_KIND.USER_BUDGET) {
    throw new Error('USER_BUDGET_IS_NOT_PROJECT_COST');
  }
  if (asPropertyFact) throw new Error('PROJECT_COST_IS_NOT_PROPERTY_FACT');
  if (kind === COST_KIND.BENCHMARK && asPropertyFact) {
    throw new Error('BENCHMARK_IS_NOT_PROPERTY_FACT');
  }
  if (kind === COST_KIND.ACTUAL_COST && !evidenceRefs.length && sourceType !== COST_SOURCE_TYPE.ACTUAL_INVOICE
    && sourceType !== COST_SOURCE_TYPE.FIRST_PARTY) {
    throw new Error('ACTUAL_COST_REQUIRES_EXPENDITURE_EVIDENCE');
  }

  const parsedAmount = parseCostNumber(amount);
  const parsedRate = parseCostNumber(unitRate);
  const parsedQty = parseCostNumber(quantity);
  if (parsedAmount.state === 'invalid' || parsedRate.state === 'invalid' || parsedQty.state === 'invalid') {
    return markPrivate({
      contractVersion: PROJECT_COST_CONTRACT_VERSION,
      costItemId: String(costItemId),
      projectId: String(projectId),
      costKind: kind,
      assessment: { state: KERNEL_ASSESSMENT.INVALID_INPUT },
      amount: null,
      unitRate: null,
      quantity: null,
      missingIsNotZero: true,
      visibility: VISIBILITY.PRIVATE,
      sharedPropertyEvidence: false,
      factType: KIND_FACT_TYPE[kind] || 'costAssumption',
    });
  }

  const inputUnit = COST_UNIT[unit] || unit || COST_UNIT.GBP_TOTAL;
  let resolvedAmount = parsedAmount.value;
  let derivedTotal = false;
  let resolvedUnit = inputUnit;
  if (resolvedAmount == null && parsedRate.state === 'present' && parsedQty.state === 'present') {
    const derived = deriveTotalFromRate({
      unitRate: parsedRate.value,
      quantity: parsedQty.value,
      quantityUnit,
      rateUnit: inputUnit,
    });
    if (derived.derived) {
      resolvedAmount = derived.amount;
      derivedTotal = true;
      resolvedUnit = COST_UNIT.GBP_TOTAL;
    }
  }

  let assessmentState = KERNEL_ASSESSMENT.NOT_ASSESSED;
  if (resolvedAmount != null && TOTAL_UNITS.has(resolvedUnit)) {
    assessmentState = KERNEL_ASSESSMENT.ASSESSED;
  } else if (parsedRate.state === 'present' && parsedQty.state === 'missing') {
    assessmentState = KERNEL_ASSESSMENT.INSUFFICIENT_EVIDENCE;
  } else if (parsedQty.state === 'present' && parsedRate.state === 'missing' && parsedAmount.state === 'missing') {
    assessmentState = KERNEL_ASSESSMENT.INSUFFICIENT_EVIDENCE;
  } else if (kind === COST_KIND.USER_BUDGET && parsedAmount.state === 'present') {
    assessmentState = KERNEL_ASSESSMENT.ASSESSED;
  } else if (parsedAmount.state === 'present') {
    assessmentState = KERNEL_ASSESSMENT.ASSESSED;
  }

  const currencyStatus = quoteCurrencyStatus({
    validUntil, quoteDate, priceBaseDate, analysisAt,
  });
  const modelAssisted = sourceType === COST_SOURCE_TYPE.MODEL_ASSISTED
    || sourceType === SOURCE_TYPE.MODEL_ASSISTED;

  const item = {
    contractVersion: PROJECT_COST_CONTRACT_VERSION,
    costItemId: String(costItemId),
    projectId: String(projectId),
    scenarioId: scenarioId == null ? null : String(scenarioId),
    scopeId: scopeId == null ? null : String(scopeId),
    subjectRefs: Array.isArray(subjectRefs) ? subjectRefs : [],
    costKind: kind,
    category: COST_CATEGORY[category] || COST_CATEGORY.UNKNOWN,
    description: description || null,
    quantity: parsedQty.value,
    quantityUnit: quantityUnit || null,
    unit: resolvedUnit,
    unitRate: parsedRate.value,
    amount: resolvedAmount,
    derivedTotal,
    currency: currency || 'GBP',
    priceBaseDate: priceBaseDate || null,
    quoteDate: quoteDate || null,
    incurredAt: kind === COST_KIND.ACTUAL_COST ? (incurredAt || null) : null,
    validUntil: validUntil || null,
    retrievedAt: retrievedAt || null,
    evidenceAsOf: evidenceAsOf || null,
    analysisAt: analysisAt || null,
    sourceType: COST_SOURCE_TYPE[sourceType] || sourceType || COST_SOURCE_TYPE.USER_REPORTED,
    source: source || null,
    issuer: issuer || null,
    documentRef: documentRef || null,
    evidenceRefs: Array.isArray(evidenceRefs) ? evidenceRefs : [],
    assessment: { state: assessmentState },
    provenance: provenance || { source: source || 'UserReported' },
    inclusions: Array.isArray(inclusions) ? inclusions : [],
    exclusions: Array.isArray(exclusions) ? exclusions : [],
    taxTreatment: TAX_TREATMENT[taxTreatment] || TAX_TREATMENT.UNKNOWN,
    limitations: Array.isArray(limitations) ? limitations : [],
    expired: currencyStatus.expired,
    isCurrent: currencyStatus.isCurrent,
    escalation: KERNEL_ASSESSMENT.NOT_ASSESSED,
    verifiedIndependently: verifiedIndependently === true,
    authoritative: modelAssisted ? false : Boolean(!modelAssisted && kind === COST_KIND.ACTUAL_COST),
    isQuote: isQuoteKind(kind),
    isActualCost: kind === COST_KIND.ACTUAL_COST,
    isUserBudget: kind === COST_KIND.USER_BUDGET,
    isBenchmark: kind === COST_KIND.BENCHMARK,
    isAssessedProjectCost: kind !== COST_KIND.USER_BUDGET
      && kind !== COST_KIND.BENCHMARK
      && kind !== COST_KIND.ASSUMPTION
      && kind !== COST_KIND.SCENARIO
      && assessmentState === KERNEL_ASSESSMENT.ASSESSED
      && TOTAL_UNITS.has(resolvedUnit),
    isPropertyFact: false,
    missingIsNotZero: parsedAmount.state === 'missing',
    explicitZero: parsedAmount.state === 'present' && parsedAmount.value === 0,
    contingencyAutoAdded: false,
    professionalFeesAutoAdded: false,
    vatAssumed: false,
    visibility: visibility === VISIBILITY.SHARED ? VISIBILITY.SHARED : VISIBILITY.PRIVATE,
    sharedPropertyEvidence: false,
    factType: KIND_FACT_TYPE[kind] || 'costAssumption',
  };
  if (modelAssisted) {
    item.classification = EVIDENCE_CLASS.INFERENCE;
    item.authoritative = false;
  }
  return visibility === VISIBILITY.PRIVATE
    ? markPrivate(item)
    : assertEvidenceVisibility({ ...item, sharedPropertyEvidence: false });
}

function createCostBenchmark({
  benchmarkId,
  source,
  geography = null,
  applicableAssetClasses = [],
  applicableProjectTypes = [],
  unit,
  value = null,
  priceBaseDate = null,
  evidenceAsOf = null,
  version = null,
  limitations = [],
} = {}) {
  if (benchmarkId == null || benchmarkId === '') throw new Error('Benchmark requires benchmarkId');
  if (!source) throw new Error('Benchmark requires source');
  if (!unit) throw new Error('Benchmark requires unit');
  return {
    contractVersion: PROJECT_COST_CONTRACT_VERSION,
    benchmarkId: String(benchmarkId),
    costKind: COST_KIND.BENCHMARK,
    source,
    geography: geography || null,
    applicableAssetClasses: Array.isArray(applicableAssetClasses) ? applicableAssetClasses : [],
    applicableProjectTypes: Array.isArray(applicableProjectTypes) ? applicableProjectTypes : [],
    unit,
    value: parseCostNumber(value).value,
    priceBaseDate: priceBaseDate || null,
    evidenceAsOf: evidenceAsOf || null,
    version: version || null,
    limitations: Array.isArray(limitations) ? limitations : [
      'Benchmark is contextual evidence, not property-specific truth.',
    ],
    isPropertySpecificFact: false,
    isQuote: false,
    isActualCost: false,
    noProviderAttached: true,
  };
}

function benchmarkApplies(benchmark, { assetClass = ASSET_CLASS.UNKNOWN, projectType = null } = {}) {
  if (!benchmark) return false;
  const classes = benchmark.applicableAssetClasses || [];
  const types = benchmark.applicableProjectTypes || [];
  if (classes.length && assetClass && !classes.includes(assetClass)) return false;
  if (types.length && projectType && !types.includes(projectType)) return false;
  return true;
}

function sameScenario(item, scenarioId) {
  if (scenarioId == null || scenarioId === '') return item.scenarioId == null;
  return item.scenarioId === String(scenarioId);
}

function aggregateCompatibleCostItems({
  items = [],
  projectId,
  scenarioId = null,
  completeness = COST_COMPLETENESS.PARTIAL,
  analysisAt = null,
} = {}) {
  if (projectId == null || projectId === '') throw new Error('Aggregation requires projectId');
  const seen = new Set();
  const scoped = [];
  (Array.isArray(items) ? items : []).forEach((item) => {
    if (!item || item.projectId !== String(projectId)) return;
    if (!sameScenario(item, scenarioId)) return;
    if (seen.has(item.costItemId)) return;
    seen.add(item.costItemId);
    scoped.push(item);
  });

  const actualScopeIds = new Set(
    scoped.filter((row) => row.costKind === COST_KIND.ACTUAL_COST && row.scopeId)
      .map((row) => row.scopeId)
  );

  function sumGroup(predicate) {
    let total = null;
    let currency = null;
    const includedIds = [];
    scoped.forEach((row) => {
      if (!predicate(row)) return;
      if (row.assessment?.state !== KERNEL_ASSESSMENT.ASSESSED) return;
      if (row.amount == null) return;
      if (!TOTAL_UNITS.has(row.unit) && row.unit !== COST_UNIT.PERCENT) {
        return;
      }
      if (row.unit === COST_UNIT.PERCENT) return;
      if (currency && row.currency && currency !== row.currency) {
        throw new Error('INCOMPATIBLE_CURRENCY');
      }
      currency = row.currency || currency || 'GBP';
      total = (total == null ? 0 : total) + row.amount;
      includedIds.push(row.costItemId);
    });
    return { amount: total, currency, itemIds: includedIds };
  }

  const actual = sumGroup((row) => row.costKind === COST_KIND.ACTUAL_COST);
  const quotes = sumGroup((row) => (
    isQuoteKind(row.costKind)
      && !(row.scopeId && actualScopeIds.has(row.scopeId))
  ));
  const budgets = sumGroup((row) => row.costKind === COST_KIND.USER_BUDGET);

  const resolvedCompleteness = COST_COMPLETENESS[completeness] || COST_COMPLETENESS.PARTIAL;
  const isTotalProjectCost = resolvedCompleteness === COST_COMPLETENESS.COMPLETE_FOR_DECLARED_SCOPE
    && (actual.amount != null || quotes.amount != null);

  return {
    contractVersion: PROJECT_COST_CONTRACT_VERSION,
    projectId: String(projectId),
    scenarioId: scenarioId == null ? null : String(scenarioId),
    analysisAt: analysisAt || null,
    actualSubtotal: actual,
    quoteSubtotal: quotes,
    budgetSubtotal: budgets,
    completeness: resolvedCompleteness,
    isTotalProjectCost,
    quoteActualDoubleCountPrevented: true,
    duplicateItemsExcluded: true,
    contingencyAutoAdded: false,
    professionalFeesAutoAdded: false,
    escalation: KERNEL_ASSESSMENT.NOT_ASSESSED,
    limitations: [
      'A subtotal is not total project cost unless completeness is COMPLETE_FOR_DECLARED_SCOPE.',
      'Quotes, actuals, and budgets are not mixed.',
      'Benchmarks, assumptions, and scenarios are not included in money totals.',
    ],
  };
}

module.exports = {
  PROJECT_COST_CONTRACT_VERSION,
  COST_KIND,
  COST_CATEGORY,
  COST_UNIT,
  TAX_TREATMENT,
  COST_COMPLETENESS,
  COST_SOURCE_TYPE,
  QUOTE_KINDS,
  parseCostNumber,
  classifyLegacyRenovationCost,
  assertCostUnitsDistinct,
  deriveTotalFromRate,
  createCostItem,
  createCostBenchmark,
  benchmarkApplies,
  aggregateCompatibleCostItems,
};
