/**
 * Focused tests — subject property attributes + complete AVM readiness.
 */
const assert = require('assert');
const {
  parseSubjectAttributeInput,
  OUTDOOR_VALUE,
  PROVENANCE,
} = require('../architecture/subjectPropertyAttributes');
const {
  observationsFromListing,
  resolveSubjectPropertyAttributes,
  applySubjectAttributesToProperty,
  saveUserReportedSubjectAttributes,
} = require('../services/identity/subjectPropertyAttributeService');
const {
  mapOutdoorSpace,
  mapOffStreetParking,
  mapFinishQuality,
  buildValuationSaleRequest,
} = require('../services/providers/propertyData/propertyTypeMapping');
const { buildSubjectNativeValuationProperty } = require('../services/ai/subjectNativeSaleValuation');
const { buildRentsQueryParams } = require('../services/providers/propertyData/propertyTypeMapping');

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

function completeListing(overrides = {}) {
  return {
    zip_code: 'M1 1AA',
    square_feet: 900,
    property_type: 'Terraced',
    year_built: 1990,
    bedrooms: 3,
    bathrooms: 1,
    has_garden: true,
    parking_spaces: 1,
    finish_quality: 'average',
    ...overrides,
  };
}

console.log('subjectPropertyAttributes');

test('1. subject bedrooms USER_REPORTED parse + provenance shape', () => {
  const parsed = parseSubjectAttributeInput({ bedrooms: 3 });
  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(parsed.attributes.bedrooms, 3);
  const resolved = resolveSubjectPropertyAttributes({
    subject: {
      id: 1,
      attributes: {
        propertyAttributes: {
          bedrooms: { value: 3, provenance: PROVENANCE.USER_REPORTED, source: 'subject_attribute_capture' },
        },
      },
    },
  });
  assert.strictEqual(resolved.bedrooms.available, true);
  assert.strictEqual(resolved.bedrooms.value, 3);
  assert.strictEqual(resolved.bedrooms.provenance, PROVENANCE.USER_REPORTED);
});

test('2. subject bathrooms persists in attribute bag shape', () => {
  const resolved = resolveSubjectPropertyAttributes({
    subject: {
      id: 2,
      attributes: {
        propertyAttributes: {
          bathrooms: { value: 0, provenance: PROVENANCE.USER_REPORTED, source: 't' },
        },
      },
    },
  });
  assert.strictEqual(resolved.bathrooms.value, 0);
  assert.strictEqual(resolved.bathrooms.available, true);
});

test('3. confirmed zero bathrooms/parking semantics', () => {
  const p = applySubjectAttributesToProperty({}, {
    bedrooms: { available: true, value: 2, provenance: PROVENANCE.USER_REPORTED },
    bathrooms: { available: true, value: 0, provenance: PROVENANCE.USER_REPORTED },
    outdoor: { available: true, value: OUTDOOR_VALUE.NONE, provenance: PROVENANCE.USER_REPORTED },
    offStreetParking: { available: true, value: 0, provenance: PROVENANCE.USER_REPORTED },
    finishQualityProviderRequest: { available: true, value: 'average' },
  });
  assert.strictEqual(p.bathrooms, 0);
  assert.strictEqual(p.parking_spaces, 0);
  assert.strictEqual(p.parking_confirmed, true);
  assert.strictEqual(mapOffStreetParking(p), 0);
});

test('4. unknown != zero', () => {
  assert.strictEqual(mapOffStreetParking({ parking_spaces: 0 }), null);
  assert.strictEqual(mapOffStreetParking({}), null);
  assert.strictEqual(mapOutdoorSpace({ has_garden: false }), null);
  const req = buildValuationSaleRequest({
    zip_code: 'M1 1AA',
    square_feet: 900,
    property_type: 'Terraced',
    year_built: 1990,
    bedrooms: 2,
    bathrooms: 1,
    finish_quality: 'average',
    parking_spaces: 0,
  });
  assert.ok(req.readiness.missingFields.includes('off_street_parking')
    || req.readiness.missingFields.includes('outdoor_space'));
});

test('5. confirmed no outdoor space maps to provider none', () => {
  assert.strictEqual(mapOutdoorSpace({ outdoor: 'none' }), 'none');
  assert.strictEqual(mapOutdoorSpace({ outdoor_none_confirmed: true }), 'none');
});

test('6. unknown outdoor space does not map to none', () => {
  assert.strictEqual(mapOutdoorSpace({}), null);
  assert.strictEqual(mapOutdoorSpace({ has_garden: false }), null);
});

