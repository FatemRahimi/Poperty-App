/**
 * AVM completion UX — controlled missing → save → readiness proof.
 * No live /valuation-sale. No invented facts on genuine HMLR cohort.
 */
const assert = require('assert');
const {
  parseSubjectAttributeInput,
  PROVENANCE,
} = require('../architecture/subjectPropertyAttributes');
const {
  FINISH_QUALITY_UI_OPTIONS,
  FINISH_QUALITY_DISCLAIMER,
  mapUiSelectionToProviderEnum,
  PROVIDER_FINISH_ENUMS,
} = require('../architecture/finishQualityProviderInput');
const {
  resolveSubjectPropertyAttributes,
  applySubjectAttributesToProperty,
  saveUserReportedSubjectAttributes,
  previewAvmReadinessFromPropertyContext,
} = require('../services/identity/subjectPropertyAttributeService');
const { buildValuationSaleRequest } = require('../services/providers/propertyData/propertyTypeMapping');
const {
  buildSubjectAttributeGaps,
  mergeSubjectAttributeGaps,
} = require('../services/ai/subjectPropertyAttributeGap');
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

function officialBase(overrides = {}) {
  return {
    zip_code: 'M1 1AA',
    postcode: 'M1 1AA',
    property_type: 'Terraced',
    square_feet: 900,
    year_built: 1990,
    ...overrides,
  };
}

