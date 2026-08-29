/**
 * Canonical Decision Intelligence — Phase 1 + Phase 2 + Phase 3.
 * Phase 1: unresolved decision dependencies and investigation priorities.
 * Phase 2: materialFindings from assessed canonical evidence only.
 * Phase 3: sensitivityDrivers — scenario-input dependency graph only.
 * Does not run What-if, invent score deltas, or rank drivers.
 *
 * Consumes existing propertyFacts, conflicts, investment.presented,
 * landlord Personal Decision, canonical rent intelligence, and price
 * position. Does not score, call providers, reconstruct finance formulas,
 * or treat heuristic strengths/risks as truth.
 *
 * Risk is omitted from materialFindings: the current PD risk dimension is
 * not safely traceable to sanctioned canonical inputs without consuming
 * invented heuristic probability fields. Demand is omitted because it
 * remains notAssessed.
 */

const {
  OPERATING_COST_KEYS,
  FINANCE_KEYS,
  FIELD_CONTRACT,
  METRIC_DEPENDENCIES,
} = require('./financeInputContract');

const ENGINE = 'decisionIntelligence';
const VERSION = 'decision-intelligence-1.0.0';

const IMPORTANCE = Object.freeze({
  decisionRelevant: 'decision_relevant',
  worthReviewing: 'worth_reviewing',
  contextOnly: 'context_only',
  informational: 'informational',
});

const COST_KEYS_EXCLUDING_VACANCY = Object.freeze(
  OPERATING_COST_KEYS.filter((key) => key !== 'vacancyAssumption')
);

const COST_LABELS = Object.freeze({
  maintenance: 'maintenance',
  insurance: 'insurance',
  managementFee: 'management fee',
  serviceCharge: 'service charge',
  groundRent: 'ground rent',
  taxes: 'other landlord taxes/costs',
  vacancyAssumption: 'vacancy assumption',
});

const FINANCE_LABELS = Object.freeze({
  deposit: 'deposit',
  interestRate: 'interest rate',
  mortgageTermYears: 'mortgage term',
});

const CONFLICT_FIELD_LABELS = Object.freeze({
  epc_rating: 'EPC rating',
  epcRating: 'EPC rating',
  tenure: 'tenure',
  bathrooms: 'bathrooms',
  bedrooms: 'bedrooms',
  square_feet: 'floor area',
  floorArea: 'floor area',
  property_type: 'property type',
  propertyType: 'property type',
  year_built: 'year built',
  yearBuilt: 'year built',
  council_tax_band: 'council tax band',
  councilTaxBand: 'council tax band',
  last_sold_price: 'last sold price',
  lastSoldPrice: 'last sold price',
  last_sold_date: 'last sold date',
  lastSoldDate: 'last sold date',
});

const DECISION_RELEVANT_ORDER = Object.freeze([
  'vacancy_assumption_missing',
  'operating_costs_incomplete',
  'mortgage_inputs_incomplete',
  'purchase_price_or_expected_rent_missing',
  'rent_position_not_assessed',
  'landlord_demand_not_assessed',
]);

const EFFECT = Object.freeze({
  supporting: 'supporting',
  limiting: 'limiting',
  neutral: 'neutral',
});

const MATERIAL_FINDING_ORDER = Object.freeze([
  'finding_rent_position',
  'finding_gross_yield',
  'finding_net_operating',
  'finding_cash_flow',
  'finding_vacancy',
  'finding_dscr',
  'finding_price_position',
]);

const DRIVER_STATE = Object.freeze({
  active: 'active',
  conditional: 'conditional',
  notCurrentlyAssessable: 'notCurrentlyAssessable',
});

const DRIVER_GROUP = Object.freeze({
  priceRent: 'price_rent',
  operatingCosts: 'operating_costs',
  finance: 'finance',
});

const SENSITIVITY_DRIVER_ORDER = Object.freeze([
  'purchasePrice',
  'expectedRent',
  'vacancyAssumption',
  'maintenance',
  'insurance',
  'managementFee',
  'taxes',
  'serviceCharge',
  'groundRent',
  'deposit',
  'mortgageAmount',
  'interestRate',
  'mortgageTermYears',
]);

const DRIVER_TITLES = Object.freeze({
  purchasePrice: 'Purchase price',
  expectedRent: 'Expected rent',
  vacancyAssumption: 'Vacancy assumption',
  maintenance: 'Maintenance',
  insurance: 'Insurance',
  managementFee: 'Management fee',
  taxes: 'Other landlord taxes/costs',
  serviceCharge: 'Service charge',
  groundRent: 'Ground rent',
  deposit: 'Deposit',
  mortgageAmount: 'Mortgage amount',
  interestRate: 'Interest rate',
  mortgageTermYears: 'Mortgage term',
});

const DRIVER_GROUPS = Object.freeze({
  purchasePrice: DRIVER_GROUP.priceRent,
  expectedRent: DRIVER_GROUP.priceRent,
  vacancyAssumption: DRIVER_GROUP.operatingCosts,
  maintenance: DRIVER_GROUP.operatingCosts,
  insurance: DRIVER_GROUP.operatingCosts,
  managementFee: DRIVER_GROUP.operatingCosts,
  taxes: DRIVER_GROUP.operatingCosts,
  serviceCharge: DRIVER_GROUP.operatingCosts,
  groundRent: DRIVER_GROUP.operatingCosts,
  deposit: DRIVER_GROUP.finance,
  mortgageAmount: DRIVER_GROUP.finance,
  interestRate: DRIVER_GROUP.finance,
  mortgageTermYears: DRIVER_GROUP.finance,
});

const METRIC_TO_PD = Object.freeze({
  grossYield: ['personalDecision.dimensions.grossYield'],
  noi: ['personalDecision.dimensions.netOperating'],
  netYield: ['personalDecision.dimensions.netOperating'],
  annualCashFlow: ['personalDecision.dimensions.cashFlow'],
  monthlyCashFlow: ['personalDecision.dimensions.cashFlow'],
  dscr: ['personalDecision.dimensions.dscr'],
});

const PRESENTED_METRICS = Object.freeze([
  'grossYield',
  'noi',
  'netYield',
  'annualCashFlow',
  'monthlyCashFlow',
  'dscr',
]);

