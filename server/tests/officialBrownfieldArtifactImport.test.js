/**
 * Phase 3E — reproducible Brownfield artifact import.
 * Fixtures only. No national download and no propertydb.
 * Run: node tests/officialBrownfieldArtifactImport.test.js
 */

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Readable } = require('stream');
const { spawnSync } = require('child_process');

const { BROWNFIELD_BULK_CSV_URL, BROWNFIELD_RELEASE_LABEL } = require('../architecture/officialBrownfieldLandDataset');
const { createMemoryBrownfieldLandStore } = require('../services/market/brownfieldLandStore');
const { createMemoryBrownfieldArtifactStore } = require('../services/market/brownfieldArtifactStore');
const { parseBrownfieldCsvFile, createCsvRecordReader } = require('../services/market/brownfieldArtifactCsv');
const {
  DEFAULT_TIMEOUT_MS,
  retrieveBrownfieldArtifact,
} = require('../services/market/retrieveBrownfieldArtifact');
const {
  assertSafeNationalDatabase,
  importBrownfieldArtifactFile,
  importOfficialNationalBrownfieldArtifact,
} = require('../services/market/importBrownfieldArtifact');
const { getOfficialBrownfieldLandEvidence } = require('../services/market/officialAreaBrownfieldEvidence');
const { BROWNFIELD_SELECTION } = require('../services/market/brownfieldLandRevisionSelection');
const profileContract = require('../architecture/officialAreaEvidenceProfileContract');

const MIN_CSV = path.join(__dirname, 'fixtures/planningdata-brownfield-land-min.csv');
const REVISION_CSV = path.join(__dirname, 'fixtures/planningdata-brownfield-land-revision.csv');
const AMBIGUOUS_CSV = path.join(__dirname, 'fixtures/planningdata-brownfield-land-ambiguous.csv');
const BAD_HEADER_CSV = path.join(__dirname, 'fixtures/planningdata-brownfield-land-bad-header.csv');
const LAST_MODIFIED = 'Thu, 22 Oct 2026 01:04:45 GMT';

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

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'bf-artifact-'));
}

function context(directory = tempDir()) {
  return {
    directory,
    landStore: createMemoryBrownfieldLandStore(),
    artifactStore: createMemoryBrownfieldArtifactStore(),
  };
}

function importFixture(filePath, ctx, extra = {}) {
  return importBrownfieldArtifactFile({
    filePath,
    directory: ctx.directory,
    landStore: ctx.landStore,
    artifactStore: ctx.artifactStore,
    sourceUrl: BROWNFIELD_BULK_CSV_URL,
    lastModified: LAST_MODIFIED,
    etag: '"fixture-etag"',
    ...extra,
  });
}

function scriptedRequest(steps) {
  const calls = [];
  return {
    calls,
    async request(url) {
      calls.push(String(url));
      const step = steps.shift();
      if (!step) throw new Error('unexpected_request');
      if (step.error) throw step.error;
      const body = Buffer.from(step.body || '');
      return {
        statusCode: step.statusCode || 200,
        headers: step.headers || {},
        stream: step.stream || Readable.from([body]),
        resolvedUrl: String(url),
      };
    },
  };
}

const TINY_CSV = [
  'dataset,entity,entry-date,name,organisation-entity',
  'brownfield-land,1800099,2024-01-01,Tiny,336',
  '',
].join('\n');

