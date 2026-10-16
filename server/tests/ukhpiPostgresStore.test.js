/**
 * PostgreSQL UKHPI store contract. No live database and no government endpoint.
 * The test double applies the store's SQL parameters and the unique key.
 * Run: node server/tests/ukhpiPostgresStore.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { ingestUkhpiCsv } = require('../services/market/ingestUkhpi');
const {
  createMemoryUkhpiStore,
  createPostgresUkhpiStore,
  numericOrNull,
  INSERT_OBSERVATION_SQL,
} = require('../services/market/ukhpiStore');
const { COVERAGE_STATE } = require('../architecture/officialMarketDataset');

function compact(sql) {
  return String(sql).replace(/\s+/g, ' ').trim();
}

function asPgObservation(row) {
  const copy = { ...row };
  delete copy._key;
  ['index_value', 'average_price', 'annual_change', 'monthly_change'].forEach((key) => {
    copy[key] = copy[key] == null ? null : String(copy[key]);
  });
  return copy;
}

function createUkhpiTestDb() {
  const runs = [];
  const observations = [];
  return {
    observations,
    async query(sql, params = []) {
      const text = compact(sql);
      if (text.startsWith('INSERT INTO ukhpi_import_runs')) {
        const row = {
          id: runs.length + 1,
          source: 'UK_HOUSE_PRICE_INDEX',
          dataset: 'UK House Price Index',
          release_label: params[0],
          status: 'STARTED',
          rows_processed: 0,
          inserted_count: 0,
          unchanged_count: 0,
          rejected_count: 0,
          conflict_count: 0,
          failure_reason: null,
          provenance: JSON.parse(params[1]),
          started_at: '2026-01-01T00:00:00.000Z',
          finished_at: null,
          duration_ms: null,
        };
        runs.push(row);
        return { rows: [{ ...row }], rowCount: 1 };
      }
      if (text.startsWith('UPDATE ukhpi_import_runs')) {
        const row = runs.find((item) => item.id === params[0]);
        if (!row) return { rows: [], rowCount: 0 };
        Object.assign(row, {
          status: params[1],
          rows_processed: params[2],
          inserted_count: params[3],
          unchanged_count: params[4],
          rejected_count: params[5],
          conflict_count: params[6],
          failure_reason: params[7],
          finished_at: '2026-01-01T00:00:01.000Z',
          duration_ms: params[8],
        });
        return { rows: [{ ...row }], rowCount: 1 };
      }
      if (text.includes('COUNT(*)') && text.includes('ukhpi_observations')) {
        return { rows: [{ n: observations.length }], rowCount: 1 };
      }
      if (text.includes('FROM ukhpi_import_runs') && text.includes("status = 'SUCCEEDED'")) {
        const succeeded = runs.filter((item) => item.status === 'SUCCEEDED');
        return { rows: succeeded.map((item) => ({ ...item })), rowCount: succeeded.length };
      }
      if (text.includes('FROM ukhpi_import_runs') && text.includes('ORDER BY id DESC')) {
        const row = runs[runs.length - 1];
        return { rows: row ? [{ ...row }] : [], rowCount: row ? 1 : 0 };
      }
      if (text.startsWith('INSERT INTO ukhpi_observations')) {
        const key = [params[0], params[2], String(params[5]).slice(0, 10), params[10], params[11]].join('|');
        if (observations.some((item) => item._key === key)) {
          return { rows: [], rowCount: 0 };
        }
        const row = {
          _key: key,
          id: observations.length + 1,
          source: params[0],
          dataset: params[1],
          geography_code: params[2],
          geography_name: params[3],
          geography_type: params[4],
          observation_date: String(params[5]).slice(0, 10),
          index_value: params[6],
          average_price: params[7],
          annual_change: params[8],
          monthly_change: params[9],
          property_category: params[10],
          release_label: params[11],
          content_fingerprint: params[12],
          ingested_at: params[13],
          provenance: JSON.parse(params[14]),
        };
        observations.push(row);
        return { rows: [{ id: row.id, content_fingerprint: row.content_fingerprint }], rowCount: 1 };
      }
      if (text.startsWith('SELECT content_fingerprint')) {
        const key = [params[0], params[1], String(params[2]).slice(0, 10), params[3], params[4]].join('|');
        const row = observations.find((item) => item._key === key);
        return { rows: row ? [{ content_fingerprint: row.content_fingerprint }] : [], rowCount: row ? 1 : 0 };
      }
      if (text.includes('FROM ukhpi_observations') && text.includes('ORDER BY observation_date ASC')) {
        const geography = params[1];
        const category = params[2];
        const fromDate = params[3] ? String(params[3]).slice(0, 10) : null;
        const toDate = params[4] ? String(params[4]).slice(0, 10) : null;
        const rows = observations
          .filter((item) => item.source === params[0])
          .filter((item) => item.geography_code === geography)
          .filter((item) => !category || item.property_category === category)
          .filter((item) => !fromDate || item.observation_date >= fromDate)
          .filter((item) => !toDate || item.observation_date <= toDate)
          .sort((a, b) => a.observation_date.localeCompare(b.observation_date)
            || String(a.property_category).localeCompare(String(b.property_category))
            || a.id - b.id);
        return { rows: rows.map(asPgObservation), rowCount: rows.length };
      }
      throw new Error(`unexpected sql: ${text}`);
    },
  };
}

const SERIES = [
  'Date,RegionName,AreaCode,AveragePrice,Index,1m%Change,12m%Change',
  '2024-03-01,United Kingdom,K02000001,300000,102,0.1,2',
  '2024-01-01,United Kingdom,K02000001,280000,100.5,0.2,1.5',
  '2024-02-01,United Kingdom,K02000001,,,,',
  '2024-01-01,London,E12000007,500000,110,0.3,3',
].join('\n');

function test(name, fn) {
  Promise.resolve(fn()).then(
    () => console.log(`✓ ${name}`),
    (error) => {
      console.error(`✗ ${name}`);
      console.error(error);
      process.exit(1);
    }
  );
}

test('postgres SQL does not overwrite observations or turn null into zero', () => {
  assert.strictEqual(numericOrNull(null), null);
  assert.strictEqual(numericOrNull(''), null);
  assert.notStrictEqual(numericOrNull(null), 0);
  const sql = INSERT_OBSERVATION_SQL;
  assert.ok(sql.includes('ON CONFLICT (source, geography_code, observation_date, property_category, release_label)'));
  assert.ok(sql.includes('DO NOTHING'));
  assert.ok(!/DO UPDATE/i.test(sql));
  assert.ok(!/COALESCE\([^)]*,\s*0\)/.test(sql));
  const src = fs.readFileSync(path.join(__dirname, '../services/market/ukhpiStore.js'), 'utf8');
  assert.ok(src.includes('function createMemoryUkhpiStore'));
  assert.ok(src.includes('ORDER BY observation_date ASC, property_category ASC, id ASC'));
  const migration = fs.readFileSync(path.join(__dirname, '../db/migrations/029_ukhpi_observations.sql'), 'utf8');
  assert.ok(migration.includes('UNIQUE (source, geography_code, observation_date, property_category)'));
  const ensure = fs.readFileSync(path.join(__dirname, '../db/ensureIntelligenceSchema.js'), 'utf8');
  assert.ok(ensure.includes('029_ukhpi_observations.sql'));
  assert.ok(ensure.includes('needsUkhpi'));
});

test('a postgres run persists observations, provenance, order, and coverage', async () => {
  const db = createUkhpiTestDb();
  const store = createPostgresUkhpiStore(db);
  const before = await store.datasetCoverage();
  assert.strictEqual(before.state, COVERAGE_STATE.NOT_IMPORTED);
  assert.strictEqual(before.proofOfNoSales, false);

  const first = await ingestUkhpiCsv(SERIES, {
    store,
    releaseLabel: '2024-04',
    ingestedAt: '2026-04-01T00:00:00.000Z',
  });
  assert.strictEqual(first.ok, true);
  assert.strictEqual(first.inserted_count, 4);
  const run = await store.latestRun();
  assert.strictEqual(run.status, 'SUCCEEDED');
  assert.strictEqual(run.release_label, '2024-04');
  assert.strictEqual(run.provenance.licence, 'Open Government Licence v3.0');
  assert.strictEqual(run.provenance.notLegalAdvice, true);
  assert.strictEqual((await store.datasetCoverage()).state, COVERAGE_STATE.AVAILABLE);

  const second = await ingestUkhpiCsv(SERIES, {
    store,
    releaseLabel: '2024-04',
    ingestedAt: '2026-05-01T00:00:00.000Z',
  });
  assert.strictEqual(second.inserted_count, 0);
  assert.strictEqual(second.unchanged_count, 4);
  assert.strictEqual(db.observations.length, 4);

  const united = await store.queryObservations({ geographyCode: 'K02000001' });
  assert.deepStrictEqual(united.observations.map((row) => row.observationDate), [
    '2024-01-01',
    '2024-02-01',
    '2024-03-01',
  ]);
  assert.strictEqual(united.observations[0].averagePrice, 280000);
  assert.strictEqual(united.observations[0].annualChange, 1.5);
  assert.strictEqual(united.observations[1].averagePrice, null);
  assert.strictEqual(united.observations[1].indexValue, null);
  assert.strictEqual(united.observations[1].annualChange, null);
  assert.strictEqual(united.observations[1].monthlyChange, null);
  assert.strictEqual(united.observations[0].provenance.dataset, 'UK House Price Index');
  assert.strictEqual(united.observations[0].provenance.requiredAttribution, run.provenance.requiredAttribution);
  assert.ok(united.observations[0].provenance.limitations.length > 0);
  assert.strictEqual(united.growthCalculated, false);
  assert.strictEqual(united.annualChange, null);

  const january = await store.queryObservations({
    geographyCode: 'K02000001',
    fromDate: '2024-02-01',
    toDate: '2024-03-01',
  });
  assert.deepStrictEqual(january.observations.map((row) => row.observationDate), ['2024-02-01', '2024-03-01']);

  const london = await store.queryObservations({ geographyCode: 'E12000007' });
  assert.strictEqual(london.observations.length, 1);
  assert.strictEqual(london.observations[0].geographyCode, 'E12000007');
  assert.strictEqual(london.observations[0].averagePrice, 500000);
  assert.ok(london.observations.every((row) => row.geographyCode === 'E12000007'));

  const absent = await store.queryObservations({ geographyCode: 'E99999999' });
  assert.strictEqual(absent.matched, false);
  assert.strictEqual(absent.observations.length, 0);
  assert.strictEqual(absent.annualChange, null);
  assert.notStrictEqual(absent.annualChange, 0);
  assert.strictEqual(absent.growthCalculated, false);
  assert.strictEqual(absent.datasetCoverage.state, COVERAGE_STATE.AVAILABLE);
  assert.strictEqual(absent.datasetCoverage.proofOfZeroGrowth, false);
});

test('a conflicting postgres observation stays stored and a failed run is not empty', async () => {
  const db = createUkhpiTestDb();
  const store = createPostgresUkhpiStore(db);
  const header = 'Date,RegionName,AreaCode,AveragePrice,12m%Change';
  await ingestUkhpiCsv(`${header}\n2024-01-01,United Kingdom,K02000001,280000,1.5\n`, {
    store,
    releaseLabel: '2024-04',
    ingestedAt: '2026-04-01T00:00:00.000Z',
  });
  const conflict = await ingestUkhpiCsv(`${header}\n2024-01-01,United Kingdom,K02000001,999999,9.9\n`, {
    store,
    releaseLabel: '2024-04',
    ingestedAt: '2026-05-01T00:00:00.000Z',
  });
  assert.strictEqual(conflict.conflict_count, 1);
  assert.strictEqual(conflict.inserted_count, 0);
  assert.strictEqual(db.observations.length, 1);
  assert.strictEqual(db.observations[0].average_price, 280000);
  assert.strictEqual(db.observations[0].annual_change, 1.5);
  const latest = await store.latestRun();
  assert.strictEqual(latest.conflict_count, 1);
  const kept = await store.queryObservations({
    geographyCode: 'K02000001',
    fromDate: '2024-01-01',
    toDate: '2024-01-01',
  });
  assert.strictEqual(kept.observations.length, 1);
  assert.strictEqual(kept.observations[0].averagePrice, 280000);
  assert.strictEqual(kept.annualChange, 1.5);

  const failing = createUkhpiTestDb();
  const original = failing.query.bind(failing);
  failing.query = async (sql, params) => {
    if (compact(sql).startsWith('INSERT INTO ukhpi_observations')) {
      throw new Error('disk full');
    }
    return original(sql, params);
  };
  const failedStore = createPostgresUkhpiStore(failing);
  const failed = await ingestUkhpiCsv(`${header}\n2024-01-01,United Kingdom,K02000001,280000,1.5\n`, {
    store: failedStore,
    releaseLabel: '2024-04',
  });
  assert.strictEqual(failed.ok, false);
  assert.strictEqual((await failedStore.latestRun()).status, 'FAILED');
  const errorCoverage = await failedStore.datasetCoverage();
  assert.strictEqual(errorCoverage.state, COVERAGE_STATE.ERROR);
  assert.notStrictEqual(errorCoverage.state, COVERAGE_STATE.EMPTY);
  assert.strictEqual(errorCoverage.proofOfZeroGrowth, false);

  const emptyDb = createUkhpiTestDb();
  const emptyStore = createPostgresUkhpiStore(emptyDb);
  const empty = await ingestUkhpiCsv(`${header}\n,United Kingdom,K02000001,280000\n`, {
    store: emptyStore,
    releaseLabel: '2024-04',
  });
  assert.strictEqual(empty.ok, true);
  assert.strictEqual(empty.inserted_count, 0);
  const emptyCoverage = await emptyStore.datasetCoverage();
  assert.strictEqual(emptyCoverage.state, COVERAGE_STATE.EMPTY);
  assert.notStrictEqual(emptyCoverage.state, COVERAGE_STATE.NOT_IMPORTED);
  assert.notStrictEqual(emptyCoverage.state, COVERAGE_STATE.ERROR);
  assert.strictEqual(emptyCoverage.proofOfNoSales, false);
});

test('property category filter does not mix series and the memory store still deduplicates', async () => {
  const db = createUkhpiTestDb();
  const store = createPostgresUkhpiStore(db);
  const csv = [
    'Date,RegionName,AreaCode,AveragePrice,12m%Change,PropertyCategory',
    '2024-01-01,United Kingdom,K02000001,280000,1.5,all',
    '2024-01-01,United Kingdom,K02000001,400000,2,detached',
  ].join('\n');
  await ingestUkhpiCsv(csv, { store, releaseLabel: '2024-04', ingestedAt: '2026-04-01T00:00:00.000Z' });
  const detached = await store.queryObservations({
    geographyCode: 'K02000001',
    propertyCategory: 'detached',
  });
  assert.strictEqual(detached.observations.length, 1);
  assert.strictEqual(detached.observations[0].propertyCategory, 'detached');
  assert.strictEqual(detached.observations[0].averagePrice, 400000);

  const memory = createMemoryUkhpiStore();
  const once = await ingestUkhpiCsv(csv, { store: memory, releaseLabel: '2024-04' });
  const twice = await ingestUkhpiCsv(csv, { store: memory, releaseLabel: '2024-04' });
  assert.strictEqual(once.inserted_count, 2);
  assert.strictEqual(twice.inserted_count, 0);
  assert.strictEqual(twice.unchanged_count, 2);
  assert.strictEqual(memory.snapshot().length, 2);
});
