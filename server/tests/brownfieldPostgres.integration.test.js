/**
 * Phase 3D live PostgreSQL check.
 * Runs only when BROWNFIELD_TEST_DATABASE_URL points at a disposable local database.
 * Never uses propertydb. Exits 0 when the variable is unset so the default suite
 * does not pretend a live database was verified.
 * Run: node tests/brownfieldPostgres.integration.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const testUrl = process.env.BROWNFIELD_TEST_DATABASE_URL || '';

if (!testUrl) {
  console.log('SKIP live PostgreSQL: BROWNFIELD_TEST_DATABASE_URL is unset');
  process.exit(0);
}

let parsed;
try {
  parsed = new URL(testUrl);
} catch {
  console.error('REFUSING brownfield integration test: database URL is not parseable');
  process.exit(1);
}

const databaseName = parsed.pathname.replace(/^\//, '');
const host = parsed.hostname;
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  console.error(`REFUSING brownfield integration test: host ${host} is not local`);
  process.exit(1);
}
if (!databaseName || databaseName.toLowerCase() === 'propertydb') {
  console.error('REFUSING brownfield integration test: database is missing or is propertydb');
  process.exit(1);
}

const { Pool } = require('pg');
const { ingestBrownfieldLand } = require('../services/market/ingestBrownfieldLand');
const { createPostgresBrownfieldLandStore } = require('../services/market/brownfieldLandStore');
const { getOfficialBrownfieldLandEvidence } = require('../services/market/officialAreaBrownfieldEvidence');
const { BROWNFIELD_SELECTION } = require('../services/market/brownfieldLandRevisionSelection');

function site(id, overrides = {}) {
  return {
    entity: id,
    dataset: 'brownfield-land',
    reference: `REF-${id}`,
    name: `Site ${id}`,
    'organisation-entity': 336,
    'site-address': '1 Test Street',
    'entry-date': '2024-06-01',
    'minimum-net-dwellings': '4',
    'maximum-net-dwellings': '4',
    point: 'POINT (-0.120000 51.500000)',
    ...overrides,
  };
}

async function applyMigration(pool, file) {
  const sql = fs.readFileSync(path.join(__dirname, '../db/migrations', file), 'utf8');
  await pool.query(sql);
}

async function uniqueDefs(pool) {
  const result = await pool.query(
    `SELECT c.conname, pg_get_constraintdef(c.oid) AS def
     FROM pg_constraint c
     JOIN pg_class t ON t.oid = c.conrelid
     JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'public'
       AND t.relname = 'brownfield_land_observations'
       AND c.contype = 'u'
     ORDER BY c.conname`
  );
  return result.rows;
}

async function main() {
  const pool = new Pool({ connectionString: testUrl, max: 4 });
  try {
    await applyMigration(pool, '035_brownfield_land_observations.sql');
    const after035 = await uniqueDefs(pool);
    assert.ok(after035.some((row) => (
      row.def.includes('source_entity_id')
      && row.def.includes('release_label')
      && !row.def.includes('content_fingerprint')
    )), '035 leaves the obsolete entity/release unique');

    await applyMigration(pool, '038_brownfield_revision_uniqueness_repair.sql');
    const after038 = await uniqueDefs(pool);
    assert.ok(!after038.some((row) => (
      row.def.includes('source_entity_id')
      && row.def.includes('release_label')
      && !row.def.includes('content_fingerprint')
    )), '038 removes the obsolete unique');
    assert.ok(after038.some((row) => row.conname === 'brownfield_land_observations_revision_identity'));

    await applyMigration(pool, '036_brownfield_land_revisions.sql');
    await applyMigration(pool, '037_brownfield_provider_coverage.sql');
    const repaired = await uniqueDefs(pool);
    assert.strictEqual(
      repaired.filter((row) => row.conname === 'brownfield_land_observations_revision_identity').length,
      1
    );

    const tables = await pool.query(
      `SELECT to_regclass($1) AS observations,
              to_regclass($2) AS runs,
              to_regclass($3) AS revisions,
              to_regclass($4) AS identities,
              to_regclass($5) AS providers,
              to_regclass($6) AS links`,
      [
        'public.brownfield_land_observations',
        'public.brownfield_land_import_runs',
        'public.idx_brownfield_land_entity_revisions',
        'public.brownfield_lpa_identities',
        'public.brownfield_provider_index',
        'public.brownfield_organisation_lpa_links',
      ]
    );
    Object.values(tables.rows[0]).forEach((value) => assert.ok(value));

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'ALTER TABLE brownfield_land_observations DROP CONSTRAINT brownfield_land_observations_revision_identity'
      );
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
    const afterRollback = await uniqueDefs(pool);
    assert.ok(afterRollback.some((row) => row.conname === 'brownfield_land_observations_revision_identity'));

    const store = createPostgresBrownfieldLandStore(pool);
    const first = await ingestBrownfieldLand({ store, entities: [site(9701)] });
    assert.strictEqual(first.status, 'SUCCEEDED');
    assert.strictEqual(first.inserted_count, 1);

    const replay = await ingestBrownfieldLand({ store, entities: [site(9701)] });
    assert.strictEqual(replay.inserted_count, 0);
    assert.strictEqual(replay.unchanged_count, 1);

    const revised = await ingestBrownfieldLand({
      store,
      entities: [site(9701, { 'entry-date': '2025-09-09', 'minimum-net-dwellings': '12' })],
    });
    assert.strictEqual(revised.inserted_count, 1);
    const selected = await getOfficialBrownfieldLandEvidence({
      brownfieldStore: store,
      sourceEntityId: 9701,
    });
    assert.strictEqual(selected.status, 'SUFFICIENT');
    assert.strictEqual(selected.revisionSelection.selectionStatus, BROWNFIELD_SELECTION.RESOLVED);
    assert.strictEqual(selected.observations[0].minimumNetDwellings, 12);
    assert.strictEqual(selected.revisions.length, 2);

    const tied = await ingestBrownfieldLand({
      store,
      entities: [
        site(9705, { 'entry-date': '2024-04-04', 'minimum-net-dwellings': '2' }),
        site(9705, { 'entry-date': '2024-04-04', 'minimum-net-dwellings': '7' }),
      ],
    });
    assert.strictEqual(tied.inserted_count, 2);
    const ambiguous = await getOfficialBrownfieldLandEvidence({
      brownfieldStore: store,
      sourceEntityId: 9705,
    });
    assert.strictEqual(ambiguous.status, 'UNRESOLVED');
    assert.strictEqual(ambiguous.revisionSelection.selectionStatus, BROWNFIELD_SELECTION.AMBIGUOUS);

    const failed = await ingestBrownfieldLand({
      store,
      entities: [site(9702), site(9703), site(9704)],
      failAtIndex: 1,
    });
    assert.strictEqual(failed.status, 'FAILED');
    assert.strictEqual(failed.inserted_count, 0);
    assert.strictEqual(failed.failure_reason, 'injected_database_failure');
    const leftover = await pool.query(
      'SELECT source_entity_id FROM brownfield_land_observations WHERE source_entity_id = ANY($1::bigint[])',
      [[9702, 9703, 9704]]
    );
    assert.strictEqual(leftover.rowCount, 0);

    const survived = await getOfficialBrownfieldLandEvidence({
      brownfieldStore: store,
      sourceEntityId: 9701,
    });
    assert.strictEqual(survived.status, 'SUFFICIENT');
    assert.strictEqual(survived.coverage.state, 'AVAILABLE');
    assert.strictEqual(survived.coverage.latestAttemptStatus, 'FAILED');

    await store.startRun({ release_label: 'BROWNFIELD_LAND' });
    const afterStart = await getOfficialBrownfieldLandEvidence({
      brownfieldStore: store,
      sourceEntityId: 9701,
    });
    assert.strictEqual(afterStart.status, 'SUFFICIENT');
    assert.strictEqual(afterStart.coverage.state, 'AVAILABLE');
    assert.strictEqual(afterStart.coverage.latestAttemptStatus, 'STARTED');

    const runs = await pool.query(
      'SELECT status FROM brownfield_land_import_runs ORDER BY id'
    );
    assert.ok(runs.rows.some((row) => row.status === 'SUCCEEDED'));
    assert.ok(runs.rows.some((row) => row.status === 'FAILED'));
    assert.strictEqual(runs.rows[runs.rows.length - 1].status, 'STARTED');

    console.log(`LIVE PostgreSQL brownfield integration passed on local database ${databaseName}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('FAIL brownfieldPostgres.integration');
  console.error(error);
  process.exit(1);
});
