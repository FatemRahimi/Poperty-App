/**
 * PropertyData /demand live-payload utilisation proofs.
 * Run: node server/tests/propertyDataDemand.test.js
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const {
  parseDemandResponse,
  buildMarketDemandEvidence,
  demandEvidenceFromEnrichment,
  parseRentsResponse,
  buildRentalEvidence,
  parseValuationSaleResponse,
} = require('../services/providers/propertyData/propertyDataParsers');
const { buildDemandQueryParams } = require('../services/providers/propertyData/propertyTypeMapping');
const { applyPropertyDataEvidence } = require('../services/providers/propertyData/propertyDataEvidence');
const { calculateIntelligenceScores } = require('../services/ai/propertyScoring');
const {
  buildRentIntelligence,
  listingAskingRent,
} = require('../services/ai/rentIntelligenceService');
const { scorePersonalDecision } = require('../services/ai/personalDecisionEngine');
const { buildDecisionContext } = require('../services/ai/postcodeMarketIntelligenceService');
const { templateSummary } = require('../services/ai/propertyExplanationService');
const { transactionSoldDate } = require('../services/ai/comparableEngine');
const {
  BUYER_GENERAL_WEIGHTS,
  LANDLORD_WEIGHTS,
} = require('../config/personalDecision.config');

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    console.error(`✗ ${name}`);
    throw e;
  }
}

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));
}

const LIVE = loadFixture('propertydata-demand-live-min.json');
const LIVE_META = loadFixture('propertydata-demand-live-min.meta.json');
const LIVE_RENTS = loadFixture('propertydata-rents-live-min.json');

const BUYER_PROPERTY = {
  id: 1,
  price: 380000,
  city: 'Manchester',
  zip_code: 'M1 1AA',
  bedrooms: 3,
  property_type: 'Terraced',
  title: '3 bed terrace',
  description: 'Family home with garden.',
  has_garden: true,
  commuteMinutes: 22,
};
const BUYER_PREFS = {
  budgetMax: 400000,
  location: 'M1 1AA',
  bedrooms: 3,
  propertyType: 'Terraced',
  lifestyle: 'family garden',
  maxCommuteMinutes: 30,
};
const BUYER_INTEL = {
  confidence: { level: 'High', assessed: true },
  sale: {
    success: true,
    centralEstimate: 375000,
    lowerEstimate: 360000,
    upperEstimate: 390000,
    evidenceCount: 8,
    confidence: 'high',
  },
};

test('genuine live /demand payload parses correctly', () => {
  const parsed = parseDemandResponse(LIVE);
  assert.strictEqual(parsed.postcode, 'W14 9JH');
  assert.strictEqual(parsed.postcodeType, 'full');
  assert.strictEqual(parsed.radius, 0.4);
  assert.strictEqual(parsed.totalForSale, 288);
  assert.strictEqual(parsed.averageSalesPerMonth, 16);
  assert.strictEqual(parsed.turnoverPerMonth, '6%');
  assert.strictEqual(parsed.turnoverPerMonthPercent, 6);
  assert.strictEqual(parsed.monthsOfInventory, 16.7);
  assert.strictEqual(parsed.daysOnMarket, 507);
  assert.strictEqual(parsed.demandRating, "Buyer's market");

  const evidence = buildMarketDemandEvidence(parsed, { retrievedAt: LIVE_META.retrievedAt });
  assert.strictEqual(evidence.available, true);
  assert.strictEqual(evidence.source, 'PropertyData');
  assert.strictEqual(evidence.provider, 'propertydata');
  assert.strictEqual(evidence.endpoint, '/demand');
  assert.strictEqual(evidence.providerEndpoint, '/demand');
  assert.strictEqual(evidence.scope, 'area');
  assert.strictEqual(evidence.demandType, 'buyer_market');
  assert.strictEqual(evidence.band, "Buyer's market");
  assert.strictEqual(evidence.value, null);
  assert.strictEqual(evidence.propertyLevel, false);
  assert.strictEqual(evidence.rentalDemand, false);
  assert.strictEqual(evidence.state, 'observed');
  assert.strictEqual(evidence.retrievedAt, LIVE_META.retrievedAt);
  assert.strictEqual(evidence.provenance.source, 'PropertyData');
  assert.strictEqual(evidence.provenance.providerEndpoint, '/demand');
});

test('missing fields remain null/notAssessed', () => {
  assert.strictEqual(parseDemandResponse(null), null);
  assert.strictEqual(parseDemandResponse({}), null);
  assert.strictEqual(parseDemandResponse({ status: 'success' }), null);

  const empty = buildMarketDemandEvidence(null);
  assert.strictEqual(empty.available, false);
  assert.strictEqual(empty.state, 'notAssessed');
  assert.strictEqual(empty.band, null);
  assert.strictEqual(empty.value, null);
  assert.strictEqual(empty.sampleSize, null);
  assert.strictEqual(empty.confidence, null);
  assert.strictEqual(empty.observationPeriod, null);
  assert.strictEqual(empty.observedAt, null);

  const supplyOnly = buildMarketDemandEvidence(
    parseDemandResponse({ status: 'success', postcode: 'W14 9JH', total_for_sale: 40 })
  );
  assert.strictEqual(supplyOnly.available, false);
  assert.strictEqual(supplyOnly.state, 'notAssessed');
  assert.strictEqual(supplyOnly.band, null);
});

test('no demand fields are fabricated', () => {
  const evidence = buildMarketDemandEvidence(parseDemandResponse(LIVE), {
    retrievedAt: LIVE_META.retrievedAt,
  });
  assert.strictEqual(evidence.value, null);
  assert.strictEqual(evidence.sampleSize, null);
  assert.strictEqual(evidence.confidence, null);
  assert.strictEqual(evidence.observationPeriod, null);
  assert.strictEqual(evidence.observedAt, null);
  assert.strictEqual(evidence.radiusUnit, null);
  assert.ok(!Object.prototype.hasOwnProperty.call(parseDemandResponse(LIVE), 'process_time'));
  assert.ok(!/strong demand|high demand/i.test(evidence.band));
});

test('comparable count is not demand', () => {
  const scores = calculateIntelligenceScores({
    property: { price: 200000, monthly_rent: 1100, bedrooms: 2 },
    comparableCount: 12,
    dataQuality: { score: 90, level: 'High' },
    risks: [],
  });
  assert.strictEqual(scores.componentDetail.demand.available, false);
  assert.strictEqual(scores.componentDetail.demand.score, null);
  assert.strictEqual(scores.componentDetail.demand.state, 'no_demand_data_source');
});

test('confidence is not demand', () => {
  const evidence = buildMarketDemandEvidence(parseDemandResponse(LIVE));
  assert.strictEqual(evidence.confidence, null);
  const scores = calculateIntelligenceScores({
    property: { price: 250000, zip_code: 'W14 9JH' },
    comparableCount: 8,
    dataQuality: { score: 80, level: 'High' },
    risks: [],
  });
  assert.notStrictEqual(scores.componentDetail.demand.state, 'well_evidenced');
  assert.strictEqual(scores.componentDetail.demand.state, 'no_demand_data_source');
});

test('listing count is not silently converted to demand', () => {
  const evidence = buildMarketDemandEvidence(parseDemandResponse(LIVE));
  assert.notStrictEqual(evidence.sampleSize, evidence.totalForSale);
  assert.strictEqual(evidence.sampleSize, null);
  assert.strictEqual(evidence.totalForSale, 288);
  assert.strictEqual(evidence.band, "Buyer's market");
  assert.notStrictEqual(evidence.band, String(evidence.totalForSale));
});

test('updated_at/created_at are not demand timestamps', () => {
  const stamp = '2026-01-01T00:00:00.000Z';
  const evidence = buildMarketDemandEvidence(parseDemandResponse(LIVE), {
    retrievedAt: LIVE_META.retrievedAt,
  });
  assert.strictEqual(evidence.observedAt, null);
  assert.strictEqual(evidence.retrievedAt, LIVE_META.retrievedAt);
  assert.notStrictEqual(evidence.retrievedAt, stamp);
  assert.strictEqual(transactionSoldDate({ created_at: stamp, updated_at: stamp }), null);
});

test('area demand is explicitly area-level and not property-specific', () => {
  const evidence = buildMarketDemandEvidence(parseDemandResponse(LIVE));
  assert.strictEqual(evidence.scope, 'area');
  assert.strictEqual(evidence.propertyLevel, false);
  const fromEnrichment = demandEvidenceFromEnrichment({
    enrichments: { demand: { success: true, data: LIVE, provenance: { retrievedAt: LIVE_META.retrievedAt } } },
  });
  assert.strictEqual(fromEnrichment.propertyLevel, false);
  assert.strictEqual(fromEnrichment.scope, 'area');
});

test('sale demand is not rental demand', () => {
  const evidence = buildMarketDemandEvidence(parseDemandResponse(LIVE));
  assert.strictEqual(evidence.demandType, 'buyer_market');
  assert.strictEqual(evidence.rentalDemand, false);
  assert.notStrictEqual(evidence.demandType, 'rental');
  assert.notStrictEqual(evidence.demandType, 'tenant');
});

test('landlord demand remains notAssessed', () => {
  const evidence = buildMarketDemandEvidence(parseDemandResponse(LIVE), {
    retrievedAt: LIVE_META.retrievedAt,
  });
  const scored = scorePersonalDecision({
    profile: 'landlord',
    property: {
      id: 12,
      price: 200000,
      city: 'London',
      zip_code: 'W14 9JH',
      bedrooms: 2,
      property_type: 'Flat',
      monthly_rent: 1800,
    },
    preferences: {},
    intelligence: {
      confidence: { level: 'High', assessed: true },
      areaMarketDemand: evidence,
      marketDemand: evidence,
      rentIntel: {
        success: true,
        currentRent: 1800,
        recommendedRent: 1900,
        marketRange: { low: 1700, high: 2100 },
        comparables: [],
      },
      risks: [],
    },
    finance: {},
    asOf: '2026-06-01T00:00:00.000Z',
  });
  assert.strictEqual(scored.dimensions.demand.available, false);
  assert.strictEqual(scored.dimensions.demand.state, 'no_demand_data_source');
  assert.strictEqual(scored.dimensions.demand.score, null);
});

test('buyer_general numeric score remains unchanged', () => {
  const base = scorePersonalDecision({
    profile: 'buyer_general',
    property: BUYER_PROPERTY,
    preferences: BUYER_PREFS,
    intelligence: BUYER_INTEL,
    asOf: '2026-06-01T00:00:00.000Z',
  });
  const withDemand = scorePersonalDecision({
    profile: 'buyer_general',
    property: BUYER_PROPERTY,
    preferences: BUYER_PREFS,
    intelligence: {
      ...BUYER_INTEL,
      areaMarketDemand: buildMarketDemandEvidence(parseDemandResponse(LIVE)),
      marketDemand: buildMarketDemandEvidence(parseDemandResponse(LIVE)),
      decisionContext: buildDecisionContext({
        success: true,
        postcode: 'W14 9JH',
        retrievedAt: LIVE_META.retrievedAt,
        snapshot: {
          areaMarketDemand: buildMarketDemandEvidence(parseDemandResponse(LIVE), {
            retrievedAt: LIVE_META.retrievedAt,
          }),
        },
      }),
    },
    asOf: '2026-06-01T00:00:00.000Z',
  });
  assert.strictEqual(withDemand.available, true);
  assert.strictEqual(withDemand.score, base.score);
  assert.deepStrictEqual(
    Object.fromEntries(Object.entries(withDemand.dimensions).map(([k, d]) => [k, d.score])),
    Object.fromEntries(Object.entries(base.dimensions).map(([k, d]) => [k, d.score]))
  );
});

test('valuation remains unchanged', () => {
  const avm = {
    status: 'success',
    estimate: 410000,
    margin: 15000,
    confidence: 'medium',
  };
  const withoutDemand = parseValuationSaleResponse(avm);
  const withDemand = parseValuationSaleResponse({ ...avm, ...LIVE });
  assert.strictEqual(withDemand.centralEstimate, withoutDemand.centralEstimate);
  assert.strictEqual(withDemand.lowerEstimate, withoutDemand.lowerEstimate);
  assert.strictEqual(withDemand.upperEstimate, withoutDemand.upperEstimate);

  const listing = {
    id: 9,
    price: 400000,
    monthly_rent: 1800,
    property_type: 'Flat',
    bedrooms: 2,
  };
  const applied = applyPropertyDataEvidence(listing, {
    enrichments: { demand: { success: true, data: LIVE } },
  });
  assert.strictEqual(applied.property.price, 400000);
  assert.strictEqual(applied.property.monthly_rent, 1800);
});

test('rent intelligence and /rents behaviour remain unchanged', () => {
  const pd = buildRentalEvidence(parseRentsResponse(LIVE_RENTS));
  const intel = buildRentIntelligence({
    target: { monthly_rent: 1800, property_type: 'Flat', category: 'rent' },
    ranked: [],
    pdEvidence: pd,
    propertyCategory: 'rent',
  });
  assert.strictEqual(intel.currentRent, 1800);
  assert.strictEqual(listingAskingRent({ monthly_rent: 1800 }), 1800);
  assert.strictEqual(intel.expectedDemand.state, 'no_demand_data_source');
  assert.strictEqual(intel.propertyDataRents.endpoint, '/rents');
  assert.strictEqual(intel.propertyDataRents.rentType, 'asking_long_let');
  assert.notStrictEqual(intel.propertyDataRents.endpoint, '/demand');
});

test('listing asking rent remains unchanged', () => {
  const listing = { monthly_rent: 1800, price: 250000 };
  const applied = applyPropertyDataEvidence(listing, {
    enrichments: { demand: { success: true, data: LIVE } },
  });
  assert.strictEqual(applied.property.monthly_rent, 1800);
  assert.strictEqual(listingAskingRent(applied.property), 1800);
});

test('PropertyData provenance is preserved', () => {
  const evidence = buildMarketDemandEvidence(parseDemandResponse(LIVE), {
    retrievedAt: LIVE_META.retrievedAt,
  });
  assert.strictEqual(evidence.provenance.source, 'PropertyData');
  assert.strictEqual(evidence.provenance.method, 'demand_area_buyer_market');
  assert.strictEqual(evidence.provenance.providerEndpoint, '/demand');
  assert.strictEqual(evidence.provenance.retrievedAt, LIVE_META.retrievedAt);
  assert.strictEqual(evidence.provenance.observedAt, null);
  assert.ok(/not property-specific/i.test(evidence.provenance.notes));
});

test('genuine freshness/sample metadata is preserved if present and unknown remains notAssessed', () => {
  const evidence = buildMarketDemandEvidence(parseDemandResponse(LIVE), {
    retrievedAt: LIVE_META.retrievedAt,
  });
  assert.strictEqual(evidence.retrievedAt, '2026-08-25T17:51:46.390Z');
  assert.strictEqual(evidence.sampleSize, null);
  assert.strictEqual(evidence.observationPeriod, null);
  assert.strictEqual(evidence.confidence, null);

  const params = buildDemandQueryParams('W14 9JH');
  assert.strictEqual(params.postcode, 'W149JH');
  assert.ok(!Object.prototype.hasOwnProperty.call(params, 'bedrooms'));
  assert.ok(!Object.prototype.hasOwnProperty.call(params, 'type'));
  assert.ok(!Object.prototype.hasOwnProperty.call(params, 'property_type'));
  assert.strictEqual(buildDemandQueryParams(''), null);
});

test('explanation language stays area-level', () => {
  const summary = templateSummary({
    property: { title: 'Example flat' },
    areaMarketDemand: {
      available: true,
      band: "Buyer's market",
      scope: 'area',
      propertyLevel: false,
    },
  });
  assert.ok(/surrounding market/i.test(summary));
  assert.ok(/not property-specific demand/i.test(summary));
  assert.ok(!/this property has (high|low|strong) demand/i.test(summary));
});

test('captured fixture is the genuine /demand contract only', () => {
  assert.deepStrictEqual(Object.keys(LIVE).sort(), [
    'average_sales_per_month',
    'days_on_market',
    'demand_rating',
    'months_of_inventory',
    'postcode',
    'postcode_type',
    'process_time',
    'radius',
    'status',
    'total_for_sale',
    'turnover_per_month',
  ]);
  assert.strictEqual(LIVE_META.endpoint, '/demand');
  assert.deepStrictEqual(LIVE_META.filters, {});
  assert.strictEqual(LIVE_META.retrievedAt, '2026-08-25T17:51:46.390Z');
  assert.ok(!JSON.stringify(LIVE).includes('key='));
});

test('demand_rating remains provider categorical evidence', () => {
  const evidence = buildMarketDemandEvidence(parseDemandResponse(LIVE));
  assert.strictEqual(evidence.band, LIVE.demand_rating);
  assert.strictEqual(typeof evidence.band, 'string');
  assert.strictEqual(evidence.value, null);
  assert.ok(!Number.isFinite(Number(evidence.band)));
});

test('total_for_sale remains stock/supply and is not converted into demand', () => {
  const evidence = buildMarketDemandEvidence(parseDemandResponse(LIVE));
  assert.strictEqual(evidence.totalForSale, 288);
  assert.strictEqual(evidence.sampleSize, null);
  assert.notStrictEqual(evidence.band, '288');
  assert.strictEqual(evidence.value, null);
});

test('turnover and inventory are stored without invented demand meaning', () => {
  const evidence = buildMarketDemandEvidence(parseDemandResponse(LIVE));
  assert.strictEqual(evidence.turnoverPerMonth, '6%');
  assert.strictEqual(evidence.turnoverPerMonthPercent, 6);
  assert.strictEqual(evidence.monthsOfInventory, 16.7);
  assert.notStrictEqual(evidence.band, '6%');
  assert.notStrictEqual(evidence.value, 6);
  assert.notStrictEqual(evidence.value, 16.7);
});

test('radius unit is not invented', () => {
  const parsed = parseDemandResponse(LIVE);
  const evidence = buildMarketDemandEvidence(parsed);
  assert.strictEqual(parsed.radius, 0.4);
  assert.strictEqual(evidence.radius, 0.4);
  assert.strictEqual(evidence.radiusUnit, null);
  assert.ok(!Object.prototype.hasOwnProperty.call(LIVE, 'radius_unit'));
  assert.ok(!Object.prototype.hasOwnProperty.call(LIVE, 'unit'));
});

test('days_on_market is not property time-to-sell', () => {
  const evidence = buildMarketDemandEvidence(parseDemandResponse(LIVE));
  assert.strictEqual(evidence.daysOnMarket, 507);
  assert.ok(!Object.prototype.hasOwnProperty.call(evidence, 'timeToSell'));
  assert.ok(!Object.prototype.hasOwnProperty.call(evidence, 'timeToLet'));
  assert.ok(!Object.prototype.hasOwnProperty.call(evidence, 'daysToSell'));
  const intel = buildRentIntelligence({
    target: { monthly_rent: 1800, property_type: 'Flat', category: 'rent' },
    ranked: [],
    pdEvidence: buildRentalEvidence(parseRentsResponse(LIVE_RENTS)),
    propertyCategory: 'rent',
  });
  assert.strictEqual(intel.timeToLet, null);
});

test('buyer_general and landlord weights remain unchanged', () => {
  assert.deepStrictEqual(BUYER_GENERAL_WEIGHTS, {
    affordability: 0.3,
    location: 0.22,
    space: 0.18,
    priceFairness: 0.15,
    lifestyle: 0.08,
    transport: 0.07,
  });
  assert.deepStrictEqual(LANDLORD_WEIGHTS, {
    rentPosition: 0.2,
    grossYield: 0.18,
    netOperating: 0.14,
    cashFlow: 0.12,
    vacancy: 0.08,
    dscr: 0.1,
    risk: 0.1,
    demand: 0.08,
  });
  assert.ok(!Object.prototype.hasOwnProperty.call(BUYER_GENERAL_WEIGHTS, 'demand'));
});

test('landlord rent/yield/NOI/cash-flow/DSCR remain unchanged with area demand present', () => {
  const property = {
    id: 12,
    price: 200000,
    city: 'London',
    zip_code: 'W14 9JH',
    bedrooms: 2,
    property_type: 'Flat',
    monthly_rent: 1800,
  };
  const finance = {
    expectedRent: 1800,
    deposit: 50000,
    interestRate: 4.5,
    mortgageTermYears: 25,
    vacancyAssumption: 5,
    maintenance: 1200,
    insurance: 600,
    managementFee: 0,
    serviceCharge: 0,
    groundRent: 0,
    taxes: 0,
  };
  const intelligence = {
    confidence: { level: 'High', assessed: true },
    rentIntel: {
      success: true,
      currentRent: 1800,
      recommendedRent: 1900,
      marketRange: { low: 1700, high: 2100 },
      comparables: [],
    },
    risks: [],
  };
  const without = scorePersonalDecision({
    profile: 'landlord',
    property,
    preferences: {},
    intelligence,
    finance,
    asOf: '2026-06-01T00:00:00.000Z',
  });
  const withDemand = scorePersonalDecision({
    profile: 'landlord',
    property,
    preferences: {},
    intelligence: {
      ...intelligence,
      areaMarketDemand: buildMarketDemandEvidence(parseDemandResponse(LIVE)),
      marketDemand: buildMarketDemandEvidence(parseDemandResponse(LIVE)),
    },
    finance,
    asOf: '2026-06-01T00:00:00.000Z',
  });
  ['rentPosition', 'grossYield', 'netOperating', 'cashFlow', 'dscr', 'vacancy', 'demand'].forEach((key) => {
    assert.strictEqual(withDemand.dimensions[key].available, without.dimensions[key].available, key);
    assert.strictEqual(withDemand.dimensions[key].score, without.dimensions[key].score, key);
    assert.strictEqual(withDemand.dimensions[key].state, without.dimensions[key].state, key);
  });
  assert.strictEqual(withDemand.score, without.score);
  assert.strictEqual(withDemand.dimensions.demand.state, 'no_demand_data_source');
});

test('PropertyData demand is separate from InternalMarketplace listing supply', () => {
  const evidence = buildMarketDemandEvidence(parseDemandResponse(LIVE), {
    retrievedAt: LIVE_META.retrievedAt,
  });
  assert.strictEqual(evidence.source, 'PropertyData');
  assert.strictEqual(evidence.providerEndpoint, '/demand');
  assert.notStrictEqual(evidence.source, 'InternalMarketplace');
  const decision = buildDecisionContext({
    success: true,
    postcode: 'W14 9JH',
    retrievedAt: LIVE_META.retrievedAt,
    snapshot: {
      areaMarketDemand: evidence,
      listingSupply: {
        total: 12,
        source: 'InternalMarketplace',
      },
    },
  });
  assert.strictEqual(decision.marketDemand.source, 'PropertyData');
  assert.strictEqual(decision.marketDemand.band, "Buyer's market");
  assert.notStrictEqual(decision.marketDemand.band, '12');
  assert.strictEqual(decision.marketDemand.role, 'context_only');
});
