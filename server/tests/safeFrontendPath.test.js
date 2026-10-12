/**
 * Safe post-login frontend paths for Google OAuth return.
 * Run: node server/tests/safeFrontendPath.test.js
 */

const assert = require('assert');
const { safeFrontendPath } = require('../utils/safeFrontendPath');

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    console.error(`✗ ${name}`);
    throw e;
  }
}

test('keeps Property Intelligence return path', () => {
  assert.strictEqual(
    safeFrontendPath('/ai-services/property-intelligence'),
    '/ai-services/property-intelligence'
  );
  assert.strictEqual(
    safeFrontendPath('/ai-services/property-intelligence?propertyId=12'),
    '/ai-services/property-intelligence?propertyId=12'
  );
});

test('rejects absolute and protocol-relative URLs', () => {
  assert.strictEqual(safeFrontendPath('https://evil.example/phish'), '/');
  assert.strictEqual(safeFrontendPath('//evil.example'), '/');
});

console.log('safeFrontendPath tests passed');
