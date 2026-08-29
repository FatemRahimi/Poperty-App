/**
 * Tests for valuation and price position engines — run: node server/tests/valuationEngine.test.js
 */

const assert = require('assert');
const { weightedBlend, confidenceFromEvidence } = require('../services/ai/valuationEngine');
const { calculatePricePosition } = require('../services/ai/pricePositionEngine');
const {
  parseValuationSaleResponse,
  parseSoldPricesStats,
} = require('../services/providers/propertyData/propertyDataParsers');

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    console.error(`✗ ${name}`);
    throw e;
  }
}

test('parseValuationSaleResponse extracts estimate and margin', () => {
  const parsed = parseValuationSaleResponse({
    result: { estimate: 500000, margin: 25000, confidence: 'high' },
  });
  assert.strictEqual(parsed.centralEstimate, 500000);
  assert.strictEqual(parsed.lowerEstimate, 475000);
  assert.strictEqual(parsed.upperEstimate, 525000);
});

test('parseValuationSaleResponse does not fabricate bounds when margin is missing', () => {
  const parsed = parseValuationSaleResponse({
    result: { estimate: 500000, confidence: 'high' },
  });
  assert.strictEqual(parsed.centralEstimate, 500000);
  assert.strictEqual(parsed.lowerEstimate, null);
  assert.strictEqual(parsed.upperEstimate, null);
  assert.notStrictEqual(parsed.lowerEstimate, Math.round(500000 * 0.95));
  assert.notStrictEqual(parsed.upperEstimate, Math.round(500000 * 1.05));
});

test('parseSoldPricesStats extracts average and range', () => {
  const parsed = parseSoldPricesStats({
    data: { average: 420000, '80pc_low': 380000, '80pc_high': 460000, points: 20 },
  });
  assert.strictEqual(parsed.average, 420000);
  assert.strictEqual(parsed.range.low, 380000);
});

test('weightedBlend combines multiple estimates', () => {
  const blend = weightedBlend([
    { centralEstimate: 500000, lowerEstimate: 480000, upperEstimate: 520000, method: 'valuation_sale_avm' },
    { centralEstimate: 480000, lowerEstimate: 460000, upperEstimate: 500000, method: 'internal_sale_comparables' },
  ]);
  assert.ok(blend.central >= 480000 && blend.central <= 500000);
  assert.strictEqual(blend.evidenceCount, 2);
});

test('confidenceFromEvidence levels', () => {
  assert.strictEqual(confidenceFromEvidence([1, 2, 3]), 'high');
  assert.strictEqual(confidenceFromEvidence([1, 2]), 'medium');
  assert.strictEqual(confidenceFromEvidence([]), 'insufficient');
});

test('calculatePricePosition fairly priced within range', () => {
  const valuation = {
    success: true,
    centralEstimate: { value: 500000 },
    lowerEstimate: { value: 480000 },
    upperEstimate: { value: 520000 },
    confidence: 'medium',
    evidenceCount: 2,
  };
  const pos = calculatePricePosition(505000, valuation);
  assert.strictEqual(pos.success, true);
  assert.strictEqual(pos.position, 'fairly_priced');
});

test('calculatePricePosition overpriced above upper bound', () => {
  const valuation = {
    success: true,
    centralEstimate: { value: 500000 },
    lowerEstimate: { value: 480000 },
    upperEstimate: { value: 520000 },
    confidence: 'medium',
    evidenceCount: 2,
  };
  const pos = calculatePricePosition(560000, valuation);
  assert.strictEqual(pos.position, 'potentially_overpriced');
});

test('missing valuation bounds are not fabricated as ±6% of central', () => {
  const blend = weightedBlend([
    { centralEstimate: 500000, method: 'valuation_sale_avm' },
    { centralEstimate: 480000, method: 'internal_sale_comparables' },
  ]);
  assert.ok(blend.central > 0);
  assert.strictEqual(blend.lower, null);
  assert.strictEqual(blend.upper, null);
  assert.strictEqual(blend.boundsAvailable, false);
  assert.notStrictEqual(blend.lower, Math.round(blend.central * 0.94));
  assert.notStrictEqual(blend.upper, Math.round(blend.central * 1.06));
});

console.log('\nAll valuationEngine tests passed.');
