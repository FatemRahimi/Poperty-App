/**
 * Read-only PostgreSQL operational readiness for HTTP probes.
 * Reuses Brownfield 035–039 checks; does not migrate or import.
 *
 * Timeouts (node-pg 8.16):
 * - Per-query `query_timeout` rejects client-side and, when the client is
 *   released with an error, pg-pool removes that client (connection ended)
 *   so a hung readiness query cannot occupy a pool slot indefinitely.
 * - An overall Promise deadline bounds wall-clock time including connect.
 * - Readiness checks out one client (when db.connect exists) instead of
 *   issuing many independent pool.query checkouts.
 */

const {
  assessBrownfieldSchemaReadiness,
  tableExists,
  columnExists,
} = require('./brownfieldSchemaReadiness');

const DEFAULT_TIMEOUT_MS = 2000;

const LISTING_REQUIRED = [
  { type: 'column', table: 'ai_requests', column: 'subject_id', code: 'column:ai_requests.subject_id' },
  { type: 'table', table: 'listing_events', code: 'table:listing_events' },
  { type: 'table', table: 'pi_analyse_slots', code: 'table:pi_analyse_slots' },
  { type: 'table', table: 'asset_classifications', code: 'table:asset_classifications' },
  { type: 'table', table: 'evidence_documents', code: 'table:evidence_documents' },
];

function withTimeout(promise, timeoutMs, code) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(Object.assign(new Error(code), { code }));
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer);
  });
}

function isTimeoutError(error) {
  if (!error) return false;
  if (error.code === 'readiness_timeout' || error.code === 'database_timeout') return true;
  const message = String(error.message || '');
  return message === 'Query read timeout' || /timeout/i.test(message);
}

function timeoutResult() {
  return {
    ok: false,
    database: { ok: false, status: 'timeout' },
    listing: { ok: false, missing: ['readiness_timeout'] },
    brownfield: { ok: false, missing: ['readiness_timeout'] },
  };
}

function unreachableResult() {
  return {
    ok: false,
    database: { ok: false, status: 'unreachable' },
    listing: { ok: false, missing: ['database_unreachable'] },
    brownfield: { ok: false, missing: ['database_unreachable'] },
  };
}

/**
 * Force every readiness query to carry node-pg query_timeout so the client
 * rejects and the checked-out client can be destroyed via release(err).
 */
function bindQueryTimeout(db, timeoutMs) {
  return {
    query(textOrConfig, values) {
      if (typeof textOrConfig === 'string') {
        return db.query({
          text: textOrConfig,
          values,
          query_timeout: timeoutMs,
        });
      }
      if (textOrConfig && typeof textOrConfig === 'object') {
        return db.query({
          ...textOrConfig,
          query_timeout: timeoutMs,
        });
      }
      return db.query(textOrConfig, values);
    },
  };
}

/**
 * Checkout with a deadline. If connect wins after the deadline, release
 * immediately so the client cannot leak into uncontrolled work.
 */
function connectWithTimeout(pool, timeoutMs) {
  let timedOut = false;
  const timeout = new Promise((_, reject) => {
    setTimeout(() => {
      timedOut = true;
      reject(Object.assign(new Error('database_timeout'), { code: 'database_timeout' }));
    }, timeoutMs);
  });

  const connect = Promise.resolve()
    .then(() => pool.connect())
    .then((client) => {
      if (timedOut) {
        try {
          client.release(new Error('database_timeout'));
        } catch (_error) {
          try {
            client.release();
          } catch (_releaseError) {
            /* ignore */
          }
        }
        throw Object.assign(new Error('database_timeout'), { code: 'database_timeout' });
      }
      return client;
    });

  return Promise.race([connect, timeout]);
}

async function assessListingSchemaReadiness(db) {
  if (!db || typeof db.query !== 'function') {
    return {
      ok: false,
      missing: ['queryable_database'],
    };
  }

  const missing = [];
  for (const item of LISTING_REQUIRED) {
    const exists = item.type === 'column'
      ? await columnExists(db, item.table, item.column)
      : await tableExists(db, item.table);
    if (!exists) missing.push(item.code);
  }
  return {
    ok: missing.length === 0,
    missing,
  };
}

