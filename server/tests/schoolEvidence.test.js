/**
 * Schools / catchment evidence — DfE GIAS via MHCLG Planning Data educational-establishment dataset.
 * Nearby is area context only. Catchment is not assessed. No school score.
 * Run: node server/tests/schoolEvidence.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { assemblePropertyFacts, publicPropertyFactsForExplanation, SOURCE_PRECEDENCE } = require('../services/ai/propertyFacts');
const {
  getSchoolEvidence,
  sanitizeSchoolFact,
  unattachedSchoolFact,
  UNAVAILABLE_REASONS,
} = require('../services/ai/schoolEvidence');
const {
  parseEstablishmentEntities,
  mapEstablishment,
  classifyEstablishment,
  haversineMetres,
  parseWktPoint,
  queryEducationalEstablishments,
  DEFAULT_SEARCH_RADIUS_M,
  GIAS_TYPE_NAMES,
  GIAS_STATUS_NAMES,
} = require('../services/providers/planningData/educationalEstablishmentClient');
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
  fs.readFileSync(path.join(__dirname, 'fixtures', 'educational-establishments-holborn-min.json'), 'utf8')
);

function listing(extra = {}) {
  return {
    id: 42,
    title: 'School evidence listing',
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

async function assembleReport({ property = listing(), schoolStub, floodStub, skipSchools = false, extraOptions = {} } = {}) {
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
      skipSchools,
      skipListedBuilding: extraOptions.skipListedBuilding !== false,
      skipConservationArea: extraOptions.skipConservationArea !== false,
      skipArticle4: extraOptions.skipArticle4 !== false,
      asOf: ASOF,
      deps: {
        getSchoolEvidence: schoolStub,
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
          throw new Error('LLM must not invent school evidence');
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

test('authoritative school response parses with native type, status and URN', () => {
  const parsed = parseEstablishmentEntities(FIXTURE);
  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(parsed.entities.length, 4);
  const first = mapEstablishment(parsed.entities[0]);
  assert.strictEqual(first.urn, '100000');
  assert.strictEqual(first.name, "St Alban's Church of England Primary School");
  assert.strictEqual(first.nativeTypeCode, '02');
  assert.strictEqual(first.nativeType, GIAS_TYPE_NAMES['02']);
  assert.strictEqual(first.nativeStatusCode, '1');
  assert.strictEqual(first.nativeStatus, GIAS_STATUS_NAMES['1']);
  assert.strictEqual(first.phase, null);
  assert.strictEqual(first.inspection, undefined);
  assert.ok(first.point.latitude);
  assert.ok(first.websiteUrl.startsWith('https://'));
});

test('nearby is not catchment even when distance is small', () => {
  const mapped = mapEstablishment(FIXTURE.entities[0]);
  const nearby = classifyEstablishment(mapped, SUBJECT, DEFAULT_SEARCH_RADIUS_M);
  assert.strictEqual(nearby.scope, 'nearby');
  assert.ok(nearby.distanceMetres < 150);
  assert.notStrictEqual(nearby.scope, 'catchment');
  assert.notStrictEqual(nearby.scope, 'property');
});

test('establishments outside the fixed radius are excluded', () => {
  const distant = mapEstablishment(FIXTURE.entities[3]);
  const classified = classifyEstablishment(distant, SUBJECT, DEFAULT_SEARCH_RADIUS_M);
  assert.strictEqual(classified, null);
  const inside = classifyEstablishment(mapEstablishment(FIXTURE.entities[1]), SUBJECT, DEFAULT_SEARCH_RADIUS_M);
  assert.ok(inside.distanceMetres <= DEFAULT_SEARCH_RADIUS_M);
});

test('distance is deterministic from verified coordinates', () => {
  const a = parseWktPoint('POINT (-0.114869 51.518336)');
  const b = parseWktPoint('POINT (-0.113714 51.518336)');
  const first = haversineMetres(a, b);
  const second = haversineMetres(a, b);
  assert.strictEqual(first, second);
  assert.ok(first > 50 && first < 150);
});

test('native inspection fields stay absent rather than scored', () => {
  const mapped = mapEstablishment(FIXTURE.entities[0]);
  assert.strictEqual(mapped.phase, null);
  assert.ok(!Object.prototype.hasOwnProperty.call(mapped, 'ofstedScore'));
  assert.ok(!Object.prototype.hasOwnProperty.call(mapped, 'schoolScore'));
});

asyncTest('canonical school evidence reaches propertyFacts with provenance and no score', async () => {
  const report = await assembleReport({
    property: listing({ ...SUBJECT }),
    schoolStub: async () => getSchoolEvidence(listing({ ...SUBJECT }), {
      queryEducationalEstablishments: async () => successfulQuery(),
    }),
  });
  const schools = report.propertyFacts.facts.schools;
  assert.strictEqual(report.propertyFacts.version, 'property-facts-1.1.0');
  assert.strictEqual(schools.available, true);
  assert.strictEqual(schools.trust, 'areaContext');
  assert.strictEqual(schools.source, 'MHCLG_PlanningData_EducationalEstablishment');
  assert.strictEqual(schools.provenance.source, 'MHCLG_PlanningData_EducationalEstablishment');
  assert.ok(schools.summary.nearbyCount >= 2);
  assert.strictEqual(schools.nearbySchools[0].urn, '100000');
  assert.strictEqual(schools.nearbySchools[0].nativeType, 'Voluntary Aided School');
  assert.strictEqual(schools.nearbySchools[0].notCatchment, true);
  assert.strictEqual(schools.catchment.state, 'notAssessed');
  assert.strictEqual(schools.catchment.reason, UNAVAILABLE_REASONS.noCatchmentSource);
  assert.ok(!Object.prototype.hasOwnProperty.call(schools, 'score'));
  assert.ok(!Object.prototype.hasOwnProperty.call(schools, 'schoolScore'));
  assert.strictEqual(schools.notAScore, true);
  assert.strictEqual(schools.scoringActivated, false);
  assert.strictEqual(schools.notPersonalDecisionInput, true);
  assert.strictEqual(schools.searchRadiusMetres, DEFAULT_SEARCH_RADIUS_M);
  assert.deepStrictEqual([...SOURCE_PRECEDENCE.schools], ['MHCLG_PlanningData_EducationalEstablishment']);
  const explained = publicPropertyFactsForExplanation(report.propertyFacts);
  assert.strictEqual(explained.schools.nearbySchools[0].urn, '100000');
  assert.strictEqual(explained.schools.catchment.reason, UNAVAILABLE_REASONS.noCatchmentSource);
  assert.strictEqual(explained.schools.notAScore, true);
});

test('sanitize strips invented scores and keeps native type', () => {
  const facts = assemblePropertyFacts({
    property: listing({ schools: { score: 99, value: 'great schools' } }),
    schoolEvidence: sanitizeSchoolFact({
      available: true,
      value: '1 nearby establishment within 800m',
      schoolScore: 88,
      educationScore: 12,
      nearbySchools: [{ urn: '100000', name: 'Test', nativeType: 'Community School', nativeStatus: 'Open', scope: 'nearby' }],
      catchment: { available: true, reason: 'invented' },
    }),
  });
  const schools = facts.facts.schools;
  assert.strictEqual(schools.nearbySchools[0].urn, '100000');
  assert.strictEqual(schools.nearbySchools[0].nativeType, 'Community School');
  assert.strictEqual(schools.score, undefined);
  assert.strictEqual(schools.schoolScore, undefined);
  assert.strictEqual(schools.catchment.state, 'notAssessed');
  assert.strictEqual(schools.catchment.reason, UNAVAILABLE_REASONS.noCatchmentSource);
  assert.strictEqual(schools.trust, 'areaContext');
});

test('client listing school objects are not property truth', () => {
  const facts = assemblePropertyFacts({
    property: listing({
      schools: { available: true, value: 'outstanding catchment', score: 0 },
      schoolEvidence: { available: true, value: 'injected' },
      primarySchoolNearby: 'St Alban\'s',
      secondarySchoolNearby: 'City Academy',
    }),
  });
  assert.strictEqual(facts.facts.schools.available, false);
  assert.strictEqual(facts.facts.schools.unavailableReason, UNAVAILABLE_REASONS.notAttached);
});

asyncTest('missing location is notAssessed and postcode is not used as a query', async () => {
  const schools = await getSchoolEvidence(listing({ zip_code: 'WC1V 6EP' }));
  assert.strictEqual(schools.available, false);
  assert.strictEqual(schools.unavailableReason, UNAVAILABLE_REASONS.locationUnavailable);
  assert.strictEqual(schools.identity.postcodeUsedAsSchoolLocation, false);
  assert.strictEqual(schools.catchment.reason, UNAVAILABLE_REASONS.noCatchmentSource);
  assert.ok(!/no schools/i.test(schools.value || ''));
});

asyncTest('null coordinates are not treated as 0,0', async () => {
  const schools = await getSchoolEvidence(listing({ latitude: null, longitude: null, zip_code: 'WC1V 6EP' }));
  assert.strictEqual(schools.unavailableReason, UNAVAILABLE_REASONS.locationUnavailable);
  assert.strictEqual(schools.identity.latitude, null);
});

asyncTest('unsupported geography is notAssessed', async () => {
  const schools = await getSchoolEvidence(listing({ latitude: 40.7, longitude: -74.0 }));
  assert.strictEqual(schools.unavailableReason, UNAVAILABLE_REASONS.unsupportedGeography);
  assert.strictEqual(schools.available, false);
  assert.strictEqual(schools.catchment.reason, UNAVAILABLE_REASONS.noCatchmentSource);
});

asyncTest('provider unavailable is notAssessed, not “no schools”', async () => {
  const schools = await getSchoolEvidence(listing(SUBJECT), {
    queryEducationalEstablishments: async () => ({ success: false, reason: 'provider_unavailable' }),
  });
  assert.strictEqual(schools.unavailableReason, UNAVAILABLE_REASONS.providerUnavailable);
  assert.strictEqual(schools.available, false);
  assert.ok(/not “no schools”/.test(schools.note) || /not "no schools"/.test(schools.note) || /not .*no schools/.test(schools.note));
});

asyncTest('empty source result is observed emptiness, not “no schools”', async () => {
  const schools = await getSchoolEvidence(listing(SUBJECT), {
    queryEducationalEstablishments: async () => successfulQuery([]),
  });
  assert.strictEqual(schools.available, true);
  assert.strictEqual(schools.unavailableReason, UNAVAILABLE_REASONS.noApplicableEvidence);
  assert.strictEqual(schools.summary.nearbyCount, 0);
  assert.strictEqual(schools.catchment.reason, UNAVAILABLE_REASONS.noCatchmentSource);
  assert.ok(/not evidence that there are no schools/.test(schools.note));
});

asyncTest('malformed provider response is notAssessed', async () => {
  const schools = await getSchoolEvidence(listing(SUBJECT), {
    queryEducationalEstablishments: async () => ({ success: false, reason: 'malformed_provider_response' }),
  });
  assert.strictEqual(schools.unavailableReason, UNAVAILABLE_REASONS.malformed);
});

test('parseEstablishmentEntities distinguishes hits, empty, and errors', () => {
  assert.strictEqual(parseEstablishmentEntities({ entities: [] }).ok, true);
  assert.strictEqual(parseEstablishmentEntities({ error: { message: 'down' } }).reason, 'provider_unavailable');
  assert.strictEqual(parseEstablishmentEntities('nope').reason, 'malformed_provider_response');
});

asyncTest('canonical report ignores request school objects', async () => {
  const report = await assembleReport({
    property: listing({ ...SUBJECT }),
    schoolStub: async () => getSchoolEvidence(listing({ ...SUBJECT }), {
      queryEducationalEstablishments: async () => successfulQuery([FIXTURE.entities[0]]),
    }),
    extraOptions: {
      schools: { available: true, value: 'outstanding', score: 0 },
      schoolEvidence: { available: true, value: 'injected' },
      schoolScore: 9,
      catchment: { available: true, schools: ['invented'] },
    },
  });
  assert.strictEqual(report.propertyFacts.facts.schools.nearbySchools[0].urn, '100000');
  assert.notStrictEqual(report.propertyFacts.facts.schools.value, 'injected');
  assert.strictEqual(report.propertyFacts.facts.schools.catchment.reason, UNAVAILABLE_REASONS.noCatchmentSource);
});

asyncTest('historical saved schools are not replaced by a later provider response', async () => {
  const historical = await assembleReport({
    property: listing({ ...SUBJECT }),
    schoolStub: async () => getSchoolEvidence(listing({ ...SUBJECT }), {
      queryEducationalEstablishments: async () => successfulQuery([FIXTURE.entities[0]]),
    }),
  });
  const row = { id: 93, output_data: historical, created_at: ASOF };
  assert.strictEqual(extractCanonicalCoreFacts(row).propertyFacts.facts.schools.nearbySchools[0].urn, '100000');
  const later = await assembleReport({
    property: listing({ ...SUBJECT }),
    schoolStub: async () => getSchoolEvidence(listing({ ...SUBJECT }), {
      queryEducationalEstablishments: async () => successfulQuery([FIXTURE.entities[1]]),
    }),
  });
  assert.strictEqual(later.propertyFacts.facts.schools.nearbySchools[0].urn, '136000');
  assert.strictEqual(extractCanonicalCoreFacts(row).propertyFacts.facts.schools.nearbySchools[0].urn, '100000');
  const overview = projectPropertyOverview(listing({ ...SUBJECT }), { canonicalReport: row });
  assert.strictEqual(overview.propertyFacts.facts.schools.nearbySchools[0].urn, '100000');
  const snapshotBefore = JSON.stringify(row.output_data.propertyFacts.facts.schools);
  const prepared = resolveSavedWhatIfBaseline({
    id: 93,
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
  assert.strictEqual(JSON.stringify(row.output_data.propertyFacts.facts.schools), snapshotBefore);
});

test('What-if does not call the school provider and rejects client school injection', () => {
  const adapter = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'ai', 'intelligenceWhatIfService.js'),
    'utf8'
  );
  const historical = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'ai', 'historicalWhatIfBaseline.js'),
    'utf8'
  );
  assert.ok(!adapter.includes('getSchoolEvidence'));
  assert.ok(!adapter.includes('queryEducationalEstablishments'));
  assert.ok(!historical.includes('getSchoolEvidence'));
  const injected = parseWhatIfHttpBody({
    propertyId: 1,
    profile: 'landlord',
    schools: { value: 'outstanding' },
    schoolEvidence: { available: true },
    catchment: { available: true },
  });
  assert.strictEqual(injected.ok, false);
  assert.ok(injected.errors.some((e) => e.field === 'schools' && e.reason === 'internal_option_not_allowed'));
});

test('HTTP analyse rejects client school injection', () => {
  assert.ok(parseAnalyseFinanceRequest({ schools: { value: 'outstanding' } }).errors.some((e) => e.field === 'schools'));
  assert.ok(parseAnalyseFinanceRequest({ schoolEvidence: { available: true } }).errors.some((e) => e.field === 'schoolEvidence'));
  assert.ok(parseAnalyseFinanceRequest({ schoolScore: 4 }).errors.some((e) => e.field === 'schoolScore'));
  assert.ok(parseAnalyseFinanceRequest({ skipSchools: true }).errors.some((e) => e.field === 'skipSchools'));
  assert.ok(parseAnalyseFinanceRequest({ catchment: { available: true } }).errors.some((e) => e.field === 'catchment'));
  assert.ok(parseAnalyseFinanceRequest({ educationScore: 9 }).errors.some((e) => e.field === 'educationScore'));
  assert.ok(parseAnalyseFinanceRequest({ skipCache: true }).errors.some((e) => e.field === 'skipCache'));
});

asyncTest('schools do not change valuation, rent, finance, flood, planning, or Personal Decision', async () => {
  const withSchools = await assembleReport({
    property: listing({ ...SUBJECT, monthly_rent: 1100 }),
    schoolStub: async () => getSchoolEvidence(listing({ ...SUBJECT }), {
      queryEducationalEstablishments: async () => successfulQuery(),
    }),
  });
  const withoutSchools = await assembleReport({
    property: listing({ ...SUBJECT, monthly_rent: 1100 }),
    skipSchools: true,
  });
  assert.strictEqual(withSchools.marketIntelligence.sale.centralEstimate, withoutSchools.marketIntelligence.sale.centralEstimate);
  assert.strictEqual(withSchools.marketIntelligence.rent.recommendedRent, withoutSchools.marketIntelligence.rent.recommendedRent);
  assert.strictEqual(withSchools.propertyFacts.facts.flood.value, 'Flood Zone 3');
  assert.strictEqual(withoutSchools.propertyFacts.facts.flood.value, 'Flood Zone 3');
  assert.strictEqual(withSchools.propertyFacts.facts.planning.available, false);
  const metrics = calculateInvestmentMetrics({
    purchasePrice: 200000,
    expectedRent: 1000,
    vacancyAssumption: 5,
    operatingCosts: 0,
  });
  assert.ok(Number.isFinite(metrics.grossYield));
  const withFacts = landlordScore({
    propertyFacts: { facts: { schools: withSchools.propertyFacts.facts.schools } },
  });
  const withoutFacts = landlordScore();
  assert.strictEqual(withFacts.score, withoutFacts.score);
  assert.strictEqual(withFacts.dimensions.risk.score, withoutFacts.dimensions.risk.score);
  assert.ok(!Object.prototype.hasOwnProperty.call(withFacts.dimensions, 'schools'));
});

test('Personal Decision, confidence, demand, outcomes and backtesting stay frozen', () => {
  assert.strictEqual(LANDLORD_WEIGHTS.demand, 0.08);
  assert.strictEqual(LANDLORD_WEIGHTS.risk, 0.1);
  assert.ok(!Object.prototype.hasOwnProperty.call(LANDLORD_WEIGHTS, 'schools'));
  assert.strictEqual(BUYER_GENERAL_WEIGHTS.affordability, 0.3);
  assert.ok(!Object.prototype.hasOwnProperty.call(BUYER_GENERAL_WEIGHTS, 'schools'));
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
    formatSourceLabel('MHCLG_PlanningData_EducationalEstablishment'),
    'DfE GIAS via MHCLG Planning Data'
  );
  assert.strictEqual(unattachedSchoolFact().available, false);
  assert.strictEqual(unattachedSchoolFact().catchment.reason, UNAVAILABLE_REASONS.noCatchmentSource);
});

asyncTest('disabled school provider degrades honestly', async () => {
  const cfg = propertyIntelligenceConfig.providers.educationalEstablishment;
  const previous = cfg.enabled;
  cfg.enabled = false;
  try {
    const schools = await getSchoolEvidence(listing(SUBJECT));
    assert.strictEqual(schools.unavailableReason, UNAVAILABLE_REASONS.providerDisabled);
    assert.strictEqual(schools.available, false);
    assert.strictEqual(schools.catchment.reason, UNAVAILABLE_REASONS.noCatchmentSource);
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
    const result = await queryEducationalEstablishments({ coords: SUBJECT }, { skipCache: true });
    assert.strictEqual(result.success, true);
    assert.ok(calls[0].includes('geometry='));
    assert.ok(calls[0].includes('dataset=educational-establishment'));
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
  console.log('\nschoolEvidence.test.js — all passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
