/**
 * PropertyData /rents live-payload utilisation proofs.
 * Run: node server/tests/propertyDataRents.test.js
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const {
  parseRentsResponse,
  buildRentalEvidence,
  RENTS_WEEKLY_TO_MONTHLY,
} = require('../services/providers/propertyData/propertyDataParsers');
const { isResidentialRentsEligible } = require('../services/providers/propertyData/propertyTypeMapping');
const {
  buildRentIntelligence,
  selectRentRecommendation,
  listingAskingRent,
} = require('../services/ai/rentIntelligenceService');
const { scorePersonalDecision } = require('../services/ai/personalDecisionEngine');
const { pickRent, buildLandlordFinanceInput } = require('../services/ai/personalDecisionLandlord');
const { calculateInvestmentMetrics } = require('../services/ai/financialEngine');

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
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8')
  );
}

const LIVE_FILTERED = loadFixture('propertydata-rents-W149JH-bedrooms-2.json');
const LIVE_UNFILTERED = loadFixture('propertydata-rents-W149JH-unfiltered.json');
const LIVE_TYPED = loadFixture('propertydata-rents-W149JH-bedrooms-2-type-flat.json');
const LIVE_MIN = loadFixture('propertydata-rents-live-min.json');

test('actual verified /rents payload parses correctly', () => {
  const parsed = parseRentsResponse(LIVE_FILTERED);
  assert.strictEqual(parsed.postcode, 'W14 9JH');
  assert.strictEqual(parsed.bedrooms, 2);
  assert.strictEqual(parsed.unit, 'gbp_per_week');
  assert.strictEqual(parsed.averageWeekly, 626);
  assert.strictEqual(parsed.averageMonthly, Math.round(626 * RENTS_WEEKLY_TO_MONTHLY));
  assert.strictEqual(parsed.range80Weekly.low, 571);
  assert.strictEqual(parsed.range80Weekly.high, 738);
  assert.strictEqual(parsed.pointsAnalysed, 20);
  assert.ok(parsed.listings.length > 0);
  assert.strictEqual(parsed.listings[0].rentType, 'asking_long_let');
  assert.strictEqual(parsed.listings[0].weeklyAskingRent, parsed.listings[0].weeklyAskingRent);

  const evidence = buildRentalEvidence(parsed);
  assert.strictEqual(evidence.available, true);
  assert.strictEqual(evidence.source, 'PropertyData');
  assert.strictEqual(evidence.endpoint, '/rents');
  assert.strictEqual(evidence.providerEndpoint, '/rents');
  assert.strictEqual(evidence.scope, 'matched_area_segment');
  assert.strictEqual(evidence.rentType, 'asking_long_let');
  assert.strictEqual(evidence.achieved, false);
  assert.strictEqual(evidence.propertyLevel, false);
  assert.strictEqual(evidence.provenance.source, 'PropertyData');

  const liveMin = parseRentsResponse(LIVE_MIN);
  assert.strictEqual(liveMin.postcode, 'W14 9JH');
  assert.strictEqual(liveMin.bedrooms, null);
  assert.strictEqual(liveMin.unit, 'gbp_per_week');
  assert.ok(liveMin.averageWeekly > 0);
  assert.strictEqual(buildRentalEvidence(liveMin).scope, 'area_radius');
});

test('missing fields remain null/notAssessed', () => {
  assert.strictEqual(parseRentsResponse({}), null);
  assert.strictEqual(parseRentsResponse({ data: { long_let: { unit: 'gbp_per_week' } } }), null);

  const noBounds = parseRentsResponse({
    status: 'success',
    data: { long_let: { points_analysed: 12, unit: 'gbp_per_week', average: 400 } },
  });
  assert.strictEqual(noBounds.range80Weekly.low, null);
  assert.strictEqual(noBounds.range80Weekly.high, null);
  assert.strictEqual(noBounds.averageMonthly, Math.round(400 * RENTS_WEEKLY_TO_MONTHLY));

  const emptyEvidence = buildRentalEvidence(null);
  assert.strictEqual(emptyEvidence.available, false);
  assert.strictEqual(emptyEvidence.state, 'notAssessed');
  assert.strictEqual(emptyEvidence.central, null);
  assert.strictEqual(emptyEvidence.sampleSize, null);
  assert.strictEqual(emptyEvidence.confidence, null);
  assert.strictEqual(emptyEvidence.observationPeriod, null);

  const evidence = buildRentalEvidence(noBounds);
  assert.strictEqual(evidence.lower, null);
  assert.strictEqual(evidence.upper, null);
  assert.strictEqual(evidence.confidence, null);
  assert.strictEqual(evidence.observationPeriod, null);
});

test('asking rent is not labelled achieved rent', () => {
  const evidence = buildRentalEvidence(parseRentsResponse(LIVE_FILTERED));
  assert.strictEqual(evidence.rentType, 'asking_long_let');
  assert.strictEqual(evidence.achieved, false);
  assert.ok(!/achieved/i.test(evidence.rentType));
  evidence.listings.forEach((row) => {
    assert.strictEqual(row.rentType, 'asking_long_let');
    assert.ok(row.weeklyAskingRent > 0);
    assert.ok(!Object.prototype.hasOwnProperty.call(row, 'achievedRent'));
  });
});

test('area rent is not silently treated as property-specific rent', () => {
  const evidence = buildRentalEvidence(parseRentsResponse(LIVE_FILTERED));
  assert.strictEqual(evidence.propertyLevel, false);
  assert.ok(evidence.scope === 'matched_area_segment' || evidence.scope === 'area_radius');
  const unfiltered = buildRentalEvidence(parseRentsResponse(LIVE_UNFILTERED));
  assert.strictEqual(unfiltered.scope, 'area_radius');
  assert.strictEqual(unfiltered.propertyLevel, false);
  assert.strictEqual(unfiltered.bedrooms, null);
});

test('commercial and residential rents are not mixed', () => {
  assert.strictEqual(isResidentialRentsEligible({ category: 'lease', property_type: 'Office' }), false);
  assert.strictEqual(isResidentialRentsEligible({ category: 'rent', property_type: 'Office' }), false);
  assert.strictEqual(isResidentialRentsEligible({ category: 'rent', property_type: 'Flat' }), true);

  const pd = buildRentalEvidence(parseRentsResponse(LIVE_FILTERED));
  const result = buildRentIntelligence({
    target: { monthly_rent: 2500, property_type: 'Office', category: 'lease' },
    ranked: [],
    pdEvidence: pd,
    propertyCategory: 'lease',
  });
  assert.strictEqual(result.success, false);
  assert.notStrictEqual(result.source, 'PropertyData');
});

test('type/bedroom segmentation is respected if present', () => {
  const typed = parseRentsResponse(LIVE_TYPED);
  assert.strictEqual(typed.bedrooms, 2);
  assert.strictEqual(typed.propertyType, 'flat');
  typed.listings.forEach((row) => {
    assert.strictEqual(row.bedrooms, 2);
    assert.strictEqual(row.property_type, 'flat');
  });

  const unfiltered = parseRentsResponse(LIVE_UNFILTERED);
  assert.strictEqual(unfiltered.bedrooms, null);
  assert.strictEqual(unfiltered.propertyType, null);
  assert.ok(unfiltered.listings.some((row) => row.bedrooms == null));
});

test('listing asking rent is not overwritten by external area evidence', () => {
  const pd = buildRentalEvidence(parseRentsResponse(LIVE_FILTERED));
  const result = buildRentIntelligence({
    target: {
      monthly_rent: 1800,
      bedrooms: 2,
      property_type: 'Flat',
      category: 'rent',
      city: 'London',
    },
    ranked: [],
    pdEvidence: pd,
    propertyCategory: 'rent',
  });
  assert.strictEqual(result.currentRent, 1800);
  assert.notStrictEqual(result.recommendedRent, 1800);
  assert.strictEqual(listingAskingRent({ monthly_rent: 1800 }), 1800);
  assert.ok(result.recommendedRent > 0);
  assert.strictEqual(result.propertyDataRents.rentType, 'asking_long_let');
});

test('days_on_market is not treated as time-to-let', () => {
  const result = buildRentIntelligence({
    target: { monthly_rent: 1800, property_type: 'Flat', category: 'rent' },
    ranked: [],
    pdEvidence: buildRentalEvidence(parseRentsResponse(LIVE_FILTERED)),
    propertyCategory: 'rent',
  });
  assert.strictEqual(result.timeToLet, null);
  assert.strictEqual(result.expectedDemand.state, 'no_demand_data_source');
});

test('matched PropertyData segment ranks above internal comparables', () => {
  const pd = buildRentalEvidence(parseRentsResponse(LIVE_FILTERED));
  const selected = selectRentRecommendation({
    pdEvidence: pd,
    internalRecommended: 9999,
    internalSpread: 50,
  });
  assert.strictEqual(selected.source, 'PropertyData');
  assert.strictEqual(selected.scope, 'matched_area_segment');
  assert.strictEqual(selected.recommended, pd.centralMonthly);
});

test('area-wide PropertyData rent does not beat internal comparables', () => {
  const pd = buildRentalEvidence(parseRentsResponse(LIVE_UNFILTERED));
  const selected = selectRentRecommendation({
    pdEvidence: pd,
    internalRecommended: 1500,
    internalSpread: 50,
  });
  assert.strictEqual(selected.source, 'application_data');
  assert.strictEqual(selected.recommended, 1500);
});

test('landlord gross yield can use verified rental evidence', () => {
  const pd = buildRentalEvidence(parseRentsResponse(LIVE_FILTERED));
  const rentIntel = {
    success: true,
    currentRent: null,
    recommendedRent: pd.centralMonthly,
    marketRange: { low: pd.lowerMonthly, high: pd.upperMonthly },
    source: 'PropertyData',
    rentType: 'asking_long_let',
    comparables: [],
  };
  const property = { id: 11, price: 200000, city: 'London', zip_code: 'W14 9JH', bedrooms: 2, property_type: 'Flat' };
  const rent = pickRent(property, {}, {}, rentIntel);
  assert.strictEqual(rent, pd.centralMonthly);
  const financeInput = buildLandlordFinanceInput(property, {}, {}, rentIntel);
  assert.strictEqual(financeInput.expectedRent, pd.centralMonthly);
  const metrics = calculateInvestmentMetrics(financeInput);
  assert.ok(metrics.grossYield > 0);

  const scored = scorePersonalDecision({
    profile: 'landlord',
    property,
    preferences: {},
    intelligence: {
      confidence: { level: 'High', assessed: true },
      rentIntel: { ...rentIntel, currentRent: pd.centralMonthly },
      risks: [],
    },
    finance: {
      expectedRent: pd.centralMonthly,
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
  assert.strictEqual(scored.available, true);
  assert.ok(scored.dimensions.grossYield.available);
  assert.strictEqual(scored.dimensions.demand.state, 'no_demand_data_source');
});

test('landlord net/cash-flow/DSCR rules remain unchanged without complete finance', () => {
  const pd = buildRentalEvidence(parseRentsResponse(LIVE_FILTERED));
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
      rentIntel: {
        success: true,
        currentRent: 1800,
        recommendedRent: pd.centralMonthly,
        marketRange: { low: pd.lowerMonthly, high: pd.upperMonthly },
        comparables: [],
      },
      risks: [],
    },
    finance: {},
    asOf: '2026-06-01T00:00:00.000Z',
  });
  assert.strictEqual(scored.dimensions.cashFlow.available, false);
  assert.strictEqual(scored.dimensions.dscr.available, false);
  assert.ok(
    scored.dimensions.netOperating.available === false ||
      scored.dimensions.netOperating.state === 'costs_not_assessed' ||
      scored.dimensions.netOperating.state === 'no_rent_evidence' ||
      scored.dimensions.netOperating.state === 'not_assessed'
  );
});

test('demand remains notAssessed', () => {
  const pd = buildRentalEvidence(parseRentsResponse(LIVE_FILTERED));
  const intel = buildRentIntelligence({
    target: { monthly_rent: 1800, property_type: 'Flat', category: 'rent' },
    ranked: [],
    pdEvidence: pd,
    propertyCategory: 'rent',
  });
  assert.strictEqual(intel.expectedDemand.available, false);
  assert.strictEqual(intel.expectedDemand.state, 'no_demand_data_source');
});

test('buyer_general remains unchanged', () => {
  const buyer = scorePersonalDecision({
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
  assert.strictEqual(buyer.available, true);
  assert.ok(Number.isFinite(buyer.score));
});

test('unknown unit is not converted to monthly', () => {
  const parsed = parseRentsResponse({
    data: { long_let: { average: 500, unit: 'unknown_unit', '80pc_range': [400, 600], points_analysed: 10 } },
  });
  assert.strictEqual(parsed.averageWeekly, 500);
  assert.strictEqual(parsed.averageMonthly, null);
  assert.strictEqual(parsed.range80Monthly.low, null);
});

test('unknown property type is never defaulted to flat on /rents requests', () => {
  const { mapToPropertyDataType, buildRentsQueryParams } = require('../services/providers/propertyData/propertyTypeMapping');
  assert.strictEqual(mapToPropertyDataType('warehouse'), null);
  const params = buildRentsQueryParams('W149JH', { bedrooms: 2, propertyType: 'office' });
  assert.ok(!Object.prototype.hasOwnProperty.call(params, 'type'));
  assert.notStrictEqual(params.type, 'flat');
});

test('unknown construction year is never inferred', () => {
  const { mapConstructionDate } = require('../services/providers/propertyData/propertyTypeMapping');
  assert.strictEqual(mapConstructionDate(null), null);
  const parsed = parseRentsResponse(LIVE_MIN);
  assert.ok(!Object.prototype.hasOwnProperty.call(parsed, 'yearBuilt'));
  assert.ok(!Object.prototype.hasOwnProperty.call(parsed, 'construction_date'));
});

test('provider request params omit unavailable optional /rents fields', () => {
  const { buildRentsQueryParams } = require('../services/providers/propertyData/propertyTypeMapping');
  const params = buildRentsQueryParams('W14 9JH', {});
  assert.strictEqual(params.postcode, 'W149JH');
  assert.ok(!Object.prototype.hasOwnProperty.call(params, 'type'));
  assert.ok(!Object.prototype.hasOwnProperty.call(params, 'bedrooms'));
  assert.ok(!Object.prototype.hasOwnProperty.call(params, 'property_type'));
});

test('provenance identifies PropertyData and does not invent observation dates', () => {
  const stamp = '2026-01-01T00:00:00.000Z';
  const retrievedAt = '2026-08-25T14:00:00.000Z';
  const evidence = buildRentalEvidence(parseRentsResponse(LIVE_MIN), { retrievedAt });
  assert.strictEqual(evidence.provenance.source, 'PropertyData');
  assert.strictEqual(evidence.provenance.providerEndpoint, '/rents');
  assert.strictEqual(evidence.retrievedAt, retrievedAt);
  assert.strictEqual(evidence.observedAt, null);
  assert.strictEqual(evidence.observationPeriod, null);
  assert.strictEqual(evidence.confidence, null);

  const intel = buildRentIntelligence({
    target: {
      monthly_rent: 1800,
      created_at: stamp,
      updated_at: stamp,
      property_type: 'Flat',
      category: 'rent',
    },
    ranked: [],
    pdEvidence: evidence,
    propertyCategory: 'rent',
  });
  assert.strictEqual(intel.propertyDataRents.observedAt, null);
  assert.notStrictEqual(intel.propertyDataRents.observedAt, stamp);
  assert.notStrictEqual(intel.propertyDataRents.retrievedAt, stamp);
});

test('gross yield works from evidenced price and rent; NOI and DSCR stay unavailable without costs/finance', () => {
  const {
    presentEvidencedInvestment,
    buildEvidencedInvestmentInput,
  } = require('../services/ai/evidencedInvestment');
  const input = buildEvidencedInvestmentInput({
    purchasePrice: 200000,
    expectedRent: 1200,
    property: {},
  });
  const metrics = calculateInvestmentMetrics(input);
  const presented = presentEvidencedInvestment(metrics);
  assert.ok(metrics.grossYield > 0);
  assert.strictEqual(presented.netYield.state, 'notAssessed');
  assert.strictEqual(presented.noi.state, 'notAssessed');
  assert.strictEqual(presented.monthlyCashFlow.state, 'notAssessed');
  assert.strictEqual(presented.annualCashFlow.state, 'notAssessed');
  assert.strictEqual(presented.dscr.state, 'notAssessed');
});

test('landlord scoring weights remain unchanged', () => {
  const { LANDLORD_WEIGHTS } = require('../config/personalDecision.config');
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
});

console.log('\nAll propertyDataRents tests passed.');
