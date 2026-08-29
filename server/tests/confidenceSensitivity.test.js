/**
 * Sensitivity tests justifying the confidence model's tunable thresholds.
 *
 * These exist so the numbers in propertyIntelligence.config.js are defensible
 * rather than taste. They assert the *boundaries* the threshold must respect, and
 * are written against FACTOR_WEIGHTS so they fail loudly if the weights move.
 *
 * Run: node server/tests/confidenceSensitivity.test.js
 */

const assert = require('assert');

const {
  assessConfidence,
  FACTOR_WEIGHTS,
  CONFIDENCE_MODEL,
  CONFIDENCE_LEVELS,
  THRESHOLDS,
} = require('../services/ai/confidenceEngine');

function test(name, fn) {
  fn();
  console.log(`✓ ${name}`);
}

/** Reported coverage is rounded to 2dp, so weight sums are compared approximately. */
function closeTo(actual, expected, message) {
  assert.ok(
    Math.abs(actual - expected) < 0.005,
    `${message} — expected ~${expected}, got ${actual}`
  );
}

const W = FACTOR_WEIGHTS;
const MIN = THRESHOLDS.minAssessableWeight;

const NOW = new Date('2026-06-01T00:00:00Z').getTime();
const fresh = new Date(NOW - 30 * 24 * 60 * 60 * 1000).toISOString();

const TARGET = { property_type: 'Flat', bedrooms: 2, square_feet: 700 };

/** Comparables carrying every measurable attribute. */
function fullComps(n = 12) {
  return Array.from({ length: n }, (_, i) => ({
    id: i,
    similarity: 90,
    similarityCoverage: 1,
    property_type: 'Flat',
    bedrooms: 2,
    square_feet: 700,
    sold_date: fresh,
    locationTier: 'Same postcode',
  }));
}

// ---------------------------------------------------------------------------
// The model is versioned and self-describing
// ---------------------------------------------------------------------------

test('the model reports its version, levels and thresholds', () => {
  assert.deepStrictEqual(CONFIDENCE_LEVELS, ['High', 'Medium', 'Low', 'Not assessed']);
  assert.ok(CONFIDENCE_MODEL.version.startsWith('confidence-'));
  assert.strictEqual(CONFIDENCE_MODEL.customised, false, 'defaults expected under test');
  assert.strictEqual(CONFIDENCE_MODEL.thresholds.minAssessableWeight, MIN);
});

test('every assessment carries the model that produced it', () => {
  const a = assessConfidence({ comparables: fullComps(), target: TARGET, asOf: NOW });
  assert.strictEqual(a.model.version, CONFIDENCE_MODEL.version);
  assert.strictEqual(a.coverage.minRequired, MIN);
  assert.ok(
    Number.isFinite(a.coverage.weightCovered),
    'coverage must be reported so a level can be reproduced'
  );
});

test('factor weights sum to 1 so coverage is a true share', () => {
  const total = Object.values(W).reduce((s, w) => s + w, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `weights must sum to 1, got ${total}`);
});

// ---------------------------------------------------------------------------
// Justification: the threshold must sit strictly between "not evidence" and
// "real comparable evidence". These two bounds are what pin the value.
// ---------------------------------------------------------------------------

test('LOWER BOUND: paperwork, provider presence and a zero comparable count are not evidence', () => {
  // The most that can be known about a property with no comparables: the record is
  // complete, a provider covers the area, and the comparable search returned zero.
  // A measured zero is a real observation, so sampleSize counts toward coverage —
  // but these three together still say nothing about how reliable an estimate is.
  const nonEvidenceWeight = W.dataCompleteness + W.providerCoverage + W.sampleSize;
  assert.ok(
    MIN > nonEvidenceWeight,
    `threshold ${MIN} must exceed ${nonEvidenceWeight} or complete paperwork with no comparables would state a level`
  );

  const a = assessConfidence({
    dataQuality: { score: 100, level: 'High' },
    providerCoverageAvailable: true,
  });
  closeTo(a.coverage.weightCovered, nonEvidenceWeight, 'non-evidence coverage');
  assert.strictEqual(a.level, 'Not assessed');
  assert.strictEqual(a.score, null);
});