const RENT_POSITION_STATES = Object.freeze({
  below_market: {
    title: 'Rent sits below the evidenced market range',
    explanation:
      'The listing or scenario rent sits below the evidenced market range from canonical rent intelligence. This is a rent-position classification, not a letting-demand claim and not an under-rent amount.',
  },
  at_market: {
    title: 'Rent sits within the evidenced market range',
    explanation:
      'The listing or scenario rent sits within the evidenced market range from canonical rent intelligence. This is a rent-position classification, not a letting-demand claim.',
  },
  above_market: {
    title: 'Rent sits above the evidenced market range',
    explanation:
      'The listing or scenario rent sits above the evidenced market range from canonical rent intelligence. This is a rent-position classification, not a letting-demand claim.',
  },
});

const CONTEXT_LAYERS = Object.freeze([
  {
    field: 'flood',
    id: 'context_flood',
    title: 'Flood evidence',
    unknownExplanation:
      'Flood status is not assessed at these coordinates. That is not evidence the property is clear, safe, or outside flood risk, and it is not a low-risk result.',
    assessedExplanation:
      'Flood Map for Planning evidence is context only. It does not change landlord fit, valuation, or finance, and it is not a property risk score.',
  },
  {
    field: 'planning',
    id: 'context_planning',
    title: 'Planning applications',
    unknownExplanation:
      'Planning applications are not assessed. A missing result is not evidence of no planning activity, and it is not a planning risk score.',
    assessedExplanation:
      'Planning applications are context only. They do not change landlord fit, valuation, or finance, and they are not a planning score or approval prediction.',
  },
  {
    field: 'schools',
    id: 'context_schools',
    title: 'Nearby schools',
    unknownExplanation:
      'Nearby school evidence is not assessed. That is not evidence there are no schools, and catchment remains not assessed.',
    assessedExplanation:
      'Nearby schools are area context only, not catchment or admission evidence. They do not change landlord fit, valuation, or finance.',
  },
  {
    field: 'listedBuilding',
    id: 'context_listed_building',
    title: 'Listed building',
    unknownExplanation:
      'Listed-building status is not assessed. That is not evidence the property is not listed, clear, or unrestricted.',
    assessedExplanation:
      'Listed-building evidence is context only. Native grade is not a heritage or risk score and does not change landlord fit, valuation, or finance.',
  },
  {
    field: 'conservationArea',
    id: 'context_conservation_area',
    title: 'Conservation area',
    unknownExplanation:
      'Conservation-area membership is not assessed. That is not evidence the property is outside a conservation area, clear, or unrestricted.',
    assessedExplanation:
      'Conservation-area membership is context only. It is not a heritage score and does not change landlord fit, valuation, or finance.',
  },
  {
    field: 'article4',
    id: 'context_article4',
    title: 'Article 4 Direction Area',
    unknownExplanation:
      'Article 4 geographic membership is not assessed. That is not evidence there is no Article 4 direction, and it is not a clear or unrestricted result. Permitted-development restrictions remain not assessed.',
    assessedExplanation:
      'Article 4 geographic membership is context only. It does not change landlord fit, valuation, or finance. Permitted-development restrictions remain not assessed and are not inferred from membership.',
  },
]);

function present(value) {
  if (value === undefined || value === null || value === '') return false;
  return true;
}

function labelList(keys, labels) {
  return keys.map((key) => labels[key] || key);
}

function presentedField(investment, key) {
  return investment?.presented?.[key] || null;
}

function fieldNotAssessed(field) {
  return !field || field.available !== true;
}

function missingCostKeys(investment) {
  const missing = investment?.presented?.costEvidence?.missing;
  return Array.isArray(missing) ? missing.filter((key) => OPERATING_COST_KEYS.includes(key)) : [];
}

function missingFinanceKeys(investment) {
  const missing = investment?.presented?.financeEvidence?.missing;
  return Array.isArray(missing) ? missing.filter((key) => FINANCE_KEYS.includes(key)) : [];
}

function pdDimension(personalDecision, key) {
  return personalDecision?.dimensions?.[key] || null;
}

function pdNotAssessed(personalDecision, key) {
  const dim = pdDimension(personalDecision, key);
  if (dim && dim.available === false) return true;
  return (personalDecision?.notAssessed || []).some((row) => row.dimension === key || row.key === key);
}

function makeItem({
  id,
  type,
  title,
  explanation,
  importance,
  evidenceRefs = [],
  scope,
  asOf,
  affects = [],
  limitations = [],
  state = 'notAssessed',
  effect = null,
}) {
  const item = {
    id,
    type,
    state,
    title,
    explanation,
    importance,
    evidenceRefs,
    scope,
    asOf,
    affects,
    limitations,
  };
  if (effect === EFFECT.supporting || effect === EFFECT.limiting || effect === EFFECT.neutral) {
    item.effect = effect;
  }
  return item;
}

function pdAssessed(personalDecision, key) {
  const dim = pdDimension(personalDecision, key);
  return Boolean(dim && dim.available === true);
}

function presentedAvailable(investment, key) {
  return presentedField(investment, key)?.available === true;
}

/**
 * Map an existing Personal Decision dimension score onto supporting/limiting.
 * Reuses why-engine weakness (<70) and mixed_fit (<50) cutoffs. Does not
 * duplicate gross-yield, cash-flow, DSCR, or vacancy scorer thresholds.
 */
function effectFromPdScore(score) {
  if (!Number.isFinite(Number(score))) return EFFECT.neutral;
  const n = Number(score);
  if (n >= 70) return EFFECT.supporting;
  if (n < 50) return EFFECT.limiting;
  return EFFECT.neutral;
}

function pdScoreAffects(personalDecision, dimensionKey) {
  const affects = [`personalDecision.dimensions.${dimensionKey}`];
  if (personalDecision?.available === true && Number.isFinite(Number(personalDecision.score))) {
    affects.push('personalDecision.score');
  }
  return affects;
}

function dimensionEvidenceText(dim) {
  const rows = Array.isArray(dim?.evidence) ? dim.evidence : Array.isArray(dim?.reasons) ? dim.reasons : [];
  return rows.find((row) => typeof row === 'string' && row.trim()) || null;
}

