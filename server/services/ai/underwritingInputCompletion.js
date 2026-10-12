/**
 * LET_INVEST underwriting input completion — maps NOT_ASSESSED metrics to
 * canonical user inputs or platform-evidence gaps. Presentation only.
 */

const {
  OPERATING_COST_KEYS,
  FINANCE_KEYS,
  METRIC_DEPENDENCIES,
  FIELD_CONTRACT,
} = require('./financeInputContract');
const { KERNEL_ASSESSMENT } = require('../../architecture/assessmentStates');

const INPUT_SECTION = Object.freeze({
  property_rent: 'property_rent',
  operating: 'operating',
  financing: 'financing',
});

const ROOT_CAUSE = Object.freeze({
  MISSING_USER_INPUT: 'MISSING_USER_INPUT',
  MISSING_PLATFORM_EVIDENCE: 'MISSING_PLATFORM_EVIDENCE',
  MISSING_METHODOLOGY: 'MISSING_METHODOLOGY',
});

const METRIC_LABELS = Object.freeze({
  grossYield: 'Gross yield',
  noi: 'NOI',
  netYield: 'Net yield',
  annualCashFlow: 'Annual cash flow',
  dscr: 'DSCR',
  valuation_range: 'Residential valuation range',
  price_position: 'Asking-price position',
  landlord_fit: 'Landlord fit',
});

const FIELD_LABELS = Object.freeze({
  purchasePrice: 'Purchase price',
  expectedRent: 'Expected monthly rent',
  maintenance: 'Maintenance',
  insurance: 'Insurance',
  managementFee: 'Management fee',
  serviceCharge: 'Service charge',
  groundRent: 'Ground rent',
  taxes: 'Other landlord taxes/costs',
  vacancyAssumption: 'Vacancy assumption',
  deposit: 'Deposit',
  mortgageAmount: 'Mortgage amount',
  interestRate: 'Interest rate',
  mortgageTermYears: 'Mortgage term',
});

function sectionForInputKey(key) {
  if (key === 'purchasePrice' || key === 'expectedRent') return INPUT_SECTION.property_rent;
  if (FINANCE_KEYS.includes(key) || key === 'mortgageAmount') return INPUT_SECTION.financing;
  if (OPERATING_COST_KEYS.includes(key)) return INPUT_SECTION.operating;
  return INPUT_SECTION.operating;
}

function unlocksForInput(inputKey) {
  return Object.entries(METRIC_DEPENDENCIES)
    .filter(([, deps]) => deps.includes(inputKey))
    .map(([metric]) => metric);
}

function unlockLabels(metrics = []) {
  return metrics.map((id) => METRIC_LABELS[id] || id);
}

function inputItem({
  inputKey,
  cause,
  detail,
  unlocks = null,
  priority = 50,
}) {
  const metrics = unlocks || unlocksForInput(inputKey);
  return {
    id: `underwriting_input_${inputKey}`,
    inputKey,
    section: sectionForInputKey(inputKey),
    label: FIELD_LABELS[inputKey] || inputKey,
    contract: FIELD_CONTRACT[inputKey] || null,
    cause,
    provenance: cause === ROOT_CAUSE.MISSING_USER_INPUT ? 'USER_INPUT' : null,
    action: cause === ROOT_CAUSE.MISSING_USER_INPUT ? 'supply_input' : 'platform_evidence',
    unlocks: metrics,
    unlockLabels: unlockLabels(metrics),
    detail,
    zeroValid: FIELD_CONTRACT[inputKey]?.zeroValid === true,
    priority,
  };
}

function extractInputKeysFromDi(item) {
  const keys = new Set();
  (item?.evidenceRefs || []).forEach((ref) => {
    if (ref?.key) keys.add(ref.key);
    if (Array.isArray(ref?.keys)) ref.keys.forEach((k) => keys.add(k));
  });
  return [...keys];
}

function diDetailForKey(diUnresolved, inputKey) {
  const hit = (diUnresolved || []).find((row) => extractInputKeysFromDi(row).includes(inputKey));
  if (!hit) return null;
  return hit.explanation || hit.title || null;
}

function missingUserInputItems(report) {
  const presented = report?.investment?.presented || {};
  const costMissing = Array.isArray(presented.costEvidence?.missing) ? presented.costEvidence.missing : [];
  const financeMissing = Array.isArray(presented.financeEvidence?.missing) ? presented.financeEvidence.missing : [];
  const diUnresolved = report?.decisionIntelligence?.unresolvedDependencies || [];
  const keys = [...new Set([...costMissing, ...financeMissing])];
  const priority = {
    vacancyAssumption: 10,
    purchasePrice: 15,
    expectedRent: 16,
    deposit: 30,
    interestRate: 31,
    mortgageTermYears: 32,
    mortgageAmount: 33,
  };

  return keys.map((inputKey) => inputItem({
    inputKey,
    cause: ROOT_CAUSE.MISSING_USER_INPUT,
    detail: diDetailForKey(diUnresolved, inputKey)
      || presented.costEvidence?.note
      || presented.financeEvidence?.note
      || `Supply ${FIELD_LABELS[inputKey] || inputKey} for this analysis. Blank means unknown; 0 is only valid where explicitly allowed.`,
    priority: priority[inputKey] ?? 40,
  })).sort((a, b) => a.priority - b.priority);
}

