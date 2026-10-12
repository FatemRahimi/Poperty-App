/**
 * Valuation evidence pipeline correctness — persistence, type mapping, safety.
 * Run: node server/tests/valuationEvidencePipeline.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { canonicalPropertyTypeToken } = require('../utils/canonicalPropertyType');
const {
  mapToPropertyDataType,
  buildValuationSaleRequest,
} = require('../services/providers/propertyData/propertyTypeMapping');
const { fetchAndPersistEnrichment } = require('../services/enrichment/propertyEnrichmentService');
const { calculatePropertyValuation } = require('../services/ai/valuationEngine');

function test(name, fn) {
  const result = fn();
  if (result && typeof result.then === 'function') {
    return result.then(() => console.log(`✓ ${name}`));
  }
  console.log(`✓ ${name}`);
  return Promise.resolve();
}

function memoryEnrichmentStore() {
  const rows = new Map();
  const key = (propertyId, type, source) => `${propertyId}|${type}|${source}`;
  return {
    async findEnrichment(propertyId, enrichmentType, source) {
      return rows.get(key(propertyId, enrichmentType, source)) || null;
    },
    async upsertEnrichment({ propertyId, enrichmentType, source, payload, provenance, expiresAt }) {
      const row = {
        property_id: propertyId,
        enrichment_type: enrichmentType,
        source,
        payload,
        provenance,
        expires_at: expiresAt,
        retrieved_at: new Date().toISOString(),
      };
      rows.set(key(propertyId, enrichmentType, source), row);
      return row;
    },
  };
}

(async () => {
  await test('canonicalPropertyTypeToken resolves plain, array, and PG array shapes', () => {
    assert.strictEqual(canonicalPropertyTypeToken('semi-detached'), 'semi-detached');
    assert.strictEqual(canonicalPropertyTypeToken(['semi-detached']), 'semi-detached');
    assert.strictEqual(
      canonicalPropertyTypeToken('{"semi-detached","semi-detached"}'),
      'semi-detached'
    );
    assert.strictEqual(canonicalPropertyTypeToken('{"flat","house"}'), null);
  });

  await test('mapToPropertyDataType maps canonical residential tokens', () => {
    assert.strictEqual(mapToPropertyDataType('{"semi-detached","semi-detached"}'), 'semi-detached_house');
    assert.strictEqual(mapToPropertyDataType('flat'), 'flat');
    assert.strictEqual(mapToPropertyDataType('apartment'), 'flat');
    assert.strictEqual(mapToPropertyDataType('terraced'), 'terraced_house');
    assert.strictEqual(mapToPropertyDataType('bungalow'), 'detached_house');
    assert.strictEqual(mapToPropertyDataType('office'), null);
  });

  await test('buildValuationSaleRequest classifies missing internal_area vs unmapped type', () => {
    const missingArea = buildValuationSaleRequest({
      zip_code: 'BS1 1HT',
      property_type: 'flat',
      square_feet: null,
    });
    assert.strictEqual(missingArea.readiness.reasonCode, 'MISSING_INTERNAL_AREA');

    const pgArray = buildValuationSaleRequest({
      zip_code: 'B5 5PH',
      property_type: '{"semi-detached","semi-detached"}',
      square_feet: 1200,
      year_built: 1998,
      bedrooms: 3,
      bathrooms: 1,
      has_garden: true,
      parking_spaces: 1,
      finish_quality: 'average',
    });
    assert.strictEqual(pgArray.canRequestAvm, true);
    assert.strictEqual(pgArray.params.property_type, 'semi-detached_house');
  });

  await test('upsertEnrichment uses partial unique index ON CONFLICT target', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'services', 'enrichment', 'propertyIdentityRepository.js'),
      'utf8'
    );
    assert.match(
      source,
      /ON CONFLICT \(property_id, enrichment_type, source\) WHERE \(property_id IS NOT NULL\)/
    );
  });

  await test('fetchAndPersistEnrichment attaches sold_prices to valuation engine', async () => {
    const store = memoryEnrichmentStore();
    const property = {
      id: 901,
      zip_code: 'BS1 1HT',
      category: 'sale',
      price: 23000,
      property_type: 'flat',
    };
    const result = await fetchAndPersistEnrichment({
      property,
      enrichmentType: 'sold_prices',
      source: 'PropertyData',
      ttlMs: 3600000,
      context: { deps: store },
      fetchFn: async () => ({
        success: true,
        data: { data: { average: 261300, points_analysed: 20 }, status: 'success' },
        provenance: { source: 'PropertyData', method: 'sold_prices', providerEndpoint: '/sold-prices' },
        creditsUsed: 1,
      }),
    });
    assert.strictEqual(result.success, true);
    assert.ok(await store.findEnrichment(901, 'sold_prices', 'PropertyData'));
    const val = await calculatePropertyValuation(property, { enrichments: { sold_prices: result } });
    assert.strictEqual(val.components.length, 1);
    assert.strictEqual(val.components[0].method, 'sold_prices_statistics');
    assert.strictEqual(val.notAssessed, true);
  });

  await test('enrichment lookup cannot cross-contaminate properties', async () => {
    const store = memoryEnrichmentStore();
    await store.upsertEnrichment({
      propertyId: 149,
      enrichmentType: 'sold_prices',
      source: 'PropertyData',
      payload: { average: 261300 },
      provenance: { source: 'PropertyData' },
    });
    await store.upsertEnrichment({
      propertyId: 155,
      enrichmentType: 'sold_prices',
      source: 'PropertyData',
      payload: { average: 999999 },
      provenance: { source: 'PropertyData' },
    });
    assert.strictEqual(
      (await store.findEnrichment(149, 'sold_prices', 'PropertyData')).payload.average,
      261300
    );
    assert.strictEqual(await store.findEnrichment(148, 'sold_prices', 'PropertyData'), null);
  });

  await test('£232 asking-only path remains NOT_ASSESSED with area stats attached', async () => {
    const property = {
      id: 155,
      category: 'sale',
      price: 300000,
      property_type: '{"semi-detached","semi-detached"}',
      zip_code: 'B5 5PH',
      city: 'Birmingham',
      bedrooms: 3,
      square_feet: 1200,
    };
    const val = await calculatePropertyValuation(
      property,
      {
        enrichments: {
          sold_prices: {
            success: true,
            data: { data: { average: 280000, points_analysed: 15 } },
          },
        },
      },
      {
        analyseSaleComparables: async () => ({
          success: true,
          evidenceKind: 'asking_listing',
          cannotSolelyAssessValuation: true,
          recommendedPrice: 232,
          comparables: [{ id: 123, price: 232 }],
        }),
      }
    );
    assert.strictEqual(val.success, false);
    assert.strictEqual(val.notAssessed, true);
    assert.ok(val.components.some((c) => c.method === 'sold_prices_statistics'));
  });

  console.log('\nAll valuationEvidencePipeline tests passed.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
