/**
 * Phase 2D — Unified Area Evidence Profile v1.
 * Run: node tests/officialAreaEvidenceProfile.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  getOfficialAreaEvidenceProfile,
} = require('../services/market/officialAreaEvidenceProfile');
const {
  AREA_EVIDENCE_PROFILE_SCHEMA_VERSION,
  AREA_EVIDENCE_FAMILY,
  AREA_EVIDENCE_FAMILY_RUNTIME_REASON,
  AREA_EVIDENCE_FAILURE_KIND,
  FORBIDDEN_PROFILE_INFERENCE_KEYS,
} = require('../architecture/officialAreaEvidenceProfileContract');
const { createMemoryGeographyStore } = require('../services/market/geographyCrosswalkStore');
const { ingestGeographyCsv } = require('../services/market/ingestGeographyCrosswalk');
const { createMemoryUkhpiStore } = require('../services/market/ukhpiStore');
const { createMemoryOfficialSaleStore } = require('../services/market/officialSaleTransactionRepository');
const { ingestIod2025Lad } = require('../services/market/ingestIod2025Lad');
const { ingestOnsMyeLadPopulation } = require('../services/market/ingestOnsMyeLadPopulation');
const { ingestCensus2021Ts054Tenure } = require('../services/market/ingestCensus2021Ts054Tenure');
const { createMemoryIod2025LadStore } = require('../services/market/iod2025LadStore');
const { createMemoryOnsMyeLadPopulationStore } = require('../services/market/onsMyeLadPopulationStore');
const { createMemoryCensus2021Ts054TenureStore } = require('../services/market/census2021Ts054TenureStore');
const { MARKET_RECORD_KIND } = require('../architecture/officialAreaEconomicDataset');
const { EVIDENCE_CLASS } = require('../architecture/evidenceContract');

const GEO_HEADER = 'postcode,countrycode,countryname,localauthoritycode,localauthorityname,ukhpigeographycode,ukhpigeographyname';
const IOD_FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures/iod2025-file10-imd-min.csv'), 'utf8');
const POP_FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures/ons-mye-ltla-population-min.csv'), 'utf8');
const TENURE_FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures/census2021-ts054-tenure-min.csv'), 'utf8');

let passed = 0;
function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`ok ${name}`);
    })
    .catch((error) => {
      console.error(`FAIL ${name}`);
      console.error(error);
      process.exitCode = 1;
    });
}

async function seedUkhpi() {
  const store = createMemoryUkhpiStore();
  const rows = [
    { observationDate: '2021-06-01', indexValue: 50 },
    { observationDate: '2023-06-01', indexValue: 80 },
    { observationDate: '2025-06-01', indexValue: 100 },
    { observationDate: '2026-06-01', indexValue: 110 },
  ];
  const run = await store.startRun({ release_label: '2026-06' });
  for (const row of rows) {
    await store.upsert({
      source: 'UK_HOUSE_PRICE_INDEX',
      dataset: 'UK House Price Index',
      geographyCode: 'E08000025',
      geographyName: 'Birmingham',
      geographyType: 'local authority',
      propertyCategory: 'all',
      annualChange: null,
      ...row,
      releaseLabel: '2026-06',
    });
  }
  await store.finishRun(run.id, { status: 'SUCCEEDED', inserted_count: rows.length });
  return store;
}

async function seedSales() {
  const store = createMemoryOfficialSaleStore();
  const run = await store.startImportRun({ release_label: 'pp-2026-06' });
  await store.upsertBatch([
    {
      source: 'HMLR_PRICE_PAID_DATA',
      source_transaction_id: 'pp-1',
      live: true,
      postcode: 'B1 2UJ',
      postcode_compact: 'B12UJ',
      transfer_date: '2025-12-01',
      price_gbp: 250000,
      price_present: true,
    },
    {
      source: 'HMLR_PRICE_PAID_DATA',
      source_transaction_id: 'pp-2',
      live: true,
      postcode: 'B1 2UJ',
      postcode_compact: 'B12UJ',
      transfer_date: '2026-01-15',
      price_gbp: 260000,
      price_present: true,
    },
    {
      source: 'HMLR_PRICE_PAID_DATA',
      source_transaction_id: 'pp-3',
      live: true,
      postcode: 'B1 2UJ',
      postcode_compact: 'B12UJ',
      transfer_date: '2026-03-01',
      price_gbp: 255000,
      price_present: true,
    },
  ]);
  await store.finishImportRun(run.id, { status: 'SUCCEEDED', inserted_count: 3 });
  return store;
}

async function buildBaseStores() {
  const geography = createMemoryGeographyStore();
  await ingestGeographyCsv(
    [
      GEO_HEADER,
      'B1 2UJ,E92000001,England,E08000025,Birmingham,E08000025,Birmingham',
      'CF10 1AA,W92000004,Wales,W06000015,Cardiff,W06000015,Cardiff',
    ].join('\n'),
    { store: geography, releaseLabel: '2024-02' }
  );

  const ukhpi = await seedUkhpi();
  const saleStore = await seedSales();
  const iod = (await ingestIod2025Lad({ csvText: IOD_FIXTURE })).store;
  const population = (await ingestOnsMyeLadPopulation({ csvText: POP_FIXTURE })).store;
  const tenure = (await ingestCensus2021Ts054Tenure({ csvText: TENURE_FIXTURE })).store;

  return { geography, ukhpi, iod, population, tenure, saleStore };
}

function assertNoForbidden(profile) {
  assert.strictEqual(Object.prototype.hasOwnProperty.call(profile, 'dataDate'), false);
  const blob = JSON.stringify(profile);
  FORBIDDEN_PROFILE_INFERENCE_KEYS.forEach((key) => {
    assert.strictEqual(Object.prototype.hasOwnProperty.call(profile, key), false, key);
    assert.strictEqual(new RegExp(`"${key}"\\s*:`).test(blob), false, key);
  });
}

(async () => {
  await test('resolved geography composes families with schemaVersion and preserved semantics', async () => {
    const stores = await buildBaseStores();
    const profile = await getOfficialAreaEvidenceProfile({
      postcode: 'b1 2uj',
      geographyStore: stores.geography,
      ukhpiStore: stores.ukhpi,
      saleStore: stores.saleStore,
      populationStore: stores.population,
      iodStore: stores.iod,
      tenureStore: stores.tenure,
      asOf: '2026-06-15',
      generatedAt: '2026-10-20T12:00:00.000Z',
    });

    assert.strictEqual(profile.schemaVersion, AREA_EVIDENCE_PROFILE_SCHEMA_VERSION);
    assert.strictEqual(profile.schemaVersion, 'areaEvidenceProfile.v1');
    assert.strictEqual(profile.generatedAt, '2026-10-20T12:00:00.000Z');
    assert.ok(profile.families);
    assert.strictEqual(profile.subject.localAuthorityCode, 'E08000025');
    assert.strictEqual(profile.subject.ukhpiGeographyCode, 'E08000025');
    assert.strictEqual(profile.subject.geographyType, 'COMPOSITE');
    assert.strictEqual(profile.geographyCompatibility.status, 'UNPROVEN_NATIONWIDE');

    assert.strictEqual(profile.families.population.status, 'SUFFICIENT');
    assert.strictEqual(profile.families.population.derivedGrowth, false);
    assert.strictEqual(profile.families.population.subject.referencePeriod, '2024-06-30');
    assert.strictEqual(profile.families.population.geographyVintage, 'LTLA_MID_2024');

    assert.strictEqual(profile.families.deprivation.status, 'SUFFICIENT');
    assert.strictEqual(profile.families.deprivation.geographyVintage, 'LAD_2024');
    assert.strictEqual(profile.families.deprivation.factClass, EVIDENCE_CLASS.AREA_CONTEXT);

    assert.strictEqual(profile.families.housing.tenure.status, 'SUFFICIENT');
    assert.strictEqual(profile.families.housing.tenure.historicalCensusContext, true);
    assert.strictEqual(profile.families.housing.tenure.subject.referencePeriod, '2021-03-21');
    assert.strictEqual(profile.families.housing.tenure.sharesImplemented, false);
    assert.ok(profile.families.housing.tenure.observations.every((row) => (
      row.recordKind === MARKET_RECORD_KIND.OFFICIAL_OBSERVATION
    )));
    assert.ok(profile.families.housing.tenure.aggregates.some((row) => (
      row.recordKind === MARKET_RECORD_KIND.DERIVED_METRIC
      && row.aggregateId === 'SHARED_OWNERSHIP'
    )));

    assert.ok(profile.families.market);
    assert.ok(profile.families.market.coverage);
    assert.ok(Object.prototype.hasOwnProperty.call(profile.families.market, 'hpi'));
    assert.ok(Object.prototype.hasOwnProperty.call(profile.families.market, 'transactions'));
    assert.ok(Object.prototype.hasOwnProperty.call(profile.families.market.transactions, 'transactionCount'));
    assert.ok(Object.prototype.hasOwnProperty.call(profile.families.market.transactions, 'priceSampleCount'));

    assert.notStrictEqual(
      profile.families.population.subject.referencePeriod,
      profile.families.housing.tenure.subject.referencePeriod
    );
    assert.notStrictEqual(
      profile.geographyCompatibility.familyVintages.population,
      profile.geographyCompatibility.familyVintages.housingTenure
    );

    const familyOrder = profile.familyStatus.map((item) => item.family);
    assert.deepStrictEqual(familyOrder, [
      AREA_EVIDENCE_FAMILY.GEOGRAPHY,
      AREA_EVIDENCE_FAMILY.MARKET,
      AREA_EVIDENCE_FAMILY.POPULATION,
      AREA_EVIDENCE_FAMILY.DEPRIVATION,
      AREA_EVIDENCE_FAMILY.HOUSING_TENURE,
    ]);
    assertNoForbidden(profile);
    assert.ok(profile.provenanceRefs.length >= 1);
  });

  await test('ambiguous geography returns no family bodies', async () => {
    const geography = createMemoryGeographyStore();
    await ingestGeographyCsv(
      `${GEO_HEADER}\nB1 2UJ,E92000001,England,E08000025,Birmingham,E08000025,Birmingham\n`,
      { store: geography, releaseLabel: 'alpha-release' }
    );
    await ingestGeographyCsv(
      `${GEO_HEADER}\nB1 2UJ,E92000001,England,E08000025,Birmingham,E08000025,Birmingham\n`,
      { store: geography, releaseLabel: 'beta-release' }
    );
    const population = (await ingestOnsMyeLadPopulation({ csvText: POP_FIXTURE })).store;
    const profile = await getOfficialAreaEvidenceProfile({
      postcode: 'B1 2UJ',
      geographyStore: geography,
      populationStore: population,
      generatedAt: '2026-10-20T12:00:00.000Z',
    });
    assert.strictEqual(profile.status, 'UNRESOLVED');
    assert.strictEqual(profile.reason, 'crosswalk_ambiguous');
    assert.strictEqual(profile.families, null);
    assert.ok(profile.unknowns.some((item) => item.reason === 'geography_not_resolved'));
    assertNoForbidden(profile);
  });

  await test('no-match geography returns no family bodies', async () => {
    const geography = createMemoryGeographyStore();
    await ingestGeographyCsv(
      `${GEO_HEADER}\nB1 2UJ,E92000001,England,E08000025,Birmingham,E08000025,Birmingham\n`,
      { store: geography, releaseLabel: '2024-02' }
    );
    const population = (await ingestOnsMyeLadPopulation({ csvText: POP_FIXTURE })).store;
    const profile = await getOfficialAreaEvidenceProfile({
      postcode: 'SW1A 1AA',
      geographyStore: geography,
      populationStore: population,
      generatedAt: '2026-10-20T12:00:00.000Z',
    });
    assert.strictEqual(profile.status, 'UNAVAILABLE');
    assert.strictEqual(profile.reason, 'postcode_no_match');
    assert.strictEqual(profile.families, null);
    assertNoForbidden(profile);
  });

  await test('invalid postcode returns no family bodies', async () => {
    const geography = createMemoryGeographyStore();
    const profile = await getOfficialAreaEvidenceProfile({
      postcode: 'NOT A POSTCODE',
      geographyStore: geography,
      generatedAt: '2026-10-20T12:00:00.000Z',
    });
    assert.strictEqual(profile.families, null);
    assert.strictEqual(profile.reason, 'invalid_postcode');
    assertNoForbidden(profile);
  });

  await test('NOT_IMPORTED tenure preserves other families and does not fabricate zero', async () => {
    const stores = await buildBaseStores();
    const emptyTenure = createMemoryCensus2021Ts054TenureStore();
    const profile = await getOfficialAreaEvidenceProfile({
      postcode: 'B1 2UJ',
      geographyStore: stores.geography,
      ukhpiStore: stores.ukhpi,
      saleStore: stores.saleStore,
      populationStore: stores.population,
      iodStore: stores.iod,
      tenureStore: emptyTenure,
      asOf: '2026-06-15',
      generatedAt: '2026-10-20T12:00:00.000Z',
    });
    assert.ok(profile.families);
    assert.strictEqual(profile.families.population.status, 'SUFFICIENT');
    assert.strictEqual(profile.families.deprivation.status, 'SUFFICIENT');
    assert.strictEqual(profile.families.housing.tenure.status, 'UNAVAILABLE');
    assert.strictEqual(profile.families.housing.tenure.reason, 'tenure_not_imported');
    assert.deepStrictEqual(profile.families.housing.tenure.observations, []);
    assert.ok(profile.unknowns.some((item) => item.family === AREA_EVIDENCE_FAMILY.HOUSING_TENURE));
    assert.ok(!profile.unknowns.some((item) => item.family === AREA_EVIDENCE_FAMILY.POPULATION));
    assertNoForbidden(profile);
  });

  await test('ERROR deprivation preserves other families', async () => {
    const stores = await buildBaseStores();
    const failedIod = createMemoryIod2025LadStore();
    const run = await failedIod.startRun({ release_label: 'IoD2025_File10_v2' });
    await failedIod.finishRun(run.id, { status: 'FAILED', failure_reason: 'boom' });
    const profile = await getOfficialAreaEvidenceProfile({
      postcode: 'B1 2UJ',
      geographyStore: stores.geography,
      ukhpiStore: stores.ukhpi,
      populationStore: stores.population,
      iodStore: failedIod,
      tenureStore: stores.tenure,
      asOf: '2026-06-15',
      generatedAt: '2026-10-20T12:00:00.000Z',
    });
    assert.strictEqual(profile.families.population.status, 'SUFFICIENT');
    assert.strictEqual(profile.families.housing.tenure.status, 'SUFFICIENT');
    assert.strictEqual(profile.families.deprivation.status, 'UNAVAILABLE');
    assert.strictEqual(profile.families.deprivation.reason, 'iod_error');
    assert.strictEqual(profile.families.deprivation.observation, null);
    assertNoForbidden(profile);
  });

  await test('EMPTY population store coverage does not become zero population', async () => {
    const stores = await buildBaseStores();
    const emptyPop = createMemoryOnsMyeLadPopulationStore();
    const run = await emptyPop.startRun({ release_label: 'MYE_MID_2024' });
    await emptyPop.finishRun(run.id, {
      status: 'SUCCEEDED',
      inserted_count: 0,
      rows_processed: 0,
    });
    const profile = await getOfficialAreaEvidenceProfile({
      postcode: 'B1 2UJ',
      geographyStore: stores.geography,
      ukhpiStore: stores.ukhpi,
      populationStore: emptyPop,
      iodStore: stores.iod,
      tenureStore: stores.tenure,
      asOf: '2026-06-15',
      generatedAt: '2026-10-20T12:00:00.000Z',
    });
    assert.notStrictEqual(profile.families.population.status, 'SUFFICIENT');
    assert.strictEqual(profile.families.population.observation, null);
    assert.ok(profile.families.population.metrics == null
      || profile.families.population.metrics.totalUsualResidentPopulation == null
      || profile.families.population.metrics === undefined);
    assert.notStrictEqual(profile.families.population.metrics?.totalUsualResidentPopulation, 0);
    assertNoForbidden(profile);
  });

  await test('Wales geography keeps tenure/population and marks England-only IoD unavailable without zero', async () => {
    const stores = await buildBaseStores();
    const profile = await getOfficialAreaEvidenceProfile({
      postcode: 'CF10 1AA',
      geographyStore: stores.geography,
      ukhpiStore: stores.ukhpi,
      populationStore: stores.population,
      iodStore: stores.iod,
      tenureStore: stores.tenure,
      asOf: '2026-06-15',
      generatedAt: '2026-10-20T12:00:00.000Z',
    });
    assert.strictEqual(profile.subject.localAuthorityCode, 'W06000015');
    assert.strictEqual(profile.families.housing.tenure.status, 'SUFFICIENT');
    assert.strictEqual(profile.families.population.status, 'SUFFICIENT');
    assert.strictEqual(profile.families.deprivation.status, 'UNAVAILABLE');
    assert.ok(['non_england_geography', 'invalid_lad_code', 'iod_not_imported', 'lad_missing_from_iod']
      .includes(profile.families.deprivation.reason)
      || profile.families.deprivation.reason === 'non_england_geography');
    assert.strictEqual(profile.families.deprivation.observation, null);
    assertNoForbidden(profile);
  });

  await test('thrown market failure is isolated; other families preserved', async () => {
    const stores = await buildBaseStores();
    const throwingUkhpi = {
      async queryObservations() {
        throw new Error('forced market boom\n    at secretStack:1:1');
      },
    };
    const profile = await getOfficialAreaEvidenceProfile({
      postcode: 'B1 2UJ',
      geographyStore: stores.geography,
      ukhpiStore: throwingUkhpi,
      saleStore: stores.saleStore,
      populationStore: stores.population,
      iodStore: stores.iod,
      tenureStore: stores.tenure,
      asOf: '2026-06-15',
      generatedAt: '2026-10-20T12:00:00.000Z',
    });
    assert.ok(profile.families);
    assert.strictEqual(profile.families.market.status, 'UNAVAILABLE');
    assert.strictEqual(profile.families.market.reason, AREA_EVIDENCE_FAMILY_RUNTIME_REASON);
    assert.strictEqual(profile.families.market.failureKind, AREA_EVIDENCE_FAILURE_KIND.RUNTIME_EXCEPTION);
    assert.strictEqual(profile.families.market.hpi, null);
    assert.strictEqual(profile.families.market.transactions, null);
    assert.strictEqual(profile.families.market.provenance, null);
    assert.strictEqual(profile.families.population.status, 'SUFFICIENT');
    assert.strictEqual(profile.families.deprivation.status, 'SUFFICIENT');
    assert.strictEqual(profile.families.housing.tenure.status, 'SUFFICIENT');
    assert.ok(profile.unknowns.some((item) => (
      item.family === AREA_EVIDENCE_FAMILY.MARKET
      && item.reason === AREA_EVIDENCE_FAMILY_RUNTIME_REASON
    )));
    assert.ok(!JSON.stringify(profile).includes('forced market boom'));
    assert.ok(!JSON.stringify(profile).includes('secretStack'));
    assertNoForbidden(profile);
  });

  await test('thrown population failure is isolated; no zero population', async () => {
    const stores = await buildBaseStores();
    const throwingPop = {
      async queryByGeographyCode() {
        throw new Error('forced population boom');
      },
    };
    const profile = await getOfficialAreaEvidenceProfile({
      postcode: 'B1 2UJ',
      geographyStore: stores.geography,
      ukhpiStore: stores.ukhpi,
      saleStore: stores.saleStore,
      populationStore: throwingPop,
      iodStore: stores.iod,
      tenureStore: stores.tenure,
      asOf: '2026-06-15',
      generatedAt: '2026-10-20T12:00:00.000Z',
    });
    assert.strictEqual(profile.families.population.status, 'UNAVAILABLE');
    assert.strictEqual(profile.families.population.reason, AREA_EVIDENCE_FAMILY_RUNTIME_REASON);
    assert.strictEqual(profile.families.population.observation, null);
    assert.strictEqual(profile.families.population.provenance, null);
    assert.strictEqual(profile.families.population.derivedGrowth, false);
    assert.notStrictEqual(profile.families.population.metrics?.totalUsualResidentPopulation, 0);
    assert.strictEqual(profile.families.deprivation.status, 'SUFFICIENT');
    assert.strictEqual(profile.families.housing.tenure.status, 'SUFFICIENT');
    assert.ok(profile.families.market);
    assert.ok(profile.unknowns.some((item) => item.family === AREA_EVIDENCE_FAMILY.POPULATION));
    assert.ok(profile.provenanceRefs.some((item) => item.family === AREA_EVIDENCE_FAMILY.DEPRIVATION));
    assert.ok(!profile.provenanceRefs.some((item) => item.family === AREA_EVIDENCE_FAMILY.POPULATION));
    assertNoForbidden(profile);
  });

  await test('thrown deprivation failure is isolated; no area-quality inference', async () => {
    const stores = await buildBaseStores();
    const throwingIod = {
      async queryByGeographyCode() {
        throw new Error('forced deprivation boom');
      },
    };
    const profile = await getOfficialAreaEvidenceProfile({
      postcode: 'B1 2UJ',
      geographyStore: stores.geography,
      ukhpiStore: stores.ukhpi,
      saleStore: stores.saleStore,
      populationStore: stores.population,
      iodStore: throwingIod,
      tenureStore: stores.tenure,
      asOf: '2026-06-15',
      generatedAt: '2026-10-20T12:00:00.000Z',
    });
    assert.strictEqual(profile.families.deprivation.status, 'UNAVAILABLE');
    assert.strictEqual(profile.families.deprivation.reason, AREA_EVIDENCE_FAMILY_RUNTIME_REASON);
    assert.strictEqual(profile.families.deprivation.observation, null);
    assert.strictEqual(profile.families.deprivation.provenance, null);
    assert.strictEqual(profile.families.population.status, 'SUFFICIENT');
    assert.strictEqual(profile.families.housing.tenure.status, 'SUFFICIENT');
    assert.ok(profile.unknowns.some((item) => item.family === AREA_EVIDENCE_FAMILY.DEPRIVATION));
    assertNoForbidden(profile);
  });

  await test('thrown tenure failure is isolated; no fabricated renters', async () => {
    const stores = await buildBaseStores();
    const throwingTenure = {
      async queryByGeographyCode() {
        throw new Error('forced tenure boom');
      },
    };
    const profile = await getOfficialAreaEvidenceProfile({
      postcode: 'B1 2UJ',
      geographyStore: stores.geography,
      ukhpiStore: stores.ukhpi,
      saleStore: stores.saleStore,
      populationStore: stores.population,
      iodStore: stores.iod,
      tenureStore: throwingTenure,
      asOf: '2026-06-15',
      generatedAt: '2026-10-20T12:00:00.000Z',
    });
    assert.strictEqual(profile.families.housing.tenure.status, 'UNAVAILABLE');
    assert.strictEqual(profile.families.housing.tenure.reason, AREA_EVIDENCE_FAMILY_RUNTIME_REASON);
    assert.deepStrictEqual(profile.families.housing.tenure.observations, []);
    assert.deepStrictEqual(profile.families.housing.tenure.aggregates, []);
    assert.strictEqual(profile.families.housing.tenure.provenance, null);
    assert.strictEqual(profile.families.population.status, 'SUFFICIENT');
    assert.strictEqual(profile.families.deprivation.status, 'SUFFICIENT');
    assert.ok(profile.unknowns.some((item) => item.family === AREA_EVIDENCE_FAMILY.HOUSING_TENURE));
    assertNoForbidden(profile);
  });

  await test('thrown geography lookup returns families null without composing evidence', async () => {
    const stores = await buildBaseStores();
    const throwingGeography = {
      async lookupByPostcode() {
        throw new Error('forced geography boom\n    at internalGeo:9:9');
      },
    };
    const profile = await getOfficialAreaEvidenceProfile({
      postcode: 'B1 2UJ',
      geographyStore: throwingGeography,
      ukhpiStore: stores.ukhpi,
      populationStore: stores.population,
      iodStore: stores.iod,
      tenureStore: stores.tenure,
      generatedAt: '2026-10-20T12:00:00.000Z',
    });
    assert.strictEqual(profile.families, null);
    assert.strictEqual(profile.status, 'UNAVAILABLE');
    assert.ok(['crosswalk_runtime_error', 'geography_runtime_error'].includes(profile.reason));
    assert.ok(!JSON.stringify(profile).includes('forced geography boom'));
    assert.ok(!JSON.stringify(profile).includes('internalGeo'));
    assertNoForbidden(profile);
  });

  await test('deterministic unknowns ordering and no score fields', async () => {
    const stores = await buildBaseStores();
    const emptyTenure = createMemoryCensus2021Ts054TenureStore();
    const failedIod = createMemoryIod2025LadStore();
    const run = await failedIod.startRun({ release_label: 'IoD2025_File10_v2' });
    await failedIod.finishRun(run.id, { status: 'FAILED', failure_reason: 'boom' });
    const a = await getOfficialAreaEvidenceProfile({
      postcode: 'B1 2UJ',
      geographyStore: stores.geography,
      ukhpiStore: stores.ukhpi,
      populationStore: stores.population,
      iodStore: failedIod,
      tenureStore: emptyTenure,
      asOf: '2026-06-15',
      generatedAt: '2026-10-20T12:00:00.000Z',
    });
    const b = await getOfficialAreaEvidenceProfile({
      postcode: 'B1 2UJ',
      geographyStore: stores.geography,
      ukhpiStore: stores.ukhpi,
      populationStore: stores.population,
      iodStore: failedIod,
      tenureStore: emptyTenure,
      asOf: '2026-06-15',
      generatedAt: '2026-10-20T13:00:00.000Z',
    });
    assert.deepStrictEqual(
      a.familyStatus.map((item) => item.family),
      b.familyStatus.map((item) => item.family)
    );
    assert.deepStrictEqual(
      a.unknowns.map((item) => item.family),
      b.unknowns.map((item) => item.family)
    );
    assertNoForbidden(a);
    assertNoForbidden(b);
  });

  if (process.exitCode) process.exit(process.exitCode);
  console.log(`${passed} passed`);
})();