test('7. confirmed zero parking preserved and sent', () => {
  const req = buildValuationSaleRequest(completeListing({
    outdoor: 'none',
    has_garden: false,
    outdoor_none_confirmed: true,
    parking_spaces: 0,
    parking_confirmed: true,
  }));
  assert.strictEqual(req.canRequestAvm, true);
  assert.strictEqual(req.params.off_street_parking, 0);
  assert.strictEqual(req.params.outdoor_space, 'none');
});

test('8. unknown parking remains missing', () => {
  const req = buildValuationSaleRequest(completeListing({
    parking_spaces: 0,
    parking_confirmed: false,
  }));
  assert.strictEqual(req.canRequestAvm, false);
  assert.ok(req.readiness.missingFields.includes('off_street_parking'));
});

test('9. listing-bound bedrooms/bathrooms compatible', () => {
  const fromListing = observationsFromListing({
    id: 10,
    bedrooms: 3,
    bathrooms: 2,
    has_garden: true,
    parking_spaces: 2,
  });
  assert.strictEqual(fromListing.bedrooms.value, 3);
  assert.strictEqual(fromListing.bathrooms.value, 2);
  const resolved = resolveSubjectPropertyAttributes({
    subject: { id: 5, property_id: 10, attributes: {} },
    listingProperty: {
      id: 10,
      bedrooms: 3,
      bathrooms: 2,
      has_garden: true,
      parking_spaces: 2,
    },
  });
  assert.strictEqual(resolved.bedrooms.value, 3);
  assert.strictEqual(resolved.boundListingId, 10);
});

test('10. unrelated listing cannot populate subject', () => {
  const resolved = resolveSubjectPropertyAttributes({
    subject: { id: 5, property_id: 10, attributes: {} },
    listingProperty: {
      id: 999,
      bedrooms: 8,
      bathrooms: 4,
      has_garden: true,
      parking_spaces: 3,
    },
  });
  assert.strictEqual(resolved.bedrooms.available, false);
  assert.strictEqual(resolved.bathrooms.available, false);
});

test('11. conflicts retained when USER_REPORTED differs from listing', () => {
  const resolved = resolveSubjectPropertyAttributes({
    subject: {
      id: 5,
      property_id: 10,
      attributes: {
        propertyAttributes: {
          bedrooms: { value: 2, provenance: PROVENANCE.USER_REPORTED, source: 't' },
        },
      },
    },
    listingProperty: { id: 10, bedrooms: 4 },
  });
  assert.strictEqual(resolved.bedrooms.value, 2);
  assert.strictEqual(resolved.bedrooms.state, 'CONFLICT');
  assert.strictEqual(resolved.bedrooms.conflict.listingValue, 4);
});

test('12. historical analysis immutable — attribute module does not touch AiRequest', () => {
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '../services/identity/subjectPropertyAttributeService.js'),
    'utf8'
  );
  assert.ok(!/AiRequest|ai_requests|UPDATE.*history/i.test(src));
});

test('13-17. provider readiness requires beds/baths/finish/outdoor/parking', () => {
  const base = {
    zip_code: 'M1 1AA',
    square_feet: 900,
    property_type: 'Terraced',
    year_built: 1990,
  };
  assert.ok(buildValuationSaleRequest({ ...base }).readiness.missingFields.includes('bedrooms'));
  assert.ok(buildValuationSaleRequest({ ...base, bedrooms: 2 }).readiness.missingFields.includes('bathrooms'));
  assert.ok(buildValuationSaleRequest({
    ...base, bedrooms: 2, bathrooms: 1, has_garden: true, parking_spaces: 1,
  }).readiness.missingFields.includes('finish_quality'));
  assert.ok(buildValuationSaleRequest({
    ...base, bedrooms: 2, bathrooms: 1, finish_quality: 'average', parking_spaces: 1,
  }).readiness.missingFields.includes('outdoor_space'));
  assert.ok(buildValuationSaleRequest({
    ...base, bedrooms: 2, bathrooms: 1, finish_quality: 'average', has_garden: true,
  }).readiness.missingFields.includes('off_street_parking'));
});

test('18. complete legitimate contract → PROVIDER_ELIGIBLE', () => {
  const req = buildValuationSaleRequest(completeListing());
  assert.strictEqual(req.canRequestAvm, true);
  assert.strictEqual(req.readiness.state, 'PROVIDER_ELIGIBLE');
  assert.deepStrictEqual(req.readiness.missingFields, []);
  assert.strictEqual(req.params.bedrooms, 3);
  assert.strictEqual(req.params.bathrooms, 1);
  assert.strictEqual(req.params.finish_quality, 'average');
  assert.strictEqual(req.params.outdoor_space, 'garden');
  assert.strictEqual(req.params.off_street_parking, 1);
});

