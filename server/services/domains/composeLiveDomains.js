/**
 * Compose already-built domain envelopes for the live report.
 * Does not adapt evidence or interpret domain findings.
 */

const { composeDomainOutputs, DOMAIN_ID } = require('../../architecture');

const LIVE_DOMAIN_ORDER = Object.freeze({
  [DOMAIN_ID.MARKET]: 1,
  [DOMAIN_ID.PLANNING]: 2,
  [DOMAIN_ID.ENVIRONMENT]: 3,
  [DOMAIN_ID.LEGAL_TITLE]: 4,
});

function composeLiveDomainEnvelopes(envelopes = []) {
  const byId = new Map();
  (envelopes || []).forEach((envelope) => {
    if (!envelope || !envelope.domain || byId.has(envelope.domain)) return;
    byId.set(envelope.domain, envelope);
  });
  const list = [...byId.values()].sort((a, b) => {
    const left = LIVE_DOMAIN_ORDER[a.domain] || 50;
    const right = LIVE_DOMAIN_ORDER[b.domain] || 50;
    if (left !== right) return left - right;
    return String(a.domain).localeCompare(String(b.domain));
  });
  return composeDomainOutputs(list);
}

module.exports = {
  LIVE_DOMAIN_ORDER,
  composeLiveDomainEnvelopes,
};
