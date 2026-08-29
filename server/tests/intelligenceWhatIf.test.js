/**
 * Property Intelligence What-if adapter and HTTP allowlist.
 * Run: node server/tests/intelligenceWhatIf.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  parseWhatIfHttpBody,
  executeIntelligenceWhatIf,
  toPublicWhatIfHttp,
  scenarioPatchFromOptions,
} = require('../services/ai/intelligenceWhatIfService');
const { comparePersonalDecisionWhatIf } = require('../services/ai/personalDecisionWhatIfEngine');
const { parseAnalyseFinanceRequest, parseFinancePayload } = require('../services/ai/financeInputContract');
const { scorePersonalDecision } = require('../services/ai/personalDecisionEngine');
const {
  BUYER_GENERAL_WEIGHTS,
  LANDLORD_WEIGHTS,
  WHAT_IF_VERSION,
} = require('../config/personalDecision.config');
const { CONFIDENCE_MODEL } = require('../services/ai/confidenceEngine');
const { weightedBlend } = require('../services/ai/valuationEngine');
const { parseDemandResponse, parseDemandRentResponse } = require('../services/providers/propertyData/propertyDataParsers');
const { OUTCOME_TYPES } = require('../services/ai/listingOutcomeService');
const { BACKTEST_ENGINE_VERSION } = require('../services/ai/backtesting/backtestFoundation');

function test(name, fn) {
  fn();
  console.log(`✓ ${name}`);
}

const ASOF = '2026-08-25T12:00:00.000Z';

const LISTING = Object.freeze({
  id: 1,
  title: 'What-if listing',
  city: 'Leeds',
  zip_code: 'LS1 1AA',
  category: 'sale',
  price: 200000,
  monthly_rent: 1000,
  service_charges: 100,
  ground_rent: 250,
  bedrooms: 2,
  property_type: 'Terraced',
});

const COMPLETE_COSTS = {
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

const COMPLETE_BASELINE = {
  purchasePrice: 200000,
  expectedRent: 1000,
  ...COMPLETE_COSTS,
  ...COMPLETE_FINANCE,
};

function listing(overrides = {}) {
  return { ...LISTING, ...overrides };
}

test('HTTP allowlist rejects internal injection and unknown fields', () => {
  const parsed = parseWhatIfHttpBody({
    propertyId: 1,
    deps: { analyseRent: true },
    skipValidation: true,
    evidence: { sale: { centralEstimate: 1 } },
    property: { price: 1 },
    intelligence: { sale: { centralEstimate: 999999 } },
    score: 99,
    personalDecision: { score: 12 },
    output_data: { property: { price: 1 } },
    baselineMode: 'saved_snapshot',
    confidence: { level: 'High' },
    asOf: ASOF,
    offerPrice: 1,
  });
  assert.strictEqual(parsed.ok, false);
  const reasons = parsed.errors.map((e) => `${e.field}:${e.reason}`);
  assert.ok(reasons.some((r) => r.startsWith('deps:')));
  assert.ok(reasons.some((r) => r.includes('skipValidation')));
  assert.ok(reasons.some((r) => r.includes('evidence')));
  assert.ok(reasons.some((r) => r.includes('property:')));
  assert.ok(reasons.some((r) => r.includes('score:')));
  assert.ok(reasons.some((r) => r.includes('personalDecision')));
  assert.ok(reasons.some((r) => r.includes('output_data')));
  assert.ok(reasons.some((r) => r.includes('baselineMode')));
  assert.ok(reasons.some((r) => r.includes('asOf:')));
  assert.ok(reasons.some((r) => r.includes('offerPrice')));
});

test('nested scenario finance reuses the canonical parser; blank is not zero', () => {
  const blank = parseWhatIfHttpBody({
    propertyId: 1,
    scenario: { finance: {} },
  });
  assert.strictEqual(blank.ok, true);
  assert.strictEqual(blank.scenarioOptions.vacancyAssumption, undefined);
  assert.strictEqual(blank.scenarioOptions.maintenance, undefined);

  const zero = parseWhatIfHttpBody({
    propertyId: 1,
    scenario: {
      finance: {
        operatingCosts: { vacancyAssumption: 0, managementFee: { value: 0, frequency: 'annual' } },
      },
    },
  });
  assert.strictEqual(zero.ok, true);
  assert.strictEqual(zero.scenarioOptions.vacancyAssumption, 0);
  assert.deepStrictEqual(zero.scenarioOptions.managementFee, { value: 0, frequency: 'annual' });

  const nested = parseWhatIfHttpBody({
    propertyId: 1,
    baseline: {
      finance: {
        purchasePrice: 200000,
        expectedRent: 1000,
        operatingCosts: { maintenance: { value: 50, frequency: 'monthly' } },
      },
    },
    scenario: {
      finance: {
        purchasePrice: 185000,
        operatingCosts: { maintenance: { value: 100, frequency: 'monthly' } },
      },
    },
  });
  assert.strictEqual(nested.ok, true);
  const contract = parseFinancePayload(nested.scenarioOptions);
  const analyse = parseAnalyseFinanceRequest({
    finance: { operatingCosts: { maintenance: { value: 100, frequency: 'monthly' } } },
  });
  assert.strictEqual(contract.engineInputs.maintenance, parseFinancePayload(analyse.options).engineInputs.maintenance);
  assert.strictEqual(contract.engineInputs.maintenance, 1200);
  assert.strictEqual(nested.scenarioOptions.purchasePrice, 185000);
});

test('scenario purchase price and rent recalculate through the existing What-if engine', () => {
  const property = listing();
  const frozenPrice = property.price;
  const result = executeIntelligenceWhatIf({
    property,
    profile: 'landlord',
    baselineOptions: { ...COMPLETE_BASELINE },
    scenarioOptions: { purchasePrice: 185000, expectedRent: 1100 },
    asOf: ASOF,
  });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.baselineMode, 'live');
  assert.strictEqual(result.model.version, WHAT_IF_VERSION);
  assert.strictEqual(result.scoreSource, 'personal-decision-whatif-1.0.0');
  assert.strictEqual(property.price, frozenPrice);
  assert.strictEqual(result.listing.askingPrice, 200000);
  assert.strictEqual(result.factsUnchanged.listingAskingPrice, 200000);
  assert.strictEqual(result.factsUnchanged.listingRent, 1000);
  assert.notStrictEqual(result.scenario.purchasePrice, result.listing.askingPrice);
  assert.ok(result.change.grossYield.after > result.change.grossYield.before);
  assert.ok(result.change.score.delta != null);
  const direct = comparePersonalDecisionWhatIf({
    profile: 'landlord',
    property: listing(),
    finance: COMPLETE_BASELINE,
    scenario: { offerPrice: 185000, finance: { expectedRent: 1100 } },
    asOf: ASOF,
  });
  assert.strictEqual(result.change.score.before, direct.baseScore);
  assert.strictEqual(result.change.score.after, direct.scenarioScore);
  assert.strictEqual(result.change.score.delta, direct.scoreDelta);
});

test('rate, deposit and cost overrides use the canonical engine', () => {
  const rate = executeIntelligenceWhatIf({
    property: listing(),
    profile: 'landlord',
    baselineOptions: { ...COMPLETE_BASELINE },
    scenarioOptions: { interestRate: 6 },
    asOf: ASOF,
  });
  assert.ok(rate.change.dscr.after < rate.change.dscr.before);
  assert.ok(rate.change.monthlyCashFlow.after < rate.change.monthlyCashFlow.before);

  const deposit = executeIntelligenceWhatIf({
    property: listing(),
    profile: 'landlord',
    baselineOptions: { ...COMPLETE_BASELINE },
    scenarioOptions: { deposit: 80000 },
    asOf: ASOF,
  });
  assert.ok(deposit.change.monthlyCashFlow.after > deposit.change.monthlyCashFlow.before);

  const parsed = parseAnalyseFinanceRequest({
    finance: { operatingCosts: { maintenance: { value: 50, frequency: 'monthly' } } },
  });
  const cost = executeIntelligenceWhatIf({
    property: listing(),
    profile: 'landlord',
    baselineOptions: { ...COMPLETE_BASELINE },
    scenarioOptions: parsed.options,
    asOf: ASOF,
  });
  assert.ok(cost.change.noi.after > cost.change.noi.before);
});

test('incomplete costs keep NOI notAssessed; incomplete finance keeps cash flow and DSCR notAssessed', () => {
  const priceOnly = executeIntelligenceWhatIf({
    property: listing(),
    profile: 'landlord',
    baselineOptions: {},
    scenarioOptions: { purchasePrice: 185000 },
    asOf: ASOF,
  });
  assert.strictEqual(priceOnly.change.grossYield.stateAfter, 'assessed');
  assert.strictEqual(priceOnly.change.noi.stateAfter, 'notAssessed');
  assert.strictEqual(priceOnly.change.monthlyCashFlow.stateAfter, 'notAssessed');
  assert.strictEqual(priceOnly.change.dscr.stateAfter, 'notAssessed');
  assert.notStrictEqual(priceOnly.scenario.operatingCostCompleteness, 'COMPLETE_EVIDENCE');

  const costsNoFinance = executeIntelligenceWhatIf({
    property: listing(),
    profile: 'landlord',
    baselineOptions: { expectedRent: 1000, purchasePrice: 200000, ...COMPLETE_COSTS },
    scenarioOptions: { interestRate: 6 },
    asOf: ASOF,
  });
  assert.strictEqual(costsNoFinance.change.noi.stateAfter, 'assessed');
  assert.strictEqual(costsNoFinance.change.monthlyCashFlow.stateAfter, 'notAssessed');
  assert.strictEqual(costsNoFinance.change.dscr.stateAfter, 'notAssessed');
});

test('complete scenario exposes existing metrics without inventing frontend deltas', () => {
  const result = executeIntelligenceWhatIf({
    property: listing(),
    profile: 'landlord',
    baselineOptions: { ...COMPLETE_BASELINE },
    scenarioOptions: { purchasePrice: 185000 },
    asOf: ASOF,
  });
  assert.strictEqual(result.change.noi.stateAfter, 'assessed');
  assert.strictEqual(result.change.monthlyCashFlow.stateAfter, 'assessed');
  assert.strictEqual(result.change.dscr.stateAfter, 'assessed');
  assert.strictEqual(result.scenario.operatingCostCompleteness, 'COMPLETE_EVIDENCE');
  assert.strictEqual(result.scenario.financeCompleteness, 'COMPLETE_EVIDENCE');
  const publicJson = toPublicWhatIfHttp(result, { relationship: 'owner', accessLevel: 'professional_intelligence' });
  assert.strictEqual(publicJson.engineFinancialDeltas, undefined);
  assert.strictEqual(publicJson.notSaved, true);
  assert.strictEqual(publicJson.notPropertyTruth, true);
  assert.ok(publicJson.explanation.overall);
  assert.ok(!/definitely be a better investment/i.test(publicJson.explanation.overall));
});

test('buyer_general What-if uses the same engine; landlord demand stays notAssessed', () => {
  const buyer = executeIntelligenceWhatIf({
    property: listing({ price: 380000, bedrooms: 3, commuteMinutes: 22, has_garden: true }),
    profile: 'buyer_general',
    baselineOptions: { deposit: 76000, interestRate: 4.5, mortgageTermYears: 25 },
    scenarioOptions: { purchasePrice: 320000 },
    intelligence: {
      confidence: { level: 'High', assessed: true },
      sale: {
        success: true,
        centralEstimate: 375000,
        lowerEstimate: 360000,
        upperEstimate: 390000,
        evidenceCount: 8,
      },
    },
    asOf: ASOF,
  });
  assert.strictEqual(buyer.available, true);
  assert.strictEqual(buyer.change.score.before, null);
  assert.strictEqual(buyer.change.score.after, null);
  assert.ok(buyer.change.dimensions.priceFairness.delta > 0);
  assert.strictEqual(buyer.baseline.decision.dimensions.affordability.available, false);

  const prefsRejected = parseWhatIfHttpBody({
    propertyId: 1,
    profile: 'buyer_general',
    preferences: { budgetMax: 400000, maxCommuteMinutes: 20 },
  });
  assert.strictEqual(prefsRejected.ok, false);
  assert.ok(prefsRejected.errors.some((e) => e.field === 'preferences'));

  const landlord = executeIntelligenceWhatIf({
    property: listing(),
    profile: 'landlord',
    baselineOptions: { ...COMPLETE_BASELINE },
    scenarioOptions: { purchasePrice: 185000 },
    asOf: ASOF,
  });
  assert.strictEqual(landlord.scenario.decision.dimensions.demand.available, false);
  assert.strictEqual(landlord.scenario.decision.dimensions.demand.state, 'no_demand_data_source');
  assert.strictEqual(landlord.baseline.decision.dimensions.demand.state, 'no_demand_data_source');
});

test('scenario patch maps purchasePrice to offerPrice and does not persist', () => {
  const patch = scenarioPatchFromOptions({ purchasePrice: 185000, interestRate: 6 });
  assert.strictEqual(patch.offerPrice, 185000);
  assert.strictEqual(patch.finance.interestRate, 6);
  assert.strictEqual(patch.finance.purchasePrice, undefined);
});

test('routes and controller invoke the existing adapter, not a second calculator', () => {
  const routes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'aiRoutes.js'), 'utf8');
  const controller = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'intelligenceController.js'), 'utf8');
  const adapter = fs.readFileSync(path.join(__dirname, '..', 'services', 'ai', 'intelligenceWhatIfService.js'), 'utf8');
  assert.ok(routes.includes("router.post('/intelligence/what-if', authenticateAI, compareIntelligenceWhatIf)"));
  assert.ok(!routes.includes('requireCredits, compareIntelligenceWhatIf'));
  assert.ok(controller.includes('parseWhatIfHttpBody'));
  assert.ok(controller.includes('executeIntelligenceWhatIf'));
  assert.ok(controller.includes('prepareIntelligenceWhatIfRun'));
  assert.ok(controller.includes('findById(parsed.analysisId, req.user.id)'));
  assert.ok(!controller.includes('storedBaseline'));
  assert.ok(!controller.includes('saveAnalysis') || controller.indexOf('compareIntelligenceWhatIf') > 0);
  assert.ok(!/saveAnalysis\(/.test(controller.split('const compareIntelligenceWhatIf')[1] || ''));
  assert.ok(adapter.includes('comparePersonalDecisionWhatIf'));
  assert.ok(adapter.includes("reason: 'internal_option_not_allowed'"));
  assert.ok(adapter.includes("'skipValidation'"));
});

test('regression freeze: weights, confidence, valuation, demand, outcomes, backtesting', () => {
  assert.strictEqual(BUYER_GENERAL_WEIGHTS.affordability, 0.3);
  assert.strictEqual(BUYER_GENERAL_WEIGHTS.priceFairness, 0.15);
  assert.strictEqual(BUYER_GENERAL_WEIGHTS.lifestyle, 0.08);
  assert.ok(!Object.prototype.hasOwnProperty.call(BUYER_GENERAL_WEIGHTS, 'demand'));
  assert.strictEqual(LANDLORD_WEIGHTS.demand, 0.08);
  assert.strictEqual(LANDLORD_WEIGHTS.grossYield, 0.18);
  assert.strictEqual(LANDLORD_WEIGHTS.rentPosition, 0.2);
  assert.strictEqual(CONFIDENCE_MODEL.baseVersion, 'confidence-1.1.0');
  const blend = weightedBlend([
    {
      centralEstimate: 500000,
      lowerEstimate: 480000,
      upperEstimate: 520000,
      method: 'valuation_sale_avm',
    },
  ]);
  assert.strictEqual(blend.central, 500000);
  assert.ok(parseDemandResponse({ demand_rating: 3 }));
  assert.ok(parseDemandRentResponse({ rental_demand_rating: 4 }));
  assert.deepStrictEqual([...OUTCOME_TYPES].sort(), ['let', 'sold', 'under_offer', 'withdrawn']);
  assert.ok(BACKTEST_ENGINE_VERSION);
  const landlord = scorePersonalDecision({
    profile: 'landlord',
    property: listing(),
    finance: COMPLETE_BASELINE,
    intelligence: { confidence: { level: 'High', assessed: true }, risks: [] },
    asOf: ASOF,
  });
  assert.strictEqual(landlord.dimensions.demand.state, 'no_demand_data_source');
});
