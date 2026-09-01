/**
 * Phase 3 — real outcome collection & data sufficiency.
 * Does not seed real-data audits or call providers/LLM.
 * Run: node server/tests/outcomeCollection.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  COLLECTION_GAP,
  HMLR_LEDGER_LIMITATION,
  classifyListingCollectionGaps,
  auditOutcomeCollection,
} = require('../services/ai/outcomeCollectionService');
const { SAMPLE_SUFFICIENCY, OUTCOME_TRUST } = require('../services/ai/backtesting/constants');
const { evaluateSaleBacktest } = require('../services/ai/valuationBacktestService');
const { extractListingOutcomes } = require('../services/ai/backtesting/backtestFoundation');

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

function snapshotRow(id, reportOverrides = {}) {
  return {
    id,
    property_id: 10,
    created_at: '2025-01-15T12:00:00.000Z',
    output_data: {
      ...SYNTHETIC,
      ...reportOverrides,
      evidenceAsOf: reportOverrides.evidenceAsOf || SYNTHETIC.evidenceAsOf,
      identity: { ...SYNTHETIC.identity, ...(reportOverrides.identity || {}) },
      property: { ...SYNTHETIC.property, ...(reportOverrides.property || {}) },
      marketIntelligence: {
        ...SYNTHETIC.marketIntelligence,
        ...(reportOverrides.marketIntelligence || {}),
        sale: {
          ...SYNTHETIC.marketIntelligence.sale,
          ...(reportOverrides.marketIntelligence?.sale || {}),
        },
      },
    },
  };
}

function assessedSnapshots() {
  return [
    snapshotRow(1, { evidenceAsOf: '2025-01-15T12:00:00.000Z' }),
    snapshotRow(2, { evidenceAsOf: '2025-03-15T12:00:00.000Z' }),
    snapshotRow(3, { evidenceAsOf: '2025-05-15T12:00:00.000Z' }),
  ];
}

test('A–B. owner/admin capture contract is reused, not duplicated', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'ai', 'listingOutcomeService.js'),
    'utf8'
  );
  assert.ok(/canRecordOutcome/.test(src));
  assert.ok(/isAdminActor/.test(src));
  assert.ok(/achievedPrice/.test(src));
  const collectionSrc = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'ai', 'outcomeCollectionService.js'),
    'utf8'
  );
  assert.ok(!/INSERT INTO properties/.test(collectionSrc));
  assert.ok(!/recordListingOutcome/.test(collectionSrc));
});

test('C–E. sold evaluation requires finite positive achieved_price and valid sold_at', () => {
  assert.strictEqual(
    extractListingOutcomes({ id: 10, status: 'sold', sold_at: '2025-06-01T00:00:00.000Z' }).length,
    0
  );
  assert.strictEqual(
    extractListingOutcomes({
      id: 10,
      achieved_price: 0,
      sold_at: '2025-06-01T00:00:00.000Z',
    }).length,
    0
  );
  assert.strictEqual(
    extractListingOutcomes({
      id: 10,
      achieved_price: 380000,
      sold_at: '2025-06-01T00:00:00.000Z',
    }).length,
    1
  );
});

test('F. asking price is never an achieved sale outcome', () => {
  const listing = { id: 10, category: 'sale', price: 400000, status: 'approved' };
  assert.strictEqual(extractListingOutcomes(listing).length, 0);
  const gaps = classifyListingCollectionGaps(listing, []);
  assert.ok(!gaps.includes(COLLECTION_GAP.asking_is_not_an_outcome));
  const audit = auditOutcomeCollection({
    listings: [listing],
    snapshots: [snapshotRow(1)],
    outcomes: [],
  });
  assert.strictEqual(audit.outcomes.candidateSale, 0);
  assert.strictEqual(audit.manufacturedOutcomes, false);
});

test('zero genuine outcomes remains N = 0 / NO_DATA', () => {
  const audit = auditOutcomeCollection({
    listings: [{ id: 10, category: 'sale', status: 'approved', price: 400000 }],
    snapshots: assessedSnapshots(),
    outcomes: [],
  });
  assert.strictEqual(audit.evaluation.n, 0);
  assert.strictEqual(audit.evaluation.sufficiency, SAMPLE_SUFFICIENCY.noData);
  assert.ok(audit.collectionGaps.reasons[COLLECTION_GAP.assessed_listing_awaiting_sale_outcome]);
});

test('sold missing achieved_price is an explicit collection gap, not a label', () => {
  const gaps = classifyListingCollectionGaps(
    { id: 10, category: 'sale', status: 'sold', sold_at: '2025-06-01T00:00:00.000Z' },
    []
  );
  assert.ok(gaps.includes(COLLECTION_GAP.sold_missing_achieved_price));
});

test('completed sale outcome is no longer a missing-price gap and stays USER_REPORTED', () => {
  const listing = {
    id: 10,
    category: 'sale',
    status: 'sold',
    sold_at: '2025-06-01T00:00:00.000Z',
    achieved_price: 380000,
    uprn: '1000123',
  };
  const gaps = classifyListingCollectionGaps(listing, []);
  assert.ok(!gaps.includes(COLLECTION_GAP.sold_missing_achieved_price));
  const extracted = extractListingOutcomes(listing);
  assert.strictEqual(extracted[0].trust, OUTCOME_TRUST.userReported);
  const audit = auditOutcomeCollection({
    listings: [listing],
    snapshots: assessedSnapshots(),
    outcomes: [],
  });
  assert.strictEqual(audit.evaluation.n, 3);
  assert.strictEqual(audit.evaluation.uniqueSaleOutcomes, 1);
  assert.strictEqual(audit.matches.verifiedObserved, 0);
});

test('achieved_price without sold_at is an explicit collection gap', () => {
  const gaps = classifyListingCollectionGaps(
    { id: 10, category: 'sale', status: 'approved', achieved_price: 380000 },
    []
  );
  assert.ok(gaps.includes(COLLECTION_GAP.achieved_price_missing_sold_at));
});

test('user-reported first-party sale stays USER_REPORTED', () => {
  const extracted = extractListingOutcomes({
    id: 10,
    achieved_price: 380000,
    sold_at: '2025-06-01T00:00:00.000Z',
    uprn: '1000123',
  });
  assert.strictEqual(extracted[0].trust, OUTCOME_TRUST.userReported);
  const audit = auditOutcomeCollection({
    listings: [
      {
        id: 10,
        category: 'sale',
        status: 'sold',
        achieved_price: 380000,
        sold_at: '2025-06-01T00:00:00.000Z',
        uprn: '1000123',
      },
    ],
    snapshots: [snapshotRow(1)],
    outcomes: [],
  });
  assert.strictEqual(audit.matches.userReported, 1);
  assert.strictEqual(audit.matches.verifiedObserved, 0);
});

test('multiple immutable predictions before one sale each count in N', () => {
  const result = evaluateSaleBacktest({
    snapshots: assessedSnapshots(),
    listings: [
      {
        id: 10,
        achieved_price: 380000,
        sold_at: '2025-07-01T00:00:00.000Z',
        uprn: '1000123',
      },
    ],
  });
  assert.strictEqual(result.sample.n, 3);
  assert.strictEqual(result.sample.unit, 'eligible_predictions');
  assert.strictEqual(result.sample.uniqueSaleOutcomes, 1);
  const audit = auditOutcomeCollection({
    listings: [
      {
        id: 10,
        category: 'sale',
        status: 'sold',
        achieved_price: 380000,
        sold_at: '2025-07-01T00:00:00.000Z',
        uprn: '1000123',
      },
    ],
    snapshots: assessedSnapshots(),
  });
  assert.strictEqual(audit.sampleUnit, 'eligible_predictions');
  assert.strictEqual(audit.evaluation.n, 3);
  assert.strictEqual(audit.evaluation.uniqueSaleOutcomes, 1);
  assert.strictEqual(
    audit.measurementSemantics.multiplePredictionsBeforeOneSale,
    'each_immutable_prediction_is_evaluated_independently'
  );
});

test('HMLR current enrichments are not treated as a later-transaction ledger', () => {
  const audit = auditOutcomeCollection({ listings: [], snapshots: [], outcomes: [] });
  assert.strictEqual(audit.verifiedObservedAccumulation.possibleFromCurrentEnrichments, false);
  assert.ok(audit.verifiedObservedAccumulation.reason.includes('upsert'));
  assert.ok(HMLR_LEDGER_LIMITATION);
});

test('collection audit does not call providers, LLM, or the live valuation engine', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'ai', 'outcomeCollectionService.js'),
    'utf8'
  );
  assert.ok(!/calculatePropertyValuation/.test(src));
  assert.ok(!/openai|anthropic|chat\.completions/i.test(src));
  assert.ok(!/require\(['"].*propertyData/.test(src));
  const audit = auditOutcomeCollection({ listings: [], snapshots: [], outcomes: [] });
  assert.strictEqual(audit.providerCalls, false);
  assert.strictEqual(audit.llmCalls, false);
  assert.strictEqual(audit.recomputedPredictions, false);
});

test('excluded rows keep explicit reason counts', () => {
  const audit = auditOutcomeCollection({
    listings: [{ id: 10, category: 'sale', status: 'approved' }],
    snapshots: assessedSnapshots(),
    outcomes: [],
  });
  assert.ok(audit.evaluation.exclusions.missing_outcome >= 3);
});

test('sufficiency thresholds are unchanged', () => {
  assert.strictEqual(SAMPLE_SUFFICIENCY.noData, 'NO_DATA');
  assert.strictEqual(SAMPLE_SUFFICIENCY.verySparse, 'VERY_SPARSE');
  assert.strictEqual(SAMPLE_SUFFICIENCY.limited, 'LIMITED');
  assert.strictEqual(SAMPLE_SUFFICIENCY.sufficient, 'SUFFICIENT');
});

console.log('\nAll outcome collection tests passed.');
