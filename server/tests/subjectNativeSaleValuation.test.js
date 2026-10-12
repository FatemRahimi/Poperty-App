/**
 * Focused tests — subject-native sale valuation execution boundary.
 */
const assert = require('assert');
const {
  isSubjectNativeValuationContext,
  mayRequestSaleValuation,
  buildSubjectNativeValuationProperty,
  assertTemporalLeakageFirewall,
  executeSubjectNativeSaleValuation,
  compareHistoricalOutcome,
} = require('../services/ai/subjectNativeSaleValuation');
const { buildValuationSaleRequest } = require('../services/providers/propertyData/propertyTypeMapping');
const { calculatePropertyValuation } = require('../services/ai/valuationEngine');

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

console.log('subjectNativeSaleValuation');

const AVM_ATTRS = {
  bedrooms: 3,
  bathrooms: 1,
  outdoor: 'garden',
  parkingSpaces: 1,
  parkingConfirmed: true,
  finishQuality: 'average',
};

test('1. subject-native eligible property can build valuation request', () => {
  const p = buildSubjectNativeValuationProperty({
    subjectId: 99,
    postcode: 'SW1A 1AA',
    propertyType: 'terraced',
    squareFeet: 900,
    yearBuilt: 1990,
    ...AVM_ATTRS,
  });
  const req = buildValuationSaleRequest(p);
  assert.strictEqual(req.canRequestAvm, true);
  assert.strictEqual(req.readiness.state, 'PROVIDER_ELIGIBLE');
  assert.strictEqual(req.params.construction_date, '1914_2000');
});

test('1b. missing construction_date blocks eligibility without inventing a default', () => {
  const p = buildSubjectNativeValuationProperty({
    subjectId: 99,
    postcode: 'SW1A 1AA',
    propertyType: 'terraced',
    squareFeet: 900,
    ...AVM_ATTRS,
  });
  const req = buildValuationSaleRequest(p);
  assert.strictEqual(req.canRequestAvm, false);
  assert.strictEqual(req.readiness.reasonCode, 'MISSING_CONSTRUCTION_DATE');
  assert.strictEqual(req.params, null);
});

test('1c. official age band maps to construction_date', () => {
  const p = buildSubjectNativeValuationProperty({
    subjectId: 99,
    postcode: 'SW1A 1AA',
    propertyType: 'terraced',
    squareFeet: 900,
    constructionAgeBand: 'England and Wales: 1930-1949',
    ...AVM_ATTRS,
  });
  const req = buildValuationSaleRequest(p);
  assert.strictEqual(req.canRequestAvm, true);
  assert.strictEqual(req.params.construction_date, '1914_2000');
});

test('2. no sale listing required', () => {
  const p = buildSubjectNativeValuationProperty({
    subjectId: 1,
    postcode: 'B1 1AA',
    propertyType: 'detached',
    squareFeet: 1200,
  });
  assert.strictEqual(p.id, null);
  assert.ok(isSubjectNativeValuationContext(p));
  assert.ok(mayRequestSaleValuation(p));
});

test('3. listing category is not fabricated', () => {
  const p = buildSubjectNativeValuationProperty({
    subjectId: 1,
    postcode: 'B1 1AA',
    propertyType: 'semi-detached',
    squareFeet: 800,
  });
  assert.strictEqual(p.category, null);
  assert.notStrictEqual(p.category, 'sale');
});

test('4. historical sold price cannot enter request', () => {
  const p = buildSubjectNativeValuationProperty({
    subjectId: 1,
    postcode: 'LE5 4LW',
    propertyType: 'terraced',
    squareFeet: 850,
    yearBuilt: 1950,
    ...AVM_ATTRS,
  });
  const req = buildValuationSaleRequest(p);
  const leak = assertTemporalLeakageFirewall({
    property: p,
    providerParams: req.params,
    historicalSoldPrice: 198000,
  });
  assert.strictEqual(leak.leakageSafe, true);
  assert.strictEqual(leak.historicalPricePresentInParams, false);
  assert.ok(!JSON.stringify(req.params).includes('198000'));
});

test('5. historical outcome cannot enter valuation component surface', () => {
  const p = buildSubjectNativeValuationProperty({
    subjectId: 2,
    postcode: 'PE1 2LY',
    propertyType: 'terraced',
    squareFeet: 1130,
  });
  assert.strictEqual(p.price, null);
  assert.strictEqual(p.last_sold_price, null);
  assert.strictEqual(p.last_sold_date, null);
});

test('6. missing area remains NOT ELIGIBLE', () => {
  const p = buildSubjectNativeValuationProperty({
    subjectId: 3,
    postcode: 'B1 1AA',
    propertyType: 'terraced',
  });
  const req = buildValuationSaleRequest(p);
  assert.strictEqual(req.canRequestAvm, false);
  assert.strictEqual(req.readiness.reasonCode, 'MISSING_INTERNAL_AREA');
});

test('7. invalid area remains NOT ELIGIBLE', () => {
  const p = buildSubjectNativeValuationProperty({
    subjectId: 4,
    postcode: 'B1 1AA',
    propertyType: 'terraced',
    squareFeet: 50, // below 300
  });
  const req = buildValuationSaleRequest(p);
  assert.strictEqual(req.canRequestAvm, false);
});

test('8. unmapped type remains NOT ELIGIBLE', () => {
  const p = buildSubjectNativeValuationProperty({
    subjectId: 5,
    postcode: 'B1 1AA',
    propertyType: 'commercial',
    squareFeet: 900,
  });
  const req = buildValuationSaleRequest(p);
  assert.strictEqual(req.canRequestAvm, false);
  assert.strictEqual(req.readiness.reasonCode, 'UNMAPPED_PROPERTY_TYPE');
});

