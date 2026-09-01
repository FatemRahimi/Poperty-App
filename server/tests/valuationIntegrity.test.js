/**
 * Sale valuation integrity guard.
 * Run: node server/tests/valuationIntegrity.test.js
 */

const assert = require('assert');
const { mapHistoryRow, annotateStoredAnalysis } = require('../models/AiRequest');
const {
  weightedBlend,
  calculatePropertyValuation,
  buildSqftImpliedEstimate,
} = require('../services/ai/valuationEngine');
const {
  isFinitePositiveMoney,
  isFinitePositiveArea,
  isValidBlendEstimate,
  parsePositiveMoney,
  hasProvenancedAssessableFloorArea,
} = require('../services/ai/valuationIntegrity');
const { rankSaleComparables } = require('../services/ai/comparableEngine');

function test(name, fn) {
  const result = fn();
  if (result && typeof result.then === 'function') {
    return result.then(
      () => console.log(`✓ ${name}`),
      (e) => {
        console.error(`✗ ${name}`);
        throw e;
      }
    );
  }
  console.log(`✓ ${name}`);
  return Promise.resolve();
}

const LISTING = {
  id: 155,
  category: 'sale',
  city: 'Birmingham',
  zip_code: 'B5 5PH',
  bedrooms: 3,
  bathrooms: 3,
  property_type: 'semi-detached',
  price: 300000,
  square_feet: null,
};

function askingComp(id, price, extra = {}) {
  return {
    id,
    title: `asking-${id}`,
    city: 'Birmingham',
    zip_code: 'B1 1AA',
    bedrooms: 3,
    bathrooms: 2,
    square_feet: null,
    property_type: 'semi-detached',
    price,
    latitude: 52.48,
    longitude: -1.9,
    source: 'application_database',
    ...extra,
  };
}

function mockAskingAnalysis(comps) {
  const ranked = rankSaleComparables(LISTING, comps, 30);
  const recommended = ranked.length ? ranked[0].price : null;
  return async () => ({
    success: ranked.length > 0,
    evidenceKind: 'asking_listing',
    notTransactionEvidence: true,
    cannotSolelyAssessValuation: true,
    recommendedPrice: recommended,
    marketRange: {
      low: recommended != null ? recommended - 5000 : null,
      high: recommended != null ? recommended + 5000 : null,
      synthetic: true,
      excludedFromAssessedBlend: true,
    },
    comparables: ranked,
    comparableCount: ranked.length,
    dataQuality: { score: 40, level: 'Low' },
  });
}

function avmEnrichment(estimate, extras = {}) {
  return {
    enrichments: {
      valuation_sale: {
        success: true,
        data: { result: { estimate, confidence: 'medium' } },
      },
      ...extras,
    },
  };
}

function psfEnrichment(average = 250) {
  return {
    sold_prices_per_sqf: {
      success: true,
      data: { average, '80pc_low': 200, '80pc_high': 300 },
    },
  };
}

