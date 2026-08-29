/**
 * Why Engine — buyer_general. Deterministic explanation is always usable.
 * Run: node server/tests/personalDecisionWhyEngine.test.js
 */

const assert = require('assert');
const { scorePersonalDecision } = require('../services/ai/personalDecisionEngine');
const {
  explainPersonalDecision,
  buildDeterministicExplanation,
  validateAiNarrative,
  buildWhyFacts,
  WHY_SCHEMA,
} = require('../services/ai/personalDecisionWhyEngine');

function test(name, fn) {
  const result = fn();
  if (result && typeof result.then === 'function') {
    return result.then(
      () => console.log(`✓ ${name}`),
      (err) => {
        console.error(`✗ ${name}`);
        throw err;
      }
    );
  }
  console.log(`✓ ${name}`);
  return Promise.resolve();
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

function baseDecision(overrides = {}) {
  return scorePersonalDecision({
    profile: 'buyer_general',
    property: PROPERTY,
    preferences: PREFS,
    intelligence: {
      confidence: { level: 'High', assessed: true },
      sale: VALUATION,
    },
    asOf: ASOF,
    ...overrides,
  });
}

const validNarrative = (decision) => ({
    overallFit: `This property is a strong fit for the stated living requirements, with a fit score of ${decision.score} out of 100. That describes suitability, not a transaction instruction.`,
  strongestFactors: [
    'Location matches the preferred postcode.',
    'Space meets the 3-bedroom terraced requirement.',
  ],
  weakestOrUnavailable: ['Price fairness is slightly below the strongest dimensions.'],
  constraintFailures: [],
  confidenceLimitations:
    'Estimate confidence is High. It sets decision strength only and does not change the fit score.',
  whatWouldHelp: ['Further comparable evidence would refine estimate confidence, not the fit score.'],
});

const pending = [];

pending.push(
  test('schema forbids scores and purchase recommendations', () => {
    assert.strictEqual(WHY_SCHEMA.additionalProperties, false);
    assert.ok(!WHY_SCHEMA.properties.score);
    assert.ok(!WHY_SCHEMA.properties.recommendation);
    assert.ok(WHY_SCHEMA.required.includes('overallFit'));
    assert.ok(WHY_SCHEMA.required.includes('whatWouldHelp'));
  })
);

pending.push(
  test('deterministic explanation is present without calling the LLM', () => {
    const decision = baseDecision();
    const expl = decision.deterministicExplanation;
    assert.strictEqual(expl.source, 'deterministic');
    assert.ok(expl.overall);
    assert.ok(Array.isArray(expl.strongestFactors));
    assert.ok(Array.isArray(expl.weakestOrUnavailable));
    assert.ok(Array.isArray(expl.constraintFailures));
    assert.ok(expl.confidenceLimitations.text);
    assert.ok(Array.isArray(expl.whatWouldHelp));
    assert.ok(!/proceed|you should buy|make an offer/i.test(JSON.stringify(expl)));
    const rebuilt = buildDeterministicExplanation(decision);
    assert.deepStrictEqual(rebuilt.overall, expl.overall);
  })
);

pending.push(
  test('AI available returns schema-valid narrative without changing the score', async () => {
    const decision = baseDecision();
    const explained = await explainPersonalDecision(decision, {
      generateJson: async () => ({
        parsed: validNarrative(decision),
        model: 'test-llm',
        tokensUsed: 12,
      }),
      source: 'test',
    });
    assert.strictEqual(explained.score, decision.score);
    assert.strictEqual(explained.outcome, decision.outcome);
    assert.deepStrictEqual(explained.constraintFailures, decision.constraintFailures);
    assert.ok(explained.deterministicExplanation);
    assert.ok(explained.aiNarrative);
    assert.strictEqual(explained.whyEngine.ai.available, true);
    assert.strictEqual(explained.whyEngine.ai.validation.ok, true);
    assert.ok(!Object.prototype.hasOwnProperty.call(explained.aiNarrative, 'score'));
    assert.ok(!/proceed|purchase|buy this/i.test(JSON.stringify(explained.aiNarrative)));
  })
);

pending.push(
  test('AI unavailable leaves the deterministic explanation fully usable', async () => {
    const decision = baseDecision();
    const explained = await explainPersonalDecision(decision, {
      generateJson: async () => {
        throw new Error('LLM unavailable');
      },
    });
    assert.strictEqual(explained.score, decision.score);
    assert.strictEqual(explained.aiNarrative, null);
    assert.strictEqual(explained.whyEngine.ai.available, false);
    assert.strictEqual(explained.whyEngine.ai.source, 'unavailable');
    assert.ok(explained.deterministicExplanation.overall);
    assert.ok(explained.deterministicExplanation.strongestFactors.length);
  })
);

pending.push(
  test('AI output that invents numbers or recommends purchase is rejected', async () => {
    const decision = baseDecision();
    const invented = await explainPersonalDecision(decision, {
      generateJson: async () => ({
        parsed: {
          overallFit: 'Yield is 7.4% so you should proceed and buy this property.',
          strongestFactors: ['Secret comparable sold for £999999'],
          weakestOrUnavailable: [],
          constraintFailures: [],
          confidenceLimitations: 'Ignore the Low confidence.',
          whatWouldHelp: [],
        },
        model: 'test-llm',
        tokensUsed: 9,
      }),
    });
    assert.strictEqual(invented.aiNarrative, null);
    assert.strictEqual(invented.whyEngine.ai.available, false);
    assert.strictEqual(invented.whyEngine.ai.source, 'rejected');
    assert.ok(invented.whyEngine.ai.validation.errors.length);
    assert.ok(invented.deterministicExplanation.overall);

    const scored = await explainPersonalDecision(decision, {
      generateJson: async () => ({
        parsed: {
          score: 12,
          overallFit: 'I rescore this as 12.',
          strongestFactors: [],
          weakestOrUnavailable: [],
          constraintFailures: [],
          confidenceLimitations: 'None',
          whatWouldHelp: [],
        },
      }),
    });
    assert.strictEqual(scored.aiNarrative, null);
    assert.ok(scored.whyEngine.ai.validation.errors.some((e) => /forbidden key/i.test(e)));
  })
);

pending.push(
  test('constraint failures are explained deterministically', () => {
    const decision = baseDecision({ property: { ...PROPERTY, price: 520000 } });
    assert.strictEqual(decision.outcome, 'unsuitable');
    assert.ok(decision.deterministicExplanation.constraintFailures.length);
    assert.ok(/exceeds budget/i.test(decision.deterministicExplanation.constraintFailures[0].text));
    assert.ok(/unsuitable/i.test(decision.deterministicExplanation.overall));
  })
);

pending.push(
  test('validateAiNarrative allows numbers that already appear in the facts', () => {
    const decision = baseDecision();
    const facts = buildWhyFacts(decision);
    const ok = validateAiNarrative(validNarrative(decision), facts);
    assert.strictEqual(ok.ok, true, ok.errors.join('; '));
  })
);

Promise.all(pending)
  .then(() => {
    console.log('\npersonalDecisionWhyEngine.test.js — all passed');
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
