/**
 * Unsafe-defaults cleanup proofs.
 * Run: node server/tests/unsafeDefaults.test.js
 */

const assert = require('assert');
const {
  mapToPropertyDataType,
  mapConstructionDate,
  describeTypeMapping,
  describeConstructionMapping,
  omitAbsentProviderParams,
  buildSoldPriceFilters,
  buildSoldPricesQueryParams,
  buildRentsQueryParams,
  isResidentialRentsEligible,
  buildValuationSaleRequest,
  buildValuationSaleParams,
} = require('../services/providers/propertyData/propertyTypeMapping');
const {
  buildEvidencedInvestmentInput,
  presentEvidencedInvestment,
  evidencedValue,
} = require('../services/ai/evidencedInvestment');
const { calculateInvestmentMetrics } = require('../services/ai/financialEngine');
const { buildInvestmentInput } = require('../services/ai/propertyIntelligenceEngine');
const { analysePortfolioProperty } = require('../services/ai/portfolioOptimiserService');
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

function assertOmitted(obj, key) {
  assert.ok(obj && typeof obj === 'object', 'expected an object');
  assert.ok(!Object.prototype.hasOwnProperty.call(obj, key), `${key} should be omitted`);
  const json = JSON.stringify(obj);
  assert.ok(!json.includes(`"${key}":null`), `${key} must not be serialized as null`);
  assert.ok(!json.includes(`"${key}":""`), `${key} must not be serialized as empty string`);
}

test('unmapped property type is never sent as flat', () => {
  assert.strictEqual(mapToPropertyDataType(null), null);
  assert.strictEqual(mapToPropertyDataType(''), null);
  assert.strictEqual(mapToPropertyDataType('office'), null);
  assert.strictEqual(mapToPropertyDataType('unknown'), null);
  assert.strictEqual(mapToPropertyDataType('warehouse'), null);
  assert.notStrictEqual(mapToPropertyDataType('office'), 'flat');

  const mapped = describeTypeMapping('commercial');
  assert.strictEqual(mapped.available, false);
  assert.strictEqual(mapped.value, null);
  assert.strictEqual(mapped.state, 'notAssessed');
  assert.ok(/not defaulted to flat/i.test(mapped.provenance.notes));

  const filters = buildSoldPriceFilters({ bedrooms: 2, property_type: 'office' });
  assertOmitted(filters, 'propertyType');
  assert.notStrictEqual(filters.propertyType, 'flat');

  const avm = buildValuationSaleRequest({
    zip_code: 'LS1 1AA',
    square_feet: 800,
    property_type: 'office',
  });
  assert.strictEqual(avm.canRequestAvm, false);
  assert.strictEqual(avm.params, null);
  assert.strictEqual(buildValuationSaleParams({ zip_code: 'LS1 1AA', square_feet: 800, property_type: 'office' }), null);
});

test('sold-price params omit unknown type instead of sending null or empty', () => {
  const fromListing = buildSoldPricesQueryParams('LS1 1AA', buildSoldPriceFilters({
    bedrooms: 2,
    property_type: 'office',
  }));
  assert.deepStrictEqual(Object.keys(fromListing).sort(), ['bedrooms', 'postcode']);
  assertOmitted(fromListing, 'property_type');
  assert.notStrictEqual(fromListing.property_type, 'flat');

  for (const raw of [null, '', 'office', 'unknown', 'warehouse']) {
    const params = buildSoldPricesQueryParams('LS1 1AA', { bedrooms: 2, propertyType: raw });
    assertOmitted(params, 'property_type');
    assert.strictEqual(params.bedrooms, 2);
    assert.ok(!JSON.stringify(params).includes('property_type'));
  }

  const alreadyMapped = buildSoldPricesQueryParams('LS1 1AA', { propertyType: 'terraced_house' });
  assert.strictEqual(alreadyMapped.property_type, 'terraced_house');

  for (const raw of [null, '', 'office', 'unknown', 'warehouse']) {
    const rentParams = buildRentsQueryParams('LS1 1AA', { bedrooms: 2, propertyType: raw });
    assertOmitted(rentParams, 'type');
    assertOmitted(rentParams, 'property_type');
    assert.strictEqual(rentParams.bedrooms, 2);
  }
  const rentMapped = buildRentsQueryParams('W149JH', { bedrooms: 2, propertyType: 'flat' });
  assert.strictEqual(rentMapped.type, 'flat');
  assertOmitted(rentMapped, 'property_type');
  assert.strictEqual(isResidentialRentsEligible({ category: 'lease', property_type: 'Office' }), false);
  assert.strictEqual(isResidentialRentsEligible({ category: 'rent', property_type: 'Flat' }), true);

  const cleaned = omitAbsentProviderParams({
    postcode: 'LS11AA',
    property_type: null,
    construction_date: '',
    bedrooms: 2,
  });
  assertOmitted(cleaned, 'property_type');
  assertOmitted(cleaned, 'construction_date');
  assert.strictEqual(cleaned.bedrooms, 2);
});

