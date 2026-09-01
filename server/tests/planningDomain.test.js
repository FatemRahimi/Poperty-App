/**
 * Planning domain envelope — wrap existing evidence only.
 * Run: node server/tests/planningDomain.test.js
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
  PLANNING_DOMAIN_VERSION,
  platformRegistry,
  historicalReportIsReadable,
  ASSET_CLASS,
  capabilityFor,
  CAPABILITY,
} = require('../architecture');
const {
  adaptPlanningDomain,
  attachPlanningDomain,
} = require('../services/domains/planningDomain');
const {
  assessedPlanning,
  notAssessedPlanning,
  unattachedPlanningFact,
  UNAVAILABLE_REASONS,
} = require('../services/ai/planningEvidence');
const { DEFAULT_SEARCH_RADIUS_M } = require('../services/providers/planningData/planningApplicationClient');
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

const SUBJECT_APP = {
  reference: '24/00123/FUL',
  entityId: 9001,
  description: 'Single storey rear extension',
  nativeStatus: 'decided',
  nativeDecision: null,
  submittedDate: '2024-02-01',
  decisionDate: '2024-04-01',
  distanceMetres: 4,
  scope: 'property',
  matchMethod: 'uprn',
  documentationUrl: 'https://example.test/app/24-00123',
};

const NEARBY_APP = {
  reference: '24/00999/FUL',
  entityId: 9002,
  description: 'Shopfront alteration',
  nativeStatus: 'undecided',
  distanceMetres: 220,
  scope: 'nearby',
  matchMethod: 'search_radius',
};

function identity() {
  return { listingId: 12, subjectId: null, uprn: '10001233621' };
}

function listing(overrides = {}) {
  return {
    id: 12,
    title: 'Planning envelope fixture',
    category: 'sale',
    property_type: 'terraced',
    price: 200000,
    monthly_rent: 1000,
    city: 'Manchester',
    zip_code: 'M1 1AA',
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

function deps(planningStub) {
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
    getPlanningEvidence: planningStub,
  };
}

async function analyse({ propertyOverrides = {}, planningStub, options = {} } = {}) {
  return assemblePropertyIntelligenceReport({
    property: listing(propertyOverrides),
    access: access(),
    userId: 1,
    target: { propertyId: 12 },
    options: {
      skipExplanation: true,
      skipPostcodeMarket: true,
      skipFlood: true,
      skipSchools: true,
      skipListedBuilding: true,
      skipConservationArea: true,
      skipArticle4: true,
      asOf: '2026-08-30T00:00:00.000Z',
      deps: deps(planningStub),
      ...options,
    },
  });
}

function assessedFact(extras = {}) {
  return assessedPlanning({
    subjectApplications: extras.subjectApplications || [SUBJECT_APP],
    nearbyApplications: extras.nearbyApplications || [NEARBY_APP],
    retrievedAt: '2026-08-01T10:00:00.000Z',
    identity: identity(),
    radiusMetres: DEFAULT_SEARCH_RADIUS_M,
    queryKind: 'geometry',
    providerCount: 2,
    ...extras,
  });
}

console.log('planning domain envelope\n');

test('1. PLANNING domain ID stable', () => {
  assert.strictEqual(DOMAIN_ID.PLANNING, 'PLANNING');
  assert.ok(platformRegistry.getDomain(DOMAIN_ID.PLANNING));
});

test('2. planning domain version explicit', () => {
  assert.strictEqual(PLANNING_DOMAIN_VERSION, 'planning-domain-1.0.0');
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.PLANNING).version, PLANNING_DOMAIN_VERSION);
});

test('3-4. valid evidence produces a valid envelope', () => {
  const { envelope } = adaptPlanningDomain({
    planningEvidence: assessedFact(),
    identity: identity(),
    assetClassification: { assetClass: ASSET_CLASS.RESIDENTIAL },
    analysisAt: '2026-08-30T00:00:00.000Z',
  });
  assert.strictEqual(envelope.domain, 'PLANNING');
  assert.strictEqual(envelope.version, PLANNING_DOMAIN_VERSION);
  assert.strictEqual(envelope.status, DOMAIN_STATUS.AVAILABLE);
  assert.strictEqual(envelope.assessment.state, KERNEL_ASSESSMENT.ASSESSED);
  assert.ok(envelope.findings.length > 0);
  assert.ok(envelope.evidence.length >= 2);
});

test('5. missing coordinates → insufficient / not-assessed', () => {
  const { envelope } = adaptPlanningDomain({
    planningEvidence: notAssessedPlanning({
      reason: UNAVAILABLE_REASONS.locationUnavailable,
      note: 'No coordinates',
      identity: identity(),
    }),
    identity: identity(),
  });
  assert.strictEqual(envelope.status, DOMAIN_STATUS.NOT_ASSESSED);
  assert.strictEqual(envelope.assessment.state, KERNEL_ASSESSMENT.INSUFFICIENT_EVIDENCE);
  assert.ok(envelope.unresolvedDependencies.some((row) => row.id === 'coordinates_required'));
  assert.ok(!envelope.findings.some((row) => /no planning activity exists/i.test(row.text)));
});

test('6. source unavailable → UNAVAILABLE', () => {
  const { envelope } = adaptPlanningDomain({
    planningEvidence: notAssessedPlanning({
      reason: UNAVAILABLE_REASONS.providerUnavailable,
      retrievedAt: '2026-08-01T10:00:00.000Z',
      identity: identity(),
    }),
    identity: identity(),
  });
  assert.strictEqual(envelope.status, DOMAIN_STATUS.UNAVAILABLE);
  assert.strictEqual(envelope.assessment.state, KERNEL_ASSESSMENT.UNAVAILABLE);
});

test('7. empty result does not become no planning exists', () => {
  const { envelope } = adaptPlanningDomain({
    planningEvidence: assessedPlanning({
      subjectApplications: [],
      nearbyApplications: [],
      retrievedAt: '2026-08-01T10:00:00.000Z',
      identity: identity(),
      radiusMetres: DEFAULT_SEARCH_RADIUS_M,
      queryKind: 'geometry',
    }),
    identity: identity(),
  });
  assert.strictEqual(envelope.status, DOMAIN_STATUS.PARTIAL);
  assert.strictEqual(envelope.assessment.emptyResultIsNotAbsence, true);
  assert.ok(envelope.findings.some((row) => row.id === 'source_returned_no_applications'));
  assert.ok(envelope.limitations.some((line) => /not evidence that there is no planning activity/i.test(line)));
  assert.ok(!JSON.stringify(envelope).includes('no planning exists'));
});

test('8-10. subject stays SUBJECT; nearby stays NEARBY and is not subject', () => {
  const { envelope } = adaptPlanningDomain({
    planningEvidence: assessedFact(),
    identity: identity(),
  });
  const subject = envelope.evidence.filter((row) => row.spatialRelation === SPATIAL_RELATION.SUBJECT);
  const nearby = envelope.evidence.filter((row) => row.spatialRelation === SPATIAL_RELATION.NEARBY);
  assert.strictEqual(subject.length, 1);
  assert.strictEqual(nearby.length, 1);
  assert.strictEqual(subject[0].classification, EVIDENCE_CLASS.FACT);
  assert.strictEqual(nearby[0].classification, EVIDENCE_CLASS.AREA_CONTEXT);
  assert.strictEqual(subject[0].sourceRecordId, '9001');
  assert.notStrictEqual(nearby[0].spatialRelation, SPATIAL_RELATION.SUBJECT);
});

test('11. 400m behaviour unchanged', () => {
  assert.strictEqual(DEFAULT_SEARCH_RADIUS_M, 400);
  const src = read('../services/providers/planningData/planningApplicationClient.js');
  assert.ok(src.includes('const DEFAULT_SEARCH_RADIUS_M = 400'));
  const adapter = read('../services/domains/planningDomain.js');
  assert.ok(!adapter.includes('searchRadiusMetres = 5'));
  assert.ok(adapter.includes('searchRadiusIsNotLegalBoundary'));
});

test('12-15. provenance, retrievedAt, evidenceAsOf, source record id preserved', () => {
  const { envelope } = adaptPlanningDomain({
    planningEvidence: assessedFact(),
    identity: identity(),
  });
  assert.strictEqual(envelope.provenance.source, 'MHCLG_PlanningData');
  assert.strictEqual(envelope.provenance.retrievedAt, '2026-08-01T10:00:00.000Z');
  assert.strictEqual(envelope.evidenceAsOf, '2026-08-01T10:00:00.000Z');
  assert.strictEqual(envelope.evidence[0].retrievedAt, '2026-08-01T10:00:00.000Z');
  assert.strictEqual(envelope.evidence[0].evidenceAsOf, '2026-08-01T10:00:00.000Z');
  assert.strictEqual(envelope.evidence[0].sourceRecordId, '9001');
});

test('16-20. status, decision, impact, potential, and likelihood are not invented', () => {
  const { envelope, contribution } = adaptPlanningDomain({
    planningEvidence: assessedFact(),
    identity: identity(),
  });
  const blob = JSON.stringify({ envelope, contribution });
  assert.ok(!/likely approval|development potential|planning risk is high|neighbourhood will improve|extension likely/i.test(blob));
  assert.strictEqual(SUBJECT_APP.nativeDecision, null);
  assert.ok(!envelope.findings.some((row) => /approved|refused|granted/i.test(row.text)));
  assert.strictEqual(contribution.createsDomainFacts, false);
  assert.strictEqual(contribution.sensitivityDrivers.length, 0);
});

test('21-22. UNKNOWN can receive planning context and remains UNKNOWN', () => {
  const { envelope, assetClassUnchanged } = adaptPlanningDomain({
    planningEvidence: assessedFact(),
    identity: identity(),
    assetClassification: { assetClass: ASSET_CLASS.UNKNOWN },
  });
  assert.strictEqual(envelope.status, DOMAIN_STATUS.AVAILABLE);
  assert.strictEqual(envelope.subject.assetClass, ASSET_CLASS.UNKNOWN);
  assert.strictEqual(assetClassUnchanged, ASSET_CLASS.UNKNOWN);
});

['RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL', 'AGRICULTURAL', 'LAND', 'DEVELOPMENT_SITE', 'MIXED_USE'].forEach((cls) => {
  test(`${cls} planning envelope works without inventing class`, () => {
    const { envelope } = adaptPlanningDomain({
      planningEvidence: assessedFact(),
      identity: identity(),
      assetClassification: { assetClass: cls },
    });
    assert.strictEqual(envelope.domain, 'PLANNING');
    assert.strictEqual(envelope.subject.assetClass, cls);
    assert.strictEqual(capabilityFor(DOMAIN_ID.PLANNING, cls), CAPABILITY.SUPPORTED);
  });
});

test('malformed evidence degrades safely', () => {
  const attached = attachPlanningDomain({ planningEvidence: 'not-an-object', identity: identity() });
  assert.strictEqual(attached.planningDomain.domain, 'PLANNING');
  assert.ok(attached.planningDomain.status);
});

test('35-42. freeze — adapter does not call providers, LLM, valuation, finance, PD, DI', () => {
  const src = read('../services/domains/planningDomain.js');
  assert.ok(!src.includes('getPlanningEvidence('));
  assert.ok(!src.includes('queryPlanningApplications'));
  assert.ok(!src.includes('getSoldPrices'));
  assert.ok(!src.includes('openai'));
  assert.ok(!src.includes('anthropic'));
  assert.ok(!src.includes('require(\'../ai/valuationEngine\')'));
  assert.ok(!src.includes('require(\'../ai/financialEngine\')'));
  assert.ok(!src.includes('require(\'../ai/personalDecisionEngine\')'));
  assert.ok(!src.includes('require(\'../ai/decisionIntelligence\')'));
  assert.ok(!src.includes('require(\'../ai/intelligenceWhatIfService\')'));
  assert.ok(src.includes('noAdditionalProviderCall: true'));
});

test('43. old historical snapshot remains readable', () => {
  const old = { modelVersion: 'property-intelligence-v1.1', personalDecision: { score: 40 } };
  assert.strictEqual(historicalReportIsReadable(old), true);
  assert.strictEqual(old.planningDomain, undefined);
});

test('44. history path does not re-query planning', () => {
  const history = read('../../client/src/Utils/savedIntelligenceReport.js');
  assert.ok(!/getPlanningEvidence|adaptPlanningDomain/.test(history));
  const detail = read('../../client/src/pages/ai/AiHistoryDetail.js');
  assert.ok(!/getPlanningEvidence/.test(detail));
});

test('45. V1.1 tag unchanged', () => {
  const versions = read('../architecture/versions.js');
  assert.ok(versions.includes("propertyIntelligenceV11: 'property-intelligence-v1.1'"));
});

test('46. unrelated domains remain unwired', () => {
  ['BUILDING_CONDITION', 'PROJECT_COST', 'DECISION', 'VALUATION'].forEach((id) => {
    assert.strictEqual(platformRegistry.getDomain(id).wiredIntoLiveAnalysis, false);
  });
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.LEGAL_TITLE).wiredIntoLiveAnalysis, true);
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.PLANNING).wiredIntoLiveAnalysis, true);
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.ENVIRONMENT).wiredIntoLiveAnalysis, true);
});

test('adjacent evidence is not merged into PLANNING', () => {
  const src = read('../services/domains/planningDomain.js');
  assert.ok(!src.includes('conservationArea'));
  assert.ok(!src.includes('article4'));
  assert.ok(!src.includes('listedBuilding'));
});

asyncTest('23 + 30-34. PI still assembles; planning failure does not crash; isolation holds', async () => {
  const withPlanning = await analyse({
    planningStub: async () => assessedFact(),
  });
  assert.strictEqual(withPlanning.planningDomain.domain, 'PLANNING');
  assert.strictEqual(withPlanning.planningDomain.version, PLANNING_DOMAIN_VERSION);
  assert.strictEqual(withPlanning.marketIntelligence.sale.centralEstimate, 195000);
  assert.strictEqual(withPlanning.marketIntelligence.rent.recommendedRent, 1100);
  assert.ok(withPlanning.propertyFacts.facts.planning);

  const failed = await analyse({
    planningStub: async () => {
      throw new Error('planning down');
    },
  });
  assert.strictEqual(failed.success, true);
  assert.ok(failed.planningDomain);
  assert.notStrictEqual(failed.planningDomain.status, undefined);
  assert.strictEqual(failed.marketIntelligence.sale.centralEstimate, 195000);
});

asyncTest('24. COMMERCIAL planning envelope without residential valuation leakage', async () => {
  const report = await analyse({
    propertyOverrides: {
      assetClassification: {
        assetClass: 'COMMERCIAL',
        state: 'DECLARED',
        provenance: { source: 'UserDeclaration', sourceType: 'FIRST_PARTY' },
      },
    },
    planningStub: async () => assessedFact(),
  });
  assert.strictEqual(report.planningDomain.subject.assetClass, 'COMMERCIAL');
  assert.strictEqual(report.planningDomain.status, DOMAIN_STATUS.AVAILABLE);
  assert.strictEqual(report.residentialMethodology.mode, 'NOT_SUPPORTED_FOR_ASSET_CLASS');
  assert.strictEqual(report.marketIntelligence.sale.success, false);
});

asyncTest('21b. UNKNOWN asset keeps UNKNOWN while planning is available', async () => {
  const report = await analyse({
    planningStub: async () => assessedFact(),
  });
  assert.strictEqual(report.assetClassification.assetClass, 'UNKNOWN');
  assert.strictEqual(report.planningDomain.subject.assetClass, 'UNKNOWN');
  assert.strictEqual(report.planningDomain.status, DOMAIN_STATUS.AVAILABLE);
});

asyncTest('engine does not pass planning contribution into DI', async () => {
  const report = await analyse({
    planningStub: async () => assessedFact(),
  });
  assert.ok(!report.decisionIntelligence?.domainContributions);
  const engine = read('../services/ai/propertyIntelligenceEngine.js');
  assert.ok(engine.includes('attachPlanningDomain'));
  assert.ok(!/decisionIntelligence[\s\S]{0,200}planningContribution/.test(engine));
});

(async () => {
  for (const item of pending) {
    await item.fn();
    console.log(`  ok  ${item.name}`);
  }
  console.log('\nplanning domain envelope passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
