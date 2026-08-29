/**
 * Article 4 direction-area evidence — MHCLG Planning Data polygon membership.
 * Geographic membership only. Restrictions stay notAssessed.
 * Unknown is notAssessed, not “not in an Article 4 area”.
 * Run: node server/tests/article4Evidence.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { assemblePropertyFacts, publicPropertyFactsForExplanation, SOURCE_PRECEDENCE } = require('../services/ai/propertyFacts');
const {
  getArticle4Evidence,
  sanitizeArticle4Fact,
  unattachedArticle4Fact,
  UNAVAILABLE_REASONS,
  RESTRICTION_REASON,
} = require('../services/ai/article4Evidence');
const {
  parseArticle4AreaEntities,
  mapArticle4Area,
  classifyArticle4Area,
  pointInPolygonWkt,
  queryArticle4DirectionAreas,
} = require('../services/providers/planningData/article4DirectionAreaClient');
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

const ASOF = '2026-08-26T20:00:00.000Z';
const SUBJECT = Object.freeze({ latitude: 51.5074, longitude: -0.1278 });
const OUTSIDE = Object.freeze({ latitude: 51.5015, longitude: -0.1375 });
const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'article-4-areas-westminster-min.json'), 'utf8')
);

function listing(extra = {}) {
  return {
    id: 42,
    title: 'Article 4 evidence listing',
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

async function assembleReport({ property = listing(), article4Stub, floodStub, skipArticle4 = false, extraOptions = {} } = {}) {
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
      skipConservationArea: true,
      skipArticle4,
      asOf: ASOF,
      deps: {
        getArticle4Evidence: article4Stub,
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
          throw new Error('LLM must not invent Article 4 restrictions');
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

test('authoritative Article 4 response parses native name, reference, dates and organisation', () => {
  const parsed = parseArticle4AreaEntities(FIXTURE);
  assert.strictEqual(parsed.ok, true);
  const first = mapArticle4Area(parsed.entities[0]);
  assert.strictEqual(first.name, 'Article 4 Basement Development Permitted Rights Removed');
  assert.strictEqual(first.reference, 'A4/BASEMENT');
  assert.strictEqual(first.entityId, 61000001);
  assert.strictEqual(first.organisationEntity, 387);
  assert.strictEqual(first.directionReference, '23/00006/REG_4');
  assert.strictEqual(first.startDate, '2016-07-31');
  assert.strictEqual(first.endDate, null);
  assert.strictEqual(first.entryDate, '2016-08-01');
  assert.strictEqual(first.nativeQuality, 'authoritative');
});

test('point-in-polygon membership is true only inside the polygon', () => {
  const wkt = FIXTURE.entities[0].geometry;
  assert.strictEqual(pointInPolygonWkt(SUBJECT, wkt), true);
  assert.strictEqual(pointInPolygonWkt(OUTSIDE, wkt), false);
  const inside = classifyArticle4Area(mapArticle4Area(FIXTURE.entities[0]), SUBJECT, ASOF);
  const nearby = classifyArticle4Area(mapArticle4Area(FIXTURE.entities[2]), SUBJECT, ASOF);
  assert.strictEqual(inside.scope, 'area_membership');
  assert.strictEqual(inside.matchMethod, 'coordinate_point_in_polygon');
  assert.strictEqual(inside.geographicMembershipOnly, true);
  assert.strictEqual(inside.restrictionsAssessed, false);
  assert.strictEqual(nearby, null);
});

test('ended Article 4 areas are not current membership', () => {
  const former = mapArticle4Area(FIXTURE.entities[3]);
  assert.strictEqual(former.endDate, '2010-01-01');
  assert.strictEqual(classifyArticle4Area(former, SUBJECT, ASOF), null);
});

test('missing geometry is not membership even if the provider returned the row', () => {
  const noGeom = mapArticle4Area(FIXTURE.entities[4]);
  assert.strictEqual(noGeom.geometryWkt, null);
  assert.strictEqual(classifyArticle4Area(noGeom, SUBJECT, ASOF), null);
});

asyncTest('canonical Article 4 evidence reaches propertyFacts with provenance, no score, and restrictions not assessed', async () => {
  const report = await assembleReport({
    property: listing({ ...SUBJECT }),
    article4Stub: async () => getArticle4Evidence(listing({ ...SUBJECT }), {
      asOf: ASOF,
      queryArticle4DirectionAreas: async () => successfulQuery(),
    }),
  });
  const fact = report.propertyFacts.facts.article4;
  assert.strictEqual(report.propertyFacts.version, 'property-facts-1.1.0');
  assert.strictEqual(fact.available, true);
  assert.strictEqual(fact.trust, 'observed');
  assert.strictEqual(fact.source, 'MHCLG_PlanningData_Article4DirectionArea');
  assert.strictEqual(fact.provenance.source, 'MHCLG_PlanningData_Article4DirectionArea');
  assert.ok(String(fact.value).includes('Article 4 Basement Development Permitted Rights Removed'));
  assert.ok(fact.areas.some((row) => row.reference === 'A4/BASEMENT'));
  assert.ok(fact.areas.some((row) => row.reference === 'A4/CAZ-E-C3'));
  assert.strictEqual(fact.areas[0].entityId != null, true);
  assert.strictEqual(fact.areas.find((row) => row.reference === 'A4/BASEMENT').organisationEntity, 387);
  assert.strictEqual(fact.areas.find((row) => row.reference === 'A4/BASEMENT').startDate, '2016-07-31');
  assert.strictEqual(fact.areas.find((row) => row.reference === 'A4/BASEMENT').entryDate, '2016-08-01');
  assert.strictEqual(fact.scope, 'coordinate_point_in_polygon');
  assert.strictEqual(fact.geographicMembershipOnly, true);
  assert.strictEqual(fact.restrictionsAssessed, false);
  assert.strictEqual(fact.legalEffectivenessAssessed, false);
  assert.strictEqual(fact.notLegalAdvice, true);
  assert.ok(!fact.areas.some((row) => row.reference === 'A4/NEARBY'));
  assert.ok(!fact.areas.some((row) => row.reference === 'A4/ENDED'));
  assert.ok(!fact.areas.some((row) => row.reference === 'A4/NOGEOM'));
  assert.ok(!Object.prototype.hasOwnProperty.call(fact, 'score'));
  assert.ok(!Object.prototype.hasOwnProperty.call(fact, 'article4Score'));
  assert.strictEqual(fact.notAScore, true);
  assert.strictEqual(fact.scoringActivated, false);
  assert.strictEqual(fact.notPersonalDecisionInput, true);
  assert.strictEqual(fact.restrictions.available, false);
  assert.strictEqual(fact.restrictions.state, 'notAssessed');
  assert.strictEqual(fact.restrictions.reason, RESTRICTION_REASON);
  fact.areas.forEach((row) => {
    assert.strictEqual(row.permittedDevelopmentRights, undefined);
    assert.strictEqual(row.restrictionsAssessed, false);
    assert.strictEqual(row.legalEffectivenessAssessed, false);
  });
  assert.ok(!JSON.stringify(fact.restrictions).includes('1A'));
  assert.ok(!JSON.stringify(fact.restrictions).includes('3MA'));
  assert.deepStrictEqual([...SOURCE_PRECEDENCE.article4], ['MHCLG_PlanningData_Article4DirectionArea']);
  const explained = publicPropertyFactsForExplanation(report.propertyFacts);
  assert.strictEqual(explained.article4.geographicMembershipOnly, true);
  assert.strictEqual(explained.article4.restrictionsAssessed, false);
  assert.strictEqual(explained.article4.restrictions.state, 'notAssessed');
  assert.strictEqual(explained.article4.notLegalAdvice, true);
});

test('sanitize strips invented scores and PD-right codes and keeps native area name', () => {
  const facts = assemblePropertyFacts({
    property: listing({ article4: { score: 99, value: 'high Article 4 risk' } }),
    article4Evidence: sanitizeArticle4Fact({
      available: true,
      value: 'Article 4 Basement Development Permitted Rights Removed',
      article4Score: 88,
      permittedDevelopmentRights: ['1A', '3MA'],
      article4Restrictions: { available: true, value: 'Class A withdrawn' },
      areas: [{
        name: 'Article 4 Basement Development Permitted Rights Removed',
        reference: 'A4/BASEMENT',
        entityId: 61000001,
        permittedDevelopmentRights: '1A',
      }],
    }),
  });
  const fact = facts.facts.article4;
  assert.strictEqual(fact.areas[0].name, 'Article 4 Basement Development Permitted Rights Removed');
  assert.strictEqual(fact.score, undefined);
  assert.strictEqual(fact.article4Score, undefined);
  assert.strictEqual(fact.permittedDevelopmentRights, undefined);
  assert.strictEqual(fact.restrictions.available, false);
  assert.strictEqual(fact.restrictions.reason, RESTRICTION_REASON);
  assert.strictEqual(fact.areas[0].permittedDevelopmentRights, undefined);
});

test('client listing Article 4 objects are not property truth', () => {
  const facts = assemblePropertyFacts({
    property: listing({
      article4: { available: true, value: 'injected', score: 0 },
      article4Evidence: { available: true, value: 'injected' },
      article4Score: 9,
      permittedDevelopmentRights: ['1A'],
    }),
  });
  assert.strictEqual(facts.facts.article4.available, false);
  assert.strictEqual(facts.facts.article4.unavailableReason, UNAVAILABLE_REASONS.notAttached);
  assert.strictEqual(facts.facts.article4.restrictions.available, false);
});

asyncTest('missing location is notAssessed and postcode is not used as a query', async () => {
  const fact = await getArticle4Evidence(listing({ zip_code: 'SW1A 2WH' }));
  assert.strictEqual(fact.available, false);
  assert.strictEqual(fact.unavailableReason, UNAVAILABLE_REASONS.locationUnavailable);
  assert.strictEqual(fact.identity.postcodeUsedAsArticle4Location, false);
  assert.ok(!/not in an Article 4/i.test(fact.value || ''));
});

asyncTest('null coordinates are not treated as 0,0', async () => {
  const fact = await getArticle4Evidence(listing({ latitude: null, longitude: null, zip_code: 'SW1A 2WH' }));
  assert.strictEqual(fact.unavailableReason, UNAVAILABLE_REASONS.locationUnavailable);
  assert.strictEqual(fact.identity.latitude, null);
});

asyncTest('unsupported geography is notAssessed', async () => {
  const fact = await getArticle4Evidence(listing({ latitude: 40.7, longitude: -74.0 }));
  assert.strictEqual(fact.unavailableReason, UNAVAILABLE_REASONS.unsupportedGeography);
  assert.strictEqual(fact.available, false);
});

asyncTest('provider unavailable is notAssessed, not “not in an Article 4 area”', async () => {
  const fact = await getArticle4Evidence(listing(SUBJECT), {
    queryArticle4DirectionAreas: async () => ({ success: false, reason: 'provider_unavailable' }),
  });
  assert.strictEqual(fact.unavailableReason, UNAVAILABLE_REASONS.providerUnavailable);
  assert.strictEqual(fact.available, false);
  assert.ok(/not “not in an Article 4 area”/.test(fact.note) || /not "not in an Article 4 area"/.test(fact.note));
});

asyncTest('empty source result is notAssessed, not an observed negative', async () => {
  const fact = await getArticle4Evidence(listing(SUBJECT), {
    asOf: ASOF,
    queryArticle4DirectionAreas: async () => successfulQuery([]),
  });
  assert.strictEqual(fact.available, false);
  assert.strictEqual(fact.unavailableReason, UNAVAILABLE_REASONS.noApplicableEvidence);
  assert.strictEqual(fact.value, null);
  assert.ok(/not evidence that the property is outside an Article 4 area/.test(fact.note));
  assert.strictEqual(fact.restrictions.available, false);
});

asyncTest('nearby polygon that does not contain the point is not membership', async () => {
  const fact = await getArticle4Evidence(listing(SUBJECT), {
    asOf: ASOF,
    queryArticle4DirectionAreas: async () => successfulQuery([FIXTURE.entities[2]]),
  });
  assert.strictEqual(fact.available, false);
  assert.strictEqual(fact.unavailableReason, UNAVAILABLE_REASONS.noApplicableEvidence);
});

asyncTest('malformed provider response is notAssessed', async () => {
  const fact = await getArticle4Evidence(listing(SUBJECT), {
    queryArticle4DirectionAreas: async () => ({ success: false, reason: 'malformed_provider_response' }),
  });
  assert.strictEqual(fact.unavailableReason, UNAVAILABLE_REASONS.malformed);
});

test('parseArticle4AreaEntities distinguishes hits, empty, and errors', () => {
  assert.strictEqual(parseArticle4AreaEntities({ entities: [] }).ok, true);
  assert.strictEqual(parseArticle4AreaEntities({ error: { message: 'down' } }).reason, 'provider_unavailable');
  assert.strictEqual(parseArticle4AreaEntities('nope').reason, 'malformed_provider_response');
});

asyncTest('missing end-date does not invent current legal effectiveness', async () => {
  const fact = await getArticle4Evidence(listing(SUBJECT), {
    asOf: ASOF,
    queryArticle4DirectionAreas: async () => successfulQuery([FIXTURE.entities[0]]),
  });
  assert.strictEqual(fact.available, true);
  assert.strictEqual(fact.areas[0].endDate, null);
  assert.strictEqual(fact.legalEffectivenessAssessed, false);
  assert.strictEqual(fact.missingEndDateDoesNotProveCurrentLegalEffect, true);
  assert.ok(/missing end-date is not proof/i.test(fact.note));
});

asyncTest('future end-date remains geographic membership without inventing legal status', async () => {
  const future = { ...FIXTURE.entities[0], 'end-date': '2099-01-01', reference: 'A4/FUTURE' };
  const fact = await getArticle4Evidence(listing(SUBJECT), {
    asOf: ASOF,
    queryArticle4DirectionAreas: async () => successfulQuery([future]),
  });
  assert.strictEqual(fact.available, true);
  assert.strictEqual(fact.areas[0].endDate, '2099-01-01');
  assert.strictEqual(fact.legalEffectivenessAssessed, false);
  assert.strictEqual(fact.restrictionsAssessed, false);
});

asyncTest('canonical report ignores request Article 4 objects', async () => {
  const report = await assembleReport({
    property: listing({ ...SUBJECT }),
    article4Stub: async () => getArticle4Evidence(listing({ ...SUBJECT }), {
      asOf: ASOF,
      queryArticle4DirectionAreas: async () => successfulQuery([FIXTURE.entities[0]]),
    }),
    extraOptions: {
      article4: { available: true, value: 'invented', score: 0 },
      article4Evidence: { available: true, value: 'injected' },
      article4Score: 9,
      permittedDevelopmentRights: ['1A'],
    },
  });
  assert.strictEqual(report.propertyFacts.facts.article4.areas[0].reference, 'A4/BASEMENT');
  assert.notStrictEqual(report.propertyFacts.facts.article4.value, 'injected');
  assert.strictEqual(report.propertyFacts.facts.article4.restrictions.available, false);
});

asyncTest('historical saved Article 4 evidence is not replaced by a later provider response', async () => {
  const historical = await assembleReport({
    property: listing({ ...SUBJECT }),
    article4Stub: async () => getArticle4Evidence(listing({ ...SUBJECT }), {
      asOf: ASOF,
      queryArticle4DirectionAreas: async () => successfulQuery([FIXTURE.entities[0]]),
    }),
  });
  const row = { id: 95, output_data: historical, created_at: ASOF };
  assert.strictEqual(extractCanonicalCoreFacts(row).propertyFacts.facts.article4.areas[0].reference, 'A4/BASEMENT');
  const later = await assembleReport({
    property: listing({ ...SUBJECT }),
    article4Stub: async () => getArticle4Evidence(listing({ ...SUBJECT }), {
      asOf: ASOF,
      queryArticle4DirectionAreas: async () => successfulQuery([]),
    }),
  });
  assert.strictEqual(later.propertyFacts.facts.article4.available, false);
  assert.strictEqual(extractCanonicalCoreFacts(row).propertyFacts.facts.article4.areas[0].name, 'Article 4 Basement Development Permitted Rights Removed');
  const overview = projectPropertyOverview(listing({ ...SUBJECT }), { canonicalReport: row });
  assert.ok(String(overview.propertyFacts.facts.article4.value).includes('Basement'));
  const snapshotBefore = JSON.stringify(row.output_data.propertyFacts.facts.article4);
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
  assert.strictEqual(JSON.stringify(row.output_data.propertyFacts.facts.article4), snapshotBefore);
});

test('What-if does not call the Article 4 provider and rejects client injection', () => {
  const adapter = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'ai', 'intelligenceWhatIfService.js'),
    'utf8'
  );
  const historical = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'ai', 'historicalWhatIfBaseline.js'),
    'utf8'
  );
  assert.ok(!adapter.includes('getArticle4Evidence'));
  assert.ok(!adapter.includes('queryArticle4DirectionAreas'));
  assert.ok(!historical.includes('getArticle4Evidence'));
  const injected = parseWhatIfHttpBody({
    propertyId: 1,
    profile: 'landlord',
    article4: { value: 'invented' },
    article4Score: 4,
    permittedDevelopmentRights: ['1A'],
  });
  assert.strictEqual(injected.ok, false);
  assert.ok(injected.errors.some((e) => e.field === 'article4' && e.reason === 'internal_option_not_allowed'));
});

test('HTTP analyse rejects client Article 4 injection', () => {
  assert.ok(parseAnalyseFinanceRequest({ article4: { value: 'invented' } }).errors.some((e) => e.field === 'article4'));
  assert.ok(parseAnalyseFinanceRequest({ article4Evidence: { available: true } }).errors.some((e) => e.field === 'article4Evidence'));
  assert.ok(parseAnalyseFinanceRequest({ article4Direction: '23/00006/REG_4' }).errors.some((e) => e.field === 'article4Direction'));
  assert.ok(parseAnalyseFinanceRequest({ article4Score: 4 }).errors.some((e) => e.field === 'article4Score'));
  assert.ok(parseAnalyseFinanceRequest({ article4Restrictions: { available: true } }).errors.some((e) => e.field === 'article4Restrictions'));
  assert.ok(parseAnalyseFinanceRequest({ permittedDevelopmentRights: ['1A'] }).errors.some((e) => e.field === 'permittedDevelopmentRights'));
  assert.ok(parseAnalyseFinanceRequest({ skipArticle4: true }).errors.some((e) => e.field === 'skipArticle4'));
  assert.ok(parseAnalyseFinanceRequest({ skipCache: true }).errors.some((e) => e.field === 'skipCache'));
});

test('LLM boundary forbids inferring Article 4 restrictions', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'ai', 'propertyExplanationService.js'),
    'utf8'
  );
  assert.ok(/Do not invent Article 4 membership/.test(src));
  assert.ok(/Do not infer restrictions from the words “Article 4”/.test(src) || /Do not infer restrictions from the words "Article 4"/.test(src));
  assert.ok(/not “not in an Article 4 area”/.test(src) || /not "not in an Article 4 area"/.test(src));
});

asyncTest('Article 4 does not change valuation, rent, finance, flood, planning, schools, listed building, conservation area, or Personal Decision', async () => {
  const withArea = await assembleReport({
    property: listing({ ...SUBJECT, monthly_rent: 1100 }),
    article4Stub: async () => getArticle4Evidence(listing({ ...SUBJECT }), {
      asOf: ASOF,
      queryArticle4DirectionAreas: async () => successfulQuery(),
    }),
  });
  const withoutArea = await assembleReport({
    property: listing({ ...SUBJECT, monthly_rent: 1100 }),
    skipArticle4: true,
  });
  assert.strictEqual(withArea.marketIntelligence.sale.centralEstimate, withoutArea.marketIntelligence.sale.centralEstimate);
  assert.strictEqual(withArea.marketIntelligence.rent.recommendedRent, withoutArea.marketIntelligence.rent.recommendedRent);
  assert.strictEqual(withArea.propertyFacts.facts.flood.value, 'Flood Zone 3');
  assert.strictEqual(withoutArea.propertyFacts.facts.flood.value, 'Flood Zone 3');
  assert.strictEqual(withArea.propertyFacts.facts.planning.available, false);
  assert.strictEqual(withArea.propertyFacts.facts.schools.available, false);
  assert.strictEqual(withArea.propertyFacts.facts.listedBuilding.available, false);
  assert.strictEqual(withArea.propertyFacts.facts.conservationArea.available, false);
  assert.notStrictEqual(withArea.propertyFacts.facts.conservationArea.field, withArea.propertyFacts.facts.article4.field);
  const metrics = calculateInvestmentMetrics({
    purchasePrice: 200000,
    expectedRent: 1000,
    vacancyAssumption: 5,
    operatingCosts: 0,
  });
  assert.ok(Number.isFinite(metrics.grossYield));
  const withFacts = landlordScore({
    propertyFacts: { facts: { article4: withArea.propertyFacts.facts.article4 } },
  });
  const withoutFacts = landlordScore();
  assert.strictEqual(withFacts.score, withoutFacts.score);
  assert.strictEqual(withFacts.dimensions.risk.score, withoutFacts.dimensions.risk.score);
  assert.ok(!Object.prototype.hasOwnProperty.call(withFacts.dimensions, 'article4'));
  assert.ok(!Object.prototype.hasOwnProperty.call(withFacts.dimensions, 'article4Restrictions'));
});

test('Personal Decision, confidence, demand, outcomes and backtesting stay frozen', () => {
  assert.strictEqual(LANDLORD_WEIGHTS.demand, 0.08);
  assert.strictEqual(LANDLORD_WEIGHTS.risk, 0.1);
  assert.ok(!Object.prototype.hasOwnProperty.call(LANDLORD_WEIGHTS, 'article4'));
  assert.strictEqual(BUYER_GENERAL_WEIGHTS.affordability, 0.3);
  assert.ok(!Object.prototype.hasOwnProperty.call(BUYER_GENERAL_WEIGHTS, 'article4'));
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
    formatSourceLabel('MHCLG_PlanningData_Article4DirectionArea'),
    'Article 4 direction areas via MHCLG Planning Data'
  );
  assert.strictEqual(unattachedArticle4Fact().available, false);
  assert.strictEqual(unattachedArticle4Fact().restrictions.available, false);
});

asyncTest('disabled Article 4 provider degrades honestly', async () => {
  const cfg = propertyIntelligenceConfig.providers.article4;
  const previous = cfg.enabled;
  cfg.enabled = false;
  try {
    const fact = await getArticle4Evidence(listing(SUBJECT));
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
    const result = await queryArticle4DirectionAreas({ coords: SUBJECT }, { skipCache: true });
    assert.strictEqual(result.success, true);
    assert.ok(calls[0].includes('latitude='));
    assert.ok(calls[0].includes('longitude='));
    assert.ok(calls[0].includes('dataset=article-4-direction-area'));
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
  console.log('\narticle4Evidence.test.js — all passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