function rentPositionFinding(personalDecision, rentIntel, asOf) {
  if (!pdAssessed(personalDecision, 'rentPosition')) return null;
  const dim = pdDimension(personalDecision, 'rentPosition');
  const classified = RENT_POSITION_STATES[dim.state];
  if (!classified) return null;
  const evidenceRefs = [{ kind: 'personalDecision', path: 'dimensions.rentPosition' }];
  if (rentIntel?.success) {
    evidenceRefs.push({ kind: 'marketIntelligence', path: 'rent' });
  }
  return makeItem({
    id: 'finding_rent_position',
    type: 'material_finding',
    state: dim.state,
    title: classified.title,
    explanation: classified.explanation,
    importance: IMPORTANCE.decisionRelevant,
    evidenceRefs,
    scope: 'property',
    asOf,
    affects: pdScoreAffects(personalDecision, 'rentPosition'),
    limitations: [
      'This is not a demand, ease-of-letting, or guaranteed-rent claim.',
      'Classification comes from the existing rent-position contract, not a new threshold.',
    ],
    effect: effectFromPdScore(dim.score),
  });
}

function grossYieldFinding(investment, personalDecision, asOf) {
  if (!pdAssessed(personalDecision, 'grossYield')) return null;
  const dim = pdDimension(personalDecision, 'grossYield');
  const presented = presentedField(investment, 'grossYield');
  const evidenceRefs = [{ kind: 'personalDecision', path: 'dimensions.grossYield' }];
  if (presentedAvailable(investment, 'grossYield')) {
    evidenceRefs.push({ kind: 'investment.presented', path: 'grossYield' });
  }
  const scorerLanguage = dimensionEvidenceText(dim);
  const presentedNote =
    presentedAvailable(investment, 'grossYield') && Number.isFinite(Number(presented.value))
      ? ` Canonical presented gross yield is ${presented.value}%.`
      : '';
  const existingLanguage = scorerLanguage ? ` Existing Personal Decision evidence: ${scorerLanguage}.` : '';
  return makeItem({
    id: 'finding_gross_yield',
    type: 'material_finding',
    state: 'assessed',
    title: 'Gross yield is an assessed landlord-fit driver',
    explanation:
      `Gross yield is currently one of the assessed drivers of the landlord fit.${presentedNote}${existingLanguage} Supporting or limiting classification follows the existing Personal Decision score, not a new yield threshold.`,
    importance: IMPORTANCE.decisionRelevant,
    evidenceRefs,
    scope: 'scenario',
    asOf,
    affects: pdScoreAffects(personalDecision, 'grossYield'),
    limitations: [
      'This layer does not invent new yield quality labels.',
      'Thresholds remain those already used by the Personal Decision / investment scorer.',
    ],
    effect: effectFromPdScore(dim.score),
  });
}

function netOperatingFinding(investment, personalDecision, asOf) {
  if (!pdAssessed(personalDecision, 'netOperating')) return null;
  if (!presentedAvailable(investment, 'noi') || !presentedAvailable(investment, 'netYield')) return null;
  const dim = pdDimension(personalDecision, 'netOperating');
  return makeItem({
    id: 'finding_net_operating',
    type: 'material_finding',
    state: 'assessed',
    title: 'Net operating performance is assessed from the complete cost scenario',
    explanation:
      'Net operating performance is assessed using the complete cost scenario supplied for this analysis. The finding uses canonical presented NOI and net yield, not hidden raw engine figures.',
    importance: IMPORTANCE.decisionRelevant,
    evidenceRefs: [
      { kind: 'investment.presented', path: 'noi' },
      { kind: 'investment.presented', path: 'netYield' },
      { kind: 'personalDecision', path: 'dimensions.netOperating' },
    ],
    scope: 'scenario',
    asOf,
    affects: pdScoreAffects(personalDecision, 'netOperating'),
    limitations: [
      'Raw financialEngine NOI that presentation completeness hides cannot create this finding.',
    ],
    effect: effectFromPdScore(dim.score),
  });
}

function cashFlowFinding(investment, personalDecision, asOf) {
  if (!pdAssessed(personalDecision, 'cashFlow')) return null;
  if (!presentedAvailable(investment, 'annualCashFlow')) return null;
  const dim = pdDimension(personalDecision, 'cashFlow');
  return makeItem({
    id: 'finding_cash_flow',
    type: 'material_finding',
    state: 'assessed',
    title: 'Cash flow is an assessed landlord-fit driver',
    explanation:
      'Canonical cash-flow evidence is complete and currently supports or limits the landlord scenario according to the existing Personal Decision cash-flow dimension. This is not a second cash-flow threshold.',
    importance: IMPORTANCE.decisionRelevant,
    evidenceRefs: [
      { kind: 'investment.presented', path: 'annualCashFlow' },
      { kind: 'personalDecision', path: 'dimensions.cashFlow' },
    ],
    scope: 'scenario',
    asOf,
    affects: pdScoreAffects(personalDecision, 'cashFlow'),
    limitations: ['Missing or defaulted finance cannot create this finding.'],
    effect: effectFromPdScore(dim.score),
  });
}

function vacancyFinding(personalDecision, asOf) {
  if (!pdAssessed(personalDecision, 'vacancy')) return null;
  const dim = pdDimension(personalDecision, 'vacancy');
  return makeItem({
    id: 'finding_vacancy',
    type: 'material_finding',
    state: 'assessed',
    title: 'Vacancy is an assessed scenario assumption',
    explanation:
      'The vacancy assumption used in this landlord scenario is assessed as a scenario input, not as an observed property occupancy fact. A supplied 0% vacancy remains a user scenario assumption, not a property characteristic.',
    importance: IMPORTANCE.decisionRelevant,
    evidenceRefs: [{ kind: 'personalDecision', path: 'dimensions.vacancy' }],
    scope: 'scenario',
    asOf,
    affects: pdScoreAffects(personalDecision, 'vacancy'),
    limitations: [
      'Vacancy is not inferred from the listing.',
      'Missing vacancy stays a Phase 1 dependency and does not become a material finding.',
    ],
    effect: effectFromPdScore(dim.score),
  });
}

function dscrFinding(investment, personalDecision, asOf) {
  if (!pdAssessed(personalDecision, 'dscr')) return null;
  if (!presentedAvailable(investment, 'dscr')) return null;
  const dim = pdDimension(personalDecision, 'dscr');
  return makeItem({
    id: 'finding_dscr',
    type: 'material_finding',
    state: 'assessed',
    title: 'DSCR is an assessed landlord-fit driver',
    explanation:
      'Assessed DSCR is one of the current landlord-fit drivers using existing Personal Decision dimension semantics. This is not a lender rule and is not mortgage advice.',
    importance: IMPORTANCE.decisionRelevant,
    evidenceRefs: [
      { kind: 'investment.presented', path: 'dscr' },
      { kind: 'personalDecision', path: 'dimensions.dscr' },
    ],
    scope: 'scenario',
    asOf,
    affects: pdScoreAffects(personalDecision, 'dscr'),
    limitations: ['This layer does not introduce a new coverage or affordability rule.'],
    effect: effectFromPdScore(dim.score),
  });
}

