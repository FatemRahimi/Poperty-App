/**
 * What-if Simulator — buyer_general.
 * Run: node server/tests/personalDecisionWhatIf.test.js
 */

const assert = require('assert');
const {
  comparePersonalDecisionWhatIf,
  simulatePersonalDecisionWhatIf,
} = require('../services/ai/personalDecisionWhatIfEngine');
const { WHAT_IF_VERSION } = require('../config/personalDecision.config');

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

const FINANCE = {
  deposit: 76000,
  interestRate: 4.5,
  mortgageTermYears: 25,
};

function baseInput(overrides = {}) {
  return {
    profile: 'buyer_general',
    property: PROPERTY,
    preferences: PREFS,
    intelligence: {
      confidence: { level: 'High', assessed: true },
      sale: VALUATION,
    },
    finance: FINANCE,
    asOf: ASOF,
    ...overrides,
  };
}

const pending = [];

pending.push(
  test('model is personal-decision-whatif-1.0.0 and unsupported profiles do not run', () => {
    const ok = comparePersonalDecisionWhatIf(baseInput({ scenario: {} }));
    assert.strictEqual(WHAT_IF_VERSION, 'personal-decision-whatif-1.0.0');
    assert.strictEqual(ok.model.version, 'personal-decision-whatif-1.0.0');
    assert.strictEqual(ok.model.confidenceModel, 'confidence-1.1.0');
    const blocked = comparePersonalDecisionWhatIf(baseInput({ profile: 'buyer_family', scenario: {} }));
    assert.strictEqual(blocked.available, false);
    assert.strictEqual(blocked.baseScore, null);
  })
);

pending.push(
  test('lower offer improves affordability', () => {
    const r = comparePersonalDecisionWhatIf(
      baseInput({
        scenario: { offerPrice: 320000 },
      })
    );
    assert.ok(r.scenarioScore > r.baseScore, `expected improvement ${r.baseScore} → ${r.scenarioScore}`);
    assert.ok(r.dimensionDeltas.affordability.delta > 0);
    assert.ok(r.dimensionDeltas.priceFairness.delta > 0);
    assert.strictEqual(r.financialDeltas.available, true);
    assert.ok(r.financialDeltas.monthlyPayment.delta < 0);
    assert.strictEqual(r.financialDeltas.affordability, 'better');
    assert.ok(/improved|from/i.test(r.deterministicDeltaExplanation.overall + r.deterministicDeltaExplanation.improved.join(' ')));
  })
);

pending.push(
  test('lower offer does not change valuation', () => {
    const r = comparePersonalDecisionWhatIf(
      baseInput({
        scenario: { offerPrice: 320000 },
      })
    );
    assert.strictEqual(r.valuation.unchanged, true);
    assert.strictEqual(r.valuation.before.centralEstimate, 375000);
    assert.strictEqual(r.valuation.after.centralEstimate, 375000);
    assert.deepStrictEqual(r.valuation.before, r.valuation.after);
    assert.strictEqual(r.confidence.unchanged, true);
    assert.strictEqual(r.confidence.before.level, 'High');
    assert.strictEqual(r.confidence.after.level, 'High');
    assert.notStrictEqual(r.base.dimensions.priceFairness.score, r.scenarioResult.dimensions.priceFairness.score);
  })
);

pending.push(
  test('higher mortgage rate worsens affordability where financing inputs exist', () => {
    const r = comparePersonalDecisionWhatIf(
      baseInput({
        scenario: { interestRate: 6.5 },
      })
    );
    assert.strictEqual(r.baseScore, r.scenarioScore, 'rate alone must not invent a new fit calculation');
    assert.strictEqual(r.dimensionDeltas.affordability.delta, 0);
    assert.strictEqual(r.financialDeltas.available, true);
    assert.ok(r.financialDeltas.monthlyPayment.after > r.financialDeltas.monthlyPayment.before);
    assert.strictEqual(r.financialDeltas.affordability, 'worse');
    assert.strictEqual(r.valuation.unchanged, true);
  })
);

