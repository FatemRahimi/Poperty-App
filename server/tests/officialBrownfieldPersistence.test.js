/**
 * Phase 3D — Brownfield persistence semantics.
 * Memory rollback plus a transactional PostgreSQL double.
 * No live database and no national import.
 * Run: node tests/officialBrownfieldPersistence.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { ingestBrownfieldLand } = require('../services/market/ingestBrownfieldLand');
const {
  classifyObservationInsert,
  createMemoryBrownfieldLandStore,
  createPostgresBrownfieldLandStore,
} = require('../services/market/brownfieldLandStore');
const { getOfficialBrownfieldLandEvidence } = require('../services/market/officialAreaBrownfieldEvidence');
const { BROWNFIELD_SELECTION } = require('../services/market/brownfieldLandRevisionSelection');
const profileContract = require('../architecture/officialAreaEvidenceProfileContract');

const FIXTURE = JSON.parse(fs.readFileSync(
  path.join(__dirname, 'fixtures/planningdata-brownfield-land-min.json'),
  'utf8'
));

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

function compact(sql) {
  return String(sql).replace(/\s+/g, ' ').trim();
}

function createTransactionalFakePg() {
  const committed = { runs: [], observations: [] };
  const journal = [];
  let tx = null;
  let nextRunId = 1;
  let nextObservationId = 1;

  function cloneState(source) {
    return {
      runs: source.runs.map((row) => ({ ...row })),
      observations: source.observations.map((row) => ({ ...row })),
    };
  }

  function observationFromParams(params) {
    return {
      id: nextObservationId,
      source: params[0],
      dataset: params[1],
      dataset_label: params[2],
      source_product: params[3],
      record_kind: 'OFFICIAL_OBSERVATION',
      geography_type: params[4],
      geographic_scope: params[5],
      source_entity_id: params[6],
      organisation_entity: params[7],
      reference: params[8],
      name: params[9],
      site_address: params[10],
      ownership_status: params[11],
      planning_permission_status: params[12],
      planning_permission_type: params[13],
      planning_permission_date: params[14],
      minimum_net_dwellings: params[15],
      maximum_net_dwellings: params[16],
      dwelling_nature: params[17],
      deliverable: params[18],
      hectares: params[19],
      point_wkt: params[20],
      latitude: params[21],
      longitude: params[22],
      geometry_wkt: params[23],
      coordinate_reference_system: params[24],
      entry_date: params[25],
      start_date: params[26],
      end_date: params[27],
      notes: params[28],
      site_plan_url: params[29],
      release_label: params[30],
      content_fingerprint: params[31],
      retrieved_at: params[32],
      ingested_at: null,
      provenance: JSON.parse(params[33]),
      limitations: JSON.parse(params[34]),
    };
  }

  function identity(row) {
    return [row.source, row.source_entity_id, row.release_label, row.content_fingerprint].join('|');
  }

  async function dispatch(sql, params = [], inTx) {
    const text = compact(sql);
    if (text === 'BEGIN') {
      tx = cloneState(committed);
      journal.push('BEGIN');
      return { rows: [], rowCount: 0 };
    }
    if (text === 'COMMIT') {
      committed.runs = tx.runs;
      committed.observations = tx.observations;
      tx = null;
      journal.push('COMMIT');
      return { rows: [], rowCount: 0 };
    }
    if (text === 'ROLLBACK') {
      tx = null;
      journal.push('ROLLBACK');
      return { rows: [], rowCount: 0 };
    }
    const state = inTx ? tx : committed;
    if (!state) throw new Error(`fake_pg_statement_outside_transaction:${text.slice(0, 80)}`);

    if (text.includes('INSERT INTO brownfield_land_import_runs')) {
      const failed = text.includes("'FAILED'");
      const row = {
        id: nextRunId,
        source: params[0],
        dataset: params[1],
        source_product: params[2],
        release_label: params[3],
        status: failed ? 'FAILED' : 'STARTED',
        provenance: JSON.parse(params[4]),
        geographic_coverage: params[5],
        retrieved_at: params[6],
        failure_reason: failed ? params[7] : null,
        rows_processed: 0,
        inserted_count: 0,
        unchanged_count: 0,
        rejected_count: failed ? Number(params[8] || 0) : 0,
        conflict_count: 0,
        started_at: '2026-10-22T00:00:00.000Z',
        finished_at: failed ? '2026-10-22T00:00:01.000Z' : null,
        duration_ms: failed ? params[9] : null,
      };
      nextRunId += 1;
      state.runs.push(row);
      return { rows: [failed ? { id: row.id } : { ...row }], rowCount: 1 };
    }

    if (text.startsWith('UPDATE brownfield_land_import_runs')) {
      const run = state.runs.find((item) => item.id === params[0]);
      if (!run) return { rows: [], rowCount: 0 };
      if (text.includes("status = 'SUCCEEDED'")) {
        Object.assign(run, {
          status: 'SUCCEEDED',
          rows_processed: params[1],
          inserted_count: params[2],
          unchanged_count: params[3],
          rejected_count: params[4],
          conflict_count: 0,
          failure_reason: null,
          finished_at: '2026-10-22T00:00:02.000Z',
          duration_ms: params[5],
        });
      } else {
        Object.assign(run, {
          status: params[1],
          rows_processed: params[2] == null ? run.rows_processed : params[2],
          inserted_count: params[3] == null ? run.inserted_count : params[3],
          unchanged_count: params[4] == null ? run.unchanged_count : params[4],
          rejected_count: params[5] == null ? run.rejected_count : params[5],
          conflict_count: params[6] == null ? run.conflict_count : params[6],
          failure_reason: params[7],
          finished_at: '2026-10-22T00:00:02.000Z',
          duration_ms: params[8],
        });
      }
      return { rows: [{ ...run }], rowCount: 1 };
    }

    if (text.includes('COUNT(*)') && text.includes('brownfield_land_observations')) {
      return { rows: [{ n: state.observations.length }], rowCount: 1 };
    }

    if (text.includes('FROM brownfield_land_import_runs')) {
      let rows = state.runs.slice();
      if (text.includes("status = 'SUCCEEDED'")) {
        rows = rows.filter((item) => item.status === 'SUCCEEDED');
      }
      rows.sort((left, right) => right.id - left.id);
      return { rows: rows.slice(0, 1), rowCount: rows.length ? 1 : 0 };
    }

    if (text.includes('INSERT INTO brownfield_land_observations')) {
      const row = observationFromParams(params);
      const key = identity(row);
      if (state.observations.some((item) => identity(item) === key)) {
        return { rows: [], rowCount: 0 };
      }
      nextObservationId += 1;
      state.observations.push(row);
      return { rows: [{ id: row.id }], rowCount: 1 };
    }

    if (text.includes('FROM brownfield_land_observations')) {
      let rows = state.observations.slice();
      if (text.includes('source_entity_id = $1')) {
        rows = rows.filter((item) => (
          Number(item.source_entity_id) === Number(params[0]) && item.release_label === params[1]
        ));
      } else if (text.includes('organisation_entity = $1')) {
        rows = rows.filter((item) => (
          Number(item.organisation_entity) === Number(params[0]) && item.release_label === params[1]
        ));
      } else if (text.includes('release_label = $1')) {
        rows = rows.filter((item) => item.release_label === params[0]);
      }
      return { rows, rowCount: rows.length };
    }

    throw new Error(`unhandled_fake_sql:${text.slice(0, 160)}`);
  }

  return {
    journal,
    committed,
    async connect() {
      return {
        query(sql, params) { return dispatch(sql, params, true); },
        release() { journal.push('RELEASE'); },
      };
    },
    query(sql, params) { return dispatch(sql, params, false); },
  };
}

(async () => {
  await test('insert classification treats a lost conflict as unchanged', async () => {
    assert.strictEqual(classifyObservationInsert(1), 'inserted');
    assert.strictEqual(classifyObservationInsert(0), 'duplicate');
    assert.strictEqual(classifyObservationInsert(undefined), 'duplicate');
  });

  await test('memory import rolls back a mid-batch database failure', async () => {
    const store = createMemoryBrownfieldLandStore();
    const first = await ingestBrownfieldLand({ store, entities: FIXTURE });
    assert.strictEqual(first.status, 'SUCCEEDED');
    const before = store.snapshot().map((row) => row.contentFingerprint);

    const failed = await ingestBrownfieldLand({
      store,
      entities: [site(9101), site(9102), site(9103)],
      failAtIndex: 1,
    });
    assert.strictEqual(failed.status, 'FAILED');
    assert.strictEqual(failed.failure_reason, 'injected_database_failure');
    assert.strictEqual(failed.inserted_count, 0);
    assert.strictEqual(failed.unchanged_count, 0);
    assert.strictEqual(failed.rows_processed, 0);
    assert.deepStrictEqual(failed.rejected, []);
    assert.deepStrictEqual(store.snapshot().map((row) => row.contentFingerprint), before);

    const evidence = await getOfficialBrownfieldLandEvidence({
      brownfieldStore: store,
      sourceEntityId: 1700000,
    });
    assert.strictEqual(evidence.status, 'SUFFICIENT');
    assert.strictEqual(evidence.reason, null);
    assert.notStrictEqual(evidence.coverage.state, 'ERROR');
    assert.notStrictEqual(evidence.coverage.state, 'NOT_IMPORTED');
    assert.strictEqual(evidence.coverage.latestAttemptStatus, 'FAILED');
    assert.strictEqual(evidence.coverage.failureReason, 'injected_database_failure');

    const absent = await getOfficialBrownfieldLandEvidence({
      brownfieldStore: store,
      sourceEntityId: 9101,
    });
    assert.strictEqual(absent.status, 'UNAVAILABLE');
    assert.strictEqual(absent.reason, 'brownfield_no_match');
  });

  await test('a later failed run and an abandoned start keep prior evidence', async () => {
    const store = createMemoryBrownfieldLandStore();
    await ingestBrownfieldLand({ store, entities: [site(9201)] });
    const rejected = await ingestBrownfieldLand({
      store,
      entities: [{ dataset: 'brownfield-land' }],
    });
    assert.strictEqual(rejected.status, 'FAILED');
    assert.ok(rejected.rejected.length > 0);
    const afterReject = await getOfficialBrownfieldLandEvidence({
      brownfieldStore: store,
      sourceEntityId: 9201,
    });
    assert.strictEqual(afterReject.status, 'SUFFICIENT');
    assert.strictEqual(afterReject.coverage.state, 'AVAILABLE');

    await store.startRun({ release_label: 'BROWNFIELD_LAND' });
    const afterStart = await getOfficialBrownfieldLandEvidence({
      brownfieldStore: store,
      sourceEntityId: 9201,
    });
    assert.strictEqual(afterStart.status, 'SUFFICIENT');
    assert.strictEqual(afterStart.coverage.state, 'AVAILABLE');
    assert.strictEqual(afterStart.coverage.latestAttemptStatus, 'STARTED');
    assert.ok(afterStart.coverage.latestSuccessfulRunId);
    assert.notStrictEqual(afterStart.coverage.latestSuccessfulRunId, afterStart.coverage.latestAttemptId);
  });

  await test('a failed first attempt is an error, not source absence', async () => {
    const store = createMemoryBrownfieldLandStore();
    const failed = await ingestBrownfieldLand({
      store,
      entities: [site(9301), site(9302)],
      failAtIndex: 1,
    });
    assert.strictEqual(failed.status, 'FAILED');
    assert.strictEqual(store.snapshot().length, 0);
    const evidence = await getOfficialBrownfieldLandEvidence({ brownfieldStore: store });
    assert.strictEqual(evidence.status, 'UNAVAILABLE');
    assert.strictEqual(evidence.reason, 'brownfield_error');
    assert.notStrictEqual(evidence.reason, 'brownfield_not_imported');
  });

  await test('replay is deterministic and a changed fingerprint stays a revision', async () => {
    const store = createMemoryBrownfieldLandStore();
    const first = await ingestBrownfieldLand({ store, entities: [site(9401, { 'entry-date': '2024-01-01' })] });
    const again = await ingestBrownfieldLand({ store, entities: [site(9401, { 'entry-date': '2024-01-01' })] });
    assert.strictEqual(again.inserted_count, 0);
    assert.strictEqual(again.unchanged_count, first.inserted_count);
    assert.strictEqual(again.conflict_count, 0);
    assert.strictEqual(store.snapshot().length, 1);

    const revised = await ingestBrownfieldLand({
      store,
      entities: [site(9401, { 'entry-date': '2025-02-02', 'minimum-net-dwellings': '9' })],
    });
    assert.strictEqual(revised.inserted_count, 1);
    assert.strictEqual(store.snapshot().length, 2);
    const evidence = await getOfficialBrownfieldLandEvidence({
      brownfieldStore: store,
      sourceEntityId: 9401,
    });
    assert.strictEqual(evidence.status, 'SUFFICIENT');
    assert.strictEqual(evidence.revisionSelection.selectionStatus, BROWNFIELD_SELECTION.RESOLVED);
    assert.strictEqual(evidence.observations[0].entryDate, '2025-02-02');
    assert.strictEqual(evidence.observations[0].minimumNetDwellings, 9);
    assert.strictEqual(evidence.revisions.length, 2);
  });

  await test('tied entry dates stay ambiguous and import order does not choose', async () => {
    const newerFirst = [site(9501, { 'entry-date': '2025-03-01', 'minimum-net-dwellings': '8' })];
    const olderLater = [site(9501, { 'entry-date': '2024-03-01', 'minimum-net-dwellings': '3' })];
    const forward = createMemoryBrownfieldLandStore();
    await ingestBrownfieldLand({ store: forward, entities: olderLater });
    await ingestBrownfieldLand({ store: forward, entities: newerFirst });
    const reverse = createMemoryBrownfieldLandStore();
    await ingestBrownfieldLand({ store: reverse, entities: newerFirst });
    await ingestBrownfieldLand({ store: reverse, entities: olderLater });
    const forwardEvidence = await getOfficialBrownfieldLandEvidence({
      brownfieldStore: forward,
      sourceEntityId: 9501,
    });
    const reverseEvidence = await getOfficialBrownfieldLandEvidence({
      brownfieldStore: reverse,
      sourceEntityId: 9501,
    });
    assert.strictEqual(forwardEvidence.observations[0].entryDate, '2025-03-01');
    assert.strictEqual(reverseEvidence.observations[0].entryDate, '2025-03-01');

    const tied = createMemoryBrownfieldLandStore();
    await ingestBrownfieldLand({
      store: tied,
      entities: [site(9502, { 'entry-date': '2024-04-04', 'minimum-net-dwellings': '2' })],
    });
    await ingestBrownfieldLand({
      store: tied,
      entities: [site(9502, { 'entry-date': '2024-04-04', 'minimum-net-dwellings': '6' })],
    });
    const ambiguous = await getOfficialBrownfieldLandEvidence({
      brownfieldStore: tied,
      sourceEntityId: 9502,
    });
    assert.strictEqual(ambiguous.status, 'UNRESOLVED');
    assert.strictEqual(ambiguous.reason, 'brownfield_revision_ambiguous');
    assert.strictEqual(ambiguous.revisionSelection.selectionStatus, BROWNFIELD_SELECTION.AMBIGUOUS);
    assert.deepStrictEqual(ambiguous.observations, []);
  });

  await test('postgres double commits only a finished batch and reports conflicts as unchanged', async () => {
    const db = createTransactionalFakePg();
    const store = createPostgresBrownfieldLandStore(db);
    const first = await ingestBrownfieldLand({ store, entities: [site(9601)] });
    assert.strictEqual(first.status, 'SUCCEEDED');
    assert.strictEqual(first.inserted_count, 1);
    assert.deepStrictEqual(db.journal.filter((item) => item !== 'RELEASE'), ['BEGIN', 'COMMIT']);
    assert.strictEqual(db.committed.observations.length, 1);

    const replay = await ingestBrownfieldLand({ store, entities: [site(9601)] });
    assert.strictEqual(replay.inserted_count, 0);
    assert.strictEqual(replay.unchanged_count, 1);
    assert.strictEqual(db.committed.observations.length, 1);

    const raced = await store.upsert({
      ...db.committed.observations[0],
      sourceEntityId: db.committed.observations[0].source_entity_id,
      releaseLabel: db.committed.observations[0].release_label,
      contentFingerprint: db.committed.observations[0].content_fingerprint,
      datasetLabel: db.committed.observations[0].dataset_label,
      sourceProduct: db.committed.observations[0].source_product,
      geographyType: db.committed.observations[0].geography_type,
      geographicScope: db.committed.observations[0].geographic_scope,
      organisationEntity: db.committed.observations[0].organisation_entity,
      siteAddress: db.committed.observations[0].site_address,
      entryDate: db.committed.observations[0].entry_date,
    });
    assert.strictEqual(raced, 'duplicate');

    const revised = await ingestBrownfieldLand({
      store,
      entities: [site(9601, { 'entry-date': '2025-08-08', 'minimum-net-dwellings': '11' })],
    });
    assert.strictEqual(revised.inserted_count, 1);
    assert.strictEqual(db.committed.observations.length, 2);
    const selected = await getOfficialBrownfieldLandEvidence({
      brownfieldStore: store,
      sourceEntityId: 9601,
    });
    assert.strictEqual(selected.status, 'SUFFICIENT');
    assert.strictEqual(selected.revisionSelection.selectionStatus, BROWNFIELD_SELECTION.RESOLVED);
    assert.strictEqual(selected.observations[0].minimumNetDwellings, 11);

    const before = db.committed.observations.map((row) => row.content_fingerprint);
    const failed = await ingestBrownfieldLand({
      store,
      entities: [site(9602), site(9603), site(9604)],
      failAtIndex: 1,
    });
    assert.strictEqual(failed.status, 'FAILED');
    assert.strictEqual(failed.inserted_count, 0);
    assert.strictEqual(failed.failure_reason, 'injected_database_failure');
    assert.deepStrictEqual(db.committed.observations.map((row) => row.content_fingerprint), before);
    assert.ok(db.journal.includes('ROLLBACK'));
    assert.strictEqual(db.journal.filter((item) => item === 'COMMIT').length, 3);

    const stillThere = await getOfficialBrownfieldLandEvidence({
      brownfieldStore: store,
      sourceEntityId: 9601,
    });
    assert.strictEqual(stillThere.status, 'SUFFICIENT');
    assert.strictEqual(stillThere.coverage.state, 'AVAILABLE');
    assert.strictEqual(stillThere.coverage.latestAttemptStatus, 'FAILED');

    await store.startRun({ release_label: 'BROWNFIELD_LAND' });
    const afterAbandon = await getOfficialBrownfieldLandEvidence({
      brownfieldStore: store,
      sourceEntityId: 9601,
    });
    assert.strictEqual(afterAbandon.status, 'SUFFICIENT');
    assert.strictEqual(afterAbandon.coverage.latestAttemptStatus, 'STARTED');
    assert.strictEqual(afterAbandon.coverage.state, 'AVAILABLE');
  });

  await test('postgres date values stay calendar dates and entry-date still selects', async () => {
    const older = new Date(2024, 11, 16);
    const newer = new Date(2025, 5, 1);
    const rows = [older, newer].map((entryDate, index) => ({
      source: 'MHCLG_PLANNING_DATA',
      dataset: 'brownfield-land',
      dataset_label: 'Brownfield land',
      source_product: 'fixture',
      record_kind: 'OFFICIAL_OBSERVATION',
      geography_type: 'SITE',
      geographic_scope: 'England',
      source_entity_id: 1800001,
      organisation_entity: 336,
      reference: 'REF',
      name: index === 0 ? 'Older' : 'Newer',
      entry_date: entryDate,
      start_date: null,
      end_date: null,
      planning_permission_date: null,
      minimum_net_dwellings: index === 0 ? 4 : 9,
      maximum_net_dwellings: index === 0 ? 4 : 9,
      release_label: 'BROWNFIELD_LAND',
      content_fingerprint: index === 0 ? 'a' : 'b',
      provenance: { artifactSha256: 'abc' },
      limitations: [],
    }));
    const run = {
      id: 1,
      status: 'SUCCEEDED',
      inserted_count: 2,
      unchanged_count: 0,
      updated_count: 0,
      finished_at: '2026-10-23T14:20:52.222Z',
    };
    const db = {
      async query(sql) {
        const text = compact(sql);
        if (text.includes('COUNT(*)')) return { rows: [{ n: rows.length }], rowCount: 1 };
        if (text.includes('FROM brownfield_land_import_runs')) {
          return { rows: [run], rowCount: 1 };
        }
        if (text.includes('FROM brownfield_land_observations')) return { rows, rowCount: rows.length };
        throw new Error(`unhandled_date_fake:${text.slice(0, 80)}`);
      },
    };
    const store = createPostgresBrownfieldLandStore(db);
    const evidence = await getOfficialBrownfieldLandEvidence({
      brownfieldStore: store,
      sourceEntityId: 1800001,
    });
    assert.strictEqual(evidence.status, 'SUFFICIENT');
    assert.strictEqual(evidence.revisionSelection.selectionStatus, BROWNFIELD_SELECTION.RESOLVED);
    assert.strictEqual(evidence.observations[0].entryDate, '2025-06-01');
    assert.strictEqual(evidence.observations[0].minimumNetDwellings, 9);
    assert.strictEqual(evidence.revisions.map((row) => row.entryDate).sort().join(','), '2024-12-16,2025-06-01');
  });

  await test('migration repair and coverage stay separate from site import', async () => {
    const root = path.join(__dirname, '..');
    const repair = fs.readFileSync(path.join(root, 'db/migrations/038_brownfield_revision_uniqueness_repair.sql'), 'utf8');
    const revision = fs.readFileSync(path.join(root, 'db/migrations/036_brownfield_land_revisions.sql'), 'utf8');
    const ensure = fs.readFileSync(path.join(root, 'db/ensureIntelligenceSchema.js'), 'utf8');
    const storeSource = fs.readFileSync(path.join(root, 'services/market/brownfieldLandStore.js'), 'utf8');
    const coverage = fs.readFileSync(path.join(root, 'services/market/officialBrownfieldCoverage.js'), 'utf8');
    assert.ok(repair.includes('NOT LIKE \'%content_fingerprint%\''));
    assert.ok(repair.includes('brownfield_land_observations_revision_identity'));
    assert.ok(!/\bCOMMIT\b/.test(repair));
    assert.ok(!/\bCOMMIT\b/.test(revision));
    assert.ok(revision.includes('DROP CONSTRAINT brownfield_land_observations_source_source_entity_id_release_label_key'));
    assert.ok(ensure.includes('obsoleteBrownfieldUnique'));
    assert.ok(ensure.includes('038_brownfield_revision_uniqueness_repair.sql'));
    assert.ok(storeSource.includes('ON CONFLICT (source, source_entity_id, release_label, content_fingerprint) DO NOTHING'));
    assert.ok(storeSource.includes('RETURNING id'));
    assert.ok(storeSource.includes("client.query('BEGIN')"));
    assert.ok(storeSource.includes("client.query('ROLLBACK')"));
    assert.ok(!coverage.includes('brownfieldLandStore'));
    assert.ok(coverage.includes('forbidden_coverage_percentage'));
    assert.ok(!Object.values(profileContract.AREA_EVIDENCE_FAMILY).includes('brownfield'));
    assert.ok(!profileContract.AREA_EVIDENCE_FAMILY_ORDER.some((id) => /brownfield/i.test(id)));
  });

  if (process.exitCode) {
    console.error(`officialBrownfieldPersistence: ${passed} passed, with failures`);
    process.exit(process.exitCode);
  }
  console.log(`officialBrownfieldPersistence: ${passed} passed`);
})();
