/**
 * PropertyData /demand-rent live-payload utilisation proofs.
 * Run: node server/tests/propertyDataDemandRent.test.js
 *
 * Uses the captured genuine fixture only. Do not make another paid API call.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const {
  parseDemandRentResponse,
  buildRentalDemandEvidence,
  rentalDemandEvidenceFromEnrichment,
  parseDemandResponse,
  buildMarketDemandEvidence,
  parseRentsResponse,
  buildRentalEvidence,
  parseValuationSaleResponse,
} = require('../services/providers/propertyData/propertyDataParsers');
const { buildDemandRentQueryParams } = require('../services/providers/propertyData/propertyTypeMapping');
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

const LIVE = loadFixture('propertydata-demand-rent-live-min.json');
const LIVE_META = loadFixture('propertydata-demand-rent-live-min.meta.json');
const LIVE_SALES = loadFixture('propertydata-demand-live-min.json');
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

const LANDLORD_PROPERTY = {
  id: 12,
  price: 200000,
  city: 'London',
  zip_code: 'W14 9JH',
  bedrooms: 2,
  property_type: 'Flat',
  monthly_rent: 1800,
};
const LANDLORD_FINANCE = {
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
const LANDLORD_INTEL = {
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

function rentalEvidence(overrides = {}) {
  return buildRentalDemandEvidence(parseDemandRentResponse(LIVE), {
    retrievedAt: LIVE_META.retrievedAt,
    ...overrides,
  });
}

test('genuine live /demand-rent payload parses correctly', () => {
  const parsed = parseDemandRentResponse(LIVE);
  assert.strictEqual(parsed.postcode, 'W14 9JH');
  assert.strictEqual(parsed.postcodeType, 'full');
  assert.strictEqual(parsed.radius, 0.7);
  assert.strictEqual(parsed.totalForRent, 592);
  assert.strictEqual(parsed.transactionsPerMonth, 284);
  assert.strictEqual(parsed.turnoverPerMonth, '48%');
  assert.strictEqual(parsed.turnoverPerMonthPercent, 48);
  assert.strictEqual(parsed.monthsOfInventory, 2.1);
  assert.strictEqual(parsed.daysOnMarket, 63);
  assert.strictEqual(parsed.rentalDemandRating, "Landlord's market");

  const evidence = rentalEvidence();
  assert.strictEqual(evidence.available, true);
  assert.strictEqual(evidence.source, 'PropertyData');
  assert.strictEqual(evidence.provider, 'propertydata');
  assert.strictEqual(evidence.endpoint, '/demand-rent');
  assert.strictEqual(evidence.providerEndpoint, '/demand-rent');
  assert.strictEqual(evidence.scope, 'area');
  assert.strictEqual(evidence.demandType, 'rental_market');
  assert.strictEqual(evidence.band, "Landlord's market");
  assert.strictEqual(evidence.value, null);
  assert.strictEqual(evidence.propertyLevel, false);
  assert.strictEqual(evidence.rentalDemand, true);
  assert.strictEqual(evidence.state, 'observed');
  assert.strictEqual(evidence.retrievedAt, LIVE_META.retrievedAt);
  assert.strictEqual(evidence.provenance.source, 'PropertyData');
  assert.strictEqual(evidence.provenance.providerEndpoint, '/demand-rent');
});

test('missing fields remain null/notAssessed', () => {
  assert.strictEqual(parseDemandRentResponse(null), null);
  assert.strictEqual(parseDemandRentResponse({}), null);
  assert.strictEqual(parseDemandRentResponse({ status: 'success' }), null);

  const empty = buildRentalDemandEvidence(null);
  assert.strictEqual(empty.available, false);
  assert.strictEqual(empty.state, 'notAssessed');
  assert.strictEqual(empty.band, null);
  assert.strictEqual(empty.value, null);
  assert.strictEqual(empty.sampleSize, null);
  assert.strictEqual(empty.confidence, null);
  assert.strictEqual(empty.observationPeriod, null);
  assert.strictEqual(empty.observedAt, null);

  const supplyOnly = buildRentalDemandEvidence(
    parseDemandRentResponse({ status: 'success', postcode: 'W14 9JH', total_for_rent: 40 })
  );
  assert.strictEqual(supplyOnly.available, false);
  assert.strictEqual(supplyOnly.state, 'notAssessed');
  assert.strictEqual(supplyOnly.band, null);
});

test('no numeric demand score is fabricated from the provider label', () => {
  const evidence = rentalEvidence();
  assert.strictEqual(evidence.value, null);
  assert.strictEqual(evidence.sampleSize, null);
  assert.strictEqual(evidence.confidence, null);
  assert.strictEqual(evidence.observationPeriod, null);
  assert.strictEqual(evidence.observedAt, null);
  assert.strictEqual(evidence.radiusUnit, null);
  assert.ok(!Object.prototype.hasOwnProperty.call(parseDemandRentResponse(LIVE), 'process_time'));
  assert.ok(!/^(high|strong|low|weak)$/i.test(evidence.band));
  assert.ok(!Number.isFinite(Number(evidence.band)));
  assert.notStrictEqual(evidence.band, 'High');
  assert.notStrictEqual(evidence.band, 'Strong');
});

test('comparable count is not rental demand', () => {
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
  const evidence = buildRentalDemandEvidence(parseDemandRentResponse(LIVE));
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

test('total_for_rent remains stock/supply and is not sample size', () => {
  const evidence = rentalEvidence();
  assert.notStrictEqual(evidence.sampleSize, evidence.totalForRent);
  assert.strictEqual(evidence.sampleSize, null);
  assert.strictEqual(evidence.totalForRent, 592);
  assert.strictEqual(evidence.band, "Landlord's market");
  assert.notStrictEqual(evidence.band, String(evidence.totalForRent));
  assert.strictEqual(evidence.value, null);
});

test('updated_at/created_at are not demand timestamps', () => {
  const stamp = '2026-01-01T00:00:00.000Z';
  const evidence = rentalEvidence();
  assert.strictEqual(evidence.observedAt, null);
  assert.strictEqual(evidence.retrievedAt, LIVE_META.retrievedAt);
  assert.notStrictEqual(evidence.retrievedAt, stamp);
  assert.strictEqual(transactionSoldDate({ created_at: stamp, updated_at: stamp }), null);
});

test('area rental demand is explicitly area-level and not property-specific', () => {
  const evidence = rentalEvidence();
  assert.strictEqual(evidence.scope, 'area');
  assert.strictEqual(evidence.propertyLevel, false);
  const fromEnrichment = rentalDemandEvidenceFromEnrichment({
    enrichments: {
      demand_rent: {
        success: true,
        data: LIVE,
        provenance: { retrievedAt: LIVE_META.retrievedAt },
      },
    },
  });
  assert.strictEqual(fromEnrichment.propertyLevel, false);
  assert.strictEqual(fromEnrichment.scope, 'area');
  assert.strictEqual(fromEnrichment.demandType, 'rental_market');
});

test('rental demand is not sales /demand', () => {
  const rental = rentalEvidence();
  const sales = buildMarketDemandEvidence(parseDemandResponse(LIVE_SALES));
  assert.strictEqual(rental.demandType, 'rental_market');
  assert.strictEqual(rental.rentalDemand, true);
  assert.strictEqual(rental.providerEndpoint, '/demand-rent');
  assert.strictEqual(sales.demandType, 'buyer_market');
  assert.strictEqual(sales.rentalDemand, false);
  assert.strictEqual(sales.providerEndpoint, '/demand');
  assert.notStrictEqual(rental.demandType, sales.demandType);
  assert.notStrictEqual(rental.band, sales.band);
  assert.strictEqual(buildMarketDemandEvidence(parseDemandResponse(LIVE)).available, false);
  assert.strictEqual(buildRentalDemandEvidence(parseDemandRentResponse(LIVE_SALES)).available, false);
});

test('landlord numeric demand remains notAssessed', () => {
  const evidence = rentalEvidence();
  const scored = scorePersonalDecision({
    profile: 'landlord',
    property: LANDLORD_PROPERTY,
    preferences: {},
    intelligence: {
      ...LANDLORD_INTEL,
      areaRentalDemand: evidence,
      decisionContext: buildDecisionContext({
        success: true,
        postcode: 'W14 9JH',
        retrievedAt: LIVE_META.retrievedAt,
        snapshot: { areaRentalDemand: evidence },
      }),
    },
    finance: {},
    asOf: '2026-06-01T00:00:00.000Z',
  });
  assert.strictEqual(scored.dimensions.demand.available, false);
  assert.strictEqual(scored.dimensions.demand.state, 'no_demand_data_source');
  assert.strictEqual(scored.dimensions.demand.score, null);
  assert.ok(/context only/i.test(scored.dimensions.demand.unavailableReason));
  assert.ok(/property-specific tenant demand is notAssessed/i.test(scored.dimensions.demand.unavailableReason));
  assert.strictEqual(scored.marketContext.rentalDemand.available, true);
  assert.strictEqual(scored.marketContext.rentalDemand.role, 'context_only');
  assert.strictEqual(scored.marketContext.rentalDemand.value, null);
  assert.strictEqual(scored.marketContext.rentalDemand.scope, 'area');
  assert.strictEqual(scored.marketContext.rentalDemand.demandType, 'rental_market');
  assert.strictEqual(scored.marketContext.rentalDemand.propertyLevel, false);
  assert.strictEqual(scored.marketContext.rentalDemand.band, "Landlord's market");
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
      areaRentalDemand: rentalEvidence(),
      decisionContext: buildDecisionContext({
        success: true,
        postcode: 'W14 9JH',
        retrievedAt: LIVE_META.retrievedAt,
        snapshot: { areaRentalDemand: rentalEvidence() },
      }),
    },
    asOf: '2026-06-01T00:00:00.000Z',
  });
  assert.strictEqual(withDemand.available, true);
  assert.strictEqual(withDemand.score, base.score);
  assert.ok(!Object.prototype.hasOwnProperty.call(withDemand, 'marketContext'));
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
    enrichments: { demand_rent: { success: true, data: LIVE } },
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
  assert.notStrictEqual(intel.propertyDataRents.endpoint, '/demand-rent');
  assert.strictEqual(intel.timeToLet, null);
});

test('listing asking rent remains unchanged', () => {
  const listing = { monthly_rent: 1800, price: 250000 };
  const applied = applyPropertyDataEvidence(listing, {
    enrichments: { demand_rent: { success: true, data: LIVE } },
  });
  assert.strictEqual(applied.property.monthly_rent, 1800);
  assert.strictEqual(listingAskingRent(applied.property), 1800);
});

test('PropertyData provenance is preserved', () => {
  const evidence = rentalEvidence();
  assert.strictEqual(evidence.provenance.source, 'PropertyData');
  assert.strictEqual(evidence.provenance.method, 'demand_area_rental_market');
  assert.strictEqual(evidence.provenance.providerEndpoint, '/demand-rent');
  assert.strictEqual(evidence.provenance.retrievedAt, LIVE_META.retrievedAt);
  assert.strictEqual(evidence.provenance.observedAt, null);
  assert.ok(/not property-specific/i.test(evidence.provenance.notes));
});

test('genuine freshness/sample metadata is preserved if present and unknown remains notAssessed', () => {
  const evidence = rentalEvidence();
  assert.strictEqual(evidence.retrievedAt, '2026-08-25T18:18:36.885Z');
  assert.strictEqual(evidence.sampleSize, null);
  assert.strictEqual(evidence.observationPeriod, null);
  assert.strictEqual(evidence.confidence, null);

  const params = buildDemandRentQueryParams('W14 9JH');
  assert.strictEqual(params.postcode, 'W149JH');
  assert.ok(!Object.prototype.hasOwnProperty.call(params, 'bedrooms'));
  assert.ok(!Object.prototype.hasOwnProperty.call(params, 'type'));
  assert.ok(!Object.prototype.hasOwnProperty.call(params, 'property_type'));
  assert.strictEqual(buildDemandRentQueryParams(''), null);
});

test('explanation language stays area-level', () => {
  const summary = templateSummary({
    property: { title: 'Example flat' },
    areaRentalDemand: {
      available: true,
      band: "Landlord's market",
      scope: 'area',
      propertyLevel: false,
    },
  });
  assert.ok(/surrounding market/i.test(summary));
  assert.ok(/not property-specific tenant demand/i.test(summary));
  assert.ok(!/this property has (high|low|strong) demand/i.test(summary));
  assert.ok(!/days to let|time to let|let probability/i.test(summary));
});

test('captured fixture is the genuine /demand-rent contract only', () => {
  assert.deepStrictEqual(Object.keys(LIVE).sort(), [
    'days_on_market',
    'months_of_inventory',
    'postcode',
    'postcode_type',
    'process_time',
    'radius',
    'rental_demand_rating',
    'status',
    'total_for_rent',
    'transactions_per_month',
    'turnover_per_month',
  ]);
  assert.strictEqual(LIVE_META.endpoint, '/demand-rent');
  assert.deepStrictEqual(LIVE_META.filters, {});
  assert.strictEqual(LIVE_META.retrievedAt, '2026-08-25T18:18:36.885Z');
  assert.ok(!JSON.stringify(LIVE).includes('key='));
  assert.ok(!JSON.stringify(LIVE_META).includes('key='));
});

test('rental_demand_rating remains provider categorical evidence', () => {
  const evidence = rentalEvidence();
  assert.strictEqual(evidence.band, LIVE.rental_demand_rating);
  assert.strictEqual(typeof evidence.band, 'string');
  assert.strictEqual(evidence.value, null);
  assert.ok(!Number.isFinite(Number(evidence.band)));
});

test('turnover is stored without invented probability meaning', () => {
  const evidence = rentalEvidence();
  assert.strictEqual(evidence.turnoverPerMonth, '48%');
  assert.strictEqual(evidence.turnoverPerMonthPercent, 48);
  assert.strictEqual(evidence.monthsOfInventory, 2.1);
  assert.notStrictEqual(evidence.band, '48%');
  assert.notStrictEqual(evidence.value, 48);
  assert.notStrictEqual(evidence.value, 0.48);
  assert.notStrictEqual(evidence.value, 2.1);
});

test('radius unit is not invented', () => {
  const parsed = parseDemandRentResponse(LIVE);
  const evidence = rentalEvidence();
  assert.strictEqual(parsed.radius, 0.7);
  assert.strictEqual(evidence.radius, 0.7);
  assert.strictEqual(evidence.radiusUnit, null);
  assert.ok(!Object.prototype.hasOwnProperty.call(LIVE, 'radius_unit'));
  assert.ok(!Object.prototype.hasOwnProperty.call(LIVE, 'unit'));
});

test('days_on_market is not property time-to-let', () => {
  const evidence = rentalEvidence();
  assert.strictEqual(evidence.daysOnMarket, 63);
  assert.ok(!Object.prototype.hasOwnProperty.call(evidence, 'timeToSell'));
  assert.ok(!Object.prototype.hasOwnProperty.call(evidence, 'timeToLet'));
  assert.ok(!Object.prototype.hasOwnProperty.call(evidence, 'daysToLet'));
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

test('landlord rent/yield/NOI/cash-flow/DSCR remain unchanged with area rental demand present', () => {
  const without = scorePersonalDecision({
    profile: 'landlord',
    property: LANDLORD_PROPERTY,
    preferences: {},
    intelligence: LANDLORD_INTEL,
    finance: LANDLORD_FINANCE,
    asOf: '2026-06-01T00:00:00.000Z',
  });
  const withDemand = scorePersonalDecision({
    profile: 'landlord',
    property: LANDLORD_PROPERTY,
    preferences: {},
    intelligence: {
      ...LANDLORD_INTEL,
      areaRentalDemand: rentalEvidence(),
    },
    finance: LANDLORD_FINANCE,
    asOf: '2026-06-01T00:00:00.000Z',
  });
  ['rentPosition', 'grossYield', 'netOperating', 'cashFlow', 'dscr', 'vacancy'].forEach((key) => {
    assert.strictEqual(withDemand.dimensions[key].available, without.dimensions[key].available, key);
    assert.strictEqual(withDemand.dimensions[key].score, without.dimensions[key].score, key);
    assert.strictEqual(withDemand.dimensions[key].state, without.dimensions[key].state, key);
  });
  assert.strictEqual(withDemand.dimensions.demand.available, false);
  assert.strictEqual(withDemand.dimensions.demand.score, null);
  assert.strictEqual(withDemand.dimensions.demand.state, 'no_demand_data_source');
  assert.strictEqual(withDemand.score, without.score);
  assert.strictEqual(withDemand.marketContext.rentalDemand.role, 'context_only');
  assert.strictEqual(without.marketContext.rentalDemand.available, false);
  assert.strictEqual(withDemand.marketContext.rentalDemand.available, true);
});

test('PropertyData rental demand is separate from InternalMarketplace listing supply', () => {
  const evidence = rentalEvidence();
  assert.strictEqual(evidence.source, 'PropertyData');
  assert.strictEqual(evidence.providerEndpoint, '/demand-rent');
  assert.notStrictEqual(evidence.source, 'InternalMarketplace');
  const decision = buildDecisionContext({
    success: true,
    postcode: 'W14 9JH',
    retrievedAt: LIVE_META.retrievedAt,
    snapshot: {
      areaRentalDemand: evidence,
      listingSupply: {
        total: 12,
        source: 'InternalMarketplace',
      },
    },
  });
  assert.strictEqual(decision.rentalMarketDemand.source, 'PropertyData');
  assert.strictEqual(decision.rentalMarketDemand.band, "Landlord's market");
  assert.notStrictEqual(decision.rentalMarketDemand.band, '12');
  assert.strictEqual(decision.rentalMarketDemand.role, 'context_only');
  assert.strictEqual(decision.rentalMarketDemand.value, null);
});

test('decisionContext keeps sales demand and rental demand unblended', () => {
  const rental = rentalEvidence();
  const sales = buildMarketDemandEvidence(parseDemandResponse(LIVE_SALES), {
    retrievedAt: '2026-08-25T17:51:46.390Z',
  });
  const decision = buildDecisionContext({
    success: true,
    postcode: 'W14 9JH',
    retrievedAt: LIVE_META.retrievedAt,
    snapshot: {
      areaMarketDemand: sales,
      areaRentalDemand: rental,
    },
  });
  assert.strictEqual(decision.marketDemand.available, true);
  assert.strictEqual(decision.marketDemand.demandType, 'buyer_market');
  assert.strictEqual(decision.marketDemand.providerEndpoint, '/demand');
  assert.strictEqual(decision.marketDemand.band, "Buyer's market");
  assert.strictEqual(decision.rentalMarketDemand.available, true);
  assert.strictEqual(decision.rentalMarketDemand.demandType, 'rental_market');
  assert.strictEqual(decision.rentalMarketDemand.providerEndpoint, '/demand-rent');
  assert.strictEqual(decision.rentalMarketDemand.band, "Landlord's market");
  assert.strictEqual(decision.marketDemand.role, 'context_only');
  assert.strictEqual(decision.rentalMarketDemand.role, 'context_only');
  assert.strictEqual(decision.marketDemand.value, null);
  assert.strictEqual(decision.rentalMarketDemand.value, null);
});