function pricePositionFinding(pricePosition, asOf) {
  if (!pricePosition || pricePosition.success !== true) return null;
  const asking = Number(pricePosition.askingPrice);
  const rawCentral = pricePosition.valuationRange?.central ?? pricePosition.valuationRange?.centralEstimate;
  const central = Number(rawCentral?.value ?? rawCentral);
  if (!Number.isFinite(asking) || asking <= 0 || !Number.isFinite(central) || central <= 0) return null;
  const relation = asking < central ? 'below' : asking > central ? 'above' : 'in line with';
  return makeItem({
    id: 'finding_price_position',
    type: 'material_finding',
    state: 'observed',
    title: 'Purchase price position versus current valuation',
    explanation:
      `The scenario purchase price sits ${relation} the current central valuation estimate. This is descriptive valuation context for the landlord scenario. It is not an opportunity label or a purchase recommendation, and landlord fit does not consume it.`,
    importance: IMPORTANCE.contextOnly,
    evidenceRefs: [
      { kind: 'marketIntelligence', path: 'pricePosition' },
      { kind: 'marketIntelligence', path: 'sale' },
    ],
    scope: 'scenario',
    asOf,
    affects: [],
    limitations: [
      'Landlord Personal Decision does not consume price position.',
      'This finding is context only and is not a buy or sell signal.',
    ],
  });
}

function assembleMaterialFindings({
  investment = null,
  personalDecision = null,
  rentIntel = null,
  pricePosition = null,
  asOf = null,
} = {}) {
  const findings = [
    rentPositionFinding(personalDecision, rentIntel, asOf),
    grossYieldFinding(investment, personalDecision, asOf),
    netOperatingFinding(investment, personalDecision, asOf),
    cashFlowFinding(investment, personalDecision, asOf),
    vacancyFinding(personalDecision, asOf),
    dscrFinding(investment, personalDecision, asOf),
    pricePositionFinding(pricePosition, asOf),
  ].filter(Boolean);
  const rank = (id) => {
    const index = MATERIAL_FINDING_ORDER.indexOf(id);
    return index === -1 ? MATERIAL_FINDING_ORDER.length : index;
  };
  return findings.sort((a, b) => {
    const order = rank(a.id) - rank(b.id);
    if (order !== 0) return order;
    return String(a.id).localeCompare(String(b.id));
  });
}

function vacancyDependency(investment, personalDecision, asOf) {
  const missing = missingCostKeys(investment);
  if (!missing.includes('vacancyAssumption')) return null;
  const noiBlocked = fieldNotAssessed(presentedField(investment, 'noi'));
  const netYieldBlocked = fieldNotAssessed(presentedField(investment, 'netYield'));
  const netOperatingBlocked = pdNotAssessed(personalDecision, 'netOperating');
  const cashFlowBlocked = fieldNotAssessed(presentedField(investment, 'annualCashFlow'));
  const dscrBlocked = fieldNotAssessed(presentedField(investment, 'dscr'));
  if (!noiBlocked && !netYieldBlocked && !netOperatingBlocked && !cashFlowBlocked && !dscrBlocked) {
    return null;
  }
  const affects = [];
  if (noiBlocked) affects.push('investment.presented.noi');
  if (netYieldBlocked) affects.push('investment.presented.netYield');
  if (netOperatingBlocked) affects.push('personalDecision.dimensions.netOperating');
  if (cashFlowBlocked) {
    affects.push('investment.presented.annualCashFlow');
    affects.push('investment.presented.monthlyCashFlow');
  }
  if (dscrBlocked) affects.push('investment.presented.dscr');
  if (pdNotAssessed(personalDecision, 'vacancy')) affects.push('personalDecision.dimensions.vacancy');
  if (pdNotAssessed(personalDecision, 'cashFlow')) affects.push('personalDecision.dimensions.cashFlow');
  if (pdNotAssessed(personalDecision, 'dscr')) affects.push('personalDecision.dimensions.dscr');

  return makeItem({
    id: 'vacancy_assumption_missing',
    type: 'missing_finance_input',
    title: 'Vacancy assumption not supplied',
    explanation:
      'Vacancy was not supplied, so NOI, net yield and related landlord results remain not assessed until it is evidenced. Missing vacancy is not 0% occupancy and is not treated as a zero cost.',
    importance: IMPORTANCE.decisionRelevant,
    evidenceRefs: [
      { kind: 'investment.presented', path: 'costEvidence.missing', key: 'vacancyAssumption' },
      { kind: 'personalDecision', path: 'dimensions.vacancy' },
    ],
    scope: 'scenario',
    asOf,
    affects: [...new Set(affects)],
    limitations: [
      'Application defaults are not user-supplied vacancy evidence.',
      'This layer does not invent a vacancy rate.',
    ],
  });
}

function operatingCostDependency(investment, personalDecision, asOf) {
  const missing = missingCostKeys(investment).filter((key) => COST_KEYS_EXCLUDING_VACANCY.includes(key));
  if (!missing.length) return null;
  const noiBlocked = fieldNotAssessed(presentedField(investment, 'noi'));
  const netYieldBlocked = fieldNotAssessed(presentedField(investment, 'netYield'));
  const netOperatingBlocked = pdNotAssessed(personalDecision, 'netOperating');
  const cashFlowBlocked = fieldNotAssessed(presentedField(investment, 'annualCashFlow'));
  const dscrBlocked = fieldNotAssessed(presentedField(investment, 'dscr'));
  if (!noiBlocked && !netYieldBlocked && !netOperatingBlocked && !cashFlowBlocked && !dscrBlocked) {
    return null;
  }
  const labels = labelList(missing, COST_LABELS);
  const affects = [];
  if (noiBlocked) affects.push('investment.presented.noi');
  if (netYieldBlocked) affects.push('investment.presented.netYield');
  if (netOperatingBlocked) affects.push('personalDecision.dimensions.netOperating');
  if (cashFlowBlocked) {
    affects.push('investment.presented.annualCashFlow');
    affects.push('investment.presented.monthlyCashFlow');
  }
  if (dscrBlocked) affects.push('investment.presented.dscr');
  if (pdNotAssessed(personalDecision, 'cashFlow')) affects.push('personalDecision.dimensions.cashFlow');
  if (pdNotAssessed(personalDecision, 'dscr')) affects.push('personalDecision.dimensions.dscr');

  return makeItem({
    id: 'operating_costs_incomplete',
    type: 'missing_finance_input',
    title: 'Operating costs incomplete',
    explanation:
      `Evidenced operating costs are incomplete (${labels.join(', ')}). NOI, net yield and related results remain not assessed until those inputs are supplied. Missing costs are not treated as £0.`,
    importance: IMPORTANCE.decisionRelevant,
    evidenceRefs: [
      { kind: 'investment.presented', path: 'costEvidence.missing', keys: missing },
      { kind: 'personalDecision', path: 'dimensions.netOperating' },
    ],
    scope: 'scenario',
    asOf,
    affects: [...new Set(affects)],
    limitations: [
      'Known costs are not the complete operating-cost total.',
      'This layer does not invent £0 costs.',
    ],
  });
}

