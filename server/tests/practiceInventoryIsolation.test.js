/**
 * Known practice-fixture isolation. Explicit titles only.
 * Never classifies by price or missing UPRN.
 * Run: node server/tests/practiceInventoryIsolation.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  KNOWN_PRACTICE_FIXTURE_TITLES,
  isKnownPracticeInventoryListing,
  excludeKnownPracticeInventory,
} = require('../config/practiceInventory');

function test(name, fn) {
  fn();
  console.log(`✓ ${name}`);
}

test('A. known Email Test fixtures are excluded from public evidence paths', () => {
  assert.ok(KNOWN_PRACTICE_FIXTURE_TITLES.includes('Email Test Property'));
  assert.ok(KNOWN_PRACTICE_FIXTURE_TITLES.includes('Email Test Property 3'));
  assert.strictEqual(isKnownPracticeInventoryListing({ id: 168, title: 'Email Test Property' }), true);
  assert.strictEqual(isKnownPracticeInventoryListing({ id: 169, title: 'Email Test Property 3' }), true);
  const publicRows = excludeKnownPracticeInventory([
    { id: 168, title: 'Email Test Property', price: 1500 },
    { id: 153, title: 'Property for Sale', price: 300000 },
  ]);
  assert.strictEqual(publicRows.length, 1);
  assert.strictEqual(publicRows[0].id, 153);
});

test('B. known demo asking listings do not remain in asking-comparable candidate sets', () => {
  const comps = excludeKnownPracticeInventory([
    { id: 168, title: 'Email Test Property', category: 'sale', price: 150000 },
    { id: 153, title: 'Property for Sale', category: 'sale', price: 300000 },
    { id: 147, title: 'Property for Sale', category: 'sale', price: 2000000 },
  ]);
  assert.strictEqual(comps.some((r) => r.id === 168), false);
  assert.strictEqual(comps.some((r) => r.id === 153), true);
  assert.strictEqual(comps.some((r) => r.id === 147), true);
  const saleSrc = fs.readFileSync(
    path.join(__dirname, '../services/ai/saleIntelligenceService.js'),
    'utf8'
  );
  assert.ok(saleSrc.includes('excludeKnownPracticeInventory'));
  const searchSrc = fs.readFileSync(
    path.join(__dirname, '../services/ai/propertyIntelligenceSearch.js'),
    'utf8'
  );
  assert.ok(searchSrc.includes('excludeKnownPracticeInventory'));
});

test('C. real approved listing behaviour is unchanged by the fixture list', () => {
  assert.strictEqual(
    isKnownPracticeInventoryListing({
      id: 153,
      title: 'Property for Sale',
      price: 300000,
      zip_code: 'B3 2AB',
    }),
    false
  );
  assert.strictEqual(
    isKnownPracticeInventoryListing({
      id: 147,
      title: 'Property for Sale',
      price: 2000000,
      zip_code: 'B3 2QD',
    }),
    false
  );
});

test('D. no price-based or missing-UPRN heuristic classifies a listing as demo', () => {
  const src = fs.readFileSync(path.join(__dirname, '../config/practiceInventory.js'), 'utf8');
  const fn = src.slice(src.indexOf('function isKnownPracticeInventoryListing'));
  assert.ok(!/row\.price|listing\.price/.test(fn));
  assert.ok(!/row\.uprn|listing\.uprn/.test(fn));
  assert.ok(!/hospital street/i.test(fn));
  assert.ok(!/user_id|owner/i.test(fn));
  assert.strictEqual(
    isKnownPracticeInventoryListing({
      id: 166,
      title: '51 marks street',
      price: 20000,
      uprn: null,
    }),
    false
  );
  assert.strictEqual(
    isKnownPracticeInventoryListing({
      id: 167,
      title: 'modern',
      price: 20000,
      zip_code: 'B12uj',
      uprn: null,
    }),
    false
  );
  assert.strictEqual(
    isKnownPracticeInventoryListing({
      id: 35,
      title: '266 Birmingham City Centre addresses like Bull Street',
      price: 1,
      uprn: null,
    }),
    false
  );
  assert.strictEqual(
    isKnownPracticeInventoryListing({
      id: 11,
      title: '2 bed falat',
      address_line1: '266 Hospital Street',
      uprn: null,
    }),
    false
  );
  assert.strictEqual(isKnownPracticeInventoryListing({ title: 'Test Street House', price: 50 }), false);
  assert.ok(
    src.includes('Email Test isolation does not close P1_DEMO_ISOLATION_DEFECT'),
    'approved practice inventory remains unisolated; Email Test fixtures do not close P1'
  );
});

console.log('practiceInventoryIsolation.test.js — all passed');
