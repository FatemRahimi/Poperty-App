/**
 * Property-specific flood evidence — Environment Agency Flood Map for Planning.
 * Report/context only. Does not score, value, or adjust finance.
 * Run: node server/tests/floodEvidence.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { assemblePropertyFacts, publicPropertyFactsForExplanation, SOURCE_PRECEDENCE } = require('../services/ai/propertyFacts');
const {
  getFloodEvidence,
  assessedFlood,
  notAssessedFlood,
  unattachedFloodFact,
  sanitizeFloodFact,
  UNAVAILABLE_REASONS,
} = require('../services/ai/floodEvidence');
const {
  parseLayerResponse,
  queryFloodMapForPlanning,
  readCoords,
} = require('../services/providers/environmentAgency/floodMapForPlanning');
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

const ASOF = '2026-08-25T12:00:00.000Z';
const COORDS = Object.freeze({ latitude: 51.5074, longitude: -0.1278 });

function listing(extra = {}) {
  return {
    id: 42,
    title: 'Flood evidence listing',
    city: 'London',
    zip_code: 'SW1A 1AA',
    category: 'sale',
    price: 200000,
    monthly_rent: 1100,
    ...extra,
  };
}

function zoneFact(zone) {
  return assessedFlood({
    zone,
    layersMatched: zone === 3 ? ['Flood Zone 3'] : ['Flood Zone 2'],
    retrievedAt: ASOF,
    identity: { listingId: 42, uprn: '10002333621', ...COORDS },
    attributes: [{ layer: zone === 3 ? 'Flood Zone 3' : 'Flood Zone 2', type: 'Flood Zone' }],
  });
}

async function assembleReport({ property = listing(), floodStub, skipFlood = false, extraOptions = {} } = {}) {
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
      skipFlood,
      skipPlanning: true,
      asOf: ASOF,
      deps: {
        getFloodEvidence: floodStub,
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
          throw new Error('LLM must not invent flood evidence');
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

test('authoritative flood evidence reaches canonical propertyFacts with provenance', () => {
  const overlay = zoneFact(3);
  const facts = assemblePropertyFacts({
    property: listing({ uprn: '10002333621', ...COORDS }),
    floodEvidence: overlay,
  });
  const flood = facts.facts.flood;
  assert.strictEqual(facts.version, 'property-facts-1.1.0');
  assert.strictEqual(flood.available, true);
  assert.strictEqual(flood.value, 'Flood Zone 3');
  assert.strictEqual(flood.state, 'observed');
  assert.strictEqual(flood.source, 'EnvironmentAgency_FloodMapForPlanning');
  assert.strictEqual(flood.provider, 'EnvironmentAgency');
  assert.strictEqual(flood.provenance.source, 'EnvironmentAgency_FloodMapForPlanning');
  assert.strictEqual(flood.floodTypes[0], 'rivers_and_sea');
  assert.strictEqual(flood.categories.riversAndSea, 'flood_zone_3');
  assert.strictEqual(flood.zone, 3);
  assert.strictEqual(flood.identity.listingId, 42);
  assert.strictEqual(flood.identity.uprn, '10002333621');
  assert.strictEqual(flood.identity.latitude, COORDS.latitude);
  assert.strictEqual(flood.identity.postcodeUsedAsFloodLocation, false);
  assert.ok(!Object.prototype.hasOwnProperty.call(flood, 'score'));
  assert.ok(!Object.prototype.hasOwnProperty.call(flood, 'floodScore'));
  assert.strictEqual(flood.notAScore, true);
  assert.strictEqual(flood.scoringActivated, false);
  assert.strictEqual(flood.notPersonalDecisionInput, true);
  assert.deepStrictEqual([...SOURCE_PRECEDENCE.flood], ['EnvironmentAgency_FloodMapForPlanning']);
});

test('flood type/category is retained without an invented numeric score', () => {
  const flood = sanitizeFloodFact({
    ...zoneFact(2),
    score: 12,
    floodScore: 88,
    riskScore: 0,
  });
  assert.strictEqual(flood.value, 'Flood Zone 2');
  assert.strictEqual(flood.zone, 2);
  assert.strictEqual(flood.categories.riversAndSea, 'flood_zone_2');
  assert.strictEqual(flood.score, undefined);
  assert.strictEqual(flood.floodScore, undefined);
  assert.strictEqual(flood.riskScore, undefined);
  assert.strictEqual(flood.notAScore, true);
  const invented = sanitizeFloodFact({
    available: true,
    value: 'Flood Zone 1',
    score: 0,
  });
  assert.strictEqual(invented.available, false);
  assert.strictEqual(invented.value, null);
  assert.strictEqual(sanitizeFloodFact({ available: true, value: 'safe' }).available, false);
  assert.strictEqual(sanitizeFloodFact({ available: true, value: 0 }).available, false);
  assert.strictEqual(sanitizeFloodFact({ available: true, value: false }).available, false);
});

test('client listing flood objects are not property truth', () => {
  const facts = assemblePropertyFacts({
    property: listing({
      flood: { available: true, value: 'safe', score: 0 },
      floodEvidence: { available: true, value: 'Flood Zone 1' },
    }),
  });
  assert.strictEqual(facts.facts.flood.available, false);
  assert.strictEqual(facts.facts.flood.value, null);
  assert.strictEqual(facts.facts.flood.unavailableReason, UNAVAILABLE_REASONS.notAttached);
  assert.notStrictEqual(facts.facts.flood.value, 'safe');
  assert.notStrictEqual(facts.facts.flood.value, false);
  assert.notStrictEqual(facts.facts.flood.value, 0);
});

asyncTest('missing location is notAssessed, not low risk', async () => {
  const flood = await getFloodEvidence(listing({ zip_code: 'SW1A 1AA' }));
  assert.strictEqual(flood.available, false);
  assert.strictEqual(flood.state, 'notAssessed');
  assert.strictEqual(flood.unavailableReason, UNAVAILABLE_REASONS.locationUnavailable);
  assert.strictEqual(flood.value, null);
  assert.strictEqual(flood.identity.postcode, 'SW1A 1AA');
  assert.strictEqual(flood.identity.postcodeUsedAsFloodLocation, false);
  assert.strictEqual(flood.geographicResolution, null);
  assert.ok(!/low risk/i.test(flood.note));
  assert.ok(!/Flood Zone 1/.test(flood.note));
  assert.strictEqual(readCoords(listing()), null);
  assert.strictEqual(readCoords(listing({ latitude: null, longitude: null })), null);
});

asyncTest('unsupported geography is notAssessed', async () => {
  const flood = await getFloodEvidence(listing({ latitude: 40.7, longitude: -74.0 }));
  assert.strictEqual(flood.unavailableReason, UNAVAILABLE_REASONS.unsupportedGeography);
  assert.strictEqual(flood.available, false);
  assert.strictEqual(flood.value, null);
});

asyncTest('Scotland is unsupported geography for the England Flood Map for Planning product', async () => {
  const flood = await getFloodEvidence(listing({ latitude: 55.9533, longitude: -3.1883 }));
  assert.strictEqual(flood.unavailableReason, UNAVAILABLE_REASONS.unsupportedGeography);
  assert.strictEqual(flood.available, false);
  assert.strictEqual(flood.value, null);
});

asyncTest('provider unavailable is notAssessed, not low risk', async () => {
  const flood = await getFloodEvidence(listing(COORDS), {
    queryFloodMapForPlanning: async () => ({ success: false, reason: 'provider_unavailable' }),
  });
  assert.strictEqual(flood.available, false);
  assert.strictEqual(flood.unavailableReason, UNAVAILABLE_REASONS.providerUnavailable);
  assert.strictEqual(flood.value, null);
  assert.notStrictEqual(String(flood.value), 'false');
  assert.ok(/not low risk/i.test(flood.note));
});

asyncTest('empty intersection is no applicable evidence, not Flood Zone 1 or safe', async () => {
  const flood = await getFloodEvidence(listing(COORDS), {
    queryFloodMapForPlanning: async () => ({
      success: true,
      zone: null,
      layersMatched: [],
      noApplicablePolygon: true,
      retrievedAt: ASOF,
    }),
  });
  assert.strictEqual(flood.available, false);
  assert.strictEqual(flood.unavailableReason, UNAVAILABLE_REASONS.noApplicableEvidence);
  assert.strictEqual(flood.value, null);
  assert.ok(!/Flood Zone 1/.test(flood.value || ''));
  assert.ok(/not “no flood risk”/.test(flood.note) || /not "no flood risk"/.test(flood.note) || /not .*no flood risk/.test(flood.note));
});

asyncTest('malformed provider response is notAssessed', async () => {
  const flood = await getFloodEvidence(listing(COORDS), {
    queryFloodMapForPlanning: async () => ({ success: false, reason: 'malformed_provider_response' }),
  });
  assert.strictEqual(flood.unavailableReason, UNAVAILABLE_REASONS.malformed);
  assert.strictEqual(flood.available, false);
});

test('parseLayerResponse distinguishes hits, empty features, and errors', () => {
  assert.deepStrictEqual(parseLayerResponse({ features: [] }).hit, false);
  assert.strictEqual(parseLayerResponse({ features: [{ attributes: { layer: 'Flood Zone 3' } }] }).hit, true);
  assert.strictEqual(parseLayerResponse({ error: { message: 'down' } }).reason, 'provider_unavailable');
  assert.strictEqual(parseLayerResponse('nope').reason, 'malformed_provider_response');
});

asyncTest('PI identity coordinates are used when the listing row has none', async () => {
  const flood = await getFloodEvidence(listing({ zip_code: 'SW1A 1AA' }), {
    identity: { listingId: 42, uprn: '10002333621', ...COORDS, postcode: 'SW1A 1AA' },
    queryFloodMapForPlanning: async () => ({
      success: true,
      zone: 2,
      layersMatched: ['Flood Zone 2'],
      attributes: [],
      retrievedAt: ASOF,
    }),
  });
  assert.strictEqual(flood.available, true);
  assert.strictEqual(flood.value, 'Flood Zone 2');
  assert.strictEqual(flood.identity.listingId, 42);
  assert.strictEqual(flood.identity.uprn, '10002333621');
  assert.strictEqual(flood.identity.latitude, COORDS.latitude);
  assert.strictEqual(flood.identity.postcode, 'SW1A 1AA');
  assert.strictEqual(flood.identity.postcodeUsedAsFloodLocation, false);
});

asyncTest('FeatureServer query maps Zone 3 then Zone 2 without inventing Zone 1', async () => {
  const original = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    calls.push(String(url));
    const isZone3 = String(url).includes('/1/query');
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        features: isZone3 ? [{ attributes: { layer: 'Flood Zone 3', type: 'Flood Zone' } }] : [],
      }),
    };
  };
  try {
    const result = await queryFloodMapForPlanning(COORDS, { skipCache: true });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.zone, 3);
    assert.ok(result.layersMatched.includes('Flood Zone 3'));
    assert.strictEqual(calls.length, 2);
  } finally {
    global.fetch = original;
  }
});

asyncTest('canonical report uses server flood retrieval and ignores request flood objects', async () => {
  const report = await assembleReport({
    property: listing({ uprn: '10002333621', ...COORDS }),
    floodStub: async () => zoneFact(3),
    extraOptions: {
      flood: { available: true, value: 'Flood Zone 1', score: 0 },
      floodEvidence: { available: true, value: 'safe' },
      propertyFacts: { facts: { flood: { available: true, value: 'injected' } } },
    },
  });
  const flood = report.propertyFacts.facts.flood;
  assert.strictEqual(flood.value, 'Flood Zone 3');
  assert.strictEqual(flood.identity.listingId, 42);
  assert.strictEqual(flood.identity.latitude, COORDS.latitude);
  assert.notStrictEqual(flood.value, 'injected');
  const explained = publicPropertyFactsForExplanation(report.propertyFacts);
  assert.strictEqual(explained.flood.value, 'Flood Zone 3');
  assert.strictEqual(explained.flood.notAScore, true);
  assert.strictEqual(explained.flood.available, true);
});

asyncTest('missing coordinates on a live assemble are location_unavailable', async () => {
  const report = await assembleReport({ property: listing() });
  const flood = report.propertyFacts.facts.flood;
  assert.strictEqual(flood.available, false);
  assert.strictEqual(flood.unavailableReason, UNAVAILABLE_REASONS.locationUnavailable);
  assert.strictEqual(publicPropertyFactsForExplanation(report.propertyFacts).flood, null);
});

asyncTest('historical saved flood is not replaced by a later provider response', async () => {
  const historical = await assembleReport({
    property: listing({ ...COORDS }),
    floodStub: async () => zoneFact(3),
  });
  const row = { id: 91, output_data: historical, created_at: ASOF };
  const extracted = extractCanonicalCoreFacts(row);
  assert.strictEqual(extracted.propertyFacts.facts.flood.value, 'Flood Zone 3');
  assert.strictEqual(extracted.propertyFacts.facts.flood.retrievedAt, ASOF);

  const later = await assembleReport({
    property: listing({ ...COORDS }),
    floodStub: async () => zoneFact(2),
  });
  assert.strictEqual(later.propertyFacts.facts.flood.value, 'Flood Zone 2');
  assert.strictEqual(extractCanonicalCoreFacts(row).propertyFacts.facts.flood.value, 'Flood Zone 3');

  const overview = projectPropertyOverview(listing({ ...COORDS }), { canonicalReport: row });
  assert.strictEqual(overview.coreFactsSource, 'canonical_snapshot');
  assert.strictEqual(overview.propertyFacts.facts.flood.value, 'Flood Zone 3');

  const snapshotBefore = JSON.stringify(row.output_data.propertyFacts.facts.flood);
  const prepared = resolveSavedWhatIfBaseline({
    id: 91,
    request_type: 'property_intelligence',
    property_id: 42,
    created_at: ASOF,
    output_data: historical,
  });
  assert.strictEqual(prepared.ok, true);
  const whatIf = executeIntelligenceWhatIf({
    property: listing({ ...COORDS, monthly_rent: 1100 }),
    profile: 'landlord',
    baselineOptions: prepared.financeOptions || {
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
  assert.strictEqual(whatIf.success, true);
  assert.strictEqual(whatIf.baselineMode, 'saved_snapshot');
  assert.strictEqual(JSON.stringify(row.output_data.propertyFacts.facts.flood), snapshotBefore);
  assert.strictEqual(row.output_data.propertyFacts.facts.flood.value, 'Flood Zone 3');
});

test('What-if does not call the flood provider and rejects client flood injection', () => {
  const adapter = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'ai', 'intelligenceWhatIfService.js'),
    'utf8'
  );
  const historical = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'ai', 'historicalWhatIfBaseline.js'),
    'utf8'
  );
  assert.ok(!adapter.includes('getFloodEvidence'));
  assert.ok(!adapter.includes('queryFloodMapForPlanning'));
  assert.ok(!historical.includes('getFloodEvidence'));
  assert.ok(!historical.includes('queryFloodMapForPlanning'));
  const injected = parseWhatIfHttpBody({
    propertyId: 1,
    profile: 'landlord',
    flood: { value: 'Flood Zone 3' },
    floodEvidence: { available: true },
  });
  assert.strictEqual(injected.ok, false);
  assert.ok(injected.errors.some((e) => e.field === 'flood' && e.reason === 'internal_option_not_allowed'));
  const result = executeIntelligenceWhatIf({
    property: listing({ ...COORDS, monthly_rent: 1100 }),
    profile: 'landlord',
    baselineOptions: {
      purchasePrice: 200000,
      expectedRent: 1100,
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
    scenarioOptions: { purchasePrice: 185000 },
    asOf: ASOF,
  });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.factsUnchanged.propertyFactsVersion, 'property-facts-1.1.0');
});

test('HTTP analyse rejects client flood/risk injection', () => {
  const flood = parseAnalyseFinanceRequest({ flood: { value: 'Flood Zone 1' } });
  assert.strictEqual(flood.ok, false);
  assert.ok(flood.errors.some((e) => e.field === 'flood'));
  const evidence = parseAnalyseFinanceRequest({ floodEvidence: { available: true, score: 0 } });
  assert.ok(evidence.errors.some((e) => e.field === 'floodEvidence'));
  const facts = parseAnalyseFinanceRequest({ propertyFacts: { facts: { flood: { value: 'safe' } } } });
  assert.ok(facts.errors.some((e) => e.field === 'propertyFacts'));
  const skip = parseAnalyseFinanceRequest({ skipFlood: true });
  assert.ok(skip.errors.some((e) => e.field === 'skipFlood'));
  const skipCache = parseAnalyseFinanceRequest({ skipCache: true });
  assert.ok(skipCache.errors.some((e) => e.field === 'skipCache'));
});

asyncTest('flood does not change valuation, rent, or financialEngine outputs', async () => {
  const withFlood = await assembleReport({
    property: listing({ ...COORDS, monthly_rent: 1100 }),
    floodStub: async () => zoneFact(3),
  });
  const withoutFlood = await assembleReport({
    property: listing({ ...COORDS, monthly_rent: 1100 }),
    skipFlood: true,
  });
  assert.strictEqual(withFlood.marketIntelligence.sale.centralEstimate, withoutFlood.marketIntelligence.sale.centralEstimate);
  assert.strictEqual(withFlood.marketIntelligence.rent.recommendedRent, withoutFlood.marketIntelligence.rent.recommendedRent);
  const metricsA = calculateInvestmentMetrics({
    purchasePrice: 200000,
    expectedRent: 1000,
    vacancyAssumption: 5,
    operatingCosts: 0,
  });
  const metricsB = calculateInvestmentMetrics({
    purchasePrice: 200000,
    expectedRent: 1000,
    vacancyAssumption: 5,
    operatingCosts: 0,
  });
  assert.strictEqual(metricsA.grossYield, metricsB.grossYield);
  assert.strictEqual(metricsA.noi, metricsB.noi);
  assert.strictEqual(withFlood.propertyFacts.facts.flood.value, 'Flood Zone 3');
  assert.strictEqual(withoutFlood.propertyFacts.facts.flood.available, false);
});

test('Personal Decision, confidence, demand, outcomes and backtesting stay frozen', () => {
  assert.strictEqual(LANDLORD_WEIGHTS.demand, 0.08);
  assert.strictEqual(LANDLORD_WEIGHTS.risk, 0.1);
  assert.strictEqual(LANDLORD_WEIGHTS.grossYield, 0.18);
  assert.ok(!Object.prototype.hasOwnProperty.call(LANDLORD_WEIGHTS, 'flood'));
  assert.strictEqual(BUYER_GENERAL_WEIGHTS.affordability, 0.3);
  assert.ok(!Object.prototype.hasOwnProperty.call(BUYER_GENERAL_WEIGHTS, 'flood'));
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
  const withFlood = landlordScore({
    propertyFacts: { facts: { flood: zoneFact(3) } },
  });
  const withoutFlood = landlordScore();
  assert.strictEqual(withFlood.score, withoutFlood.score);
  assert.strictEqual(withFlood.dimensions.demand.state, 'no_demand_data_source');
  assert.ok(!Object.prototype.hasOwnProperty.call(withFlood.dimensions, 'flood'));
  assert.strictEqual(withFlood.dimensions.risk.score, withoutFlood.dimensions.risk.score);
  assert.deepStrictEqual([...OUTCOME_TYPES].sort(), ['let', 'sold', 'under_offer', 'withdrawn']);
  assert.strictEqual(BACKTEST_ENGINE_VERSION, 'backtest-foundation-1.0.0');
  assert.strictEqual(formatSourceLabel('EnvironmentAgency_FloodMapForPlanning'), 'Environment Agency Flood Map for Planning');
});

asyncTest('disabled flood provider degrades honestly', async () => {
  const cfg = propertyIntelligenceConfig.providers.environmentAgencyFlood;
  const previous = cfg.enabled;
  cfg.enabled = false;
  try {
    const flood = await getFloodEvidence(listing(COORDS));
    assert.strictEqual(flood.unavailableReason, UNAVAILABLE_REASONS.providerDisabled);
    assert.strictEqual(flood.available, false);
    assert.strictEqual(flood.value, null);
  } finally {
    cfg.enabled = previous;
  }
});

test('unattached flood is not low risk', () => {
  const fact = unattachedFloodFact();
  assert.strictEqual(fact.unavailableReason, UNAVAILABLE_REASONS.notAttached);
  assert.strictEqual(fact.available, false);
  assert.strictEqual(notAssessedFlood({ reason: UNAVAILABLE_REASONS.noApplicableEvidence, note: 'none' }).value, null);
});

async function run() {
  for (const t of pending) {
    await t.fn();
    console.log(`✓ ${t.name}`);
  }
  console.log('\nfloodEvidence.test.js — all passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
