/**
 * Shared applicability + methodology permission view.
 * Does not execute engines or invent substitute methodologies.
 */

const { ASSET_CLASS } = require('../../architecture/assetClassification');
const { DOMAIN_ID, platformRegistry } = require('../../architecture/domainRegistry');
const {
  DOMAIN_APPLICABILITY_VERSION,
  APPLICABILITY,
  VALUE_IDENTITY,
  evaluateDomainApplicability,
} = require('../../architecture/domainApplicability');
const { residentialMethodologyGate } = require('./assetClassificationRuntime');

const RESIDENTIAL_SALE_AVM = 'RESIDENTIAL_SALE_AVM';
const RESIDENTIAL_RENT = 'RESIDENTIAL_RENT';
const LEGACY_RESIDENTIAL_COMPATIBILITY = 'LEGACY_RESIDENTIAL_COMPATIBILITY';

function methodologyLists(domainId, assetClass) {
  const gate = residentialMethodologyGate({ assetClass });
  const permitted = [];
  const blocked = [];

  if (domainId === DOMAIN_ID.VALUATION) {
    if (gate.mode === 'RESIDENTIAL_SUPPORTED') permitted.push(RESIDENTIAL_SALE_AVM);
    else if (gate.mode === 'LEGACY_RESIDENTIAL_COMPATIBILITY') {
      permitted.push(LEGACY_RESIDENTIAL_COMPATIBILITY);
    } else blocked.push(RESIDENTIAL_SALE_AVM);
  }
  if (domainId === DOMAIN_ID.RENTAL) {
    if (gate.mode === 'RESIDENTIAL_SUPPORTED') permitted.push(RESIDENTIAL_RENT);
    else if (gate.mode === 'LEGACY_RESIDENTIAL_COMPATIBILITY') {
      permitted.push(LEGACY_RESIDENTIAL_COMPATIBILITY);
    } else blocked.push(RESIDENTIAL_RENT);
  }
  if (domainId === DOMAIN_ID.DEVELOPMENT || domainId === DOMAIN_ID.DEVELOPMENT_FEASIBILITY) {
    blocked.push(VALUE_IDENTITY.GDV, VALUE_IDENTITY.RESIDUAL_LAND_VALUE);
  }
  return { permittedMethodologies: permitted, blockedMethodologies: blocked, methodologyGate: gate };
}

function evaluatePlatformApplicability({
  assetClass = ASSET_CLASS.UNKNOWN,
  subjectKind = null,
  availableEvidence = [],
} = {}) {
  const cls = assetClass || ASSET_CLASS.UNKNOWN;
  const domains = {};
  platformRegistry.listDomainIds().forEach((domainId) => {
    const base = evaluateDomainApplicability({
      domainId,
      assetClass: cls,
      subjectKind,
      availableEvidence,
    });
    const methods = methodologyLists(domainId, cls);
    domains[domainId] = {
      ...base,
      permittedMethodologies: methods.permittedMethodologies,
      blockedMethodologies: methods.blockedMethodologies,
    };
  });
  return {
    version: DOMAIN_APPLICABILITY_VERSION,
    assetClass: cls,
    subjectKind,
    domains,
    residentialMethodology: residentialMethodologyGate({ assetClass: cls }),
  };
}

function methodologyIsPermitted(domainId, methodology, assetClass) {
  const lists = methodologyLists(domainId, assetClass);
  if (lists.blockedMethodologies.includes(methodology)) return false;
  if (!lists.permittedMethodologies.length) return lists.blockedMethodologies.length === 0;
  return lists.permittedMethodologies.includes(methodology);
}

module.exports = {
  APPLICABILITY,
  VALUE_IDENTITY,
  RESIDENTIAL_SALE_AVM,
  RESIDENTIAL_RENT,
  LEGACY_RESIDENTIAL_COMPATIBILITY,
  evaluatePlatformApplicability,
  methodologyIsPermitted,
};