test('19. incomplete contract → PROVIDER_NOT_CALLED_MISSING_INPUT', () => {
  const req = buildValuationSaleRequest({
    zip_code: 'M1 1AA',
    square_feet: 900,
    property_type: 'Terraced',
    year_built: 1990,
  });
  assert.strictEqual(req.canRequestAvm, false);
  assert.strictEqual(req.readiness.state, 'PROVIDER_NOT_CALLED_MISSING_INPUT');
  assert.strictEqual(req.params, null);
});

test('20. provider params null when incomplete (not called)', () => {
  const req = buildValuationSaleRequest(completeListing({ finish_quality: null, condition: null }));
  assert.strictEqual(req.params, null);
  assert.strictEqual(req.canRequestAvm, false);
});

test('21. no default finish_quality', () => {
  assert.strictEqual(mapFinishQuality(null), null);
  assert.strictEqual(mapFinishQuality(''), null);
  const req = buildValuationSaleRequest(completeListing({ finish_quality: undefined, condition: null }));
  delete req; // eslint
  const r = buildValuationSaleRequest({
    zip_code: 'M1 1AA',
    square_feet: 900,
    property_type: 'Terraced',
    year_built: 1990,
    bedrooms: 2,
    bathrooms: 1,
    has_garden: true,
    parking_spaces: 1,
  });
  assert.ok(r.readiness.missingFields.includes('finish_quality'));
  assert.ok(!r.params);
});

test('22. EPC cannot imply finish_quality', () => {
  const r = buildValuationSaleRequest({
    ...completeListing({ finish_quality: null }),
    currentEnergyRating: 'B',
    epcRating: 'B',
  });
  assert.ok(r.readiness.missingFields.includes('finish_quality'));
});

test('23. habitable rooms cannot imply bedrooms', () => {
  const parsed = parseSubjectAttributeInput({ habitable_room_count: 5, bedrooms: 3 });
  assert.strictEqual(parsed.ok, false);
  assert.ok(parsed.errors.some((e) => e.reason === 'forbidden_trust_or_inference_key' || e.field));
  // Explicit rejection of inference keys when present without bedrooms alone is enough;
  // bare habitable alone:
  const onlyHab = parseSubjectAttributeInput({ habitableRoomCount: 4 });
  assert.strictEqual(onlyHab.ok, false);
});

test('24. shower-related EPB fields cannot imply bathrooms', () => {
  const only = parseSubjectAttributeInput({
    rooms_with_bath_and_or_shower: 1,
  });
  assert.strictEqual(only.ok, false);
});

testAsync('25. subject auth/ACL — forbidden without lookup', async () => {
  const result = await saveUserReportedSubjectAttributes({
    subjectId: 1,
    userId: 99,
    body: { bedrooms: 2 },
    deps: {
      findSubjectById: async () => ({ id: 1, uprn: '1', normalized_address: 'x', attributes: {} }),
      userHasSubjectLookup: async () => false,
      upsertSubject: async () => { throw new Error('should not upsert'); },
    },
  });
  assert.strictEqual(result.code, 'FORBIDDEN');
});

test('26. provider cost protection — incomplete never yields params', () => {
  const req = buildValuationSaleRequest({
    zip_code: 'M1 1AA',
    square_feet: 900,
    property_type: 'flat',
    year_built: 2001,
  });
  assert.strictEqual(req.params, null);
  assert.strictEqual(req.canRequestAvm, false);
});

test('27. existing sale listing path compatible when complete', () => {
  const listing = completeListing({ id: 123, category: 'sale', price: 250000 });
  const req = buildValuationSaleRequest(listing);
  assert.strictEqual(req.canRequestAvm, true);
  assert.strictEqual(req.params.construction_date, '1914_2000');
});

test('28. rent path unchanged', () => {
  const rentParams = buildRentsQueryParams('M1 1AA', { bedrooms: 2, property_type: 'flat' });
  assert.strictEqual(rentParams.postcode, 'M11AA');
  assert.ok(!Object.prototype.hasOwnProperty.call(rentParams, 'finish_quality'));
  assert.ok(!Object.prototype.hasOwnProperty.call(rentParams, 'construction_date'));
});

test('subject-native builder carries attribute fields', () => {
  const p = buildSubjectNativeValuationProperty({
    subjectId: 1,
    postcode: 'SW1A 1AA',
    propertyType: 'terraced',
    squareFeet: 900,
    yearBuilt: 1990,
    bedrooms: 3,
    bathrooms: 1,
    outdoor: 'garden',
    parkingSpaces: 0,
    parkingConfirmed: true,
    finishQuality: 'average',
  });
  const req = buildValuationSaleRequest(p);
  assert.strictEqual(req.canRequestAvm, true);
  assert.strictEqual(req.params.off_street_parking, 0);
});

console.log('subjectPropertyAttributes: all passed');
