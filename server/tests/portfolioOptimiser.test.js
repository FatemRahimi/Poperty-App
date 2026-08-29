/**
 * Tests for portfolio optimiser — run: node server/tests/portfolioOptimiser.test.js
 */

const assert = require('assert');
const { buildDiversification, analysePortfolioProperty } = require('../services/ai/portfolioOptimiserService');

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    console.error(`✗ ${name}`);
    throw e;
  }
}

test('buildDiversification detects concentration', () => {
  const div = buildDiversification([
    { city: 'London' },
    { city: 'London' },
    { city: 'Manchester' },
  ]);
  assert.ok(div.concentrationPercent >= 66);
  assert.strictEqual(div.byCity.London, 2);
});

test('analysePortfolioProperty computes yield when rent and price present', () => {
  const row = analysePortfolioProperty({
    id: 1,
    title: 'Test',
    price: 200000,
    monthly_rent: 1000,
    city: 'Leeds',
    category: 'sale',
    status: 'approved',
  });
  assert.ok(row.grossYield > 0);
  assert.strictEqual(row.monthlyRent, 1000);
  assert.strictEqual(row.netYield, null, 'net yield must not be invented from default costs');
  assert.strictEqual(row.annualCashFlow, null, 'cash flow must not be invented from default finance');
});

console.log('\nAll portfolioOptimiser tests passed.');
