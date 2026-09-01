/**
 * Coalesce identical paid provider executions.
 * Process-local Map plus optional shared Postgres advisory lock.
 * Does not change cache TTL or response payloads.
 */

const crypto = require('crypto');
const pool = require('../../../models/db');

const localInflight = new Map();

function hashToAdvisoryKeys(cacheKey) {
  const hex = crypto.createHash('sha256').update(String(cacheKey)).digest('hex');
  const k1 = Number(BigInt(`0x${hex.slice(0, 8)}`) % 2147483647n);
  const k2 = Number(BigInt(`0x${hex.slice(8, 16)}`) % 2147483647n);
  return { k1, k2 };
}

async function withSharedProviderLock(cacheKey, fn) {
  let client;
  try {
    client = await pool.connect();
  } catch {
    return fn();
  }

  const { k1, k2 } = hashToAdvisoryKeys(cacheKey);
  try {
    await client.query('SELECT pg_advisory_lock($1, $2)', [k1, k2]);
    return await fn();
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1, $2)', [k1, k2]);
    } catch {
      /* lock already gone or connection broken */
    }
    client.release();
  }
}

/**
 * @param {object} opts
 * @param {string} opts.cacheKey
 * @param {Function} opts.getCached
 * @param {Function} opts.execute
 * @param {Function} [opts.setCached]
 * @param {boolean} [opts.useSharedLock]
 */
async function coalesceCachedProviderRequest({
  cacheKey,
  getCached,
  execute,
  setCached,
  useSharedLock = true,
}) {
  const cached = await getCached(cacheKey);
  if (cached) {
    return { result: cached, outcome: 'cache_hit', cacheHit: true };
  }

  const existing = localInflight.get(cacheKey);
  if (existing) {
    const shared = await existing;
    return {
      result: shared.result,
      outcome: 'deduplicated',
      cacheHit: shared.cacheHit,
    };
  }

  const task = (async () => {
    const run = async () => {
      const again = await getCached(cacheKey);
      if (again) {
        return { result: again, outcome: 'cache_hit', cacheHit: true };
      }
      const executed = await execute();
      if (typeof setCached === 'function') {
        await setCached(executed);
      }
      return { result: executed, outcome: 'provider_execution', cacheHit: false };
    };
    if (useSharedLock) {
      return withSharedProviderLock(cacheKey, run);
    }
    return run();
  })();

  localInflight.set(cacheKey, task);
  try {
    return await task;
  } finally {
    if (localInflight.get(cacheKey) === task) {
      localInflight.delete(cacheKey);
    }
  }
}

function resetLocalProviderInflight() {
  localInflight.clear();
}

module.exports = {
  coalesceCachedProviderRequest,
  withSharedProviderLock,
  hashToAdvisoryKeys,
  resetLocalProviderInflight,
};
