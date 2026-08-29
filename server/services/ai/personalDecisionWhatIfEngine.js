/**
 * What-if Simulator — personal-decision-whatif-1.0.0.
 *
 * A scenario is a patch over the existing analysis inputs. The fit is always
 * re-scored by scorePersonalDecision. Profile enablement follows the same
 * versioned config as the scorer. Valuation and comparables are reused
 * unless the scenario explicitly changes the evidence set. Mortgage figures
 * come from financialEngine payment functions and are omitted when inputs
 * are missing — never defaulted.
 */

const { scorePersonalDecision, profileIsSupported } = require('./personalDecisionEngine');
const { monthlyMortgagePayment, annualMortgagePayment, calculateInvestmentMetrics, calculateInvestmentScore } = require('./financialEngine');
const {
  personalDecisionConfig,
  CONFIDENCE_MODEL_VERSION,
  WHAT_IF_VERSION,
} = require('../../config/personalDecision.config');
const {
  buildDeterministicDeltaExplanation,
  explainPersonalDecisionDelta,
} = require('./personalDecisionWhyEngine');
const { buildLandlordFinanceInput, COST_KEYS } = require('./personalDecisionLandlord');
const { parseFinancePayload } = require('./financeInputContract');

const PREFERENCE_KEYS = [
  'budgetMax',
  'budgetMin',
  'budget',
  'location',
  'locations',
  'locationType',
  'bedrooms',
  'bedroomsMustHave',
  'mustHaveBedrooms',
  'propertyType',
  'type',
  'lifestyle',
  'transport',
  'maxCommuteMinutes',
  'commuteMinutes',
  'maxStationMiles',
  'parking',
  'destination',
  'radius',
  'radiusMiles',
  'maxRadiusMiles',
  'minYield',
  'minimumYield',
  'minDscr',
  'minimumDscr',
];

const FINANCE_KEYS = [
  'deposit',
  'interestRate',
  'mortgageTermYears',
  'mortgageAmount',
  'expectedRent',
  'monthlyRent',
  'rent',
  'vacancyAssumption',
  'vacancy',
  'maintenance',
  'insurance',
  'managementFee',
  'serviceCharge',
  'groundRent',
  'taxes',
  'otherExpenses',
];

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function supplied(value) {
  return value !== undefined && value !== null && value !== '' && Number.isFinite(Number(value));
}

function snapshotValuation(intelligence) {
  const sale =
    intelligence?.sale || intelligence?.marketIntelligence?.sale || intelligence?.valuation || null;
  if (!sale) return null;
  const central = sale.centralEstimate?.value ?? sale.centralEstimate ?? null;
  const lower = sale.lowerEstimate?.value ?? sale.lowerEstimate ?? null;
  const upper = sale.upperEstimate?.value ?? sale.upperEstimate ?? null;
  return {
    success: sale.success !== false,
    centralEstimate: central,
    lowerEstimate: lower,
    upperEstimate: upper,
    evidenceCount: sale.evidenceCount ?? null,
  };
}

function snapshotConfidence(decision) {
  return {
    level: decision?.confidence?.level || null,
    assessed: decision?.confidence?.assessed ?? null,
    model: decision?.confidence?.model || CONFIDENCE_MODEL_VERSION,
  };
}

