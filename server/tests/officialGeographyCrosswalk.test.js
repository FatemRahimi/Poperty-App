/**
 * Canonical postcode geography. Fixtures only. No network and no map geocoder.
 * Run: node tests/officialGeographyCrosswalk.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { canonicalPostcode } = require('../services/market/canonicalPostcode');
const { createMemoryGeographyStore } = require('../services/market/geographyCrosswalkStore');
const { ingestGeographyCsv } = require('../services/market/ingestGeographyCrosswalk');
const { createMemoryUkhpiStore } = require('../services/market/ukhpiStore');
const { ingestUkhpiCsv } = require('../services/market/ingestUkhpi');
const { linkPostcodeToUkhpi } = require('../services/market/officialGeographyUkhpiLink');
const { COVERAGE_STATE, MARKET_RECORD_KIND } = require('../architecture/officialMarketDataset');

const HEADER = 'postcode,countrycode,countryname,localauthoritycode,localauthorityname,ukhpigeographycode,ukhpigeographyname';

function test(name, fn) {
  const result = fn();
  if (result && typeof result.then === 'function') {
    throw new Error(`Use asyncTest for ${name}`);
  }
  console.log(`✓ ${name}`);
}

const pending = [];
function asyncTest(name, fn) {
  pending.push({ name, fn });
}

test('postcode spelling variants share one canonical identity', () => {
  const expected = 'B1 2UJ';
  ['b1 2uj', 'B1 2UJ', '  b1   2uj  ', 'b12uj'].forEach((value) => {
    const parsed = canonicalPostcode(value);
    assert.strictEqual(parsed.ok, true, value);
    assert.strictEqual(parsed.normalized, expected);
  });
  assert.strictEqual(canonicalPostcode('sw1a1aa').normalized, 'SW1A 1AA');
});

test('an invalid postcode does not become another postcode', () => {
  ['Birmingham', 'B1', 'NOT A CODE', '12', ''].forEach((value) => {
    const parsed = canonicalPostcode(value);
    assert.strictEqual(parsed.ok, false, value);
    assert.strictEqual(parsed.normalized, null);
  });
});

asyncTest('a crosswalk lookup uses codes, provenance, and coverage', async () => {
  const store = createMemoryGeographyStore();
  const before = await store.lookupByPostcode('b1 2uj');
  assert.strictEqual(before.matchStatus, 'NOT_IMPORTED');
  assert.strictEqual(before.datasetCoverage.state, COVERAGE_STATE.NOT_IMPORTED);
  assert.notStrictEqual(before.matchStatus, 'NO_MATCH');
  assert.strictEqual(before.coordinates, null);

  const csv = [
    HEADER,
    'B1 2UJ,E92000001,England,E08000025,Birmingham,E08000025,Birmingham',
    'SW1A 1AA,E92000001,England,E09000033,Westminster,,',
  ].join('\n');
  const imported = await ingestGeographyCsv(csv, {
    store,
    releaseLabel: '2024-02',
    ingestedAt: '2026-02-01T00:00:00.000Z',
    geographicCoverage: 'rows present in this fixture only',
  });
  assert.strictEqual(imported.inserted_count, 2);
  const again = await ingestGeographyCsv(csv, { store, releaseLabel: '2024-02' });
  assert.strictEqual(again.inserted_count, 0);
  assert.strictEqual(again.unchanged_count, 2);
  assert.strictEqual(store.snapshot().length, 2);

  const matched = await store.lookupByPostcode('b12uj');
  assert.strictEqual(matched.matchStatus, 'MATCHED');
  assert.strictEqual(matched.geography.localAuthorityCode, 'E08000025');
  assert.strictEqual(matched.geography.ukhpiGeographyCode, 'E08000025');
  assert.strictEqual(matched.geography.countryCode, 'E92000001');
  assert.strictEqual(matched.provenance.dataset, 'ONS Postcode Directory');
  assert.strictEqual(matched.provenance.licence, null);
  assert.strictEqual(matched.provenance.notLegalAdvice, true);
  assert.strictEqual(matched.coordinates, null);
  assert.ok(matched.limitations.some((line) => /not a property boundary/i.test(line)));

  const missingCode = await store.lookupByPostcode('SW1A 1AA');
  assert.strictEqual(missingCode.matched, true);
  assert.strictEqual(missingCode.geography.ukhpiGeographyCode, null);
  assert.strictEqual(missingCode.geography.localAuthorityCode, 'E09000033');

  const absent = await store.lookupByPostcode('M1 1AE');
  assert.strictEqual(absent.matchStatus, 'NO_MATCH');
  assert.strictEqual(absent.datasetCoverage.state, COVERAGE_STATE.AVAILABLE);
  assert.notStrictEqual(absent.matchStatus, 'NOT_IMPORTED');

  const named = await store.lookupByPostcode('Birmingham');
  assert.strictEqual(named.matchStatus, 'INVALID');
  assert.strictEqual(named.geography, null);
});

asyncTest('a later geography release stays auditable and an older reimport does not win', async () => {
  const store = createMemoryGeographyStore();
  const header = HEADER;
  await ingestGeographyCsv(
    `${header}\nB1 2UJ,E92000001,England,E08000025,Birmingham,E08000025,Birmingham\n`,
    { store, releaseLabel: '2024-02' }
  );
  const sameRelease = await ingestGeographyCsv(
    `${header}\nB1 2UJ,E92000001,England,E08000026,Other,E08000026,Other\n`,
    { store, releaseLabel: '2024-02' }
  );
  assert.strictEqual(sameRelease.conflict_count, 1);
  assert.strictEqual((await store.lookupByPostcode('B1 2UJ')).geography.localAuthorityCode, 'E08000025');

  await ingestGeographyCsv(
    `${header}\nB1 2UJ,E92000001,England,E08000025,Birmingham,E12000005,West Midlands\n`,
    { store, releaseLabel: '2024-05' }
  );
  await ingestGeographyCsv(
    `${header}\nB1 2UJ,E92000001,England,E08000025,Birmingham,E08000025,Birmingham\n`,
    { store, releaseLabel: '2024-01' }
  );
  const effective = await store.lookupByPostcode('B1 2UJ');
  assert.strictEqual(effective.geography.ukhpiGeographyCode, 'E12000005');
  assert.strictEqual(effective.geography.releaseLabel, '2024-05');
  const history = await store.historyByPostcode('B1 2UJ');
  assert.strictEqual(history.length, 3);
  assert.ok(history.some((row) => row.releaseLabel === '2024-02' && row.ukhpiGeographyCode === 'E08000025'));
});

asyncTest('postcode resolution reaches UKHPI observations and does not calculate growth', async () => {
  const geography = createMemoryGeographyStore();
  const ukhpi = createMemoryUkhpiStore();
  await ingestGeographyCsv(
    `${HEADER}\nB1 2UJ,E92000001,England,E08000025,Birmingham,E08000025,Birmingham\n`,
    { geographyStore: geography, store: geography, releaseLabel: '2024-02' }
  );
  await ingestUkhpiCsv(
    'Date,RegionName,AreaCode,AveragePrice,12m%Change\n2024-01-01,Birmingham,E08000025,200000,\n',
    { store: ukhpi, releaseLabel: '2024-03' }
  );
  const linked = await linkPostcodeToUkhpi('b1 2uj', geography, ukhpi);
  assert.strictEqual(linked.geographyCode, 'E08000025');
  assert.strictEqual(linked.observations.length, 1);
  assert.strictEqual(linked.observations[0].averagePrice, 200000);
  assert.strictEqual(linked.observations[0].annualChange, null);
  assert.strictEqual(linked.growthCalculated, false);
  assert.strictEqual(linked.derivedMetric, null);
  assert.strictEqual(linked.recordKind, MARKET_RECORD_KIND.OFFICIAL_OBSERVATION);
  assert.strictEqual(linked.oneYearGrowth, undefined);
});

test('geography source does not use the map fallback or name matching', () => {
  const dir = path.join(__dirname, '../services/market');
  ['canonicalPostcode.js', 'geographyCrosswalkStore.js', 'geographyCrosswalkParser.js', 'officialGeographyUkhpiLink.js']
    .forEach((file) => {
      const src = fs.readFileSync(path.join(dir, file), 'utf8');
      assert.ok(!/nominatim/i.test(src), file);
      assert.ok(!/51\.505/.test(src), file);
      assert.ok(!/-0\.09/.test(src), file);
    });
  const migration = fs.readFileSync(path.join(__dirname, '../db/migrations/030_official_geography_crosswalk.sql'), 'utf8');
  assert.ok(!/latitude/i.test(migration));
  assert.ok(migration.includes('UNIQUE (source, normalized_postcode, release_label)'));
  const ensure = fs.readFileSync(path.join(__dirname, '../db/ensureIntelligenceSchema.js'), 'utf8');
  assert.ok(ensure.includes('030_official_geography_crosswalk.sql'));
});

(async () => {
  for (const item of pending) {
    try {
      await item.fn();
      console.log(`✓ ${item.name}`);
    } catch (error) {
      console.error(`✗ ${item.name}`);
      console.error(error);
      process.exit(1);
    }
  }
})();
