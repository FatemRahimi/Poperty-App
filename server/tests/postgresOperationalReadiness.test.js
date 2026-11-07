/**
 * Phase 3K.5 / 3K.6 — PostgreSQL operational readiness endpoint.
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
  bindQueryTimeout,
  DEFAULT_TIMEOUT_MS,
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
    hangConnectivity: false,
    hangSchema: false,
    hangForever: false,
    queryLog: [],
    outstanding: { count: 0, peak: 0 },
    releasedWithError: 0,
    releasedClean: 0,
    ...overrides,
  };
}

function normalizeQuery(sqlOrConfig, params = []) {
  if (sqlOrConfig && typeof sqlOrConfig === 'object') {
    return {
      text: String(sqlOrConfig.text || ''),
      params: sqlOrConfig.values || params || [],
      queryTimeout: sqlOrConfig.query_timeout,
    };
  }
  return {
    text: String(sqlOrConfig || ''),
    params: params || [],
    queryTimeout: undefined,
  };
}

function fakeDb(presence) {
  const runQuery = async (sqlOrConfig, params = []) => {
    const { text, params: queryParams, queryTimeout } = normalizeQuery(sqlOrConfig, params);
    presence.queryLog.push({ sql: text, params: queryParams, queryTimeout });
    presence.outstanding.count += 1;
    presence.outstanding.peak = Math.max(presence.outstanding.peak, presence.outstanding.count);

    const finish = async (work) => {
      try {
        if (presence.hangForever) {
          await new Promise(() => {});
        }
        if (
          (presence.hangConnectivity && /^SELECT 1 AS ok\b/i.test(text.trim()))
          || (presence.hangSchema && !/^SELECT 1 AS ok\b/i.test(text.trim()))
        ) {
          if (typeof queryTimeout === 'number' && queryTimeout > 0) {
            await new Promise((_, reject) => {
              setTimeout(() => {
                reject(Object.assign(new Error('Query read timeout'), { code: undefined }));
              }, queryTimeout);
            });
          }
          await new Promise(() => {});
        }
        return await work();
      } finally {
        presence.outstanding.count = Math.max(0, presence.outstanding.count - 1);
      }
    };

    return finish(async () => {
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
        return { rows: presence.tables.has(queryParams[0]) ? [{}] : [] };
      }
      if (text.includes('information_schema.columns')) {
        return { rows: presence.columns.has(`${queryParams[0]}.${queryParams[1]}`) ? [{}] : [] };
      }
      if (text.includes('pg_indexes')) {
        return { rows: presence.indexes.has(queryParams[0]) ? [{}] : [] };
      }
      if (text.includes('FROM pg_constraint') && text.includes('conname = $1')) {
        return { rows: presence.constraints.has(queryParams[0]) ? [{}] : [] };
      }
      if (text.includes('NOT LIKE \'%content_fingerprint%\'')) {
        return { rows: presence.obsoleteUnique ? [{}] : [] };
      }
      throw new Error(`unexpected_query: ${text.slice(0, 120)}`);
    });
  };

  const db = {
    async query(sqlOrConfig, params) {
      return runQuery(sqlOrConfig, params);
    },
  };

  if (presence.withConnect !== false) {
    db.connect = async () => {
      if (presence.hangConnect) {
        if (typeof presence.connectTimeoutMs === 'number') {
          await new Promise((_, reject) => {
            setTimeout(() => {
              reject(Object.assign(new Error('database_timeout'), { code: 'database_timeout' }));
            }, presence.connectTimeoutMs);
          });
        }
        await new Promise(() => {});
      }
      return {
        query: runQuery,
        release(error) {
          if (error) presence.releasedWithError += 1;
          else presence.releasedClean += 1;
        },
      };
    };
  }

  return db;
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

async function getReady(port, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const req = http.get({
      host: '127.0.0.1',
      port,
      path: '/api/ready',
      timeout: timeoutMs,
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

(async () => {
  await test('healthy DB and complete schemas return 200', async () => {
    const presence = completeBrownfieldPresence();
    const app = express();
    app.use('/api/ready', createReadyRouter({ db: fakeDb(presence), timeoutMs: 500 }));
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
    app.use('/api/ready', createReadyRouter({ db: fakeDb(presence), timeoutMs: 500 }));
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
    const result = await assessPostgresOperationalReadiness(fakeDb(presence), { timeoutMs: 500 });
    assert.strictEqual(result.ok, false);
    assert.ok(result.brownfield.missing.includes('table:brownfield_land_observations'));
  });

  await test('missing Brownfield constraint returns 503', async () => {
    const presence = completeBrownfieldPresence();
    presence.constraints.delete('brownfield_land_observations_revision_identity');
    const app = express();
    app.use('/api/ready', createReadyRouter({ db: fakeDb(presence), timeoutMs: 500 }));
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
    app.use('/api/ready', createReadyRouter({ db: fakeDb(presence), timeoutMs: 500 }));
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

  await test('hanging connectivity query returns bounded 503 timeout', async () => {
    const presence = completeBrownfieldPresence({ hangConnectivity: true });
    const started = Date.now();
    const app = express();
    app.use('/api/ready', createReadyRouter({ db: fakeDb(presence), timeoutMs: 80 }));
    const listener = await listen(app);
    try {
      const response = await getReady(listener.port);
      const elapsed = Date.now() - started;
      assert.strictEqual(response.statusCode, 503);
      assert.strictEqual(response.body.ok, false);
      assert.strictEqual(response.body.database.status, 'timeout');
      assert.ok(elapsed < 1500, `elapsed=${elapsed}`);
      assert.ok(presence.releasedWithError >= 1);
    } finally {
      await listener.close();
      await sleep(120);
      assert.strictEqual(presence.outstanding.count, 0);
    }
  });

  await test('hanging schema query returns bounded 503 timeout', async () => {
    const presence = completeBrownfieldPresence({ hangSchema: true });
    const started = Date.now();
    const app = express();
    app.use('/api/ready', createReadyRouter({ db: fakeDb(presence), timeoutMs: 80 }));
    const listener = await listen(app);
    try {
      const response = await getReady(listener.port);
      const elapsed = Date.now() - started;
      assert.strictEqual(response.statusCode, 503);
      assert.strictEqual(response.body.ok, false);
      assert.strictEqual(response.body.database.status, 'timeout');
      assert.ok(elapsed < 1500, `elapsed=${elapsed}`);
    } finally {
      await listener.close();
      await sleep(120);
      assert.strictEqual(presence.outstanding.count, 0);
    }
  });

  await test('timeout followed by healthy probe recovers to 200', async () => {
    const hangPresence = completeBrownfieldPresence({ hangConnectivity: true });
    const healthyPresence = completeBrownfieldPresence();
    let useHang = true;
    const db = {
      connect: async () => {
        const active = useHang ? hangPresence : healthyPresence;
        const inner = fakeDb(active);
        const client = await inner.connect();
        return client;
      },
      query: async () => {
        throw new Error('pool.query should not be used when connect exists');
      },
    };

    const app = express();
    app.use('/api/ready', createReadyRouter({ db, timeoutMs: 80 }));
    const listener = await listen(app);
    try {
      const timedOut = await getReady(listener.port);
      assert.strictEqual(timedOut.statusCode, 503);
      assert.strictEqual(timedOut.body.database.status, 'timeout');

      useHang = false;
      const recovered = await getReady(listener.port);
      assert.strictEqual(recovered.statusCode, 200);
      assert.strictEqual(recovered.body.ok, true);
      assert.strictEqual(recovered.body.database.status, 'up');
    } finally {
      await listener.close();
    }
  });

  await test('per-query timeout is applied to schema checks', async () => {
    const presence = completeBrownfieldPresence({ withConnect: false });
    const db = fakeDb(presence);
    await assessPostgresOperationalReadiness(db, { timeoutMs: 123 });
    const schemaEntries = presence.queryLog.filter(
      (entry) => !/^SELECT 1 AS ok\b/i.test(String(entry.sql).trim())
    );
    assert.ok(schemaEntries.length > 0);
    schemaEntries.forEach((entry) => {
      assert.strictEqual(entry.queryTimeout, 123);
    });

    const wrapped = bindQueryTimeout(db, 456);
    presence.queryLog.length = 0;
    await wrapped.query('SELECT 1 FROM information_schema.tables WHERE table_name = $1', ['listing_events']);
    assert.strictEqual(presence.queryLog[0].queryTimeout, 456);
  });

  await test('concurrent probes do not leave uncontrolled outstanding work', async () => {
    const presence = completeBrownfieldPresence({ hangSchema: true });
    const db = fakeDb(presence);
    const app = express();
    app.use('/api/ready', createReadyRouter({ db, timeoutMs: 60 }));
    const listener = await listen(app);
    try {
      const responses = await Promise.all([
        getReady(listener.port),
        getReady(listener.port),
        getReady(listener.port),
        getReady(listener.port),
      ]);
      responses.forEach((response) => {
        assert.strictEqual(response.statusCode, 503);
        assert.strictEqual(response.body.database.status, 'timeout');
      });
      await sleep(150);
      assert.strictEqual(presence.outstanding.count, 0);
      assert.ok(presence.outstanding.peak <= 20, `peak=${presence.outstanding.peak}`);
      assert.ok(presence.releasedWithError >= 1);
    } finally {
      await listener.close();
    }
  });

  await test('readiness probe does not write or invoke migrations', async () => {
    const presence = completeBrownfieldPresence();
    const db = fakeDb(presence);
    await assessPostgresOperationalReadiness(db, { timeoutMs: 500 });
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
    const dbSource = fs.readFileSync(path.join(__dirname, '../models/db.js'), 'utf8');
    assert.ok(appSource.includes('/api/ready'));
    assert.ok(readySource.includes('assessPostgresOperationalReadiness'));
    assert.ok(!readySource.includes('ensureIntelligenceSchema'));
    assert.ok(!readySource.includes('runMigrations'));
    assert.ok(!readySource.includes('importOfficialNational'));
    assert.ok(!opsSource.includes('ensureIntelligenceSchema'));
    assert.ok(!opsSource.includes('importOfficialNational'));
    assert.ok(!opsSource.includes('connectionTimeoutMillis'));
    assert.ok(!dbSource.includes('query_timeout'));
    assert.ok(typeof DEFAULT_TIMEOUT_MS === 'number');
  });

  if (process.exitCode) {
    console.error(`postgresOperationalReadiness: ${passed} passed, with failures`);
    process.exit(process.exitCode);
  }
  console.log(`postgresOperationalReadiness: ${passed} passed`);
})();