function mortgageDependency(investment, personalDecision, asOf) {
  const missing = missingFinanceKeys(investment);
  if (!missing.length) return null;
  const cashFlowBlocked = fieldNotAssessed(presentedField(investment, 'annualCashFlow'));
  const dscrBlocked = fieldNotAssessed(presentedField(investment, 'dscr'));
  const pdCash = pdNotAssessed(personalDecision, 'cashFlow');
  const pdDscr = pdNotAssessed(personalDecision, 'dscr');
  if (!cashFlowBlocked && !dscrBlocked && !pdCash && !pdDscr) return null;

  const labels = labelList(missing, FINANCE_LABELS);
  const affects = [];
  if (cashFlowBlocked || pdCash) {
    affects.push('investment.presented.annualCashFlow');
    affects.push('investment.presented.monthlyCashFlow');
    affects.push('personalDecision.dimensions.cashFlow');
  }
  if (dscrBlocked || pdDscr) {
    affects.push('investment.presented.dscr');
    affects.push('personalDecision.dimensions.dscr');
  }

  return makeItem({
    id: 'mortgage_inputs_incomplete',
    type: 'missing_finance_input',
    title: 'Mortgage inputs incomplete',
    explanation:
      `Cash flow and DSCR remain not assessed because required finance inputs are missing (${labels.join(', ')}). Application defaults are not user-supplied evidence.`,
    importance: IMPORTANCE.decisionRelevant,
    evidenceRefs: [
      { kind: 'investment.presented', path: 'financeEvidence.missing', keys: missing },
    ],
    scope: 'scenario',
    asOf,
    affects: [...new Set(affects)],
    limitations: [
      'Missing mortgage inputs are notAssessed, not a default mortgage.',
    ],
  });
}

function priceRentDependency(investment, personalDecision, asOf) {
  const grossBlocked = fieldNotAssessed(presentedField(investment, 'grossYield'));
  const pdGross = pdNotAssessed(personalDecision, 'grossYield');
  if (!grossBlocked && !pdGross) return null;

  const affects = [];
  if (grossBlocked) affects.push('investment.presented.grossYield');
  if (pdGross) affects.push('personalDecision.dimensions.grossYield');

  return makeItem({
    id: 'purchase_price_or_expected_rent_missing',
    type: 'missing_finance_input',
    title: 'Purchase price or expected rent not evidenced',
    explanation:
      'Gross yield remains not assessed until an evidenced purchase price and expected rent are supplied. This layer does not invent those inputs.',
    importance: IMPORTANCE.decisionRelevant,
    evidenceRefs: [
      { kind: 'investment.presented', path: 'grossYield' },
      { kind: 'personalDecision', path: 'dimensions.grossYield' },
    ],
    scope: 'scenario',
    asOf,
    affects,
    limitations: ['Listing asking and scenario rent remain separate from market rent evidence.'],
  });
}

function demandDependency(personalDecision, asOf) {
  if (!pdNotAssessed(personalDecision, 'demand')) return null;
  const dim = pdDimension(personalDecision, 'demand');
  const reason =
    dim?.unavailableReason
    || (personalDecision?.notAssessed || []).find((row) => row.dimension === 'demand')?.reason
    || 'No property-specific demand data source is connected, so landlord demand cannot be assessed.';

  return makeItem({
    id: 'landlord_demand_not_assessed',
    type: 'unresolved_decision_dimension',
    title: 'Property-specific tenant demand not assessed',
    explanation:
      `${reason} Area buyer-demand or rental-demand bands are context only and do not satisfy landlord demand. Unavailable demand evidence is not a demand rating.`,
    importance: IMPORTANCE.decisionRelevant,
    evidenceRefs: [
      { kind: 'personalDecision', path: 'dimensions.demand' },
      { kind: 'personalDecision', path: 'notAssessed', key: 'demand' },
    ],
    scope: 'property',
    asOf,
    affects: ['personalDecision.dimensions.demand'],
    limitations: [
      'PropertyData /demand and /demand-rent are area context only.',
      'Landlord demand remains notAssessed until a deterministic property-specific mapping is approved.',
    ],
  });
}

function rentPositionDependency(personalDecision, asOf) {
  if (!pdNotAssessed(personalDecision, 'rentPosition')) return null;
  const dim = pdDimension(personalDecision, 'rentPosition');
  const reason =
    dim?.unavailableReason
    || 'Rent position cannot be assessed without evidenced current rent and a market range.';

  return makeItem({
    id: 'rent_position_not_assessed',
    type: 'unresolved_decision_dimension',
    title: 'Rent position not assessed',
    explanation: `${reason} This weakens the landlord decision until rent evidence is available.`,
    importance: IMPORTANCE.decisionRelevant,
    evidenceRefs: [{ kind: 'personalDecision', path: 'dimensions.rentPosition' }],
    scope: 'property',
    asOf,
    affects: ['personalDecision.dimensions.rentPosition'],
    limitations: ['This is not a demand score.'],
  });
}

