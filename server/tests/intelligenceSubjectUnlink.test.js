/**
 * Unit tests for subject listing unlink authorization shape.
 * Run: node server/tests/intelligenceSubjectUnlink.test.js
 */

const assert = require('assert');
const {
  unlinkSubjectFromListing,
  userHasSubjectLookup,
} = require('../services/enrichment/intelligenceSubjectRepository');

assert.strictEqual(typeof unlinkSubjectFromListing, 'function');
assert.strictEqual(typeof userHasSubjectLookup, 'function');

console.log('intelligenceSubjectUnlink.test.js — exports OK');
