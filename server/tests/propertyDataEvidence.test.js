/**
 * PropertyData existing-payload utilisation proofs.
 * Run: node server/tests/propertyDataEvidence.test.js
 */

const assert = require('assert');
const {
  parseUprnProfile,
  parseUprnSaleEstimate,
  parseValuationSaleResponse,
  parseSoldPricesStats,
} = require('../services/providers/propertyData/propertyDataParsers');
const { applyPropertyDataEvidence } = require('../services/providers/propertyData/propertyDataEvidence');
const { mapToPropertyDataType, mapConstructionDate } = require('../services/providers/propertyData/propertyTypeMapping');
const { transactionSoldDate } = require('../services/ai/comparableEngine');
const { scorePersonalDecision } = require('../services/ai/personalDecisionEngine');

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    console.error(`✗ ${name}`);
    throw e;
  }
}

test('missing PropertyData fields remain notAssessed/null', () => {
  const parsed = parseUprnProfile({});
  assert.strictEqual(parsed.propertyType, null);
  assert.strictEqual(parsed.yearBuilt, null);
  assert.strictEqual(parsed.epcRating, null);
  assert.strictEqual(parsed.tenure, null);
  assert.strictEqual(parsed.lastSoldPrice, null);
  assert.strictEqual(parsed.lastSoldDate, null);
  assert.strictEqual(parsed.internalArea, null);
  assert.strictEqual(parsed.bedrooms, null);

  const unmatched = applyPropertyDataEvidence(
    { id: 1, title: 'Empty listing' },
    { enrichments: { uprn_profile: { success: true, data: {} } }, identity: {} }
  );
  assert.strictEqual(unmatched.property.property_type, null);
  assert.strictEqual(unmatched.property.year_built, null);
  assert.strictEqual(unmatched.property.epc_rating, null);
  assert.strictEqual(unmatched.evidence.fields.epc_rating.value, null);
  assert.strictEqual(unmatched.evidence.identity.propertyLevelMatch, false);
  assert.strictEqual(unmatched.evidence.fields.epc_rating.state, 'unavailable');
  assert.strictEqual(unmatched.evidence.lastSold.price.available, false);

  const matchedMissing = applyPropertyDataEvidence(
    { id: 1, title: 'Empty listing', uprn: '1000001' },
    { enrichments: { uprn_profile: { success: true, data: { uprn: '1000001' } } }, identity: { uprn: '1000001' } }
  );
  assert.strictEqual(matchedMissing.evidence.fields.epc_rating.state, 'notAssessed');
  assert.strictEqual(matchedMissing.evidence.fields.epc_rating.value, null);
  assert.strictEqual(matchedMissing.evidence.fields.tenure.state, 'notAssessed');
  assert.strictEqual(matchedMissing.evidence.fields.council_tax_band.state, 'notAssessed');
});

test('unknown type is not defaulted', () => {
  const parsed = parseUprnProfile({ classification: 'office', type: 'warehouse' });
  assert.notStrictEqual(parsed.propertyType, 'flat');
  assert.strictEqual(mapToPropertyDataType(parsed.propertyType), null);

  const { property } = applyPropertyDataEvidence(
    { id: 2 },
    {
      identity: { uprn: '1000001' },
      enrichments: { uprn_profile: { success: true, data: { uprn: '1000001', property_type: 'office' } } },
    }
  );
  assert.strictEqual(property.property_type, 'office');
  assert.strictEqual(mapToPropertyDataType(property.property_type), null);
});

test('unknown build year is not inferred', () => {
  const parsed = parseUprnProfile({
    property_type: 'Terraced',
    construction_date: '1914_2000',
    style: 'Victorian',
  });
  assert.strictEqual(parsed.yearBuilt, null);
  assert.notStrictEqual(mapConstructionDate(parsed.yearBuilt), '1914_2000');

  const { property } = applyPropertyDataEvidence(
    { id: 3, property_type: 'Terraced' },
    { enrichments: { uprn_profile: { success: true, data: { construction_date: 'pre_1914' } } } }
  );
  assert.strictEqual(property.year_built, null);
});

test('updated_at and created_at are not transaction dates', () => {
  const stamp = '2026-08-01T00:00:00.000Z';
  const { property, evidence } = applyPropertyDataEvidence(
    { id: 4, created_at: stamp, updated_at: stamp, price: 400000 },
    { enrichments: { uprn_profile: { success: true, data: {} } } }
  );
  assert.strictEqual(property.last_sold_date, null);
  assert.strictEqual(property.sold_date, undefined);
  assert.strictEqual(transactionSoldDate(property), null);
  assert.strictEqual(evidence.lastSold.date.value, null);
  assert.notStrictEqual(property.last_sold_date, stamp);
});

