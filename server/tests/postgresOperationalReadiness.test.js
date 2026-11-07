/**
 * Phase 3K.5 — PostgreSQL operational readiness endpoint.
 * No live database. Run: node tests/postgresOperationalReadiness.test.js
 */

const assert = require('assert');
const http = require('http');
const express = require('express');
const fs = require('fs');
const path = require('path');
const {
  assessPostgresOperationalReadiness,
  assessListingSchemaReadiness,
} = require('../db/postgresOperationalReadiness');
const { createReadyRouter } = require('../routes/readyRoutes');

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

function completeBrownfieldPresence(overrides = {}) {
  return {
    tables: new Set([
      'brownfield_land_import_runs',
      'brownfield_land_observations',
      'brownfield_coverage_runs',
      'brownfield_lpa_identities',
      'brownfield_provider_index',
      'brownfield_organisation_lpa_links',
      'brownfield_land_artifacts',
      'listing_events',
      'pi_analyse_slots',
      'asset_classifications',
      'evidence_documents',
    ]),
    columns: new Set([
      'brownfield_land_import_runs.artifact_id',
      'ai_requests.subject_id',
    ]),
    indexes: new Set([
      'idx_brownfield_land_entity_revisions',
      'idx_brownfield_land_import_runs_artifact',
    ]),
    constraints: new Set([
      'brownfield_land_observations_revision_identity',
      'brownfield_land_artifacts_sha256_key',
    ]),
    obsoleteUnique: false,
    failConnectivity: false,
    queryLog: [],
    ...overrides,
  };
}

function fakeDb(presence) {
  return {
    async query(sql, params = []) {
      presence.queryLog.push({ sql: String(sql), params });
      const text = String(sql);
      if (presence.failConnectivity) {
        throw Object.assign(new Error('connect ECONNREFUSED postgres://secret@db/propertydb'), {
          code: 'ECONNREFUSED',
        });
      }
      // Only the bounded connectivity probe — not "SELECT 1 FROM …" schema checks.
      if (/^SELECT 1 AS ok\b/i.test(text.trim())) {
        return { rows: [{ ok: 1 }] };
      }
      if (text.includes('information_schema.tables')) {
        return { rows: presence.tables.has(params[0]) ? [{}] : [] };
      }
      if (text.includes('information_schema.columns')) {
        return { rows: presence.columns.has(`${params[0]}.${params[1]}`) ? [{}] : [] };
      }
      if (text.includes('pg_indexes')) {
        return { rows: presence.indexes.has(params[0]) ? [{}] : [] };
      }
      if (text.includes('FROM pg_constraint') && text.includes('conname = $1')) {
        return { rows: presence.constraints.has(params[0]) ? [{}] : [] };
      }
      if (text.includes('NOT LIKE \'%content_fingerprint%\'')) {
        return { rows: presence.obsoleteUnique ? [{}] : [] };
      }
      throw new Error(`unexpected_query: ${text.slice(0, 120)}`);
    },
  };
}

function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        server,
        port,
        async close() {
          await new Promise((done) => server.close(done));
        },
      });
    });
  });
}

async function getReady(port) {
  return new Promise((resolve, reject) => {
    const req = http.get({
      host: '127.0.0.1',
      port,
      path: '/api/ready',
      timeout: 3000,
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve({
          statusCode: res.statusCode,
          body: JSON.parse(raw),
        });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('request_timeout'));
    });
  });
}