async function run() {
  await test('helpers reject null/empty/NaN/Infinity/non-positive', () => {
    [null, undefined, '', NaN, Infinity, -Infinity, 0, -12].forEach((value) => {
      assert.strictEqual(isFinitePositiveMoney(value), false);
      assert.strictEqual(isFinitePositiveArea(value), false);
      assert.strictEqual(isValidBlendEstimate(value), false);
    });
    assert.strictEqual(isFinitePositiveMoney(232), true);
    assert.strictEqual(isFinitePositiveArea(850), true);
  });

  await test('null asking price remains unknown, not fake zero', async () => {
    const result = await calculatePropertyValuation(
      { ...LISTING, price: null },
      null,
      { analyseSaleComparables: async () => ({ success: false, comparables: [] }) }
    );
    assert.strictEqual(result.askingPrice, null);
    assert.notStrictEqual(result.askingPrice, 0);
    assert.strictEqual(parsePositiveMoney(null), null);
    assert.strictEqual(parsePositiveMoney(''), null);
    assert.strictEqual(parsePositiveMoney(undefined), null);
  });

  await test('one internal asking comp at £232 cannot solely assess sale value', async () => {
    const result = await calculatePropertyValuation(LISTING, null, {
      analyseSaleComparables: mockAskingAnalysis([askingComp(123, 232)]),
    });
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.insufficientEvidence, true);
    assert.ok(result.internalComparables.length >= 1);
    assert.strictEqual(result.centralEstimate, undefined);
  });

  await test('three internal asking comps at £232/£234/£234 cannot solely assess sale value', async () => {
    const result = await calculatePropertyValuation(LISTING, null, {
      analyseSaleComparables: mockAskingAnalysis([
        askingComp(123, 232),
        askingComp(127, 234),
        askingComp(134, 234),
      ]),
    });
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.insufficientEvidence, true);
    assert.ok(result.internalComparables.length >= 3);
  });

  await test('valid independent AVM only still assesses', async () => {
    const result = await calculatePropertyValuation(LISTING, avmEnrichment(425000), {
      analyseSaleComparables: async () => ({ success: false, comparables: [] }),
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.centralEstimate.value, 425000);
    assert.strictEqual(result.evidenceCount, 1);
  });

  await test('malformed asking comp cannot dominate an independent AVM', async () => {
    const result = await calculatePropertyValuation(LISTING, avmEnrichment(425000), {
      analyseSaleComparables: mockAskingAnalysis([askingComp(123, 232)]),
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.centralEstimate.value, 425000);
    assert.notStrictEqual(result.centralEstimate.value, 232);
    assert.ok(!result.components.some((c) => c.method === 'internal_sale_comparables'));
  });

  await test('centralEstimate Infinity is rejected', () => {
    assert.strictEqual(weightedBlend([{ centralEstimate: Infinity, method: 'valuation_sale_avm' }]), null);
  });

  await test('centralEstimate NaN is rejected', () => {
    assert.strictEqual(weightedBlend([{ centralEstimate: NaN, method: 'valuation_sale_avm' }]), null);
  });

  await test('centralEstimate <= 0 is rejected', () => {
    assert.strictEqual(weightedBlend([{ centralEstimate: 0, method: 'valuation_sale_avm' }]), null);
    assert.strictEqual(weightedBlend([{ centralEstimate: -100, method: 'valuation_sale_avm' }]), null);
  });

  await test('invalid blend weight is rejected', () => {
    assert.strictEqual(
      weightedBlend([{ centralEstimate: 400000, method: 'valuation_sale_avm', weight: 0 }]),
      null
    );
    assert.strictEqual(
      weightedBlend([{ centralEstimate: 400000, method: 'valuation_sale_avm', weight: NaN }]),
      null
    );
    assert.strictEqual(
      weightedBlend([{ centralEstimate: 400000, method: 'valuation_sale_avm', weight: Infinity }]),
      null
    );
  });

  await test('missing floor area produces no £/area assessment', () => {
    const estimate = buildSqftImpliedEstimate(
      { ...LISTING, square_feet: null },
      { averagePerSqft: 232, range: { low: 200, high: 260 } }
    );
    assert.strictEqual(estimate, null);
  });

  await test('zero floor area produces no £/area assessment', () => {
    const estimate = buildSqftImpliedEstimate(
      { ...LISTING, square_feet: 0 },
      { averagePerSqft: 232, range: { low: 200, high: 260 } }
    );
    assert.strictEqual(estimate, null);
  });

  await test('unprovenanced external area cannot assess £/sqft valuation', async () => {
    const property = {
      ...LISTING,
      id: null,
      source: 'external_intelligence_subject',
      subjectId: 99,
      square_feet: 1,
    };
    assert.strictEqual(hasProvenancedAssessableFloorArea(property, 1), false);
    const result = await calculatePropertyValuation(property, {
      enrichments: {
        ...psfEnrichment(232),
        uprn_profile: { success: true, data: { internalArea: 1 } },
      },
    }, {
      analyseSaleComparables: async () => ({ success: false, comparables: [] }),
    });
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.insufficientEvidence, true);
    assert.ok(!result.components.some((c) => c.method === 'sqft_implied'));
  });

  await test('valid provenanced listing sqft is eligible as area evidence but cannot assess alone', async () => {
    const property = {
      ...LISTING,
      square_feet: 850,
      floorAreaProvenance: 'listing_ingest_sqft',
      floorAreaUnit: 'sqft',
    };
    const result = await calculatePropertyValuation(property, { enrichments: psfEnrichment(250) }, {
      analyseSaleComparables: async () => ({ success: false, comparables: [] }),
    });
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.insufficientEvidence, true);
    assert.ok(result.components.some((c) => c.method === 'sqft_implied'));
    const sqftEligibility = result.evidenceEligibility.methods.find((m) => m.method === 'sqft_implied');
    assert.strictEqual(sqftEligibility.eligibleForAssessment, true);
    assert.strictEqual(sqftEligibility.canAssessAlone, false);
  });

  await test('synthetic negative lower bound cannot enter assessed blend', () => {
    const blend = weightedBlend([
      {
        centralEstimate: 232,
        lowerEstimate: -4768,
        upperEstimate: 5232,
        method: 'valuation_sale_avm',
      },
    ]);
    assert.ok(blend);
    assert.strictEqual(blend.central, 232);
    assert.strictEqual(blend.lower, null);
    assert.notStrictEqual(blend.lower, -4768);
  });

  await test('no valid independent evidence is unsuccessful and insufficient', async () => {
    const result = await calculatePropertyValuation(LISTING, { enrichments: {} }, {
      analyseSaleComparables: mockAskingAnalysis([askingComp(123, 232)]),
    });
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.insufficientEvidence, true);
  });

  await test('historical report/snapshot mapping is unchanged', () => {
    const stored = {
      id: 30,
      title: 'Listing 155',
      created_at: '2026-08-01T00:00:00.000Z',
      confidence: 62,
      data_quality: 40,
      model_version: 'property-intelligence-v1.1',
      output_data: {
        sale: {
          success: true,
          centralEstimate: 232,
          confidence: 'low',
        },
        confidence: { level: 'Low', assessed: true },
      },
    };
    const mapped = mapHistoryRow(stored);
    assert.strictEqual(mapped.id, 30);
    assert.strictEqual(mapped.modelVersion, 'property-intelligence-v1.1');
    const annotated = annotateStoredAnalysis(stored);
    assert.deepStrictEqual(annotated.output_data.sale, stored.output_data.sale);
    assert.strictEqual(annotated.output_data.sale.centralEstimate, 232);
  });

  console.log('\nAll valuationIntegrity tests passed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
