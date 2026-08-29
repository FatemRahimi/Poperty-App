const pool = require('../../../models/db');

async function logProviderUsage({
  userId = null,
  propertyId = null,
  provider,
  endpoint,
  cacheHit = false,
  creditsUsed = 0,
  success = true,
  errorMessage = null,
  latencyMs = null,
}) {
  try {
    await pool.query(
      `INSERT INTO data_provider_usage
        (user_id, property_id, provider, endpoint, cache_hit, credits_used, success, error_message, latency_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [userId, propertyId, provider, endpoint, cacheHit, creditsUsed, success, errorMessage, latencyMs]
    );
  } catch (err) {
    console.error('Failed to log provider usage:', err.message);
  }
}

module.exports = { logProviderUsage };
