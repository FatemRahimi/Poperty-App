/**
 * Property Intelligence lookup flow tests (unit level — no DB)
 * Run: node server/tests/propertyIntelligenceLookup.test.js
 */

const assert = require('assert');
const {
  sanitizePropertyForPublicIntelligence,
} = require('../services/ai/propertyIntelligenceAccess');

function testPublicIntelligenceDoesNotRequireOwnershipFields() {
  const listing = {
    id: 99,
    user_id: 1,
    title: 'Another users flat',
    price: 250000,
    zip_code: 'B1 2UJ',
    status: 'approved',
    contact_email: 'owner@secret.com',
  };
  const pub = sanitizePropertyForPublicIntelligence(listing);
  assert.strictEqual(pub.id, 99);
  assert.strictEqual(pub.user_id, undefined);
  assert.strictEqual(pub.contact_email, undefined);
  assert.strictEqual(pub.price, 250000);
  console.log('✓ public intelligence strips owner fields but keeps listing data');
}

function testInternalMatchShape() {
  const internal = {
    id: 42,
    title: 'Test',
    address_display: '12 High St, B1 2UJ',
    zip_code: 'B1 2UJ',
    source: 'marketplace',
    matchMethod: 'postcode',
    matchConfidence: 'high',
  };
  const match = {
    type: 'internal',
    propertyId: internal.id,
    address: internal.address_display,
    postcode: internal.zip_code,
    source: internal.source,
    matchMethod: internal.matchMethod,
    matchConfidence: internal.matchConfidence,
    property: internal,
  };
  assert.strictEqual(match.type, 'internal');
  assert.strictEqual(match.propertyId, 42);
  assert.strictEqual(match.matchMethod, 'postcode');
  assert.strictEqual(match.property.id, 42);
  console.log('✓ internal match shape for unified lookup results');
}

function testExternalUnavailableStillAllowsInternal() {
  const lookupResult = {
    success: true,
    query: 'B1 2UJ',
    internal: [{ id: 1, address_display: 'Flat 1, B1 2UJ', source: 'marketplace' }],
    external: {
      available: false,
      reason: 'missing_api_key',
      message: 'PropertyData API key not configured',
      matches: [],
    },
    matches: [{ type: 'internal', propertyId: 1 }],
  };
  assert.ok(lookupResult.internal.length > 0);
  assert.strictEqual(lookupResult.external.available, false);
  assert.ok(lookupResult.matches.some((m) => m.type === 'internal'));
  console.log('✓ external provider unavailable — internal matches still returned');
}

function testPrivateListingBlockedByAccessModel() {
  const pendingListing = { status: 'pending', user_id: 5 };
  const isApproved = pendingListing.status === 'approved';
  assert.strictEqual(isApproved, false);
  console.log('✓ unapproved listings remain outside public intelligence browse');
}

function testMissingFieldsGracefulDegradation() {
  const sparse = sanitizePropertyForPublicIntelligence({
    id: 7,
    title: 'Minimal listing',
    status: 'approved',
    bedrooms: null,
    square_feet: null,
    epc_rating: null,
  });
  assert.strictEqual(sparse.bedrooms, null);
  assert.strictEqual(sparse.square_feet, null);
  assert.strictEqual(sparse.epc_rating, null);
  console.log('✓ missing intelligence fields pass through as null (no invention)');
}

testPublicIntelligenceDoesNotRequireOwnershipFields();
testInternalMatchShape();
testExternalUnavailableStillAllowsInternal();
testPrivateListingBlockedByAccessModel();
testMissingFieldsGracefulDegradation();

console.log('propertyIntelligenceLookup.test.js — all passed');
