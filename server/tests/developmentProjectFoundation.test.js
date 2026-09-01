/**
 * Development project identity foundation — not cost, feasibility, or PM.
 * Run: node server/tests/developmentProjectFoundation.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  DOMAIN_ID,
  IDENTITY_KIND,
  ASSET_CLASS,
  CAPABILITY,
  VISIBILITY,
  SOURCE_TYPE,
  DEVELOPMENT_DOMAIN_VERSION,
  DEVELOPMENT_PROJECT_CONTRACT_VERSION,
  LEGAL_TITLE_DOMAIN_VERSION,
  BUILDING_CONDITION_DOMAIN_VERSION,
  PLANNING_DOMAIN_VERSION,
  ENVIRONMENT_DOMAIN_VERSION,
  platformRegistry,
  capabilityFor,
  historicalReportIsReadable,
  createSubjectRef,
  createDevelopmentProject,
  createDevelopmentScenario,
  createWorkScope,
  createProjectDependency,
  createExistingProposedPair,
  createProjectSubjectLink,
  PROJECT_TYPE,
  PROJECT_SUBJECT_ROLE,
  PROJECT_STATE_LAYER,
  WORK_SCOPE_TYPE,
  PROJECT_LIFECYCLE,
  PROJECT_STATEMENT_KIND,
  PROJECT_DEPENDENCY_STATE,
  assertEvidenceVisibility,
} = require('../architecture');
const {
  adaptDevelopmentFoundation,
  attachDevelopmentFoundation,
} = require('../services/domains/developmentDomain');
const { adaptLegalTitleFoundation } = require('../services/domains/legalTitleDomain');
const { adaptBuildingConditionFoundation } = require('../services/domains/buildingConditionDomain');
const { composeLiveDomainEnvelopes } = require('../services/domains/composeLiveDomains');
const { adaptPlanningDomain } = require('../services/domains/planningDomain');
const { adaptEnvironmentDomain } = require('../services/domains/environmentDomain');
const { assessedPlanning } = require('../services/ai/planningEvidence');
const { assessedFlood } = require('../services/ai/floodEvidence');
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
  return { listingId: 12, subjectId: null, uprn: '10001233621' };
}

function propertyRef(id = 'asset-1') {
  return createSubjectRef({ kind: IDENTITY_KIND.PROPERTY, id });
}

console.log('development project foundation\n');

test('1-5. identities are distinct', () => {
  assert.strictEqual(IDENTITY_KIND.DEVELOPMENT_PROJECT, 'DEVELOPMENT_PROJECT');
  assert.notStrictEqual(IDENTITY_KIND.DEVELOPMENT_PROJECT, IDENTITY_KIND.PROPERTY);
  assert.notStrictEqual(IDENTITY_KIND.DEVELOPMENT_PROJECT, IDENTITY_KIND.SITE);
  assert.notStrictEqual(IDENTITY_KIND.DEVELOPMENT_PROJECT, IDENTITY_KIND.DEVELOPMENT_SCENARIO);
  assert.notStrictEqual(IDENTITY_KIND.PROPERTY, IDENTITY_KIND.BUILDING);
  assert.throws(
    () => createDevelopmentProject({ projectId: 'p1', asPropertyId: true }),
    /PROJECT_IS_NOT_PROPERTY/
  );
  assert.throws(
    () => createDevelopmentProject({ projectId: 'p1', asSiteId: true }),
    /PROJECT_IS_NOT_SITE/
  );
  assert.throws(
    () => createDevelopmentScenario({ scenarioId: 'p1', projectId: 'p1' }),
    /SCENARIO_IS_NOT_PROJECT/
  );
  assert.throws(
    () => createWorkScope({ scopeId: 'p1', projectId: 'p1' }),
    /WORK_SCOPE_IS_NOT_PROJECT/
  );
});

test('6-9. multi-subject / building / parcel architecture', () => {
  const project = createDevelopmentProject({
    projectId: 'proj-multi',
    subjects: [
      { subjectRef: propertyRef('a'), role: PROJECT_SUBJECT_ROLE.PRIMARY_SUBJECT },
      { subjectRef: createSubjectRef({ kind: IDENTITY_KIND.BUILDING, id: 'b1' }), role: PROJECT_SUBJECT_ROLE.EXISTING_ASSET },
      { subjectRef: createSubjectRef({ kind: IDENTITY_KIND.BUILDING, id: 'b2' }), role: PROJECT_SUBJECT_ROLE.EXISTING_ASSET },
      { subjectRef: createSubjectRef({ kind: IDENTITY_KIND.LAND_PARCEL, id: 'parcel-1' }), role: PROJECT_SUBJECT_ROLE.AFFECTED_SUBJECT },
    ],
  });
  assert.strictEqual(project.subjects.length, 4);
  assert.strictEqual(project.subjects[0].cadastralMatchClaimed, false);
  const { envelope } = adaptDevelopmentFoundation({ project });
  assert.ok(envelope.findings.some((row) => row.id === 'project_affects_multiple_subjects'));
});

test('10-11. UNKNOWN project type and UNKNOWN asset class valid', () => {
  const project = createDevelopmentProject({ projectId: 'p-unk', projectType: PROJECT_TYPE.UNKNOWN });
  assert.strictEqual(project.projectType, 'UNKNOWN');
  const { envelope } = adaptDevelopmentFoundation({
    project,
    assetClassification: { assetClass: ASSET_CLASS.UNKNOWN },
  });
  assert.strictEqual(envelope.subject.assetClass, ASSET_CLASS.UNKNOWN);
});

test('12-16. existing != proposed; intent != fact; scenario != current', () => {
  const pair = createExistingProposedPair({
    factType: 'use',
    existingValue: 'warehouse',
    proposedValue: 'residential',
  });
  assert.strictEqual(pair.existing.state, PROJECT_STATE_LAYER.EXISTING);
  assert.strictEqual(pair.proposed.state, PROJECT_STATE_LAYER.PROPOSED);
  assert.strictEqual(pair.proposed.kind, PROJECT_STATEMENT_KIND.USER_INTENT);
  assert.strictEqual(pair.overwritesCanonicalPropertyFact, false);
  const scenario = createDevelopmentScenario({
    scenarioId: 'sc-a',
    projectId: 'proj-1',
    name: 'convert',
  });
  assert.strictEqual(scenario.isCanonicalCurrentState, false);
  assert.strictEqual(scenario.isFinanceWhatIf, false);
});

test('17. Finance What-if != Development Scenario', () => {
  assert.throws(
    () => createDevelopmentScenario({
      scenarioId: 'whatif-1',
      projectId: 'proj-1',
      whatIfId: 'whatif-1',
    }),
    /WHAT_IF_IS_NOT_DEVELOPMENT_SCENARIO/
  );
  assert.throws(
    () => createDevelopmentProject({ projectId: 'whatif-9', whatIfId: 'whatif-9' }),
    /WHAT_IF_IS_NOT_DEVELOPMENT_PROJECT/
  );
});

test('18-26. scope/project do not imply defect, planning, ownership, cost, schedule, uplift', () => {
  const scope = createWorkScope({
    scopeId: 's1',
    projectId: 'proj-1',
    scopeType: WORK_SCOPE_TYPE.ENVELOPE_WORK,
    description: 'replace roof',
  });
  assert.strictEqual(scope.impliesDefect, false);
  assert.strictEqual(scope.impliesPlanningRequirement, false);
  const project = createDevelopmentProject({ projectId: 'proj-1' });
  assert.strictEqual(project.impliesOwnership, false);
  assert.strictEqual(project.impliesPlanningPermission, false);
  assert.strictEqual(project.impliesFeasibility, false);
  assert.strictEqual(project.impliesCostCertainty, false);
  assert.strictEqual(project.impliesSchedule, false);
  assert.strictEqual(project.impliesValuationUplift, false);
  const { envelope } = adaptDevelopmentFoundation({ project, scopes: [scope] });
  const blob = JSON.stringify(envelope);
  assert.ok(!/viable|profitable|should be approved|valuation uplift £/i.test(blob));
  assert.strictEqual(envelope.assessment.impliesCost, false);
  assert.strictEqual(envelope.assessment.impliesFeasibility, false);
});

test('27-30. live and foundation domains unchanged', () => {
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.PLANNING).wiredIntoLiveAnalysis, true);
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.ENVIRONMENT).wiredIntoLiveAnalysis, true);
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.LEGAL_TITLE).wiredIntoLiveAnalysis, true);
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.BUILDING_CONDITION).wiredIntoLiveAnalysis, false);
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.DEVELOPMENT).wiredIntoLiveAnalysis, false);
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.DEVELOPMENT).implementationStatus, 'PARTIAL');
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.DEVELOPMENT).mayIncurProviderCost, false);
  assert.strictEqual(LEGAL_TITLE_DOMAIN_VERSION, 'legal-title-domain-0.1.0');
  assert.strictEqual(BUILDING_CONDITION_DOMAIN_VERSION, 'building-condition-domain-0.1.0');
  assert.strictEqual(adaptLegalTitleFoundation({ identity: identity() }).envelope.assessment.liveLegalAssessmentAvailable, false);
  assert.strictEqual(adaptBuildingConditionFoundation({ identity: identity() }).envelope.assessment.liveConditionAssessmentAvailable, false);
});

test('38-42. COMMERCIAL/INDUSTRIAL/LAND/DEVELOPMENT_SITE/MIXED_USE safety', () => {
  ['COMMERCIAL', 'INDUSTRIAL', 'MIXED_USE'].forEach((cls) => {
    const { envelope } = adaptDevelopmentFoundation({
      project: createDevelopmentProject({ projectId: `p-${cls}` }),
      assetClassification: { assetClass: cls },
    });
    assert.strictEqual(envelope.assessment.residentialMethodologyActivated, false);
    assert.strictEqual(capabilityFor(DOMAIN_ID.DEVELOPMENT, cls), CAPABILITY.CONDITIONAL);
  });
  const land = adaptDevelopmentFoundation({
    project: createDevelopmentProject({
      projectId: 'p-land',
      subjects: [{
        subjectRef: createSubjectRef({ kind: IDENTITY_KIND.LAND_PARCEL, id: 'lp-1' }),
        role: PROJECT_SUBJECT_ROLE.PRIMARY_SUBJECT,
      }],
    }),
    scopes: [createWorkScope({ scopeId: 'site-1', projectId: 'p-land', scopeType: WORK_SCOPE_TYPE.SITE_WORK })],
    assetClassification: { assetClass: ASSET_CLASS.LAND },
  });
  assert.strictEqual(land.envelope.assessment.buildingConditionRequired, false);
  const site = adaptDevelopmentFoundation({
    project: createDevelopmentProject({ projectId: 'p-ds' }),
    assetClassification: { assetClass: ASSET_CLASS.DEVELOPMENT_SITE },
  });
  assert.strictEqual(site.envelope.subject.assetClass, 'DEVELOPMENT_SITE');
});

test('43-44. private project does not become shared property evidence', () => {
  const project = createDevelopmentProject({
    projectId: 'priv',
    createdBy: 44,
    visibility: VISIBILITY.PRIVATE,
  });
  assert.strictEqual(project.visibility, VISIBILITY.PRIVATE);
  assert.strictEqual(project.sharedPropertyEvidence, false);
  assert.throws(
    () => assertEvidenceVisibility({
      factType: 'proposedDevelopment',
      visibility: VISIBILITY.PRIVATE,
      sharedPropertyEvidence: true,
    }),
    /PRIVATE_DATA_CANNOT_BE_SHARED_PROPERTY_EVIDENCE/
  );
});

test('45-46. history immutable; versions preserved', () => {
  const old = { modelVersion: 'property-intelligence-v1.1', personalDecision: { score: 40 } };
  assert.strictEqual(historicalReportIsReadable(old), true);
  assert.strictEqual(old.developmentDomain, undefined);
  assert.strictEqual(DEVELOPMENT_PROJECT_CONTRACT_VERSION, 'development-project-contract-0.1.0');
  assert.strictEqual(DEVELOPMENT_DOMAIN_VERSION, 'development-domain-0.1.0');
  const project = createDevelopmentProject({ projectId: 'ver' });
  assert.strictEqual(project.contractVersion, DEVELOPMENT_PROJECT_CONTRACT_VERSION);
});

test('47-51. no provider, LLM, cost, feasibility, or schedule engine', () => {
  const src = read('../services/domains/developmentDomain.js');
  assert.ok(!src.includes('getSoldPrices'));
  assert.ok(!src.includes('openai'));
  assert.ok(!src.includes('grossDevelopmentValue'));
  assert.ok(!src.includes('calculateGdv'));
  assert.ok(!src.includes('critical path'));
  assert.ok(!src.includes('£/sqm'));
  assert.ok(src.includes('noAdditionalProviderCall: true'));
  assert.ok(src.includes('No cost, schedule, GDV'));
});

test('54. V1.1 and live domain versions unchanged', () => {
  const versions = read('../architecture/versions.js');
  assert.ok(versions.includes("propertyIntelligenceV11: 'property-intelligence-v1.1'"));
  assert.strictEqual(PLANNING_DOMAIN_VERSION, 'planning-domain-1.0.0');
  assert.strictEqual(ENVIRONMENT_DOMAIN_VERSION, 'environment-domain-1.0.0');
});

test('conversion without planning evidence creates unresolved planning dependency only', () => {
  const project = createDevelopmentProject({
    projectId: 'conv',
    projectType: PROJECT_TYPE.CONVERSION,
  });
  const { envelope, dependencies } = adaptDevelopmentFoundation({
    project,
    scopes: [createWorkScope({
      scopeId: 'conv-scope',
      projectId: 'conv',
      scopeType: WORK_SCOPE_TYPE.CONVERSION,
    })],
  });
  assert.ok(dependencies.some((row) => row.domain === 'PLANNING' && row.state === PROJECT_DEPENDENCY_STATE.UNRESOLVED));
  assert.ok(envelope.findings.some((row) => row.id === 'planning_dependency_unresolved'));
  assert.ok(!dependencies.some((row) => row.domain === 'BUILDING_CONDITION'));
});

test('no project defined does not invent a project', () => {
  const { envelope } = adaptDevelopmentFoundation({});
  assert.strictEqual(envelope.status, 'NOT_ASSESSED');
  assert.strictEqual(envelope.assessment.projectDefined, false);
});

test('model-assisted scope is non-authoritative inference', () => {
  const scope = createWorkScope({
    scopeId: 'm1',
    projectId: 'p',
    sourceType: SOURCE_TYPE.MODEL_ASSISTED,
    description: 'maybe an extension',
  });
  assert.strictEqual(scope.statementKind, PROJECT_STATEMENT_KIND.INFERENCE);
  assert.strictEqual(scope.authoritative, false);
});

test('ACTIVE does not mean construction started', () => {
  const project = createDevelopmentProject({
    projectId: 'act',
    lifecycle: PROJECT_LIFECYCLE.ACTIVE,
  });
  assert.strictEqual(project.activeDoesNotMeanConstructionStarted, true);
});

test('live composer still excludes DEVELOPMENT', () => {
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
    floodEvidence: assessedFlood({
      zone: 3,
      layersMatched: ['Flood Zone 3'],
      retrievedAt: '2026-08-01T10:00:00.000Z',
      identity: { ...identity(), latitude: 51.5, longitude: -0.12 },
    }),
    identity: identity(),
  }).envelope;
  const live = composeLiveDomainEnvelopes([planning, environment]);
  assert.strictEqual(live.byId.DEVELOPMENT, undefined);
  assert.strictEqual(live.domains.length, 2);
});

test('repair scope does not invent a planning dependency', () => {
  const project = createDevelopmentProject({
    projectId: 'repair',
    projectType: PROJECT_TYPE.REPAIR,
  });
  const { envelope, dependencies } = adaptDevelopmentFoundation({
    project,
    scopes: [createWorkScope({
      scopeId: 'r1',
      projectId: 'repair',
      scopeType: WORK_SCOPE_TYPE.REPAIR,
      description: 'replace roof',
    })],
  });
  assert.ok(!dependencies.some((row) => row.domain === 'PLANNING'));
  assert.ok(!envelope.findings.some((row) => row.id === 'planning_dependency_unresolved'));
  assert.ok(!envelope.investigationPriorities.some((row) => /survey|solicitor/i.test(row.text)));
});

test('existing vs proposed finding does not overwrite property facts', () => {
  const project = createDevelopmentProject({ projectId: 'use-change' });
  const pair = createExistingProposedPair({
    factType: 'use',
    existingValue: 'warehouse',
    proposedValue: 'residential',
  });
  const { envelope } = adaptDevelopmentFoundation({
    project,
    existingProposed: [pair],
  });
  assert.ok(envelope.findings.some((row) => row.id === 'proposed_differs_from_existing'));
  assert.strictEqual(pair.overwritesCanonicalPropertyFact, false);
});

test('malformed attach degrades', () => {
  const attached = attachDevelopmentFoundation({ project: { projectId: null } });
  assert.strictEqual(attached.developmentDomain.domain, 'DEVELOPMENT');
});

test('project subject link helper', () => {
  const link = createProjectSubjectLink({
    subjectRef: propertyRef('x'),
    role: PROJECT_SUBJECT_ROLE.PROPOSED_ASSET,
  });
  assert.strictEqual(link.role, 'PROPOSED_ASSET');
  assert.strictEqual(link.ownershipImplied, false);
});

test('dependency without evidence is not an invented conclusion', () => {
  const dep = createProjectDependency({
    dependencyId: 'd1',
    projectId: 'p',
    domain: DOMAIN_ID.PLANNING,
    state: PROJECT_DEPENDENCY_STATE.NOT_ASSESSED,
  });
  assert.strictEqual(dep.inventedConclusion, false);
  assert.strictEqual(dep.severityScore, null);
  assert.strictEqual(dep.evidenceRefs.length, 0);
});

asyncTest('31-37 + 52-53. live PI, What-if, and buildRisks unchanged', async () => {
  const report = await assemblePropertyIntelligenceReport({
    property: {
      id: 12,
      title: 'Development foundation fixture',
      category: 'sale',
      property_type: 'terraced',
      price: 200000,
      monthly_rent: 1000,
      city: 'Manchester',
      zip_code: 'M1 1AA',
    },
    access: {
      allowed: true,
      userId: 1,
      role: 'owner',
      relationship: 'owner',
      accessLevel: 'professional_intelligence',
      propertyId: 12,
    },
    userId: 1,
    target: { propertyId: 12 },
    options: {
      skipExplanation: true,
      skipPostcodeMarket: true,
      skipFlood: true,
      skipPlanning: true,
      skipSchools: true,
      skipListedBuilding: true,
      skipConservationArea: true,
      skipArticle4: true,
      asOf: '2026-08-30T00:00:00.000Z',
      deps: {
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
      },
    },
  });
  assert.strictEqual(report.success, true);
  assert.strictEqual(report.developmentDomain, undefined);
  assert.strictEqual(report.domains.byId.DEVELOPMENT, undefined);
  assert.ok(report.planningDomain);
  assert.ok(report.environmentDomain);
  assert.strictEqual(report.marketIntelligence.sale.centralEstimate, 195000);
  assert.strictEqual(report.marketIntelligence.rent.recommendedRent, 1100);
  const engine = read('../services/ai/propertyIntelligenceEngine.js');
  assert.ok(!engine.includes('adaptDevelopmentFoundation'));
  assert.ok(engine.includes('buildRisks('));
  const whatIf = read('../services/ai/intelligenceWhatIfService.js');
  assert.ok(whatIf.includes('notSaved') || whatIf.includes('request_scoped') || whatIf.includes('notPropertyTruth'));
});

(async () => {
  for (const item of pending) {
    await item.fn();
    console.log(`  ok  ${item.name}`);
  }
  console.log('\ndevelopment project foundation passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
