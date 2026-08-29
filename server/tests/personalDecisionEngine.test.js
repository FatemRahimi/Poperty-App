/**
 * personal-decision-1.0.0 — buyer_general scoring.
 * Run: node server/tests/personalDecisionEngine.test.js
 */

const assert = require('assert');
const { scorePersonalDecision } = require('../services/ai/personalDecisionEngine');
const { personalDecisionConfig, BUYER_GENERAL_WEIGHTS } = require('../config/personalDecision.config');

function test(name, fn) {
  fn();
  console.log(`✓ ${name}`);
}

const ASOF = '2026-06-01T00:00:00.000Z';

const PROPERTY = {
  id: 1,
  price: 380000,
  city: 'Manchester',
  zip_code: 'M1 1AA',
  bedrooms: 3,
  property_type: 'Terraced',
  title: '3 bed terrace',
  description: 'Family home with garden near the station.',
  has_garden: true,
  has_garage: true,
  parking_spaces: 1,
  commuteMinutes: 22,
};

const PREFS = {
  budgetMax: 400000,
  location: 'M1 1AA',
  bedrooms: 3,
  propertyType: 'Terraced',
  lifestyle: 'family garden',
  maxCommuteMinutes: 30,
};

const VALUATION = {
  success: true,
  centralEstimate: 375000,
  lowerEstimate: 360000,
  upperEstimate: 390000,
  evidenceCount: 8,
  confidence: 'high',
};

const HIGH_CONFIDENCE = { level: 'High', assessed: true };
const LOW_CONFIDENCE = { level: 'Low', assessed: true };

function baseInput(overrides = {}) {
  return {
    profile: 'buyer_general',
    property: PROPERTY,
    preferences: PREFS,
    intelligence: {
      confidence: HIGH_CONFIDENCE,
      sale: VALUATION,
    },
    asOf: ASOF,
    ...overrides,
  };
}