function conflictItems(propertyFacts, asOf) {
  const conflicts = Array.isArray(propertyFacts?.conflicts) ? propertyFacts.conflicts : [];
  return conflicts
    .filter((row) => row && (present(row.listing) || present(row.external)))
    .map((row) => {
      const field = row.field || 'unknown';
      const label = CONFLICT_FIELD_LABELS[field] || field;
      const selectedSource = row.sourceSelected || 'InternalListing';
      return makeItem({
        id: `conflict_${String(field).replace(/[^a-zA-Z0-9]+/g, '_')}`,
        type: 'canonical_conflict',
        title: `${label} conflict between listing and provider`,
        explanation:
          `The listing value (${row.listing == null ? 'not supplied' : row.listing}) differs from the provider value (${row.external == null ? 'not supplied' : row.external}). The canonical value is the listing (${selectedSource}). Values were not averaged and were not resolved by an LLM.`,
        importance: IMPORTANCE.worthReviewing,
        evidenceRefs: [
          { kind: 'propertyFacts.conflicts', path: field, listing: row.listing ?? null, external: row.external ?? null, selected: row.selected ?? row.listing ?? null, sourceSelected: selectedSource },
        ],
        scope: 'property',
        asOf,
        affects: [],
        limitations: [
          'Canonical precedence keeps the listing value.',
          'This conflict does not currently block landlord fit or presented finance.',
        ],
        state: 'conflictingEvidence',
      });
    });
}

function amenityItem(fact, id, title, asOf) {
  if (!fact || fact.available === true) return null;
  return makeItem({
    id,
    type: 'missing_listing_fact',
    title,
    explanation:
      'This listing field is not assessed. A schema default of false or zero is not observed absence, and it is not a landlord decision input in this phase.',
    importance: IMPORTANCE.informational,
    evidenceRefs: [{ kind: 'propertyFacts', path: `facts.${fact.field || id}` }],
    scope: 'property',
    asOf,
    affects: [],
    limitations: ['Unknown amenities are not investigation priorities unless a landlord dimension requires them.'],
  });
}

function contextItems(propertyFacts, asOf) {
  const facts = propertyFacts?.facts || {};
  return CONTEXT_LAYERS.map((layer) => {
    const fact = facts[layer.field];
    if (!fact) return null;
    const assessed = fact.available === true;
    const article4RestrictionsNotAssessed =
      layer.field === 'article4'
      && fact.restrictionsAssessed === false
      && fact.restrictions?.state === 'notAssessed';
    return makeItem({
      id: layer.id,
      type: 'context_evidence',
      title: layer.title,
      explanation: assessed ? layer.assessedExplanation : layer.unknownExplanation,
      importance: IMPORTANCE.contextOnly,
      evidenceRefs: [
        { kind: 'propertyFacts', path: `facts.${layer.field}` },
        ...(layer.field === 'article4'
          ? [{ kind: 'propertyFacts', path: 'facts.article4.restrictions', state: 'notAssessed' }]
          : []),
      ],
      scope: fact.scope || (assessed ? 'property' : 'property'),
      asOf: fact.evidenceAsOf || fact.retrievedAt || asOf,
      affects: [],
      limitations: [
        'No approved deterministic rule connects this evidence to landlord score, valuation, or finance.',
        'Unknown is not a negative or “all clear” result.',
        ...(article4RestrictionsNotAssessed
          ? ['Permitted-development restrictions remain not assessed.']
          : []),
      ],
      state: assessed ? 'observed' : 'notAssessed',
    });
  }).filter(Boolean);
}

function orderInvestigationPriorities(dependencies) {
  const relevant = dependencies.filter((item) => item.importance === IMPORTANCE.decisionRelevant);
  const reviewing = dependencies.filter((item) => item.importance === IMPORTANCE.worthReviewing);
  const rank = (id) => {
    const index = DECISION_RELEVANT_ORDER.indexOf(id);
    return index === -1 ? DECISION_RELEVANT_ORDER.length : index;
  };
  const byRule = (a, b) => {
    const order = rank(a.id) - rank(b.id);
    if (order !== 0) return order;
    return String(a.id).localeCompare(String(b.id));
  };
  return [...relevant.sort(byRule), ...reviewing.sort((a, b) => String(a.id).localeCompare(String(b.id)))];
}

function metricDependsOnInput(metric, inputKey, seen = new Set()) {
  if (seen.has(metric)) return false;
  seen.add(metric);
  const deps = METRIC_DEPENDENCIES[metric] || [];
  return deps.some((dep) => {
    if (dep === inputKey) return true;
    if (METRIC_DEPENDENCIES[dep]) return metricDependsOnInput(dep, inputKey, seen);
    return false;
  });
}

function presentedMetricsForInput(inputKey) {
  const metrics = PRESENTED_METRICS.filter((metric) => metricDependsOnInput(metric, inputKey));
  if (inputKey === 'mortgageAmount') {
    ['annualCashFlow', 'monthlyCashFlow', 'dscr'].forEach((metric) => {
      if (!metrics.includes(metric)) metrics.push(metric);
    });
  }
  return metrics;
}

function inputIsEvidenced(inputKey, investment, financeRequest) {
  if (inputKey === 'purchasePrice' || inputKey === 'expectedRent') {
    if (presentedAvailable(investment, 'grossYield')) return true;
    const slice = financeRequest?.[inputKey];
    if (slice && (slice.scenarioPurchasePrice != null || slice.scenarioInput != null || slice.calculationSelectedValue != null)) {
      return true;
    }
  }
  const costIncluded = investment?.presented?.costEvidence?.included || [];
  const financeIncluded = investment?.presented?.financeEvidence?.included || [];
  if (costIncluded.includes(inputKey) || financeIncluded.includes(inputKey)) return true;
  const used = financeRequest?.used;
  if (Array.isArray(used) && used.some((row) => row.key === inputKey && row.value != null)) return true;
  return false;
}

function currentDriverValue(inputKey, investment, financeRequest) {
  if (financeRequest) {
    if (inputKey === 'purchasePrice') {
      const slice = financeRequest.purchasePrice || {};
      const value = slice.scenarioPurchasePrice ?? slice.calculationSelectedValue;
      return Number.isFinite(Number(value)) ? Number(value) : null;
    }
    if (inputKey === 'expectedRent') {
      const slice = financeRequest.expectedRent || {};
      const value = slice.scenarioInput ?? slice.calculationSelectedValue;
      return Number.isFinite(Number(value)) ? Number(value) : null;
    }
    const used = (financeRequest.used || []).find((row) => row.key === inputKey);
    if (used && Number.isFinite(Number(used.value))) return Number(used.value);
    const received = (financeRequest.received || []).find((row) => row.key === inputKey);
    if (received && Number.isFinite(Number(received.value))) return Number(received.value);
  }
  const costRow = (investment?.presented?.costEvidence?.costs || []).find(
    (row) => row.key === inputKey && row.included && !row.defaulted
  );
  if (costRow && Number.isFinite(Number(costRow.value))) return Number(costRow.value);
  const financeRow = (investment?.presented?.financeEvidence?.inputs || []).find(
    (row) => row.key === inputKey && row.included && !row.defaulted
  );
  if (financeRow && Number.isFinite(Number(financeRow.value))) return Number(financeRow.value);
  return null;
}

