/**
 * Property Intelligence search matching tests
 * Run: node server/tests/propertyIntelligenceSearch.test.js
 */

const assert = require('assert');
const {
  compactPostcode,
  addressTokens,
  scoreAddressMatch,
  mapSearchRow,
} = require('../services/ai/propertyIntelligenceSearch');
const { normalisePostcode, extractPostcodeFromAddress } = require('../utils/ukAddress');

function testPostcodeNormalization() {
  assert.strictEqual(compactPostcode('B1 2UJ'), 'B12UJ');
  assert.strictEqual(compactPostcode('b12uj'), 'B12UJ');
  assert.strictEqual(compactPostcode('B46GE'), 'B46GE');
  assert.strictEqual(normalisePostcode('B12UJ'), 'B1 2UJ');
  assert.strictEqual(extractPostcodeFromAddress('Flat 2, High Street B12UJ'), 'B1 2UJ');
  console.log('✓ postcode normalization for search');
}

function testAddressTokenScoring() {
  const property = {
    title: 'Canterbury Tower Flat 301',
    address_line1: 'Marks Street',
    street_name: 'Marks Street',
    house_number: '301',
    city: 'Birmingham',
    address_display: '301 Marks Street, Birmingham, B1 2UJ',
  };
  const postcode = 'B1 2UJ';
  const tokens = addressTokens('Flat 301 Marks Street B1 2UJ', postcode);
  assert.ok(tokens.includes('301'));
  assert.ok(tokens.includes('marks'));
  const score = scoreAddressMatch(property, tokens);
  assert.ok(score >= 0.5, `expected score >= 0.5, got ${score}`);
  console.log('✓ address token scoring');
}

function testMapSearchRowMetadata() {
  const row = mapSearchRow(
    {
      id: 11,
      title: 'Test Flat',
      zip_code: 'B1 2UJ',
      city: 'Birmingham',
      address_line1: 'Marks Street',
    },
    'postcode',
    'high'
  );
  assert.strictEqual(row.id, 11);
  assert.strictEqual(row.source, 'marketplace');
  assert.strictEqual(row.matchMethod, 'postcode');
  assert.strictEqual(row.matchConfidence, 'high');
  assert.ok(row.address_display.includes('B1 2UJ'));
  console.log('✓ mapSearchRow adds intelligence metadata');
}

function testCompactPostcodeVariantsMatch() {
  const variants = ['B1 2UJ', 'B12UJ', 'b1 2uj', 'B12uj'];
  const expected = 'B12UJ';
  variants.forEach((v) => {
    assert.strictEqual(compactPostcode(v), expected, `failed for ${v}`);
  });
  console.log('✓ postcode formatting variants compact equally');
}

function testAddressTokensIgnorePostcode() {
  const tokens = addressTokens('B1 2UJ', 'B1 2UJ');
  assert.strictEqual(tokens.length, 0, 'postcode-only query should have no address tokens');
  console.log('✓ postcode-only queries skip address token filter');
}

testPostcodeNormalization();
testAddressTokenScoring();
testMapSearchRowMetadata();
testCompactPostcodeVariantsMatch();
testAddressTokensIgnorePostcode();

console.log('propertyIntelligenceSearch.test.js — all passed');
