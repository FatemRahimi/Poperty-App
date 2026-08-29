/**
 * Landlord profile — personal-decision-1.0.0.
 * Run: node server/tests/personalDecisionLandlord.test.js
 */

const assert = require('assert');
const { scorePersonalDecision, SUPPORTED_PROFILES } = require('../services/ai/personalDecisionEngine');
const { comparePersonalDecisionWhatIf } = require('../services/ai/personalDecisionWhatIfEngine');
const { buildLandlordFinanceInput } = require('../services/ai/personalDecisionLandlord');
const { LANDLORD_WEIGHTS, getProfile } = require('../config/personalDecision.config');

function test(name, fn) {
  fn();
  console.log(`✓ ${name}`);
}

const ASOF = '2026-06-01T00:00:00.000Z';

const PROPERTY = {
  id: 10,
  price: 200000,
  city: 'Leeds',
  zip_code: 'LS1 1AA',
  bedrooms: 2,
  property_type: 'Terraced',
  monthly_rent: 1200,
};

const RENT_INTEL = {
  success: true,
  currentRent: 1200,
  recommendedRent: 1200,
  marketRange: { low: 1100, high: 1300 },
  comparables: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }],
};

const FINANCE = {
  expectedRent: 1200,
  deposit: 50000,
  interestRate: 4.5,
  mortgageTermYears: 25,
  vacancyAssumption: 5,
  maintenance: 1200,
  insurance: 600,
  managementFee: 0,
  serviceCharge: 0,
  groundRent: 0,
  taxes: 0,
};

function landlordInput(overrides = {}) {
  return {
    profile: 'landlord',
    property: PROPERTY,
    preferences: {},
    intelligence: {
      confidence: { level: 'High', assessed: true },
      rentIntel: RENT_INTEL,
      risks: [],
    },
    finance: FINANCE,
    asOf: ASOF,
    ...overrides,
  };
}

