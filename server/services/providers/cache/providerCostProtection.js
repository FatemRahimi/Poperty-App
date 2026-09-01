/**
 * Provider-cost protection helpers for lookup/resolve.
 * Does not consume AI generation credits and does not change analyse billing.
 */

const pool = require('../../../models/db');
const { propertyIntelligenceConfig } = require('../../../config/propertyIntelligence.config');

const PROVIDER_LOOKUP_LIMIT = 'PROVIDER_LOOKUP_LIMIT';
const LOOKUP_QUERY_INVALID = 'LOOKUP_QUERY_INVALID';
const PROVIDER_TEMPORARILY_UNAVAILABLE = 'PROVIDER_TEMPORARILY_UNAVAILABLE';

const PUBLIC_MESSAGES = {
  [PROVIDER_LOOKUP_LIMIT]: 'Property lookup limit reached. Try again later.',
  [LOOKUP_QUERY_INVALID]: 'Enter at least 3 characters (address or postcode).',
  [PROVIDER_TEMPORARILY_UNAVAILABLE]: 'External property data is temporarily unavailable.',
};

function logProviderCostEvent({
  event,
  provider = 'propertydata',
  endpoint = null,
  outcome = null,
  userId = null,
} = {}) {
  const uid = Number.isFinite(Number(userId)) ? Number(userId) : null;
  console.info(
    `[provider-cost] event=${event} provider=${provider} endpoint=${endpoint || 'n/a'} outcome=${outcome || 'n/a'} user=${uid == null ? 'n/a' : uid}`
  );
}

function classifyProviderFailure(error) {
  const message = String(error?.message || error || '');
  const name = String(error?.name || '');
  if (name === 'AbortError' || /aborted|timeout|timed out/i.test(message)) {
    return {
      code: PROVIDER_TEMPORARILY_UNAVAILABLE,
      usageCode: 'timeout',
      message: PUBLIC_MESSAGES[PROVIDER_TEMPORARILY_UNAVAILABLE],
    };
  }
  if (/\b429\b|too many requests|rate limit/i.test(message)) {
    return {
      code: PROVIDER_TEMPORARILY_UNAVAILABLE,
      usageCode: 'http_429',
      message: PUBLIC_MESSAGES[PROVIDER_TEMPORARILY_UNAVAILABLE],
    };
  }
  if (/\b5\d\d\b|internal server error|bad gateway|service unavailable/i.test(message)) {
    return {
      code: PROVIDER_TEMPORARILY_UNAVAILABLE,
      usageCode: 'http_5xx',
      message: PUBLIC_MESSAGES[PROVIDER_TEMPORARILY_UNAVAILABLE],
    };
  }
  if (/network|fetch failed|econn|enotfound|eai_again/i.test(message)) {
    return {
      code: PROVIDER_TEMPORARILY_UNAVAILABLE,
      usageCode: 'network',
      message: PUBLIC_MESSAGES[PROVIDER_TEMPORARILY_UNAVAILABLE],
    };
  }
  if (/not configured|api key/i.test(message)) {
    return {
      code: PROVIDER_TEMPORARILY_UNAVAILABLE,
      usageCode: 'not_configured',
      message: PUBLIC_MESSAGES[PROVIDER_TEMPORARILY_UNAVAILABLE],
    };
  }
  return {
    code: PROVIDER_TEMPORARILY_UNAVAILABLE,
    usageCode: 'provider_error',
    message: PUBLIC_MESSAGES[PROVIDER_TEMPORARILY_UNAVAILABLE],
  };
}

function hasReusableUprnProfile(subject, now = Date.now(), ttlMs = propertyIntelligenceConfig.cacheTtl.uprnProfile) {
  if (!subject) return false;
  let snap = subject.profile_snapshot;
  if (typeof snap === 'string') {
    try {
      snap = JSON.parse(snap);
    } catch {
      return false;
    }
  }
  if (!snap || typeof snap !== 'object' || Array.isArray(snap) || !Object.keys(snap).length) {
    return false;
  }
  const updated = new Date(subject.updated_at || subject.created_at).getTime();
  if (!Number.isFinite(updated)) return false;
  return now - updated < ttlMs;
}

async function countRecentPaidExecutions(
  userId,
  endpoints = propertyIntelligenceConfig.providerProtection.expensiveEndpoints,
  windowMs = propertyIntelligenceConfig.providerProtection.quotaWindowMs
) {
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid <= 0) return 0;
  try {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS n
       FROM data_provider_usage
       WHERE user_id = $1
         AND cache_hit = false
         AND endpoint = ANY($2)
         AND created_at > NOW() - ($3 * INTERVAL '1 millisecond')`,
      [uid, endpoints, windowMs]
    );
    return result.rows[0]?.n || 0;
  } catch {
    return 0;
  }
}

async function checkExpensiveProviderQuota(userId, deps = {}) {
  const limit = propertyIntelligenceConfig.providerProtection.maxPaidExecutionsPerUserHour;
  const countFn = deps.countRecentPaidExecutions || countRecentPaidExecutions;
  const used = await countFn(userId);
  if (used >= limit) {
    logProviderCostEvent({
      event: 'quota_rejected',
      outcome: PROVIDER_LOOKUP_LIMIT,
      userId,
    });
    return {
      allowed: false,
      code: PROVIDER_LOOKUP_LIMIT,
      message: PUBLIC_MESSAGES[PROVIDER_LOOKUP_LIMIT],
      used,
      limit,
    };
  }
  return { allowed: true, used, limit };
}

function lookupQueryInvalid(query) {
  const q = String(query || '').trim();
  const min = propertyIntelligenceConfig.providerProtection.minLookupQueryLength;
  if (q.length < min) {
    return {
      success: false,
      code: LOOKUP_QUERY_INVALID,
      message: PUBLIC_MESSAGES[LOOKUP_QUERY_INVALID],
    };
  }
  return null;
}

module.exports = {
  PROVIDER_LOOKUP_LIMIT,
  LOOKUP_QUERY_INVALID,
  PROVIDER_TEMPORARILY_UNAVAILABLE,
  PUBLIC_MESSAGES,
  logProviderCostEvent,
  classifyProviderFailure,
  hasReusableUprnProfile,
  countRecentPaidExecutions,
  checkExpensiveProviderQuota,
  lookupQueryInvalid,
};
