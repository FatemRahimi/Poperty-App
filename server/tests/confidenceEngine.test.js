/**
 * Confidence engine tests — evidence quality, not source count.
 * Run: node server/tests/confidenceEngine.test.js
 */

const assert = require('assert');

const {
  assessConfidence,
  assessAreaEvidenceConfidence,
  summariseComparableEvidence,
  assessMethodAgreement,
  FACTOR_WEIGHTS,
} = require('../services/ai/confidenceEngine');

const ASOF = new Date('2026-08-22T00:00:00Z').getTime();
const DAY = 24 * 60 * 60 * 1000;

function daysAgo(n) {
  return new Date(ASOF - n * DAY).toISOString();
}

/** A close, recent, same-type comparable. */
function goodComp(i, overrides = {}) {
  return {
    id: i,
    similarity: 84,
    property_type: 'Terraced',
    bedrooms: 3,
    square_feet: 950,
    sold_date: daysAgo(20),
    locationTier: 'Same postcode',
    ...overrides,
  };
}

const TARGET = {
  property_type: 'Terraced',
  bedrooms: 3,
  square_feet: 980,
};

const HIGH_DATA_QUALITY = { score: 92, level: 'High' };

// --- Weights are a normalised, versioned vector ---
const weightSum = Object.values(FACTOR_WEIGHTS).reduce((s, w) => s + w, 0);
assert.ok(Math.abs(weightSum - 1) < 1e-9, `Factor weights must sum to 1, got ${weightSum}`);

// --- 1. Strong evidence -> High ---
const strong = assessConfidence({
  comparables: Array.from({ length: 12 }, (_, i) => goodComp(i)),
  target: TARGET,
  dataQuality: HIGH_DATA_QUALITY,
  methodEstimates: [
    { method: 'avm', value: 300000 },
    { method: 'comparables', value: 305000 },
    { method: 'sqft', value: 298000 },
  ],
  providerConfidence: 'high',
  asOf: ASOF,
});
assert.strictEqual(strong.level, 'High', 'Strong corroborated evidence should be High');
assert.strictEqual(strong.caps.length, 0, 'Strong evidence should trigger no caps');
assert.strictEqual(strong.evidence.sparseEvidence, false);
assert.ok(strong.reasons.some((r) => r.key === 'sampleSize' && r.direction === 'supports'));

// --- 2. Sparse evidence -> capped Low even with everything else perfect ---
const sparse = assessConfidence({
  comparables: [goodComp(1), goodComp(2)],
  target: TARGET,
  dataQuality: HIGH_DATA_QUALITY,
  methodEstimates: [
    { method: 'avm', value: 300000 },
    { method: 'comparables', value: 301000 },
  ],
  providerConfidence: 'high',
  asOf: ASOF,
});
assert.strictEqual(sparse.level, 'Low', 'Two comparables must cap confidence at Low');
assert.ok(
  sparse.caps.some((c) => c.rule === 'sparse_evidence'),
  'Sparse evidence cap must be reported explicitly'
);

// --- 3. Stale comparables -> capped Medium ---
const stale = assessConfidence({
  comparables: Array.from({ length: 12 }, (_, i) => goodComp(i, { sold_date: daysAgo(700) })),
  target: TARGET,
  dataQuality: HIGH_DATA_QUALITY,
  methodEstimates: [
    { method: 'avm', value: 300000 },
    { method: 'comparables', value: 302000 },
  ],
  asOf: ASOF,
});
assert.strictEqual(stale.level, 'Medium', 'Stale evidence must not reach High');
assert.ok(stale.caps.some((c) => c.rule === 'stale_evidence'));
assert.strictEqual(stale.evidence.staleCount, 12);
assert.ok(
  stale.reasons.find((r) => r.key === 'recency').state === 'stale',
  'Recency factor should report the stale state'
);

// --- 4. Mismatched property types -> capped Medium ---
const mismatched = assessConfidence({
  comparables: Array.from({ length: 10 }, (_, i) =>
    goodComp(i, { property_type: 'Detached', bedrooms: 5 })
  ),
  target: TARGET,
  dataQuality: HIGH_DATA_QUALITY,
  methodEstimates: [
    { method: 'avm', value: 300000 },
    { method: 'comparables', value: 303000 },
  ],
  asOf: ASOF,
});
assert.strictEqual(mismatched.level, 'Medium', 'Type-mismatched comparables must not reach High');
assert.ok(mismatched.caps.some((c) => c.rule === 'property_type_mismatch'));
assert.strictEqual(mismatched.evidence.typeMatchRate, 0);

// --- 5. Conflicting valuation methods -> capped Low ---
const conflicting = assessConfidence({
  comparables: Array.from({ length: 14 }, (_, i) => goodComp(i)),
  target: TARGET,
  dataQuality: HIGH_DATA_QUALITY,
  methodEstimates: [
    { method: 'avm', value: 250000 },
    { method: 'comparables', value: 420000 },
    { method: 'sqft', value: 330000 },
  ],
  providerConfidence: 'high',
  asOf: ASOF,
});
assert.strictEqual(conflicting.level, 'Low', 'Materially disagreeing methods must cap at Low');
assert.ok(conflicting.caps.some((c) => c.rule === 'methods_disagree'));
assert.ok(
  conflicting.evidence.methodAgreement.spreadPercent > 25,
  'Spread between methods should be reported'
);