pending.push(
  test('budget increase can clear a hard constraint', () => {
    const r = comparePersonalDecisionWhatIf(
      baseInput({
        property: { ...PROPERTY, price: 520000 },
        scenario: { budgetMax: 550000 },
      })
    );
    assert.ok(r.constraints.before.some((c) => c.constraint === 'budget'));
    assert.ok(r.constraints.cleared.some((c) => c.constraint === 'budget'));
    assert.strictEqual(r.constraints.after.length, 0);
    assert.strictEqual(r.outcomeBefore, 'unsuitable');
    assert.notStrictEqual(r.outcomeAfter, 'unsuitable');
    assert.ok(r.scenarioScore > r.baseScore);
  })
);

pending.push(
  test('bedroom constraint cannot be changed by a price scenario', () => {
    const r = comparePersonalDecisionWhatIf(
      baseInput({
        property: { ...PROPERTY, bedrooms: 2 },
        preferences: { ...PREFS, bedrooms: 3, bedroomsMustHave: true },
        scenario: { offerPrice: 300000 },
      })
    );
    assert.ok(r.constraints.before.some((c) => c.constraint === 'bedrooms'));
    assert.ok(r.constraints.after.some((c) => c.constraint === 'bedrooms'));
    assert.ok(!r.constraints.cleared.some((c) => c.constraint === 'bedrooms'));
    assert.strictEqual(r.outcomeBefore, 'unsuitable');
    assert.strictEqual(r.outcomeAfter, 'unsuitable');
  })
);

pending.push(
  test('identical scenario produces zero delta', () => {
    const empty = comparePersonalDecisionWhatIf(baseInput({ scenario: {} }));
    assert.strictEqual(empty.scoreDelta, 0);
    assert.strictEqual(empty.baseScore, empty.scenarioScore);
    assert.strictEqual(empty.outcomeBefore, empty.outcomeAfter);
    Object.values(empty.dimensionDeltas).forEach((row) => {
      if (row.delta != null) assert.strictEqual(row.delta, 0);
    });
    assert.strictEqual(empty.constraints.cleared.length, 0);
    assert.strictEqual(empty.constraints.added.length, 0);
    assert.strictEqual(empty.financialDeltas.monthlyPayment.delta, 0);

    const samePrice = comparePersonalDecisionWhatIf(
      baseInput({ scenario: { offerPrice: PROPERTY.price, interestRate: FINANCE.interestRate } })
    );
    assert.strictEqual(samePrice.scoreDelta, 0);
    assert.strictEqual(samePrice.financialDeltas.monthlyPayment.delta, 0);
    assert.deepStrictEqual(empty.baseScore, samePrice.scenarioScore);
  })
);

pending.push(
  test('missing finance inputs do not fabricate mortgage results', () => {
    const none = comparePersonalDecisionWhatIf(
      baseInput({
        finance: undefined,
        scenario: { offerPrice: 350000 },
      })
    );
    assert.strictEqual(none.financialDeltas.available, false);
    assert.strictEqual(none.financialDeltas.monthlyPayment, null);
    assert.ok(none.financialDeltas.unavailableReason);

    const partial = comparePersonalDecisionWhatIf(
      baseInput({
        finance: { deposit: 76000 },
        scenario: { interestRate: 6.5 },
      })
    );
    assert.strictEqual(partial.financialDeltas.available, false);
    assert.strictEqual(partial.financialDeltas.monthlyPayment, null);
    assert.strictEqual(partial.financialDeltas.annualDebtService, null);
    assert.ok(!/\b25\b/.test(JSON.stringify(partial.financialDeltas)));
  })
);

pending.push(
  test('AI unavailable still returns deterministic delta explanation', async () => {
    const explained = await simulatePersonalDecisionWhatIf(
      baseInput({ scenario: { offerPrice: 320000 } }),
      {
        generateJson: async () => {
          throw new Error('LLM unavailable');
        },
      }
    );
    assert.strictEqual(explained.aiNarrative, null);
    assert.ok(explained.deterministicDeltaExplanation);
    assert.ok(explained.deterministicDeltaExplanation.overall);
    assert.strictEqual(explained.whyEngine.ai.source, 'unavailable');
    assert.strictEqual(explained.baseScore, explained.base.score);
    assert.strictEqual(explained.scenarioScore, explained.scenarioResult.score);
  })
);

Promise.all(pending)
  .then(() => {
    console.log('\npersonalDecisionWhatIf.test.js — all passed');
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
