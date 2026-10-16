/**
 * UKHPI release history. Fixtures only.
 * Run: node tests/ukhpiRevision.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { createMemoryUkhpiStore } = require('../services/market/ukhpiStore');
const { ingestUkhpiCsv } = require('../services/market/ingestUkhpi');
const { MARKET_RECORD_KIND } = require('../architecture/officialMarketDataset');

const HEADER = 'Date,RegionName,AreaCode,AveragePrice,Index,12m%Change';

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

asyncTest('releases stay distinct and the newest dated release is effective', async () => {
  const store = createMemoryUkhpiStore();
  const first = await ingestUkhpiCsv(
    `${HEADER}\n2024-01-01,Birmingham,E08000025,200000,100,\n`,
    { store, releaseLabel: '2024-03', ingestedAt: '2026-03-01T00:00:00.000Z' }
  );
  assert.strictEqual(first.inserted_count, 1);
  assert.strictEqual(store.snapshot()[0].recordKind, MARKET_RECORD_KIND.OFFICIAL_OBSERVATION);
  assert.strictEqual(store.snapshot()[0].annualChange, null);

  const duplicate = await ingestUkhpiCsv(
    `${HEADER}\n2024-01-01,Birmingham,E08000025,200000,100,\n`,
    { store, releaseLabel: '2024-03' }
  );
  assert.strictEqual(duplicate.inserted_count, 0);
  assert.strictEqual(duplicate.unchanged_count, 1);
  assert.strictEqual(duplicate.conflict_count, 0);

  const sameReleaseChange = await ingestUkhpiCsv(
    `${HEADER}\n2024-01-01,Birmingham,E08000025,111,100,1\n`,
    { store, releaseLabel: '2024-03' }
  );
  assert.strictEqual(sameReleaseChange.conflict_count, 1);
  assert.strictEqual(store.snapshot().length, 1);
  assert.strictEqual(store.snapshot()[0].averagePrice, 200000);

  const unchangedLater = await ingestUkhpiCsv(
    `${HEADER}\n2024-01-01,Birmingham,E08000025,200000,100,\n`,
    { store, releaseLabel: '2024-04' }
  );
  assert.strictEqual(unchangedLater.conflict_count, 0);
  assert.strictEqual(unchangedLater.inserted_count, 1);

  const revised = await ingestUkhpiCsv(
    `${HEADER}\n2024-01-01,Birmingham,E08000025,250000,110,2.5\n`,
    { store, releaseLabel: '2024-06' }
  );
  assert.strictEqual(revised.inserted_count, 1);
  assert.strictEqual(revised.conflict_count, 0);

  await ingestUkhpiCsv(
    `${HEADER}\n2024-01-01,Birmingham,E08000025,1,1,1\n`,
    { store, releaseLabel: '2024-01' }
  );

  const effective = await store.queryObservations({
    geographyCode: 'E08000025',
    fromDate: '2024-01-01',
    toDate: '2024-01-01',
  });
  assert.strictEqual(effective.observations.length, 1);
  assert.strictEqual(effective.observations[0].averagePrice, 250000);
  assert.strictEqual(effective.observations[0].annualChange, 2.5);
  assert.strictEqual(effective.observations[0].releaseLabel, '2024-06');
  assert.strictEqual(effective.observations[0].provenance.datasetVersion, '2024-06');
  assert.strictEqual(effective.growthCalculated, false);
  assert.strictEqual(effective.observations[0].recordKind, MARKET_RECORD_KIND.OFFICIAL_OBSERVATION);

  const history = await store.queryObservations({
    geographyCode: 'E08000025',
    selection: 'history',
  });
  assert.ok(history.observations.length >= 4);
  assert.ok(history.observations.some((row) => row.releaseLabel === '2024-03' && row.averagePrice === 200000));
  assert.ok(history.observations.some((row) => row.releaseLabel === '2024-01' && row.averagePrice === 1));

  const original = await store.queryObservations({
    geographyCode: 'E08000025',
    selection: '2024-03',
  });
  assert.strictEqual(original.observations.length, 1);
  assert.strictEqual(original.observations[0].averagePrice, 200000);
});

test('the observation table rejects derived metrics in the schema contract', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../db/migrations/031_ukhpi_observation_releases.sql'), 'utf8');
  assert.ok(sql.includes('ukhpi_observations_release_identity'));
  assert.ok(sql.includes('CHECK (record_kind = \'OFFICIAL_OBSERVATION\')'));
  assert.ok(!/DELETE FROM ukhpi_observations/i.test(sql));
  assert.ok(!/DROP TABLE/i.test(sql));
  const store = fs.readFileSync(path.join(__dirname, '../services/market/ukhpiStore.js'), 'utf8');
  assert.ok(!/oneYear|threeYear|fiveYear|cagr/i.test(store));
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
