/**
 * Listing internal-area capture — create/edit validation and persistence.
 * Run: node server/tests/listingInternalAreaCapture.test.js
 */

const assert = require('assert');
const {
  parseListingInternalAreaInput,
  FORBIDDEN_AUTHORITY_KEYS,
} = require('../services/identity/listingInternalAreaCapture');
const {
  resolveCanonicalInternalArea,
  applyCanonicalInternalAreaToProperty,
} = require('../services/identity/internalAreaResolution');
const { buildValuationSaleRequest } = require('../services/providers/propertyData/propertyTypeMapping');
const { AREA_SOURCE, AVM_MIN_SQFT } = require('../architecture/canonicalInternalArea');

function test(name, fn) {
  const result = fn();
  if (result && typeof result.then === 'function') {
    return result.then(() => console.log(`✓ ${name}`));
  }
  console.log(`✓ ${name}`);
  return Promise.resolve();
}

(async () => {
  await test('create with sqft persists raw and normalised fields', () => {
    const parsed = parseListingInternalAreaInput(
      { floor_area: 900, floor_area_unit: 'sq_ft' },
      { mode: 'create' }
    );
    assert.strictEqual(parsed.ok, true);
    assert.strictEqual(parsed.fields.square_feet, 900);
    assert.strictEqual(parsed.fields.floor_area, 900);
    assert.strictEqual(parsed.fields.floor_area_unit, 'sq_ft');
    assert.strictEqual(parsed.provenance.source, 'InternalListing');
  });

  await test('create with sqm converts deterministically', () => {
    const parsed = parseListingInternalAreaInput(
      { floor_area: 83.61, floor_area_unit: 'sq_m' },
      { mode: 'create' }
    );
    assert.strictEqual(parsed.ok, true);
    assert.strictEqual(parsed.fields.floor_area, 83.61);
    assert.strictEqual(parsed.fields.floor_area_unit, 'sq_m');
    assert.strictEqual(parsed.fields.square_feet, Math.round(83.61 * 10.7639));
  });

  await test('create without area leaves fields null', () => {
    const parsed = parseListingInternalAreaInput({}, { mode: 'create' });
    assert.strictEqual(parsed.ok, true);
    assert.strictEqual(parsed.fields?.floor_area ?? null, null);
  });

  await test('edit missing → sqft', () => {
    const parsed = parseListingInternalAreaInput(
      { floor_area: 1000, floor_area_unit: 'sq_ft' },
      { mode: 'edit', existing: { square_feet: null } }
    );
    assert.strictEqual(parsed.fields.square_feet, 1000);
  });

  await test('edit sqft → sqm', () => {
    const parsed = parseListingInternalAreaInput(
      { floor_area: 80, floor_area_unit: 'sq_m' },
      { mode: 'edit', existing: { square_feet: 900, floor_area: 900, floor_area_unit: 'sq_ft' } }
    );
    assert.strictEqual(parsed.fields.floor_area_unit, 'sq_m');
    assert.ok(parsed.fields.square_feet >= AVM_MIN_SQFT);
  });

  await test('clear/remove semantics zero stale square_feet', () => {
    const parsed = parseListingInternalAreaInput(
      { clearInternalArea: 'true' },
      { mode: 'edit', existing: { square_feet: 900, floor_area: 900, floor_area_unit: 'sq_ft' } }
    );
    assert.strictEqual(parsed.cleared, true);
    assert.strictEqual(parsed.fields.square_feet, null);
    assert.strictEqual(parsed.fields.floor_area, null);
    assert.strictEqual(parsed.fields.floor_area_unit, null);
  });

  await test('invalid numeric, NaN, Infinity, zero, negative rejected', () => {
    assert.strictEqual(parseListingInternalAreaInput({ floor_area: 'abc', floor_area_unit: 'sq_ft' }).ok, false);
    assert.strictEqual(parseListingInternalAreaInput({ floor_area: NaN, floor_area_unit: 'sq_ft' }).ok, false);
    assert.strictEqual(parseListingInternalAreaInput({ floor_area: Infinity, floor_area_unit: 'sq_ft' }).ok, false);
    assert.strictEqual(parseListingInternalAreaInput({ floor_area: 0, floor_area_unit: 'sq_ft' }).ok, false);
    assert.strictEqual(parseListingInternalAreaInput({ floor_area: -5, floor_area_unit: 'sq_ft' }).ok, false);
  });

  await test('unsupported unit and missing unit rejected', () => {
    assert.strictEqual(
      parseListingInternalAreaInput({ floor_area: 900, floor_area_unit: 'acres' }).error.message,
      'unsupported_unit'
    );
    assert.strictEqual(
      parseListingInternalAreaInput({ floor_area: 900 }).error.message,
      'missing_unit'
    );
  });

  await test('client authority injection rejected', () => {
    for (const key of ['provenance', 'readiness', 'selectedSource', 'official']) {
      const parsed = parseListingInternalAreaInput({
        floor_area: 900,
        floor_area_unit: 'sq_ft',
        [key]: 'PROVIDER_ELIGIBLE',
      });
      assert.strictEqual(parsed.error.message, 'client_authority_rejected', key);
    }
    assert.ok(FORBIDDEN_AUTHORITY_KEYS.includes('internalAreaResolution'));
  });

  await test('sub-300 sqft preserved — provider eligibility separate', async () => {
    const parsed = parseListingInternalAreaInput(
      { floor_area: 250, floor_area_unit: 'sq_ft' },
      { mode: 'create' }
    );
    assert.strictEqual(parsed.fields.square_feet, 250);
    const property = applyCanonicalInternalAreaToProperty(
      { property_type: 'flat', zip_code: 'BS1 1HT' },
      await resolveCanonicalInternalArea({
        property: { floor_area: 250, floor_area_unit: 'sq_ft', property_type: 'flat' },
        loadPersistedEpb: false,
      })
    );
    const req = buildValuationSaleRequest(property);
    assert.notStrictEqual(req.readiness.reasonCode, null);
    assert.ok(req.readiness.reasonCode === 'MISSING_INTERNAL_AREA' || !req.canRequestAvm);
  });

  await test('EPB source precedence over listing', async () => {
    const resolution = await resolveCanonicalInternalArea({
      property: { floor_area: 900, floor_area_unit: 'sq_ft', property_type: 'house' },
      epbEvidence: {
        client: {
          attachmentStatus: 'UNIQUE_ATTACH',
          current: { floorAreaSqm: 100 },
          certificateType: 'domestic',
        },
      },
      loadPersistedEpb: false,
    });
    assert.strictEqual(resolution.selectedSource, AREA_SOURCE.MHCLG_EPBD);
    assert.ok(resolution.conflicts.length >= 1);
  });

  await test('USER_DECLARED remains distinct from listing capture', async () => {
    const listing = await resolveCanonicalInternalArea({
      property: { floor_area: 900, floor_area_unit: 'sq_ft', property_type: 'house' },
      loadPersistedEpb: false,
    });
    const declared = await resolveCanonicalInternalArea({
      property: { property_type: 'house' },
      userDeclared: { value: 1200, unit: 'sqft' },
      loadPersistedEpb: false,
    });
    assert.strictEqual(listing.selectedSource, AREA_SOURCE.INTERNAL_LISTING);
    assert.strictEqual(declared.selectedSource, AREA_SOURCE.USER_DECLARED);
  });

  await test('MISSING → PROVIDER_ELIGIBLE when listing area sufficient', async () => {
    const property = applyCanonicalInternalAreaToProperty(
      {
        property_type: 'semi-detached',
        zip_code: 'B5 5PH',
        category: 'sale',
        year_built: 2001,
        bedrooms: 3,
        bathrooms: 1,
        has_garden: true,
        parking_spaces: 1,
        finish_quality: 'average',
      },
      await resolveCanonicalInternalArea({
        property: { floor_area: 1200, floor_area_unit: 'sq_ft', property_type: 'semi-detached' },
        loadPersistedEpb: false,
      })
    );
    const req = buildValuationSaleRequest(property);
    assert.strictEqual(req.readiness.state, 'PROVIDER_ELIGIBLE');
  });

  await test('implausible legacy listing area stays INVALID', async () => {
    const resolution = await resolveCanonicalInternalArea({
      property: { square_feet: 311098324, property_type: 'terraced' },
      loadPersistedEpb: false,
    });
    assert.strictEqual(resolution.readiness.reasonCode, 'INVALID_INTERNAL_AREA');
  });

  console.log('\nAll listing internal-area capture tests passed.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
