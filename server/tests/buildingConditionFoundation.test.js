/**
 * Building & Condition evidence foundation — not a live survey engine.
 * Run: node server/tests/buildingConditionFoundation.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  DOMAIN_ID,
  DOMAIN_STATUS,
  KERNEL_ASSESSMENT,
  EVIDENCE_CLASS,
  SOURCE_TYPE,
  VISIBILITY,
  TIME_FIELD,
  IDENTITY_KIND,
  ASSET_CLASS,
  CAPABILITY,
  BUILDING_CONDITION_DOMAIN_VERSION,
  LEGAL_TITLE_DOMAIN_VERSION,
  PLANNING_DOMAIN_VERSION,
  ENVIRONMENT_DOMAIN_VERSION,
  platformRegistry,
  capabilityFor,
  historicalReportIsReadable,
  createSubjectRef,
  createComponentRef,
  assertPropertyIsNotBuilding,
  createConditionEvidence,
  createDefectRecord,
  createBuildingDocument,
  createLegalTitleFact,
  LEGAL_FACT_TYPE,
  describeConditionConflict,
  BUILDING_COMPONENT,
  OBSERVATION_STATE,
  INSPECTION_COMPLETENESS,
  BUILDING_DOCUMENT_TYPE,
  BUILDING_EVIDENCE_CLASS,
  ADJACENT_NOT_CONDITION,
  FORBIDDEN_CONDITION_FACT,
  CONDITION_VOCABULARY,
  isAuthoritativeEvidence,
  assertEvidenceVisibility,
} = require('../architecture');
const {
  adaptBuildingConditionFoundation,
  attachBuildingConditionFoundation,
} = require('../services/domains/buildingConditionDomain');
const { adaptLegalTitleFoundation } = require('../services/domains/legalTitleDomain');
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

console.log('building condition foundation\n');

test('1. BUILDING_CONDITION domain ID stable', () => {
  assert.strictEqual(DOMAIN_ID.BUILDING_CONDITION, 'BUILDING_CONDITION');
  assert.strictEqual(BUILDING_CONDITION_DOMAIN_VERSION, 'building-condition-domain-0.1.0');
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.BUILDING_CONDITION).version, BUILDING_CONDITION_DOMAIN_VERSION);
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.BUILDING_CONDITION).wiredIntoLiveAnalysis, false);
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.BUILDING_CONDITION).implementationStatus, 'PARTIAL');
});

test('2. UNKNOWN condition valid', () => {
  const { envelope } = adaptBuildingConditionFoundation({ identity: identity() });
  assert.strictEqual(envelope.assessment.conditionVocabulary, CONDITION_VOCABULARY.UNKNOWN);
  const component = createComponentRef({});
  assert.strictEqual(component.category, BUILDING_COMPONENT.UNKNOWN);
});

test('3-4. property != building; unit != building', () => {
  assert.notStrictEqual(IDENTITY_KIND.PROPERTY, IDENTITY_KIND.BUILDING);
  assert.notStrictEqual(IDENTITY_KIND.UNIT, IDENTITY_KIND.BUILDING);
  const propertyRef = createSubjectRef({ kind: IDENTITY_KIND.PROPERTY, id: 'asset-1' });
  const buildingRef = createSubjectRef({ kind: IDENTITY_KIND.BUILDING, id: 'b-1' });
  assert.strictEqual(assertPropertyIsNotBuilding(propertyRef, buildingRef), true);
  const { envelope } = adaptBuildingConditionFoundation({ identity: identity() });
  assert.strictEqual(envelope.subject.propertyIsNotBuilding, true);
  assert.strictEqual(envelope.subject.unitIsNotBuilding, true);
});

test('5. component ref does not imply inspection', () => {
  const roof = createComponentRef({ category: 'ROOF', id: 'roof-1' });
  assert.strictEqual(roof.inspected, false);
  assert.strictEqual(roof.inspectionImplied, false);
});

test('6-7. missing survey != good condition; missing defect != no defect', () => {
  const { envelope } = adaptBuildingConditionFoundation({ identity: identity() });
  const blob = JSON.stringify(envelope);
  assert.ok(/has not been inspected/i.test(blob));
  assert.ok(!/structurally sound|excellent condition|safe to occupy/i.test(blob));
  assert.strictEqual(envelope.assessment.liveConditionAssessmentAvailable, false);
  assert.notStrictEqual(envelope.assessment.inspectionCompleteness, 'GOOD');
});

test('8. EPC != structural survey', () => {
  assert.strictEqual(ADJACENT_NOT_CONDITION.epcRating, BUILDING_EVIDENCE_CLASS.ENERGY_EVIDENCE);
  const { envelope } = adaptBuildingConditionFoundation({
    identity: identity(),
    propertyFacts: { facts: { epcRating: { available: true, value: 'C' } } },
  });
  assert.strictEqual(envelope.assessment.epcIsNotConditionSurvey, true);
  assert.ok(envelope.findings.some((row) => row.id === 'epc_is_not_condition'));
});

test('9. floor plan != condition evidence', () => {
  const plan = createBuildingDocument({
    documentId: 'fp-1',
    documentType: BUILDING_DOCUMENT_TYPE.FLOOR_PLAN,
  });
  assert.strictEqual(plan.isConditionEvidence, false);
  const { envelope } = adaptBuildingConditionFoundation({
    identity: identity(),
    documents: [plan],
  });
  assert.ok(envelope.findings.some((row) => row.id === 'floor_plan_is_not_condition'));
});

test('10-12. listing description is not professional; provenance retained', () => {
  const reported = createConditionEvidence({
    subjectRef: createSubjectRef({ kind: IDENTITY_KIND.LISTING, id: '12' }),
    observationType: 'listingNote',
    value: 'recently renovated',
    observationState: OBSERVATION_STATE.REPORTED,
    sourceType: SOURCE_TYPE.USER_REPORTED,
    source: 'InternalListing',
    provenance: { source: 'InternalListing' },
    classification: EVIDENCE_CLASS.USER_INPUT,
  });
  assert.strictEqual(reported.sourceType, SOURCE_TYPE.USER_REPORTED);
  assert.strictEqual(reported.authoritative, false);
  const professional = createBuildingDocument({
    documentId: 'surv-1',
    documentType: BUILDING_DOCUMENT_TYPE.RICS_SURVEY,
    source: 'UserUploadedSurvey',
    inspectionDate: '2018-03-01',
  });
  assert.strictEqual(professional.professionalDocument, true);
  assert.strictEqual(professional.credentialsValidatedByPlatform, false);
  const { envelope } = adaptBuildingConditionFoundation({ identity: identity() });
  assert.strictEqual(envelope.assessment.listingDescriptionIsNotProfessionalEvidence, true);
});

test('13. model-assisted evidence non-authoritative', () => {
  const fact = createConditionEvidence({
    subjectRef: createSubjectRef({ kind: IDENTITY_KIND.LISTING, id: '12' }),
    observationType: 'photoNote',
    value: 'stain visible in photo',
    sourceType: SOURCE_TYPE.MODEL_ASSISTED,
    provenance: { source: 'ListingPhotograph' },
    observationState: OBSERVATION_STATE.INFERRED,
  });
  assert.strictEqual(fact.classification, EVIDENCE_CLASS.INFERENCE);
  assert.strictEqual(fact.authoritative, false);
  assert.strictEqual(isAuthoritativeEvidence(fact), false);
});

test('14. photo evidence cannot create structural conclusion', () => {
  const photo = createBuildingDocument({
    documentId: 'img-1',
    documentType: BUILDING_DOCUMENT_TYPE.PHOTOGRAPH,
  });
  assert.strictEqual(photo.structuralConclusionPermitted, false);
  assert.throws(
    () => createConditionEvidence({
      subjectRef: createSubjectRef({ kind: IDENTITY_KIND.LISTING, id: '1' }),
      observationType: FORBIDDEN_CONDITION_FACT.STRUCTURALLY_SOUND,
      provenance: { source: 'photo' },
    }),
    /FORBIDDEN_CONDITION_CONCLUSION/
  );
});

test('15-17. observation date preserved; retrieval != observation; old != current', () => {
  assert.notStrictEqual(TIME_FIELD.observedAt, TIME_FIELD.retrievedAt);
  assert.notStrictEqual(TIME_FIELD.inspectionDate, TIME_FIELD.analysisAt);
  const fact = createConditionEvidence({
    subjectRef: createSubjectRef({ kind: IDENTITY_KIND.LISTING, id: '12' }),
    observationType: 'roofNote',
    value: 'source-native note',
    observedAt: '2018-03-01',
    inspectionDate: '2018-03-01',
    retrievedAt: '2026-08-30T00:00:00.000Z',
    evidenceAsOf: '2018-03-01',
    provenance: { source: 'Survey' },
    observationState: OBSERVATION_STATE.OBSERVED,
    classification: EVIDENCE_CLASS.FACT,
  });
  assert.strictEqual(fact.observedAt, '2018-03-01');
  assert.strictEqual(fact.retrievedAt, '2026-08-30T00:00:00.000Z');
  assert.notStrictEqual(fact.observedAt, fact.retrievedAt);
  assert.strictEqual(fact.oldEvidenceIsNotCurrent, true);
});

test('18-19. conflicting evidence retained; not LLM-resolved', () => {
  const conflict = describeConditionConflict(
    { value: 'new roof', source: 'InternalListing' },
    { value: 'roof requires replacement', source: 'Survey' }
  );
  assert.strictEqual(conflict.state, OBSERVATION_STATE.CONFLICTING_EVIDENCE);
  assert.strictEqual(conflict.resolvedValue, null);
  assert.strictEqual(conflict.llmResolved, false);
});

test('20-21. NOT_INSPECTED distinct from GOOD; NOT_ASSESSED distinct from NO_DEFECT', () => {
  assert.notStrictEqual(OBSERVATION_STATE.NOT_INSPECTED, 'GOOD');
  assert.notStrictEqual(KERNEL_ASSESSMENT.NOT_ASSESSED, FORBIDDEN_CONDITION_FACT.NO_DEFECT_EXISTS);
  const { envelope } = adaptBuildingConditionFoundation({ identity: identity() });
  assert.strictEqual(envelope.assessment.roofCompleteness, INSPECTION_COMPLETENESS.NOT_INSPECTED);
  assert.strictEqual(envelope.assessment.inspectionCompleteness, INSPECTION_COMPLETENESS.NOT_INSPECTED);
});

test('22-24. no condition score, cost, or capex invented', () => {
  const { envelope } = adaptBuildingConditionFoundation({
    identity: identity(),
    propertyFacts: { facts: { epcRating: { available: true, value: 'D' } } },
  });
  const blob = JSON.stringify(envelope);
  assert.ok(!/condition score|£\/sqm|roof replacement estimate|capex/i.test(blob));
  assert.strictEqual(envelope.assessment.remainingTermOrCostPublished, false);
  assert.throws(
    () => createConditionEvidence({
      subjectRef: createSubjectRef({ kind: IDENTITY_KIND.LISTING, id: '1' }),
      observationType: FORBIDDEN_CONDITION_FACT.REFURBISHMENT_COST,
      provenance: { source: 'x' },
    }),
    /FORBIDDEN_CONDITION_CONCLUSION/
  );
});

test('31-33. PLANNING, ENVIRONMENT, LEGAL_TITLE live; BUILDING_CONDITION remains unwired', () => {
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.PLANNING).wiredIntoLiveAnalysis, true);
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.ENVIRONMENT).wiredIntoLiveAnalysis, true);
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.LEGAL_TITLE).wiredIntoLiveAnalysis, true);
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.BUILDING_CONDITION).wiredIntoLiveAnalysis, false);
  assert.strictEqual(LEGAL_TITLE_DOMAIN_VERSION, 'legal-title-domain-0.1.0');
  const legal = adaptLegalTitleFoundation({ identity: identity() });
  assert.strictEqual(legal.envelope.assessment.liveLegalAssessmentAvailable, false);
});

['RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL', 'AGRICULTURAL', 'MIXED_USE'].forEach((cls) => {
  test(`${cls} building foundation is CONDITIONAL, not full support`, () => {
    const { envelope, assetClassUnchanged } = adaptBuildingConditionFoundation({
      identity: identity(),
      assetClassification: { assetClass: cls },
    });
    assert.strictEqual(envelope.subject.assetClass, cls);
    assert.strictEqual(assetClassUnchanged, cls);
    assert.strictEqual(capabilityFor(DOMAIN_ID.BUILDING_CONDITION, cls), CAPABILITY.CONDITIONAL);
    assert.notStrictEqual(capabilityFor(DOMAIN_ID.BUILDING_CONDITION, cls), CAPABILITY.SUPPORTED);
  });
});

test('38. LAND without building is NOT_APPLICABLE', () => {
  assert.strictEqual(capabilityFor(DOMAIN_ID.BUILDING_CONDITION, ASSET_CLASS.LAND), CAPABILITY.NOT_APPLICABLE);
  const { envelope } = adaptBuildingConditionFoundation({
    identity: identity(),
    assetClassification: { assetClass: ASSET_CLASS.LAND },
    hasBuildingOnSite: false,
  });
  assert.strictEqual(envelope.assessment.state, KERNEL_ASSESSMENT.NOT_APPLICABLE);
  assert.ok(envelope.findings.some((row) => row.id === 'land_without_building'));
});

test('39. DEVELOPMENT_SITE has no forced residential component model', () => {
  const { envelope } = adaptBuildingConditionFoundation({
    identity: identity(),
    assetClassification: { assetClass: ASSET_CLASS.DEVELOPMENT_SITE },
  });
  assert.strictEqual(envelope.subject.assetClass, 'DEVELOPMENT_SITE');
  assert.strictEqual(envelope.assessment.residentialComponentModelForced, false);
  assert.strictEqual(capabilityFor(DOMAIN_ID.BUILDING_CONDITION, ASSET_CLASS.DEVELOPMENT_SITE), CAPABILITY.CONDITIONAL);
});

test('41. UNKNOWN asset class valid', () => {
  const { envelope } = adaptBuildingConditionFoundation({
    identity: identity(),
    assetClassification: { assetClass: ASSET_CLASS.UNKNOWN },
  });
  assert.strictEqual(envelope.subject.assetClass, ASSET_CLASS.UNKNOWN);
});

test('42. private survey does not leak', () => {
  const survey = createBuildingDocument({
    documentId: 'priv-survey',
    documentType: BUILDING_DOCUMENT_TYPE.CONDITION_SURVEY,
    uploadedBy: 7,
    visibility: VISIBILITY.PRIVATE,
  });
  assert.strictEqual(survey.visibility, VISIBILITY.PRIVATE);
  assert.strictEqual(survey.sharedPropertyEvidence, false);
  assert.throws(
    () => assertEvidenceVisibility({
      factType: 'buildingSurvey',
      visibility: VISIBILITY.PRIVATE,
      sharedPropertyEvidence: true,
    }),
    /PRIVATE_DATA_CANNOT_BE_SHARED_PROPERTY_EVIDENCE/
  );
});

test('43. historical snapshot unchanged', () => {
  const old = { modelVersion: 'property-intelligence-v1.1', personalDecision: { score: 40 } };
  assert.strictEqual(historicalReportIsReadable(old), true);
  assert.strictEqual(old.buildingConditionDomain, undefined);
  const history = read('../../client/src/Utils/savedIntelligenceReport.js');
  assert.ok(!/adaptBuildingConditionFoundation/.test(history));
});

test('44-46. no new provider; no LLM authority; buildRisks not promoted', () => {
  const src = read('../services/domains/buildingConditionDomain.js');
  assert.ok(!src.includes('getSoldPrices'));
  assert.ok(!src.includes('openai'));
  assert.ok(!src.includes('require(\'../ai/legacyHeuristicIntelligence\')'));
  assert.ok(!src.includes('buildRisks('));
  assert.ok(src.includes('buildRisksPromoted: false'));
  assert.strictEqual(ADJACENT_NOT_CONDITION.buildRisks, BUILDING_EVIDENCE_CLASS.LEGACY_HEURISTIC);
  const contract = read('../architecture/buildingConditionContract.js');
  assert.ok(!contract.includes('LEGAL_DOCUMENT_TYPE'));
});

test('49. V1.1 tag and live domain versions unchanged', () => {
  const versions = read('../architecture/versions.js');
  assert.ok(versions.includes("propertyIntelligenceV11: 'property-intelligence-v1.1'"));
  assert.strictEqual(PLANNING_DOMAIN_VERSION, 'planning-domain-1.0.0');
  assert.strictEqual(ENVIRONMENT_DOMAIN_VERSION, 'environment-domain-1.0.0');
});

test('MAINTENANCE_CAPEX remains future and unwired', () => {
  const capex = platformRegistry.getDomain(DOMAIN_ID.MAINTENANCE_CAPEX);
  assert.strictEqual(capex.wiredIntoLiveAnalysis, false);
  assert.strictEqual(capex.implementationStatus, 'FUTURE');
  assert.ok(capex.dependencies.includes(DOMAIN_ID.BUILDING_CONDITION));
});

test('defect record requires observed issue and is not a diagnosis', () => {
  const defect = createDefectRecord({
    subjectRef: createSubjectRef({ kind: IDENTITY_KIND.LISTING, id: '12' }),
    componentRef: createComponentRef({ category: 'ROOF' }),
    observedIssue: 'Slipped tile recorded on survey page 4',
    source: 'UserUploadedSurvey',
    observedAt: '2018-03-01',
    observationState: OBSERVATION_STATE.EXTRACTED,
  });
  assert.strictEqual(defect.observationType || defect.factType, 'defectRecord');
  assert.ok(defect.limitations.join(' ').includes('Not a structural diagnosis'));
});

test('live domains compose without BUILDING_CONDITION', () => {
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
  assert.strictEqual(live.domains.length, 2);
  assert.strictEqual(live.byId.BUILDING_CONDITION, undefined);
});

test('malformed adapter input degrades', () => {
  const attached = attachBuildingConditionFoundation(null);
  assert.strictEqual(attached.buildingConditionDomain.domain, 'BUILDING_CONDITION');
});

test('legal survey type is not forced onto building documents', () => {
  const doc = createBuildingDocument({
    documentId: 's1',
    documentType: BUILDING_DOCUMENT_TYPE.CONDITION_SURVEY,
  });
  assert.strictEqual(doc.legalDocumentTypeForced, false);
  const legalFact = createLegalTitleFact({
    factType: LEGAL_FACT_TYPE.TENURE,
    value: 'FREEHOLD',
    subjectRef: createSubjectRef({ kind: IDENTITY_KIND.LISTING, id: '1' }),
    provenance: { source: 'InternalListing' },
  });
  assert.strictEqual(legalFact.domain, 'LEGAL_TITLE');
});

asyncTest('25-30 + 47-48. live PI unchanged', async () => {
  const report = await assemblePropertyIntelligenceReport({
    property: {
      id: 12,
      title: 'Building foundation fixture',
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
  assert.strictEqual(report.buildingConditionDomain, undefined);
  assert.ok(report.planningDomain);
  assert.ok(report.environmentDomain);
  assert.ok(report.legalTitleDomain);
  assert.strictEqual(report.buildingConditionDomain, undefined);
  assert.strictEqual(report.marketIntelligence.sale.centralEstimate, 195000);
  assert.strictEqual(report.marketIntelligence.rent.recommendedRent, 1100);
  const engine = read('../services/ai/propertyIntelligenceEngine.js');
  assert.ok(!engine.includes('adaptBuildingConditionFoundation'));
  assert.ok(engine.includes('buildRisks('));
  const scoring = read('../services/ai/propertyScoring.js');
  assert.ok(scoring.includes('buildRisks') || scoring.includes('risks'));
});

(async () => {
  for (const item of pending) {
    await item.fn();
    console.log(`  ok  ${item.name}`);
  }
  console.log('\nbuilding condition foundation passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
