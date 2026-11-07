/**
 * Phase 3K.3 — Brownfield schema readiness (035–039).
 * No live database. Run: node tests/brownfieldSchemaReadiness.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  assessBrownfieldSchemaReadiness,
} = require('../db/brownfieldSchemaReadiness');

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

function fakeDb({
  tables = new Set(),
  columns = new Set(),
  indexes = new Set(),
  constraints = new Set(),
  obsoleteUnique = false,
} = {}) {
  return {
    async query(sql, params = []) {
      const text = String(sql);
      if (text.includes('information_schema.tables')) {
        return { rows: tables.has(params[0]) ? [{}] : [] };
      }
      if (text.includes('information_schema.columns')) {
        return { rows: columns.has(`${params[0]}.${params[1]}`) ? [{}] : [] };
      }
      if (text.includes('pg_indexes')) {
        return { rows: indexes.has(params[0]) ? [{}] : [] };
      }
      if (text.includes('FROM pg_constraint') && text.includes('conname = $1')) {
        return { rows: constraints.has(params[0]) ? [{}] : [] };
      }
      if (text.includes('NOT LIKE \'%content_fingerprint%\'')) {
        return { rows: obsoleteUnique ? [{}] : [] };
      }
      throw new Error(`unexpected_query: ${text.slice(0, 80)}`);
    },
  };
}

function completePresence(overrides = {}) {
  return {
    tables: new Set([
      'brownfield_land_import_runs',
      'brownfield_land_observations',
      'brownfield_coverage_runs',
      'brownfield_lpa_identities',
      'brownfield_provider_index',
      'brownfield_organisation_lpa_links',
      'brownfield_land_artifacts',
    ]),
    columns: new Set(['brownfield_land_import_runs.artifact_id']),
    indexes: new Set([
      'idx_brownfield_land_entity_revisions',
      'idx_brownfield_land_import_runs_artifact',
    ]),
    constraints: new Set([
      'brownfield_land_observations_revision_identity',
      'brownfield_land_artifacts_sha256_key',
    ]),
    obsoleteUnique: false,
    ...overrides,
  };
}

(async () => {
  await test('missing required Brownfield table is not ready', async () => {
    const presence = completePresence();
    presence.tables.delete('brownfield_land_observations');
    const result = await assessBrownfieldSchemaReadiness(fakeDb(presence));
    assert.strictEqual(result.ok, false);
    assert.ok(result.missing.includes('table:brownfield_land_observations'));
  });

  await test('missing required revision constraint is not ready', async () => {
    const presence = completePresence();
    presence.constraints.delete('brownfield_land_observations_revision_identity');
    const result = await assessBrownfieldSchemaReadiness(fakeDb(presence));
    assert.strictEqual(result.ok, false);
    assert.ok(result.missing.includes('constraint:brownfield_land_observations_revision_identity'));
  });

  await test('obsolete uniqueness constraint is not ready', async () => {
    const result = await assessBrownfieldSchemaReadiness(
      fakeDb(completePresence({ obsoleteUnique: true }))
    );
    assert.strictEqual(result.ok, false);
    assert.ok(result.missing.includes('obsolete_unique:brownfield_land_observations'));
  });

  await test('missing artifact_id is not ready', async () => {
    const presence = completePresence();
    presence.columns.delete('brownfield_land_import_runs.artifact_id');
    const result = await assessBrownfieldSchemaReadiness(fakeDb(presence));
    assert.strictEqual(result.ok, false);
    assert.ok(result.missing.includes('column:brownfield_land_import_runs.artifact_id'));
  });

  await test('complete schema is ready', async () => {
    const result = await assessBrownfieldSchemaReadiness(fakeDb(completePresence()));
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.missing, []);
  });

  await test('ensure and migrate wire the shared Brownfield readiness check', async () => {
    const ensure = fs.readFileSync(
      path.join(__dirname, '../db/ensureIntelligenceSchema.js'),
      'utf8'
    );
    const migrate = fs.readFileSync(
      path.join(__dirname, '../scripts/migrate-intelligence-schema.js'),
      'utf8'
    );
    const startup = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    assert.ok(ensure.includes('assessBrownfieldSchemaReadiness'));
    assert.ok(ensure.includes('brownfieldOk'));
    assert.ok(ensure.includes('listingOk'));
    assert.ok(migrate.includes('assessBrownfieldSchemaReadiness'));
    assert.ok(startup.includes('schema.ok === false'));
    assert.ok(startup.includes('brownfieldOk'));
    assert.ok(!startup.includes('process.exit(1)') || startup.includes('EADDRINUSE'));
  });

  if (process.exitCode) {
    console.error(`brownfieldSchemaReadiness: ${passed} passed, with failures`);
    process.exit(process.exitCode);
  }
  console.log(`brownfieldSchemaReadiness: ${passed} passed`);
})();
