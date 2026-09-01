/**
 * Property Intelligence Platform kernel versions.
 * Additive V1.2 contracts. Existing production versions keep their meaning.
 */

const KERNEL_VERSION = 'property-intelligence-kernel-1.0.0';
const ASSET_CLASSIFICATION_VERSION = 'asset-classification-1.0.0';
const EVIDENCE_CONTRACT_VERSION = 'evidence-contract-1.0.0';
const DOMAIN_REGISTRY_VERSION = 'domain-registry-1.0.0';
const DOMAIN_ENVELOPE_VERSION = 'domain-envelope-1.0.0';
const PLANNING_DOMAIN_VERSION = 'planning-domain-1.0.0';
const ENVIRONMENT_DOMAIN_VERSION = 'environment-domain-1.0.0';
const LEGAL_TITLE_DOMAIN_VERSION = 'legal-title-domain-0.1.0';
const BUILDING_CONDITION_DOMAIN_VERSION = 'building-condition-domain-0.1.0';
const DEVELOPMENT_PROJECT_CONTRACT_VERSION = 'development-project-contract-0.1.0';
const DEVELOPMENT_DOMAIN_VERSION = 'development-domain-0.1.0';
const PROJECT_COST_CONTRACT_VERSION = 'project-cost-contract-0.1.0';
const PROJECT_COST_DOMAIN_VERSION = 'project-cost-domain-0.1.0';
const PRIVATE_EVIDENCE_CONTRACT_VERSION = 'private-evidence-contract-0.1.1';
const DOMAIN_APPLICABILITY_VERSION = 'domain-applicability-1.0.0';
const MARKET_DOMAIN_VERSION = 'market-domain-1.0.0';
const OFFICIAL_SALE_TRANSACTION_VERSION = 'official-sale-transaction-1.0.0';
const CANONICAL_IDENTITY_VERSION = 'canonical-subject-identity-1.0.0';

/** Frozen historical versions — do not rename or reuse. */
const FROZEN_PRODUCTION_VERSIONS = Object.freeze({
  propertyIntelligence: 'property-intelligence-v2',
  propertyIntelligenceV11: 'property-intelligence-v1.1',
  assessmentSafety: 'assessment-safety-1.0.0',
  financeInput: 'finance-input-1.0.0',
  financeSemantic: 'finance-semantic-1.0.0',
  propertyFacts: 'property-facts-1.1.0',
  confidence: 'confidence-1.1.0',
  decisionIntelligence: 'decision-intelligence-1.0.0',
  personalDecision: 'personal-decision-1.0.0',
  backtestFoundation: 'backtest-foundation-1.0.0',
});

module.exports = {
  KERNEL_VERSION,
  ASSET_CLASSIFICATION_VERSION,
  EVIDENCE_CONTRACT_VERSION,
  DOMAIN_REGISTRY_VERSION,
  DOMAIN_ENVELOPE_VERSION,
  PLANNING_DOMAIN_VERSION,
  ENVIRONMENT_DOMAIN_VERSION,
  LEGAL_TITLE_DOMAIN_VERSION,
  BUILDING_CONDITION_DOMAIN_VERSION,
  DEVELOPMENT_PROJECT_CONTRACT_VERSION,
  DEVELOPMENT_DOMAIN_VERSION,
  PROJECT_COST_CONTRACT_VERSION,
  PROJECT_COST_DOMAIN_VERSION,
  PRIVATE_EVIDENCE_CONTRACT_VERSION,
  DOMAIN_APPLICABILITY_VERSION,
  MARKET_DOMAIN_VERSION,
  OFFICIAL_SALE_TRANSACTION_VERSION,
  CANONICAL_IDENTITY_VERSION,
  FROZEN_PRODUCTION_VERSIONS,
};
