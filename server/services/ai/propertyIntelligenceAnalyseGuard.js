/**
 * V1.1 Phase 1 — Property Intelligence analyse execution safety.
 * One in-flight analyse per user, shared across Node instances via Postgres.
 * Does not score, call providers, persist, or change credit-on-success semantics.
 */

const { randomUUID } = require('crypto');

const ANALYSIS_IN_PROGRESS_CODE = 'ANALYSIS_IN_PROGRESS';
const ANALYSIS_IN_PROGRESS_PUBLIC =
  'An analysis is already running. Please wait for it to finish.';
const ANALYSIS_SLOT_TTL_MS = 3 * 60 * 1000;
const ANALYSIS_SLOT_HEARTBEAT_MS = 15 * 1000;
const RETRY_AFTER_SECONDS = 10;
const ANALYSE_START_FAILED_PUBLIC = 'Unable to start analysis. Please try again.';

function inProgressBody() {
  return {
    success: false,
    code: ANALYSIS_IN_PROGRESS_CODE,
    message: ANALYSIS_IN_PROGRESS_PUBLIC,
  };
}

function rejectedSlot() {
  return {
    ok: false,
    code: ANALYSIS_IN_PROGRESS_CODE,
    message: ANALYSIS_IN_PROGRESS_PUBLIC,
    async heartbeat() {},
    async release() {},
  };
}

function createMemoryAnalyseSlotStore({ ttlMs, now }) {
  const inflight = new Map();

  return {
    inflight,
    async acquire(userId) {
      const existing = inflight.get(userId);
      if (existing && now() - existing.lastHeartbeat < ttlMs) {
        return rejectedSlot();
      }
      const entry = { lastHeartbeat: now(), token: randomUUID() };
      inflight.set(userId, entry);
      let released = false;
      return {
        ok: true,
        async heartbeat() {
          if (inflight.get(userId) === entry) entry.lastHeartbeat = now();
        },
        async release() {
          if (released) return;
          released = true;
          if (inflight.get(userId) === entry) inflight.delete(userId);
        },
      };
    },
  };
}

function createPostgresAnalyseSlotStore({ pool, ttlMs }) {
  if (!pool || typeof pool.query !== 'function') {
    throw new Error('postgres analyse slot store requires pool.query');
  }

  return {
    async acquire(userId) {
      const token = randomUUID();
      const inserted = await pool.query(
        `INSERT INTO pi_analyse_slots (user_id, lease_token, heartbeat_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (user_id) DO NOTHING
         RETURNING user_id`,
        [userId, token]
      );
      if (!inserted.rows[0]) {
        const stolen = await pool.query(
          `UPDATE pi_analyse_slots
           SET lease_token = $2, heartbeat_at = NOW()
           WHERE user_id = $1
             AND heartbeat_at < NOW() - ($3 * INTERVAL '1 millisecond')
           RETURNING user_id`,
          [userId, token, ttlMs]
        );
        if (!stolen.rows[0]) return rejectedSlot();
      }

      let released = false;
      return {
        ok: true,
        async heartbeat() {
          if (released) return;
          await pool.query(
            `UPDATE pi_analyse_slots
             SET heartbeat_at = NOW()
             WHERE user_id = $1 AND lease_token = $2`,
            [userId, token]
          );
        },
        async release() {
          if (released) return;
          released = true;
          await pool.query(
            `DELETE FROM pi_analyse_slots
             WHERE user_id = $1 AND lease_token = $2`,
            [userId, token]
          );
        },
      };
    },
  };
}

function createIntelligenceAnalyseGuard(options = {}) {
  const ttlMs = Number.isFinite(options.ttlMs) ? options.ttlMs : ANALYSIS_SLOT_TTL_MS;
  const heartbeatMs = Number.isFinite(options.heartbeatMs)
    ? options.heartbeatMs
    : ANALYSIS_SLOT_HEARTBEAT_MS;
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const store =
    options.store === 'postgres'
      ? createPostgresAnalyseSlotStore({ pool: options.pool, ttlMs })
      : createMemoryAnalyseSlotStore({ ttlMs, now });

  async function acquireIntelligenceAnalyseSlot(userId) {
    const id = Number(userId);
    if (!Number.isFinite(id) || id <= 0) return rejectedSlot();
    return store.acquire(id);
  }

  async function requireIntelligenceAnalyseSlot(req, res, next) {
    let slot;
    try {
      slot = await acquireIntelligenceAnalyseSlot(req.user && req.user.id);
    } catch (error) {
      const code = error && (error.code || error.name);
      console.error(`[property-intelligence] analyse-slot: ${code || 'Error'}`);
      return res.status(503).json({
        success: false,
        message: ANALYSE_START_FAILED_PUBLIC,
      });
    }
    if (!slot.ok) {
      if (typeof res.set === 'function') res.set('Retry-After', String(RETRY_AFTER_SECONDS));
      return res.status(429).json(inProgressBody());
    }

    let timer = null;
    if (heartbeatMs > 0) {
      timer = setInterval(() => {
        Promise.resolve(slot.heartbeat()).catch(() => {});
      }, heartbeatMs);
      if (typeof timer.unref === 'function') timer.unref();
    }

    let finished = false;
    const onDone = () => {
      if (finished) return;
      finished = true;
      if (timer) clearInterval(timer);
      Promise.resolve(slot.release()).catch(() => {});
    };
    if (typeof res.on === 'function') res.on('finish', onDone);
    else onDone();
    next();
  }

  return {
    acquireIntelligenceAnalyseSlot,
    requireIntelligenceAnalyseSlot,
    inflightCount() {
      return store.inflight ? store.inflight.size : null;
    },
  };
}

let productionGuard = null;
function getProductionGuard() {
  if (!productionGuard) {
    const pool = require('../../models/db');
    productionGuard = createIntelligenceAnalyseGuard({ store: 'postgres', pool });
  }
  return productionGuard;
}

module.exports = {
  ANALYSIS_IN_PROGRESS_CODE,
  ANALYSIS_IN_PROGRESS_PUBLIC,
  ANALYSIS_SLOT_TTL_MS,
  ANALYSIS_SLOT_HEARTBEAT_MS,
  RETRY_AFTER_SECONDS,
  ANALYSE_START_FAILED_PUBLIC,
  inProgressBody,
  createIntelligenceAnalyseGuard,
  acquireIntelligenceAnalyseSlot: (...args) =>
    getProductionGuard().acquireIntelligenceAnalyseSlot(...args),
  requireIntelligenceAnalyseSlot: (...args) =>
    getProductionGuard().requireIntelligenceAnalyseSlot(...args),
};
