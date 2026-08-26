/**
 * Planning/development evidence — MHCLG Planning Data planning-application dataset.
 * Report/context only. Does not score, value, or adjust finance.
 * Run: node server/tests/planningEvidence.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { assemblePropertyFacts, publicPropertyFactsForExplanation, SOURCE_PRECEDENCE } = require('../services/ai/propertyFacts');
const {
  getPlanningEvidence,
  sanitizePlanningFact,
  unattachedPlanningFact,
  UNAVAILABLE_REASONS,
} = require('../services/ai/planningEvidence');
const {
  parsePlanningEntities,
  mapApplication,
  classifyApplication,
  haversineMetres,
  parseWktPoint,
  queryPlanningApplications,
  DEFAULT_SEARCH_RADIUS_M,
} = require('../services/providers/planningData/planningApplicationClient');
const { assemblePropertyIntelligenceReport } = require('../services/ai/propertyIntelligenceEngine');
const { extractCanonicalCoreFacts, projectPropertyOverview } = require('../services/ai/propertyIntelligenceService');
const { parseAnalyseFinanceRequest } = require('../services/ai/financeInputContract');
const {
  parseWhatIfHttpBody,
  executeIntelligenceWhatIf,
} = require('../services/ai/intelligenceWhatIfService');
const { resolveSavedWhatIfBaseline } = require('../services/ai/historicalWhatIfBaseline');
const { scorePersonalDecision } = require('../services/ai/personalDecisionEngine');
const {
  BUYER_GENERAL_WEIGHTS,
  LANDLORD_WEIGHTS,
} = require('../config/personalDecision.config');
const { CONFIDENCE_MODEL } = require('../services/ai/confidenceEngine');
const { weightedBlend } = require('../services/ai/valuationEngine');
const { calculateInvestmentMetrics } = require('../services/ai/financialEngine');
const { parseDemandResponse, parseDemandRentResponse } = require('../services/providers/propertyData/propertyDataParsers');
const { OUTCOME_TYPES } = require('../services/ai/listingOutcomeService');
const { BACKTEST_ENGINE_VERSION } = require('../services/ai/backtesting/backtestFoundation');
const { propertyIntelligenceConfig } = require('../config/propertyIntelligence.config');
const { formatSourceLabel } = require('../utils/provenance');
const { assessedFlood } = require('../services/ai/floodEvidence');

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

const ASOF = '2026-08-26T12:00:00.000Z';
const SUBJECT = Object.freeze({ latitude: 51.518336, longitude: -0.114869 });
const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'planningdata-applications-holborn-min.json'), 'utf8')
);

function listing(extra = {}) {
  return {
    id: 42,
    title: 'Planning evidence listing',
    city: 'London',
    zip_code: 'WC1V 6EP',
    category: 'sale',
    price: 200000,
    monthly_rent: 1100,
    ...extra,
  };
}

function zoneFact() {
  return assessedFlood({
    zone: 3,
    layersMatched: ['Flood Zone 3'],
    retrievedAt: ASOF,
    identity: { listingId: 42, ...SUBJECT },
    attributes: [],
  });
}

async function assembleReport({ property = listing(), planningStub, floodStub, skipPlanning = false, extraOptions = {} } = {}) {
  return assemblePropertyIntelligenceReport({
    property,
    access: {
      allowed: true,
      userId: 1,
      role: 'owner',
      relationship: 'owner',
      accessLevel: 'professional_intelligence',
      propertyId: property.id || 1,
      uprn: property.uprn || null,
    },
    userId: 1,
    target: { propertyId: property.id || 1 },
    options: {
      skipExplanation: true,
      skipPostcodeMarket: true,
      skipPlanning,
      asOf: ASOF,
      deps: {
        getPlanningEvidence: planningStub,
        getFloodEvidence: floodStub || (async () => zoneFact()),
        analyseRent: async () => ({
          success: true,
          recommendedRent: 1100,
          currentRent: 1100,
          comparables: [],
          marketRange: { low: 1050, high: 1150 },
        }),
        calculatePropertyValuation: async () => ({
          success: true,
          centralEstimate: 190000,
          lowerEstimate: 180000,
          upperEstimate: 200000,
          evidenceCount: 4,
        }),
        generatePropertyExplanation: async () => {
          throw new Error('LLM must not invent planning evidence');
        },
      },
      ...extraOptions,
    },
  });
}

function landlordScore(intelligenceExtra = {}) {
  return scorePersonalDecision({
    profile: 'landlord',
    property: listing({
      bedrooms: 2,
      property_type: 'Terraced',
      has_garden: true,
    }),
    finance: {
      purchasePrice: 200000,
      expectedRent: 1000,
      deposit: 50000,
      interestRate: 5,
      mortgageTermYears: 25,
      vacancyAssumption: 5,
      maintenance: 1200,
      insurance: 600,
      managementFee: 0,
      serviceCharge: 0,
      groundRent: 0,
      taxes: 0,
    },
    intelligence: {
      confidence: { level: 'High', assessed: true },
      risks: [],
      ...intelligenceExtra,
    },
    asOf: ASOF,
  });
}

test('authoritative planning response parses with native status and dates', () => {
  const parsed = parsePlanningEntities(FIXTURE);
  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(parsed.entities.length, 2);
  const first = mapApplication(parsed.entities[0]);
  assert.strictEqual(first.reference, '2015/3212/P');
  assert.strictEqual(first.nativeStatus, 'Final Decision');
  assert.strictEqual(first.nativeDecisionType, 'Granted');
  assert.strictEqual(first.decisionDate, '2015-10-13');
  assert.strictEqual(first.submittedDate, null);
  assert.strictEqual(first.providerEntryDate, '2025-09-09');
  assert.strictEqual(first.nativeType, null);
  assert.deepStrictEqual(first.point, SUBJECT);
});

test('property-specific vs nearby scope remains distinct', () => {
  const rows = FIXTURE.entities.map(mapApplication);
  const subject = classifyApplication(rows[0], SUBJECT, null, DEFAULT_SEARCH_RADIUS_M);
  const nearby = classifyApplication(rows[1], SUBJECT, null, DEFAULT_SEARCH_RADIUS_M);
  assert.strictEqual(subject.scope, 'property');
  assert.strictEqual(subject.matchMethod, 'same_site_coordinates');
  assert.strictEqual(nearby.scope, 'nearby');
  assert.ok(nearby.distanceMetres > 10);
  assert.ok(nearby.distanceMetres <= DEFAULT_SEARCH_RADIUS_M);
  assert.notStrictEqual(nearby.scope, 'property');
});

test('UPRN match is property-specific even when the point is not the same site', () => {
  const mapped = {
    ...mapApplication(FIXTURE.entities[1]),
    uprn: '10002333621',
  };
  const classified = classifyApplication(mapped, SUBJECT, '10002333621', DEFAULT_SEARCH_RADIUS_M);
  assert.strictEqual(classified.scope, 'property');
  assert.strictEqual(classified.matchMethod, 'uprn');
});

test('ambiguous postcode/address is not promoted to a subject application', () => {
  const mapped = mapApplication(FIXTURE.entities[1]);
  const classified = classifyApplication(mapped, SUBJECT, null, DEFAULT_SEARCH_RADIUS_M);
  assert.strictEqual(classified.scope, 'nearby');
  assert.notStrictEqual(classified.matchMethod, 'uprn');
});

test('distance is deterministic from verified coordinates', () => {
  const a = parseWktPoint('POINT (-0.114869 51.518336)');
  const b = parseWktPoint('POINT (-0.118535 51.518908)');
  const first = haversineMetres(a, b);
  const second = haversineMetres(a, b);
  assert.strictEqual(first, second);
  assert.ok(first > 200 && first < 320);
});

asyncTest('canonical planning evidence reaches propertyFacts with provenance and no score', async () => {
  const report = await assembleReport({
    property: listing({ ...SUBJECT }),
    planningStub: async () => getPlanningEvidence(listing({ ...SUBJECT }), {
      queryPlanningApplications: async () => ({
        success: true,
        entities: FIXTURE.entities,
        providerCount: 2,
        retrievedAt: ASOF,
        queryKind: 'geometry_buffer',
        radiusMetres: DEFAULT_SEARCH_RADIUS_M,
      }),
    }),
  });
  const planning = report.propertyFacts.facts.planning;
  assert.strictEqual(report.propertyFacts.version, 'property-facts-1.1.0');
  assert.strictEqual(planning.available, true);
  assert.strictEqual(planning.source, 'MHCLG_PlanningData');
  assert.strictEqual(planning.provenance.source, 'MHCLG_PlanningData');
  assert.strictEqual(planning.summary.subjectCount, 1);
  assert.strictEqual(planning.summary.nearbyCount, 1);
  assert.strictEqual(planning.subjectApplications[0].reference, '2015/3212/P');
  assert.strictEqual(planning.nearbyApplications[0].nativeStatus, 'Final Decision');
  assert.ok(!Object.prototype.hasOwnProperty.call(planning, 'score'));
  assert.ok(!Object.prototype.hasOwnProperty.call(planning, 'planningScore'));
  assert.strictEqual(planning.notAScore, true);
  assert.strictEqual(planning.scoringActivated, false);
  assert.strictEqual(planning.notPersonalDecisionInput, true);
  assert.deepStrictEqual([...SOURCE_PRECEDENCE.planning], ['MHCLG_PlanningData']);
  const explained = publicPropertyFactsForExplanation(report.propertyFacts);
  assert.strictEqual(explained.planning.subjectApplications[0].reference, '2015/3212/P');
  assert.strictEqual(explained.planning.notAScore, true);
});

test('sanitize strips invented scores and keeps native status', () => {
  const facts = assemblePropertyFacts({
    property: listing({ planning: { score: 99, value: 'good' } }),
    planningEvidence: sanitizePlanningFact({
      available: true,
      value: '1 application at this location',
      planningScore: 88,
      developmentScore: 12,
      subjectApplications: [{ reference: '2015/3212/P', nativeStatus: 'Final Decision', scope: 'property' }],
      nearbyApplications: [],
    }),
  });
  const planning = facts.facts.planning;
  assert.strictEqual(planning.subjectApplications[0].reference, '2015/3212/P');
  assert.strictEqual(planning.subjectApplications[0].nativeStatus, 'Final Decision');
  assert.strictEqual(planning.score, undefined);
  assert.strictEqual(planning.planningScore, undefined);
});

test('client listing planning objects are not property truth', () => {
  const facts = assemblePropertyFacts({
    property: listing({
      planning: { available: true, value: 'approved', score: 0 },
      planningEvidence: { available: true, value: 'safe' },
    }),
  });
  assert.strictEqual(facts.facts.planning.available, false);
  assert.strictEqual(facts.facts.planning.unavailableReason, UNAVAILABLE_REASONS.notAttached);
});

asyncTest('missing location is notAssessed and postcode is not used as a query', async () => {
  const planning = await getPlanningEvidence(listing({ zip_code: 'WC1V 6EP' }));
  assert.strictEqual(planning.available, false);
  assert.strictEqual(planning.unavailableReason, UNAVAILABLE_REASONS.locationUnavailable);
  assert.strictEqual(planning.identity.postcodeUsedAsPlanningLocation, false);
  assert.ok(!/no planning activity/i.test(planning.value || ''));
});

asyncTest('unsupported geography is notAssessed', async () => {
  const planning = await getPlanningEvidence(listing({ latitude: 40.7, longitude: -74.0 }));
  assert.strictEqual(planning.unavailableReason, UNAVAILABLE_REASONS.unsupportedGeography);
  assert.strictEqual(planning.available, false);
});

asyncTest('provider unavailable is notAssessed, not “no planning activity”', async () => {
  const planning = await getPlanningEvidence(listing(SUBJECT), {
    queryPlanningApplications: async () => ({ success: false, reason: 'provider_unavailable' }),
  });
  assert.strictEqual(planning.unavailableReason, UNAVAILABLE_REASONS.providerUnavailable);
  assert.strictEqual(planning.available, false);
  assert.ok(/not “no planning activity”/.test(planning.note) || /not "no planning activity"/.test(planning.note) || /not .*no planning activity/.test(planning.note));
});

asyncTest('empty source result is observed emptiness, not provider failure', async () => {
  const planning = await getPlanningEvidence(listing(SUBJECT), {
    queryPlanningApplications: async () => ({
      success: true,
      entities: [],
      providerCount: 0,
      retrievedAt: ASOF,
      queryKind: 'geometry_buffer',
      radiusMetres: DEFAULT_SEARCH_RADIUS_M,
    }),
  });
  assert.strictEqual(planning.available, true);
  assert.strictEqual(planning.unavailableReason, UNAVAILABLE_REASONS.noApplicationsReturned);
  assert.strictEqual(planning.summary.subjectCount, 0);
  assert.ok(/not evidence that there is no planning activity/.test(planning.note));
});

asyncTest('malformed provider response is notAssessed', async () => {
  const planning = await getPlanningEvidence(listing(SUBJECT), {
    queryPlanningApplications: async () => ({ success: false, reason: 'malformed_provider_response' }),
  });
  assert.strictEqual(planning.unavailableReason, UNAVAILABLE_REASONS.malformed);
});

test('parsePlanningEntities distinguishes hits, empty, and errors', () => {
  assert.strictEqual(parsePlanningEntities({ entities: [] }).ok, true);
  assert.strictEqual(parsePlanningEntities({ error: { message: 'down' } }).reason, 'provider_unavailable');
  assert.strictEqual(parsePlanningEntities('nope').reason, 'malformed_provider_response');
});

asyncTest('canonical report ignores request planning objects', async () => {
  const report = await assembleReport({
    property: listing({ ...SUBJECT }),
    planningStub: async () => getPlanningEvidence(listing({ ...SUBJECT }), {
      queryPlanningApplications: async () => ({
        success: true,
        entities: [FIXTURE.entities[0]],
        providerCount: 1,
        retrievedAt: ASOF,
        queryKind: 'geometry_buffer',
        radiusMetres: DEFAULT_SEARCH_RADIUS_M,
      }),
    }),
    extraOptions: {
      planning: { available: true, value: 'approved', score: 0 },
      planningEvidence: { available: true, value: 'injected' },
      planningScore: 9,
    },
  });
  assert.strictEqual(report.propertyFacts.facts.planning.subjectApplications[0].reference, '2015/3212/P');
  assert.notStrictEqual(report.propertyFacts.facts.planning.value, 'injected');
});

asyncTest('historical saved planning is not replaced by a later provider response', async () => {
  const historical = await assembleReport({
    property: listing({ ...SUBJECT }),
    planningStub: async () => getPlanningEvidence(listing({ ...SUBJECT }), {
      queryPlanningApplications: async () => ({
        success: true,
        entities: [FIXTURE.entities[0]],
        providerCount: 1,
        retrievedAt: ASOF,
        queryKind: 'geometry_buffer',
        radiusMetres: DEFAULT_SEARCH_RADIUS_M,
      }),
    }),
  });
  const row = { id: 92, output_data: historical, created_at: ASOF };
  assert.strictEqual(extractCanonicalCoreFacts(row).propertyFacts.facts.planning.subjectApplications[0].reference, '2015/3212/P');
  const later = await assembleReport({
    property: listing({ ...SUBJECT }),
    planningStub: async () => getPlanningEvidence(listing({ ...SUBJECT }), {
      queryPlanningApplications: async () => ({
        success: true,
        entities: [FIXTURE.entities[1]],
        providerCount: 1,
        retrievedAt: ASOF,
        queryKind: 'geometry_buffer',
        radiusMetres: DEFAULT_SEARCH_RADIUS_M,
      }),
    }),
  });
  assert.strictEqual(later.propertyFacts.facts.planning.nearbyApplications[0].reference, '2015/7191/P');
  assert.strictEqual(extractCanonicalCoreFacts(row).propertyFacts.facts.planning.subjectApplications[0].reference, '2015/3212/P');
  const overview = projectPropertyOverview(listing({ ...SUBJECT }), { canonicalReport: row });
  assert.strictEqual(overview.propertyFacts.facts.planning.subjectApplications[0].reference, '2015/3212/P');
  const snapshotBefore = JSON.stringify(row.output_data.propertyFacts.facts.planning);
  const prepared = resolveSavedWhatIfBaseline({
    id: 92,
    request_type: 'property_intelligence',
    property_id: 42,
    created_at: ASOF,
    output_data: historical,
  });
  assert.strictEqual(prepared.ok, true);
  executeIntelligenceWhatIf({
    property: listing({ ...SUBJECT, monthly_rent: 1100 }),
    profile: 'landlord',
    baselineOptions: {
      purchasePrice: 200000,
      expectedRent: 1100,
      deposit: 50000,
      interestRate: 5,
      mortgageTermYears: 25,
    },
    scenarioOptions: { purchasePrice: 185000 },
    asOf: prepared.evidenceAsOf,
    baselineContext: prepared.context,
    intelligence: prepared.intelligence,
  });
  assert.strictEqual(JSON.stringify(row.output_data.propertyFacts.facts.planning), snapshotBefore);
});

test('What-if does not call the planning provider and rejects client planning injection', () => {
  const adapter = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'ai', 'intelligenceWhatIfService.js'),
    'utf8'
  );
  const historical = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'ai', 'historicalWhatIfBaseline.js'),
    'utf8'
  );
  assert.ok(!adapter.includes('getPlanningEvidence'));
  assert.ok(!adapter.includes('queryPlanningApplications'));
  assert.ok(!historical.includes('getPlanningEvidence'));
  const injected = parseWhatIfHttpBody({
    propertyId: 1,
    profile: 'landlord',
    planning: { value: 'approved' },
    planningEvidence: { available: true },
  });
  assert.strictEqual(injected.ok, false);
  assert.ok(injected.errors.some((e) => e.field === 'planning' && e.reason === 'internal_option_not_allowed'));
});

test('HTTP analyse rejects client planning injection', () => {
  assert.ok(parseAnalyseFinanceRequest({ planning: { value: 'approved' } }).errors.some((e) => e.field === 'planning'));
  assert.ok(parseAnalyseFinanceRequest({ planningEvidence: { available: true } }).errors.some((e) => e.field === 'planningEvidence'));
  assert.ok(parseAnalyseFinanceRequest({ planningScore: 4 }).errors.some((e) => e.field === 'planningScore'));
  assert.ok(parseAnalyseFinanceRequest({ skipPlanning: true }).errors.some((e) => e.field === 'skipPlanning'));
});

asyncTest('planning does not change valuation, rent, finance, flood, or Personal Decision', async () => {
  const withPlanning = await assembleReport({
    property: listing({ ...SUBJECT, monthly_rent: 1100 }),
    planningStub: async () => getPlanningEvidence(listing({ ...SUBJECT }), {
      queryPlanningApplications: async () => ({
        success: true,
        entities: FIXTURE.entities,
        providerCount: 2,
        retrievedAt: ASOF,
        queryKind: 'geometry_buffer',
        radiusMetres: DEFAULT_SEARCH_RADIUS_M,
      }),
    }),
  });
  const withoutPlanning = await assembleReport({
    property: listing({ ...SUBJECT, monthly_rent: 1100 }),
    skipPlanning: true,
  });
  assert.strictEqual(withPlanning.marketIntelligence.sale.centralEstimate, withoutPlanning.marketIntelligence.sale.centralEstimate);
  assert.strictEqual(withPlanning.marketIntelligence.rent.recommendedRent, withoutPlanning.marketIntelligence.rent.recommendedRent);
  assert.strictEqual(withPlanning.propertyFacts.facts.flood.value, 'Flood Zone 3');
  assert.strictEqual(withoutPlanning.propertyFacts.facts.flood.value, 'Flood Zone 3');
  const metrics = calculateInvestmentMetrics({
    purchasePrice: 200000,
    expectedRent: 1000,
    vacancyAssumption: 5,
    operatingCosts: 0,
  });
  assert.ok(Number.isFinite(metrics.grossYield));
  const withFacts = landlordScore({
    propertyFacts: { facts: { planning: withPlanning.propertyFacts.facts.planning } },
  });
  const withoutFacts = landlordScore();
  assert.strictEqual(withFacts.score, withoutFacts.score);
  assert.strictEqual(withFacts.dimensions.risk.score, withoutFacts.dimensions.risk.score);
  assert.ok(!Object.prototype.hasOwnProperty.call(withFacts.dimensions, 'planning'));
});

test('Personal Decision, confidence, demand, outcomes and backtesting stay frozen', () => {
  assert.strictEqual(LANDLORD_WEIGHTS.demand, 0.08);
  assert.strictEqual(LANDLORD_WEIGHTS.risk, 0.1);
  assert.ok(!Object.prototype.hasOwnProperty.call(LANDLORD_WEIGHTS, 'planning'));
  assert.strictEqual(BUYER_GENERAL_WEIGHTS.affordability, 0.3);
  assert.ok(!Object.prototype.hasOwnProperty.call(BUYER_GENERAL_WEIGHTS, 'planning'));
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
  assert.strictEqual(BACKTEST_ENGINE_VERSION, 'backtest-foundation-1.0.0');
  assert.strictEqual(formatSourceLabel('MHCLG_PlanningData'), 'MHCLG Planning Data');
  assert.strictEqual(unattachedPlanningFact().available, false);
});

asyncTest('disabled planning provider degrades honestly', async () => {
  const cfg = propertyIntelligenceConfig.providers.planningData;
  const previous = cfg.enabled;
  cfg.enabled = false;
  try {
    const planning = await getPlanningEvidence(listing(SUBJECT));
    assert.strictEqual(planning.unavailableReason, UNAVAILABLE_REASONS.providerDisabled);
    assert.strictEqual(planning.available, false);
  } finally {
    cfg.enabled = previous;
  }
});

asyncTest('FeatureServer-style query uses a geometry buffer not a postcode', async () => {
  const original = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    calls.push(String(url));
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(FIXTURE),
    };
  };
  try {
    const result = await queryPlanningApplications({ coords: SUBJECT }, { skipCache: true });
    assert.strictEqual(result.success, true);
    assert.ok(calls[0].includes('geometry='));
    assert.ok(calls[0].includes('dataset=planning-application'));
    assert.ok(!calls[0].includes('q=WC1V'));
  } finally {
    global.fetch = original;
  }
});

async function run() {
  for (const t of pending) {
    await t.fn();
    console.log(`✓ ${t.name}`);
  }
  console.log('\nplanningEvidence.test.js — all passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
