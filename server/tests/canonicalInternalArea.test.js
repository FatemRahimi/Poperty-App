/**
 * Canonical internal floor-area contract and resolution.
 * Run: node server/tests/canonicalInternalArea.test.js
 */

const assert = require('assert');
const {
  convertToSqft,
  normaliseUnit,
  isPlausibleSqft,
  AVM_MIN_SQFT,
  AREA_UNIT,
  AREA_SOURCE,
} = require('../architecture/canonicalInternalArea');
const {
  resolveCanonicalInternalArea,
  applyCanonicalInternalAreaToProperty,
  parseDeclaredInternalArea,
  observationFromListing,
  observationFromEpb,
  detectConflicts,
  selectObservation,
} = require('../services/identity/internalAreaResolution');
const { buildValuationSaleRequest } = require('../services/providers/propertyData/propertyTypeMapping');
const { resolveIntelligenceAnalyseOptions } = require('../controllers/intelligenceController');

function test(name, fn) {
  const result = fn();
  if (result && typeof result.then === 'function') {
    return result.then(() => console.log(`✓ ${name}`));
  }
  console.log(`✓ ${name}`);
  return Promise.resolve();
}

(async () => {
  await test('convertToSqft handles sqft and sqm exactly', () => {
    assert.strictEqual(convertToSqft(850, AREA_UNIT.SQFT), 850);
    assert.strictEqual(convertToSqft(50, AREA_UNIT.SQM), Math.round(50 * 10.7639));
  });

  await test('missing unit is invalid — not treated as missing value', () => {
    const obs = observationFromListing({ floor_area: 900, floor_area_unit: '' });
    assert.strictEqual(obs.rawUnit, AREA_UNIT.UNKNOWN);
    assert.strictEqual(obs.available, false);
  });

  await test('zero and negative areas are rejected', () => {
    assert.strictEqual(convertToSqft(0, AREA_UNIT.SQFT), null);
    assert.strictEqual(convertToSqft(-10, AREA_UNIT.SQFT), null);
  });

  await test('isPlausibleSqft enforces provider minimum without fabrication', () => {
    assert.strictEqual(isPlausibleSqft(299), false);
    assert.strictEqual(isPlausibleSqft(300), true);
    assert.strictEqual(isPlausibleSqft(311098324), false);
  });

  await test('EPB observation withheld for unit-like property without SAON', () => {
    const epb = {
      client: {
        attachmentStatus: 'UNIQUE_ATTACH',
        current: { floorAreaSqm: 65 },
        certificateType: 'domestic',
      },
    };
    const obs = observationFromEpb(epb, { property_type: 'flat' }, {});
    assert.strictEqual(obs.subjectScope, 'unavailable');
    assert.strictEqual(obs.available, true);
  });

  await test('conflicting observations preserved — not averaged', () => {
    const a = { source: AREA_SOURCE.INTERNAL_LISTING, available: true, normalisedValueSqft: 900, subjectScope: 'property' };
    const b = { source: AREA_SOURCE.USER_DECLARED, available: true, normalisedValueSqft: 1200, subjectScope: 'property' };
    const conflicts = detectConflicts([a, b]);
    assert.ok(conflicts.length >= 1);
    const selected = selectObservation([a, b]);
    assert.strictEqual(selected.source, AREA_SOURCE.INTERNAL_LISTING);
  });

  await test('user-declared area parses value and unit; rejects authority injection', () => {
    const ok = parseDeclaredInternalArea({ value: 950, unit: 'sqft' });
    assert.ok(ok.ok);
    assert.strictEqual(ok.value.value, 950);

    const bad = parseDeclaredInternalArea({ value: 950, unit: 'sqft', readiness: 'PROVIDER_ELIGIBLE' });
    assert.strictEqual(bad.ok, false);
  });

  await test('resolveCanonicalInternalArea selects listing sqm after conversion', async () => {
    const resolution = await resolveCanonicalInternalArea({
      property: { id: 1, property_type: 'house', square_feet: null, floor_area: 100, floor_area_unit: 'sq_m' },
      loadPersistedEpb: false,
    });
    assert.strictEqual(resolution.available, true);
    assert.strictEqual(resolution.selectedSource, AREA_SOURCE.INTERNAL_LISTING);
    assert.ok(resolution.normalisedValueSqft >= AVM_MIN_SQFT);
  });

  await test('applyCanonicalInternalAreaToProperty does not fabricate when missing', async () => {
    const resolution = await resolveCanonicalInternalArea({
      property: { id: 155, property_type: 'semi-detached', zip_code: 'B5 5PH' },
      loadPersistedEpb: false,
    });
    const applied = applyCanonicalInternalAreaToProperty({ id: 155 }, resolution);
    assert.strictEqual(applied.square_feet, undefined);
    assert.strictEqual(applied.internalAreaResolution.readiness.reasonCode, 'MISSING_INTERNAL_AREA');
  });

  await test('buildValuationSaleRequest receives canonical sqft from applied property', async () => {
    const resolution = await resolveCanonicalInternalArea({
      property: { property_type: 'flat', floor_area: 80, floor_area_unit: 'sq_m', zip_code: 'BS1 1HT' },
      loadPersistedEpb: false,
    });
    const property = applyCanonicalInternalAreaToProperty({ property_type: 'flat', zip_code: 'BS1 1HT', year_built: 2005, bedrooms: 2, bathrooms: 1, has_garden: true, parking_spaces: 1, finish_quality: 'average' }, resolution);
    const req = buildValuationSaleRequest(property);
    assert.strictEqual(req.readiness.reasonCode, null);
    assert.ok(req.params.internal_area >= AVM_MIN_SQFT);
  });

  await test('resolveIntelligenceAnalyseOptions passes declaredInternalArea only as observation', () => {
    const parsed = resolveIntelligenceAnalyseOptions({
      decisionJob: 'BUY',
      declaredInternalArea: { value: 900, unit: 'sqft' },
    });
    assert.ok(parsed.ok);
    assert.deepStrictEqual(parsed.options.declaredInternalArea.value, 900);
  });

  await test('implausible listing area yields INVALID not coerced to 300', async () => {
    const resolution = await resolveCanonicalInternalArea({
      property: { id: 133, property_type: 'house', square_feet: 311098324 },
      loadPersistedEpb: false,
    });
    assert.strictEqual(resolution.readiness.reasonCode, 'INVALID_INTERNAL_AREA');
    const req = buildValuationSaleRequest(
      applyCanonicalInternalAreaToProperty({ property_type: 'house', zip_code: 'X1 1XX' }, resolution)
    );
    assert.strictEqual(req.canRequestAvm, false);
  });

  console.log('\nAll canonical internal-area tests passed.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