test('genuine sold dates and prices are preserved', () => {
  const { property, evidence } = applyPropertyDataEvidence(
    { id: 5, created_at: '2026-01-01', updated_at: '2026-08-01' },
    {
      enrichments: {
        uprn_profile: {
          success: true,
          data: { uprn: '1000005', last_sold_amount: 275000, last_sold_date: '2021-11-15' },
        },
      },
    }
  );
  assert.strictEqual(property.last_sold_price, 275000);
  assert.strictEqual(property.last_sold_date, '2021-11-15');
  assert.strictEqual(property.sold_date, '2021-11-15');
  assert.strictEqual(transactionSoldDate(property), '2021-11-15');
  assert.strictEqual(evidence.lastSold.price.value, 275000);
  assert.strictEqual(evidence.lastSold.date.provenance.source, 'PropertyData');
});

test('existing UPRN evidence is preserved', () => {
  const { property, evidence } = applyPropertyDataEvidence(
    { id: 6, uprn: '100012345678' },
    { enrichments: { uprn_profile: { success: true, data: { uprn: '999' } } }, identity: { uprn: '888' } }
  );
  assert.strictEqual(property.uprn, '100012345678');
  assert.strictEqual(evidence.identity.listingId, 6);
  assert.strictEqual(evidence.identity.uprn, '100012345678');
  assert.strictEqual(evidence.identity.listingIdRemainsCanonicalForListings, true);
});

test('provenance identifies PropertyData correctly', () => {
  const { evidence } = applyPropertyDataEvidence(
    { id: 7 },
    {
      enrichments: {
        uprn_profile: {
          success: true,
          data: { uprn: '1000007', epc_rating: 'C', tenure: 'Owner-occupied', internal_area: 900 },
          provenance: { retrievedAt: '2026-08-01T12:00:00.000Z' },
        },
      },
    }
  );
  assert.strictEqual(evidence.source, 'PropertyData');
  assert.strictEqual(evidence.fields.epc_rating.provenance.source, 'PropertyData');
  assert.strictEqual(evidence.fields.tenure.provenance.providerEndpoint, '/uprn');
  assert.strictEqual(evidence.fields.square_feet.value, 900);
});

test('weaker PropertyData evidence does not overwrite stronger listing evidence', () => {
  const { property, evidence } = applyPropertyDataEvidence(
    {
      id: 8,
      property_type: 'Terraced',
      epc_rating: 'B',
      bedrooms: 3,
      square_feet: 1100,
      year_built: 1935,
      tenure: 'Leasehold',
      achieved_price: 340000,
      sold_date: '2024-02-01',
    },
    {
      enrichments: {
        uprn_profile: {
          success: true,
          data: {
            property_type: 'flat',
            epc_rating: 'D',
            bedrooms: 2,
            internal_area: 700,
            year_built: 1990,
            tenure: 'Freehold',
            last_sold_amount: 200000,
            last_sold_date: '2010-01-01',
            uprn: '1000008',
          },
        },
      },
    }
  );
  assert.strictEqual(property.property_type, 'Terraced');
  assert.strictEqual(property.epc_rating, 'B');
  assert.strictEqual(property.bedrooms, 3);
  assert.strictEqual(property.square_feet, 1100);
  assert.strictEqual(property.year_built, 1935);
  assert.strictEqual(property.tenure, 'Leasehold');
  assert.strictEqual(property.last_sold_price, 340000);
  assert.strictEqual(property.last_sold_date, '2024-02-01');
  assert.strictEqual(evidence.fields.epc_rating.source, 'InternalListing');
  assert.ok(/did not overwrite/i.test(evidence.fields.property_type.provenance.notes));
});

test('UPRN last sold is kept even when there is no current sale estimate', () => {
  const estimate = parseUprnSaleEstimate({ last_sold_amount: 199000, last_sold_date: '2019-06-01' });
  assert.strictEqual(estimate, null);
  const profile = parseUprnProfile({ last_sold_amount: 199000, last_sold_date: '2019-06-01' });
  assert.strictEqual(profile.currentSaleEstimate, null);
  assert.strictEqual(profile.lastSoldPrice, 199000);
  assert.strictEqual(profile.lastSoldDate, '2019-06-01');
});

test('sold-price ranges are not fabricated when 80pc bounds are missing', () => {
  const parsed = parseSoldPricesStats({ data: { average: 400000, points: 18 } });
  assert.strictEqual(parsed.average, 400000);
  assert.strictEqual(parsed.range.low, null);
  assert.strictEqual(parsed.range.high, null);
  assert.notStrictEqual(parsed.range.low, Math.round(400000 * 0.85));
});

test('AVM confidence is not invented when absent', () => {
  const parsed = parseValuationSaleResponse({ result: { estimate: 250000, margin: 10000 } });
  assert.strictEqual(parsed.confidence, null);
  assert.strictEqual(parsed.lowerEstimate, 240000);
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

test('landlord remains unchanged', () => {
  const landlord = scorePersonalDecision({
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
  assert.strictEqual(landlord.available, true);
  assert.ok(landlord.score >= 80);
  assert.strictEqual(landlord.outcome, 'strong_fit');
  assert.strictEqual(landlord.dimensions.demand.state, 'no_demand_data_source');
});

console.log('\nAll propertyDataEvidence tests passed.');