async function checkDatabaseConnectivity(db, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!db || typeof db.query !== 'function') {
    return { ok: false, status: 'unreachable' };
  }
  try {
    await db.query({
      text: 'SELECT 1 AS ok',
      query_timeout: timeoutMs,
    });
    return { ok: true, status: 'up' };
  } catch (error) {
    if (isTimeoutError(error)) {
      return { ok: false, status: 'timeout' };
    }
    return { ok: false, status: 'unreachable' };
  }
}

async function runReadinessChecks(db, timeoutMs) {
  const database = await checkDatabaseConnectivity(db, { timeoutMs });
  if (!database.ok) {
    return {
      ok: false,
      database,
      listing: {
        ok: false,
        missing: [database.status === 'timeout' ? 'readiness_timeout' : 'database_unreachable'],
      },
      brownfield: {
        ok: false,
        missing: [database.status === 'timeout' ? 'readiness_timeout' : 'database_unreachable'],
      },
    };
  }

  const bounded = bindQueryTimeout(db, timeoutMs);
  const [listing, brownfield] = await Promise.all([
    assessListingSchemaReadiness(bounded),
    assessBrownfieldSchemaReadiness(bounded),
  ]);

  return {
    ok: listing.ok && brownfield.ok,
    database,
    listing: {
      ok: listing.ok,
      missing: listing.missing || [],
    },
    brownfield: {
      ok: brownfield.ok,
      missing: brownfield.missing || [],
    },
  };
}

/**
 * @returns {{
 *   ok: boolean,
 *   database: { ok: boolean, status: string },
 *   listing: { ok: boolean, missing: string[] },
 *   brownfield: { ok: boolean, missing: string[] },
 * }}
 */
async function assessPostgresOperationalReadiness(db, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!db || typeof db.query !== 'function') {
    return unreachableResult();
  }

  let client = null;
  let released = false;
  const releaseClient = (error) => {
    if (!client || released) return;
    released = true;
    try {
      if (error) client.release(error);
      else client.release();
    } catch (_error) {
      try {
        client.release();
      } catch (_releaseError) {
        /* ignore */
      }
    }
  };

  try {
    const result = await withTimeout((async () => {
      if (typeof db.connect === 'function') {
        client = await connectWithTimeout(db, timeoutMs);
        return runReadinessChecks(client, timeoutMs);
      }
      return runReadinessChecks(db, timeoutMs);
    })(), timeoutMs, 'readiness_timeout');

    // Destroy the client on any failed/timed probe so a post-timeout connection
    // cannot return to the shared pool while still busy or half-broken.
    releaseClient(result.ok ? undefined : new Error('readiness_failed'));
    return result;
  } catch (error) {
    releaseClient(error || new Error('readiness_timeout'));
    if (isTimeoutError(error)) {
      return timeoutResult();
    }
    return unreachableResult();
  }
}

function toPublicReadyPayload(result) {
  return {
    ok: !!result.ok,
    database: {
      ok: !!(result.database && result.database.ok),
      status: (result.database && result.database.status) || 'unreachable',
    },
    listing: {
      ok: !!(result.listing && result.listing.ok),
      missing: Array.isArray(result.listing && result.listing.missing)
        ? result.listing.missing.slice()
        : [],
    },
    brownfield: {
      ok: !!(result.brownfield && result.brownfield.ok),
      missing: Array.isArray(result.brownfield && result.brownfield.missing)
        ? result.brownfield.missing.slice()
        : [],
    },
  };
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  LISTING_REQUIRED,
  bindQueryTimeout,
  connectWithTimeout,
  assessListingSchemaReadiness,
  checkDatabaseConnectivity,
  assessPostgresOperationalReadiness,
  toPublicReadyPayload,
};
