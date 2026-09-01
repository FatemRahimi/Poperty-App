/**
 * POST-V1.1 Quality Phase 2 — sale valuation backtest contracts.
 * Observational only. Does not call the live valuation engine, providers, or LLM.
 * Run: node server/tests/valuationBacktest.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  EXCLUSION,
  MATCH_STATE,
  OUTCOME_TRUST,
  SAMPLE_SUFFICIENCY,
  extractPredictionSnapshot,
  extractListingOutcomes,
  extractTransactionOutcome,
  pairSnapshotWithOutcome,
  valuationCaseMetrics,
  aggregateCases,
  dedupeOutcomes,
  runBacktest,
} = require('../services/ai/backtesting/backtestFoundation');
const { evaluateSaleBacktest } = require('../services/ai/valuationBacktestService');

function test(name, fn) {
  const result = fn();
  if (result && typeof result.then === 'function') {
    throw new Error(`async not used for ${name}`);
  }
  console.log(`✓ ${name}`);
}

const SYNTHETIC = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'backtest-synthetic-snapshot.json'), 'utf8')
);

function snapshotRow(reportOverrides = {}, rowOverrides = {}) {
  return {
    id: 1,
    property_id: 10,
    created_at: '2025-01-15T12:00:00.000Z',
    synthetic: true,
    output_data: {
      ...SYNTHETIC,
      ...reportOverrides,
      property: { ...SYNTHETIC.property, ...(reportOverrides.property || {}) },
      identity: { ...SYNTHETIC.identity, ...(reportOverrides.identity || {}) },
      marketIntelligence: {
        ...SYNTHETIC.marketIntelligence,
        ...(reportOverrides.marketIntelligence || {}),
        sale: {
          ...SYNTHETIC.marketIntelligence.sale,
          ...(reportOverrides.marketIntelligence?.sale || {}),
        },
        rent: {
          ...SYNTHETIC.marketIntelligence.rent,
          ...(reportOverrides.marketIntelligence?.rent || {}),
        },
      },
      confidence: reportOverrides.confidence || SYNTHETIC.confidence,
    },
    ...rowOverrides,
  };
}

function saleOutcome(overrides = {}) {
  return {
    kind: 'sale',
    source: 'first_party_listing',
    matchBasis: 'listingId',
    listingId: 10,
    uprn: '1000123',
    value: 380000,
    observedAt: '2025-06-01T00:00:00.000Z',
    timestampSource: 'sold_at',
    trust: OUTCOME_TRUST.userReported,
    provenance: { source: 'ApplicationDatabase', field: 'achieved_price' },
    ...overrides,
  };
}

test('1. assessed saved valuation + verified later sale is eligible', () => {
  const result = evaluateSaleBacktest({
    snapshots: [snapshotRow()],
    outcomes: [saleOutcome()],
  });
  assert.strictEqual(result.sample.n, 1);
  assert.strictEqual(result.observations[0].predicted, 390000);
  assert.strictEqual(result.observations[0].achieved, 380000);
  assert.strictEqual(result.observations[0].matchState, MATCH_STATE.verified);
});

test('2. notAssessed prediction + later sale is excluded NOT_ASSESSED', () => {
  const result = evaluateSaleBacktest({
    snapshots: [
      snapshotRow({
        marketIntelligence: {
          sale: { success: false, insufficientEvidence: true, centralEstimate: null },
        },
      }),
    ],
    outcomes: [saleOutcome()],
  });
  assert.strictEqual(result.sample.n, 0);
  assert.ok(result.exclusions[EXCLUSION.not_assessed]);
});

test('3. prediction after outcome is excluded chronology', () => {
  const paired = pairSnapshotWithOutcome(
    extractPredictionSnapshot(snapshotRow()),
    saleOutcome({ observedAt: '2024-12-01T00:00:00.000Z' })
  );
  assert.strictEqual(paired.eligible, false);
  assert.strictEqual(paired.reason, EXCLUSION.prediction_not_before_outcome);
});

test('4. asking price only is not an outcome', () => {
  const fromListing = extractListingOutcomes({
    id: 10,
    price: 400000,
    status: 'sold',
    updated_at: '2025-06-01T00:00:00.000Z',
  });
  assert.strictEqual(fromListing.length, 0);
  const paired = pairSnapshotWithOutcome(
    extractPredictionSnapshot(snapshotRow()),
    saleOutcome({ timestampSource: 'asking', source: 'asking' })
  );
  assert.strictEqual(paired.reason, EXCLUSION.asking_used_as_achieved_price);
});

test('5. saved prediction value is used; current engine is not called', () => {
  const serviceSrc = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'ai', 'valuationBacktestService.js'),
    'utf8'
  );
  const foundationSrc = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'ai', 'backtesting', 'backtestFoundation.js'),
    'utf8'
  );
  assert.ok(!/calculatePropertyValuation/.test(serviceSrc));
  assert.ok(!/calculatePropertyValuation/.test(foundationSrc));
  const result = evaluateSaleBacktest({
    snapshots: [
      snapshotRow({
        marketIntelligence: { sale: { centralEstimate: 275000 } },
      }),
    ],
    outcomes: [saleOutcome({ value: 280000 })],
  });
  assert.strictEqual(result.observations[0].predicted, 275000);
  assert.strictEqual(result.recomputedPredictions, false);
});

test('6. listing edited after prediction leaves historical prediction unchanged', () => {
  const saved = snapshotRow({
    property: { price: 400000 },
    marketIntelligence: { sale: { centralEstimate: 390000 } },
  });
  const frozen = JSON.parse(JSON.stringify(saved.output_data));
  const laterListing = { id: 10, price: 525000, achieved_price: 380000, sold_at: '2025-06-01T00:00:00.000Z' };
  const result = evaluateSaleBacktest({ snapshots: [saved], listings: [laterListing] });
  assert.strictEqual(result.observations[0].predicted, 390000);
  assert.strictEqual(extractPredictionSnapshot(saved).askingPriceAtT, 400000);
  assert.deepStrictEqual(saved.output_data, frozen);
});

test('7. finite positive achieved price is accepted', () => {
  const paired = pairSnapshotWithOutcome(
    extractPredictionSnapshot(snapshotRow()),
    saleOutcome({ value: 381250 })
  );
  assert.strictEqual(paired.eligible, true);
  assert.strictEqual(paired.outcome.value, 381250);
});

test('8. zero / null / negative outcome is rejected', () => {
  const snapshot = extractPredictionSnapshot(snapshotRow());
  assert.strictEqual(
    pairSnapshotWithOutcome(snapshot, saleOutcome({ value: 0 })).reason,
    EXCLUSION.invalid_outcome_value
  );
  assert.strictEqual(
    pairSnapshotWithOutcome(snapshot, saleOutcome({ value: -100 })).reason,
    EXCLUSION.invalid_outcome_value
  );
  assert.strictEqual(
    pairSnapshotWithOutcome(snapshot, saleOutcome({ value: null })).reason,
    EXCLUSION.missing_outcome
  );
});

test('9. exact verified identity match is eligible', () => {
  const tx = extractTransactionOutcome({
    uprn: '1000123',
    price: 375000,
    date: '2025-07-01T00:00:00.000Z',
  });
  const paired = pairSnapshotWithOutcome(extractPredictionSnapshot(snapshotRow()), tx);
  assert.strictEqual(paired.eligible, true);
  assert.strictEqual(paired.matchState, MATCH_STATE.verified);
  assert.strictEqual(tx.trust, OUTCOME_TRUST.verifiedObserved);
});

test('10. ambiguous address match is excluded from primary metrics', () => {
  const paired = pairSnapshotWithOutcome(
    extractPredictionSnapshot(snapshotRow()),
    saleOutcome({ matchBasis: 'address' })
  );
  assert.strictEqual(paired.eligible, false);
  assert.strictEqual(paired.reason, EXCLUSION.weak_identity_match);
  assert.strictEqual(paired.matchState, MATCH_STATE.ambiguous);
  const result = evaluateSaleBacktest({
    snapshots: [snapshotRow()],
    outcomes: [saleOutcome({ matchBasis: 'fuzzy' })],
  });
  assert.strictEqual(result.sample.n, 0);
  assert.ok(result.exclusions[EXCLUSION.weak_identity_match]);
});

test('11. duplicate transaction is counted once', () => {
  const firstParty = saleOutcome({ sourceRecordId: 'listing:10:sold' });
  const hmlrCopy = {
    ...saleOutcome({
      source: 'hmlr_via_propertydata',
      matchBasis: 'uprn',
      sourceRecordId: 'hmlr-abc',
    }),
  };
  assert.strictEqual(dedupeOutcomes([firstParty, hmlrCopy]).length, 1);
  const result = evaluateSaleBacktest({
    snapshots: [snapshotRow()],
    outcomes: [firstParty, hmlrCopy],
  });
  assert.strictEqual(result.sample.n, 1);
});

test('12. conflicting outcomes are explicit and excluded', () => {
  const result = evaluateSaleBacktest({
    snapshots: [snapshotRow()],
    outcomes: [
      saleOutcome({ value: 380000, source: 'hmlr_via_propertydata', matchBasis: 'uprn' }),
      saleOutcome({ value: 410000, source: 'hmlr_via_propertydata', matchBasis: 'uprn', sourceRecordId: 'other' }),
    ],
  });
  assert.strictEqual(result.sample.n, 0);
  assert.ok(result.exclusions[EXCLUSION.conflicting_outcomes]);
});

test('13. future outcome date is invalid', () => {
  const paired = pairSnapshotWithOutcome(
    extractPredictionSnapshot(snapshotRow()),
    saleOutcome({ observedAt: '2099-01-01T00:00:00.000Z' }),
    { asOf: Date.parse('2026-08-29T00:00:00.000Z') }
  );
  assert.strictEqual(paired.reason, EXCLUSION.future_outcome_date);
});

test('14. malformed date is invalid', () => {
  const paired = pairSnapshotWithOutcome(
    extractPredictionSnapshot(snapshotRow()),
    saleOutcome({ observedAt: 'not-a-date' })
  );
  assert.strictEqual(paired.reason, EXCLUSION.malformed_outcome_date);
});

test('15. prior last-sale fact cannot become later outcome label', () => {
  const snapshot = extractPredictionSnapshot(
    snapshotRow({
      marketIntelligence: {
        sale: { lastSold: { price: 380000, date: '2025-06-01T00:00:00.000Z' } },
      },
    })
  );
  const paired = pairSnapshotWithOutcome(snapshot, saleOutcome());
  assert.strictEqual(paired.reason, EXCLUSION.outcome_already_known_at_prediction);
});

test('16. absolute error calculation', () => {
  const metrics = valuationCaseMetrics(extractPredictionSnapshot(snapshotRow()), saleOutcome());
  assert.strictEqual(metrics.absoluteError, 10000);
});

test('17. signed error calculation', () => {
  const metrics = valuationCaseMetrics(extractPredictionSnapshot(snapshotRow()), saleOutcome());
  assert.strictEqual(metrics.signedError, 10000);
});

test('18. percentage error calculation', () => {
  const metrics = valuationCaseMetrics(extractPredictionSnapshot(snapshotRow()), saleOutcome());
  assert.strictEqual(metrics.absolutePercentageError, 10000 / 380000);
  assert.strictEqual(metrics.signedPercentageError, 10000 / 380000);
});

test('19–22. cohort MAE, MAPE, median errors, and sample N', () => {
  const a = valuationCaseMetrics(extractPredictionSnapshot(snapshotRow()), saleOutcome({ value: 380000 }));
  const b = valuationCaseMetrics(
    extractPredictionSnapshot(snapshotRow({ marketIntelligence: { sale: { centralEstimate: 400000 } } })),
    saleOutcome({ value: 360000 })
  );
  const agg = aggregateCases([a, b]);
  assert.strictEqual(agg.sampleSize, 2);
  assert.strictEqual(agg.mae, (10000 + 40000) / 2);
  const expectedMape = Math.round(((10000 / 380000 + 40000 / 360000) / 2) * 10000) / 10000;
  assert.strictEqual(agg.mape, expectedMape);
  assert.strictEqual(agg.medianAbsoluteError, (10000 + 40000) / 2);
  const result = evaluateSaleBacktest({
    snapshots: [
      snapshotRow(),
      snapshotRow({ marketIntelligence: { sale: { centralEstimate: 400000 } } }, { id: 2, property_id: 10 }),
    ],
    outcomes: [saleOutcome()],
  });
  assert.strictEqual(result.sample.n, 2);
});

test('23. sparse sample limitation is exposed', () => {
  const result = evaluateSaleBacktest({
    snapshots: [snapshotRow()],
    outcomes: [saleOutcome()],
  });
  assert.strictEqual(result.sample.sufficiency, SAMPLE_SUFFICIENCY.verySparse);
  assert.ok(result.sample.limitation);
  assert.ok(/not a calibration result/.test(result.sample.limitation));
});

test('24. method family cohort metadata is queryable', () => {
  const result = evaluateSaleBacktest({
    snapshots: [
      snapshotRow({
        marketIntelligence: {
          sale: {
            evidenceEligibility: { methodFamilies: ['PROVIDER_MODEL'] },
          },
        },
      }),
    ],
    outcomes: [saleOutcome()],
  });
  assert.deepStrictEqual(result.observations[0].methodFamilies, ['PROVIDER_MODEL']);
  const segmented = runBacktest({
    snapshots: [
      snapshotRow({
        marketIntelligence: {
          sale: { evidenceEligibility: { methodFamilies: ['PROVIDER_MODEL'] } },
        },
      }),
    ],
    outcomes: [saleOutcome()],
  });
  assert.ok(segmented.segments.some((s) => s.name === 'methodFamily'));
});

test('25. unknown engine version stays UNKNOWN', () => {
  const row = snapshotRow();
  delete row.output_data.engineVersion;
  delete row.output_data.modelVersion;
  delete row.model_version;
  const snapshot = extractPredictionSnapshot(row);
  assert.strictEqual(snapshot.engineVersion, 'UNKNOWN');
});

test('26. historical analysis is not mutated', () => {
  const row = snapshotRow();
  const before = JSON.stringify(row.output_data);
  evaluateSaleBacktest({ snapshots: [row], outcomes: [saleOutcome()] });
  assert.strictEqual(JSON.stringify(row.output_data), before);
});

test('27–28. no provider calls and no LLM calls from backtest', () => {
  const serviceSrc = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'ai', 'valuationBacktestService.js'),
    'utf8'
  );
  const foundationSrc = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'ai', 'backtesting', 'backtestFoundation.js'),
    'utf8'
  );
  [serviceSrc, foundationSrc].forEach((src) => {
    assert.ok(!/require\(['"].*propertyData/.test(src));
    assert.ok(!/fetch\(|axios|openai|anthropic|chat\.completions/i.test(src));
    assert.ok(!/calculatePropertyValuation|assessConfidence|scorePersonalDecision/.test(src));
  });
  const result = evaluateSaleBacktest({
    snapshots: [snapshotRow()],
    outcomes: [saleOutcome()],
  });
  assert.strictEqual(result.providerCalls, false);
  assert.strictEqual(result.llmCalls, false);
});

test('user-reported vs verified observed trust is not silently merged', () => {
  const listing = extractListingOutcomes({
    id: 10,
    achieved_price: 380000,
    sold_at: '2025-06-01T00:00:00.000Z',
    uprn: '1000123',
  })[0];
  const hmlr = extractTransactionOutcome({
    uprn: '1000123',
    price: 375000,
    date: '2025-07-01T00:00:00.000Z',
  });
  assert.strictEqual(listing.trust, OUTCOME_TRUST.userReported);
  assert.strictEqual(hmlr.trust, OUTCOME_TRUST.verifiedObserved);
});

test('unverified / not-suitable labels stay out of primary metrics', () => {
  const paired = pairSnapshotWithOutcome(
    extractPredictionSnapshot(snapshotRow()),
    saleOutcome({ trust: OUTCOME_TRUST.notSuitable })
  );
  assert.strictEqual(paired.reason, EXCLUSION.unverified_outcome);
});

test('multiple predictions before one sale are counted as predictions, not transactions', () => {
  const result = evaluateSaleBacktest({
    snapshots: [
      snapshotRow({}, { id: 1 }),
      snapshotRow({ evidenceAsOf: '2025-03-15T12:00:00.000Z' }, { id: 2 }),
      snapshotRow({ evidenceAsOf: '2025-05-15T12:00:00.000Z' }, { id: 3 }),
    ],
    outcomes: [saleOutcome({ observedAt: '2025-07-01T00:00:00.000Z' })],
  });
  assert.strictEqual(result.sample.n, 3);
  assert.strictEqual(result.sample.unit, 'eligible_predictions');
  assert.strictEqual(result.sample.uniqueSaleOutcomes, 1);
});

test('report.sale persisted path is read without recomputation', () => {
  const snapshot = extractPredictionSnapshot({
    id: 9,
    created_at: '2025-01-15T12:00:00.000Z',
    output_data: {
      sale: {
        success: true,
        centralEstimate: 250000,
        boundsAvailable: false,
      },
      identity: { listingId: 10, uprn: '1000123' },
      property: { id: 10, listingId: 10, uprn: '1000123' },
    },
  });
  assert.strictEqual(snapshot.sale.central, 250000);
  assert.strictEqual(snapshot.engineVersion, 'UNKNOWN');
});

console.log('\nAll valuation backtest tests passed.');
