/**
 * Extensible domain registry. Does not execute domain engines.
 * Duplicate IDs, unknown dependencies, and cycles are rejected.
 */

const {
  DOMAIN_REGISTRY_VERSION,
  PLANNING_DOMAIN_VERSION,
  ENVIRONMENT_DOMAIN_VERSION,
  LEGAL_TITLE_DOMAIN_VERSION,
  BUILDING_CONDITION_DOMAIN_VERSION,
  DEVELOPMENT_DOMAIN_VERSION,
  PROJECT_COST_DOMAIN_VERSION,
  MARKET_DOMAIN_VERSION,
} = require('./versions');
const { ASSET_CLASS } = require('./assetClassification');

const DATA_ACCESS = Object.freeze({
  DB_ONLY: 'DB_ONLY',
  OPEN_DATA: 'OPEN_DATA',
  LICENSED_PROVIDER: 'LICENSED_PROVIDER',
  USER_DOCUMENT: 'USER_DOCUMENT',
  DERIVED: 'DERIVED',
  MODEL_ASSISTED: 'MODEL_ASSISTED',
});

const IMPLEMENTATION_STATUS = Object.freeze({
  EXISTING: 'EXISTING',
  PARTIAL: 'PARTIAL',
  FUTURE: 'FUTURE',
});

const CAPABILITY = Object.freeze({
  SUPPORTED: 'SUPPORTED',
  CONDITIONAL: 'CONDITIONAL',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
  FUTURE: 'FUTURE',
  UNKNOWN: 'UNKNOWN',
});

const DOMAIN_ID = Object.freeze({
  IDENTITY: 'IDENTITY',
  MARKET: 'MARKET',
  VALUATION: 'VALUATION',
  RENTAL: 'RENTAL',
  FINANCE: 'FINANCE',
  LEGAL_TITLE: 'LEGAL_TITLE',
  PLANNING: 'PLANNING',
  ENVIRONMENT: 'ENVIRONMENT',
  BUILDING_CONDITION: 'BUILDING_CONDITION',
  MAINTENANCE_CAPEX: 'MAINTENANCE_CAPEX',
  DEVELOPMENT: 'DEVELOPMENT',
  PROJECT_COST: 'PROJECT_COST',
  DEVELOPMENT_FEASIBILITY: 'DEVELOPMENT_FEASIBILITY',
  PROJECT_MANAGEMENT: 'PROJECT_MANAGEMENT',
  ASSET_MANAGEMENT: 'ASSET_MANAGEMENT',
  PORTFOLIO: 'PORTFOLIO',
  DECISION: 'DECISION',
});

function createRegistry() {
  const domains = new Map();

  function registerDomain(def) {
    if (!def || !def.id) throw new Error('Domain definition requires id');
    if (domains.has(def.id)) throw new Error(`Duplicate domain id: ${def.id}`);
    if (!def.version) throw new Error(`Domain ${def.id} requires version`);
    domains.set(def.id, Object.freeze({
      id: def.id,
      version: def.version,
      implementationStatus: def.implementationStatus || IMPLEMENTATION_STATUS.FUTURE,
      supportedAssetClasses: Object.freeze(def.supportedAssetClasses || {}),
      requiredEvidence: Object.freeze(def.requiredEvidence || []),
      optionalEvidence: Object.freeze(def.optionalEvidence || []),
      dependencies: Object.freeze(def.dependencies || []),
      dataAccess: Object.freeze(def.dataAccess || [DATA_ACCESS.DB_ONLY]),
      mayIncurProviderCost: Boolean(def.mayIncurProviderCost),
      deterministicCalculations: Boolean(def.deterministicCalculations),
      llmExplanationAllowed: def.llmExplanationAllowed !== false,
      llmAuthoritative: false,
      wiredIntoLiveAnalysis: def.wiredIntoLiveAnalysis === true,
    }));
    return domains.get(def.id);
  }

  function getDomain(id) {
    return domains.get(id) || null;
  }

  function listDomainIds() {
    return [...domains.keys()].sort();
  }

  function assertDependencies() {
    for (const def of domains.values()) {
      def.dependencies.forEach((dep) => {
        if (!domains.has(dep)) {
          throw new Error(`Domain ${def.id} depends on unknown domain ${dep}`);
        }
      });
    }
  }

  function detectCycles() {
    const visiting = new Set();
    const visited = new Set();

    function visit(id, stack) {
      if (visiting.has(id)) {
        throw new Error(`Domain dependency cycle: ${[...stack, id].join(' -> ')}`);
      }
      if (visited.has(id)) return;
      visiting.add(id);
      const def = domains.get(id);
      (def?.dependencies || []).forEach((dep) => visit(dep, [...stack, id]));
      visiting.delete(id);
      visited.add(id);
    }

    listDomainIds().forEach((id) => visit(id, []));
  }

  function finalize() {
    assertDependencies();
    detectCycles();
    return true;
  }

  return {
    registerDomain,
    getDomain,
    listDomainIds,
    assertDependencies,
    detectCycles,
    finalize,
    _domains: domains,
  };
}