// --- 6. Missing floor area lowers the attribute-match factor ---
const noFloorArea = assessConfidence({
  comparables: Array.from({ length: 10 }, (_, i) => goodComp(i, { square_feet: null })),
  target: { property_type: 'Terraced', bedrooms: 3 },
  dataQuality: HIGH_DATA_QUALITY,
  methodEstimates: [
    { method: 'avm', value: 300000 },
    { method: 'comparables', value: 302000 },
  ],
  asOf: ASOF,
});
const withFloorArea = assessConfidence({
  comparables: Array.from({ length: 10 }, (_, i) => goodComp(i)),
  target: TARGET,
  dataQuality: HIGH_DATA_QUALITY,
  methodEstimates: [
    { method: 'avm', value: 300000 },
    { method: 'comparables', value: 302000 },
  ],
  asOf: ASOF,
});
assert.strictEqual(noFloorArea.evidence.floorAreaCoverage, 0);
assert.strictEqual(noFloorArea.evidence.targetFloorAreaKnown, false);
assert.ok(
  noFloorArea.score < withFloorArea.score,
  'Missing floor area must reduce confidence relative to identical evidence with it'
);

// --- 7. Low provider coverage is reported and reduces confidence ---
const noProvider = assessConfidence({
  comparables: Array.from({ length: 12 }, (_, i) => goodComp(i)),
  target: TARGET,
  dataQuality: HIGH_DATA_QUALITY,
  methodEstimates: [
    { method: 'comparables', value: 302000 },
    { method: 'sqft', value: 300000 },
  ],
  providerCoverageAvailable: false,
  asOf: ASOF,
});
assert.ok(
  noProvider.reasons.some((r) => r.key === 'providerCoverage' && r.direction === 'limits'),
  'Absent provider coverage must appear as a limiting reason'
);
assert.ok(
  noProvider.score < strong.score,
  'No external coverage should score below externally corroborated evidence'
);

// --- 8. High data quality can still yield Low confidence ---
const goodPaperworkThinEvidence = assessConfidence({
  comparables: [goodComp(1)],
  target: TARGET,
  dataQuality: { score: 100, level: 'High' },
  methodEstimates: [{ method: 'comparables', value: 300000 }],
  asOf: ASOF,
});
assert.strictEqual(
  goodPaperworkThinEvidence.level,
  'Low',
  'Complete property data must not manufacture estimate confidence'
);
assert.strictEqual(goodPaperworkThinEvidence.dataQuality.level, 'High');
assert.ok(
  goodPaperworkThinEvidence.dataQuality.note.includes('separate concept'),
  'Data quality must be labelled as distinct from confidence'
);

// --- Single method has no corroboration ---
const singleMethod = assessConfidence({
  comparables: Array.from({ length: 15 }, (_, i) => goodComp(i)),
  target: TARGET,
  dataQuality: HIGH_DATA_QUALITY,
  methodEstimates: [{ method: 'comparables', value: 300000 }],
  providerConfidence: 'high',
  asOf: ASOF,
});
assert.strictEqual(singleMethod.level, 'Medium', 'One method alone cannot be High');
assert.ok(singleMethod.caps.some((c) => c.rule === 'single_method'));

// --- Loosely comparable evidence cannot be High however many records there are ---
const weakSimilarity = assessConfidence({
  comparables: Array.from({ length: 14 }, (_, i) => goodComp(i, { similarity: 45 })),
  target: TARGET,
  dataQuality: HIGH_DATA_QUALITY,
  methodEstimates: [
    { method: 'avm', value: 300000 },
    { method: 'comparables', value: 303000 },
  ],
  asOf: ASOF,
});
assert.strictEqual(weakSimilarity.level, 'Medium', 'Weak similarity must cap the level');
assert.ok(weakSimilarity.caps.some((c) => c.rule === 'weak_similarity'));

// --- Evidence from outside the immediate area cannot be High ---
const distant = assessConfidence({
  comparables: Array.from({ length: 14 }, (_, i) =>
    goodComp(i, { locationTier: 'Different area' })
  ),
  target: TARGET,
  dataQuality: HIGH_DATA_QUALITY,
  methodEstimates: [
    { method: 'avm', value: 300000 },
    { method: 'comparables', value: 303000 },
  ],
  asOf: ASOF,
});
assert.strictEqual(distant.level, 'Medium', 'Distant comparables must cap the level');
assert.ok(distant.caps.some((c) => c.rule === 'distant_evidence'));