function directionRelations(inputKey, mortgageAmountIndependent) {
  const decreaseOperating = [
    { output: 'investment.presented.noi', whenInputIncreases: 'decreases' },
    { output: 'investment.presented.netYield', whenInputIncreases: 'decreases' },
    { output: 'investment.presented.annualCashFlow', whenInputIncreases: 'decreases' },
    { output: 'investment.presented.dscr', whenInputIncreases: 'decreases' },
  ];
  if (inputKey === 'purchasePrice') {
    const relations = [
      { output: 'investment.presented.grossYield', whenInputIncreases: 'decreases' },
      { output: 'investment.presented.netYield', whenInputIncreases: 'decreases' },
    ];
    if (!mortgageAmountIndependent) {
      relations.push(
        { output: 'investment.presented.annualCashFlow', whenInputIncreases: 'decreases' },
        { output: 'investment.presented.dscr', whenInputIncreases: 'decreases' }
      );
    }
    return relations;
  }
  if (inputKey === 'expectedRent') {
    return [
      { output: 'investment.presented.grossYield', whenInputIncreases: 'increases' },
      { output: 'investment.presented.noi', whenInputIncreases: 'increases' },
      { output: 'investment.presented.netYield', whenInputIncreases: 'increases' },
      { output: 'investment.presented.annualCashFlow', whenInputIncreases: 'increases' },
      { output: 'investment.presented.dscr', whenInputIncreases: 'increases' },
    ];
  }
  if (inputKey === 'vacancyAssumption' || OPERATING_COST_KEYS.filter((key) => key !== 'vacancyAssumption').includes(inputKey)) {
    return decreaseOperating;
  }
  if (inputKey === 'interestRate' || inputKey === 'mortgageAmount') {
    return [
      { output: 'investment.presented.annualCashFlow', whenInputIncreases: 'decreases' },
      { output: 'investment.presented.dscr', whenInputIncreases: 'decreases' },
    ];
  }
  if (inputKey === 'mortgageTermYears') {
    return [
      { output: 'investment.presented.annualCashFlow', whenInputIncreases: 'increases' },
      { output: 'investment.presented.dscr', whenInputIncreases: 'increases' },
    ];
  }
  if (inputKey === 'deposit' && !mortgageAmountIndependent) {
    return [
      { output: 'investment.presented.annualCashFlow', whenInputIncreases: 'increases' },
      { output: 'investment.presented.dscr', whenInputIncreases: 'increases' },
    ];
  }
  return [];
}

function driverExplanation(inputKey) {
  if (inputKey === 'purchasePrice') {
    return 'Purchase price can change gross yield and, when costs are complete, net yield. It does not change the valuation estimate. Listing asking versus valuation remains separate.';
  }
  if (inputKey === 'expectedRent') {
    return 'Expected rent is a user scenario input, not market rent. It can change gross yield and, where completeness is met, NOI, net yield, cash flow and DSCR, and the landlord rent-position dimension.';
  }
  if (inputKey === 'vacancyAssumption') {
    return 'Vacancy is a scenario assumption. It can change NOI, net yield, cash flow and DSCR once operating costs are complete, and the landlord vacancy dimension when the assumption is supplied.';
  }
  if (OPERATING_COST_KEYS.includes(inputKey) && inputKey !== 'vacancyAssumption') {
    return `${DRIVER_TITLES[inputKey]} is a scenario operating-cost input. It can change NOI and net yield when the operating-cost set is complete, and cash flow and DSCR when finance is also complete.`;
  }
  if (inputKey === 'deposit') {
    return 'Deposit can change derived mortgage principal, then cash flow and DSCR, when a mortgage amount is not independently supplied. This is not lender advice.';
  }
  if (inputKey === 'mortgageAmount') {
    return 'Mortgage amount can change debt service, then cash flow and DSCR, when finance and operating costs are complete. This is not lender advice.';
  }
  if (inputKey === 'interestRate') {
    return 'Interest rate can change debt service, then cash flow and DSCR, when finance and operating costs are complete. Higher rates increase debt service in the existing payment formula. This is not lender advice.';
  }
  return 'Mortgage term can change debt service, then cash flow and DSCR, when finance and operating costs are complete. A longer term lowers the existing amortising payment. This is not lender advice.';
}

function assembleSensitivityDrivers({
  investment = null,
  personalDecision = null,
  financeRequest = null,
  asOf = null,
} = {}) {
  const mortgageAmountIndependent = inputIsEvidenced('mortgageAmount', investment, financeRequest);
  return SENSITIVITY_DRIVER_ORDER.map((inputKey) => {
    const metrics = presentedMetricsForInput(inputKey);
    const affects = [];
    metrics.forEach((metric) => {
      affects.push(`investment.presented.${metric}`);
      (METRIC_TO_PD[metric] || []).forEach((path) => {
        if (!affects.includes(path)) affects.push(path);
      });
    });
    if (inputKey === 'expectedRent' && !affects.includes('personalDecision.dimensions.rentPosition')) {
      affects.push('personalDecision.dimensions.rentPosition');
    }
    if (inputKey === 'vacancyAssumption' && !affects.includes('personalDecision.dimensions.vacancy')) {
      affects.push('personalDecision.dimensions.vacancy');
    }
    if (inputKey === 'purchasePrice' && !mortgageAmountIndependent) {
      ['investment.presented.annualCashFlow', 'investment.presented.monthlyCashFlow', 'investment.presented.dscr'].forEach((path) => {
        if (!affects.includes(path)) affects.push(path);
      });
      ['personalDecision.dimensions.cashFlow', 'personalDecision.dimensions.dscr'].forEach((path) => {
        if (!affects.includes(path)) affects.push(path);
      });
    }

    const currentlyAssessedAffects = affects.filter((path) => {
      const presentedMatch = path.match(/^investment\.presented\.(.+)$/);
      if (presentedMatch) return presentedAvailable(investment, presentedMatch[1]);
      const dimMatch = path.match(/^personalDecision\.dimensions\.(.+)$/);
      if (dimMatch) return pdAssessed(personalDecision, dimMatch[1]);
      return false;
    });

    const evidenced = inputIsEvidenced(inputKey, investment, financeRequest);
    const state = evidenced && currentlyAssessedAffects.length
      ? DRIVER_STATE.active
      : DRIVER_STATE.conditional;

    const spec = FIELD_CONTRACT[inputKey] || {};
    const relations = directionRelations(inputKey, mortgageAmountIndependent);
    const limitations = [
      'This is a scenario dependency map, not a score change and not an automatic What-if run.',
      'Personal Decision score is not recalculated until the user runs an explicit What-if.',
    ];
    if (inputKey === 'purchasePrice') {
      limitations.push('Purchase price does not change the valuation estimate.');
    }
    if (inputKey === 'expectedRent') {
      limitations.push('Expected rent is not market rent.');
    }
    if (inputKey === 'deposit' && mortgageAmountIndependent) {
      limitations.push('Cash flow and DSCR use the supplied mortgage amount, so deposit does not currently change debt service.');
    }
    if (['deposit', 'mortgageAmount', 'interestRate', 'mortgageTermYears'].includes(inputKey)) {
      limitations.push('This is not a lending decision or an optimal-finance recommendation.');
    }

    return {
      id: `driver_${inputKey}`,
      type: 'sensitivity_driver',
      inputKey,
      title: DRIVER_TITLES[inputKey],
      explanation: driverExplanation(inputKey),
      state,
      scope: 'scenario',
      group: DRIVER_GROUPS[inputKey],
      currentValue: currentDriverValue(inputKey, investment, financeRequest),
      currentUnit: spec.unit || null,
      affects,
      currentlyAssessedAffects,
      evidenceRefs: [
        { kind: 'financeInputContract', path: inputKey },
        ...metrics.map((metric) => ({ kind: 'investment.presented', path: metric })),
      ],
      directionality: {
        whenInputIncreases: relations,
      },
      asOf,
      limitations,
    };
  });
}

