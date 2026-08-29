/**
 * Single client-side cache for AI credit / plan display.
 * Server remains the credit authority. This module only mirrors GET /subscription
 * and post-consume / 402 payloads. It does not subtract credits locally.
 */

const CREDIT_CONSUMING_POST_PATHS = [
  /^\/api\/ai\/intelligence\/analyse\/\d+$/,
  /^\/api\/ai\/intelligence\/subjects\/\d+\/analyse$/,
  /^\/api\/ai\/listing-writer$/,
  /^\/api\/ai\/valuation$/,
  /^\/api\/ai\/buyer-match$/,
  /^\/api\/ai\/investment\/analyse$/,
  /^\/api\/ai\/rent\/analyse$/,
  /^\/api\/ai\/portfolio\/analyse$/,
  /^\/api\/ai\/subscription\/upgrade$/,
];

const listeners = new Set();
let snapshot = null;
let inflight = null;
let fetchImpl = null;
let epoch = 0;

function requestPath(config = {}) {
  const raw = String(config.url || '');
  try {
    return new URL(raw, 'http://ai.local').pathname.replace(/\/+$/, '') || '/';
  } catch {
    return raw.split('?')[0].replace(/\/+$/, '') || '/';
  }
}

function requestMethod(config = {}) {
  return String(config.method || 'get').toLowerCase();
}

export function isSubscriptionGetRequest(config) {
  return requestMethod(config) === 'get' && requestPath(config) === '/api/ai/subscription';
}

export function isCreditConsumingPostRequest(config) {
  if (requestMethod(config) !== 'post') return false;
  const path = requestPath(config);
  return CREDIT_CONSUMING_POST_PATHS.some((re) => re.test(path));
}

export function isUnlimitedPlan(snapshotValue) {
  const plan = snapshotValue?.plan;
  const remaining = snapshotValue?.subscription?.credits_remaining;
  return Boolean(plan?.unlimited || remaining < 0);
}

export function displayAiCredits(snapshotValue) {
  if (!snapshotValue?.subscription && !snapshotValue?.plan) return null;
  if (isUnlimitedPlan(snapshotValue)) return 'Unlimited';
  const remaining = snapshotValue?.subscription?.credits_remaining;
  if (remaining == null) return null;
  return remaining;
}

export function getAiCreditSnapshot() {
  return snapshot;
}

export function subscribeAiCredits(listener) {
  listeners.add(listener);
  if (snapshot) listener(snapshot);
  return () => listeners.delete(listener);
}

export function applyServerCreditState(payload) {
  if (!payload || typeof payload !== 'object') return snapshot;
  const next = {
    subscription: payload.subscription != null ? payload.subscription : snapshot?.subscription,
    plan: payload.plan != null ? payload.plan : snapshot?.plan,
  };
  if (!next.subscription && !next.plan) return snapshot;
  snapshot = next;
  epoch += 1;
  listeners.forEach((listener) => listener(snapshot));
  return snapshot;
}

export function configureAiCreditFetcher(fn) {
  fetchImpl = fn;
}

export async function refreshAiCredits() {
  if (typeof fetchImpl !== 'function') {
    return snapshot;
  }
  if (inflight) return inflight;
  const startedEpoch = epoch;
  const pending = Promise.resolve()
    .then(() => fetchImpl())
    .then((data) => {
      // Ignore GETs that finished after a newer server payload (analyse/402).
      if (epoch === startedEpoch) {
        applyServerCreditState(data);
      }
      return data;
    })
    .finally(() => {
      if (inflight === pending) inflight = null;
    });
  inflight = pending;
  return pending;
}

export function ingestAiHttpSuccess(response) {
  const config = response?.config || {};
  const data = response?.data;
  // GET /subscription is applied by refreshAiCredits with an epoch guard.
  // Applying it here would let a slow chrome GET overwrite a newer analyse payload.
  if (isSubscriptionGetRequest(config)) {
    return;
  }
  if (isCreditConsumingPostRequest(config) && data?.subscription) {
    applyServerCreditState({
      subscription: data.subscription,
      plan: data.plan,
    });
  }
}

export function ingestAiHttpError(error) {
  const status = error?.response?.status;
  const data = error?.response?.data;
  // 402 is not a consume. Apply canonical remaining credits from the error body
  // when the server already sent them. Do not GET-refresh or decrement locally.
  if (status !== 402 || data?.code !== 'INSUFFICIENT_CREDITS') return;
  if (data.subscription || data.plan) {
    applyServerCreditState({
      subscription: data.subscription,
      plan: data.plan,
    });
  }
}

export function resetAiCreditStateForTests() {
  snapshot = null;
  inflight = null;
  fetchImpl = null;
  epoch = 0;
  listeners.clear();
}