test('known listing types still map, including flat as a real type', () => {
  assert.strictEqual(mapToPropertyDataType('Flat'), 'flat');
  assert.strictEqual(mapToPropertyDataType('Terraced'), 'terraced_house');
  assert.strictEqual(mapToPropertyDataType('terraced_house'), 'terraced_house');
  const filters = buildSoldPriceFilters({ property_type: 'Apartment', bedrooms: 2 });
  assert.strictEqual(filters.propertyType, 'flat');
  const params = buildSoldPricesQueryParams('M1 1AA', filters);
  assert.strictEqual(params.property_type, 'flat');
  assert.strictEqual(params.postcode, 'M11AA');
});

test('missing build year never produces 1914_2000', () => {
  assert.strictEqual(mapConstructionDate(null), null);
  assert.strictEqual(mapConstructionDate(''), null);
  assert.strictEqual(mapConstructionDate(0), null);
  assert.strictEqual(mapConstructionDate('unknown'), null);
  assert.notStrictEqual(mapConstructionDate(null), '1914_2000');

  const described = describeConstructionMapping(null);
  assert.strictEqual(described.available, false);
  assert.ok(/1914_2000/.test(described.provenance.notes));
  assert.ok(/not inferred/i.test(described.provenance.notes));
});

test('known build year still maps to a band, including 1914_2000 when year is known', () => {
  assert.strictEqual(mapConstructionDate(1950), '1914_2000');
  assert.strictEqual(mapConstructionDate(1900), 'pre_1914');
  assert.strictEqual(mapConstructionDate(2010), '2000_onwards');
});

test('PropertyData request params omit unavailable optional fields', () => {
  const missingYear = buildValuationSaleRequest({
    zip_code: 'M1 1AA',
    square_feet: 900,
    property_type: 'Terraced',
  });
  assert.strictEqual(missingYear.canRequestAvm, true);
  assert.strictEqual(missingYear.params.property_type, 'terraced_house');
  assertOmitted(missingYear.params, 'construction_date');
  assert.ok(!JSON.stringify(missingYear.params).includes('1914_2000'));
  assert.strictEqual(missingYear.unavailable.construction_date.state, 'notAssessed');

  const missingType = buildValuationSaleRequest({
    zip_code: 'M1 1AA',
    square_feet: 900,
    year_built: 1990,
  });
  assert.strictEqual(missingType.params, null);
  assert.strictEqual(missingType.canRequestAvm, false);
  assert.strictEqual(missingType.construction.value, '1914_2000');
  assert.strictEqual(missingType.unavailable.property_type.state, 'notAssessed');
  assert.strictEqual(buildValuationSaleParams({ zip_code: 'M1 1AA', square_feet: 900 }), null);
});

