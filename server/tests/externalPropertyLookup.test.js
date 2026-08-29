/**
 * Unit tests for external property → synthetic listing shape.
 * Run: node server/tests/externalPropertyLookup.test.js
 */

const assert = require('assert');
const {
  buildSyntheticPropertyFromSubject,
  profileToAttributes,
} = require('../services/ai/externalPropertyLookupService');

const subject = {
  id: 42,
  uprn: '123456789',
  normalized_address: '12 High Street, Bristol BS1 4ST',
  postcode: 'BS1 4ST',
  latitude: 51.45,
  longitude: -2.59,
  provider: 'PropertyData',
  attributes: {
    bedrooms: 3,
    bathrooms: 2,
    square_feet: 850,
    property_type: 'Terraced',
    current_sale_estimate: 425000,
    epc_rating: 'C',
  },
  profile_snapshot: {
    current_sale_estimate: 425000,
    internal_area: 850,
  },
};

assert.strictEqual(profileToAttributes({ bedrooms: 2 }).bedrooms, 2);
const occupancyOnly = profileToAttributes({ tenure: 'Owner-occupied', registeredLeases: [] });
assert.strictEqual(occupancyOnly.tenure, null);
assert.strictEqual(occupancyOnly.occupancy_tenure, 'Owner-occupied');
assert.strictEqual(occupancyOnly.council_tax_band, null);

const synthetic = buildSyntheticPropertyFromSubject(subject);
assert.strictEqual(synthetic.subjectId, 42);
assert.strictEqual(synthetic.uprn, '123456789');
assert.strictEqual(synthetic.status, 'external');
assert.strictEqual(synthetic.price, 425000);
assert.strictEqual(synthetic.bedrooms, 3);
assert.strictEqual(synthetic.source, 'external_intelligence_subject');
assert.strictEqual(synthetic.property_type, 'Terraced');
assert.strictEqual(synthetic.epc_rating, 'C');

const missingType = buildSyntheticPropertyFromSubject({
  ...subject,
  attributes: { bedrooms: 3, bathrooms: 2, square_feet: 850, current_sale_estimate: 425000 },
});
assert.notStrictEqual(missingType.property_type, 'House');
assert.ok(!missingType.property_type);

const soldOnly = buildSyntheticPropertyFromSubject({
  id: 7,
  uprn: '999',
  normalized_address: '1 King Street, Leeds LS1 1AA',
  postcode: 'LS1 1AA',
  attributes: {},
  profile_snapshot: {
    last_sold_amount: 310000,
    last_sold_date: '2022-03-01',
    created_at: '2026-01-01',
    updated_at: '2026-08-01',
  },
});
assert.strictEqual(soldOnly.last_sold_price, 310000);
assert.strictEqual(soldOnly.last_sold_date, '2022-03-01');
assert.strictEqual(soldOnly.sold_date, '2022-03-01');
assert.notStrictEqual(soldOnly.sold_date, '2026-08-01');
assert.strictEqual(soldOnly.year_built, null);
assert.ok(!soldOnly.property_type);

console.log('externalPropertyLookup.test.js — all passed');