test('landlord weights sum to 1 and buyer_family remains disabled', () => {
  const sum = Object.values(LANDLORD_WEIGHTS).reduce((s, w) => s + w, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  const r = scorePersonalDecision(landlordInput({ profile: 'buyer_family' }));
  assert.strictEqual(r.available, false);
});

test('landlord is enabled from versioned config, not a hard-coded extra list', () => {
  const profile = getProfile('landlord');
  assert.strictEqual(profile.enabled, true);
  assert.strictEqual(profile.dimensionSet, 'landlord');
  assert.deepStrictEqual(profile.hardConstraints, ['minYield', 'minDscr']);
  assert.ok(!profile.hardConstraints.includes('budget'));
  assert.ok(!profile.hardConstraints.includes('bedrooms'));
  assert.ok(SUPPORTED_PROFILES.includes('landlord'));
  assert.ok(SUPPORTED_PROFILES.includes('buyer_general'));
  assert.ok(!SUPPORTED_PROFILES.includes('buyer_family'));
  assert.ok(!SUPPORTED_PROFILES.includes('investor_yield'));
});

test('landlord dimensions match configured landlord weights, not buyer fields', () => {
  const r = scorePersonalDecision(landlordInput());
  assert.deepStrictEqual(Object.keys(r.dimensions).sort(), Object.keys(LANDLORD_WEIGHTS).sort());
  ['affordability', 'location', 'space', 'priceFairness', 'lifestyle', 'transport'].forEach((key) => {
    assert.ok(!Object.prototype.hasOwnProperty.call(r.dimensions, key), `unexpected buyer dimension ${key}`);
  });
  assert.strictEqual(r.model.dimensionSet, 'landlord');
  assert.deepStrictEqual(r.model.hardConstraints, ['minYield', 'minDscr']);
});

test('buyer budget and bedroom must-have are not landlord hard constraints', () => {
  const r = scorePersonalDecision(
    landlordInput({
      property: { ...PROPERTY, bedrooms: 1 },
      preferences: {
        budgetMax: 50000,
        bedrooms: 4,
        bedroomsMustHave: true,
      },
    })
  );
  assert.ok(!r.constraintFailures.some((f) => f.constraint === 'budget'));
  assert.ok(!r.constraintFailures.some((f) => f.constraint === 'bedrooms'));
  assert.notStrictEqual(r.outcome, 'unsuitable');
  assert.ok(r.available);
});

test('landlord explanation uses rental requirements, not buyer living copy', () => {
  const r = scorePersonalDecision(landlordInput());
  const overall = r.deterministicExplanation.overall;
  assert.ok(overall.includes('stated rental requirements'));
  assert.ok(!overall.includes('stated living requirements'));
  const factorDims = [
    ...(r.deterministicExplanation.strongestFactors || []),
    ...(r.deterministicExplanation.weakestOrUnavailable || []),
  ].map((row) => row.dimension);
  factorDims.forEach((key) => {
    assert.ok(Object.prototype.hasOwnProperty.call(LANDLORD_WEIGHTS, key), `unexpected factor ${key}`);
  });
  assert.ok(!factorDims.includes('affordability'));
  assert.ok(!factorDims.includes('lifestyle'));
});

test('strong rental case', () => {
  const r = scorePersonalDecision(landlordInput());
  assert.strictEqual(r.available, true);
  assert.ok(r.score >= 80, `expected strong rental fit, got ${r.score}`);
  assert.strictEqual(r.outcome, 'strong_fit');
  assert.ok(r.dimensions.rentPosition.available);
  assert.ok(r.dimensions.grossYield.available);
  assert.ok(r.dimensions.netOperating.available);
  assert.ok(r.dimensions.cashFlow.available);
  assert.ok(r.dimensions.dscr.available);
  assert.ok(r.dimensions.vacancy.available);
  assert.ok(r.dimensions.risk.available);
  assert.strictEqual(r.dimensions.demand.available, false);
  assert.strictEqual(r.dimensions.demand.state, 'no_demand_data_source');
  assert.strictEqual(r.decisionStrength, 'strong');
});

test('low-yield case', () => {
  const r = scorePersonalDecision(
    landlordInput({
      property: { ...PROPERTY, monthly_rent: 400, price: 200000 },
      finance: { ...FINANCE, expectedRent: 400 },
      intelligence: {
        confidence: { level: 'High', assessed: true },
        rentIntel: { ...RENT_INTEL, currentRent: 400, recommendedRent: 1200, marketRange: { low: 1100, high: 1300 } },
        risks: [],
      },
    })
  );
  assert.strictEqual(r.available, true);
  assert.ok(r.dimensions.grossYield.available);
  assert.ok(r.dimensions.grossYield.score < 55);
  assert.ok(r.score < 80);
});

test('missing rent evidence', () => {
  const r = scorePersonalDecision(
    landlordInput({
      property: { ...PROPERTY, monthly_rent: undefined },
      finance: { deposit: 50000, interestRate: 4.5, mortgageTermYears: 25 },
      intelligence: { confidence: { level: 'High', assessed: true }, risks: [] },
    })
  );
  assert.strictEqual(r.dimensions.rentPosition.available, false);
  assert.strictEqual(r.dimensions.grossYield.available, false);
  assert.ok(r.notAssessed.some((n) => n.dimension === 'rentPosition'));
  assert.ok(r.notAssessed.some((n) => n.dimension === 'grossYield'));
});

test('missing finance inputs', () => {
  const r = scorePersonalDecision(
    landlordInput({
      finance: { expectedRent: 1200, vacancyAssumption: 5, maintenance: 1200, insurance: 600, managementFee: 0, serviceCharge: 0, groundRent: 0, taxes: 0 },
    })
  );
  assert.ok(r.dimensions.grossYield.available);
  assert.strictEqual(r.dimensions.cashFlow.available, false);
  assert.strictEqual(r.dimensions.dscr.available, false);
  assert.ok(/not defaulted|missing/i.test(r.dimensions.dscr.unavailableReason));
});

test('minimum yield hard constraint', () => {
  const r = scorePersonalDecision(
    landlordInput({
      preferences: { minYield: 8 },
    })
  );
  assert.ok(r.dimensions.grossYield.available);
  assert.ok(r.constraintFailures.some((f) => f.constraint === 'minYield'));
  assert.strictEqual(r.outcome, 'unsuitable');

  const unevidenced = scorePersonalDecision(
    landlordInput({
      property: { ...PROPERTY, monthly_rent: undefined, price: 200000 },
      finance: { deposit: 50000, interestRate: 4.5, mortgageTermYears: 25 },
      preferences: { minYield: 8 },
      intelligence: { confidence: { level: 'High', assessed: true }, risks: [] },
    })
  );
  assert.strictEqual(unevidenced.dimensions.grossYield.available, false);
  assert.ok(!unevidenced.constraintFailures.some((f) => f.constraint === 'minYield'));
});

test('DSCR unavailable when inputs are incomplete', () => {
  const r = scorePersonalDecision(
    landlordInput({
      finance: { expectedRent: 1200, deposit: 50000, maintenance: 1200, insurance: 600, managementFee: 0, serviceCharge: 0, groundRent: 0, taxes: 0 },
    })
  );
  assert.strictEqual(r.dimensions.dscr.available, false);
  assert.strictEqual(r.dimensions.dscr.score, null);
  assert.ok(!r.constraintFailures.some((f) => f.constraint === 'minDscr'));
});

test('higher rate worsens cash flow', () => {
  const r = comparePersonalDecisionWhatIf(
    landlordInput({
      scenario: { interestRate: 6.5 },
    })
  );
  assert.ok(r.financialDeltas.annualCashFlow.after < r.financialDeltas.annualCashFlow.before);
  assert.strictEqual(r.financialDeltas.cashFlowImpact, 'worse');
  assert.ok(r.dimensionDeltas.cashFlow.delta <= 0);
  assert.strictEqual(r.valuation.unchanged, true);
});

test('lower purchase price improves yield', () => {
  const r = comparePersonalDecisionWhatIf(
    landlordInput({
      property: { ...PROPERTY, price: 350000 },
      scenario: { offerPrice: 200000 },
    })
  );
  assert.ok(r.financialDeltas.grossYield.after > r.financialDeltas.grossYield.before);
  assert.ok(r.dimensionDeltas.grossYield.delta > 0);
  assert.ok(r.scenarioScore > r.baseScore);
  assert.strictEqual(r.valuation.unchanged, true);
});

test('low confidence limits decision strength but does not alter score', () => {
  const high = scorePersonalDecision(landlordInput());
  const low = scorePersonalDecision(
    landlordInput({
      intelligence: {
        confidence: { level: 'Low', assessed: true },
        rentIntel: RENT_INTEL,
        risks: [],
      },
    })
  );
  assert.strictEqual(low.score, high.score);
  assert.strictEqual(high.decisionStrength, 'strong');
  assert.strictEqual(low.decisionStrength, 'weak');
  assert.strictEqual(low.outcome, high.outcome);
});

test('identical inputs are reproducible', () => {
  const a = scorePersonalDecision(landlordInput());
  const b = scorePersonalDecision(landlordInput());
  assert.deepStrictEqual(a, b);
});

test('listing service charge and ground rent complete net operating when the scenario omits them', () => {
  const { groundRent, serviceCharge, ...withoutCharges } = FINANCE;
  const r = scorePersonalDecision(
    landlordInput({
      property: { ...PROPERTY, service_charges: 100, ground_rent: 250 },
      finance: withoutCharges,
    })
  );
  assert.strictEqual(r.dimensions.netOperating.available, true);
  assert.notStrictEqual(r.dimensions.netOperating.state, 'costs_not_supplied');
  assert.ok(!/Operating costs were not supplied/.test(JSON.stringify(r.deterministicExplanation || {})));
});

test('listing charges alone do not complete net operating', () => {
  const r = scorePersonalDecision(
    landlordInput({
      property: { ...PROPERTY, service_charges: 100, ground_rent: 250 },
      finance: {
        expectedRent: 1200,
        deposit: 50000,
        interestRate: 4.5,
        mortgageTermYears: 25,
      },
    })
  );
  assert.strictEqual(r.dimensions.netOperating.available, false);
  assert.strictEqual(r.dimensions.netOperating.state, 'costs_not_supplied');
});

test('explicit zero service charge is not replaced by listing charges', () => {
  const input = buildLandlordFinanceInput(
    { ...PROPERTY, service_charges: 100, ground_rent: 250 },
    {},
    { ...FINANCE, serviceCharge: 0, groundRent: 0 }
  );
  assert.strictEqual(input.serviceCharge, 0);
  assert.strictEqual(input.groundRent, 0);
});

test('nested explicit zeros remain supplied operating-cost evidence', () => {
  const r = scorePersonalDecision(
    landlordInput({
      finance: {
        expectedRent: 1200,
        deposit: 50000,
        interestRate: 4.5,
        mortgageTermYears: 25,
        vacancyAssumption: 0,
        operatingCosts: {
          maintenance: { value: 1200, frequency: 'annual' },
          insurance: { value: 600, frequency: 'annual' },
          managementFee: { value: 0, frequency: 'annual' },
          taxes: { value: 0, frequency: 'annual' },
          serviceCharge: { value: 0, frequency: 'annual' },
          groundRent: { value: 0, frequency: 'annual' },
        },
      },
    })
  );
  assert.strictEqual(r.dimensions.netOperating.available, true);
  assert.notStrictEqual(r.dimensions.netOperating.state, 'costs_not_supplied');
});

console.log('\npersonalDecisionLandlord.test.js — all passed');
