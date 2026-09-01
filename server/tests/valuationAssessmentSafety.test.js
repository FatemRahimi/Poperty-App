/**
 * Sale valuation assessment safety — unit contract, validity, plausibility.
 * Run: node server/tests/valuationAssessmentSafety.test.js
 */

const assert = require('assert');
const { mapHistoryRow, annotateStoredAnalysis } = require('../models/AiRequest');
const { calculatePropertyValuation, weightedBlend } = require('../services/ai/valuationEngine');
const { calculatePricePosition } = require('../services/ai/pricePositionEngine');
const {
  ASSESSMENT_SAFETY_VERSION,
  VALUE_UNITS,
  validateSaleComponent,
  evaluatePlausibility,
  validateAssessedBounds,
  isDefensibleAssessedValuation,
} = require('../services/ai/valuationAssessmentSafety');
const { CANONICAL_ENGINE_VERSION } = require('../services/ai/propertyIntelligenceEngine');

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

const noAsking = {
  analyseSaleComparables: async () => ({ success: false, comparables: [] }),
};

function avmEnrichment(estimate, extras = {}) {
  return {
    enrichments: {
      valuation_sale: {
        success: true,
        data: { result: { estimate, confidence: 'medium', ...extras } },
      },
    },
  };
}

function soldStatsEnrichment(average) {
  return {
    sold_prices: {
      success: true,
      data: { average, points: 12 },
    },
  };
}

function weakAskingAnalysis() {
  return {
    analyseSaleComparables: async () => ({
      success: true,
      evidenceKind: 'asking_listing',
      notTransactionEvidence: true,
      cannotSolelyAssessValuation: true,
      recommendedPrice: 232,
      comparables: [{
        id: 123,
        price: 232,
        bedrooms: 1,
        similarity: 0,
        evidenceKind: 'asking_listing',
      }],
      comparableCount: 1,
      dataQuality: { score: 10, level: 'Low', bedroomMatchRate: 0 },
    }),
  };
}

function unwrapCentral(result) {
  return result?.centralEstimate?.value ?? result?.centralEstimate ?? null;
}