test('gross yield still works with price + rent only', () => {
  const input = buildEvidencedInvestmentInput({ purchasePrice: 200000, expectedRent: 1000 });
  assert.ok(!Object.prototype.hasOwnProperty.call(input, 'deposit'));
  assert.ok(!Object.prototype.hasOwnProperty.call(input, 'interestRate'));
  assert.ok(!Object.prototype.hasOwnProperty.call(input, 'vacancyAssumption'));
  assert.ok(!Object.prototype.hasOwnProperty.call(input, 'maintenance'));
  assert.ok(!Object.prototype.hasOwnProperty.call(input, 'insurance'));
  assert.ok(!Object.prototype.hasOwnProperty.call(input, 'mortgageTermYears'));

  const metrics = calculateInvestmentMetrics(input);
  assert.strictEqual(metrics.grossYield, 6);
  const presented = presentEvidencedInvestment(metrics);
  assert.strictEqual(presented.grossYield.available, true);
  assert.strictEqual(presented.grossYield.value, 6);

  const fromEngine = buildInvestmentInput({ price: 200000 }, 1000, {});
  assert.deepStrictEqual(fromEngine, { purchasePrice: 200000, expectedRent: 1000 });
});

test('net yield and NOI are unavailable without operating costs', () => {
  const metrics = calculateInvestmentMetrics(
    buildEvidencedInvestmentInput({ purchasePrice: 200000, expectedRent: 1000 })
  );
  const presented = presentEvidencedInvestment(metrics);
  assert.strictEqual(presented.netYield.available, false);
  assert.strictEqual(presented.netYield.value, null);
  assert.strictEqual(presented.netYield.state, 'notAssessed');
  assert.strictEqual(presented.noi.available, false);
  assert.strictEqual(presented.noi.value, null);
  assert.strictEqual(evidencedValue(presented.noi), null);

  const withCosts = calculateInvestmentMetrics(
    buildEvidencedInvestmentInput({
      purchasePrice: 200000,
      expectedRent: 1000,
      options: {
        maintenance: 1200,
        insurance: 600,
        managementFee: 0,
        serviceCharge: 0,
        groundRent: 0,
        taxes: 0,
        vacancyAssumption: 0,
      },
    })
  );
  const assessed = presentEvidencedInvestment(withCosts);
  assert.strictEqual(assessed.noi.available, true);
  assert.strictEqual(assessed.netYield.available, true);
});

test('mortgage cash flow and DSCR are unavailable without complete finance inputs', () => {
  const costsOnly = calculateInvestmentMetrics(
    buildEvidencedInvestmentInput({
      purchasePrice: 200000,
      expectedRent: 1000,
      options: {
        maintenance: 1200,
        insurance: 600,
        managementFee: 0,
        serviceCharge: 0,
        groundRent: 0,
        taxes: 0,
        vacancyAssumption: 0,
      },
    })
  );
  const withoutFinance = presentEvidencedInvestment(costsOnly);
  assert.strictEqual(withoutFinance.annualCashFlow.available, false);
  assert.strictEqual(withoutFinance.dscr.available, false);
  assert.strictEqual(withoutFinance.dscr.state, 'notAssessed');

  const complete = calculateInvestmentMetrics(
    buildEvidencedInvestmentInput({
      purchasePrice: 200000,
      expectedRent: 1000,
      options: {
        deposit: 50000,
        interestRate: 4.5,
        mortgageTermYears: 25,
        maintenance: 1200,
        insurance: 600,
        managementFee: 0,
        serviceCharge: 0,
        groundRent: 0,
        taxes: 0,
        vacancyAssumption: 0,
      },
    })
  );
  const withFinance = presentEvidencedInvestment(complete);
  assert.strictEqual(withFinance.annualCashFlow.available, true);
  assert.strictEqual(withFinance.dscr.available, true);
  assert.ok(Number.isFinite(withFinance.dscr.value));
});

test('portfolio optimiser no longer invents net yield or cash flow', () => {
  const row = analysePortfolioProperty({
    id: 1,
    title: 'Test',
    price: 200000,
    monthly_rent: 1000,
    city: 'Leeds',
    category: 'sale',
    status: 'approved',
  });
  assert.strictEqual(row.grossYield, 6);
  assert.strictEqual(row.netYield, null);
  assert.strictEqual(row.annualCashFlow, null);
  assert.strictEqual(row.netYieldState, 'notAssessed');
  assert.strictEqual(row.cashFlowState, 'notAssessed');
});

test('buyer_general and landlord remain unchanged', () => {
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

console.log('\nAll unsafeDefaults tests passed.');