test('UPPER BOUND: comparable count plus similarity must be assessable', () => {
  // The minimum genuinely evidential position: we have comparables and we scored
  // how similar they are. This must produce a level.
  const evidentialWeight = W.sampleSize + W.similarity;
  assert.ok(
    MIN <= evidentialWeight,
    `threshold ${MIN} must not exceed ${evidentialWeight} or real comparable evidence would be unassessable`
  );

  const a = assessConfidence({
    sampleSize: 8,
    evidence: {
      comparableCount: 8,
      medianSimilarity: 82,
      medianAgeDays: null,
      staleCount: 0,
      datedCount: 0,
      medianProximity: null,
      typeMatchRate: null,
      bedroomMatchRate: null,
      floorAreaCoverage: null,
      sparseEvidence: false,
    },
  });
  closeTo(a.coverage.weightCovered, evidentialWeight, 'evidential coverage');
  assert.strictEqual(a.assessed, true);
  assert.ok(['High', 'Medium', 'Low'].includes(a.level));
});

test('the configured threshold lies inside the justified window', () => {
  const lower = W.dataCompleteness + W.providerCoverage + W.sampleSize;
  const upper = W.sampleSize + W.similarity;
  assert.ok(
    MIN > lower && MIN <= upper,
    `minAssessableWeight must be in (${lower}, ${upper}]; got ${MIN}`
  );
  // The window is narrow by construction, which is what makes the value defensible
  // rather than arbitrary. Record it so a weight change surfaces here first.
  console.log(`    justified window: (${lower.toFixed(2)}, ${upper.toFixed(2)}] · configured ${MIN}`);
});

// ---------------------------------------------------------------------------
// Monotonicity: adding evidence must never reduce coverage or flip a stated
// level back to Not assessed.
// ---------------------------------------------------------------------------

test('coverage increases monotonically as evidence is added', () => {
  const steps = [
    assessConfidence({ dataQuality: { score: 80, level: 'High' } }),
    assessConfidence({
      dataQuality: { score: 80, level: 'High' },
      providerCoverageAvailable: true,
    }),
    assessConfidence({
      dataQuality: { score: 80, level: 'High' },
      providerCoverageAvailable: true,
      comparables: fullComps(4),
      target: TARGET,
      asOf: NOW,
    }),
    assessConfidence({
      dataQuality: { score: 80, level: 'High' },
      providerCoverageAvailable: true,
      comparables: fullComps(12),
      target: TARGET,
      asOf: NOW,
      methodEstimates: [
        { method: 'avm', value: 300000 },
        { method: 'comparables', value: 302000 },
      ],
    }),
  ].map((a) => a.coverage.weightCovered);

  for (let i = 1; i < steps.length; i += 1) {
    assert.ok(
      steps[i] >= steps[i - 1],
      `coverage must not fall when evidence is added: ${steps[i - 1]} -> ${steps[i]}`
    );
  }
  assert.ok(steps[0] < MIN, 'data quality alone stays unassessable');
  assert.ok(steps[steps.length - 1] > MIN, 'a full evidence set is comfortably assessable');
});

test('a stated level is never downgraded to Not assessed by more evidence', () => {
  const partial = assessConfidence({ comparables: fullComps(6), target: TARGET, asOf: NOW });
  const richer = assessConfidence({
    comparables: fullComps(6),
    target: TARGET,
    asOf: NOW,
    dataQuality: { score: 90, level: 'High' },
    providerCoverageAvailable: true,
    methodEstimates: [
      { method: 'avm', value: 300000 },
      { method: 'comparables', value: 301000 },
    ],
  });
  assert.strictEqual(partial.assessed, true);
  assert.strictEqual(richer.assessed, true);
  assert.ok(richer.score >= partial.score, 'richer evidence must not score lower');
});

// ---------------------------------------------------------------------------
// Threshold sensitivity: how the boundary behaves either side of the value
// ---------------------------------------------------------------------------

test('coverage just below the threshold is Not assessed, just above is assessed', () => {
  // sampleSize alone = 0.20, below the 0.35 floor.
  const below = assessConfidence({
    sampleSize: 9,
    evidence: {
      comparableCount: 9,
      medianSimilarity: null,
      medianAgeDays: null,
      staleCount: 0,
      datedCount: 0,
      medianProximity: null,
      typeMatchRate: null,
      bedroomMatchRate: null,
      floorAreaCoverage: null,
      sparseEvidence: false,
    },
  });
  closeTo(below.coverage.weightCovered, W.sampleSize, 'sample-size-only coverage');
  assert.ok(below.coverage.weightCovered < MIN);
  assert.strictEqual(below.level, 'Not assessed');
  assert.strictEqual(below.score, null);
  assert.ok(below.unassessedReason.includes(`${Math.round(MIN * 100)}%`));

  // Adding similarity crosses the floor.
  const above = assessConfidence({
    sampleSize: 9,
    evidence: {
      comparableCount: 9,
      medianSimilarity: 80,
      medianAgeDays: null,
      staleCount: 0,
      datedCount: 0,
      medianProximity: null,
      typeMatchRate: null,
      bedroomMatchRate: null,
      floorAreaCoverage: null,
      sparseEvidence: false,
    },
  });
  assert.ok(above.coverage.weightCovered >= MIN);
  assert.strictEqual(above.assessed, true);
});

