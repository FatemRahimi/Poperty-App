/**
 * Sale valuation evidence eligibility (Phase 1B).
 * Run: node server/tests/valuationEligibility.test.js
 */

const assert = require('assert');
const { mapHistoryRow, annotateStoredAnalysis } = require('../models/AiRequest');
const { calculatePropertyValuation } = require('../services/ai/valuationEngine');
const { calculateSimilarity } = require('../services/ai/comparableEngine');
const {
  classifyEvidenceDate,
  canonicalPropertyTypeToken,
  typesAreExactMatch,
  evaluateAvmEligibility,
  evaluateUprnEstimateEligibility,
  evaluateSoldStatsEligibility,
  evaluateSqftImpliedEligibility,
  decideAssessment,
  selectAssessableComponents,
  prepareSoldTransactions,
  lastSoldFact,
} = require('../services/ai/valuationEligibility');

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

const noAsking = { analyseSaleComparables: async () => ({ success: false, comparables: [] }) };

function askingOnlyAnalysis() {
  return {
    analyseSaleComparables: async () => ({
      success: true,
      evidenceKind: 'asking_listing',
      cannotSolelyAssessValuation: true,
      recommendedPrice: 232,
      comparables: [{ id: 123, price: 232, evidenceKind: 'asking_listing' }],
      comparableCount: 1,
    }),
  };
}

