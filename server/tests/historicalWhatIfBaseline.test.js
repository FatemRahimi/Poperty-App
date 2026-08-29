/**
 * Historical What-if baseline pinning — saved analysis snapshot integrity.
 * Run: node server/tests/historicalWhatIfBaseline.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  parseWhatIfHttpBody,
  executeIntelligenceWhatIf,
  toPublicWhatIfHttp,
  prepareIntelligenceWhatIfRun,
  storedAnalysisMatchesTarget,
} = require('../services/ai/intelligenceWhatIfService');
const {
  resolveSavedWhatIfBaseline,
  propertyFromSavedReport,
} = require('../services/ai/historicalWhatIfBaseline');
const { comparePersonalDecisionWhatIf } = require('../services/ai/personalDecisionWhatIfEngine');
const { scorePersonalDecision } = require('../services/ai/personalDecisionEngine');
const {
  BUYER_GENERAL_WEIGHTS,
  LANDLORD_WEIGHTS,
  WHAT_IF_VERSION,
  personalDecisionConfig,
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

const ASOF = '2026-08-14T10:00:00.000Z';

const SAVED_FINANCE = {
  purchasePrice: 200000,
  expectedRent: 1000,
  maintenance: 1200,
  insurance: 600,
  managementFee: 0,
  taxes: 0,
  serviceCharge: 0,
  groundRent: 0,
  vacancyAssumption: 0,
  deposit: 50000,
  interestRate: 5,
  mortgageTermYears: 25,
};

const STAMP = {
  profile: 'landlord',
  available: true,
  score: 71,
  outcome: 'good_fit',
  decision: 'good_fit',
  dimensions: {
    demand: { available: false, score: null, state: 'no_demand_data_source' },
    grossYield: { available: true, score: 55, state: 'assessed' },
    rentPosition: { available: true, score: 60, state: 'assessed' },
    netOperating: { available: true, score: 58, state: 'assessed' },
    cashFlow: { available: true, score: 50, state: 'assessed' },
    vacancy: { available: true, score: 70, state: 'assessed' },
    dscr: { available: true, score: 64, state: 'assessed' },
    risk: { available: true, score: 80, state: 'assessed' },
  },
  model: { version: personalDecisionConfig.version, profile: 'landlord' },
};

function savedReport(overrides = {}) {
  return {
    success: true,
    engineVersion: 'property-intelligence-v2',
    modelVersion: 'property-intelligence-v2',
    evidenceAsOf: ASOF,
    analysisDate: ASOF,
    identity: { listingId: 1, subjectId: null },
    property: {
      id: 1,
      title: 'Saved listing',
      price: 200000,
      monthly_rent: 1000,
      bedrooms: 2,
      property_type: 'Terraced',
      epc_rating: 'D',
      tenure: 'Freehold',
      observedFields: {
        serviceCharge: { available: true, value: 100, field: 'service_charges' },
        groundRent: { available: true, value: 250, field: 'ground_rent' },
      },
    },
    snapshot: { price: 200000, rent: 1000, bedrooms: 2, propertyType: 'Terraced' },
    propertyFacts: { version: 'property-facts-1.0.0', facts: {} },
    marketIntelligence: {
      sale: {
        success: true,
        centralEstimate: 195000,
        lowerEstimate: 180000,
        upperEstimate: 210000,
        evidenceCount: 6,
      },
      rent: {
        success: true,
        recommendedRent: 1050,
        currentRent: 1000,
        marketRange: { low: 950, high: 1150 },
      },
      decisionContext: { available: true },
    },
    inputSnapshot: {
      options: { ...SAVED_FINANCE },
      finance: { submitted: { ...SAVED_FINANCE } },
    },
    financeRequest: { submitted: { ...SAVED_FINANCE } },
    personalDecision: { ...STAMP, dimensions: { ...STAMP.dimensions } },
    confidence: { level: 'High', assessed: true, model: 'confidence-1.1.0' },
    ...overrides,
  };
}

function storedItem(overrides = {}) {
  const output = overrides.output_data !== undefined ? overrides.output_data : savedReport();
  return {
    id: 40,
    user_id: 1,
    request_type: 'property_intelligence',
    property_id: 1,
    subject_id: null,
    created_at: ASOF,
    model_version: 'property-intelligence-v2',
    input_data: {
      propertyId: 1,
      options: { ...SAVED_FINANCE },
      finance: {
        version: 'finance-input-1.0.0',
        options: { ...SAVED_FINANCE },
      },
    },
    output_data: output,
    ...overrides,
  };
}

const LIVE_LISTING = {
  id: 1,
  title: 'Live listing today',
  city: 'Leeds',
  zip_code: 'LS1 1AA',
  category: 'sale',
  price: 185000,
  monthly_rent: 900,
  service_charges: 40,
  ground_rent: 10,
  bedrooms: 4,
  property_type: 'Detached',
  epc_rating: 'A',
  tenure: 'Leasehold',
};

function runSavedWhatIf({
  item = storedItem(),
  liveProperty = LIVE_LISTING,
  parsedOverrides = {},
  scenarioOptions = { purchasePrice: 175000 },
} = {}) {
  const parsed = {
    ok: true,
    profile: 'landlord',
    propertyId: 1,
    subjectId: null,
    analysisId: 40,
    baselineOptions: { purchasePrice: 1, expectedRent: 1, interestRate: 99 },
    scenarioOptions,
    ...parsedOverrides,
  };
  const prepared = prepareIntelligenceWhatIfRun({
    parsed,
    liveProperty,
    storedItem: item,
  });
  if (!prepared.ok) return { prepared, result: null };
  const snapshotBefore = JSON.stringify(item.output_data);
  const result = executeIntelligenceWhatIf({
    property: prepared.property,
    profile: parsed.profile,
    baselineOptions: prepared.baselineOptions,
    scenarioOptions: parsed.scenarioOptions,
    intelligence: prepared.intelligence,
    asOf: prepared.asOf,
    baselineContext: prepared.baselineContext,
  });
  return { prepared, result, snapshotAfter: JSON.stringify(item.output_data), snapshotBefore };
}

test('saved analysis uses baselineMode=saved_snapshot and live uses live', () => {
  const saved = runSavedWhatIf();
  assert.strictEqual(saved.prepared.ok, true);
  assert.strictEqual(saved.result.baselineMode, 'saved_snapshot');
  assert.strictEqual(saved.result.baselineAnalysisId, 40);
  assert.strictEqual(saved.result.baselineEvidenceAsOf, ASOF);
  assert.strictEqual(saved.result.baselineEngineVersion, 'property-intelligence-v2');
  assert.strictEqual(saved.result.notSaved, undefined);

  const live = executeIntelligenceWhatIf({
    property: LIVE_LISTING,
    profile: 'landlord',
    baselineOptions: { ...SAVED_FINANCE },
    scenarioOptions: { purchasePrice: 175000 },
    asOf: ASOF,
  });
  assert.strictEqual(live.baselineMode, 'live');
  assert.strictEqual(live.baselineAnalysisId, null);
  assert.strictEqual(live.baselineSource, 'current_listing');
});

test('stamped Personal Decision is the What-if baseScore and dimensions; listing change does not leak', () => {
  const { result, snapshotBefore, snapshotAfter } = runSavedWhatIf();
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.listing.askingPrice, 200000);
  assert.strictEqual(result.listing.monthlyRent, 1000);
  assert.strictEqual(result.factsUnchanged.listingAskingPrice, 200000);
  assert.strictEqual(result.change.score.before, 71);
  assert.strictEqual(result.baseline.decision.score, 71);
  assert.strictEqual(result.baseline.decision.outcome, 'good_fit');
  assert.strictEqual(result.baseline.decision.dimensions.grossYield.score, 55);
  assert.strictEqual(result.baseline.decision.dimensions.demand.state, 'no_demand_data_source');
  assert.strictEqual(result.baselinePinnedToStamp, true);
  assert.strictEqual(result.currentListingChangedSinceAnalysis, true);
  assert.ok(result.listingChangedFields.includes('askingPrice'));
  assert.ok(result.listingChangedFields.includes('monthlyRent'));
  assert.strictEqual(snapshotBefore, snapshotAfter);
  assert.strictEqual(result.baseline.purchasePrice, 200000);
  assert.strictEqual(result.baseline.expectedRent, 1000);
  assert.strictEqual(result.scenario.purchasePrice, 175000);
  assert.strictEqual(result.change.purchasePrice.before, 200000);
  assert.strictEqual(result.change.purchasePrice.after, 175000);
});

test('current listing facts and PropertyData do not rebuild the saved baseline', () => {
  const { prepared, result } = runSavedWhatIf();
  assert.strictEqual(prepared.property.price, 200000);
  assert.strictEqual(prepared.property.monthly_rent, 1000);
  assert.strictEqual(prepared.property.bedrooms, 2);
  assert.strictEqual(prepared.property.property_type, 'Terraced');
  assert.strictEqual(prepared.property.epc_rating, 'D');
  assert.notStrictEqual(prepared.property.price, LIVE_LISTING.price);
  assert.notStrictEqual(prepared.intelligence.sale?.centralEstimate, 999999);
  assert.strictEqual(prepared.intelligence.sale.centralEstimate, 195000);
  assert.strictEqual(result.valuation.before.centralEstimate, 195000);
  assert.strictEqual(result.listing.serviceCharge, 100);
  assert.strictEqual(result.listing.groundRent, 250);
});

test('saved finance snapshot is used; client baseline cannot replace it; patch is explicit only', () => {
  const { prepared, result } = runSavedWhatIf({
    scenarioOptions: { purchasePrice: 175000 },
  });
  assert.strictEqual(prepared.baselineOptions.purchasePrice, 200000);
  assert.strictEqual(prepared.baselineOptions.interestRate, 5);
  assert.strictEqual(prepared.baselineOptions.deposit, 50000);
  assert.notStrictEqual(prepared.baselineOptions.interestRate, 99);
  assert.strictEqual(result.baseline.purchasePrice, 200000);
  assert.strictEqual(result.scenario.purchasePrice, 175000);
  assert.strictEqual(result.scenario.expectedRent, 1000);
  assert.strictEqual(result.change.expectedRent.delta, 0);
});

test('another user, mismatched property/subject, and client injection are rejected', () => {
  const missing = prepareIntelligenceWhatIfRun({
    parsed: {
      analysisId: 40,
      propertyId: 1,
      baselineOptions: {},
      scenarioOptions: {},
    },
    liveProperty: LIVE_LISTING,
    storedItem: null,
  });
  assert.strictEqual(missing.ok, false);
  assert.strictEqual(missing.code, 'ANALYSIS_NOT_FOUND');

  const mismatch = prepareIntelligenceWhatIfRun({
    parsed: {
      analysisId: 40,
      propertyId: 1,
      baselineOptions: {},
      scenarioOptions: {},
    },
    liveProperty: LIVE_LISTING,
    storedItem: storedItem({ property_id: 9 }),
  });
  assert.strictEqual(mismatch.ok, false);
  assert.strictEqual(mismatch.code, 'ANALYSIS_NOT_FOUND');

  const subjectMismatch = storedAnalysisMatchesTarget(storedItem({ subject_id: 8, property_id: null }), {
    subjectId: 3,
  });
  assert.strictEqual(subjectMismatch, false);

  const injected = parseWhatIfHttpBody({
    propertyId: 1,
    analysisId: 40,
    score: 99,
    personalDecision: { score: 12 },
    output_data: { property: { price: 1 } },
    listing: { askingPrice: 1 },
    baselineMode: 'saved_snapshot',
  });
  assert.strictEqual(injected.ok, false);
});

test('legacy analysis without personalDecision does not fabricate one from current data', () => {
  const report = savedReport({ personalDecision: undefined });
  delete report.personalDecision;
  const item = storedItem({ output_data: report });
  const { result } = runSavedWhatIf({ item });
  assert.strictEqual(result.baselineMode, 'saved_snapshot');
  assert.strictEqual(result.baselineState, 'partial');
  assert.strictEqual(result.baselineDecision, 'notAvailableForHistoricalSnapshot');
  assert.strictEqual(result.baselineDecisionReason, 'personal_decision_not_persisted_in_legacy_analysis');
  assert.strictEqual(result.change.score.before, null);
  assert.strictEqual(result.change.score.delta, null);
  assert.strictEqual(result.baseline.decision, null);
  assert.strictEqual(result.listing.askingPrice, 200000);
  assert.notStrictEqual(result.listing.askingPrice, LIVE_LISTING.price);
  assert.ok(
    result.limitations.some((row) => row.code === 'personal_decision_not_persisted_in_legacy_analysis')
  );
});

test('legacy partial snapshot without listing values is notAvailable and does not fall back to live', () => {
  const unavailable = resolveSavedWhatIfBaseline(
    storedItem({
      output_data: { title: 'legacy shell' },
    }),
    { liveProperty: LIVE_LISTING }
  );
  assert.strictEqual(unavailable.ok, false);
  assert.strictEqual(unavailable.baselineMode, 'saved_snapshot');
  assert.strictEqual(unavailable.code, 'HISTORICAL_BASELINE_UNAVAILABLE');

  const prepared = prepareIntelligenceWhatIfRun({
    parsed: { analysisId: 40, propertyId: 1, baselineOptions: {}, scenarioOptions: {} },
    liveProperty: LIVE_LISTING,
    storedItem: storedItem({ output_data: { title: 'legacy shell' } }),
  });
  assert.strictEqual(prepared.ok, false);
  assert.notStrictEqual(prepared.property, LIVE_LISTING);
});

test('old baseline modelVersion remains visible and cross-version is explicit', () => {
  const stamp = {
    ...STAMP,
    model: { version: 'personal-decision-0.9.0', profile: 'landlord' },
  };
  const report = savedReport({
    engineVersion: 'property-intelligence-v1',
    modelVersion: 'property-intelligence-v1',
    personalDecision: stamp,
  });
  const { result } = runSavedWhatIf({
    item: storedItem({ output_data: report, model_version: 'property-intelligence-v1' }),
  });
  assert.strictEqual(result.baselineModelVersion, 'property-intelligence-v1');
  assert.strictEqual(result.baselineEngineVersion, 'property-intelligence-v1');
  assert.strictEqual(result.baselineDecisionModel, 'personal-decision-0.9.0');
  assert.strictEqual(result.scenarioDecisionModel, personalDecisionConfig.version);
  assert.strictEqual(result.scenarioEngineVersion, WHAT_IF_VERSION);
  assert.strictEqual(result.crossVersionComparison, true);
  assert.strictEqual(result.scoreComparison, 'cross_version');
  assert.strictEqual(result.change.score.before, 71);
});

test('report baseline still equals the saved stamp rather than a live re-score', () => {
  const engine = comparePersonalDecisionWhatIf({
    profile: 'landlord',
    property: LIVE_LISTING,
    finance: SAVED_FINANCE,
    scenario: { offerPrice: 175000 },
    asOf: ASOF,
  });
  const { result } = runSavedWhatIf();
  assert.notStrictEqual(result.change.score.before, engine.baseScore);
  assert.strictEqual(result.change.score.before, STAMP.score);
  const publicJson = toPublicWhatIfHttp(result, { relationship: 'owner', accessLevel: 'professional_intelligence' });
  assert.strictEqual(publicJson.baselineMode, 'saved_snapshot');
  assert.strictEqual(publicJson.notSaved, true);
  assert.strictEqual(publicJson.engineFinancialDeltas, undefined);
});

test('saved snapshot reconstruction prefers persisted listing asking, not snapshot recommended rent', () => {
  const property = propertyFromSavedReport({
    property: { price: 200000, monthly_rent: 1000 },
    snapshot: { price: 200000, rent: 1300 },
  });
  assert.strictEqual(property.price, 200000);
  assert.strictEqual(property.monthly_rent, 1000);
});

test('scenario does not mutate the saved snapshot object', () => {
  const item = storedItem();
  const original = JSON.parse(JSON.stringify(item.output_data));
  runSavedWhatIf({ item, scenarioOptions: { purchasePrice: 175000, expectedRent: 1200 } });
  assert.deepStrictEqual(item.output_data.property.price, original.property.price);
  assert.deepStrictEqual(item.output_data.personalDecision.score, original.personalDecision.score);
  assert.deepStrictEqual(item.input_data.finance.options.purchasePrice, 200000);
});

test('controller pins What-if to the saved snapshot and still loads analyses by user id', () => {
  const controller = fs.readFileSync(
    path.join(__dirname, '..', 'controllers', 'intelligenceController.js'),
    'utf8'
  );
  const adapter = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'ai', 'intelligenceWhatIfService.js'),
    'utf8'
  );
  const engine = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'ai', 'personalDecisionWhatIfEngine.js'),
    'utf8'
  );
  assert.ok(controller.includes('prepareIntelligenceWhatIfRun'));
  assert.ok(controller.includes('findById(parsed.analysisId, req.user.id)'));
  assert.ok(!controller.includes('parsed.baselineOptions.length'));
  assert.ok(adapter.includes('resolveSavedWhatIfBaseline'));
  assert.ok(adapter.includes('comparePersonalDecisionWhatIf'));
  assert.ok(engine.includes("WHAT_IF_VERSION") || engine.includes('personal-decision-whatif-1.0.0'));
});

test('regression freeze: weights, demand, confidence, valuation, rent, finance, PropertyData, lifecycle/outcomes, backtesting', () => {
  assert.strictEqual(LANDLORD_WEIGHTS.demand, 0.08);
  assert.strictEqual(LANDLORD_WEIGHTS.grossYield, 0.18);
  assert.strictEqual(LANDLORD_WEIGHTS.rentPosition, 0.2);
  assert.strictEqual(BUYER_GENERAL_WEIGHTS.affordability, 0.3);
  assert.ok(!Object.prototype.hasOwnProperty.call(BUYER_GENERAL_WEIGHTS, 'demand'));
  assert.strictEqual(CONFIDENCE_MODEL.baseVersion, 'confidence-1.1.0');
  assert.strictEqual(WHAT_IF_VERSION, 'personal-decision-whatif-1.0.0');
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
    property: {
      id: 1,
      price: 200000,
      monthly_rent: 1000,
      bedrooms: 2,
      property_type: 'Terraced',
      zip_code: 'LS1 1AA',
      title: 'Freeze listing',
    },
    finance: SAVED_FINANCE,
    intelligence: { confidence: { level: 'High', assessed: true }, risks: [] },
    asOf: ASOF,
  });
  assert.strictEqual(landlord.dimensions.demand.state, 'no_demand_data_source');
  assert.strictEqual(landlord.dimensions.demand.available, false);
});
