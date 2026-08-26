const crypto = require('crypto');
const pool = require('../../../models/db');

function buildCacheKey(provider, endpoint, params = {}) {
  const sorted = Object.keys(params)
    .sort()
    .reduce((acc, key) => {
      if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
        acc[key] = String(params[key]);
      }
      return acc;
    }, {});
  const raw = `${provider}:${endpoint}:${JSON.stringify(sorted)}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

async function getCachedResponse(cacheKey) {
  const result = await pool.query(
    `SELECT response, status, hit_count, expires_at, retrieved_at
     FROM data_provider_cache
     WHERE cache_key = $1 AND expires_at > NOW()`,
    [cacheKey]
  );

  const row = result.rows[0];
  if (!row) return null;

  await pool.query(
    `UPDATE data_provider_cache SET hit_count = hit_count + 1 WHERE cache_key = $1`,
    [cacheKey]
  );

  return {
    data: row.response,
    status: row.status,
    cacheHit: true,
    retrievedAt: row.retrieved_at,
    expiresAt: row.expires_at,
  };
}

async function setCachedResponse({
  cacheKey,
  provider,
  endpoint,
  response,
  ttlMs,
  creditsUsed = 0,
  status = 'ok',
}) {
  const expiresAt = new Date(Date.now() + ttlMs);
  await pool.query(
    `INSERT INTO data_provider_cache
      (cache_key, provider, endpoint, response, status, credits_used, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (cache_key) DO UPDATE SET
       response = EXCLUDED.response,
       status = EXCLUDED.status,
       credits_used = EXCLUDED.credits_used,
       expires_at = EXCLUDED.expires_at,
       retrieved_at = CURRENT_TIMESTAMP,
       hit_count = 0`,
    [cacheKey, provider, endpoint, JSON.stringify(response), status, creditsUsed, expiresAt]
  );
  return expiresAt;
}

async function purgeExpiredCache() {
  const result = await pool.query(`DELETE FROM data_provider_cache WHERE expires_at <= NOW()`);
  return result.rowCount;
}

module.exports = {
  buildCacheKey,
  getCachedResponse,
  setCachedResponse,
  purgeExpiredCache,
};
