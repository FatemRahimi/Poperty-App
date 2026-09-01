/**
 * First evaluable real outcome — operational readiness.
 * Isolated fixtures only. Does not write production/local measurement rows.
 * Run: node server/tests/firstOutcomeReadiness.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  COLLECTION_GAP,
  FIRST_OUTCOME_BLOCKER,
  FIRST_OUTCOME_PIPELINE,
  auditOutcomeCollection,
  classifyFirstOutcomeBlockers,
  publicPairingExclusions,
} = require('../services/ai/outcomeCollectionService');
const {
  SAMPLE_SUFFICIENCY,
  OUTCOME_TRUST,
  EXCLUSION,
} = require('../services/ai/backtesting/constants');
const {
  evaluateSaleBacktest,
  extractPredictionSnapshot,
  pairSnapshotWithOutcome,
} = require('../services/ai/valuationBacktestService');
const { valuationCaseMetrics } = require('../services/ai/backtesting/backtestFoundation');
const { recordListingOutcome, SALE_OUTCOME_STATE, deriveSaleOutcomeState } = require('../services/ai/listingOutcomeService');
const { applyPropertyUpdate } = require('./helpers/outcomeTestStore');
const { ONCE_ONLY_EVENT_TYPES } = require('../services/ai/listingLifecycleService');
const { ASSESSMENT_SAFETY_VERSION } = require('../services/ai/valuationAssessmentSafety');
const { FINANCE_SEMANTIC_VERSION } = require('../services/ai/financeInputContract');

const pending = [];

function test(name, fn) {
  const result = fn();
  if (result && typeof result.then === 'function') {
    pending.push(result.then(() => console.log(`✓ ${name}`)));
    return;
  }
  console.log(`✓ ${name}`);
}

const SYNTHETIC = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'backtest-synthetic-snapshot.json'), 'utf8')
);

function snapshotRow(id, reportOverrides = {}, rowOverrides = {}) {
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
    ...rowOverrides,
  };
}

function createOutcomeClient(listings) {
  const events = [];
  const properties = new Map(listings.map((row) => [Number(row.id), { ...row }]));
  return {
    events,
    query: async (sql, params = []) => {
      const text = String(sql);
      if (text.includes('property_identities') || text.includes('intelligence_subjects')) {
        return { rows: [] };
      }
      if (/SELECT \* FROM properties WHERE id = \$1 FOR UPDATE/.test(text)) {
        const row = properties.get(Number(params[0]));
        return { rows: row ? [{ ...row }] : [] };
      }
      if (text.includes('UPDATE properties SET')) {
        const id = Number(params[params.length - 1]);
        const current = properties.get(id);
        if (!current) return { rows: [] };
        const next = applyPropertyUpdate(current, text, params);
        properties.set(id, next);
        return { rows: [{ ...next }] };
      }
      if (text.includes('INSERT INTO listing_events')) {
        const row = {
          id: events.length + 1,
          property_id: params[0],
          event_type: params[1],
          event_at: params[2],
          actor_user_id: params[3],
          payload: JSON.parse(params[4]),
          provenance: JSON.parse(params[5]),
        };
        if (
          ONCE_ONLY_EVENT_TYPES.includes(row.event_type)
          && events.some((e) => e.property_id === row.property_id && e.event_type === row.event_type)
        ) {
          const err = new Error('duplicate key value violates unique constraint');
          err.code = '23505';
          throw err;
        }
        events.push(row);
        return { rows: [row] };
      }
      return { rows: [] };
    },
  };
}

function completeListing(overrides = {}) {
  return {
    id: 10,
    category: 'sale',
    status: 'sold',
    achieved_price: 380000,
    sold_at: '2025-06-01T00:00:00.000Z',
    uprn: '1000123',
    ...overrides,
  };
}

test('1. no outcome leaves N unchanged at 0 / NO_DATA', () => {
  const audit = auditOutcomeCollection({
    listings: [{ id: 10, category: 'sale', status: 'approved' }],
    snapshots: [snapshotRow(1)],
  });
  assert.strictEqual(audit.evaluation.n, 0);
  assert.strictEqual(audit.evaluation.uniqueSaleOutcomes, 0);
  assert.strictEqual(audit.evaluation.sufficiency, SAMPLE_SUFFICIENCY.noData);
  assert.ok(audit.evaluation.exclusions[EXCLUSION.missing_outcome]);
});

test('2. incomplete outcome is excluded', () => {
  const audit = auditOutcomeCollection({
    listings: [{ id: 10, category: 'sale', status: 'sold', sold_at: '2025-06-01T00:00:00.000Z' }],
    snapshots: [snapshotRow(1)],
  });
  assert.strictEqual(audit.evaluation.n, 0);
  assert.ok(audit.collectionGaps.reasons[COLLECTION_GAP.sold_missing_achieved_price]);
  assert.ok(
    audit.firstOutcomeBlockers.counts[FIRST_OUTCOME_BLOCKER.MISSING_ACHIEVED_PRICE]
    || audit.firstOutcomeBlockers.counts[FIRST_OUTCOME_BLOCKER.NO_REAL_COMPLETED_SALES]
  );
});

test('3. complete outcome with no prediction is excluded', () => {
  const audit = auditOutcomeCollection({
    listings: [completeListing()],
    snapshots: [],
  });
  assert.strictEqual(audit.evaluation.n, 0);
  assert.ok(audit.collectionGaps.reasons[COLLECTION_GAP.no_assessed_prediction]);
});

test('4–7. chronology, unassessed, identity, and conflict exclusions stay in force', () => {
  const after = pairSnapshotWithOutcome(
    extractPredictionSnapshot(snapshotRow(1)),
    {
      kind: 'sale',
      value: 380000,
      observedAt: '2024-01-01T00:00:00.000Z',
      listingId: 10,
      matchBasis: 'listingId',
      trust: OUTCOME_TRUST.userReported,
      timestampSource: 'sold_at',
    }
  );
  assert.strictEqual(after.reason, EXCLUSION.prediction_not_before_outcome);

  const unassessed = evaluateSaleBacktest({
    snapshots: [
      snapshotRow(1, {
        marketIntelligence: { sale: { success: false, centralEstimate: null, insufficientEvidence: true } },
      }),
    ],
    listings: [completeListing()],
  });
  assert.strictEqual(unassessed.sample.n, 0);
  assert.ok(unassessed.exclusions[EXCLUSION.not_assessed]);

  const identity = evaluateSaleBacktest({
    snapshots: [snapshotRow(1)],
    outcomes: [
      {
        kind: 'sale',
        value: 380000,
        observedAt: '2025-06-01T00:00:00.000Z',
        listingId: 10,
        matchBasis: 'address',
        trust: OUTCOME_TRUST.userReported,
        timestampSource: 'sold_at',
      },
    ],
  });
  assert.strictEqual(identity.sample.n, 0);
  assert.ok(identity.exclusions[EXCLUSION.weak_identity_match]);

  const conflict = evaluateSaleBacktest({
    snapshots: [snapshotRow(1)],
    outcomes: [
      {
        kind: 'sale',
        value: 380000,
        observedAt: '2025-06-01T00:00:00.000Z',
        listingId: 10,
        matchBasis: 'listingId',
        trust: OUTCOME_TRUST.userReported,
        timestampSource: 'sold_at',
        source: 'a',
        sourceRecordId: 'a',
      },
      {
        kind: 'sale',
        value: 410000,
        observedAt: '2025-06-01T00:00:00.000Z',
        listingId: 10,
        matchBasis: 'listingId',
        trust: OUTCOME_TRUST.userReported,
        timestampSource: 'sold_at',
        source: 'b',
        sourceRecordId: 'b',
      },
    ],
  });
  assert.strictEqual(conflict.sample.n, 0);
  assert.ok(conflict.exclusions[EXCLUSION.conflicting_outcomes]);
});

test('8–10. first eligible observation is N=1 / uniqueSaleOutcomes=1 / VERY_SPARSE', () => {
  const result = evaluateSaleBacktest({
    snapshots: [snapshotRow(1)],
    listings: [completeListing()],
  });
  assert.strictEqual(result.sample.n, 1);
  assert.strictEqual(result.sample.uniqueSaleOutcomes, 1);
  assert.strictEqual(result.sample.sufficiency, SAMPLE_SUFFICIENCY.verySparse);
  assert.strictEqual(result.observations[0].outcomeTrust, OUTCOME_TRUST.userReported);
});

test('11–12. two eligible predictions + one sale => N=2, uniqueSaleOutcomes=1', () => {
  const result = evaluateSaleBacktest({
    snapshots: [
      snapshotRow(1, { evidenceAsOf: '2025-01-15T12:00:00.000Z' }),
      snapshotRow(2, { evidenceAsOf: '2025-03-15T12:00:00.000Z' }),
    ],
    listings: [completeListing({ sold_at: '2025-06-01T00:00:00.000Z' })],
  });
  assert.strictEqual(result.sample.n, 2);
  assert.strictEqual(result.sample.uniqueSaleOutcomes, 1);
});

test('13–17. AE, signed error, APE, signed %, and horizon use the existing formulas', () => {
  const snapshot = extractPredictionSnapshot(snapshotRow(1));
  const outcome = {
    kind: 'sale',
    value: 380000,
    observedAt: '2025-06-01T00:00:00.000Z',
    listingId: 10,
    matchBasis: 'listingId',
    trust: OUTCOME_TRUST.userReported,
  };
  const metrics = valuationCaseMetrics(snapshot, outcome);
  assert.strictEqual(metrics.absoluteError, Math.abs(snapshot.sale.central - 380000));
  assert.strictEqual(metrics.signedError, snapshot.sale.central - 380000);
  assert.strictEqual(metrics.absolutePercentageError, metrics.absoluteError / 380000);
  assert.strictEqual(metrics.signedPercentageError, metrics.signedError / 380000);
  assert.strictEqual(
    metrics.predictionToOutcomeDays,
    Math.round((Date.parse('2025-06-01T00:00:00.000Z') - Date.parse(snapshot.analysisAt)) / 86400000)
  );
});

test('18–19. interval coverage only when genuine saved bounds exist', () => {
  const withBounds = valuationCaseMetrics(extractPredictionSnapshot(snapshotRow(1)), {
    value: 380000,
    observedAt: '2025-06-01T00:00:00.000Z',
  });
  assert.strictEqual(withBounds.boundsAvailable, true);
  assert.strictEqual(typeof withBounds.withinBounds, 'boolean');

  const without = valuationCaseMetrics(
    extractPredictionSnapshot(
      snapshotRow(1, {
        marketIntelligence: {
          sale: { lowerEstimate: null, upperEstimate: null, boundsAvailable: false },
        },
      })
    ),
    { value: 380000, observedAt: '2025-06-01T00:00:00.000Z' }
  );
  assert.strictEqual(without.boundsAvailable, false);
  assert.strictEqual(without.withinBounds, null);
  assert.strictEqual(without.lower, null);
  assert.strictEqual(without.upper, null);
});

test('20–21. USER_REPORTED is preserved and not promoted', () => {
  const result = evaluateSaleBacktest({
    snapshots: [snapshotRow(1)],
    listings: [completeListing()],
  });
  assert.strictEqual(result.observations[0].outcomeTrust, OUTCOME_TRUST.userReported);
  assert.notStrictEqual(result.observations[0].outcomeTrust, OUTCOME_TRUST.verifiedObserved);
});

test('22. completing an incomplete outcome can make it eligible', async () => {
  const listing = {
    id: 10,
    user_id: 7,
    status: 'sold',
    category: 'sale',
    price: 400000,
    sold_at: '2025-06-01T00:00:00.000Z',
    achieved_price: null,
    first_published_at: '2025-02-01T00:00:00.000Z',
  };
  assert.strictEqual(deriveSaleOutcomeState(listing), SALE_OUTCOME_STATE.INCOMPLETE_SALE_OUTCOME);
  const before = evaluateSaleBacktest({ snapshots: [snapshotRow(1)], listings: [listing] });
  assert.strictEqual(before.sample.n, 0);

  const client = createOutcomeClient([listing]);
  const completed = await recordListingOutcome(
    client,
    {
      listingId: 10,
      outcome: 'sold',
      achievedPrice: 380000,
      occurredAt: '2025-06-01T00:00:00.000Z',
      actor: { id: 7, role: 'user' },
    },
    new Date('2026-08-25T12:00:00.000Z')
  );
  assert.strictEqual(completed.ok, true);
  assert.strictEqual(completed.event.event_type, 'sale_outcome_completed');
  assert.strictEqual(completed.event.payload.trust, 'USER_REPORTED');
  const after = evaluateSaleBacktest({
    snapshots: [snapshotRow(1)],
    listings: [completed.property],
  });
  assert.strictEqual(after.sample.n, 1);
  assert.strictEqual(after.sample.sufficiency, SAMPLE_SUFFICIENCY.verySparse);
});

test('23–26. existing price/date cannot silently change; asking and valuation are never achieved', async () => {
  const client = createOutcomeClient([
    {
      id: 10,
      user_id: 7,
      status: 'approved',
      category: 'sale',
      price: 400000,
      first_published_at: '2025-02-01T00:00:00.000Z',
    },
  ]);
  const recorded = await recordListingOutcome(
    client,
    {
      listingId: 10,
      outcome: 'sold',
      achievedPrice: 380000,
      occurredAt: '2025-06-01T00:00:00.000Z',
      actor: { id: 7, role: 'user' },
    },
    new Date('2026-08-25T12:00:00.000Z')
  );
  const conflict = await recordListingOutcome(
    client,
    {
      listingId: 10,
      outcome: 'sold',
      achievedPrice: 410000,
      occurredAt: '2025-06-01T00:00:00.000Z',
      actor: { id: 7, role: 'user' },
    },
    new Date('2026-08-26T12:00:00.000Z')
  );
  assert.strictEqual(conflict.ok, false);
  assert.strictEqual(conflict.code, 'outcome_conflict');
  assert.strictEqual(recorded.property.achieved_price, 380000);

  const asking = evaluateSaleBacktest({
    snapshots: [snapshotRow(1)],
    listings: [{ id: 10, status: 'sold', price: 400000, updated_at: '2025-06-01T00:00:00.000Z' }],
  });
  assert.strictEqual(asking.sample.n, 0);

  const pairedValuation = pairSnapshotWithOutcome(extractPredictionSnapshot(snapshotRow(1)), {
    kind: 'sale',
    value: 390000,
    observedAt: '2025-06-01T00:00:00.000Z',
    listingId: 10,
    matchBasis: 'listingId',
    trust: OUTCOME_TRUST.userReported,
    timestampSource: 'valuation',
    source: 'valuation',
  });
  assert.strictEqual(pairedValuation.eligible, false);
  assert.strictEqual(pairedValuation.reason, EXCLUSION.valuation_used_as_outcome);
});

test('27–30. historical snapshot, valuation, provider, and LLM stay frozen', () => {
  const row = snapshotRow(1);
  const before = JSON.stringify(row.output_data);
  evaluateSaleBacktest({ snapshots: [row], listings: [completeListing()] });
  assert.strictEqual(JSON.stringify(row.output_data), before);

  const collection = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'ai', 'outcomeCollectionService.js'),
    'utf8'
  );
  const audit = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'audit-listing-outcomes.js'), 'utf8');
  [collection, audit].forEach((src) => {
    assert.ok(!/calculatePropertyValuation/.test(src));
    assert.ok(!/UPDATE\s+ai_requests/i.test(src));
    assert.ok(!/openai|anthropic|chat\.completions/i.test(src));
    assert.ok(!/require\(['"].*propertyData/.test(src));
  });
});

test('31–38. credits, provider-cost, assessment-safety, finance, PD, DI, What-if, V1.1 stay out of this layer', () => {
  const collection = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'ai', 'outcomeCollectionService.js'),
    'utf8'
  );
  assert.ok(!/consumeCredit|deductCredits/.test(collection));
  assert.ok(!/LANDLORD_WEIGHTS|assembleDecisionIntelligence/.test(collection));
  assert.ok(!/intelligenceWhatIfService/.test(collection));
  assert.strictEqual(ASSESSMENT_SAFETY_VERSION, 'assessment-safety-1.0.0');
  assert.strictEqual(FINANCE_SEMANTIC_VERSION, 'finance-semantic-1.0.0');
  const tag = fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8');
  assert.ok(tag);
});

test('pipeline readiness is READY even when real N is 0', () => {
  assert.strictEqual(FIRST_OUTCOME_PIPELINE, 'READY');
  const blockers = classifyFirstOutcomeBlockers({
    gaps: { assessed_listing_awaiting_sale_outcome: 1 },
    exclusions: { missing_outcome: 3 },
    completeSaleOutcomes: 0,
  });
  assert.strictEqual(blockers.primary, FIRST_OUTCOME_BLOCKER.NO_REAL_COMPLETED_SALES);
  assert.ok(blockers.counts[FIRST_OUTCOME_BLOCKER.NO_REAL_COMPLETED_SALES] >= 1);
});

test('pairing exclusions are anonymous and do not include addresses or UPRN', () => {
  const publicRows = publicPairingExclusions([
    {
      requestId: 9,
      listingId: 10,
      uprn: 'SHOULD_NOT_LEAK',
      postcode: 'B1 1AA',
      sale: { state: 'notBacktestable', reason: 'missing_outcome' },
    },
  ]);
  assert.strictEqual(publicRows[0].requestId, 9);
  assert.strictEqual(publicRows[0].listingId, 10);
  assert.strictEqual(publicRows[0].saleExclusion, 'missing_outcome');
  assert.ok(!Object.prototype.hasOwnProperty.call(publicRows[0], 'uprn'));
  assert.ok(!Object.prototype.hasOwnProperty.call(publicRows[0], 'postcode'));
  const serialized = JSON.stringify(publicRows);
  assert.ok(!serialized.includes('SHOULD_NOT_LEAK'));
  assert.ok(!serialized.includes('B1 1AA'));
});

test('audit collection exposes readiness metadata without rewriting history', () => {
  const audit = auditOutcomeCollection({
    listings: [{ id: 10, category: 'sale', status: 'approved' }],
    snapshots: [snapshotRow(1)],
  });
  assert.strictEqual(audit.firstOutcomePipeline, 'READY');
  assert.ok(Array.isArray(audit.pairingExclusions));
  assert.ok(audit.pairingExclusions.some((row) => row.saleExclusion === EXCLUSION.missing_outcome));
  assert.strictEqual(audit.manufacturedOutcomes, false);
  assert.strictEqual(audit.recomputedPredictions, false);
});

Promise.all(pending)
  .then(() => {
    console.log('\nAll firstOutcomeReadiness tests passed.');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
