/**
 * V1.1 Phase 1 — analyse execution safety.
 * Concurrent analyse is rejected before expensive work.
 * Does not change scoring, Personal Decision, Decision Intelligence, or What-if.
 * Run: node server/tests/propertyIntelligenceAnalyseGuard.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  ANALYSIS_IN_PROGRESS_CODE,
  ANALYSIS_IN_PROGRESS_PUBLIC,
  inProgressBody,
  createIntelligenceAnalyseGuard,
} = require('../services/ai/propertyIntelligenceAnalyseGuard');

const ROOT = path.join(__dirname, '..');
const pending = [];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function test(name, fn) {
  const result = fn();
  if (result && typeof result.then === 'function') {
    throw new Error(`Use asyncTest for ${name}`);
  }
  console.log(`✓ ${name}`);
}

function asyncTest(name, fn) {
  pending.push({ name, fn });
}

function mockRes() {
  const listeners = {};
  return {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    json(body) {
      this.body = body;
      (listeners.finish || []).forEach((fn) => fn());
      return this;
    },
    on(event, fn) {
      (listeners[event] || (listeners[event] = [])).push(fn);
      return this;
    },
    finish() {
      (listeners.finish || []).forEach((fn) => fn());
    },
    close() {
      (listeners.close || []).forEach((fn) => fn());
    },
  };
}

function createFakeSlotPool(clock) {
  const rows = new Map();
  return {
    rows,
    async query(sql, params) {
      const s = String(sql).replace(/\s+/g, ' ').trim();
      if (s.startsWith('INSERT INTO pi_analyse_slots')) {
        const userId = Number(params[0]);
        const token = params[1];
        if (rows.has(userId)) return { rows: [] };
        rows.set(userId, { lease_token: token, heartbeat_at: clock.now() });
        return { rows: [{ user_id: userId }] };
      }
      if (s.includes('SET lease_token')) {
        const userId = Number(params[0]);
        const token = params[1];
        const ttlMs = Number(params[2]);
        const row = rows.get(userId);
        if (!row || clock.now() - row.heartbeat_at < ttlMs) return { rows: [] };
        rows.set(userId, { lease_token: token, heartbeat_at: clock.now() });
        return { rows: [{ user_id: userId }] };
      }
      if (s.includes('SET heartbeat_at = NOW()')) {
        const userId = Number(params[0]);
        const token = params[1];
        const row = rows.get(userId);
        if (!row || row.lease_token !== token) return { rows: [] };
        row.heartbeat_at = clock.now();
        return { rows: [{ user_id: userId }] };
      }
      if (s.startsWith('DELETE FROM pi_analyse_slots')) {
        const userId = Number(params[0]);
        const token = params[1];
        const row = rows.get(userId);
        if (!row || row.lease_token !== token) return { rows: [] };
        rows.delete(userId);
        return { rows: [] };
      }
      throw new Error(`unexpected sql: ${s}`);
    },
  };
}

test('public 429 body is generic and does not leak internals', () => {
  const body = inProgressBody();
  assert.strictEqual(body.success, false);
  assert.strictEqual(body.code, ANALYSIS_IN_PROGRESS_CODE);
  assert.strictEqual(body.message, ANALYSIS_IN_PROGRESS_PUBLIC);
  assert.ok(!Object.prototype.hasOwnProperty.call(body, 'error'));
  assert.ok(!JSON.stringify(body).includes('stack'));
});

asyncTest('A same-process concurrent request is rejected', async () => {
  const guard = createIntelligenceAnalyseGuard({ heartbeatMs: 0 });
  const first = await guard.acquireIntelligenceAnalyseSlot(45);
  const second = await guard.acquireIntelligenceAnalyseSlot(45);
  assert.strictEqual(first.ok, true);
  assert.strictEqual(second.ok, false);
  assert.strictEqual(second.code, ANALYSIS_IN_PROGRESS_CODE);
  assert.strictEqual(guard.inflightCount(), 1);
});

asyncTest('B lock releases after success and D a later request succeeds', async () => {
  const { requireIntelligenceAnalyseSlot } = createIntelligenceAnalyseGuard({ heartbeatMs: 0 });
  const req = { user: { id: 45 } };
  const firstRes = mockRes();
  let nextCount = 0;
  await requireIntelligenceAnalyseSlot(req, firstRes, () => {
    nextCount += 1;
  });
  assert.strictEqual(nextCount, 1);
  firstRes.status(200).json({ success: true });

  const afterRes = mockRes();
  await requireIntelligenceAnalyseSlot(req, afterRes, () => {
    nextCount += 1;
  });
  assert.strictEqual(nextCount, 2);
  afterRes.finish();
});

asyncTest('C lock releases after failure', async () => {
  const { requireIntelligenceAnalyseSlot } = createIntelligenceAnalyseGuard({ heartbeatMs: 0 });
  const req = { user: { id: 12 } };
  const res = mockRes();
  await requireIntelligenceAnalyseSlot(req, res, () => {});
  const blocked = mockRes();
  await requireIntelligenceAnalyseSlot(req, blocked, () => {});
  assert.strictEqual(blocked.statusCode, 429);
  res.status(500).json({ success: false, message: 'Property analysis failed' });
  const after = mockRes();
  let nexted = false;
  await requireIntelligenceAnalyseSlot(req, after, () => {
    nexted = true;
  });
  assert.strictEqual(nexted, true);
  after.finish();
});

asyncTest('E unlimited plans use the same in-flight lease', async () => {
  const guard = createIntelligenceAnalyseGuard({ heartbeatMs: 0 });
  const unlimited = await guard.acquireIntelligenceAnalyseSlot(9);
  const again = await guard.acquireIntelligenceAnalyseSlot(9);
  assert.strictEqual(unlimited.ok, true);
  assert.strictEqual(again.ok, false);
  await unlimited.release();
  const after = await guard.acquireIntelligenceAnalyseSlot(9);
  assert.strictEqual(after.ok, true);
  await after.release();
});

test('F insufficient credits are rejected before a slot is taken', () => {
  const routes = read('routes/aiRoutes.js');
  const listing = routes.slice(routes.indexOf("'/intelligence/analyse/:propertyId'"));
  const listingCredits = listing.indexOf('requireCredits');
  const listingSlot = listing.indexOf('requireIntelligenceAnalyseSlot');
  assert.ok(listingCredits >= 0 && listingCredits < listingSlot);
  const subject = routes.slice(routes.indexOf("'/intelligence/subjects/:subjectId/analyse'"));
  assert.ok(subject.indexOf('requireCredits') < subject.indexOf('requireIntelligenceAnalyseSlot'));
  const guard = read('services/ai/propertyIntelligenceAnalyseGuard.js');
  assert.ok(!guard.includes('canGenerate'));
  assert.ok(!guard.includes('consumeCredit'));
});

test('G listing and subject routes share one per-user lease; What-if does not', () => {
  const routes = read('routes/aiRoutes.js');
  assert.ok(
    /authenticateAI,\s*requireCredits,\s*requireIntelligenceAnalyseSlot,\s*analysePropertyIntelligence/.test(
      routes
    )
  );
  assert.ok(
    /authenticateAI,\s*requireCredits,\s*requireIntelligenceAnalyseSlot,\s*analyseSubjectIntelligence/.test(
      routes
    )
  );
  assert.ok(routes.includes("router.post('/intelligence/what-if', authenticateAI, compareIntelligenceWhatIf)"));
  assert.ok(!routes.includes('requireIntelligenceAnalyseSlot, compareIntelligenceWhatIf'));
});

asyncTest('H TTL does not start a second run while the first lease is heartbeating', async () => {
  let t = 1000;
  const guard = createIntelligenceAnalyseGuard({ ttlMs: 50, heartbeatMs: 0, now: () => t });
  const first = await guard.acquireIntelligenceAnalyseSlot(7);
  assert.strictEqual(first.ok, true);
  t = 1080;
  await first.heartbeat();
  const live = await guard.acquireIntelligenceAnalyseSlot(7);
  assert.strictEqual(live.ok, false);
  await first.release();
});

asyncTest('H abandoned lease without heartbeat can be recovered after TTL', async () => {
  let t = 1000;
  const guard = createIntelligenceAnalyseGuard({ ttlMs: 50, heartbeatMs: 0, now: () => t });
  const first = await guard.acquireIntelligenceAnalyseSlot(8);
  assert.strictEqual(first.ok, true);
  t = 1080;
  const recovered = await guard.acquireIntelligenceAnalyseSlot(8);
  assert.strictEqual(recovered.ok, true);
  await first.release();
  const stillHeld = await guard.acquireIntelligenceAnalyseSlot(8);
  assert.strictEqual(stillHeld.ok, false);
  await recovered.release();
});

asyncTest('I two Node instances sharing Postgres cannot both run', async () => {
  const clock = { now: () => 5000 };
  const pool = createFakeSlotPool(clock);
  const instanceA = createIntelligenceAnalyseGuard({
    store: 'postgres',
    pool,
    ttlMs: 180000,
    heartbeatMs: 0,
  });
  const instanceB = createIntelligenceAnalyseGuard({
    store: 'postgres',
    pool,
    ttlMs: 180000,
    heartbeatMs: 0,
  });
  const a = await instanceA.acquireIntelligenceAnalyseSlot(45);
  const b = await instanceB.acquireIntelligenceAnalyseSlot(45);
  assert.strictEqual(a.ok, true);
  assert.strictEqual(b.ok, false);
  assert.strictEqual(pool.rows.size, 1);
  await a.release();
  const after = await instanceB.acquireIntelligenceAnalyseSlot(45);
  assert.strictEqual(after.ok, true);
  await after.release();
});

asyncTest('I postgres heartbeat prevents TTL steal of a live cross-instance lease', async () => {
  let t = 1000;
  const clock = { now: () => t };
  const pool = createFakeSlotPool(clock);
  const instanceA = createIntelligenceAnalyseGuard({
    store: 'postgres',
    pool,
    ttlMs: 50,
    heartbeatMs: 0,
  });
  const instanceB = createIntelligenceAnalyseGuard({
    store: 'postgres',
    pool,
    ttlMs: 50,
    heartbeatMs: 0,
  });
  const a = await instanceA.acquireIntelligenceAnalyseSlot(3);
  t = 1080;
  await a.heartbeat();
  const b = await instanceB.acquireIntelligenceAnalyseSlot(3);
  assert.strictEqual(b.ok, false);
  await a.release();
});

asyncTest('different users remain independent', async () => {
  const guard = createIntelligenceAnalyseGuard({ heartbeatMs: 0 });
  const a = await guard.acquireIntelligenceAnalyseSlot(1);
  const b = await guard.acquireIntelligenceAnalyseSlot(2);
  assert.strictEqual(a.ok, true);
  assert.strictEqual(b.ok, true);
  await a.release();
  await b.release();
});

asyncTest('client disconnect without finish does not unlock a running analyse', async () => {
  const { requireIntelligenceAnalyseSlot } = createIntelligenceAnalyseGuard({ heartbeatMs: 0 });
  const req = { user: { id: 22 } };
  const res = mockRes();
  await requireIntelligenceAnalyseSlot(req, res, () => {});
  res.close();
  const second = mockRes();
  let nexted = false;
  await requireIntelligenceAnalyseSlot(req, second, () => {
    nexted = true;
  });
  assert.strictEqual(nexted, false);
  assert.strictEqual(second.statusCode, 429);
  res.finish();
});

asyncTest('middleware rejects a second in-flight analyse with 429', async () => {
  const { requireIntelligenceAnalyseSlot } = createIntelligenceAnalyseGuard({ heartbeatMs: 0 });
  const req = { user: { id: 45 } };
  const firstRes = mockRes();
  let nextCount = 0;
  await requireIntelligenceAnalyseSlot(req, firstRes, () => {
    nextCount += 1;
  });
  const secondRes = mockRes();
  await requireIntelligenceAnalyseSlot(req, secondRes, () => {
    nextCount += 1;
  });
  assert.strictEqual(nextCount, 1);
  assert.strictEqual(secondRes.statusCode, 429);
  assert.strictEqual(secondRes.headers['Retry-After'], '10');
  assert.deepStrictEqual(secondRes.body, inProgressBody());
  firstRes.finish();
});

test('production guard uses a shared Postgres lease, not process memory', () => {
  const src = read('services/ai/propertyIntelligenceAnalyseGuard.js');
  assert.ok(src.includes("store: 'postgres'"));
  assert.ok(src.includes('pi_analyse_slots'));
  assert.ok(src.includes('ON CONFLICT (user_id) DO NOTHING'));
  assert.ok(src.includes('heartbeat_at'));
  const ensure = read('db/ensureIntelligenceSchema.js');
  assert.ok(ensure.includes('019_pi_analyse_slots.sql'));
  assert.ok(ensure.includes('pi_analyse_slots'));
  const migrate = read('scripts/migrate-intelligence-schema.js');
  assert.ok(migrate.includes('019_pi_analyse_slots.sql'));
});

test('PI execution can exceed 3 minutes, so stale TTL must not equal max runtime', () => {
  const openai = read('services/openaiService.js');
  assert.ok(!openai.includes('AbortController'));
  const engine = read('services/ai/propertyIntelligenceEngine.js');
  assert.ok(engine.includes('await getFloodEvidenceFn'));
  assert.ok(engine.includes('await getPlanningEvidenceFn'));
  assert.ok(engine.includes('await getSchoolEvidenceFn'));
  assert.ok(engine.includes('await getListedBuildingEvidenceFn'));
  assert.ok(engine.includes('await getConservationAreaEvidenceFn'));
  assert.ok(engine.includes('await getArticle4EvidenceFn'));
  assert.ok(engine.includes('await explainDecisionIntelligence'));
  const config = read('config/propertyIntelligence.config.js');
  assert.ok(config.includes('ENVIRONMENT_AGENCY_FLOOD_TIMEOUT_MS, 15000)'));
});

test('guard does not enter the frozen intelligence engines', () => {
  const src = read('services/ai/propertyIntelligenceAnalyseGuard.js');
  assert.ok(!src.includes('runFullPropertyAnalysis'));
  assert.ok(!src.includes('buildRisks'));
  assert.ok(!src.includes('personalDecision'));
  assert.ok(!src.includes('decisionIntelligence'));
  assert.ok(!src.includes('consumeCredit'));
});

async function run() {
  for (const t of pending) {
    await t.fn();
    console.log(`✓ ${t.name}`);
  }
  console.log('\npropertyIntelligenceAnalyseGuard tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
