/**
 * Conservation-area evidence — MHCLG Planning Data polygon membership.
 * Point-in-polygon only. Unknown is notAssessed, not “not in a conservation area”.
 * Run: node server/tests/conservationAreaEvidence.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { assemblePropertyFacts, publicPropertyFactsForExplanation, SOURCE_PRECEDENCE } = require('../services/ai/propertyFacts');
const {
  getConservationAreaEvidence,
  sanitizeConservationAreaFact,
  unattachedConservationAreaFact,
  UNAVAILABLE_REASONS,
} = require('../services/ai/conservationAreaEvidence');
const {
  parseConservationAreaEntities,
  mapConservationArea,
  classifyConservationArea,
  pointInPolygonWkt,
  queryConservationAreas,
} = require('../services/providers/planningData/conservationAreaClient');
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

const ASOF = '2026-08-26T18:00:00.000Z';
const SUBJECT = Object.freeze({ latitude: 51.5074, longitude: -0.1278 });
const OUTSIDE = Object.freeze({ latitude: 51.5015, longitude: -0.1375 });
const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'conservation-areas-trafalgar-min.json'), 'utf8')
);

function listing(extra = {}) {
  return {
    id: 42,
    title: 'Conservation area evidence listing',
    city: 'London',
    zip_code: 'SW1A 2WH',
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

function successfulQuery(entities = FIXTURE.entities) {
  return {
    success: true,
    entities,
    providerCount: entities.length,
    retrievedAt: ASOF,
    queryKind: 'point_in_polygon',
  };
}

async function assembleReport({ property = listing(), conservationStub, floodStub, skipConservationArea = false, extraOptions = {} } = {}) {
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
      skipPlanning: true,
      skipSchools: true,
      skipListedBuilding: true,
      skipConservationArea,
      skipArticle4: extraOptions.skipArticle4 !== false,
      asOf: ASOF,
      deps: {
        getConservationAreaEvidence: conservationStub,
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
          throw new Error('LLM must not invent conservation-area evidence');
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

test('authoritative conservation-area response parses native name, reference and designation date', () => {
  const parsed = parseConservationAreaEntities(FIXTURE);
  assert.strictEqual(parsed.ok, true);
  const first = mapConservationArea(parsed.entities[0]);
  assert.strictEqual(first.name, 'Trafalgar Square');
  assert.strictEqual(first.reference, 'CONARA/1300');
  assert.strictEqual(first.entityId, 44002870);
  assert.strictEqual(first.organisationEntity, 387);
  assert.strictEqual(first.designationDate, '1993-01-01');
  assert.strictEqual(first.nativeQuality, 'authoritative');
  assert.strictEqual(first.currentArea, true);
});

test('point-in-polygon membership is true only inside the polygon', () => {
  const wkt = FIXTURE.entities[0].geometry;
  assert.strictEqual(pointInPolygonWkt(SUBJECT, wkt), true);
  assert.strictEqual(pointInPolygonWkt(OUTSIDE, wkt), false);
  const inside = classifyConservationArea(mapConservationArea(FIXTURE.entities[0]), SUBJECT);
  const nearby = classifyConservationArea(mapConservationArea(FIXTURE.entities[1]), SUBJECT);
  assert.strictEqual(inside.scope, 'area_membership');
  assert.strictEqual(inside.matchMethod, 'coordinate_point_in_polygon');
  assert.strictEqual(nearby, null);
});

test('ended conservation areas are not current membership', () => {
  const former = mapConservationArea(FIXTURE.entities[2]);
  assert.strictEqual(former.currentArea, false);
  assert.strictEqual(classifyConservationArea(former, SUBJECT), null);
});

asyncTest('canonical conservation-area evidence reaches propertyFacts with provenance and no score', async () => {
  const report = await assembleReport({
    property: listing({ ...SUBJECT }),
    conservationStub: async () => getConservationAreaEvidence(listing({ ...SUBJECT }), {
      queryConservationAreas: async () => successfulQuery(),
    }),
  });
  const fact = report.propertyFacts.facts.conservationArea;
  assert.strictEqual(report.propertyFacts.version, 'property-facts-1.1.0');
  assert.strictEqual(fact.available, true);
  assert.strictEqual(fact.trust, 'observed');
  assert.strictEqual(fact.source, 'MHCLG_PlanningData_ConservationArea');
  assert.strictEqual(fact.provenance.source, 'MHCLG_PlanningData_ConservationArea');
  assert.strictEqual(fact.value, 'Trafalgar Square');
  assert.strictEqual(fact.areas[0].name, 'Trafalgar Square');
  assert.strictEqual(fact.areas[0].reference, 'CONARA/1300');
  assert.strictEqual(fact.areas[0].entityId, 44002870);
  assert.strictEqual(fact.areas[0].designationDate, '1993-01-01');
  assert.strictEqual(fact.scope, 'coordinate_point_in_polygon');
  assert.ok(!fact.areas.some((row) => row.reference === 'CONARA/9999'));
  assert.ok(!fact.areas.some((row) => row.reference === 'CONARA/8888'));
  assert.ok(!Object.prototype.hasOwnProperty.call(fact, 'score'));
  assert.ok(!Object.prototype.hasOwnProperty.call(fact, 'conservationScore'));
  assert.strictEqual(fact.notAScore, true);
  assert.strictEqual(fact.notAListedBuilding, true);
  assert.strictEqual(fact.notAPlanningApplication, true);
  assert.strictEqual(fact.scoringActivated, false);
  assert.strictEqual(fact.notPersonalDecisionInput, true);
  assert.deepStrictEqual([...SOURCE_PRECEDENCE.conservationArea], ['MHCLG_PlanningData_ConservationArea']);
  const explained = publicPropertyFactsForExplanation(report.propertyFacts);
  assert.strictEqual(explained.conservationArea.areas[0].name, 'Trafalgar Square');
  assert.strictEqual(explained.conservationArea.notAScore, true);
});

test('sanitize strips invented scores and keeps native area name', () => {
  const facts = assemblePropertyFacts({
    property: listing({ conservationArea: { score: 99, value: 'high heritage risk' } }),
    conservationAreaEvidence: sanitizeConservationAreaFact({
      available: true,
      value: 'Trafalgar Square',
      conservationScore: 88,
      heritageScore: 12,
      areas: [{ name: 'Trafalgar Square', reference: 'CONARA/1300', entityId: 44002870 }],
    }),
  });
  const fact = facts.facts.conservationArea;
  assert.strictEqual(fact.areas[0].name, 'Trafalgar Square');
  assert.strictEqual(fact.score, undefined);
  assert.strictEqual(fact.conservationScore, undefined);
  assert.strictEqual(fact.heritageScore, undefined);
});

test('client listing conservation-area objects are not property truth', () => {
  const facts = assemblePropertyFacts({
    property: listing({
      conservationArea: { available: true, value: 'Trafalgar Square', score: 0 },
      conservationAreaEvidence: { available: true, value: 'injected' },
      conservationScore: 9,
    }),
  });
  assert.strictEqual(facts.facts.conservationArea.available, false);
  assert.strictEqual(facts.facts.conservationArea.unavailableReason, UNAVAILABLE_REASONS.notAttached);
});

asyncTest('missing location is notAssessed and postcode is not used as a query', async () => {
  const fact = await getConservationAreaEvidence(listing({ zip_code: 'SW1A 2WH' }));
  assert.strictEqual(fact.available, false);
  assert.strictEqual(fact.unavailableReason, UNAVAILABLE_REASONS.locationUnavailable);
  assert.strictEqual(fact.identity.postcodeUsedAsConservationAreaLocation, false);
  assert.ok(!/not in a conservation area/i.test(fact.value || ''));
});

asyncTest('null coordinates are not treated as 0,0', async () => {
  const fact = await getConservationAreaEvidence(listing({ latitude: null, longitude: null, zip_code: 'SW1A 2WH' }));
  assert.strictEqual(fact.unavailableReason, UNAVAILABLE_REASONS.locationUnavailable);
  assert.strictEqual(fact.identity.latitude, null);
});

asyncTest('unsupported geography is notAssessed', async () => {
  const fact = await getConservationAreaEvidence(listing({ latitude: 40.7, longitude: -74.0 }));
  assert.strictEqual(fact.unavailableReason, UNAVAILABLE_REASONS.unsupportedGeography);
  assert.strictEqual(fact.available, false);
});

asyncTest('provider unavailable is notAssessed, not “not in a conservation area”', async () => {
  const fact = await getConservationAreaEvidence(listing(SUBJECT), {
    queryConservationAreas: async () => ({ success: false, reason: 'provider_unavailable' }),
  });
  assert.strictEqual(fact.unavailableReason, UNAVAILABLE_REASONS.providerUnavailable);
  assert.strictEqual(fact.available, false);
  assert.ok(/not “not in a conservation area”/.test(fact.note) || /not "not in a conservation area"/.test(fact.note));
});

asyncTest('empty source result is notAssessed, not an observed negative', async () => {
  const fact = await getConservationAreaEvidence(listing(SUBJECT), {
    queryConservationAreas: async () => successfulQuery([]),
  });
  assert.strictEqual(fact.available, false);
  assert.strictEqual(fact.unavailableReason, UNAVAILABLE_REASONS.noApplicableEvidence);
  assert.strictEqual(fact.value, null);
  assert.ok(/not evidence that the property is outside a conservation area/.test(fact.note));
});

asyncTest('nearby polygon that does not contain the point is not membership', async () => {
  const fact = await getConservationAreaEvidence(listing(SUBJECT), {
    queryConservationAreas: async () => successfulQuery([FIXTURE.entities[1]]),
  });
  assert.strictEqual(fact.available, false);
  assert.strictEqual(fact.unavailableReason, UNAVAILABLE_REASONS.noApplicableEvidence);
});

asyncTest('malformed provider response is notAssessed', async () => {
  const fact = await getConservationAreaEvidence(listing(SUBJECT), {
    queryConservationAreas: async () => ({ success: false, reason: 'malformed_provider_response' }),
  });
  assert.strictEqual(fact.unavailableReason, UNAVAILABLE_REASONS.malformed);
});

test('parseConservationAreaEntities distinguishes hits, empty, and errors', () => {
  assert.strictEqual(parseConservationAreaEntities({ entities: [] }).ok, true);
  assert.strictEqual(parseConservationAreaEntities({ error: { message: 'down' } }).reason, 'provider_unavailable');
  assert.strictEqual(parseConservationAreaEntities('nope').reason, 'malformed_provider_response');
});

asyncTest('canonical report ignores request conservation-area objects', async () => {
  const report = await assembleReport({
    property: listing({ ...SUBJECT }),
    conservationStub: async () => getConservationAreaEvidence(listing({ ...SUBJECT }), {
      queryConservationAreas: async () => successfulQuery([FIXTURE.entities[0]]),
    }),
    extraOptions: {
      conservationArea: { available: true, value: 'invented', score: 0 },
      conservationAreaEvidence: { available: true, value: 'injected' },
      conservationScore: 9,
    },
  });
  assert.strictEqual(report.propertyFacts.facts.conservationArea.areas[0].reference, 'CONARA/1300');
  assert.notStrictEqual(report.propertyFacts.facts.conservationArea.value, 'injected');
});

asyncTest('historical saved conservation areas are not replaced by a later provider response', async () => {
  const historical = await assembleReport({
    property: listing({ ...SUBJECT }),
    conservationStub: async () => getConservationAreaEvidence(listing({ ...SUBJECT }), {
      queryConservationAreas: async () => successfulQuery([FIXTURE.entities[0]]),
    }),
  });
  const row = { id: 95, output_data: historical, created_at: ASOF };
  assert.strictEqual(extractCanonicalCoreFacts(row).propertyFacts.facts.conservationArea.areas[0].reference, 'CONARA/1300');
  const later = await assembleReport({
    property: listing({ ...SUBJECT }),
    conservationStub: async () => getConservationAreaEvidence(listing({ ...SUBJECT }), {
      queryConservationAreas: async () => successfulQuery([]),
    }),
  });
  assert.strictEqual(later.propertyFacts.facts.conservationArea.available, false);
  assert.strictEqual(extractCanonicalCoreFacts(row).propertyFacts.facts.conservationArea.areas[0].name, 'Trafalgar Square');
  const overview = projectPropertyOverview(listing({ ...SUBJECT }), { canonicalReport: row });
  assert.strictEqual(overview.propertyFacts.facts.conservationArea.value, 'Trafalgar Square');
  const snapshotBefore = JSON.stringify(row.output_data.propertyFacts.facts.conservationArea);
  const prepared = resolveSavedWhatIfBaseline({
    id: 95,
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
  assert.strictEqual(JSON.stringify(row.output_data.propertyFacts.facts.conservationArea), snapshotBefore);
});

test('What-if does not call the conservation-area provider and rejects client injection', () => {
  const adapter = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'ai', 'intelligenceWhatIfService.js'),
    'utf8'
  );
  const historical = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'ai', 'historicalWhatIfBaseline.js'),
    'utf8'
  );
  assert.ok(!adapter.includes('getConservationAreaEvidence'));
  assert.ok(!adapter.includes('queryConservationAreas'));
  assert.ok(!historical.includes('getConservationAreaEvidence'));
  const injected = parseWhatIfHttpBody({
    propertyId: 1,
    profile: 'landlord',
    conservationArea: { value: 'Trafalgar Square' },
    conservationScore: 4,
  });
  assert.strictEqual(injected.ok, false);
  assert.ok(injected.errors.some((e) => e.field === 'conservationArea' && e.reason === 'internal_option_not_allowed'));
});

test('HTTP analyse rejects client conservation-area injection', () => {
  assert.ok(parseAnalyseFinanceRequest({ conservationArea: { value: 'Trafalgar Square' } }).errors.some((e) => e.field === 'conservationArea'));
  assert.ok(parseAnalyseFinanceRequest({ conservationAreaEvidence: { available: true } }).errors.some((e) => e.field === 'conservationAreaEvidence'));
  assert.ok(parseAnalyseFinanceRequest({ conservationScore: 4 }).errors.some((e) => e.field === 'conservationScore'));
  assert.ok(parseAnalyseFinanceRequest({ skipConservationArea: true }).errors.some((e) => e.field === 'skipConservationArea'));
  assert.ok(parseAnalyseFinanceRequest({ conservationEvidence: { available: true } }).errors.some((e) => e.field === 'conservationEvidence'));
  assert.ok(parseAnalyseFinanceRequest({ skipCache: true }).errors.some((e) => e.field === 'skipCache'));
});

asyncTest('conservation areas do not change valuation, rent, finance, flood, planning, schools, listed building, or Personal Decision', async () => {
  const withArea = await assembleReport({
    property: listing({ ...SUBJECT, monthly_rent: 1100 }),
    conservationStub: async () => getConservationAreaEvidence(listing({ ...SUBJECT }), {
      queryConservationAreas: async () => successfulQuery(),
    }),
  });
  const withoutArea = await assembleReport({
    property: listing({ ...SUBJECT, monthly_rent: 1100 }),
    skipConservationArea: true,
  });
  assert.strictEqual(withArea.marketIntelligence.sale.centralEstimate, withoutArea.marketIntelligence.sale.centralEstimate);
  assert.strictEqual(withArea.marketIntelligence.rent.recommendedRent, withoutArea.marketIntelligence.rent.recommendedRent);
  assert.strictEqual(withArea.propertyFacts.facts.flood.value, 'Flood Zone 3');
  assert.strictEqual(withoutArea.propertyFacts.facts.flood.value, 'Flood Zone 3');
  assert.strictEqual(withArea.propertyFacts.facts.planning.available, false);
  assert.strictEqual(withArea.propertyFacts.facts.schools.available, false);
  assert.strictEqual(withArea.propertyFacts.facts.listedBuilding.available, false);
  assert.notStrictEqual(withArea.propertyFacts.facts.listedBuilding.field, withArea.propertyFacts.facts.conservationArea.field);
  const metrics = calculateInvestmentMetrics({
    purchasePrice: 200000,
    expectedRent: 1000,
    vacancyAssumption: 5,
    operatingCosts: 0,
  });
  assert.ok(Number.isFinite(metrics.grossYield));
  const withFacts = landlordScore({
    propertyFacts: { facts: { conservationArea: withArea.propertyFacts.facts.conservationArea } },
  });
  const withoutFacts = landlordScore();
  assert.strictEqual(withFacts.score, withoutFacts.score);
  assert.strictEqual(withFacts.dimensions.risk.score, withoutFacts.dimensions.risk.score);
  assert.ok(!Object.prototype.hasOwnProperty.call(withFacts.dimensions, 'conservationArea'));
  assert.ok(!Object.prototype.hasOwnProperty.call(withFacts.dimensions, 'heritage'));
});

test('Personal Decision, confidence, demand, outcomes and backtesting stay frozen', () => {
  assert.strictEqual(LANDLORD_WEIGHTS.demand, 0.08);
  assert.strictEqual(LANDLORD_WEIGHTS.risk, 0.1);
  assert.ok(!Object.prototype.hasOwnProperty.call(LANDLORD_WEIGHTS, 'conservationArea'));
  assert.strictEqual(BUYER_GENERAL_WEIGHTS.affordability, 0.3);
  assert.ok(!Object.prototype.hasOwnProperty.call(BUYER_GENERAL_WEIGHTS, 'conservationArea'));
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
  assert.strictEqual(
    formatSourceLabel('MHCLG_PlanningData_ConservationArea'),
    'Conservation areas via MHCLG Planning Data'
  );
  assert.strictEqual(unattachedConservationAreaFact().available, false);
});

asyncTest('disabled conservation-area provider degrades honestly', async () => {
  const cfg = propertyIntelligenceConfig.providers.conservationArea;
  const previous = cfg.enabled;
  cfg.enabled = false;
  try {
    const fact = await getConservationAreaEvidence(listing(SUBJECT));
    assert.strictEqual(fact.unavailableReason, UNAVAILABLE_REASONS.providerDisabled);
    assert.strictEqual(fact.available, false);
  } finally {
    cfg.enabled = previous;
  }
});

asyncTest('spatial query uses latitude/longitude point-in-polygon not a postcode or buffer', async () => {
  const original = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    calls.push(String(url));
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ entities: [FIXTURE.entities[0]], count: 1 }),
    };
  };
  try {
    const result = await queryConservationAreas({ coords: SUBJECT }, { skipCache: true });
    assert.strictEqual(result.success, true);
    assert.ok(calls[0].includes('latitude='));
    assert.ok(calls[0].includes('longitude='));
    assert.ok(calls[0].includes('dataset=conservation-area'));
    assert.ok(!calls[0].includes('geometry='));
    assert.ok(!calls[0].includes('q=SW1A'));
    assert.ok(!calls[0].includes('q='));
  } finally {
    global.fetch = original;
  }
});

async function run() {
  for (const t of pending) {
    await t.fn();
    console.log(`✓ ${t.name}`);
  }
  console.log('\nconservationAreaEvidence.test.js — all passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