// --- Bedroom mismatch is capped independently of property type ---
const bedroomMismatch = assessConfidence({
  comparables: Array.from({ length: 12 }, (_, i) => goodComp(i, { bedrooms: 5 })),
  target: TARGET,
  dataQuality: HIGH_DATA_QUALITY,
  methodEstimates: [
    { method: 'avm', value: 300000 },
    { method: 'comparables', value: 303000 },
  ],
  asOf: ASOF,
});
assert.strictEqual(bedroomMismatch.level, 'Medium');
assert.ok(bedroomMismatch.caps.some((c) => c.rule === 'bedroom_mismatch'));
assert.strictEqual(bedroomMismatch.evidence.bedroomMatchRate, 0);
assert.strictEqual(
  bedroomMismatch.evidence.typeMatchRate,
  1,
  'Bedroom mismatch must be judged separately from property type'
);

// --- Aggregation is conjunctive: strong factors must not average away a weak one ---
const oneWeakFactor = assessConfidence({
  comparables: Array.from({ length: 12 }, (_, i) => goodComp(i, { similarity: 30 })),
  target: TARGET,
  dataQuality: HIGH_DATA_QUALITY,
  methodEstimates: [
    { method: 'avm', value: 300000 },
    { method: 'comparables', value: 302000 },
    { method: 'sqft', value: 299000 },
  ],
  providerConfidence: 'high',
  asOf: ASOF,
});
assert.ok(
  oneWeakFactor.score < strong.score - 8,
  `A single weak factor must move the index materially (got ${oneWeakFactor.score} vs ${strong.score})`
);

// --- Confidence must never be presented as a percentage ---
assert.strictEqual(strong.scoreBasis, 'internal_index');
assert.ok(strong.scoreNote.includes('do not display as a percentage'));
assert.ok(['High', 'Medium', 'Low'].includes(strong.level));

// --- Missing factors reduce coverage rather than scoring as mediocre ---
const bare = assessConfidence({ sampleSize: 6, asOf: ASOF });
assert.ok(bare.coverage.factorsAvailable < bare.coverage.factorsTotal);
assert.ok(bare.limitations.length > 0, 'Unavailable factors must be listed as limitations');
assert.ok(
  bare.limitations.some((l) => l.key === 'dataCompleteness'),
  'Absent data quality is a limitation, not a neutral score'
);
assert.ok(bare.caps.some((c) => c.rule === 'thin_factor_coverage'));

// --- Reproducibility: same inputs and asOf produce an identical result ---
const runA = assessConfidence({
  comparables: Array.from({ length: 8 }, (_, i) => goodComp(i)),
  target: TARGET,
  dataQuality: HIGH_DATA_QUALITY,
  methodEstimates: [
    { method: 'avm', value: 300000 },
    { method: 'comparables', value: 305000 },
  ],
  asOf: ASOF,
});
const runB = assessConfidence({
  comparables: Array.from({ length: 8 }, (_, i) => goodComp(i)),
  target: TARGET,
  dataQuality: HIGH_DATA_QUALITY,
  methodEstimates: [
    { method: 'avm', value: 300000 },
    { method: 'comparables', value: 305000 },
  ],
  asOf: ASOF,
});
assert.deepStrictEqual(runA, runB, 'Identical inputs must reproduce an identical assessment');
assert.ok(runA.modelVersion, 'Assessment must carry a model version');

// --- Method agreement helper ---
assert.strictEqual(assessMethodAgreement([]).available, false);
assert.strictEqual(assessMethodAgreement([100000]).label, 'single_method');
assert.strictEqual(assessMethodAgreement([300000, 302000]).label, 'strong');
assert.strictEqual(assessMethodAgreement([250000, 420000]).label, 'weak');

// --- Comparable summary is a pure reduction ---
const summary = summariseComparableEvidence(
  [goodComp(1), goodComp(2, { similarity: 60, sold_date: daysAgo(100) })],
  { target: TARGET, asOf: ASOF }
);
assert.strictEqual(summary.comparableCount, 2);
assert.strictEqual(summary.medianSimilarity, 72);
assert.strictEqual(summary.medianAgeDays, 60);
assert.strictEqual(summary.typeMatchRate, 1);
assert.strictEqual(summary.sparseEvidence, true);

// --- Area aggregates keep their own documented ladder ---
assert.strictEqual(assessAreaEvidenceConfidence(0).level, 'Insufficient');
assert.strictEqual(assessAreaEvidenceConfidence(2).level, 'Low');
assert.strictEqual(assessAreaEvidenceConfidence(12).level, 'Medium');
assert.strictEqual(
  assessAreaEvidenceConfidence(40, false).level,
  'Medium',
  'Marketplace-only evidence cannot represent a whole postcode'
);
assert.strictEqual(assessAreaEvidenceConfidence(25, true).level, 'High');
assert.strictEqual(assessAreaEvidenceConfidence(6, true).level, 'Medium');
assert.ok(assessAreaEvidenceConfidence(2).sparseEvidence);
assert.ok(assessAreaEvidenceConfidence(12).reasons.length >= 2);

console.log('confidenceEngine.test.js — all passed');