async function run() {
  await test('£232-class weak asking comparable is NOT ASSESSED', async () => {
    const result = await calculatePropertyValuation(LISTING, { enrichments: {} }, weakAskingAnalysis());
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.insufficientEvidence, true);
    assert.strictEqual(result.notAssessed, true);
    assert.strictEqual(result.assessmentState, 'notAssessed');
    assert.strictEqual(unwrapCentral(result), null);
    assert.strictEqual(result.assessmentSafetyVersion, ASSESSMENT_SAFETY_VERSION);
  });

  await test('asking-only evidence is NOT ASSESSED', async () => {
    const result = await calculatePropertyValuation(LISTING, null, {
      analyseSaleComparables: async () => ({
        success: true,
        evidenceKind: 'asking_listing',
        recommendedPrice: 295000,
        comparables: [{ id: 9, price: 295000 }, { id: 10, price: 301000 }],
        comparableCount: 2,
      }),
    });
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.notAssessed, true);
    assert.strictEqual(unwrapCentral(result), null);
  });

  await test('one weak internal asking comparable cannot assess', async () => {
    const result = await calculatePropertyValuation(LISTING, { enrichments: {} }, weakAskingAnalysis());
    assert.strictEqual(result.success, false);
    assert.ok(result.internalComparables.length >= 1);
    assert.strictEqual(result.evidenceEligibility.assessment.assess, false);
  });

  await test('positive-but-invalid component is rejected', () => {
    const invalid = validateSaleComponent({
      method: 'valuation_sale_avm',
      centralEstimate: 232,
      valueUnit: 'furlongs',
    });
    assert.strictEqual(invalid.valid, false);
    assert.ok(invalid.reasonCodes.includes('unknown_unit'));
  });

  await test('zero is rejected', () => {
    const result = validateSaleComponent({ method: 'valuation_sale_avm', centralEstimate: 0 });
    assert.strictEqual(result.valid, false);
    assert.ok(result.reasonCodes.includes('zero_rejected'));
    assert.strictEqual(result.normalizedValue, null);
  });

  await test('negative is rejected', () => {
    const result = validateSaleComponent({ method: 'valuation_sale_avm', centralEstimate: -12000 });
    assert.strictEqual(result.valid, false);
    assert.ok(result.reasonCodes.includes('negative_rejected'));
  });

  await test('NaN is rejected', () => {
    const result = validateSaleComponent({ method: 'valuation_sale_avm', centralEstimate: Number.NaN });
    assert.strictEqual(result.valid, false);
    assert.ok(result.reasonCodes.includes('non_finite'));
  });

  await test('Infinity is rejected', () => {
    const result = validateSaleComponent({
      method: 'valuation_sale_avm',
      centralEstimate: Number.POSITIVE_INFINITY,
    });
    assert.strictEqual(result.valid, false);
    assert.ok(result.reasonCodes.includes('non_finite'));
  });

  await test('malformed provider value is rejected', async () => {
    const direct = validateSaleComponent({
      method: 'valuation_sale_avm',
      centralEstimate: { amount: 400000 },
    });
    assert.strictEqual(direct.valid, false);
    assert.ok(direct.reasonCodes.includes('malformed_provider_value'));

    const result = await calculatePropertyValuation(
      LISTING,
      { enrichments: { valuation_sale: { success: true, data: { result: { estimate: { amount: 400000 } } } } } },
      noAsking
    );
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.notAssessed, true);
  });

  await test('GBP/sqft cannot become total GBP without area conversion', () => {
    const result = validateSaleComponent({
      method: 'valuation_sale_avm',
      centralEstimate: 232,
      valueUnit: VALUE_UNITS.GBP_PER_SQFT,
    });
    assert.strictEqual(result.valid, false);
    assert.ok(result.reasonCodes.includes('gbp_per_sqft_cannot_become_total_without_area'));
  });

  await test('GBP/sqm cannot become total GBP without area conversion', () => {
    const result = validateSaleComponent({
      method: 'sold_prices_statistics',
      centralEstimate: 2500,
      valueUnit: VALUE_UNITS.GBP_PER_SQM,
    });
    assert.strictEqual(result.valid, false);
    assert.ok(result.reasonCodes.includes('gbp_per_sqm_cannot_become_total_without_area'));
  });

  await test('rent cannot become sale value', async () => {
    const weekly = validateSaleComponent({
      method: 'valuation_sale_avm',
      centralEstimate: 450,
      valueUnit: VALUE_UNITS.GBP_PER_WEEK,
    });
    assert.strictEqual(weekly.valid, false);
    assert.ok(weekly.reasonCodes.includes('rent_cannot_become_sale_value'));

    const result = await calculatePropertyValuation(
      LISTING,
      avmEnrichment(450, { unit: 'gbp_per_week' }),
      noAsking
    );
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.notAssessed, true);
  });

  await test('unknown unit is rejected', async () => {
    const result = await calculatePropertyValuation(
      LISTING,
      avmEnrichment(425000, { unit: 'unknown' }),
      noAsking
    );
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.notAssessed, true);
    const avm = result.evidenceEligibility.methods.find((row) => row.method === 'valuation_sale_avm');
    assert.ok(avm.rejectionReasons.includes('unknown_unit'));
  });

  await test('valid provider component can assess when contract permits', async () => {
    const result = await calculatePropertyValuation(LISTING, avmEnrichment(425000), noAsking);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.assessmentState, 'assessed');
    assert.strictEqual(unwrapCentral(result), 425000);
    assert.strictEqual(result.assessmentSafety.situation, 'DEFENSIBLE_ASSESSMENT');
  });

  await test('valid transaction evidence can assess when contract permits', async () => {
    const alone = await calculatePropertyValuation(
      LISTING,
      { enrichments: soldStatsEnrichment(410000) },
      noAsking
    );
    assert.strictEqual(alone.success, false, 'transaction statistics cannot assess alone');

    const unlocked = await calculatePropertyValuation(
      LISTING,
      { enrichments: { ...avmEnrichment(425000).enrichments, ...soldStatsEnrichment(410000) } },
      noAsking
    );
    assert.strictEqual(unlocked.success, true);
    assert.ok(unlocked.evidenceEligibility.assessedMethods.includes('valuation_sale_avm'));
    assert.ok(unlocked.evidenceEligibility.assessedMethods.includes('sold_prices_statistics'));
    const central = unwrapCentral(unlocked);
    assert.ok(central >= 410000 && central <= 425000);
  });

  await test('legitimate valuation below asking is allowed', async () => {
    const result = await calculatePropertyValuation(
      { ...LISTING, price: 300000 },
      avmEnrichment(250000),
      noAsking
    );
    assert.strictEqual(result.success, true);
    assert.strictEqual(unwrapCentral(result), 250000);
    assert.notStrictEqual(unwrapCentral(result), 300000);
  });

  await test('legitimate valuation above asking is allowed', async () => {
    const result = await calculatePropertyValuation(
      { ...LISTING, price: 300000 },
      avmEnrichment(380000),
      noAsking
    );
    assert.strictEqual(result.success, true);
    assert.strictEqual(unwrapCentral(result), 380000);
  });

  await test('asking price never clamps or replaces the valuation', async () => {
    const result = await calculatePropertyValuation(
      { ...LISTING, price: 300000 },
      avmEnrichment(250000),
      noAsking
    );
    assert.strictEqual(unwrapCentral(result), 250000);
    assert.strictEqual(result.askingPrice, 300000);
    assert.strictEqual(result.assessmentSafety.askingDiagnostic.notClamp, true);
    assert.strictEqual(result.assessmentSafety.askingDiagnostic.notGroundTruth, true);
    assert.strictEqual(result.assessmentSafety.askingDiagnostic.notCorrectionCoefficient, true);
  });

  await test('anomalous weaker component is quarantined rather than averaged', async () => {
    const result = await calculatePropertyValuation(
      LISTING,
      { enrichments: { ...avmEnrichment(400000).enrichments, ...soldStatsEnrichment(232) } },
      noAsking
    );
    assert.strictEqual(result.success, true);
    assert.strictEqual(unwrapCentral(result), 400000);
    assert.strictEqual(result.assessmentSafety.situation, 'COMPONENT_ANOMALY');
    assert.ok(result.assessmentSafety.quarantined.some((row) => row.method === 'sold_prices_statistics'));
  });

  await test('extreme disagreement between independent methods is NOT ASSESSED', () => {
    const plausibility = evaluatePlausibility({
      selectedComponents: [
        { method: 'valuation_sale_avm', centralEstimate: 400000, valueUnit: 'gbp_total' },
        { method: 'uprn_profile', centralEstimate: 232, valueUnit: 'gbp_total' },
      ],
      eligibilities: [
        { method: 'valuation_sale_avm', canAssessAlone: true, eligibleForAssessment: true },
        { method: 'uprn_profile', canAssessAlone: true, eligibleForAssessment: true },
      ],
      askingPrice: 300000,
    });
    assert.strictEqual(plausibility.assess, false);
    assert.strictEqual(plausibility.situation, 'EXTREME_DISAGREEMENT');
    assert.strictEqual(
      weightedBlend([
        { method: 'valuation_sale_avm', centralEstimate: 400000 },
        { method: 'sold_prices_statistics', centralEstimate: 232 },
      ]),
      null
    );
  });

  await test('zero / NaN / Infinity provider payloads do not assess', async () => {
    for (const estimate of [0, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const result = await calculatePropertyValuation(LISTING, avmEnrichment(estimate), noAsking);
      assert.strictEqual(result.success, false, String(estimate));
      assert.strictEqual(result.notAssessed, true, String(estimate));
    }
  });

  await test('£/sqft rate is not treated as a total sale value', async () => {
    const result = await calculatePropertyValuation(
      { ...LISTING, square_feet: null },
      {
        enrichments: {
          sold_prices_per_sqf: {
            success: true,
            data: { average: 232, unit: 'gbp_per_sqft' },
          },
        },
      },
      noAsking
    );
    assert.strictEqual(result.success, false);
    assert.ok(!result.components.some((row) => row.method === 'sqft_implied'));
  });

  await test('price position is NOT ASSESSED when valuation is not assessed', () => {
    const pos = calculatePricePosition(300000, {
      success: false,
      insufficientEvidence: true,
      notAssessed: true,
      assessmentState: 'notAssessed',
      message: 'Insufficient evidence',
    });
    assert.strictEqual(pos.success, false);
    assert.strictEqual(pos.notAssessed, true);
    assert.strictEqual(pos.differenceFromCentral, undefined);
  });

  await test('price position does not emit giant percentages from rejected evidence', () => {
    const pos = calculatePricePosition(300000, {
      success: false,
      centralEstimate: 232,
      insufficientEvidence: true,
    });
    assert.strictEqual(pos.success, false);
    assert.ok(!pos.differenceFromCentral);
    assert.strictEqual(isDefensibleAssessedValuation({
      success: false,
      centralEstimate: 232,
    }), false);
  });

  await test('invalid bounds cannot look assessed', () => {
    const invalid = validateAssessedBounds({ central: Number.NaN, lower: 1, upper: 2 });
    assert.strictEqual(invalid.valid, false);
    const inverted = validateAssessedBounds({ central: 400000, lower: 500000, upper: 300000 });
    assert.strictEqual(inverted.valid, true);
    assert.strictEqual(inverted.lower, null);
    assert.strictEqual(inverted.upper, null);
    assert.strictEqual(inverted.boundsAvailable, false);
  });

  await test('canonical engine version is unchanged and safety version is distinct', () => {
    assert.strictEqual(CANONICAL_ENGINE_VERSION, 'property-intelligence-v2');
    assert.strictEqual(ASSESSMENT_SAFETY_VERSION, 'assessment-safety-1.0.0');
    assert.notStrictEqual(ASSESSMENT_SAFETY_VERSION, CANONICAL_ENGINE_VERSION);
  });

  await test('historical analysis 30 mapping remains unmodified', () => {
    const stored = {
      id: 30,
      title: 'Listing 155',
      created_at: '2026-08-29T21:11:09.986Z',
      confidence: 62,
      data_quality: 40,
      model_version: 'property-intelligence-v2',
      output_data: {
        engineVersion: 'property-intelligence-v2',
        sale: {
          success: true,
          centralEstimate: 232,
          confidence: 'low',
        },
        marketIntelligence: {
          sale: { success: true, centralEstimate: 232 },
          pricePosition: {
            success: true,
            differenceFromCentral: { amount: 299768, percent: 129210.3 },
          },
        },
      },
    };
    const mapped = mapHistoryRow(stored);
    assert.strictEqual(mapped.id, 30);
    const annotated = annotateStoredAnalysis(stored);
    assert.deepStrictEqual(annotated.output_data.sale, stored.output_data.sale);
    assert.strictEqual(annotated.output_data.sale.centralEstimate, 232);
    assert.strictEqual(
      annotated.output_data.marketIntelligence.pricePosition.differenceFromCentral.percent,
      129210.3
    );
  });

  console.log('\nAll valuationAssessmentSafety tests passed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