const all = Object.values(ASSET_CLASS).filter((c) => c !== ASSET_CLASS.UNKNOWN);
function capabilityMap(spec) {
  const map = {};
  all.forEach((cls) => {
    map[cls] = spec[cls] || spec.default || CAPABILITY.UNKNOWN;
  });
  return map;
}

function buildPlatformRegistry() {
  const registry = createRegistry();

  registry.registerDomain({
    id: DOMAIN_ID.IDENTITY,
    version: 'identity-1.0.0',
    implementationStatus: IMPLEMENTATION_STATUS.PARTIAL,
    dependencies: [],
    dataAccess: [DATA_ACCESS.DB_ONLY, DATA_ACCESS.LICENSED_PROVIDER],
    mayIncurProviderCost: true,
    deterministicCalculations: false,
    supportedAssetClasses: capabilityMap({ default: CAPABILITY.SUPPORTED }),
  });

  registry.registerDomain({
    id: DOMAIN_ID.MARKET,
    version: MARKET_DOMAIN_VERSION,
    implementationStatus: IMPLEMENTATION_STATUS.PARTIAL,
    dependencies: [DOMAIN_ID.IDENTITY],
    dataAccess: [DATA_ACCESS.DB_ONLY, DATA_ACCESS.LICENSED_PROVIDER, DATA_ACCESS.OPEN_DATA],
    mayIncurProviderCost: true,
    deterministicCalculations: true,
    wiredIntoLiveAnalysis: true,
    supportedAssetClasses: capabilityMap({
      RESIDENTIAL: CAPABILITY.SUPPORTED,
      default: CAPABILITY.CONDITIONAL,
    }),
  });

  registry.registerDomain({
    id: DOMAIN_ID.VALUATION,
    version: 'valuation-residential-current',
    implementationStatus: IMPLEMENTATION_STATUS.EXISTING,
    dependencies: [DOMAIN_ID.IDENTITY, DOMAIN_ID.MARKET],
    dataAccess: [DATA_ACCESS.DB_ONLY, DATA_ACCESS.LICENSED_PROVIDER, DATA_ACCESS.DERIVED],
    mayIncurProviderCost: true,
    deterministicCalculations: true,
    supportedAssetClasses: capabilityMap({
      RESIDENTIAL: CAPABILITY.SUPPORTED,
      default: CAPABILITY.FUTURE,
    }),
  });

  registry.registerDomain({
    id: DOMAIN_ID.RENTAL,
    version: 'rental-1.0.0',
    implementationStatus: IMPLEMENTATION_STATUS.EXISTING,
    dependencies: [DOMAIN_ID.IDENTITY, DOMAIN_ID.MARKET],
    dataAccess: [DATA_ACCESS.DB_ONLY, DATA_ACCESS.LICENSED_PROVIDER, DATA_ACCESS.DERIVED],
    mayIncurProviderCost: true,
    deterministicCalculations: true,
    supportedAssetClasses: capabilityMap({
      RESIDENTIAL: CAPABILITY.SUPPORTED,
      COMMERCIAL: CAPABILITY.FUTURE,
      INDUSTRIAL: CAPABILITY.CONDITIONAL,
      AGRICULTURAL: CAPABILITY.CONDITIONAL,
      LAND: CAPABILITY.NOT_APPLICABLE,
      DEVELOPMENT_SITE: CAPABILITY.NOT_APPLICABLE,
      MIXED_USE: CAPABILITY.CONDITIONAL,
    }),
  });

  registry.registerDomain({
    id: DOMAIN_ID.FINANCE,
    version: 'finance-semantic-1.0.0',
    implementationStatus: IMPLEMENTATION_STATUS.EXISTING,
    dependencies: [DOMAIN_ID.IDENTITY],
    dataAccess: [DATA_ACCESS.USER_DOCUMENT, DATA_ACCESS.DERIVED, DATA_ACCESS.DB_ONLY],
    mayIncurProviderCost: false,
    deterministicCalculations: true,
    supportedAssetClasses: capabilityMap({
      RESIDENTIAL: CAPABILITY.SUPPORTED,
      default: CAPABILITY.CONDITIONAL,
    }),
  });

  registry.registerDomain({
    id: DOMAIN_ID.LEGAL_TITLE,
    version: LEGAL_TITLE_DOMAIN_VERSION,
    implementationStatus: IMPLEMENTATION_STATUS.PARTIAL,
    dependencies: [DOMAIN_ID.IDENTITY],
    dataAccess: [DATA_ACCESS.USER_DOCUMENT, DATA_ACCESS.DB_ONLY],
    mayIncurProviderCost: false,
    deterministicCalculations: true,
    wiredIntoLiveAnalysis: true,
    supportedAssetClasses: capabilityMap({ default: CAPABILITY.CONDITIONAL }),
  });

  registry.registerDomain({
    id: DOMAIN_ID.PLANNING,
    version: PLANNING_DOMAIN_VERSION,
    implementationStatus: IMPLEMENTATION_STATUS.EXISTING,
    dependencies: [DOMAIN_ID.IDENTITY],
    dataAccess: [DATA_ACCESS.OPEN_DATA],
    mayIncurProviderCost: false,
    deterministicCalculations: true,
    wiredIntoLiveAnalysis: true,
    supportedAssetClasses: capabilityMap({ default: CAPABILITY.SUPPORTED }),
  });

  registry.registerDomain({
    id: DOMAIN_ID.ENVIRONMENT,
    version: ENVIRONMENT_DOMAIN_VERSION,
    implementationStatus: IMPLEMENTATION_STATUS.EXISTING,
    dependencies: [DOMAIN_ID.IDENTITY],
    dataAccess: [DATA_ACCESS.OPEN_DATA],
    mayIncurProviderCost: false,
    deterministicCalculations: true,
    wiredIntoLiveAnalysis: true,
    supportedAssetClasses: capabilityMap({ default: CAPABILITY.SUPPORTED }),
  });

  registry.registerDomain({
    id: DOMAIN_ID.BUILDING_CONDITION,
    version: BUILDING_CONDITION_DOMAIN_VERSION,
    implementationStatus: IMPLEMENTATION_STATUS.PARTIAL,
    dependencies: [DOMAIN_ID.IDENTITY],
    dataAccess: [DATA_ACCESS.USER_DOCUMENT, DATA_ACCESS.LICENSED_PROVIDER, DATA_ACCESS.DB_ONLY],
    mayIncurProviderCost: false,
    deterministicCalculations: true,
    wiredIntoLiveAnalysis: false,
    supportedAssetClasses: capabilityMap({
      LAND: CAPABILITY.NOT_APPLICABLE,
      AGRICULTURAL: CAPABILITY.CONDITIONAL,
      DEVELOPMENT_SITE: CAPABILITY.CONDITIONAL,
      default: CAPABILITY.CONDITIONAL,
    }),
  });

  registry.registerDomain({
    id: DOMAIN_ID.MAINTENANCE_CAPEX,
    version: 'maintenance-capex-0.0.0',
    implementationStatus: IMPLEMENTATION_STATUS.FUTURE,
    dependencies: [DOMAIN_ID.BUILDING_CONDITION],
    dataAccess: [DATA_ACCESS.USER_DOCUMENT, DATA_ACCESS.DERIVED],
    mayIncurProviderCost: false,
    deterministicCalculations: true,
    supportedAssetClasses: capabilityMap({
      LAND: CAPABILITY.NOT_APPLICABLE,
      default: CAPABILITY.FUTURE,
    }),
  });

  registry.registerDomain({
    id: DOMAIN_ID.DEVELOPMENT,
    version: DEVELOPMENT_DOMAIN_VERSION,
    implementationStatus: IMPLEMENTATION_STATUS.PARTIAL,
    dependencies: [DOMAIN_ID.IDENTITY, DOMAIN_ID.PLANNING],
    dataAccess: [DATA_ACCESS.USER_DOCUMENT, DATA_ACCESS.DB_ONLY],
    mayIncurProviderCost: false,
    deterministicCalculations: true,
    wiredIntoLiveAnalysis: false,
    supportedAssetClasses: capabilityMap({
      DEVELOPMENT_SITE: CAPABILITY.CONDITIONAL,
      LAND: CAPABILITY.CONDITIONAL,
      MIXED_USE: CAPABILITY.CONDITIONAL,
      default: CAPABILITY.CONDITIONAL,
    }),
  });

  registry.registerDomain({
    id: DOMAIN_ID.PROJECT_COST,
    version: PROJECT_COST_DOMAIN_VERSION,
    implementationStatus: IMPLEMENTATION_STATUS.PARTIAL,
    dependencies: [DOMAIN_ID.IDENTITY, DOMAIN_ID.DEVELOPMENT],
    dataAccess: [DATA_ACCESS.USER_DOCUMENT, DATA_ACCESS.DERIVED],
    mayIncurProviderCost: false,
    deterministicCalculations: true,
    wiredIntoLiveAnalysis: false,
    supportedAssetClasses: capabilityMap({
      DEVELOPMENT_SITE: CAPABILITY.CONDITIONAL,
      LAND: CAPABILITY.CONDITIONAL,
      MIXED_USE: CAPABILITY.CONDITIONAL,
      default: CAPABILITY.CONDITIONAL,
    }),
  });

  registry.registerDomain({
    id: DOMAIN_ID.DEVELOPMENT_FEASIBILITY,
    version: 'development-feasibility-0.0.0',
    implementationStatus: IMPLEMENTATION_STATUS.FUTURE,
    dependencies: [DOMAIN_ID.DEVELOPMENT, DOMAIN_ID.PLANNING, DOMAIN_ID.PROJECT_COST, DOMAIN_ID.VALUATION, DOMAIN_ID.FINANCE],
    dataAccess: [DATA_ACCESS.DERIVED, DATA_ACCESS.USER_DOCUMENT],
    mayIncurProviderCost: false,
    deterministicCalculations: true,
    supportedAssetClasses: capabilityMap({
      DEVELOPMENT_SITE: CAPABILITY.FUTURE,
      LAND: CAPABILITY.CONDITIONAL,
      default: CAPABILITY.CONDITIONAL,
    }),
  });

  registry.registerDomain({
    id: DOMAIN_ID.PROJECT_MANAGEMENT,
    version: 'project-management-0.0.0',
    implementationStatus: IMPLEMENTATION_STATUS.FUTURE,
    dependencies: [DOMAIN_ID.DEVELOPMENT, DOMAIN_ID.PROJECT_COST, DOMAIN_ID.PLANNING, DOMAIN_ID.BUILDING_CONDITION],
    dataAccess: [DATA_ACCESS.USER_DOCUMENT, DATA_ACCESS.DERIVED],
    mayIncurProviderCost: false,
    deterministicCalculations: false,
    supportedAssetClasses: capabilityMap({
      DEVELOPMENT_SITE: CAPABILITY.FUTURE,
      default: CAPABILITY.FUTURE,
    }),
  });

  registry.registerDomain({
    id: DOMAIN_ID.ASSET_MANAGEMENT,
    version: 'asset-management-0.0.0',
    implementationStatus: IMPLEMENTATION_STATUS.FUTURE,
    dependencies: [DOMAIN_ID.IDENTITY, DOMAIN_ID.FINANCE, DOMAIN_ID.RENTAL],
    dataAccess: [DATA_ACCESS.USER_DOCUMENT, DATA_ACCESS.DERIVED, DATA_ACCESS.DB_ONLY],
    mayIncurProviderCost: false,
    deterministicCalculations: true,
    supportedAssetClasses: capabilityMap({ default: CAPABILITY.FUTURE }),
  });

  registry.registerDomain({
    id: DOMAIN_ID.PORTFOLIO,
    version: 'portfolio-optimiser-v1',
    implementationStatus: IMPLEMENTATION_STATUS.PARTIAL,
    dependencies: [DOMAIN_ID.VALUATION, DOMAIN_ID.RENTAL, DOMAIN_ID.FINANCE],
    dataAccess: [DATA_ACCESS.DB_ONLY, DATA_ACCESS.DERIVED],
    mayIncurProviderCost: false,
    deterministicCalculations: true,
    supportedAssetClasses: capabilityMap({
      RESIDENTIAL: CAPABILITY.CONDITIONAL,
      default: CAPABILITY.FUTURE,
    }),
  });

  registry.registerDomain({
    id: DOMAIN_ID.DECISION,
    version: 'decision-intelligence-1.0.0',
    implementationStatus: IMPLEMENTATION_STATUS.EXISTING,
    dependencies: [],
    dataAccess: [DATA_ACCESS.DERIVED],
    mayIncurProviderCost: false,
    deterministicCalculations: true,
    llmExplanationAllowed: true,
    supportedAssetClasses: capabilityMap({
      RESIDENTIAL: CAPABILITY.SUPPORTED,
      default: CAPABILITY.FUTURE,
    }),
  });

  registry.finalize();
  return registry;
}

const platformRegistry = buildPlatformRegistry();

function capabilityFor(domainId, assetClass) {
  const domain = platformRegistry.getDomain(domainId);
  if (!domain) return CAPABILITY.UNKNOWN;
  return domain.supportedAssetClasses[assetClass] || CAPABILITY.UNKNOWN;
}

module.exports = {
  DOMAIN_REGISTRY_VERSION,
  DOMAIN_ID,
  DATA_ACCESS,
  IMPLEMENTATION_STATUS,
  CAPABILITY,
  createRegistry,
  buildPlatformRegistry,
  platformRegistry,
  capabilityFor,
};