function applyScenarioPatch(base = {}, scenario = {}) {
  const property = clone(base.property) || {};
  const preferences = { ...(base.preferences || {}) };
  const intelligence = clone(base.intelligence) || {};
  const finance = { ...(base.finance || {}) };

  const nested = scenario.patch && typeof scenario.patch === 'object' ? scenario.patch : {};
  const patch = { ...nested, ...scenario };
  delete patch.patch;
  delete patch.preferences;
  delete patch.evidence;
  delete patch.finance;

  const listedPrice = supplied(property.listedPrice) ? Number(property.listedPrice) : Number(property.price);
  const offer = [patch.offerPrice, patch.price, patch.askingPrice].find((v) => v != null);
  const priceChanged = offer != null && Number(offer) !== Number(property.price);
  if (offer != null) {
    if (property.listedPrice == null && Number.isFinite(listedPrice)) {
      property.listedPrice = listedPrice;
    }
    property.price = Number(offer);
  }

  if (scenario.preferences && typeof scenario.preferences === 'object') {
    Object.assign(preferences, scenario.preferences);
  }
  PREFERENCE_KEYS.forEach((key) => {
    if (patch[key] != null) preferences[key] = patch[key];
  });

  const financePatch = {
    ...(scenario.finance && typeof scenario.finance === 'object' ? scenario.finance : {}),
  };
  FINANCE_KEYS.forEach((key) => {
    if (patch[key] != null) financePatch[key] = patch[key];
  });
  Object.assign(finance, financePatch);
  const parsedFinance = parseFinancePayload(finance);
  Object.assign(finance, parsedFinance.engineInputs);
  [
    'expectedRent',
    'monthlyRent',
    'rent',
    'vacancyAssumption',
    'vacancy',
    'deposit',
    'interestRate',
    'mortgageTermYears',
    'mortgageAmount',
    ...COST_KEYS,
  ].forEach((key) => {
    if (finance[key] && typeof finance[key] === 'object') delete finance[key];
  });

  const rentValue = [finance.expectedRent, finance.monthlyRent, finance.rent, patch.rent].find(
    (v) => v != null
  );
  if (rentValue != null) {
    const rent = Number(rentValue);
    finance.expectedRent = rent;
    property.monthly_rent = rent;
  }
  if (finance.vacancy != null && finance.vacancyAssumption == null) {
    finance.vacancyAssumption = finance.vacancy;
  }

  let evidenceChanged = false;
  if (scenario.evidence && typeof scenario.evidence === 'object' && Object.keys(scenario.evidence).length) {
    evidenceChanged = true;
    Object.assign(intelligence, clone(scenario.evidence));
  }

  if (priceChanged && !evidenceChanged) {
    delete intelligence.pricePosition;
    if (intelligence.marketIntelligence) {
      intelligence.marketIntelligence = { ...intelligence.marketIntelligence };
      delete intelligence.marketIntelligence.pricePosition;
    }
  }

  return {
    property,
    preferences,
    intelligence,
    finance,
    priceChanged,
    evidenceChanged,
    applied: {
      offerPrice: offer != null ? Number(offer) : undefined,
      preferences: scenario.preferences || undefined,
      finance: Object.keys(financePatch).length ? financePatch : undefined,
      evidenceChanged,
    },
  };
}

function investmentFigures(price, finance = {}) {
  const input = buildLandlordFinanceInput({ price }, {}, finance);
  if (!supplied(input.purchasePrice) || !supplied(input.expectedRent)) {
    return { grossYield: null, noi: null, annualCashFlow: null, dscr: null };
  }
  const metrics = calculateInvestmentMetrics(input);
  const inv = calculateInvestmentScore(metrics);
  const costsDefaulted = Boolean(
    metrics.assumptionCoverage?.materialDefaults?.some((k) => COST_KEYS.includes(k))
  );
  return {
    grossYield: inv.componentDetail.yield?.available ? metrics.grossYield : null,
    noi:
      !costsDefaulted && inv.componentDetail.yield?.available ? metrics.noi : null,
    annualCashFlow: inv.componentDetail.cashFlow?.available ? metrics.annualCashFlow : null,
    dscr: inv.componentDetail.dscr?.available ? metrics.dscr : null,
  };
}

function financeSnapshot(price, finance = {}) {
  const hasPrice = supplied(price);
  const hasDeposit = supplied(finance.deposit);
  const hasRate = supplied(finance.interestRate);
  const hasTerm = supplied(finance.mortgageTermYears);
  const inv = investmentFigures(price, finance);
  const mortgageOk = hasPrice && hasDeposit && hasRate && hasTerm;

  const base = {
    deposit: hasDeposit ? Number(finance.deposit) : null,
    interestRate: hasRate ? Number(finance.interestRate) : null,
    mortgageTermYears: hasTerm ? Number(finance.mortgageTermYears) : null,
    ...inv,
  };

  if (!mortgageOk) {
    return {
      available: inv.grossYield != null,
      monthlyPayment: null,
      annualDebtService: null,
      mortgageAmount: null,
      ...base,
      unavailableReason:
        'Mortgage figures are not assessed unless purchase price, deposit, interest rate and term are all supplied. Missing inputs are not defaulted.',
    };
  }

  const purchasePrice = Number(price);
  const deposit = Number(finance.deposit);
  const interestRate = Number(finance.interestRate);
  const mortgageTermYears = Number(finance.mortgageTermYears);
  const mortgageAmount = supplied(finance.mortgageAmount)
    ? Number(finance.mortgageAmount)
    : Math.max(0, purchasePrice - deposit);
  const monthly = monthlyMortgagePayment(mortgageAmount, interestRate, mortgageTermYears);
  const annual = annualMortgagePayment(mortgageAmount, interestRate, mortgageTermYears);

  return {
    available: true,
    monthlyPayment: Math.round(monthly * 100) / 100,
    annualDebtService: Math.round(annual * 100) / 100,
    mortgageAmount,
    purchasePrice,
    ...base,
    unavailableReason: null,
  };
}

