/**
 * V1.1 Phase 3 — canonical finance presentation vs Personal Decision / Why-this-score.
 * Run: node server/tests/financeExplanationConsistency.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { assemblePropertyIntelligenceReport } = require('../services/ai/propertyIntelligenceEngine');
const { parseAnalyseFinanceRequest } = require('../services/ai/financeInputContract');
const { calculateInvestmentMetrics } = require('../services/ai/financialEngine');
const { executeIntelligenceWhatIf } = require('../services/ai/intelligenceWhatIfService');
const { comparePersonalDecisionWhatIf } = require('../services/ai/personalDecisionWhatIfEngine');
const {
  intelligenceFromCanonicalReport,
  scoreCanonicalLandlordDecision,
  propertyWithFinanceScenario,
  numericFinanceValue,
} = require('../services/ai/personalDecisionCanonical');
const {
  LANDLORD_WEIGHTS,
  OUTCOME_THRESHOLDS,
  WHAT_IF_VERSION,
} = require('../config/personalDecision.config');
const {
  MATERIAL_FINDING_ORDER,
  SENSITIVITY_DRIVER_ORDER,
} = require('../services/ai/decisionIntelligence');
const { annotateStoredAnalysis } = require('../models/AiRequest');
const { getMonthlyRent, toListingNumber } = require('../services/ai/propertyDataAggregator');

const pending = [];

function test(name, fn) {
  const result = fn();
  if (result && typeof result.then === 'function') {
    throw new Error(`Use asyncTest for ${name}`);
  }
  console.log(`✓ ${name}`);
}

function asyncTest(name, fn) {
  pending.push({ name, fn });
}

const ASOF = '2026-08-27T12:00:00.000Z';

const COMPLETE_OPERATING = {
  maintenance: 1200,
  insurance: 600,
  managementFee: 0,
  taxes: 0,
  serviceCharge: 0,
  groundRent: 0,
  vacancyAssumption: 0,
};

const COMPLETE_FINANCE = {
  deposit: 50000,
  interestRate: 5,
  mortgageTermYears: 25,
};

const COMPLETE_SCENARIO = {
  purchasePrice: 185000,
  expectedRent: 1100,
  ...COMPLETE_OPERATING,
  ...COMPLETE_FINANCE,
};

const NESTED_COMPLETE_WITHOUT_LISTING_CHARGES = {
  finance: {
    purchasePrice: 185000,
    expectedRent: 1100,
    operatingCosts: {
      maintenance: { value: 100, frequency: 'monthly' },
      insurance: { value: 600, frequency: 'annual' },
      managementFee: { value: 0, frequency: 'annual' },
      taxes: { value: 150, frequency: 'annual' },
      vacancyAssumption: 0,
    },
    deposit: 50000,
    interestRate: 5,
    mortgageTermYears: 25,
  },
};

function listing(overrides = {}) {
  return {
    id: 1,
    title: 'Phase 3 finance consistency',
    city: 'Leeds',
    zip_code: 'LS1 1AA',
    category: 'sale',
    price: 200000,
    monthly_rent: 1000,
    service_charges: 100,
    ground_rent: 250,
    bedrooms: 2,
    property_type: 'Terraced',
    ...overrides,
  };
}

function access() {
  return {
    allowed: true,
    userId: 1,
    role: 'owner',
    relationship: 'owner',
    accessLevel: 'professional_intelligence',
    propertyId: 1,
  };
}

function deps() {
  return {
    analyseRent: async () => ({
      success: true,
      recommendedRent: 1250,
      currentRent: 1000,
      marketRange: { low: 1100, high: 1400 },
      comparables: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }],
    }),
    calculatePropertyValuation: async () => ({
      success: true,
      centralEstimate: 195000,
      lowerEstimate: 180000,
      upperEstimate: 210000,
      evidenceCount: 6,
    }),
    generatePropertyExplanation: async () => ({ summary: 'template', source: 'template', tokensUsed: 0 }),
  };
}

async function analyse(body = {}, listingOverrides = {}) {
  const parsed = parseAnalyseFinanceRequest(body);
  if (!parsed.ok) return { parsed, report: null };
  const report = await assemblePropertyIntelligenceReport({
    property: listing(listingOverrides),
    access: access(),
    userId: 1,
    target: { propertyId: 1 },
    options: {
      skipExplanation: true,
      skipPostcodeMarket: true,
      skipPlanning: true,
      skipSchools: true,
      skipListedBuilding: true,
      skipConservationArea: true,
      skipArticle4: true,
      asOf: ASOF,
      ...parsed.options,
      deps: deps(),
    },
  });
  return { parsed, report };
}

function explanationText(decision) {
  const exp = decision?.explanation || {};
  return [
    exp.overall,
    ...(exp.strongestFactors || []).map((row) => row.text),
    ...(exp.weakestOrUnavailable || []).map((row) => row.text),
  ]
    .filter(Boolean)
    .join(' ');
}

function findingIds(report) {
  return (report.decisionIntelligence?.materialFindings || []).map((row) => row.id);
}

function dependencyIds(report) {
  return (report.decisionIntelligence?.unresolvedDependencies || []).map((row) => row.id);
}

function driverKeys(report) {
  return (report.decisionIntelligence?.sensitivityDrivers || []).map((row) => row.inputKey);
}

function read(rel) {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

test('explicit zero unwraps on the canonical finance overlay path', () => {
  assert.strictEqual(numericFinanceValue(0), 0);
  assert.strictEqual(numericFinanceValue({ value: 0 }), 0);
  assert.strictEqual(numericFinanceValue({ amount: 0 }), 0);
  assert.strictEqual(numericFinanceValue(''), null);
  assert.strictEqual(numericFinanceValue(null), null);
});

asyncTest('complete finance is COMPLETE across presentation, Personal Decision, Why, and Decision Intelligence', async () => {
  const { parsed, report } = await analyse(COMPLETE_SCENARIO);
  const presented = report.investment.presented;
  const pd = report.personalDecision;
  const why = explanationText(pd);

  assert.strictEqual(report.financeRequest.operatingCostCompleteness, 'COMPLETE_EVIDENCE');
  assert.strictEqual(report.financeRequest.financeCompleteness, 'COMPLETE_EVIDENCE');
  assert.strictEqual(presented.costEvidence.completeness, 'COMPLETE_EVIDENCE');
  assert.strictEqual(presented.financeEvidence.completeness, 'COMPLETE_EVIDENCE');
  assert.strictEqual(presented.noi.available, true);
  assert.strictEqual(presented.netYield.available, true);
  assert.strictEqual(presented.annualCashFlow.available, true);
  assert.strictEqual(presented.dscr.available, true);

  assert.strictEqual(pd.dimensions.netOperating.available, presented.noi.available);
  assert.strictEqual(pd.dimensions.cashFlow.available, presented.annualCashFlow.available);
  assert.strictEqual(pd.dimensions.dscr.available, presented.dscr.available);
  assert.notStrictEqual(pd.dimensions.netOperating.state, 'costs_not_supplied');
  assert.ok(!/Operating costs were not supplied/i.test(why));
  assert.ok(!/cash flow was not assessed/i.test(why));
  assert.ok(!/DSCR was not assessed/i.test(why));

  assert.ok(findingIds(report).includes('finding_net_operating'));
  assert.ok(findingIds(report).includes('finding_cash_flow'));
  assert.ok(findingIds(report).includes('finding_dscr'));
  assert.ok(!dependencyIds(report).includes('operating_costs_incomplete'));
  assert.ok(!dependencyIds(report).includes('vacancy_assumption_missing'));
  assert.ok(!dependencyIds(report).includes('mortgage_inputs_incomplete'));

  const direct = scoreCanonicalLandlordDecision({
    property: listing(),
    finance: parsed.options,
    intelligence: intelligenceFromCanonicalReport(report),
    asOf: ASOF,
  });
  assert.strictEqual(pd.score, direct.score);
});

asyncTest('nested complete costs plus listing charges stay internally consistent', async () => {
  const { report } = await analyse(NESTED_COMPLETE_WITHOUT_LISTING_CHARGES);
  const presented = report.investment.presented;
  const pd = report.personalDecision;
  assert.strictEqual(presented.costEvidence.completeness, 'COMPLETE_EVIDENCE');
  assert.strictEqual(presented.financeEvidence.completeness, 'COMPLETE_EVIDENCE');
  assert.strictEqual(presented.noi.available, true);
  assert.strictEqual(pd.dimensions.netOperating.available, true);
  assert.ok(!/Operating costs were not supplied/i.test(explanationText(pd)));
  assert.ok(findingIds(report).includes('finding_net_operating'));
  assert.ok(!dependencyIds(report).includes('operating_costs_incomplete'));
  assert.strictEqual(report.financeRequest.purchasePrice.scenarioIsNotListingAsking, true);
});

asyncTest('partial operating costs stay PARTIAL and do not fabricate £0 NOI', async () => {
  const { report } = await analyse({
    finance: {
      purchasePrice: 185000,
      expectedRent: 1100,
      operatingCosts: { maintenance: { value: 100, frequency: 'monthly' } },
      ...COMPLETE_FINANCE,
    },
  });
  const presented = report.investment.presented;
  const pd = report.personalDecision;
  assert.strictEqual(presented.costEvidence.completeness, 'PARTIAL_EVIDENCE');
  assert.strictEqual(presented.grossYield.available, true);
  assert.strictEqual(presented.noi.available, false);
  assert.strictEqual(presented.netYield.available, false);
  assert.strictEqual(presented.annualCashFlow.available, false);
  assert.strictEqual(presented.dscr.available, false);
  assert.strictEqual(pd.dimensions.grossYield.available, true);
  assert.strictEqual(pd.dimensions.netOperating.available, false);
  assert.strictEqual(pd.dimensions.cashFlow.available, false);
  assert.strictEqual(pd.dimensions.dscr.available, false);
  assert.ok(/not assessed|not supplied|incomplete/i.test(explanationText(pd)));
  assert.ok(dependencyIds(report).includes('operating_costs_incomplete'));
  assert.ok(!findingIds(report).includes('finding_net_operating'));
  assert.strictEqual(presented.noi.value, null);
});

asyncTest('missing vacancy blocks complete operating-cost evidence and PD netOperating', async () => {
  const { vacancyAssumption, ...withoutVacancy } = COMPLETE_OPERATING;
  const { report } = await analyse({
    purchasePrice: 185000,
    expectedRent: 1100,
    ...withoutVacancy,
    ...COMPLETE_FINANCE,
  });
  assert.ok(report.financeRequest.missingRequired.operatingCosts.includes('vacancyAssumption'));
  assert.notStrictEqual(report.investment.presented.costEvidence.completeness, 'COMPLETE_EVIDENCE');
  assert.strictEqual(report.investment.presented.noi.available, false);
  assert.strictEqual(report.personalDecision.dimensions.netOperating.available, false);
  assert.ok(dependencyIds(report).includes('vacancy_assumption_missing'));
  assert.ok(!findingIds(report).includes('finding_net_operating'));
});

asyncTest('missing deposit, rate or term keeps finance incomplete', async () => {
  const missingDeposit = await analyse({
    purchasePrice: 185000,
    expectedRent: 1100,
    ...COMPLETE_OPERATING,
    interestRate: 5,
    mortgageTermYears: 25,
  });
  assert.ok(missingDeposit.report.financeRequest.missingRequired.finance.includes('deposit'));
  assert.notStrictEqual(missingDeposit.report.investment.presented.financeEvidence.completeness, 'COMPLETE_EVIDENCE');
  assert.strictEqual(missingDeposit.report.investment.presented.dscr.available, false);
  assert.strictEqual(missingDeposit.report.personalDecision.dimensions.dscr.available, false);
  assert.ok(dependencyIds(missingDeposit.report).includes('mortgage_inputs_incomplete'));
});

asyncTest('no finance inputs do not present application defaults as user evidence', async () => {
  const { report } = await analyse({});
  const presented = report.investment.presented;
  const receivedKeys = (report.financeRequest.received || []).map((row) => row.key);
  assert.notStrictEqual(presented.financeEvidence.completeness, 'COMPLETE_EVIDENCE');
  assert.notStrictEqual(presented.costEvidence.completeness, 'COMPLETE_EVIDENCE');
  assert.strictEqual(presented.noi.available, false);
  assert.strictEqual(presented.annualCashFlow.available, false);
  assert.strictEqual(presented.dscr.available, false);
  assert.strictEqual(report.personalDecision.dimensions.netOperating.available, false);
  assert.strictEqual(report.personalDecision.dimensions.cashFlow.available, false);
  assert.strictEqual(report.personalDecision.dimensions.dscr.available, false);
  assert.ok(!receivedKeys.includes('mortgageTermYears'));
  assert.ok(!receivedKeys.includes('vacancyAssumption'));
  assert.ok(!receivedKeys.includes('interestRate'));
  report.financeRequest.applicationDefaults.forEach((row) => {
    assert.strictEqual(row.userSupplied, false);
    assert.strictEqual(row.sourceKind, 'application_default');
  });
  assert.ok(!findingIds(report).includes('finding_net_operating'));
  assert.ok(!findingIds(report).includes('finding_dscr'));
});

asyncTest('hidden raw engine values cannot make Why claim assessment', async () => {
  const { vacancyAssumption, ...withoutVacancy } = COMPLETE_OPERATING;
  const { report } = await analyse({
    purchasePrice: 185000,
    expectedRent: 1100,
    ...withoutVacancy,
    ...COMPLETE_FINANCE,
  });
  const metrics = report.investment.metrics;
  assert.ok(Number.isFinite(Number(metrics?.noi)));
  assert.strictEqual(report.investment.presented.noi.available, false);
  assert.strictEqual(report.personalDecision.dimensions.netOperating.available, false);
  assert.ok(!/Net yield .* · NOI/.test(explanationText(report.personalDecision)));
});

asyncTest('What-if freeze: complete fixture scores, deltas and finance arithmetic stay on the What-if engine', async () => {
  const { parsed, report } = await analyse(COMPLETE_SCENARIO);
  const whatIf = executeIntelligenceWhatIf({
    property: listing(),
    profile: 'landlord',
    baselineOptions: parsed.options,
    scenarioOptions: { interestRate: 6 },
    intelligence: intelligenceFromCanonicalReport(report),
    asOf: ASOF,
  });
  const direct = comparePersonalDecisionWhatIf({
    profile: 'landlord',
    property: propertyWithFinanceScenario(listing(), parsed.options),
    finance: parsed.options,
    intelligence: intelligenceFromCanonicalReport(report),
    scenario: { finance: { interestRate: 6 } },
    asOf: ASOF,
  });
  assert.strictEqual(whatIf.model.version, WHAT_IF_VERSION);
  assert.strictEqual(whatIf.change.score.before, direct.baseScore);
  assert.strictEqual(whatIf.change.score.after, direct.scenarioScore);
  assert.strictEqual(whatIf.change.score.delta, direct.scoreDelta);
  assert.strictEqual(report.personalDecision.score, whatIf.change.score.before);
  assert.ok(whatIf.change.dscr.after < whatIf.change.dscr.before);
  assert.strictEqual(whatIf.factsUnchanged.listingAskingPrice, 200000);
});

asyncTest('Decision Intelligence finding ids and sensitivity driver keys are stable for identical complete inputs', async () => {
  const first = await analyse(COMPLETE_SCENARIO);
  const second = await analyse(COMPLETE_SCENARIO);
  assert.deepStrictEqual(findingIds(first.report), findingIds(second.report));
  assert.deepStrictEqual(driverKeys(first.report), driverKeys(second.report));
  findingIds(first.report).forEach((id, index, ids) => {
    if (index === 0) return;
    assert.ok(MATERIAL_FINDING_ORDER.indexOf(id) >= MATERIAL_FINDING_ORDER.indexOf(ids[index - 1]));
  });
  driverKeys(first.report).forEach((key) => {
    assert.ok(SENSITIVITY_DRIVER_ORDER.includes(key));
  });
});

asyncTest('valuation, rent and financialEngine arithmetic are unchanged by the explanation fix', async () => {
  const { report } = await analyse(COMPLETE_SCENARIO);
  assert.strictEqual(report.marketIntelligence.sale.centralEstimate, 195000);
  assert.strictEqual(report.marketIntelligence.rent.recommendedRent, 1250);
  const metrics = calculateInvestmentMetrics({
    purchasePrice: 185000,
    expectedRent: 1100,
    ...COMPLETE_OPERATING,
    ...COMPLETE_FINANCE,
  });
  const presented = report.investment.presented;
  assert.strictEqual(presented.noi.value, metrics.noi);
  assert.strictEqual(presented.dscr.value, metrics.dscr);
  assert.strictEqual(presented.netYield.value, metrics.netYield);
});

test('weights, thresholds, buildRisks usage, analyse lease and Phase 2 missing-value semantics stay frozen', () => {
  assert.strictEqual(LANDLORD_WEIGHTS.netOperating, 0.14);
  assert.strictEqual(LANDLORD_WEIGHTS.cashFlow, 0.12);
  assert.strictEqual(LANDLORD_WEIGHTS.dscr, 0.1);
  assert.strictEqual(OUTCOME_THRESHOLDS.strong_fit, 80);
  assert.strictEqual(OUTCOME_THRESHOLDS.good_fit, 65);
  assert.strictEqual(OUTCOME_THRESHOLDS.mixed_fit, 50);

  const engine = read('services/ai/propertyIntelligenceEngine.js');
  assert.ok(engine.includes('buildRisks('));
  assert.ok(engine.includes('scorePublicLandlordPersonalDecision'));
  assert.ok(!engine.includes('BUYER_GENERAL_WEIGHTS'));

  const landlord = read('services/ai/personalDecisionLandlord.js');
  assert.ok(landlord.includes('intel.risks'));
  assert.ok(landlord.includes('withholdUnlessPresented'));
  assert.ok(!/if \(finance\[key\]\)/.test(landlord));

  const guard = read('services/ai/propertyIntelligenceAnalyseGuard.js');
  assert.ok(guard.includes('pi_analyse_slots'));
  assert.ok(guard.includes('createPostgresAnalyseSlotStore'));
  assert.ok(guard.includes('ANALYSIS_IN_PROGRESS'));

  assert.strictEqual(toListingNumber(null), null);
  assert.strictEqual(toListingNumber(''), null);
  assert.strictEqual(toListingNumber(0), 0);
  assert.strictEqual(getMonthlyRent({ monthly_rent: null, weekly_rent: null }), null);
  assert.strictEqual(getMonthlyRent({ monthly_rent: 0 }), 0);
});

test('historical saved Personal Decision explanation is not rewritten', () => {
  const original = {
    id: 9,
    user_id: 1,
    output_data: {
      personalDecision: {
        score: 61,
        explanation: {
          overall: 'Operating costs were not supplied, so net operating performance was not assessed.',
        },
      },
      investment: {
        presented: {
          costEvidence: { completeness: 'COMPLETE_EVIDENCE' },
          noi: { available: true, value: 8000 },
        },
      },
    },
    confidence: 70,
    confidence_level: 'Medium',
  };
  const snapshot = JSON.stringify(original.output_data);
  const annotated = annotateStoredAnalysis(original);
  assert.strictEqual(JSON.stringify(original.output_data), snapshot);
  assert.strictEqual(JSON.stringify(annotated.output_data), snapshot);
  assert.ok(/Operating costs were not supplied/.test(annotated.output_data.personalDecision.explanation.overall));
});

test('Why engine and IntelligenceReport do not independently decide cost completeness', () => {
  const why = read('services/ai/personalDecisionWhyEngine.js');
  assert.ok(!why.includes('COMPLETE_EVIDENCE'));
  assert.ok(!why.includes('materialDefaults'));
  const ui = fs.readFileSync(
    path.join(__dirname, '..', '..', 'client', 'src', 'components', 'ai', 'IntelligenceReport.js'),
    'utf8'
  );
  assert.ok(!/if \(.*presented\.noi/.test(ui));
  assert.ok(ui.includes('decision.explanation'));
  assert.ok(ui.includes('landlord-explanation'));
  assert.ok(ui.includes('completenessCopy(operating)'));
});

async function run() {
  for (const t of pending) {
    await t.fn();
    console.log(`✓ ${t.name}`);
  }
  console.log('\nfinanceExplanationConsistency.test.js — all passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