(async () => {
  await test('csv adapter preserves quoted commas, nulls, explicit zero, and an ended row', async () => {
    const parsed = await parseBrownfieldCsvFile(MIN_CSV);
    assert.strictEqual(parsed.dataRows, 5);
    assert.strictEqual(parsed.rejected.length, 1);
    assert.strictEqual(parsed.rejected[0].reason, 'missing_source_entity_id');
    const first = parsed.rows[0];
    assert.strictEqual(first.notes, 'Note with, comma');
    assert.strictEqual(first.siteAddress, '1 Test Street, London');
    assert.strictEqual(first.entryDate, '2024-06-01');
    const ended = parsed.rows.find((row) => row.sourceEntityId === 1800002);
    assert.strictEqual(ended.endDate, '2023-03-31');
    assert.strictEqual(ended.minimumNetDwellings, 0);
    const sparse = parsed.rows.find((row) => row.sourceEntityId === 1800003);
    assert.strictEqual(sparse.minimumNetDwellings, null);
    assert.strictEqual(sparse.notes, null);
  });

  await test('csv reader accepts a record split across chunks', async () => {
    const records = [];
    const reader = createCsvRecordReader(() => {}, (record) => records.push(record));
    reader.push(Buffer.from('dataset,entity,entry-date,notes\nbrownfield-land,7,2024-01-01,"hel'));
    reader.push(Buffer.from('lo, world"\n'));
    reader.end();
    assert.strictEqual(records.length, 1);
    assert.strictEqual(records[0].notes, 'hello, world');
  });

  await test('retrieval records hash, HTTP metadata, and does not treat them as publication dates', async () => {
    const directory = tempDir();
    const body = Buffer.from(TINY_CSV);
    const expected = crypto.createHash('sha256').update(body).digest('hex');
    const http = scriptedRequest([{
      body: TINY_CSV,
      headers: {
        'content-type': 'text/csv',
        'content-length': String(body.length),
        etag: '"07f8ad71406f17e330081ebaf3badecc-3"',
        'last-modified': LAST_MODIFIED,
      },
    }]);
    const retrieved = await retrieveBrownfieldArtifact({
      directory,
      request: http.request,
    });
    assert.strictEqual(retrieved.sha256, expected);
    assert.strictEqual(retrieved.byteLength, body.length);
    assert.strictEqual(retrieved.sourceUrl, BROWNFIELD_BULK_CSV_URL);
    assert.strictEqual(retrieved.etag, '"07f8ad71406f17e330081ebaf3badecc-3"');
    assert.strictEqual(retrieved.lastModified, LAST_MODIFIED);
    assert.notStrictEqual(retrieved.retrievedAt, retrieved.lastModified);
    assert.strictEqual(fs.readFileSync(retrieved.filePath).equals(body), true);
    assert.ok(DEFAULT_TIMEOUT_MS > 0 && DEFAULT_TIMEOUT_MS <= 180000);
    fs.rmSync(directory, { recursive: true, force: true });
  });

  await test('the same bytes are not rewritten and a different body stays distinct', async () => {
    const directory = tempDir();
    const headers = {
      'content-type': 'text/csv',
      'content-length': String(Buffer.byteLength(TINY_CSV)),
    };
    const first = await retrieveBrownfieldArtifact({
      directory,
      request: scriptedRequest([{ body: TINY_CSV, headers }]).request,
    });
    const stamped = new Date('2020-01-01T00:00:00.000Z');
    fs.utimesSync(first.filePath, stamped, stamped);
    const second = await retrieveBrownfieldArtifact({
      directory,
      request: scriptedRequest([{ body: TINY_CSV, headers }]).request,
    });
    assert.strictEqual(second.reused, true);
    assert.strictEqual(second.sha256, first.sha256);
    assert.strictEqual(fs.statSync(first.filePath).mtime.toISOString(), stamped.toISOString());
    const changed = TINY_CSV.replace('Tiny', 'Other');
    const third = await retrieveBrownfieldArtifact({
      directory,
      request: scriptedRequest([{
        body: changed,
        headers: { 'content-type': 'text/csv', 'content-length': String(Buffer.byteLength(changed)) },
      }]).request,
    });
    assert.notStrictEqual(third.sha256, first.sha256);
    assert.strictEqual(fs.existsSync(first.filePath), true);
    assert.strictEqual(fs.existsSync(third.filePath), true);
    fs.rmSync(directory, { recursive: true, force: true });
  });

  await test('unsafe redirects, HTTP errors, HTML, length mismatch, and partial files do not remain', async () => {
    const directory = tempDir();
    await assert.rejects(
      () => retrieveBrownfieldArtifact({
        directory,
        request: scriptedRequest([{
          statusCode: 302,
          headers: { location: 'https://evil.example/brownfield-land.csv' },
        }]).request,
      }),
      (error) => error.code === 'brownfield_artifact_host_not_allowed'
    );
    await assert.rejects(
      () => retrieveBrownfieldArtifact({
        directory,
        request: scriptedRequest([{ statusCode: 500, headers: {} }]).request,
      }),
      (error) => error.code === 'brownfield_artifact_http_status'
    );
    await assert.rejects(
      () => retrieveBrownfieldArtifact({
        directory,
        request: async () => {
          throw Object.assign(new Error('brownfield_artifact_timeout'), {
            code: 'brownfield_artifact_timeout',
          });
        },
      }),
      (error) => error.code === 'brownfield_artifact_timeout'
    );
    await assert.rejects(
      () => retrieveBrownfieldArtifact({
        directory,
        request: scriptedRequest([{
          headers: { 'content-type': 'text/html' },
          body: '<html><body>error</body></html>',
        }]).request,
      }),
      (error) => error.code === 'brownfield_artifact_html_response'
    );
    await assert.rejects(
      () => retrieveBrownfieldArtifact({
        directory,
        request: scriptedRequest([{
          headers: { 'content-type': 'text/csv', 'content-length': '99' },
          body: TINY_CSV,
        }]).request,
      }),
      (error) => error.code === 'brownfield_artifact_content_length_mismatch'
    );
    const hanging = new Readable({ read() {} });
    setImmediate(() => {
      hanging.push(Buffer.from('dataset,entity,entry-date\n'));
      hanging.destroy(new Error('socket hang up'));
    });
    await assert.rejects(
      () => retrieveBrownfieldArtifact({
        directory,
        request: scriptedRequest([{
          headers: { 'content-type': 'text/csv' },
          stream: hanging,
        }]).request,
      })
    );
    const names = fs.readdirSync(directory);
    assert.strictEqual(names.some((name) => name.startsWith('.partial-') || name.endsWith('.csv')), false);
    fs.rmSync(directory, { recursive: true, force: true });
  });

  await test('fixture import links the run to the artifact and replays explicitly', async () => {
    const ctx = context();
    const first = await importFixture(MIN_CSV, ctx);
    assert.strictEqual(first.status, 'SUCCEEDED');
    assert.strictEqual(first.inserted_count, 3);
    assert.strictEqual(first.unchanged_count, 1);
    assert.strictEqual(first.rejected_count, 1);
    assert.strictEqual(first.artifactDataRowCount, 5);
    assert.strictEqual(first.artifact.status, 'IMPORT_SUCCEEDED');
    assert.strictEqual(first.totalBrownfieldSites, undefined);
    assert.strictEqual(first.completenessPercentage, undefined);
    const run = await ctx.landStore.latestSuccessfulRun();
    assert.strictEqual(run.artifact_id, first.artifact.id);
    assert.strictEqual(run.release_label, BROWNFIELD_RELEASE_LABEL);
    assert.notStrictEqual(run.release_label, first.sha256);
    const evidence = await getOfficialBrownfieldLandEvidence({
      brownfieldStore: ctx.landStore,
      sourceEntityId: 1800001,
    });
    assert.strictEqual(evidence.status, 'SUFFICIENT');
    assert.strictEqual(evidence.observations[0].provenance.artifactSha256, first.sha256);
    assert.strictEqual(evidence.observations[0].provenance.artifactSourceUrl, BROWNFIELD_BULK_CSV_URL);
    assert.strictEqual(evidence.observations[0].entryDate, '2024-06-01');
    assert.notStrictEqual(evidence.observations[0].entryDate, first.artifact.retrieved_at);
    assert.strictEqual(first.artifact.last_modified, LAST_MODIFIED);
    assert.notStrictEqual(first.artifact.retrieved_at, first.artifact.last_modified);

    const before = ctx.landStore.snapshot().length;
    const again = await importFixture(MIN_CSV, ctx);
    assert.strictEqual(again.status, 'SKIPPED_AS_ALREADY_IMPORTED');
    assert.strictEqual(again.runId, first.runId);
    assert.strictEqual(again.artifact.id, first.artifact.id);
    assert.strictEqual(ctx.landStore.snapshot().length, before);
    fs.rmSync(ctx.directory, { recursive: true, force: true });
  });

  await test('a changed artifact keeps the old revision and entry-date still selects', async () => {
    const forward = context();
    const older = await importFixture(MIN_CSV, forward);
    const newer = await importFixture(REVISION_CSV, forward);
    assert.notStrictEqual(newer.sha256, older.sha256);
    assert.strictEqual(newer.inserted_count, 1);
    const selected = await getOfficialBrownfieldLandEvidence({
      brownfieldStore: forward.landStore,
      sourceEntityId: 1800001,
    });
    assert.strictEqual(selected.revisionSelection.selectionStatus, BROWNFIELD_SELECTION.RESOLVED);
    assert.strictEqual(selected.observations[0].entryDate, '2025-02-02');
    assert.strictEqual(selected.observations[0].minimumNetDwellings, 9);
    assert.strictEqual(selected.revisions.length, 2);
    fs.rmSync(forward.directory, { recursive: true, force: true });

    const reverse = context();
    await importFixture(REVISION_CSV, reverse);
    await importFixture(MIN_CSV, reverse);
    const stillNewer = await getOfficialBrownfieldLandEvidence({
      brownfieldStore: reverse.landStore,
      sourceEntityId: 1800001,
    });
    assert.strictEqual(stillNewer.observations[0].entryDate, '2025-02-02');
    assert.strictEqual(stillNewer.revisions.length, 2);
    fs.rmSync(reverse.directory, { recursive: true, force: true });
  });

  await test('tied entry dates stay ambiguous', async () => {
    const ctx = context();
    const result = await importFixture(AMBIGUOUS_CSV, ctx);
    assert.strictEqual(result.inserted_count, 2);
    const evidence = await getOfficialBrownfieldLandEvidence({
      brownfieldStore: ctx.landStore,
      sourceEntityId: 1800005,
    });
    assert.strictEqual(evidence.status, 'UNRESOLVED');
    assert.strictEqual(evidence.revisionSelection.selectionStatus, BROWNFIELD_SELECTION.AMBIGUOUS);
    assert.deepStrictEqual(evidence.observations, []);
    fs.rmSync(ctx.directory, { recursive: true, force: true });
  });

  await test('a bad artifact writes no observations and a failed import can be retried from the file', async () => {
    const ctx = context();
    await assert.rejects(
      () => importFixture(BAD_HEADER_CSV, ctx),
      (error) => error.code === 'brownfield_artifact_invalid_header'
    );
    assert.strictEqual(await ctx.landStore.latestRun(), null);
    assert.strictEqual(ctx.landStore.snapshot().length, 0);

    const failed = await importFixture(MIN_CSV, ctx, { failAtIndex: 1 });
    assert.strictEqual(failed.status, 'FAILED');
    assert.strictEqual(failed.inserted_count, 0);
    assert.strictEqual(failed.artifact.status, 'IMPORT_FAILED');
    assert.strictEqual(fs.existsSync(path.join(ctx.directory, `${failed.sha256}.csv`)), true);
    assert.strictEqual(ctx.landStore.snapshot().length, 0);
    const evidence = await getOfficialBrownfieldLandEvidence({ brownfieldStore: ctx.landStore });
    assert.strictEqual(evidence.reason, 'brownfield_error');

    const retried = await importFixture(MIN_CSV, ctx);
    assert.strictEqual(retried.status, 'SUCCEEDED');
    assert.strictEqual(retried.artifact.id, failed.artifact.id);
    assert.strictEqual(ctx.landStore.snapshot().length, 3);

    const prior = ctx.landStore.snapshot().map((row) => row.contentFingerprint);
    const later = context();
    later.landStore = ctx.landStore;
    later.artifactStore = ctx.artifactStore;
    later.directory = ctx.directory;
    const broken = await importFixture(REVISION_CSV, later, { failAtIndex: 0 });
    assert.strictEqual(broken.status, 'FAILED');
    assert.deepStrictEqual(ctx.landStore.snapshot().map((row) => row.contentFingerprint), prior);
    const survived = await getOfficialBrownfieldLandEvidence({
      brownfieldStore: ctx.landStore,
      sourceEntityId: 1800001,
    });
    assert.strictEqual(survived.status, 'SUFFICIENT');
    assert.strictEqual(survived.coverage.state, 'AVAILABLE');
    fs.rmSync(ctx.directory, { recursive: true, force: true });
  });

  await test('national import refuses an unsafe database before retrieval', async () => {
    let calls = 0;
    const request = () => {
      calls += 1;
      throw new Error('should_not_retrieve');
    };
    await assert.rejects(
      () => importOfficialNationalBrownfieldArtifact({ request }),
      (error) => error.code === 'national_brownfield_import_not_authorized'
    );
    await assert.rejects(
      () => importOfficialNationalBrownfieldArtifact({
        request,
        authorization: { confirmed: true, disposable: true, databaseName: 'propertydb' },
      }),
      (error) => error.code === 'national_brownfield_import_refuses_unsafe_database'
    );
    await assert.rejects(
      async () => {
        assertSafeNationalDatabase({
          confirmed: true,
          disposable: false,
          databaseName: 'property_phase3e_test',
        });
      },
      (error) => error.code === 'national_brownfield_import_not_authorized'
    );
    assert.strictEqual(calls, 0);
  });

  await test('coverage stays separate and downloaded artifacts are gitignored', async () => {
    const coverage = fs.readFileSync(path.join(__dirname, '../services/market/officialBrownfieldCoverage.js'), 'utf8');
    const importer = fs.readFileSync(path.join(__dirname, '../services/market/importBrownfieldArtifact.js'), 'utf8');
    assert.ok(!coverage.includes('brownfieldLandStore'));
    assert.ok(!importer.includes('completenessPercentage'));
    assert.ok(!Object.values(profileContract.AREA_EVIDENCE_FAMILY).includes('brownfield'));
    const root = path.join(__dirname, '../..');
    const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
    assert.ok(gitignore.includes('server/data/brownfield/'));
    const relative = 'server/data/brownfield/not-a-national-artifact.csv';
    fs.mkdirSync(path.join(root, 'server/data/brownfield'), { recursive: true });
    fs.writeFileSync(path.join(root, relative), 'fixture-probe\n');
    const ignored = spawnSync('git', ['check-ignore', '-q', relative], { cwd: root });
    fs.rmSync(path.join(root, relative), { force: true });
    assert.strictEqual(ignored.status, 0);
    const migration = fs.readFileSync(path.join(__dirname, '../db/migrations/039_brownfield_land_artifacts.sql'), 'utf8');
    assert.ok(migration.includes('UNIQUE (sha256)'));
    assert.ok(migration.includes('artifact_id'));
    assert.ok(migration.includes('ADD COLUMN IF NOT EXISTS artifact_id'));
  });

  if (process.exitCode) {
    console.error(`officialBrownfieldArtifactImport: ${passed} passed, with failures`);
    process.exit(process.exitCode);
  }
  console.log(`officialBrownfieldArtifactImport: ${passed} passed`);
})();