test('buyer_general is defined with split lifestyle and transport weights', () => {
  const profile = personalDecisionConfig.profiles.buyer_general;
  assert.strictEqual(profile.enabled, true);
  assert.ok(profile.definition);
  assert.strictEqual(profile.dimensionSet, 'buyer_general');
  assert.deepStrictEqual(profile.hardConstraints, ['budget', 'bedrooms']);
  assert.deepStrictEqual(profile.weights, BUYER_GENERAL_WEIGHTS);
  assert.ok(profile.weights.lifestyle);
  assert.ok(profile.weights.transport);
  assert.ok(!Object.prototype.hasOwnProperty.call(profile.weights, 'lifestyleTransport'));
  const sum = Object.values(profile.weights).reduce((s, w) => s + w, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.strictEqual(personalDecisionConfig.profiles.buyer_family.enabled, false);
  assert.strictEqual(personalDecisionConfig.profiles.landlord.enabled, true);
  assert.strictEqual(personalDecisionConfig.profiles.investor_yield.enabled, false);
});

test('model version is personal-decision-1.0.0 and stamps confidence-1.1.0', () => {
  const r = scorePersonalDecision(baseInput());
  assert.strictEqual(personalDecisionConfig.baseVersion, 'personal-decision-1.0.0');
  assert.strictEqual(r.model.version, 'personal-decision-1.0.0');
  assert.strictEqual(r.model.profile, 'buyer_general');
  assert.strictEqual(r.model.confidenceModel, 'confidence-1.1.0');
  assert.ok(r.model.weights);
  assert.strictEqual(r.model.minCoverage, 0.5);
  assert.deepStrictEqual(r.model.outcomeThresholds, { strong_fit: 80, good_fit: 65, mixed_fit: 50 });
  assert.strictEqual(r.assessedAt, ASOF);
  assert.ok(!Object.prototype.hasOwnProperty.call(r, 'recommendation'));
});

test('unsupported profiles do not produce a score', () => {
  const r = scorePersonalDecision(baseInput({ profile: 'investor_yield' }));
  assert.strictEqual(r.available, false);
  assert.strictEqual(r.score, null);
  assert.ok(/not implemented/i.test(r.unavailableReason));
});

test('excellent fit produces a high score, suitable, and strong_fit', () => {
  const r = scorePersonalDecision(baseInput());
  assert.strictEqual(r.available, true);
  assert.ok(r.score >= 80, `expected strong fit, got ${r.score}`);
  assert.strictEqual(r.decision, 'suitable');
  assert.strictEqual(r.decisionStrength, 'strong');
  assert.strictEqual(r.outcome, 'strong_fit');
  assert.strictEqual(r.constraintFailures.length, 0);
  assert.ok(r.dimensions.affordability.available);
  assert.ok(r.dimensions.location.available);
  assert.ok(r.dimensions.space.available);
  assert.ok(r.dimensions.priceFairness.available);
  assert.ok(r.dimensions.lifestyle.available);
  assert.ok(r.dimensions.transport.available);
  assert.ok(!r.dimensions.lifestyleTransport);
  assert.ok(r.why.every((w) => Object.prototype.hasOwnProperty.call(w, 'evidence')));
  assert.ok(r.deterministicExplanation);
  assert.ok(/strong fit/i.test(r.deterministicExplanation.overall));
  assert.ok(!/you should buy|make an offer|proceed to buy/i.test(r.deterministicExplanation.overall));
});

test('over-budget hard failure keeps the numeric score but marks unsuitable', () => {
  const r = scorePersonalDecision(
    baseInput({
      property: { ...PROPERTY, price: 520000 },
    })
  );
  assert.strictEqual(r.available, true, 'score is still computed');
  assert.ok(r.score < 80);
  assert.strictEqual(r.decision, 'unsuitable');
  assert.ok(r.constraintFailures.some((f) => f.constraint === 'budget'));
  assert.strictEqual(r.outcome, 'unsuitable');
  assert.ok(r.dimensions.affordability.available);
  assert.ok(r.dimensions.affordability.score < 30);
});

test('missing optional data is excluded and weights renormalise', () => {
  const r = scorePersonalDecision(
    baseInput({
      preferences: { budgetMax: 400000, bedrooms: 3 },
    })
  );
  assert.strictEqual(r.dimensions.location.available, false);
  assert.strictEqual(r.dimensions.lifestyle.available, false);
  assert.strictEqual(r.dimensions.transport.available, false);
  assert.ok(r.notAssessed.some((n) => n.dimension === 'location'));
  assert.ok(r.notAssessed.some((n) => n.dimension === 'lifestyle'));
  assert.ok(r.notAssessed.some((n) => n.dimension === 'transport'));
  assert.strictEqual(r.available, true, 'budget + space + price fairness exceed 50%');
  assert.ok(r.coverage.weightRetained >= 0.5);
  assert.ok(
    r.coverage.weightRetained < 1,
    'optional gaps must reduce retained weight, not fill with a default'
  );
});

test('insufficient coverage yields no score rather than a fabricated one', () => {
  const r = scorePersonalDecision({
    profile: 'buyer_general',
    property: { id: 2, price: 250000 },
    preferences: {},
    intelligence: {},
    asOf: ASOF,
  });
  assert.strictEqual(r.available, false);
  assert.strictEqual(r.score, null);
  assert.strictEqual(r.decision, 'insufficient_evidence');
  assert.strictEqual(r.decisionStrength, 'none');
  assert.strictEqual(r.outcome, null);
  assert.ok(r.coverage.weightRetained < 0.5);
  assert.ok(/minimum 50%/i.test(r.unavailableReason));
});

test('low-confidence valuation does not change the numeric fit score or outcome', () => {
  const high = scorePersonalDecision(baseInput());
  const low = scorePersonalDecision(
    baseInput({
      intelligence: { confidence: LOW_CONFIDENCE, sale: VALUATION },
    })
  );
  assert.strictEqual(low.score, high.score, 'confidence must not rescale the fit number');
  assert.strictEqual(high.decisionStrength, 'strong');
  assert.strictEqual(low.decisionStrength, 'weak');
  assert.strictEqual(high.outcome, 'strong_fit');
  assert.strictEqual(low.outcome, 'strong_fit', 'confidence must not change the fit outcome');
  assert.strictEqual(low.decision, 'suitable');
  assert.ok(low.confidence.note.includes('does not change the numeric fit score'));
});

test('missing valuation excludes price-fairness and renormalises', () => {
  const withVal = scorePersonalDecision(baseInput());
  const without = scorePersonalDecision(
    baseInput({
      intelligence: { confidence: HIGH_CONFIDENCE },
    })
  );
  assert.strictEqual(without.dimensions.priceFairness.available, false);
  assert.strictEqual(without.dimensions.priceFairness.state, 'no_valuation');
  assert.ok(without.notAssessed.some((n) => n.dimension === 'priceFairness'));
  assert.strictEqual(without.available, true);
  assert.notStrictEqual(
    without.score,
    withVal.score,
    'dropping price-fairness must change the renormalised score'
  );
  assert.ok(without.coverage.weightRetained < withVal.coverage.weightRetained);
});

test('bedroom must-have failure marks unsuitable while still scoring space', () => {
  const r = scorePersonalDecision(
    baseInput({
      property: { ...PROPERTY, bedrooms: 2 },
      preferences: { ...PREFS, bedrooms: 3, bedroomsMustHave: true },
    })
  );
  assert.ok(r.constraintFailures.some((f) => f.constraint === 'bedrooms'));
  assert.strictEqual(r.decision, 'unsuitable');
  assert.strictEqual(r.outcome, 'unsuitable');
  assert.ok(r.dimensions.space.available);
  assert.ok(r.dimensions.space.score < 100);
});

test('parking garden and family-space are not transport evidence', () => {
  const r = scorePersonalDecision(
    baseInput({
      preferences: {
        ...PREFS,
        lifestyle: 'family garden parking',
        transport: 'parking',
        maxCommuteMinutes: undefined,
      },
      property: { ...PROPERTY, commuteMinutes: undefined },
    })
  );
  assert.strictEqual(r.dimensions.transport.available, false);
  assert.strictEqual(r.dimensions.transport.state, 'parking_is_not_transport');
  assert.ok(r.notAssessed.some((n) => n.dimension === 'transport'));
  assert.strictEqual(r.dimensions.lifestyle.available, true);
  assert.ok(r.dimensions.lifestyle.evidence.some((e) => /garden/i.test(e)));
  assert.ok(r.dimensions.lifestyle.evidence.some((e) => /family/i.test(e)));
  assert.ok(r.dimensions.lifestyle.evidence.some((e) => /parking/i.test(e)));
  assert.ok(!r.dimensions.transport.evidence.some((e) => /parking|garden|family/i.test(e)));
});

test('listing station wording without commute data leaves transport notAssessed', () => {
  const r = scorePersonalDecision(
    baseInput({
      preferences: { ...PREFS, transport: 'train', maxCommuteMinutes: undefined },
      property: { ...PROPERTY, commuteMinutes: undefined },
    })
  );
  assert.strictEqual(r.dimensions.transport.available, false);
  assert.strictEqual(r.dimensions.transport.state, 'no_transport_data');
});

test('exact postcode may score highly when that is the location preference', () => {
  const r = scorePersonalDecision(baseInput());
  assert.strictEqual(r.dimensions.location.available, true);
  assert.ok(r.dimensions.location.score >= 95);
  assert.notStrictEqual(r.dimensions.location.state, 'incomplete_preference');
  assert.ok(r.dimensions.location.complete !== false);
});

test('postcode equality is not a complete location assessment for commute/radius/destination preferences', () => {
  const commute = scorePersonalDecision(
    baseInput({
      preferences: { ...PREFS, location: 'M1 1AA', locationType: 'commute' },
    })
  );
  assert.strictEqual(commute.dimensions.location.available, true);
  assert.ok(commute.dimensions.location.score <= 60);
  assert.strictEqual(commute.dimensions.location.state, 'incomplete_preference');
  assert.strictEqual(commute.dimensions.location.complete, false);

  const radius = scorePersonalDecision(
    baseInput({
      preferences: { ...PREFS, maxRadiusMiles: 2 },
    })
  );
  assert.strictEqual(radius.dimensions.location.state, 'incomplete_preference');
  assert.ok(radius.dimensions.location.score <= 60);

  const destination = scorePersonalDecision(
    baseInput({
      preferences: { ...PREFS, destination: 'Manchester Piccadilly' },
    })
  );
  assert.strictEqual(destination.dimensions.location.state, 'incomplete_preference');

  const commuteOnly = scorePersonalDecision(
    baseInput({
      preferences: { ...PREFS, location: 'within 30 minutes of Manchester' },
    })
  );
  assert.strictEqual(commuteOnly.dimensions.location.available, false);
  assert.strictEqual(commuteOnly.dimensions.location.state, 'commute_is_not_location');
});

test('identical inputs produce identical results', () => {
  const a = scorePersonalDecision(baseInput());
  const b = scorePersonalDecision(baseInput());
  assert.deepStrictEqual(a, b);
});

test('no property is a validation failure, not a fake score', () => {
  const r = scorePersonalDecision({ preferences: PREFS, asOf: ASOF });
  assert.strictEqual(r.available, false);
  assert.strictEqual(r.score, null);
  assert.ok(/no property/i.test(r.unavailableReason));
});

test('why evidence is structured per dimension and contains no invented numbers', () => {
  const r = scorePersonalDecision(baseInput());
  assert.strictEqual(r.why.length, 6);
  r.why.forEach((row) => {
    assert.ok(row.dimension);
    assert.strictEqual(typeof row.available, 'boolean');
    if (row.available) {
      assert.ok(Number.isFinite(row.score));
      assert.ok(Array.isArray(row.evidence));
    } else {
      assert.strictEqual(row.score, null);
      assert.ok(row.unavailableReason);
    }
  });
});

console.log('\npersonalDecisionEngine.test.js — all passed');