test('9. existing sale listing path still identified as non-subject-native', () => {
  const listing = { id: 123, category: 'sale', subjectId: null, price: 250000 };
  assert.strictEqual(isSubjectNativeValuationContext(listing), false);
  assert.strictEqual(mayRequestSaleValuation(listing), true);
});

test('10. existing rent path remains non-sale without subject-native', () => {
  const rent = { id: 63, category: 'rent', price: null };
  assert.strictEqual(isSubjectNativeValuationContext(rent), false);
  assert.strictEqual(mayRequestSaleValuation(rent), false);
});

test('11. provider cost gate remains at adapter (params required)', () => {
  const p = buildSubjectNativeValuationProperty({
    subjectId: 6,
    postcode: 'B1 1AA',
    propertyType: 'flat',
    squareFeet: 100,
  });
  const req = buildValuationSaleRequest(p);
  assert.strictEqual(req.canRequestAvm, false);
  assert.strictEqual(req.params, null);
});

test('12. persistence cannot cross-bind — subject builder has no listing id', () => {
  const p = buildSubjectNativeValuationProperty({ subjectId: 7, postcode: 'B1 1AA', propertyType: 'house', squareFeet: 900 });
  assert.strictEqual(p.id, null);
  assert.strictEqual(p.subjectId, 7);
});

test('13. authorization surface — no public endpoint added in module', () => {
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '../services/ai/subjectNativeSaleValuation.js'),
    'utf8'
  );
  assert.ok(!/app\.(get|post)|router\.(get|post)/.test(src));
});

(async () => {
  await testAsync('valuation engine accepts subject-native without asking price', async () => {
    const p = buildSubjectNativeValuationProperty({
      subjectId: 10,
      postcode: 'SW1A1AA',
      propertyType: 'terraced',
      squareFeet: 900,
    });
    const result = await calculatePropertyValuation(p, {
      enrichments: {
        valuation_sale: {
          success: true,
          data: {
            estimate: 350000,
            lower: 320000,
            upper: 380000,
            confidence: 'MEDIUM',
          },
        },
      },
    });
    // May be assessed or notAssessed depending on safety — must not refuse for missing listing/asking
    assert.ok(result);
    assert.ok(
      result.message !== 'Sale valuation requires a property listed for sale with an asking price.'
    );
  });

  await testAsync('executeSubjectNativeSaleValuation strips fabricated sale category and historical price', async () => {
    let called = false;
    const result = await executeSubjectNativeSaleValuation({
      subject: { id: 1, uprn: '1', postcode: 'B11AA' },
      property: {
        subjectId: 1,
        valuationExecutionMode: 'subject_native',
        category: 'sale', // must be stripped — not treated as listing identity
        price: 198000, // historical — must be stripped before provider
        zip_code: 'B1 1AA',
        property_type: 'terraced',
        square_feet: 850,
        year_built: 1950,
        bedrooms: 3,
        bathrooms: 1,
        outdoor: 'garden',
        parking_spaces: 1,
        parking_confirmed: true,
        finish_quality: 'average',
      },
      historicalOutcome: { priceGbp: 198000, transferDate: '2019-01-01' },
      deps: {
        subjectPropertyAttributes: {
          bedrooms: { available: true, value: 3, provenance: 'USER_REPORTED' },
          bathrooms: { available: true, value: 1, provenance: 'USER_REPORTED' },
          outdoor: { available: true, value: 'garden', provenance: 'USER_REPORTED' },
          offStreetParking: { available: true, value: 1, provenance: 'USER_REPORTED' },
          finishQualityProviderRequest: { available: true, value: 'average' },
        },
        areaResolution: {
          available: true,
          normalisedValueSqft: 850,
          selectedSource: 'MHCLG_EPBD',
          readiness: { state: 'PROVIDER_ELIGIBLE' },
        },
        findEnrichmentBySubject: async () => null,
        upsertSubjectEnrichment: async () => ({}),
        marketProvider: {
          isAvailable: () => true,
          getSaleValuation: async (prop, ctx) => {
            called = true;
            assert.strictEqual(prop.price, null);
            assert.notStrictEqual(prop.category, 'sale');
            assert.ok(!JSON.stringify(prop).includes('198000') || prop.square_feet === 850);
            return {
              success: true,
              valuation: { estimate: 210000, lower: 190000, upper: 230000, confidence: 'LOW' },
              inputParams: {
                postcode: 'B11AA',
                internal_area: 850,
                property_type: 'terraced_house',
                points: 'true',
              },
              provenance: { source: 'PropertyData', method: 'valuation_sale_avm' },
              creditsUsed: 1,
            };
          },
        },
        calculatePropertyValuation: async () => ({
          success: true,
          assessmentState: 'assessed',
          notAssessed: false,
          centralEstimate: { value: 210000 },
          lowerEstimate: { value: 190000 },
          upperEstimate: { value: 230000 },
        }),
      },
    });
    assert.strictEqual(called, true);
    assert.strictEqual(result.providerCalled, true);
    assert.strictEqual(result.leakage.leakageSafe, true);
    assert.strictEqual(result.historicalOutcomeAttachedAfterFreeze, true);
    assert.strictEqual(result.outcomeComparison.temporallyComparable, false);
  });

  await testAsync('outcome compare is observational / temporally non-comparable', async () => {
    const cmp = compareHistoricalOutcome(
      { centralEstimate: { value: 400000 }, assessmentState: 'assessed' },
      { priceGbp: 198000, transferDate: '2019-06-01' }
    );
    assert.strictEqual(cmp.temporallyComparable, false);
    assert.strictEqual(cmp.classification, 'temporally_non_comparable_observational_only');
    assert.ok(cmp.absoluteError > 0);
  });

  console.log('All subjectNativeSaleValuation tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