function pair(before, after) {
  if (before == null && after == null) return { before: null, after: null, delta: null };
  if (!Number.isFinite(Number(before)) || !Number.isFinite(Number(after))) {
    return { before: before ?? null, after: after ?? null, delta: null };
  }
  const b = Number(before);
  const a = Number(after);
  return { before: b, after: a, delta: Math.round((a - b) * 100) / 100 };
}

function compareFinance(baseSnap, scenarioSnap) {
  if (!baseSnap.available && !scenarioSnap.available) {
    return {
      available: false,
      affordability: null,
      monthlyPayment: null,
      annualDebtService: null,
      mortgageAmount: null,
      deposit: pair(baseSnap.deposit, scenarioSnap.deposit),
      interestRate: pair(baseSnap.interestRate, scenarioSnap.interestRate),
      mortgageTermYears: pair(baseSnap.mortgageTermYears, scenarioSnap.mortgageTermYears),
      grossYield: pair(baseSnap.grossYield, scenarioSnap.grossYield),
      noi: pair(baseSnap.noi, scenarioSnap.noi),
      annualCashFlow: pair(baseSnap.annualCashFlow, scenarioSnap.annualCashFlow),
      dscr: pair(baseSnap.dscr, scenarioSnap.dscr),
      unavailableReason: baseSnap.unavailableReason,
    };
  }
  if (!baseSnap.available || !scenarioSnap.available) {
    return {
      available: false,
      affordability: null,
      monthlyPayment: null,
      annualDebtService: null,
      mortgageAmount: null,
      deposit: pair(baseSnap.deposit, scenarioSnap.deposit),
      interestRate: pair(baseSnap.interestRate, scenarioSnap.interestRate),
      mortgageTermYears: pair(baseSnap.mortgageTermYears, scenarioSnap.mortgageTermYears),
      unavailableReason:
        'Mortgage figures cannot be compared unless purchase price, deposit, interest rate and term are supplied on both the base and the scenario.',
    };
  }

  const monthly = pair(baseSnap.monthlyPayment, scenarioSnap.monthlyPayment);
  let affordability = 'unchanged';
  if (monthly.delta > 0) affordability = 'worse';
  else if (monthly.delta < 0) affordability = 'better';

  const grossYield = pair(baseSnap.grossYield, scenarioSnap.grossYield);
  const noi = pair(baseSnap.noi, scenarioSnap.noi);
  const annualCashFlow = pair(baseSnap.annualCashFlow, scenarioSnap.annualCashFlow);
  const dscr = pair(baseSnap.dscr, scenarioSnap.dscr);
  let cashFlowImpact = 'unchanged';
  if (annualCashFlow.delta != null) {
    if (annualCashFlow.delta < 0) cashFlowImpact = 'worse';
    else if (annualCashFlow.delta > 0) cashFlowImpact = 'better';
  }

  return {
    available: true,
    affordability,
    cashFlowImpact,
    monthlyPayment: monthly,
    annualDebtService: pair(baseSnap.annualDebtService, scenarioSnap.annualDebtService),
    mortgageAmount: pair(baseSnap.mortgageAmount, scenarioSnap.mortgageAmount),
    deposit: pair(baseSnap.deposit, scenarioSnap.deposit),
    interestRate: pair(baseSnap.interestRate, scenarioSnap.interestRate),
    mortgageTermYears: pair(baseSnap.mortgageTermYears, scenarioSnap.mortgageTermYears),
    grossYield,
    noi,
    annualCashFlow,
    dscr,
    unavailableReason: null,
  };
}

function dimensionDeltas(baseDecision, scenarioDecision) {
  const keys = new Set([
    ...Object.keys(baseDecision.dimensions || {}),
    ...Object.keys(scenarioDecision.dimensions || {}),
  ]);
  const deltas = {};
  keys.forEach((key) => {
    const b = baseDecision.dimensions?.[key] || {};
    const s = scenarioDecision.dimensions?.[key] || {};
    const both = b.available && s.available && Number.isFinite(b.score) && Number.isFinite(s.score);
    deltas[key] = {
      before: b.available ? b.score : null,
      after: s.available ? s.score : null,
      delta: both ? s.score - b.score : null,
      availableBefore: Boolean(b.available),
      availableAfter: Boolean(s.available),
      stateBefore: b.state || null,
      stateAfter: s.state || null,
    };
  });
  return deltas;
}

function constraintKey(item) {
  return `${item.constraint}:${item.state}`;
}

