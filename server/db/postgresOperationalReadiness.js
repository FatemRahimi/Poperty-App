/**
 * Read-only PostgreSQL operational readiness for HTTP probes.
 * Reuses Brownfield 035–039 checks; does not migrate or import.
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
    await withTimeout(db.query('SELECT 1 AS ok'), timeoutMs, 'database_timeout');
    return { ok: true, status: 'up' };
  } catch {
    // Never surface connection strings, hosts, or driver internals.
    return { ok: false, status: 'unreachable' };
  }
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
  const database = await checkDatabaseConnectivity(db, { timeoutMs });
  if (!database.ok) {
    return {
      ok: false,
      database,
      listing: { ok: false, missing: ['database_unreachable'] },
      brownfield: { ok: false, missing: ['database_unreachable'] },
    };
  }

  const [listing, brownfield] = await Promise.all([
    assessListingSchemaReadiness(db),
    assessBrownfieldSchemaReadiness(db),
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
  assessListingSchemaReadiness,
  checkDatabaseConnectivity,
  assessPostgresOperationalReadiness,
  toPublicReadyPayload,
};
