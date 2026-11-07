/**
 * Read-only PostgreSQL operational readiness probe.
 * GET /api/ready — no migrations, no imports, no credentials in response.
 */

const express = require('express');
const pool = require('../models/db');
const {
  assessPostgresOperationalReadiness,
  toPublicReadyPayload,
  DEFAULT_TIMEOUT_MS,
} = require('../db/postgresOperationalReadiness');

function createReadyRouter({ db = pool, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const router = express.Router();

  router.get('/', async (_req, res) => {
    try {
      const result = await assessPostgresOperationalReadiness(db, { timeoutMs });
      const payload = toPublicReadyPayload(result);
      return res.status(payload.ok ? 200 : 503).json(payload);
    } catch {
      return res.status(503).json({
        ok: false,
        database: { ok: false, status: 'unreachable' },
        listing: { ok: false, missing: ['readiness_check_failed'] },
        brownfield: { ok: false, missing: ['readiness_check_failed'] },
      });
    }
  });

  return router;
}

module.exports = {
  createReadyRouter,
  readyRoutes: createReadyRouter(),
};
