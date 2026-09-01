/**
 * Domain applicability is not an assessment state.
 * A domain may be applicable and still NOT_ASSESSED.
 */

const { DOMAIN_APPLICABILITY_VERSION } = require('./versions');
const { ASSET_CLASS } = require('./assetClassification');
const { DOMAIN_ID, CAPABILITY, platformRegistry, capabilityFor } = require('./domainRegistry');

const APPLICABILITY = Object.freeze({
  APPLICABLE: 'APPLICABLE',
  CONDITIONALLY_APPLICABLE: 'CONDITIONALLY_APPLICABLE',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
  UNKNOWN: 'UNKNOWN',
});

const VALUE_IDENTITY = Object.freeze({
  CURRENT_VALUE: 'CURRENT_VALUE',
  AS_IS_VALUE: 'AS_IS_VALUE',
  PROPOSED_VALUE: 'PROPOSED_VALUE',
  COMPLETED_VALUE: 'COMPLETED_VALUE',
  GDV: 'GDV',
  RESIDUAL_LAND_VALUE: 'RESIDUAL_LAND_VALUE',
  USER_ASSUMPTION: 'USER_ASSUMPTION',
  SCENARIO_VALUE: 'SCENARIO_VALUE',
});

function mapRegistryCapability(capability) {
  if (capability === CAPABILITY.SUPPORTED) return APPLICABILITY.APPLICABLE;
  if (capability === CAPABILITY.CONDITIONAL) return APPLICABILITY.CONDITIONALLY_APPLICABLE;
  if (capability === CAPABILITY.NOT_APPLICABLE) return APPLICABILITY.NOT_APPLICABLE;
  if (capability === CAPABILITY.FUTURE) return APPLICABILITY.UNKNOWN;
  return APPLICABILITY.UNKNOWN;
}

function evaluateDomainApplicability({
  domainId,
  assetClass = ASSET_CLASS.UNKNOWN,
  subjectKind = null,
  availableEvidence = [],
} = {}) {
  const domain = platformRegistry.getDomain(domainId);
  const capability = capabilityFor(domainId, assetClass);
  const applicability = domain ? mapRegistryCapability(capability) : APPLICABILITY.UNKNOWN;
  const requiredEvidence = domain ? [...domain.requiredEvidence] : [];
  const available = Array.isArray(availableEvidence) ? availableEvidence.filter(Boolean) : [];
  return {
    domain: domainId,
    assetClass,
    subjectKind,
    applicability,
    capability,
    reason: domain
      ? `Registry capability ${capability} for ${assetClass}.`
      : 'Unknown domain.',
    requiredEvidence,
    availableEvidence: available,
    version: DOMAIN_APPLICABILITY_VERSION,
    wiredIntoLiveAnalysis: Boolean(domain?.wiredIntoLiveAnalysis),
    implementationStatus: domain?.implementationStatus || 'UNKNOWN',
  };
}

module.exports = {
  DOMAIN_APPLICABILITY_VERSION,
  APPLICABILITY,
  VALUE_IDENTITY,
  mapRegistryCapability,
  evaluateDomainApplicability,
  DOMAIN_ID,
};
