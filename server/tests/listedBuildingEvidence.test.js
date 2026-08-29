/**
 * Listed-building evidence — Historic England NHLE via MHCLG Planning Data.
 * Property-level same-site match only. Native grades. Unknown is notAssessed, not “not listed”.
 * Run: node server/tests/listedBuildingEvidence.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { assemblePropertyFacts, publicPropertyFactsForExplanation, SOURCE_PRECEDENCE } = require('../services/ai/propertyFacts');
const {
  getListedBuildingEvidence,
  sanitizeListedBuildingFact,
  unattachedListedBuildingFact,
  UNAVAILABLE_REASONS,
} = require('../services/ai/listedBuildingEvidence');
const {
  parseListedBuildingEntities,
  mapListedBuilding,
  classifyListedBuilding,
  nativeGrade,
  haversineMetres,
  parseWktPoint,
  queryListedBuildings,
  DEFAULT_SEARCH_RADIUS_M,
  NATIVE_GRADES,
} = require('../services/providers/planningData/listedBuildingClient');
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

const ASOF = '2026-08-26T15:00:00.000Z';
const SUBJECT = Object.freeze({ latitude: 51.505799, longitude: -0.127707 });
const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'listed-buildings-whitehall-min.json'), 'utf8')
);

function listing(extra = {}) {
  return {
    id: 42,
    title: 'Listed building evidence listing',
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
    queryKind: 'geometry_buffer',
    radiusMetres: DEFAULT_SEARCH_RADIUS_M,
  };
}

async function assembleReport({ property = listing(), listedStub, floodStub, skipListedBuilding = false, extraOptions = {} } = {}) {
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
      skipListedBuilding,
      skipConservationArea: extraOptions.skipConservationArea !== false,
      skipArticle4: extraOptions.skipArticle4 !== false,
      asOf: ASOF,
      deps: {
        getListedBuildingEvidence: listedStub,
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
          throw new Error('LLM must not invent listed-building evidence');
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

test('authoritative listed-building response parses native Grade I, II* and II', () => {
  const parsed = parseListedBuildingEntities(FIXTURE);
  assert.strictEqual(parsed.ok, true);
  const gradeI = mapListedBuilding(parsed.entities[0]);
  const gradeIIstar = mapListedBuilding(parsed.entities[1]);
  const gradeII = mapListedBuilding(parsed.entities[2]);
  assert.strictEqual(gradeI.listEntryNumber, '1066099');
  assert.strictEqual(gradeI.nativeGrade, 'I');
  assert.strictEqual(gradeIIstar.nativeGrade, 'II*');
  assert.strictEqual(gradeII.nativeGrade, 'II');
  assert.deepStrictEqual([...NATIVE_GRADES], ['I', 'II*', 'II']);
  assert.strictEqual(nativeGrade('II*'), 'II*');
  assert.strictEqual(nativeGrade('2'), null);
  assert.strictEqual(nativeGrade(1), null);
  assert.ok(gradeI.documentationUrl.includes('historicengland.org.uk'));
});

test('ended listings are not current listed-building facts', () => {
  const former = mapListedBuilding(FIXTURE.entities[3]);
  assert.strictEqual(former.currentListing, false);
  assert.strictEqual(classifyListedBuilding(former, SUBJECT, DEFAULT_SEARCH_RADIUS_M), null);
});

test('same-site match is property-level; nearby is not this property', () => {
  const onSite = classifyListedBuilding(mapListedBuilding(FIXTURE.entities[0]), SUBJECT, DEFAULT_SEARCH_RADIUS_M);
  const nearbyOnSite = classifyListedBuilding(mapListedBuilding(FIXTURE.entities[1]), SUBJECT, DEFAULT_SEARCH_RADIUS_M);
  const distant = classifyListedBuilding(mapListedBuilding(FIXTURE.entities[2]), SUBJECT, DEFAULT_SEARCH_RADIUS_M);
  assert.strictEqual(onSite.scope, 'property');
  assert.strictEqual(onSite.matchMethod, 'same_site_coordinates');
  assert.ok(onSite.distanceMetres < 5);
  assert.strictEqual(nearbyOnSite.scope, 'property');
  assert.ok(nearbyOnSite.distanceMetres <= DEFAULT_SEARCH_RADIUS_M);
  assert.strictEqual(distant, null);
});

test('distance is deterministic from verified coordinates', () => {
  const a = parseWktPoint('POINT (-0.127707 51.505799)');
  const b = parseWktPoint('POINT (-0.127592 51.505799)');
  const first = haversineMetres(a, b);
  const second = haversineMetres(a, b);
  assert.strictEqual(first, second);
  assert.ok(first > 5 && first < 15);
});

asyncTest('canonical listed-building evidence reaches propertyFacts with provenance and no score', async () => {
  const report = await assembleReport({
    property: listing({ ...SUBJECT }),
    listedStub: async () => getListedBuildingEvidence(listing({ ...SUBJECT }), {
      queryListedBuildings: async () => successfulQuery(),
    }),
  });
  const listed = report.propertyFacts.facts.listedBuilding;
  assert.strictEqual(report.propertyFacts.version, 'property-facts-1.1.0');
  assert.strictEqual(listed.available, true);
  assert.strictEqual(listed.trust, 'observed');
  assert.strictEqual(listed.source, 'MHCLG_PlanningData_ListedBuilding');
  assert.strictEqual(listed.provenance.source, 'MHCLG_PlanningData_ListedBuilding');
  assert.strictEqual(listed.nativeGrade, 'I');
  assert.ok(listed.value.includes('Grade I'));
  assert.ok(listed.value.includes('II*'));
  assert.strictEqual(listed.listings[0].listEntryNumber, '1066099');
  assert.strictEqual(listed.listings[0].nativeGrade, 'I');
  assert.strictEqual(listed.listings[1].nativeGrade, 'II*');
  assert.ok(!listed.listings.some((row) => row.nativeGrade === 'II' && row.listEntryNumber === '1066104'));
  assert.ok(!listed.listings.some((row) => row.listEntryNumber === '9999999'));
  assert.ok(!Object.prototype.hasOwnProperty.call(listed, 'score'));
  assert.ok(!Object.prototype.hasOwnProperty.call(listed, 'heritageScore'));
  assert.strictEqual(listed.notAScore, true);
  assert.strictEqual(listed.scoringActivated, false);
  assert.strictEqual(listed.notPersonalDecisionInput, true);
  assert.strictEqual(listed.notAValuationAdjustment, true);
  assert.strictEqual(listed.searchRadiusMetres, DEFAULT_SEARCH_RADIUS_M);
  assert.deepStrictEqual([...SOURCE_PRECEDENCE.listedBuilding], ['MHCLG_PlanningData_ListedBuilding']);
  const explained = publicPropertyFactsForExplanation(report.propertyFacts);
  assert.strictEqual(explained.listedBuilding.listings[0].nativeGrade, 'I');
  assert.strictEqual(explained.listedBuilding.notAScore, true);
});

test('sanitize strips invented scores and keeps native II*', () => {
  const facts = assemblePropertyFacts({
    property: listing({ listedBuilding: { score: 99, value: 'high heritage risk' } }),
    listedBuildingEvidence: sanitizeListedBuildingFact({
      available: true,
      value: 'Grade II*',
      heritageScore: 88,
      listedBuildingScore: 12,
      listings: [{ listEntryNumber: '1066081', name: 'ADMIRALTY HOUSE', nativeGrade: 'II*', scope: 'property' }],
    }),
  });
  const listed = facts.facts.listedBuilding;
  assert.strictEqual(listed.listings[0].nativeGrade, 'II*');
  assert.strictEqual(listed.nativeGrade, 'II*');
  assert.strictEqual(listed.score, undefined);
  assert.strictEqual(listed.heritageScore, undefined);
  assert.strictEqual(listed.listedBuildingScore, undefined);
  assert.notStrictEqual(listed.value, 'high heritage risk');
});

test('client listing listed-building objects are not property truth', () => {
  const facts = assemblePropertyFacts({
    property: listing({
      listedBuilding: { available: true, value: 'Grade I', score: 0 },
      listedBuildingEvidence: { available: true, value: 'injected' },
      listed: true,
      heritageScore: 9,
    }),
  });
  assert.strictEqual(facts.facts.listedBuilding.available, false);
  assert.strictEqual(facts.facts.listedBuilding.unavailableReason, UNAVAILABLE_REASONS.notAttached);
});

asyncTest('missing location is notAssessed and postcode is not used as a query', async () => {
  const listed = await getListedBuildingEvidence(listing({ zip_code: 'SW1A 2WH' }));
  assert.strictEqual(listed.available, false);
  assert.strictEqual(listed.unavailableReason, UNAVAILABLE_REASONS.locationUnavailable);
  assert.strictEqual(listed.identity.postcodeUsedAsListedBuildingLocation, false);
  assert.ok(!/not listed/i.test(listed.value || ''));
});

asyncTest('null coordinates are not treated as 0,0', async () => {
  const listed = await getListedBuildingEvidence(listing({ latitude: null, longitude: null, zip_code: 'SW1A 2WH' }));
  assert.strictEqual(listed.unavailableReason, UNAVAILABLE_REASONS.locationUnavailable);
  assert.strictEqual(listed.identity.latitude, null);
});

asyncTest('unsupported geography is notAssessed', async () => {
  const listed = await getListedBuildingEvidence(listing({ latitude: 40.7, longitude: -74.0 }));
  assert.strictEqual(listed.unavailableReason, UNAVAILABLE_REASONS.unsupportedGeography);
  assert.strictEqual(listed.available, false);
});

asyncTest('provider unavailable is notAssessed, not “not listed”', async () => {
  const listed = await getListedBuildingEvidence(listing(SUBJECT), {
    queryListedBuildings: async () => ({ success: false, reason: 'provider_unavailable' }),
  });
  assert.strictEqual(listed.unavailableReason, UNAVAILABLE_REASONS.providerUnavailable);
  assert.strictEqual(listed.available, false);
  assert.ok(/not “not listed”/.test(listed.note) || /not "not listed"/.test(listed.note));
});

asyncTest('empty source result is notAssessed, not “not listed”', async () => {
  const listed = await getListedBuildingEvidence(listing(SUBJECT), {
    queryListedBuildings: async () => successfulQuery([]),
  });
  assert.strictEqual(listed.available, false);
  assert.strictEqual(listed.unavailableReason, UNAVAILABLE_REASONS.noApplicableEvidence);
  assert.strictEqual(listed.value, null);
  assert.ok(/not evidence that the property is not listed/.test(listed.note));
});

asyncTest('nearby-only listed building is not property-level proof', async () => {
  const listed = await getListedBuildingEvidence(listing(SUBJECT), {
    queryListedBuildings: async () => successfulQuery([FIXTURE.entities[2]]),
  });
  assert.strictEqual(listed.available, false);
  assert.strictEqual(listed.unavailableReason, UNAVAILABLE_REASONS.noApplicableEvidence);
  assert.strictEqual(listed.listings.length, 0);
});

asyncTest('malformed provider response is notAssessed', async () => {
  const listed = await getListedBuildingEvidence(listing(SUBJECT), {
    queryListedBuildings: async () => ({ success: false, reason: 'malformed_provider_response' }),
  });
  assert.strictEqual(listed.unavailableReason, UNAVAILABLE_REASONS.malformed);
});

test('parseListedBuildingEntities distinguishes hits, empty, and errors', () => {
  assert.strictEqual(parseListedBuildingEntities({ entities: [] }).ok, true);
  assert.strictEqual(parseListedBuildingEntities({ error: { message: 'down' } }).reason, 'provider_unavailable');
  assert.strictEqual(parseListedBuildingEntities('nope').reason, 'malformed_provider_response');
});

asyncTest('canonical report ignores request listed-building objects', async () => {
  const report = await assembleReport({
    property: listing({ ...SUBJECT }),
    listedStub: async () => getListedBuildingEvidence(listing({ ...SUBJECT }), {
      queryListedBuildings: async () => successfulQuery([FIXTURE.entities[0]]),
    }),
    extraOptions: {
      listedBuilding: { available: true, value: 'Grade I', score: 0 },
      listedBuildingEvidence: { available: true, value: 'injected' },
      heritageScore: 9,
      listed: true,
    },
  });
  assert.strictEqual(report.propertyFacts.facts.listedBuilding.listings[0].listEntryNumber, '1066099');
  assert.notStrictEqual(report.propertyFacts.facts.listedBuilding.value, 'injected');
  assert.strictEqual(report.propertyFacts.facts.listedBuilding.nativeGrade, 'I');
});

asyncTest('historical saved listed buildings are not replaced by a later provider response', async () => {
  const historical = await assembleReport({
    property: listing({ ...SUBJECT }),
    listedStub: async () => getListedBuildingEvidence(listing({ ...SUBJECT }), {
      queryListedBuildings: async () => successfulQuery([FIXTURE.entities[0]]),
    }),
  });
  const row = { id: 94, output_data: historical, created_at: ASOF };
  assert.strictEqual(extractCanonicalCoreFacts(row).propertyFacts.facts.listedBuilding.listings[0].listEntryNumber, '1066099');
  const later = await assembleReport({
    property: listing({ ...SUBJECT }),
    listedStub: async () => getListedBuildingEvidence(listing({ ...SUBJECT }), {
      queryListedBuildings: async () => successfulQuery([FIXTURE.entities[1]]),
    }),
  });
  assert.strictEqual(later.propertyFacts.facts.listedBuilding.listings[0].listEntryNumber, '1066081');
  assert.strictEqual(extractCanonicalCoreFacts(row).propertyFacts.facts.listedBuilding.listings[0].listEntryNumber, '1066099');
  const overview = projectPropertyOverview(listing({ ...SUBJECT }), { canonicalReport: row });
  assert.strictEqual(overview.propertyFacts.facts.listedBuilding.listings[0].listEntryNumber, '1066099');
  const snapshotBefore = JSON.stringify(row.output_data.propertyFacts.facts.listedBuilding);
  const prepared = resolveSavedWhatIfBaseline({
    id: 94,
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
  assert.strictEqual(JSON.stringify(row.output_data.propertyFacts.facts.listedBuilding), snapshotBefore);
});

test('What-if does not call the listed-building provider and rejects client injection', () => {
  const adapter = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'ai', 'intelligenceWhatIfService.js'),
    'utf8'
  );
  const historical = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'ai', 'historicalWhatIfBaseline.js'),
    'utf8'
  );
  assert.ok(!adapter.includes('getListedBuildingEvidence'));
  assert.ok(!adapter.includes('queryListedBuildings'));
  assert.ok(!historical.includes('getListedBuildingEvidence'));
  const injected = parseWhatIfHttpBody({
    propertyId: 1,
    profile: 'landlord',
    listedBuilding: { value: 'Grade I' },
    listedBuildingEvidence: { available: true },
    heritageScore: 4,
  });
  assert.strictEqual(injected.ok, false);
  assert.ok(injected.errors.some((e) => e.field === 'listedBuilding' && e.reason === 'internal_option_not_allowed'));
});

test('HTTP analyse rejects client listed-building injection', () => {
  assert.ok(parseAnalyseFinanceRequest({ listedBuilding: { value: 'Grade I' } }).errors.some((e) => e.field === 'listedBuilding'));
  assert.ok(parseAnalyseFinanceRequest({ listedBuildingEvidence: { available: true } }).errors.some((e) => e.field === 'listedBuildingEvidence'));
  assert.ok(parseAnalyseFinanceRequest({ heritageScore: 4 }).errors.some((e) => e.field === 'heritageScore'));
  assert.ok(parseAnalyseFinanceRequest({ skipListedBuilding: true }).errors.some((e) => e.field === 'skipListedBuilding'));
  assert.ok(parseAnalyseFinanceRequest({ listed: true }).errors.some((e) => e.field === 'listed'));
  assert.ok(parseAnalyseFinanceRequest({ listedBuildingScore: 9 }).errors.some((e) => e.field === 'listedBuildingScore'));
  assert.ok(parseAnalyseFinanceRequest({ skipCache: true }).errors.some((e) => e.field === 'skipCache'));
});

asyncTest('listed buildings do not change valuation, rent, finance, flood, planning, schools, or Personal Decision', async () => {
  const withListed = await assembleReport({
    property: listing({ ...SUBJECT, monthly_rent: 1100 }),
    listedStub: async () => getListedBuildingEvidence(listing({ ...SUBJECT }), {
      queryListedBuildings: async () => successfulQuery(),
    }),
  });
  const withoutListed = await assembleReport({
    property: listing({ ...SUBJECT, monthly_rent: 1100 }),
    skipListedBuilding: true,
  });
  assert.strictEqual(withListed.marketIntelligence.sale.centralEstimate, withoutListed.marketIntelligence.sale.centralEstimate);
  assert.strictEqual(withListed.marketIntelligence.rent.recommendedRent, withoutListed.marketIntelligence.rent.recommendedRent);
  assert.strictEqual(withListed.propertyFacts.facts.flood.value, 'Flood Zone 3');
  assert.strictEqual(withoutListed.propertyFacts.facts.flood.value, 'Flood Zone 3');
  assert.strictEqual(withListed.propertyFacts.facts.planning.available, false);
  assert.strictEqual(withListed.propertyFacts.facts.schools.available, false);
  const metrics = calculateInvestmentMetrics({
    purchasePrice: 200000,
    expectedRent: 1000,
    vacancyAssumption: 5,
    operatingCosts: 0,
  });
  assert.ok(Number.isFinite(metrics.grossYield));
  const withFacts = landlordScore({
    propertyFacts: { facts: { listedBuilding: withListed.propertyFacts.facts.listedBuilding } },
  });
  const withoutFacts = landlordScore();
  assert.strictEqual(withFacts.score, withoutFacts.score);
  assert.strictEqual(withFacts.dimensions.risk.score, withoutFacts.dimensions.risk.score);
  assert.ok(!Object.prototype.hasOwnProperty.call(withFacts.dimensions, 'listedBuilding'));
  assert.ok(!Object.prototype.hasOwnProperty.call(withFacts.dimensions, 'heritage'));
});

test('Personal Decision, confidence, demand, outcomes and backtesting stay frozen', () => {
  assert.strictEqual(LANDLORD_WEIGHTS.demand, 0.08);
  assert.strictEqual(LANDLORD_WEIGHTS.risk, 0.1);
  assert.ok(!Object.prototype.hasOwnProperty.call(LANDLORD_WEIGHTS, 'listedBuilding'));
  assert.ok(!Object.prototype.hasOwnProperty.call(LANDLORD_WEIGHTS, 'heritage'));
  assert.strictEqual(BUYER_GENERAL_WEIGHTS.affordability, 0.3);
  assert.ok(!Object.prototype.hasOwnProperty.call(BUYER_GENERAL_WEIGHTS, 'listedBuilding'));
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
    formatSourceLabel('MHCLG_PlanningData_ListedBuilding'),
    'Historic England NHLE via MHCLG Planning Data'
  );
  assert.strictEqual(unattachedListedBuildingFact().available, false);
});

asyncTest('disabled listed-building provider degrades honestly', async () => {
  const cfg = propertyIntelligenceConfig.providers.listedBuilding;
  const previous = cfg.enabled;
  cfg.enabled = false;
  try {
    const listed = await getListedBuildingEvidence(listing(SUBJECT));
    assert.strictEqual(listed.unavailableReason, UNAVAILABLE_REASONS.providerDisabled);
    assert.strictEqual(listed.available, false);
  } finally {
    cfg.enabled = previous;
  }
});

asyncTest('spatial query uses a geometry buffer not a postcode', async () => {
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
    const result = await queryListedBuildings({ coords: SUBJECT }, { skipCache: true });
    assert.strictEqual(result.success, true);
    assert.ok(calls[0].includes('geometry='));
    assert.ok(calls[0].includes('dataset=listed-building'));
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
  console.log('\nlistedBuildingEvidence.test.js — all passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