function compareConstraints(before = [], after = []) {
  const beforeMap = new Map(before.map((c) => [constraintKey(c), c]));
  const afterMap = new Map(after.map((c) => [constraintKey(c), c]));
  const cleared = [...beforeMap.entries()].filter(([k]) => !afterMap.has(k)).map(([, c]) => c);
  const added = [...afterMap.entries()].filter(([k]) => !beforeMap.has(k)).map(([, c]) => c);
  return { before, after, cleared, added };
}

function valuationsEqual(a, b) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return (
    a.centralEstimate === b.centralEstimate &&
    a.lowerEstimate === b.lowerEstimate &&
    a.upperEstimate === b.upperEstimate &&
    a.evidenceCount === b.evidenceCount
  );
}

/**
 * Deterministic what-if comparison. Does not call the LLM.
 */
function comparePersonalDecisionWhatIf(input = {}) {
  const profileName = input.profile || 'buyer_general';
  const scenario = input.scenario || {};
  const asOf = input.asOf;

  const model = {
    version: WHAT_IF_VERSION,
    decisionModel: personalDecisionConfig.version,
    confidenceModel: CONFIDENCE_MODEL_VERSION,
    whyEngine: personalDecisionConfig.whyEngineVersion,
    profile: profileName,
  };

  if (!profileIsSupported(profileName)) {
    return {
      model,
      profile: profileName,
      available: false,
      baseScore: null,
      scenarioScore: null,
      outcomeBefore: null,
      outcomeAfter: null,
      unavailableReason: `Profile "${profileName}" is not implemented in ${WHAT_IF_VERSION}.`,
    };
  }

  const baseInput = {
    profile: profileName,
    property: input.property,
    preferences: input.preferences || {},
    intelligence: input.intelligence || {},
    finance: input.finance || {},
    asOf,
  };
  const patched = applyScenarioPatch(
    {
      property: input.property,
      preferences: input.preferences,
      intelligence: input.intelligence,
      finance: input.finance,
    },
    scenario
  );

  const baseDecision = scorePersonalDecision(baseInput);
  const scenarioDecision = scorePersonalDecision({
    profile: profileName,
    property: patched.property,
    preferences: patched.preferences,
    intelligence: patched.intelligence,
    finance: patched.finance,
    asOf,
  });

  const valuationBefore = snapshotValuation(baseInput.intelligence);
  const valuationAfter = snapshotValuation(patched.intelligence);
  const confidenceBefore = snapshotConfidence(baseDecision);
  const confidenceAfter = snapshotConfidence(scenarioDecision);
  const confidenceUnchanged =
    !patched.evidenceChanged &&
    confidenceBefore.level === confidenceAfter.level &&
    confidenceBefore.assessed === confidenceAfter.assessed;

  const scoreDelta =
    Number.isFinite(baseDecision.score) && Number.isFinite(scenarioDecision.score)
      ? scenarioDecision.score - baseDecision.score
      : null;

  const financialDeltas = compareFinance(
    financeSnapshot(baseInput.property?.price, input.finance),
    financeSnapshot(patched.property?.price, patched.finance)
  );

  const comparison = {
    model,
    profile: profileName,
    available: true,
    scenario: {
      applied: patched.applied,
      priceChanged: patched.priceChanged,
      evidenceChanged: patched.evidenceChanged,
    },
    baseScore: baseDecision.score,
    scenarioScore: scenarioDecision.score,
    scoreDelta,
    outcomeBefore: baseDecision.outcome,
    outcomeAfter: scenarioDecision.outcome,
    decisionBefore: baseDecision.decision,
    decisionAfter: scenarioDecision.decision,
    dimensionDeltas: dimensionDeltas(baseDecision, scenarioDecision),
    constraints: compareConstraints(baseDecision.constraintFailures, scenarioDecision.constraintFailures),
    financialDeltas,
    valuation: {
      before: valuationBefore,
      after: valuationAfter,
      unchanged: valuationsEqual(valuationBefore, valuationAfter),
    },
    confidence: {
      before: confidenceBefore,
      after: confidenceAfter,
      unchanged: confidenceUnchanged,
    },
    base: baseDecision,
    scenarioResult: scenarioDecision,
    unavailableReason: null,
    assessedAt: scenarioDecision.assessedAt,
  };

  comparison.deterministicDeltaExplanation = buildDeterministicDeltaExplanation(comparison);
  return comparison;
}

async function simulatePersonalDecisionWhatIf(input = {}, options = {}) {
  const comparison = comparePersonalDecisionWhatIf(input);
  if (!comparison.available) {
    return { ...comparison, aiNarrative: null };
  }
  return explainPersonalDecisionDelta(comparison, options);
}

module.exports = {
  comparePersonalDecisionWhatIf,
  simulatePersonalDecisionWhatIf,
  applyScenarioPatch,
  WHAT_IF_VERSION,
};
