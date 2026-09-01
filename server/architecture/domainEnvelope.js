/**
 * Standard envelope for future domain engines.
 * Not a migration of current valuation/finance result shapes.
 */

const { DOMAIN_ENVELOPE_VERSION } = require('./versions');
const { DOMAIN_STATUS } = require('./assessmentStates');

function createDomainEnvelope(input = {}) {
  if (!input.domain) throw new Error('Envelope requires domain');
  if (!input.version) throw new Error('Envelope requires domain version');
  const status = input.status || DOMAIN_STATUS.NOT_ASSESSED;
  if (!DOMAIN_STATUS[status]) throw new Error('Unknown domain status');

  return {
    domain: input.domain,
    version: input.version,
    subject: input.subject || null,
    status,
    evidenceAsOf: input.evidenceAsOf || null,
    analysisAt: input.analysisAt || null,
    assessment: input.assessment || null,
    findings: Array.isArray(input.findings) ? input.findings : [],
    evidence: Array.isArray(input.evidence) ? input.evidence : [],
    limitations: Array.isArray(input.limitations) ? input.limitations : [],
    unresolvedDependencies: Array.isArray(input.unresolvedDependencies)
      ? input.unresolvedDependencies
      : [],
    investigationPriorities: Array.isArray(input.investigationPriorities)
      ? input.investigationPriorities
      : [],
    provenance: input.provenance || null,
    envelopeVersion: DOMAIN_ENVELOPE_VERSION,
  };
}

/**
 * Compose domain envelopes without letting one failure erase others.
 */
function composeDomainOutputs(envelopes = []) {
  const list = (envelopes || []).filter(Boolean);
  return {
    domains: list,
    byId: Object.fromEntries(list.map((e) => [e.domain, e])),
    available: list.filter((e) => e.status === DOMAIN_STATUS.AVAILABLE || e.status === DOMAIN_STATUS.PARTIAL),
    notAssessed: list.filter((e) => e.status === DOMAIN_STATUS.NOT_ASSESSED),
    unavailable: list.filter((e) => e.status === DOMAIN_STATUS.UNAVAILABLE),
  };
}

function historicalReportIsReadable(report) {
  if (!report || typeof report !== 'object') return false;
  const version = report.modelVersion || report.engineVersion || report.version;
  if (!version) return false;
  return Boolean(
    report.investment
      || report.personalDecision
      || report.decisionIntelligence
      || report.marketIntelligence
      || report.propertyFacts
      || report.metrics
  );
}

module.exports = {
  DOMAIN_ENVELOPE_VERSION,
  createDomainEnvelope,
  composeDomainOutputs,
  historicalReportIsReadable,
};