function emptyDecisionIntelligence({ evidenceAsOf = null, reason = null } = {}) {
  return {
    engine: ENGINE,
    version: VERSION,
    scoringActivated: false,
    profile: 'landlord',
    evidenceAsOf,
    unresolvedDependencies: [],
    investigationPriorities: [],
    materialFindings: [],
    sensitivityDrivers: [],
    notAScore: true,
    notPurchaseAdvice: true,
    note: reason || 'No unresolved decision dependencies were identified from canonical evidence.',
  };
}

function assembleDecisionIntelligence({
  propertyFacts = null,
  investment = null,
  personalDecision = null,
  evidenceAsOf = null,
  rentIntel = null,
  pricePosition = null,
  financeRequest = null,
} = {}) {
  const asOf = evidenceAsOf || propertyFacts?.retrievedAt || personalDecision?.assessedAt || null;
  const unresolved = [];

  const vacancy = vacancyDependency(investment, personalDecision, asOf);
  if (vacancy) unresolved.push(vacancy);
  const costs = operatingCostDependency(investment, personalDecision, asOf);
  if (costs) unresolved.push(costs);
  const mortgage = mortgageDependency(investment, personalDecision, asOf);
  if (mortgage) unresolved.push(mortgage);
  const priceRent = priceRentDependency(investment, personalDecision, asOf);
  if (priceRent) unresolved.push(priceRent);
  const rentPosition = rentPositionDependency(personalDecision, asOf);
  if (rentPosition) unresolved.push(rentPosition);
  const demand = demandDependency(personalDecision, asOf);
  if (demand) unresolved.push(demand);

  unresolved.push(...conflictItems(propertyFacts, asOf));

  const outdoor = amenityItem(propertyFacts?.facts?.outdoorSpace, 'amenity_outdoor_space_unknown', 'Outdoor space not assessed', asOf);
  const garage = amenityItem(propertyFacts?.facts?.garage, 'amenity_garage_unknown', 'Garage not assessed', asOf);
  const parking = amenityItem(propertyFacts?.facts?.parkingSpaces, 'amenity_parking_unknown', 'Parking not assessed', asOf);
  if (outdoor) unresolved.push(outdoor);
  if (garage) unresolved.push(garage);
  if (parking) unresolved.push(parking);

  unresolved.push(...contextItems(propertyFacts, asOf));

  const investigationPriorities = orderInvestigationPriorities(unresolved);
  const materialFindings = assembleMaterialFindings({
    investment,
    personalDecision,
    rentIntel,
    pricePosition,
    asOf,
  });
  const sensitivityDrivers = assembleSensitivityDrivers({
    investment,
    personalDecision,
    financeRequest,
    asOf,
  });

  return {
    engine: ENGINE,
    version: VERSION,
    scoringActivated: false,
    profile: 'landlord',
    evidenceAsOf: asOf,
    unresolvedDependencies: unresolved,
    investigationPriorities,
    materialFindings,
    sensitivityDrivers,
    notAScore: true,
    notPurchaseAdvice: true,
    note:
      investigationPriorities.length
        ? 'Investigation priorities are unresolved decision dependencies that currently block or weaken the landlord decision, plus canonical conflicts worth reviewing.'
        : 'No decision-relevant unknowns or canonical conflicts currently require investigation.',
  };
}

function publicDecisionIntelligenceForExplanation(decisionIntelligence) {
  if (!decisionIntelligence) return null;
  return {
    engine: decisionIntelligence.engine,
    version: decisionIntelligence.version,
    scoringActivated: false,
    profile: decisionIntelligence.profile || 'landlord',
    evidenceAsOf: decisionIntelligence.evidenceAsOf || null,
    unresolvedDependencies: Array.isArray(decisionIntelligence.unresolvedDependencies)
      ? decisionIntelligence.unresolvedDependencies
      : [],
    investigationPriorities: Array.isArray(decisionIntelligence.investigationPriorities)
      ? decisionIntelligence.investigationPriorities
      : [],
    materialFindings: Array.isArray(decisionIntelligence.materialFindings)
      ? decisionIntelligence.materialFindings
      : [],
    sensitivityDrivers: Array.isArray(decisionIntelligence.sensitivityDrivers)
      ? decisionIntelligence.sensitivityDrivers
      : [],
    note: decisionIntelligence.note || null,
    notAScore: true,
    notPurchaseAdvice: true,
  };
}

module.exports = {
  ENGINE,
  VERSION,
  IMPORTANCE,
  EFFECT,
  MATERIAL_FINDING_ORDER,
  DRIVER_STATE,
  DRIVER_GROUP,
  SENSITIVITY_DRIVER_ORDER,
  assembleDecisionIntelligence,
  publicDecisionIntelligenceForExplanation,
  emptyDecisionIntelligence,
  orderInvestigationPriorities,
};