async function run() {
  await test('asking listings only remain not assessed', async () => {
    const result = await calculatePropertyValuation(LISTING, null, askingOnlyAnalysis());
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.insufficientEvidence, true);
  });

  await test('valid property-specific provider AVM is eligible and can assess alone', async () => {
    const avm = evaluateAvmEligibility(
      { centralEstimate: 425000, margin: 15000, confidence: 'medium' },
      LISTING
    );
    assert.strictEqual(avm.eligibleForAssessment, true);
    assert.strictEqual(avm.canAssessAlone, true);
    assert.strictEqual(avm.methodFamily, 'PROVIDER_MODEL');

    const result = await calculatePropertyValuation(LISTING, {
      enrichments: {
        valuation_sale: { success: true, data: { result: { estimate: 425000, margin: 15000, confidence: 'medium' } } },
      },
    }, noAsking);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.centralEstimate.value, 425000);
    assert.deepStrictEqual(result.evidenceEligibility.assessedMethods, ['valuation_sale_avm']);
  });

  await test('malformed provider AVM without estimate is not eligible', async () => {
    const avm = evaluateAvmEligibility({ confidence: 'high', margin: 10000 }, LISTING);
    assert.strictEqual(avm.eligibleForAssessment, false);
    assert.ok(avm.rejectionReasons.includes('missing_or_invalid_estimate'));

    const result = await calculatePropertyValuation(LISTING, {
      enrichments: {
        valuation_sale: { success: true, data: { result: { confidence: 'high' } } },
      },
    }, noAsking);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.insufficientEvidence, true);
  });

  await test('broad sold-price statistics alone cannot assess a property-specific valuation', async () => {
    const stats = evaluateSoldStatsEligibility({ average: 280000, sampleSize: 24 });
    assert.strictEqual(stats.eligibleForAssessment, true);
    assert.strictEqual(stats.canAssessAlone, false);
    assert.strictEqual(stats.propertySpecificity, 'area');

    const result = await calculatePropertyValuation(LISTING, {
      enrichments: {
        sold_prices: {
          success: true,
          data: { average: 280000, '80pc_low': 240000, '80pc_high': 320000, points: 24 },
        },
      },
    }, noAsking);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.insufficientEvidence, true);
    assert.strictEqual(result.evidenceEligibility.assessment.reason, 'insufficient_eligible_evidence');
  });

  await test('valid UPRN property-specific estimate can assess alone', async () => {
    const uprn = evaluateUprnEstimateEligibility(
      { centralEstimate: 410000 },
      { ...LISTING, uprn: '100012345678' },
      { uprn: '100012345678' }
    );
    assert.strictEqual(uprn.eligibleForAssessment, true);
    assert.strictEqual(uprn.canAssessAlone, true);
    assert.strictEqual(uprn.methodFamily, 'PROVIDER_MODEL');

    const result = await calculatePropertyValuation({ ...LISTING, uprn: '100012345678' }, {
      enrichments: {
        uprn_profile: {
          success: true,
          data: { uprn: '100012345678', current_sale_estimate: 410000 },
        },
      },
    }, noAsking);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.centralEstimate.value, 410000);
  });

  await test('AVM and UPRN estimate are the same method family and are not two independent methods', async () => {
    const result = await calculatePropertyValuation({ ...LISTING, uprn: '100012345678' }, {
      enrichments: {
        valuation_sale: { success: true, data: { result: { estimate: 425000, confidence: 'medium' } } },
        uprn_profile: {
          success: true,
          data: { uprn: '100012345678', current_sale_estimate: 390000 },
        },
      },
    }, noAsking);
    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.evidenceEligibility.methodFamilies, ['PROVIDER_MODEL']);
    assert.deepStrictEqual(result.evidenceEligibility.assessedMethods, ['valuation_sale_avm']);
    assert.strictEqual(result.centralEstimate.value, 425000);
    assert.strictEqual(result.evidenceCount, 1);
  });

  await test('valid provenanced sqft method is area-level and cannot assess alone', async () => {
    const sqft = evaluateSqftImpliedEligibility({ centralEstimate: 212500, method: 'sqft_implied' });
    assert.strictEqual(sqft.eligibleForAssessment, true);
    assert.strictEqual(sqft.canAssessAlone, false);
    assert.strictEqual(sqft.methodFamily, 'TRANSACTION_STATISTICS');

    const result = await calculatePropertyValuation({
      ...LISTING,
      square_feet: 850,
      floorAreaProvenance: 'listing_ingest_sqft',
      floorAreaUnit: 'sqft',
    }, {
      enrichments: {
        sold_prices_per_sqf: { success: true, data: { average: 250 } },
      },
    }, noAsking);
    assert.strictEqual(result.success, false);
  });

  await test('missing £/sqft provenance is not eligible', async () => {
    const result = await calculatePropertyValuation({
      ...LISTING,
      source: 'external_intelligence_subject',
      subjectId: 9,
      square_feet: 850,
    }, {
      enrichments: {
        sold_prices_per_sqf: { success: true, data: { average: 250 } },
        uprn_profile: { success: true, data: { internalArea: 850 } },
      },
    }, noAsking);
    assert.strictEqual(result.success, false);
    assert.ok(!result.components.some((c) => c.method === 'sqft_implied'));
  });

  await test('future sold transaction is not valid evidence', () => {
    const dated = classifyEvidenceDate('2099-01-01', Date.parse('2026-08-29T00:00:00Z'));
    assert.strictEqual(dated.state, 'invalid');
    assert.strictEqual(dated.reason, 'future');
    const prepared = prepareSoldTransactions(
      [{ id: 't1', price: 250000, sold_date: '2099-01-01', address: '1 High Street' }],
      Date.parse('2026-08-29T00:00:00Z')
    );
    assert.strictEqual(prepared.transactions[0].eligibleAsTransactionEvidence, false);
    assert.strictEqual(prepared.transactions[0].eligibleAsDatedEvidence, false);
    assert.strictEqual(prepared.futureRejectedCount, 1);

    const fact = lastSoldFact({ lastSoldPrice: 250000, lastSoldDate: '2099-01-01' }, Date.parse('2026-08-29T00:00:00Z'));
    assert.strictEqual(fact.state, 'invalid');
    assert.strictEqual(fact.available, false);
  });

  await test('malformed sold date is unknown and not dated evidence', () => {
    const dated = classifyEvidenceDate('not-a-date');
    assert.strictEqual(dated.state, 'unknown');
    assert.strictEqual(dated.reason, 'malformed');
    const prepared = prepareSoldTransactions([{ id: 't2', price: 250000, sold_date: 'not-a-date', address: '2 High Street' }]);
    assert.strictEqual(prepared.transactions[0].dateState, 'unknown');
    assert.strictEqual(prepared.transactions[0].eligibleAsDatedEvidence, false);
    assert.strictEqual(prepared.transactions[0].sold_date, null);
  });

  await test('duplicate sold transactions are not double counted', () => {
    const prepared = prepareSoldTransactions([
      { id: 'abc', price: 250000, sold_date: '2024-01-15', address: '1 High Street' },
      { id: 'abc', price: 250000, sold_date: '2024-01-15', address: '1 High Street' },
      { price: 250000, sold_date: '2024-01-15', address: '1  High Street' },
    ]);
    assert.strictEqual(prepared.transactions.length, 1);
    assert.strictEqual(prepared.duplicateDroppedCount, 2);
  });

  await test('malformed property type is not an exact confident match', () => {
    assert.strictEqual(canonicalPropertyTypeToken('{"semi-detached","semi-detached"}'), 'semi-detached');
    assert.strictEqual(canonicalPropertyTypeToken('{"semi-detached","detached"}'), null);
    assert.strictEqual(typesAreExactMatch('{"semi-detached","detached"}', 'semi-detached'), false);
    assert.strictEqual(typesAreExactMatch('{"semi-detached","semi-detached"}', 'semi-detached'), true);

    const ambiguous = calculateSimilarity(
      { city: 'Birmingham', property_type: '{"semi-detached","detached"}', bedrooms: 3 },
      { city: 'Birmingham', property_type: 'semi-detached', bedrooms: 3 }
    );
    assert.strictEqual(ambiguous.breakdown.propertyType, null);
    assert.ok(ambiguous.notComparable.includes('propertyType'));
  });

  await test('zero raw transactions stay not assessed when no other method exists', async () => {
    const result = await calculatePropertyValuation(LISTING, {
      enrichments: {
        sold_prices: { success: true, data: { average: 280000, raw_data: [] } },
      },
    }, noAsking);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.externalTransactions.length, 0);
  });

  await test('one valid sold transaction is contextual and insufficient to assess', () => {
    const prepared = prepareSoldTransactions([
      { id: 't1', price: 250000, sold_date: '2024-06-01', address: '1 High Street' },
    ]);
    assert.strictEqual(prepared.validDatedCount, 1);
    const decision = decideAssessment([]);
    assert.strictEqual(decision.assess, false);
  });

  await test('multiple valid sold transactions remain contextual in this phase', () => {
    const prepared = prepareSoldTransactions([
      { id: 't1', price: 250000, sold_date: '2024-06-01', address: '1 High Street' },
      { id: 't2', price: 260000, sold_date: '2024-07-01', address: '3 High Street' },
    ]);
    assert.strictEqual(prepared.validDatedCount, 2);
    assert.strictEqual(decideAssessment([]).assess, false);
  });

  await test('method-family independence collapses AVM + UPRN and stats + sqft', () => {
    const selectedSameModel = selectAssessableComponents(
      [
        { method: 'valuation_sale_avm', centralEstimate: 425000 },
        { method: 'uprn_profile', centralEstimate: 390000 },
      ],
      [
        { method: 'valuation_sale_avm', eligibleForAssessment: true, methodFamily: 'PROVIDER_MODEL' },
        { method: 'uprn_profile', eligibleForAssessment: true, methodFamily: 'PROVIDER_MODEL' },
      ]
    );
    assert.deepStrictEqual(selectedSameModel.map((c) => c.method), ['valuation_sale_avm']);

    const statsAndSqft = [
      evaluateSoldStatsEligibility({ average: 280000, sampleSize: 10 }),
      evaluateSqftImpliedEligibility({ centralEstimate: 212500 }),
    ];
    assert.strictEqual(statsAndSqft[0].methodFamily, statsAndSqft[1].methodFamily);
    assert.strictEqual(decideAssessment(statsAndSqft).assess, false);
  });

  await test('historical snapshot mapping is unchanged', () => {
    const stored = {
      id: 30,
      title: 'Listing 155',
      created_at: '2026-08-01T00:00:00.000Z',
      confidence: 62,
      data_quality: 40,
      model_version: 'property-intelligence-v1.1',
      output_data: {
        sale: { success: true, centralEstimate: 232, confidence: 'low' },
        confidence: { level: 'Low', assessed: true },
      },
    };
    const mapped = mapHistoryRow(stored);
    assert.strictEqual(mapped.modelVersion, 'property-intelligence-v1.1');
    const annotated = annotateStoredAnalysis(stored);
    assert.deepStrictEqual(annotated.output_data.sale, stored.output_data.sale);
  });

  await test('future sold date does not score as freshest comparable recency', () => {
    const { breakdown } = calculateSimilarity(
      { city: 'Leeds', property_type: 'Flat', bedrooms: 2 },
      { city: 'Leeds', property_type: 'Flat', bedrooms: 2, sold_date: '2099-12-01' }
    );
    assert.strictEqual(breakdown.recency, null);
  });

  console.log('\nAll valuationEligibility tests passed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