async function main() {
  console.log('avmCompletionUx');

  test('finish UI options map 1:1 to provider enums with no default', () => {
    assert.strictEqual(FINISH_QUALITY_UI_OPTIONS.length, PROVIDER_FINISH_ENUMS.length);
    for (const opt of FINISH_QUALITY_UI_OPTIONS) {
      assert.ok(PROVIDER_FINISH_ENUMS.includes(opt.providerValue));
      const mapped = mapUiSelectionToProviderEnum(opt.providerValue);
      assert.strictEqual(mapped.ok, true);
      assert.strictEqual(mapped.value, opt.providerValue);
    }
    assert.strictEqual(mapUiSelectionToProviderEnum('').ok, false);
    assert.strictEqual(mapUiSelectionToProviderEnum(null).ok, false);
    assert.strictEqual(FINISH_QUALITY_DISCLAIMER.canonical, false);
    assert.strictEqual(FINISH_QUALITY_DISCLAIMER.providerRequestOnly, true);
    assert.strictEqual(FINISH_QUALITY_DISCLAIMER.provenance, 'USER_REPORTED');
  });

  test('finish cannot be inferred from EPC / empty context', () => {
    const built = buildValuationSaleRequest(officialBase({
      bedrooms: 3,
      bathrooms: 1,
      has_garden: true,
      parking_spaces: 1,
      parking_confirmed: true,
      epc_rating: 'C',
      currentEnergyRating: 'B',
    }));
    assert.strictEqual(built.canRequestAvm, false);
    assert.ok(built.readiness.missingFields.includes('finish_quality'));
    assert.ok(!built.params);
  });

  test('missing fields gaps render only genuinely missing', () => {
    const report = {
      subject: { id: 42 },
      marketIntelligence: {
        sale: {
          readiness: {
            missingFields: ['bedrooms', 'finish_quality'],
          },
        },
      },
    };
    const gaps = buildSubjectAttributeGaps(report);
    assert.strictEqual(gaps.length, 2);
    assert.ok(gaps.some((g) => g.field === 'bedrooms'));
    assert.ok(gaps.some((g) => g.field === 'finish_quality' && g.providerRequestOnly));
    assert.ok(!gaps.some((g) => g.field === 'bathrooms'));
  });

  test('unknown outdoor/parking remain unknown (blank not persisted as zero)', () => {
    const parsed = parseSubjectAttributeInput({ bedrooms: 2 });
    assert.strictEqual(parsed.ok, true);
    assert.strictEqual(parsed.attributes.offStreetParking, undefined);
    assert.strictEqual(parsed.attributes.outdoor, undefined);
  });

  test('zero/none preserved when explicit', () => {
    const parsed = parseSubjectAttributeInput({
      bathrooms: 0,
      outdoor: 'none',
      offStreetParking: 0,
      finishQuality: 'below_average',
    });
    assert.strictEqual(parsed.ok, true);
    assert.strictEqual(parsed.attributes.bathrooms, 0);
    assert.strictEqual(parsed.attributes.outdoor, 'none');
    assert.strictEqual(parsed.attributes.offStreetParking, 0);
    assert.strictEqual(parsed.providerRequestInputs.finishQuality, 'below_average');
  });

  await testAsync('controlled completion: missing → USER_REPORTED → PROVIDER_ELIGIBLE', async () => {
    const store = { attributes: {} };
    const subject = {
      id: 9001,
      uprn: '100',
      normalized_address: '1 Test St',
      postcode: 'M1 1AA',
      property_id: null,
      attributes: store.attributes,
    };
    const incomplete = buildValuationSaleRequest(officialBase());
    assert.strictEqual(incomplete.canRequestAvm, false);
    assert.ok(incomplete.readiness.missingFields.includes('bedrooms'));
    assert.ok(incomplete.readiness.missingFields.includes('finish_quality'));

    const result = await saveUserReportedSubjectAttributes({
      subjectId: 9001,
      userId: 1,
      body: {
        bedrooms: 3,
        bathrooms: 1,
        outdoor: 'garden',
        offStreetParking: 0,
        finishQuality: 'average',
        propertyContext: officialBase(),
      },
      isAdmin: true,
      deps: {
        findSubjectById: async () => ({ ...subject, attributes: store.attributes }),
        userHasSubjectLookup: async () => true,
        upsertSubject: async (row) => {
          store.attributes = row.attributes;
          return { ...subject, id: 9001, attributes: row.attributes };
        },
      },
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.attributes.bedrooms.provenance, PROVENANCE.USER_REPORTED);
    assert.strictEqual(result.attributes.bathrooms.value, 1);
    assert.strictEqual(result.attributes.offStreetParking.value, 0);
    assert.strictEqual(result.attributes.finishQualityProviderRequest.value, 'average');
    assert.strictEqual(result.attributes.finishQualityProviderRequest.providerRequestOnly, true);
    assert.ok(result.readiness);
    assert.strictEqual(result.readiness.canRequestAvm, true);
    assert.strictEqual(result.readiness.state, 'PROVIDER_ELIGIBLE');
    assert.strictEqual(result.readiness.providerCalled, false);
    assert.deepStrictEqual(result.readiness.missingFields, []);
  });

  test('incomplete contract never yields provider params', () => {
    const resolved = resolveSubjectPropertyAttributes({
      subject: {
        id: 1,
        attributes: {
          propertyAttributes: {
            bedrooms: { value: 2, provenance: PROVENANCE.USER_REPORTED },
          },
        },
      },
    });
    const readiness = previewAvmReadinessFromPropertyContext({
      propertyContext: officialBase(),
      resolved,
    });
    assert.strictEqual(readiness.canRequestAvm, false);
    assert.ok(readiness.missingFields.includes('bathrooms'));
    assert.ok(readiness.missingFields.includes('finish_quality'));
    const built = buildValuationSaleRequest(
      applySubjectAttributesToProperty(officialBase(), resolved)
    );
    assert.ok(!built.params);
  });

  test('history immutability — completion helpers do not touch AiRequest', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '../services/identity/subjectPropertyAttributeService.js'),
      'utf8'
    );
    assert.ok(!/AiRequest|ai_requests/.test(src));
  });

  test('listing flows remain compatible when complete', () => {
    const built = buildValuationSaleRequest(officialBase({
      bedrooms: 2,
      bathrooms: 1,
      has_garden: true,
      parking_spaces: 1,
      finish_quality: 'high',
    }));
    assert.strictEqual(built.canRequestAvm, true);
  });

  test('rent path unchanged', () => {
    const params = buildRentsQueryParams('M1 1AA', { bedrooms: 2, property_type: 'flat' });
    assert.strictEqual(params.postcode, 'M11AA');
    assert.ok(!Object.prototype.hasOwnProperty.call(params, 'finish_quality'));
  });

  test('mergeSubjectAttributeGaps retains prior unresolved', () => {
    const merged = mergeSubjectAttributeGaps(
      [{ id: 'other', label: 'Other' }],
      {
        subject: { id: 7 },
        marketIntelligence: { sale: { readiness: { missingFields: ['bedrooms'] } } },
      }
    );
    assert.ok(merged.some((r) => r.id === 'other'));
    assert.ok(merged.some((r) => r.id === 'subject_bedrooms'));
  });

  await testAsync('subject ACL preserved on save', async () => {
    const result = await saveUserReportedSubjectAttributes({
      subjectId: 1,
      userId: 9,
      body: { bedrooms: 2 },
      isAdmin: false,
      deps: {
        findSubjectById: async () => ({ id: 1, attributes: {} }),
        userHasSubjectLookup: async () => false,
        upsertSubject: async () => { throw new Error('must not upsert'); },
      },
    });
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.code, 'FORBIDDEN');
  });

  console.log('avmCompletionUx: all passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
