/**
 * Tests for UK address helpers — run: node server/tests/ukAddress.test.js
 */

const assert = require('assert');
const {
  normalisePostcode,
  buildAddressFromProperty,
  buildPropertyDataSearchAddress,
  buildPropertyDataSearchAddressFromQuery,
  extractPostcodeFromAddress,
  inferMatchConfidenceFromRank,
} = require('../utils/ukAddress');

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    console.error(`✗ ${name}`);
    throw e;
  }
}

test('normalisePostcode formats UK postcode', () => {
  assert.strictEqual(normalisePostcode('sw1a1aa'), 'SW1A 1AA');
  assert.strictEqual(normalisePostcode('M1 4DY'), 'M1 4DY');
  assert.strictEqual(normalisePostcode('B12UJ'), 'B1 2UJ');
  assert.strictEqual(normalisePostcode('b12uj'), 'B1 2UJ');
});

test('extractPostcodeFromAddress handles compact postcodes', () => {
  assert.strictEqual(
    extractPostcodeFromAddress('301 flat, Cantubery Tower, Marks Street, B12uj'),
    'B1 2UJ'
  );
});

test('buildPropertyDataSearchAddressFromQuery normalizes free text', () => {
  const addr = buildPropertyDataSearchAddressFromQuery(
    '301 flat, Cantubery Tower, Marks Street, B12uj'
  );
  assert.strictEqual(addr, '301 flat, Cantubery Tower, Marks Street, B1 2UJ');
});

test('buildPropertyDataSearchAddress uses comma separation', () => {
  const addr = buildPropertyDataSearchAddress({
    house_number: '4',
    street_name: 'Adanac Drive',
    city: 'Nursling',
    zip_code: 'SO16 0AS',
  });
  assert.ok(addr.includes(','));
  assert.ok(addr.includes('SO16 0AS'));
});

test('buildAddressFromProperty deduplicates parts', () => {
  const addr = buildAddressFromProperty({
    address_line1: '10 High Street',
    city: 'London',
    zip_code: 'E1 6AN',
  });
  assert.ok(addr.includes('London'));
  assert.ok(addr.includes('E1 6AN'));
});

test('inferMatchConfidenceFromRank', () => {
  assert.strictEqual(inferMatchConfidenceFromRank(0, 1), 'high');
  assert.strictEqual(inferMatchConfidenceFromRank(0, 5), 'medium');
  assert.strictEqual(inferMatchConfidenceFromRank(3, 5), 'low');
});

console.log('\nAll ukAddress tests passed.');
