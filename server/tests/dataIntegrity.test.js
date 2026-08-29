/**
 * Data integrity proofs from the Data & Variable Gap Audit.
 * Run: node server/tests/dataIntegrity.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const openai = require('../services/openaiService');
const {
  pickGroundRent,
  pickServiceCharge,
  listingObservedCharges,
} = require('../services/ai/listingObservedFields');
const {
  calculateInvestmentMetrics,
  calculateInvestmentScore,
} = require('../services/ai/financialEngine');
const { calculateIntelligenceScores } = require('../services/ai/propertyScoring');
const {
  transactionSoldDate,
  calculateSimilarity,
  rankComparables,
  rankSaleComparables,
} = require('../services/ai/comparableEngine');
const { weightedBlend } = require('../services/ai/valuationEngine');
const { buildSyntheticProperty } = require('../services/ai/standaloneValuationService');
const { scorePersonalDecision } = require('../services/ai/personalDecisionEngine');
const { buildBroadAreaYield } = require('../services/ai/postcodeMarketIntelligenceService');

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    console.error(`✗ ${name}`);
    throw e;
  }
}

test('LLM cannot generate numeric valuation', () => {
  assert.strictEqual(openai.mockValuation, undefined);
  const result = openai.generateValuationReport({
    address: '1 High Street, Leeds',
    bedrooms: 3,
    sizeSqFt: 1000,
    condition: 'Good',
  });
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.source, 'blocked');
  assert.strictEqual(result.data, null);
  assert.strictEqual(result.estimatedValue, null);
  assert.ok(!result.data?.estimatedValue?.mid);
  assert.ok(!result.data?.estimatedValue?.low);
  assert.ok(!result.data?.estimatedValue?.high);

  const src = fs.readFileSync(path.join(__dirname, '../services/openaiService.js'), 'utf8');
  assert.ok(!/function mockValuation/.test(src), 'mockValuation must be removed, not merely unexported');
  assert.ok(!/callOpenAI/.test(src.split('function generateValuationReport')[1].split('function generateBuyerMatches')[0]));
});

test('missing ground rent is not converted to zero', () => {
  const picked = pickGroundRent({});
  assert.strictEqual(picked.available, false);
  assert.strictEqual(picked.value, null);
  assert.strictEqual(picked.state, 'notAssessed');
  assert.notStrictEqual(picked.value, 0);

  const fromListing = listingObservedCharges({ service_charges: 1200 });
  assert.strictEqual(fromListing.groundRent.value, null);
  assert.strictEqual(fromListing.groundRent.state, 'notAssessed');
  assert.strictEqual(fromListing.serviceCharge.value, 1200);

  const metrics = calculateInvestmentMetrics({
    purchasePrice: 200000,
    expectedRent: 1100,
    deposit: 50000,
    interestRate: 4.5,
    maintenance: 1000,
    insurance: 500,
  });
  assert.strictEqual(metrics.groundRent, null);
  assert.strictEqual(metrics.groundRentState, 'notAssessed');
  assert.notStrictEqual(metrics.groundRent, 0);

  const knownZero = pickGroundRent({ ground_rent: 0 });
  assert.strictEqual(knownZero.available, true);
  assert.strictEqual(knownZero.value, 0);
  assert.strictEqual(knownZero.state, 'observed');
});

test('residential service_charges and commercial service_charge are wired separately', () => {
  const residential = pickServiceCharge({
    category: 'sale',
    service_charges: 1800,
    service_charge: 400,
  });
  assert.strictEqual(residential.value, 1800);
  assert.strictEqual(residential.field, 'service_charges');

  const commercial = pickServiceCharge({
    category: 'lease',
    service_charges: 1800,
    service_charge: 400,
  });
  assert.strictEqual(commercial.value, 400);
  assert.strictEqual(commercial.field, 'service_charge');

  const observed = listingObservedCharges({
    council_tax_band: 'D',
    broadband_availability: 'Superfast',
    ground_rent: 250,
  });
  assert.strictEqual(observed.councilTax.band.value, 'D');
  assert.strictEqual(observed.broadband.value, 'Superfast');
  assert.ok(observed.councilTax.band.provenance);
  assert.ok(observed.broadband.provenance);
  assert.strictEqual(observed.groundRent.value, 250);
});

test('unavailable demand remains notAssessed', () => {
  const scores = calculateIntelligenceScores({
    property: { price: 200000, monthly_rent: 1100, bedrooms: 2 },
    comparableCount: 12,
    dataQuality: { score: 90, level: 'High' },
    risks: [],
  });
  assert.strictEqual(scores.componentDetail.demand.available, false);
  assert.strictEqual(scores.componentDetail.demand.score, null);
  assert.strictEqual(scores.componentDetail.demand.state, 'no_demand_data_source');
  assert.ok(scores.notAssessed.some((n) => n.component === 'demand'));
});

test('updated_at is not treated as sold date', () => {
  const stamp = new Date().toISOString();
  const listingOnly = {
    id: 2,
    city: 'Leeds',
    property_type: 'Flat',
    bedrooms: 2,
    square_feet: 720,
    price: 250000,
    monthly_rent: 900,
    updated_at: stamp,
    created_at: stamp,
  };

  assert.strictEqual(transactionSoldDate(listingOnly), null);
  assert.strictEqual(transactionSoldDate({ ...listingOnly, sold_date: '2026-01-15' }), '2026-01-15');

  const target = { id: 1, city: 'Leeds', property_type: 'Flat', bedrooms: 2, square_feet: 700 };
  const similarity = calculateSimilarity(target, listingOnly);
  assert.ok(similarity.notComparable.includes('recency'));
  assert.strictEqual(similarity.breakdown.recency, null);

  const rentRanked = rankComparables(target, [listingOnly]);
  assert.ok(rentRanked.length, 'rent comparables with asking rent must still rank');
  assert.strictEqual(rentRanked[0].sold_date, null);
  assert.ok(!rentRanked[0].selectionReasons.includes('Recent listing data'));

  const saleRanked = rankSaleComparables(target, [listingOnly]);
  assert.ok(saleRanked.length, 'sale comparables with asking price must still rank');
  assert.strictEqual(saleRanked[0].sold_date, null);
  assert.ok(!saleRanked[0].selectionReasons.includes('Recent listing data'));

  const withSold = rankSaleComparables(target, [
    { ...listingOnly, id: 3, sold_date: stamp },
  ]);
  assert.strictEqual(withSold[0].sold_date, stamp);
  assert.ok(Number.isFinite(withSold[0].breakdown.recency));
});

test('asking-based area yield is marked notTransactionBasedYield', () => {
  const asking = buildBroadAreaYield(
    { soldPrices: null },
    [{ monthly_rent: 1000, created_at: '2026-01-01', updated_at: '2026-06-01' }],
    [{ price: 200000, created_at: '2026-01-01', updated_at: '2026-06-01' }]
  );
  assert.strictEqual(asking.available, true);
  assert.strictEqual(asking.notTransactionBasedYield, true);
  assert.strictEqual(asking.basis, 'asking_rent_vs_asking_sale');
  assert.ok(/not a realised \(transaction\) yield/i.test(asking.disclaimer));

  const vsSold = buildBroadAreaYield(
    { soldPrices: { average: 220000, sampleSize: 8 } },
    [{ monthly_rent: 1000, created_at: '2026-01-01', updated_at: '2026-06-01' }],
    []
  );
  assert.strictEqual(vsSold.available, true);
  assert.strictEqual(vsSold.notTransactionBasedYield, true);
  assert.strictEqual(vsSold.basis, 'asking_rent_vs_hmlr_sold');
});

test('missing valuation bounds are not fabricated', () => {
  const blend = weightedBlend([{ centralEstimate: 400000, method: 'valuation_sale_avm' }]);
  assert.strictEqual(blend.lower, null);
  assert.strictEqual(blend.upper, null);
  assert.strictEqual(blend.boundsAvailable, false);
  assert.notStrictEqual(blend.lower, Math.round(400000 * 0.94));
  assert.notStrictEqual(blend.upper, Math.round(400000 * 1.06));
});

test('standalone valuation does not default beds=3 or condition=Good', () => {
  const property = buildSyntheticProperty({ address: '10 King Street, Manchester M1 1AA' });
  assert.strictEqual(property.bedrooms, null);
  assert.strictEqual(property.bathrooms, null);
  assert.strictEqual(property.condition, null);
  assert.strictEqual(property.property_type, null);
});

test('buyer_general calculations continue to work after cleanup', () => {
  const r = scorePersonalDecision({
    profile: 'buyer_general',
    property: {
      id: 1,
      price: 380000,
      city: 'Manchester',
      zip_code: 'M1 1AA',
      bedrooms: 3,
      property_type: 'Terraced',
      title: '3 bed terrace',
      description: 'Family home with garden.',
      has_garden: true,
      has_garage: true,
      parking_spaces: 1,
      commuteMinutes: 22,
    },
    preferences: {
      budgetMax: 400000,
      location: 'M1 1AA',
      bedrooms: 3,
      propertyType: 'Terraced',
      lifestyle: 'family garden',
      maxCommuteMinutes: 30,
    },
    intelligence: {
      confidence: { level: 'High', assessed: true },
      sale: {
        success: true,
        centralEstimate: 375000,
        lowerEstimate: 360000,
        upperEstimate: 390000,
        evidenceCount: 8,
        confidence: 'high',
      },
    },
    asOf: '2026-06-01T00:00:00.000Z',
  });
  assert.strictEqual(r.available, true);
  assert.ok(Number.isFinite(r.score));
  assert.ok(r.dimensions.affordability.available);
  assert.ok(r.dimensions.location.available);
});

test('landlord calculations continue to work after cleanup', () => {
  const r = scorePersonalDecision({
    profile: 'landlord',
    property: {
      id: 10,
      price: 200000,
      city: 'Leeds',
      zip_code: 'LS1 1AA',
      bedrooms: 2,
      property_type: 'Terraced',
      monthly_rent: 1200,
    },
    preferences: {},
    intelligence: {
      confidence: { level: 'High', assessed: true },
      rentIntel: {
        success: true,
        currentRent: 1200,
        recommendedRent: 1200,
        marketRange: { low: 1100, high: 1300 },
        comparables: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }],
      },
      risks: [],
    },
    finance: {
      expectedRent: 1200,
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
    },
    asOf: '2026-06-01T00:00:00.000Z',
  });
  assert.strictEqual(r.available, true);
  assert.ok(r.score >= 80);
  assert.strictEqual(r.outcome, 'strong_fit');
  assert.strictEqual(r.dimensions.demand.available, false);
  assert.strictEqual(r.dimensions.demand.state, 'no_demand_data_source');
  assert.ok(r.dimensions.grossYield.available);
  assert.ok(r.dimensions.netOperating.available);
});

test('landlord without ground rent leaves net operating notAssessed', () => {
  const r = scorePersonalDecision({
    profile: 'landlord',
    property: {
      id: 10,
      price: 200000,
      city: 'Leeds',
      zip_code: 'LS1 1AA',
      bedrooms: 2,
      property_type: 'Terraced',
      monthly_rent: 1200,
    },
    preferences: {},
    intelligence: {
      confidence: { level: 'High', assessed: true },
      rentIntel: {
        success: true,
        currentRent: 1200,
        recommendedRent: 1200,
        marketRange: { low: 1100, high: 1300 },
        comparables: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }],
      },
      risks: [],
    },
    finance: {
      expectedRent: 1200,
      deposit: 50000,
      interestRate: 4.5,
      mortgageTermYears: 25,
      vacancyAssumption: 5,
      maintenance: 1200,
      insurance: 600,
      managementFee: 0,
      serviceCharge: 0,
      taxes: 0,
    },
    asOf: '2026-06-01T00:00:00.000Z',
  });
  assert.strictEqual(r.available, true);
  assert.ok(r.dimensions.grossYield.available, 'gross yield does not require ground rent');
  assert.strictEqual(r.dimensions.netOperating.available, false);
  assert.strictEqual(r.dimensions.netOperating.state, 'costs_not_supplied');
  assert.strictEqual(r.dimensions.demand.state, 'no_demand_data_source');
});

test('gross yield still calculates when operating costs are incomplete', () => {
  const metrics = calculateInvestmentMetrics({
    purchasePrice: 200000,
    expectedRent: 1000,
  });
  assert.strictEqual(metrics.grossYield, 6);
  const inv = calculateInvestmentScore(metrics);
  assert.ok(inv.componentDetail.yield.available);
});

console.log('\nAll dataIntegrity tests passed.');
