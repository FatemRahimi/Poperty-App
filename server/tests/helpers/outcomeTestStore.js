/**
 * In-memory listing store with SELECT FOR UPDATE serialization.
 * Used only by HTTP readiness tests so the real route/controller/service path
 * can be exercised without writing to the development database.
 */

const { ONCE_ONLY_EVENT_TYPES } = require('../../services/ai/listingLifecycleService');

function splitSqlAssignments(text) {
  const parts = [];
  let current = '';
  let depth = 0;
  for (const ch of text) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function applyPropertyUpdate(current, sql, params = []) {
  const next = { ...current, updated_at: '2026-08-25T18:00:00.000Z' };
  const match = String(sql).match(/SET\s+([\s\S]+?)\s+WHERE/i);
  if (!match) return next;
  splitSqlAssignments(match[1]).forEach((assign) => {
    const bound = assign.match(/^(\w+)\s*=\s*\$(\d+)$/i);
    if (bound) {
      next[bound[1]] = params[Number(bound[2]) - 1];
      return;
    }
    if (/^final_asking_price\s*=\s*COALESCE/i.test(assign)) {
      next.final_asking_price = current.final_asking_price ?? current.price ?? null;
    }
  });
  return next;
}

function createOutcomeStore(initial = []) {
  const properties = new Map(initial.map((row) => [Number(row.id), { ...row }]));
  const events = [];
  const lockTails = new Map();

  async function acquireLock(id) {
    const key = Number(id);
    let release;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    const previous = lockTails.get(key) || Promise.resolve();
    lockTails.set(key, previous.then(() => held));
    await previous;
    return release;
  }

  function listingById(id) {
    const row = properties.get(Number(id));
    return row ? { ...row } : null;
  }

  function createClient() {
    const heldLocks = [];
    const client = {
      async query(sql, params = []) {
        const text = String(sql).trim();
        if (text === 'BEGIN') return { rows: [] };
        if (text === 'COMMIT' || text === 'ROLLBACK') {
          heldLocks.splice(0).forEach((unlock) => unlock());
          return { rows: [] };
        }
        if (text.includes('property_identities') || text.includes('intelligence_subjects')) {
          return { rows: [] };
        }
        if (/SELECT \* FROM properties WHERE id = \$1 AND user_id = \$2 FOR UPDATE/.test(text)) {
          const unlock = await acquireLock(params[0]);
          heldLocks.push(unlock);
          const row = properties.get(Number(params[0]));
          if (!row || Number(row.user_id) !== Number(params[1])) return { rows: [] };
          return { rows: [{ ...row }] };
        }
        if (/SELECT \* FROM properties WHERE id = \$1 FOR UPDATE/.test(text)) {
          const unlock = await acquireLock(params[0]);
          heldLocks.push(unlock);
          const row = properties.get(Number(params[0]));
          return { rows: row ? [{ ...row }] : [] };
        }
        if (text.includes('UPDATE properties SET')) {
          const id = Number(params[params.length - 1]);
          const current = properties.get(id);
          if (!current) return { rows: [] };
          const next = applyPropertyUpdate(current, text, params);
          properties.set(id, next);
          return { rows: [{ ...next }] };
        }
        if (text.includes('INSERT INTO listing_events')) {
          const row = {
            id: events.length + 1,
            property_id: params[0],
            event_type: params[1],
            event_at: params[2],
            actor_user_id: params[3],
            payload: JSON.parse(params[4]),
            provenance: JSON.parse(params[5]),
            created_at: new Date().toISOString(),
          };
          if (
            ONCE_ONLY_EVENT_TYPES.includes(row.event_type) &&
            events.some((e) => e.property_id === row.property_id && e.event_type === row.event_type)
          ) {
            const err = new Error('duplicate key value violates unique constraint');
            err.code = '23505';
            throw err;
          }
          events.push(row);
          return { rows: [row] };
        }
        return { rows: [] };
      },
      release() {
        heldLocks.splice(0).forEach((unlock) => unlock());
      },
    };
    return client;
  }

  return {
    properties,
    events,
    seed(listings) {
      listings.forEach((row) => properties.set(Number(row.id), { ...row }));
    },
    listingById,
    createClient,
  };
}

function installPgPoolStub(store) {
  const pgPath = require.resolve('pg');
  require('pg');
  class Pool {
    async connect() {
      return store.createClient();
    }
    async query(sql, params) {
      const client = store.createClient();
      try {
        return await client.query(sql, params);
      } finally {
        client.release();
      }
    }
    async end() {}
  }
  const cached = require.cache[pgPath];
  cached.exports = { Pool, types: cached.exports.types };
}

function resetModule(modulePath) {
  const resolved = require.resolve(modulePath);
  delete require.cache[resolved];
}

function loadPropertyRoutesWithStore(store) {
  installPgPoolStub(store);
  resetModule('../../controllers/propertyController');
  resetModule('../../routes/propertyRoutes');
  return require('../../routes/propertyRoutes');
}

module.exports = {
  applyPropertyUpdate,
  createOutcomeStore,
  installPgPoolStub,
  loadPropertyRoutesWithStore,
};
