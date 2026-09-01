/** Client-side lookup/resolve dispatch guard. Does not call the network. */

export const LOOKUP_MIN_QUERY_LENGTH = 3;

export function canStartLookup({ inFlight = false, query = '', minLength = LOOKUP_MIN_QUERY_LENGTH } = {}) {
  if (inFlight) return { ok: false, reason: 'in_flight' };
  if (String(query || '').trim().length < minLength) return { ok: false, reason: 'too_short' };
  return { ok: true };
}

export function canStartResolve({ inFlight = false, uprn } = {}) {
  if (inFlight) return { ok: false, reason: 'in_flight' };
  if (!uprn) return { ok: false, reason: 'missing_uprn' };
  return { ok: true };
}