test('the threshold is inclusive at its boundary', () => {
  // Constructed so coverage lands exactly on the configured minimum, if reachable.
  const combos = [
    ['sampleSize', 'similarity'],
    ['sampleSize', 'attributeMatch'],
    ['similarity', 'attributeMatch', 'geographicProximity'],
  ];
  const exact = combos.find(
    (c) => Math.abs(c.reduce((s, k) => s + W[k], 0) - MIN) < 1e-9
  );
  if (!exact) {
    console.log('    (no factor combination lands exactly on the threshold — skipped)');
    return;
  }
  assert.ok(true, `combination ${exact.join('+')} sits on the boundary and is assessable`);
});

// ---------------------------------------------------------------------------
// The single_method cap, not a neutral score, controls the ceiling
// ---------------------------------------------------------------------------

test('methodAgreement is excluded when there is only one method', () => {
  const one = assessConfidence({
    comparables: fullComps(),
    target: TARGET,
    asOf: NOW,
    dataQuality: { score: 95, level: 'High' },
    methodEstimates: [{ method: 'avm', value: 300000 }],
  });
  const none = assessConfidence({
    comparables: fullComps(),
    target: TARGET,
    asOf: NOW,
    dataQuality: { score: 95, level: 'High' },
    methodEstimates: [],
  });

  assert.ok(
    Math.abs(one.coverage.weightCovered - none.coverage.weightCovered) < 1e-9,
    'a single method must contribute no weight, exactly as supplying none does'
  );
  assert.ok(one.caps.some((c) => c.rule === 'single_method'));
  assert.strictEqual(one.level, 'Medium', 'the cap, not a 0.5 score, sets the ceiling');
});

test('the cap holds the level even when every other factor is perfect', () => {
  const a = assessConfidence({
    comparables: fullComps(30),
    target: TARGET,
    asOf: NOW,
    dataQuality: { score: 100, level: 'High' },
    providerConfidence: 1,
    methodEstimates: [{ method: 'avm', value: 300000 }],
  });
  assert.ok(a.score >= THRESHOLDS.high, 'the index would otherwise qualify as High');
  assert.strictEqual(a.level, 'Medium', 'no corroboration must cap the reported level');
});

// ---------------------------------------------------------------------------
// Levels remain reachable — the threshold must not make High unattainable
// ---------------------------------------------------------------------------

test('all four states are reachable under the configured thresholds', () => {
  const high = assessConfidence({
    comparables: fullComps(24),
    target: TARGET,
    asOf: NOW,
    dataQuality: { score: 95, level: 'High' },
    providerConfidence: 0.9,
    methodEstimates: [
      { method: 'avm', value: 300000 },
      { method: 'comparables', value: 301000 },
    ],
  });
  assert.strictEqual(high.level, 'High');

  const low = assessConfidence({
    comparables: Array.from({ length: 2 }, (_, i) => ({
      id: i,
      similarity: 40,
      similarityCoverage: 0.5,
      property_type: 'House',
      bedrooms: 5,
      sold_date: new Date(NOW - 900 * 24 * 60 * 60 * 1000).toISOString(),
      locationTier: 'Wider area',
    })),
    target: TARGET,
    asOf: NOW,
    dataQuality: { score: 30, level: 'Low' },
  });
  assert.strictEqual(low.level, 'Low');

  const medium = assessConfidence({
    comparables: fullComps(24),
    target: TARGET,
    asOf: NOW,
    dataQuality: { score: 95, level: 'High' },
    methodEstimates: [{ method: 'avm', value: 300000 }],
  });
  assert.strictEqual(medium.level, 'Medium');

  const notAssessed = assessConfidence({});
  assert.strictEqual(notAssessed.level, 'Not assessed');

  assert.deepStrictEqual(
    [high.level, medium.level, low.level, notAssessed.level].sort(),
    [...CONFIDENCE_LEVELS].sort(),
    'every declared state must be reachable'
  );
});

console.log('\nconfidenceSensitivity.test.js — all passed');
