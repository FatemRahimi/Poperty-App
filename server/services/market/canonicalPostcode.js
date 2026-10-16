/**
 * Strict postcode identity for official geography lookup.
 * Invalid input does not receive a guessed spacing or another postcode.
 * Listing display normalisation in ukAddress.js is a separate helper.
 */

function canonicalPostcode(input) {
  if (input == null) return { ok: false, normalized: null, compact: null, reason: 'empty' };
  const trimmed = String(input).replace(/[\u00A0\u2007\u202F]/g, ' ').trim();
  if (!trimmed) return { ok: false, normalized: null, compact: null, reason: 'empty' };
  const compact = trimmed.toUpperCase().replace(/\s+/g, '');
  if (!/^[A-Z0-9]+$/.test(compact) || compact.length < 5 || compact.length > 7) {
    return { ok: false, normalized: null, compact: null, reason: 'invalid' };
  }
  const inward = compact.slice(-3);
  const outward = compact.slice(0, -3);
  if (!/^\d[A-Z]{2}$/.test(inward) || !/^[A-Z]{1,2}\d[A-Z0-9]?$/.test(outward)) {
    return { ok: false, normalized: null, compact: null, reason: 'invalid' };
  }
  return {
    ok: true,
    normalized: `${outward} ${inward}`,
    compact,
    reason: null,
  };
}

module.exports = {
  canonicalPostcode,
};
