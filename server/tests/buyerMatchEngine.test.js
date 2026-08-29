/**
 * Tests for buyer match engine — run: node server/tests/buyerMatchEngine.test.js
 */

const assert = require('assert');
const { rankBuyerMatches, scorePropertyMatch } = require('../services/ai/buyerMatchEngine');

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    console.error(`✗ ${name}`);
    throw e;
  }
}

test('scorePropertyMatch ranks within-budget property highly', () => {
  const result = scorePropertyMatch(
    { price: 400000, city: 'Manchester', bedrooms: 3, zip_code: 'M1 1AA' },
    { budgetMax: 450000, location: 'Manchester', bedrooms: 3 }
  );
  assert.ok(result.matchScore >= 75);
  assert.ok(result.matchReasons.includes('Within budget') || result.matchReasons.includes('Well within budget'));
});

test('rankBuyerMatches sorts by score descending', () => {
  const ranked = rankBuyerMatches(
    { budgetMax: 500000, location: 'London', bedrooms: 2 },
    [
      { id: 1, title: 'A', price: 600000, city: 'London', bedrooms: 2 },
      { id: 2, title: 'B', price: 480000, city: 'London', bedrooms: 2 },
    ]
  );
  assert.strictEqual(ranked.recommendations[0].id, 2);
  assert.strictEqual(ranked.engine, 'buyer-match-v2');
});

test('parking is not treated as transport evidence', () => {
  const result = scorePropertyMatch(
    {
      price: 400000,
      city: 'Manchester',
      zip_code: 'M1 1AA',
      bedrooms: 3,
      description: 'Family home with garden near the station.',
      has_garden: true,
      parking_spaces: 1,
    },
    { budgetMax: 450000, location: 'Manchester', bedrooms: 3, transport: 'parking' }
  );
  assert.strictEqual(result.dimensions.transport.available, false);
  assert.strictEqual(result.dimensions.transport.state, 'parking_is_not_transport');
});

test('postcode match is incomplete when the location preference is a commute or radius', () => {
  const commute = scorePropertyMatch(
    { price: 400000, zip_code: 'M1 1AA', city: 'Manchester', bedrooms: 3 },
    { budgetMax: 450000, location: 'M1 1AA', locationType: 'commute', bedrooms: 3 }
  );
  assert.strictEqual(commute.dimensions.location.state, 'incomplete_preference');
  assert.ok(commute.dimensions.location.score <= 60);

  const multi = scorePropertyMatch(
    { price: 400000, zip_code: 'M1 1AA', city: 'Manchester', bedrooms: 3 },
    { budgetMax: 450000, locations: ['M1 1AA', 'LS1 1AA'], bedrooms: 3 }
  );
  assert.strictEqual(multi.dimensions.location.state, 'matches_one_preferred_area');
  assert.ok(multi.dimensions.location.score >= 95);
});

console.log('\nAll buyerMatchEngine tests passed.');