(async () => {
  await test('healthy DB and complete schemas return 200', async () => {
    const presence = completeBrownfieldPresence();
    const app = express();
    app.use('/api/ready', createReadyRouter({ db: fakeDb(presence) }));
    const listener = await listen(app);
    try {
      const response = await getReady(listener.port);
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.body.ok, true);
      assert.strictEqual(response.body.database.status, 'up');
      assert.strictEqual(response.body.listing.ok, true);
      assert.strictEqual(response.body.brownfield.ok, true);
    } finally {
      await listener.close();
    }
  });

  await test('unreachable DB returns 503 without leaking connection details', async () => {
    const presence = completeBrownfieldPresence({ failConnectivity: true });
    const app = express();
    app.use('/api/ready', createReadyRouter({ db: fakeDb(presence) }));
    const listener = await listen(app);
    try {
      const response = await getReady(listener.port);
      assert.strictEqual(response.statusCode, 503);
      assert.strictEqual(response.body.ok, false);
      assert.strictEqual(response.body.database.status, 'unreachable');
      const serialized = JSON.stringify(response.body);
      assert.ok(!serialized.includes('propertydb'));
      assert.ok(!serialized.includes('ECONNREFUSED'));
      assert.ok(!serialized.includes('postgres://'));
    } finally {
      await listener.close();
    }
  });

  await test('missing Brownfield table returns 503', async () => {
    const presence = completeBrownfieldPresence();
    presence.tables.delete('brownfield_land_observations');
    const result = await assessPostgresOperationalReadiness(fakeDb(presence));
    assert.strictEqual(result.ok, false);
    assert.ok(result.brownfield.missing.includes('table:brownfield_land_observations'));
  });

  await test('missing Brownfield constraint returns 503', async () => {
    const presence = completeBrownfieldPresence();
    presence.constraints.delete('brownfield_land_observations_revision_identity');
    const app = express();
    app.use('/api/ready', createReadyRouter({ db: fakeDb(presence) }));
    const listener = await listen(app);
    try {
      const response = await getReady(listener.port);
      assert.strictEqual(response.statusCode, 503);
      assert.strictEqual(response.body.brownfield.ok, false);
      assert.ok(
        response.body.brownfield.missing.includes(
          'constraint:brownfield_land_observations_revision_identity'
        )
      );
    } finally {
      await listener.close();
    }
  });

  await test('missing listing schema returns 503', async () => {
    const presence = completeBrownfieldPresence();
    presence.tables.delete('listing_events');
    const listing = await assessListingSchemaReadiness(fakeDb(presence));
    assert.strictEqual(listing.ok, false);
    assert.ok(listing.missing.includes('table:listing_events'));

    const app = express();
    app.use('/api/ready', createReadyRouter({ db: fakeDb(presence) }));
    const listener = await listen(app);
    try {
      const response = await getReady(listener.port);
      assert.strictEqual(response.statusCode, 503);
      assert.strictEqual(response.body.listing.ok, false);
      assert.ok(response.body.listing.missing.includes('table:listing_events'));
    } finally {
      await listener.close();
    }
  });

  await test('readiness probe does not write or invoke migrations', async () => {
    const presence = completeBrownfieldPresence();
    const db = fakeDb(presence);
    await assessPostgresOperationalReadiness(db);
    assert.ok(presence.queryLog.length > 0);
    presence.queryLog.forEach((entry) => {
      const sql = entry.sql.toLowerCase();
      assert.ok(!/\b(insert|update|delete|alter|create|drop|truncate|grant)\b/.test(sql));
      assert.ok(!sql.includes('migrate'));
      assert.ok(!sql.includes('brownfield_land_import'));
    });

    const readySource = fs.readFileSync(
      path.join(__dirname, '../routes/readyRoutes.js'),
      'utf8'
    );
    const opsSource = fs.readFileSync(
      path.join(__dirname, '../db/postgresOperationalReadiness.js'),
      'utf8'
    );
    const appSource = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
    assert.ok(appSource.includes('/api/ready'));
    assert.ok(readySource.includes('assessPostgresOperationalReadiness'));
    assert.ok(!readySource.includes('ensureIntelligenceSchema'));
    assert.ok(!readySource.includes('runMigrations'));
    assert.ok(!readySource.includes('importOfficialNational'));
    assert.ok(!opsSource.includes('ensureIntelligenceSchema'));
    assert.ok(!opsSource.includes('importOfficialNational'));
  });

  if (process.exitCode) {
    console.error(`postgresOperationalReadiness: ${passed} passed, with failures`);
    process.exit(process.exitCode);
  }
  console.log(`postgresOperationalReadiness: ${passed} passed`);
})();
