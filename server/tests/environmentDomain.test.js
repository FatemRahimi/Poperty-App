/**
 * Environment domain envelope — flood evidence only.
 * Run: node server/tests/environmentDomain.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  DOMAIN_ID,
  DOMAIN_STATUS,
  KERNEL_ASSESSMENT,
  EVIDENCE_CLASS,
  SPATIAL_RELATION,
  ENVIRONMENT_DOMAIN_VERSION,
  PLANNING_DOMAIN_VERSION,
  platformRegistry,
  historicalReportIsReadable,
  ASSET_CLASS,
  capabilityFor,
  CAPABILITY,
} = require('../architecture');
const {
  adaptEnvironmentDomain,
  attachEnvironmentDomain,
} = require('../services/domains/environmentDomain');
const { adaptPlanningDomain } = require('../services/domains/planningDomain');
const { composeLiveDomainEnvelopes } = require('../services/domains/composeLiveDomains');
const {
  assessedFlood,
  notAssessedFlood,
  sanitizeFloodFact,
  UNAVAILABLE_REASONS,
} = require('../services/ai/floodEvidence');
const { assessedPlanning } = require('../services/ai/planningEvidence');
const { assemblePropertyIntelligenceReport } = require('../services/ai/propertyIntelligenceEngine');

function test(name, fn) {
  const result = fn();
  if (result && typeof result.then === 'function') {
    throw new Error(`Use asyncTest for ${name}`);
  }
  console.log(`  ok  ${name}`);
}

const pending = [];
function asyncTest(name, fn) {
  pending.push({ name, fn });
}

function read(rel) {
  return fs.readFileSync(path.join(__dirname, rel), 'utf8');
}

function identity() {
  return { listingId: 12, subjectId: null, uprn: '10001233621', latitude: 51.5, longitude: -0.12 };
}

function zoneFact(zone = 3) {
  return assessedFlood({
    zone,
    layersMatched: [zone === 3 ? 'Flood Zone 3' : 'Flood Zone 2'],
    retrievedAt: '2026-08-01T10:00:00.000Z',
    identity: identity(),
    attributes: [{ layer: zone === 3 ? 'Flood Zone 3' : 'Flood Zone 2', type: 'Flood Zone' }],
  });
}

function listing(overrides = {}) {
  return {
    id: 12,
    title: 'Environment envelope fixture',
    category: 'sale',
    property_type: 'terraced',
    price: 200000,
    monthly_rent: 1000,
    city: 'Manchester',
    zip_code: 'M1 1AA',
    latitude: 51.5,
    longitude: -0.12,
    ...overrides,
  };
}

function access() {
  return {
    allowed: true,
    userId: 1,
    role: 'owner',
    relationship: 'owner',
    accessLevel: 'professional_intelligence',
    propertyId: 12,
  };
}

function deps({ floodStub, planningStub } = {}) {
  return {
    analyseRent: async () => ({
      success: true,
      recommendedRent: 1100,
      marketRange: { low: 1000, high: 1200 },
      comparables: [],
    }),
    calculatePropertyValuation: async () => ({
      success: true,
      centralEstimate: 195000,
      assessmentState: 'assessed',
    }),
    generatePropertyExplanation: async () => ({ summary: 'template', source: 'template', tokensUsed: 0 }),
    getFloodEvidence: floodStub || (async () => zoneFact(3)),
    getPlanningEvidence: planningStub || (async () => assessedPlanning({
      subjectApplications: [],
      nearbyApplications: [],
      retrievedAt: '2026-08-01T10:00:00.000Z',
      identity: identity(),
      radiusMetres: 400,
      queryKind: 'geometry',
    })),
  };
}

async function analyse({ propertyOverrides = {}, floodStub, planningStub, options = {} } = {}) {
  return assemblePropertyIntelligenceReport({
    property: listing(propertyOverrides),
    access: access(),
    userId: 1,
    target: { propertyId: 12 },
    options: {
      skipExplanation: true,
      skipPostcodeMarket: true,
      skipSchools: true,
      skipListedBuilding: true,
      skipConservationArea: true,
      skipArticle4: true,
      asOf: '2026-08-30T00:00:00.000Z',
      deps: deps({ floodStub, planningStub }),
      ...options,
    },
  });
}

console.log('environment domain envelope\n');

test('1. ENVIRONMENT domain ID stable', () => {
  assert.strictEqual(DOMAIN_ID.ENVIRONMENT, 'ENVIRONMENT');
  assert.ok(platformRegistry.getDomain(DOMAIN_ID.ENVIRONMENT));
});

test('2. environment version explicit', () => {
  assert.strictEqual(ENVIRONMENT_DOMAIN_VERSION, 'environment-domain-1.0.0');
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.ENVIRONMENT).version, ENVIRONMENT_DOMAIN_VERSION);
});

test('3-7. envelope validates and preserves provenance/time', () => {
  const { envelope } = adaptEnvironmentDomain({
    floodEvidence: zoneFact(3),
    identity: identity(),
    assetClassification: { assetClass: ASSET_CLASS.RESIDENTIAL },
    analysisAt: '2026-08-30T00:00:00.000Z',
  });
  assert.strictEqual(envelope.domain, 'ENVIRONMENT');
  assert.strictEqual(envelope.version, ENVIRONMENT_DOMAIN_VERSION);
  assert.strictEqual(envelope.status, DOMAIN_STATUS.AVAILABLE);
  assert.strictEqual(envelope.assessment.state, KERNEL_ASSESSMENT.ASSESSED);
  assert.strictEqual(envelope.assessment.sourcedZone, 'Flood Zone 3');
  assert.strictEqual(envelope.provenance.source, 'EnvironmentAgency_FloodMapForPlanning');
  assert.strictEqual(envelope.provenance.retrievedAt, '2026-08-01T10:00:00.000Z');
  assert.strictEqual(envelope.evidenceAsOf, '2026-08-01T10:00:00.000Z');
  assert.strictEqual(envelope.evidence[0].retrievedAt, '2026-08-01T10:00:00.000Z');
  assert.strictEqual(envelope.evidence[0].evidenceAsOf, '2026-08-01T10:00:00.000Z');
});

test('8. missing coords → not assessed', () => {
  const { envelope } = adaptEnvironmentDomain({
    floodEvidence: notAssessedFlood({
      reason: UNAVAILABLE_REASONS.locationUnavailable,
      note: 'No coordinates',
    }),
    identity: identity(),
  });
  assert.strictEqual(envelope.status, DOMAIN_STATUS.NOT_ASSESSED);
  assert.strictEqual(envelope.assessment.state, KERNEL_ASSESSMENT.INSUFFICIENT_EVIDENCE);
});

test('9. source unavailable → UNAVAILABLE', () => {
  const { envelope } = adaptEnvironmentDomain({
    floodEvidence: notAssessedFlood({
      reason: UNAVAILABLE_REASONS.providerUnavailable,
      retrievedAt: '2026-08-01T10:00:00.000Z',
    }),
    identity: identity(),
  });
  assert.strictEqual(envelope.status, DOMAIN_STATUS.UNAVAILABLE);
  assert.strictEqual(envelope.assessment.state, KERNEL_ASSESSMENT.UNAVAILABLE);
});

test('10. malformed evidence degrades safely', () => {
  const attached = attachEnvironmentDomain({ floodEvidence: 'not-an-object', identity: identity() });
  assert.strictEqual(attached.environmentDomain.domain, 'ENVIRONMENT');
  assert.ok(attached.environmentDomain.status);
});

test('11. intersection retains INTERSECTS spatial semantics', () => {
  const { envelope } = adaptEnvironmentDomain({
    floodEvidence: zoneFact(2),
    identity: identity(),
  });
  assert.strictEqual(envelope.evidence[0].spatialRelation, SPATIAL_RELATION.INTERSECTS);
  assert.strictEqual(envelope.evidence[0].classification, EVIDENCE_CLASS.FACT);
  assert.strictEqual(envelope.evidence[0].value, 'Flood Zone 2');
});

test('12. no-intersection does not become no flood risk', () => {
  const { envelope } = adaptEnvironmentDomain({
    floodEvidence: notAssessedFlood({
      reason: UNAVAILABLE_REASONS.noApplicableEvidence,
      retrievedAt: '2026-08-01T10:00:00.000Z',
      identity: identity(),
      note: 'No Zone 2 or 3. That is not no flood risk.',
    }),
    identity: identity(),
  });
  assert.strictEqual(envelope.status, DOMAIN_STATUS.PARTIAL);
  assert.strictEqual(envelope.assessment.state, KERNEL_ASSESSMENT.ASSESSED);
  assert.strictEqual(envelope.assessment.noIntersectionIsNotNoFloodRisk, true);
  assert.ok(envelope.findings.some((row) => row.id === 'no_intersection_in_configured_dataset'));
  const blob = JSON.stringify(envelope);
  assert.ok(!/property will not flood|safe rating|Flood Zone 1/i.test(blob));
  assert.ok(!envelope.findings.some((row) => /^no flood risk$/i.test(row.text)));
});

test('13-19. category, probability, insurance, mortgage, valuation, legal, climate are not invented', () => {
  const { envelope, contribution } = adaptEnvironmentDomain({
    floodEvidence: zoneFact(3),
    identity: identity(),
  });
  const blob = JSON.stringify({ envelope, contribution });
  assert.ok(!/annual probability|1 in 100|insurance premium|mortgageable|valuation impact|legal liability|climate projection|do not buy/i.test(blob));
  assert.strictEqual(envelope.assessment.insuranceAssessed, false);
  assert.strictEqual(envelope.assessment.climateProjectionAssessed, false);
  assert.strictEqual(sanitizeFloodFact({ available: true, value: 'Flood Zone 1' }).available, false);
  assert.strictEqual(contribution.createsDomainFacts, false);
});

['RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL', 'AGRICULTURAL', 'LAND', 'DEVELOPMENT_SITE', 'MIXED_USE'].forEach((cls) => {
  test(`${cls} environment envelope works without inventing class`, () => {
    const { envelope, assetClassUnchanged } = adaptEnvironmentDomain({
      floodEvidence: zoneFact(3),
      identity: identity(),
      assetClassification: { assetClass: cls },
    });
    assert.strictEqual(envelope.subject.assetClass, cls);
    assert.strictEqual(assetClassUnchanged, cls);
    assert.strictEqual(capabilityFor(DOMAIN_ID.ENVIRONMENT, cls), CAPABILITY.SUPPORTED);
  });
});

test('27-28. UNKNOWN works and environment does not classify the asset', () => {
  const { envelope, assetClassUnchanged } = adaptEnvironmentDomain({
    floodEvidence: zoneFact(3),
    identity: identity(),
    assetClassification: { assetClass: ASSET_CLASS.UNKNOWN },
  });
  assert.strictEqual(envelope.subject.assetClass, ASSET_CLASS.UNKNOWN);
  assert.strictEqual(assetClassUnchanged, ASSET_CLASS.UNKNOWN);
});

test('29-31. PLANNING and ENVIRONMENT wired; others remain unwired', () => {
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.PLANNING).wiredIntoLiveAnalysis, true);
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.ENVIRONMENT).wiredIntoLiveAnalysis, true);
  ['BUILDING_CONDITION', 'PROJECT_COST', 'DECISION', 'VALUATION'].forEach((id) => {
    assert.strictEqual(platformRegistry.getDomain(id).wiredIntoLiveAnalysis, false);
  });
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.LEGAL_TITLE).wiredIntoLiveAnalysis, true);
});

test('32. report.domains contains both without duplication', () => {
  const planning = adaptPlanningDomain({
    planningEvidence: assessedPlanning({
      subjectApplications: [],
      nearbyApplications: [],
      retrievedAt: '2026-08-01T10:00:00.000Z',
      identity: identity(),
      radiusMetres: 400,
      queryKind: 'geometry',
    }),
    identity: identity(),
  }).envelope;
  const environment = adaptEnvironmentDomain({
    floodEvidence: zoneFact(3),
    identity: identity(),
  }).envelope;
  const composed = composeLiveDomainEnvelopes([planning, environment, environment, planning]);
  assert.strictEqual(composed.domains.length, 2);
  assert.strictEqual(composed.domains[0].domain, 'PLANNING');
  assert.strictEqual(composed.domains[1].domain, 'ENVIRONMENT');
  assert.ok(composed.byId.PLANNING);
  assert.ok(composed.byId.ENVIRONMENT);
});

test('33-34. one unavailable domain does not erase the other', () => {
  const planningDown = adaptPlanningDomain({
    planningEvidence: { available: false, unavailableReason: 'provider_unavailable' },
    identity: identity(),
  }).envelope;
  const environmentUp = adaptEnvironmentDomain({
    floodEvidence: zoneFact(3),
    identity: identity(),
  }).envelope;
  const mixed = composeLiveDomainEnvelopes([planningDown, environmentUp]);
  assert.strictEqual(mixed.byId.PLANNING.status, DOMAIN_STATUS.UNAVAILABLE);
  assert.strictEqual(mixed.byId.ENVIRONMENT.status, DOMAIN_STATUS.AVAILABLE);

  const planningUp = adaptPlanningDomain({
    planningEvidence: assessedPlanning({
      subjectApplications: [{ reference: '24/1', entityId: 1, scope: 'property', matchMethod: 'uprn' }],
      nearbyApplications: [],
      retrievedAt: '2026-08-01T10:00:00.000Z',
      identity: identity(),
      radiusMetres: 400,
      queryKind: 'uprn',
    }),
    identity: identity(),
  }).envelope;
  const environmentDown = adaptEnvironmentDomain({
    floodEvidence: notAssessedFlood({ reason: UNAVAILABLE_REASONS.providerUnavailable }),
    identity: identity(),
  }).envelope;
  const mixed2 = composeLiveDomainEnvelopes([planningUp, environmentDown]);
  assert.strictEqual(mixed2.byId.PLANNING.status, DOMAIN_STATUS.AVAILABLE);
  assert.strictEqual(mixed2.byId.ENVIRONMENT.status, DOMAIN_STATUS.UNAVAILABLE);
});

test('43-47. freeze — adapter does not call EA, PropertyData, LLM, valuation, finance, PD, DI', () => {
  const src = read('../services/domains/environmentDomain.js');
  assert.ok(!src.includes('getFloodEvidence('));
  assert.ok(!src.includes('queryFloodMapForPlanning'));
  assert.ok(!src.includes('getSoldPrices'));
  assert.ok(!src.includes('openai'));
  assert.ok(!src.includes('require(\'../ai/valuationEngine\')'));
  assert.ok(!src.includes('require(\'../ai/financialEngine\')'));
  assert.ok(!src.includes('require(\'../ai/personalDecisionEngine\')'));
  assert.ok(!src.includes('require(\'../ai/decisionIntelligence\')'));
  assert.ok(src.includes('noAdditionalProviderCall: true'));
});

test('48-50. history does not re-query; V1.1 unchanged', () => {
  const old = { modelVersion: 'property-intelligence-v1.1', personalDecision: { score: 40 } };
  assert.strictEqual(historicalReportIsReadable(old), true);
  assert.strictEqual(old.environmentDomain, undefined);
  const history = read('../../client/src/Utils/savedIntelligenceReport.js');
  assert.ok(!/getFloodEvidence|adaptEnvironmentDomain/.test(history));
  const versions = read('../architecture/versions.js');
  assert.ok(versions.includes("propertyIntelligenceV11: 'property-intelligence-v1.1'"));
  assert.strictEqual(PLANNING_DOMAIN_VERSION, 'planning-domain-1.0.0');
});

test('shared abstraction is identity/composition only', () => {
  const compose = read('../services/domains/composeLiveDomains.js');
  const subject = read('../services/domains/subjectRef.js');
  assert.ok(!compose.includes('flood'));
  assert.ok(!compose.includes('planningApplication'));
  assert.ok(!subject.includes('Flood Zone'));
  assert.ok(!subject.includes('planning-application'));
});

asyncTest('20 + 35-39. PI assembles; valuation/rent isolation; both domains present', async () => {
  const report = await analyse({ floodStub: async () => zoneFact(3) });
  assert.strictEqual(report.environmentDomain.domain, 'ENVIRONMENT');
  assert.strictEqual(report.planningDomain.domain, 'PLANNING');
  assert.strictEqual(report.domains.domains.length, 4);
  assert.ok(report.domains.byId.LEGAL_TITLE);
  assert.ok(report.domains.byId.MARKET);
  assert.ok(report.legalTitleDomain);
  assert.strictEqual(report.marketIntelligence.sale.centralEstimate, 195000);
  assert.strictEqual(report.marketIntelligence.rent.recommendedRent, 1100);
  assert.strictEqual(report.propertyFacts.facts.flood.value, 'Flood Zone 3');
  assert.ok(!report.decisionIntelligence?.domainContributions);
  const engine = read('../services/ai/propertyIntelligenceEngine.js');
  assert.ok(engine.includes('attachEnvironmentDomain'));
  assert.ok(!/decisionIntelligence[\s\S]{0,200}environmentContribution/.test(engine));
  assert.ok(!engine.includes('environmentContribution'));
});

asyncTest('21. COMMERCIAL environment works without residential valuation leakage', async () => {
  const report = await analyse({
    propertyOverrides: {
      assetClassification: {
        assetClass: 'COMMERCIAL',
        state: 'DECLARED',
        provenance: { source: 'UserDeclaration', sourceType: 'FIRST_PARTY' },
      },
    },
    floodStub: async () => zoneFact(2),
  });
  assert.strictEqual(report.environmentDomain.subject.assetClass, 'COMMERCIAL');
  assert.strictEqual(report.environmentDomain.assessment.sourcedZone, 'Flood Zone 2');
  assert.strictEqual(report.residentialMethodology.mode, 'NOT_SUPPORTED_FOR_ASSET_CLASS');
  assert.strictEqual(report.marketIntelligence.sale.success, false);
});

asyncTest('27b. UNKNOWN stays UNKNOWN while environment is available', async () => {
  const report = await analyse({ floodStub: async () => zoneFact(3) });
  assert.strictEqual(report.assetClassification.assetClass, 'UNKNOWN');
  assert.strictEqual(report.environmentDomain.subject.assetClass, 'UNKNOWN');
});

asyncTest('environment failure does not erase planning or crash PI', async () => {
  const report = await analyse({
    floodStub: async () => {
      throw new Error('EA down');
    },
    planningStub: async () => assessedPlanning({
      subjectApplications: [{ reference: '24/1', entityId: 1, scope: 'property', matchMethod: 'uprn' }],
      nearbyApplications: [],
      retrievedAt: '2026-08-01T10:00:00.000Z',
      identity: identity(),
      radiusMetres: 400,
      queryKind: 'uprn',
    }),
  });
  assert.strictEqual(report.success, true);
  assert.strictEqual(report.planningDomain.status, DOMAIN_STATUS.AVAILABLE);
  assert.ok(report.environmentDomain);
  assert.strictEqual(report.domains.byId.PLANNING.status, DOMAIN_STATUS.AVAILABLE);
});

asyncTest('planning failure does not erase environment', async () => {
  const report = await analyse({
    floodStub: async () => zoneFact(3),
    planningStub: async () => {
      throw new Error('planning down');
    },
  });
  assert.strictEqual(report.environmentDomain.status, DOMAIN_STATUS.AVAILABLE);
  assert.ok(report.planningDomain);
  assert.strictEqual(report.domains.byId.ENVIRONMENT.status, DOMAIN_STATUS.AVAILABLE);
});

(async () => {
  for (const item of pending) {
    await item.fn();
    console.log(`  ok  ${item.name}`);
  }
  console.log('\nenvironment domain envelope passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