function platformEvidenceGaps(report) {
  const sale = report?.marketIntelligence?.sale;
  const pricePosition = report?.marketIntelligence?.pricePosition;
  const pd = report?.personalDecision?.profile === 'landlord' ? report.personalDecision : null;
  const gaps = [];

  const valuationAssessed = Boolean(sale?.success) && sale?.notAssessed !== true && sale?.centralEstimate != null;
  if (!valuationAssessed) {
    gaps.push({
      id: 'platform_valuation',
      inputKey: null,
      section: null,
      label: METRIC_LABELS.valuation_range,
      cause: ROOT_CAUSE.MISSING_PLATFORM_EVIDENCE,
      provenance: null,
      action: 'platform_evidence',
      unlocks: ['valuation_range', 'price_position'],
      unlockLabels: unlockLabels(['valuation_range', 'price_position']),
      detail: sale?.message || 'Property-specific valuation was not assessed from available evidence.',
      priority: 5,
    });
  }

  const ppAssessed = Boolean(pricePosition) && pricePosition.notAssessed !== true && pricePosition.success !== false;
  if (!ppAssessed && valuationAssessed) {
    gaps.push({
      id: 'platform_price_position',
      inputKey: null,
      section: null,
      label: METRIC_LABELS.price_position,
      cause: ROOT_CAUSE.MISSING_PLATFORM_EVIDENCE,
      provenance: null,
      action: 'platform_evidence',
      unlocks: ['price_position'],
      unlockLabels: unlockLabels(['price_position']),
      detail: pricePosition?.message || 'Price position requires a defensible valuation and asking price.',
      priority: 6,
    });
  }

  if (pd && !pd.available) {
    gaps.push({
      id: 'landlord_pd_blocked',
      inputKey: null,
      section: null,
      label: METRIC_LABELS.landlord_fit,
      cause: ROOT_CAUSE.MISSING_USER_INPUT,
      provenance: 'USER_INPUT',
      action: 'supply_input',
      unlocks: ['landlord_fit'],
      unlockLabels: unlockLabels(['landlord_fit']),
      detail: pd.unavailableReason || 'Landlord fit needs more assessed dimensions and scenario inputs.',
      priority: 45,
    });
  }

  return gaps;
}

function metricResolutionHint(metricId, report) {
  const presented = report?.investment?.presented || {};
  const field = presented[metricId];
  if (field?.available) {
    return { state: KERNEL_ASSESSMENT.ASSESSED, cause: null, inputKeys: [] };
  }
  if (metricId === 'valuation_range' || metricId === 'price_position') {
    return {
      state: KERNEL_ASSESSMENT.NOT_ASSESSED,
      cause: ROOT_CAUSE.MISSING_PLATFORM_EVIDENCE,
      inputKeys: [],
      detail: field?.reason || presented?.message,
    };
  }
  if (metricId === 'landlord_fit') {
    return {
      state: KERNEL_ASSESSMENT.NOT_ASSESSED,
      cause: ROOT_CAUSE.MISSING_USER_INPUT,
      inputKeys: [],
      detail: report?.personalDecision?.unavailableReason,
    };
  }
  const deps = METRIC_DEPENDENCIES[metricId];
  if (!deps) {
    return {
      state: KERNEL_ASSESSMENT.NOT_ASSESSED,
      cause: null,
      inputKeys: [],
      detail: field?.reason,
    };
  }
  const costMissing = new Set(presented.costEvidence?.missing || []);
  const financeMissing = new Set(presented.financeEvidence?.missing || []);
  const missingInputs = deps.filter((key) => costMissing.has(key) || financeMissing.has(key));
  return {
    state: KERNEL_ASSESSMENT.NOT_ASSESSED,
    cause: missingInputs.length ? ROOT_CAUSE.MISSING_USER_INPUT : ROOT_CAUSE.MISSING_PLATFORM_EVIDENCE,
    inputKeys: missingInputs,
    detail: field?.reason,
  };
}

function buildMissingUnderwritingInputs(report) {
  const userInputs = missingUserInputItems(report);
  const platform = platformEvidenceGaps(report);
  const seen = new Set();
  const merged = [...platform, ...userInputs].filter((row) => {
    const key = row.inputKey || row.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => a.priority - b.priority);

  return {
    contractVersion: 'let-invest-underwriting-input-1.0.0',
    items: merged,
    userInputCount: userInputs.length,
    platformEvidenceCount: platform.filter((r) => r.cause === ROOT_CAUSE.MISSING_PLATFORM_EVIDENCE).length,
    sections: [
      { id: INPUT_SECTION.property_rent, label: 'Property & rent' },
      { id: INPUT_SECTION.operating, label: 'Operating assumptions' },
      { id: INPUT_SECTION.financing, label: 'Financing' },
    ],
  };
}

module.exports = {
  INPUT_SECTION,
  ROOT_CAUSE,
  METRIC_LABELS,
  FIELD_LABELS,
  buildMissingUnderwritingInputs,
  metricResolutionHint,
  unlocksForInput,
};
