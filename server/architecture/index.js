/**
 * Property Intelligence Platform kernel (V1.2 foundation).
 * Additive contracts. Live engines import selected primitives only.
 */

const versions = require('./versions');
const assetClassification = require('./assetClassification');
const identityModel = require('./identityModel');
const units = require('./units');
const evidenceContract = require('./evidenceContract');
const assessmentStates = require('./assessmentStates');
const privacyBoundary = require('./privacyBoundary');
const domainEnvelope = require('./domainEnvelope');
const domainRegistry = require('./domainRegistry');
const decisionContribution = require('./decisionContribution');
const legalTitleContract = require('./legalTitleContract');
const buildingConditionContract = require('./buildingConditionContract');
const developmentProjectContract = require('./developmentProjectContract');
const projectCostContract = require('./projectCostContract');
const privateEvidenceContract = require('./privateEvidenceContract');
const legalEvidenceTypes = require('./legalEvidenceTypes');
const domainApplicability = require('./domainApplicability');
const officialSaleTransaction = require('./officialSaleTransaction');
const canonicalIdentity = require('./canonicalIdentity');

module.exports = {
  ...versions,
  ...assetClassification,
  ...identityModel,
  ...canonicalIdentity,
  ...units,
  ...evidenceContract,
  ...assessmentStates,
  ...privacyBoundary,
  ...domainEnvelope,
  ...domainRegistry,
  ...decisionContribution,
  ...legalTitleContract,
  ...buildingConditionContract,
  ...developmentProjectContract,
  ...projectCostContract,
  ...privateEvidenceContract,
  ...legalEvidenceTypes,
  ...domainApplicability,
  ...officialSaleTransaction,
};
