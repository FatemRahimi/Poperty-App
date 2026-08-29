/**
 * Smoke tests for financialEngine — run: node server/tests/financialEngine.test.js
 */

const assert = require('assert');
const {
  calculateInvestmentMetrics,
  buildDetailedScenarios,
  buildCashFlowSensitivityMatrix,
} = require('../services/ai/financialEngine');

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    console.error(`✗ ${name}`);
    throw e;
  }
}

test('missing ground rent is not converted to zero', () => {
  const missing = calculateInvestmentMetrics({
    purchasePrice: 200000,
    expectedRent: 1000,
    deposit: 50000,
    interestRate: 5,
    vacancyAssumption: 0,
    maintenance: 1200,
    insurance: 600,
  });
  assert.strictEqual(missing.groundRent, null);
  assert.strictEqual(missing.groundRentState, 'notAssessed');
  assert.notStrictEqual(missing.groundRent, 0);
  assert.strictEqual(missing.groundRentIncludedInNoi, false);

  const knownZero = calculateInvestmentMetrics({
    purchasePrice: 200000,
    expectedRent: 1000,
    deposit: 50000,
    interestRate: 5,
    vacancyAssumption: 0,
    maintenance: 1200,
    insurance: 600,
    groundRent: 0,
  });
  assert.strictEqual(knownZero.groundRent, 0);
  assert.strictEqual(knownZero.groundRentState, 'observed');
});

test('gross yield calculation', () => {
  const m = calculateInvestmentMetrics({
    purchasePrice: 200000,
    expectedRent: 1000,
    deposit: 50000,
    interestRate: 5,
    mortgageTermYears: 25,
    vacancyAssumption: 0,
    maintenance: 0,
    insurance: 0,
  });
  assert.strictEqual(m.grossYield, 6);
});

test('NOI subtracts operating expenses', () => {
  const m = calculateInvestmentMetrics({
    purchasePrice: 200000,
    expectedRent: 1000,
    deposit: 50000,
    interestRate: 5,
    vacancyAssumption: 0,
    maintenance: 1200,
    insurance: 600,
  });
  assert.strictEqual(m.noi, 12000 - 1200 - 600);
});

test('scenarios produce three rows', () => {
  const s = buildDetailedScenarios({
    purchasePrice: 250000,
    expectedRent: 1200,
    deposit: 62500,
    interestRate: 5.5,
    vacancyAssumption: 5,
    maintenance: 2500,
    insurance: 600,
  });
  assert.ok(s.conservative.cashFlow <= s.base.cashFlow || s.conservative.noi <= s.base.noi);
  assert.ok(s.optimistic.cashFlow >= s.conservative.cashFlow);
});

test('sensitivity matrix has rent vs interest rows', () => {
  const matrix = buildCashFlowSensitivityMatrix({
    purchasePrice: 200000,
    expectedRent: 1000,
    deposit: 50000,
    interestRate: 5,
    vacancyAssumption: 5,
    maintenance: 1000,
    insurance: 500,
  });
  assert.strictEqual(matrix.rentVsInterest.length, 3);
  assert.strictEqual(matrix.rentVsInterest[0].cells.length, 5);
});

console.log('\nAll financialEngine tests passed.');
