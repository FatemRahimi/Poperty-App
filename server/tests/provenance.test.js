/**
 * Tests for provenance helpers — run: node server/tests/provenance.test.js
 */

const assert = require('assert');
const { createProvenance, wrapValue, mergeSources, formatSourceLabel } = require('../utils/provenance');

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    console.error(`✗ ${name}`);
    throw e;
  }
}

test('createProvenance includes ISO timestamps', () => {
  const p = createProvenance({
    source: 'PropertyData',
    method: 'sold_prices',
    confidence: 'medium',
  });
  assert.strictEqual(p.source, 'PropertyData');
  assert.strictEqual(p.method, 'sold_prices');
  assert.ok(p.retrievedAt);
});

test('wrapValue nests value with provenance', () => {
  const w = wrapValue(625000, { source: 'PropertyData', method: 'valuation_sale' });
  assert.strictEqual(w.value, 625000);
  assert.strictEqual(w.provenance.source, 'PropertyData');
});

test('mergeSources deduplicates', () => {
  const s = mergeSources('PropertyData', 'ApplicationDatabase', 'PropertyData');
  assert.deepStrictEqual(s, ['PropertyData', 'ApplicationDatabase']);
});

test('formatSourceLabel maps known sources', () => {
  assert.strictEqual(formatSourceLabel('HM_Land_Registry'), 'HM Land Registry');
  assert.strictEqual(
    formatSourceLabel('EnvironmentAgency_FloodMapForPlanning'),
    'Environment Agency Flood Map for Planning'
  );
});

console.log('\nAll provenance tests passed.');
