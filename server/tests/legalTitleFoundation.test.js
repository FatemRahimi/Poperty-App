/**
 * Legal & Title evidence foundation — contracts only, not a live legal engine.
 * Run: node server/tests/legalTitleFoundation.test.js
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
  LEGAL_TITLE_DOMAIN_VERSION,
  PLANNING_DOMAIN_VERSION,
  ENVIRONMENT_DOMAIN_VERSION,
  platformRegistry,
  capabilityFor,
  historicalReportIsReadable,
  createSubjectRef,
  createIdentityRelation,
  createTitleRef,
  assertPropertyIsNotTitle,
  createLegalDocument,
  createLegalTitleFact,
  missingDocumentAssessment,
  describeTenureConflict,
  normalizeTenureValue,
  LEGAL_DOCUMENT_TYPE,
  LEGAL_FACT_TYPE,
  FORBIDDEN_LEGAL_FACT_TYPE,
  LEGAL_ROLE,
  LEGAL_EVIDENCE_CLASS,
  MISSING_DOCUMENT,
  LEGAL_CONFLICT,
  EXTRACTION_STATE,
  DESIGNATION_OWNERSHIP,
  TITLE_IDENTIFIER_TYPE,
  assertEvidenceVisibility,
  isAuthoritativeEvidence,
} = require('../architecture');
const {
  adaptLegalTitleFoundation,
  attachLegalTitleFoundation,
} = require('../services/domains/legalTitleDomain');
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

function listing(overrides = {}) {
  return {
    id: 12,
    title: 'Legal foundation fixture',
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

console.log('legal title foundation\n');

test('1. LEGAL_TITLE domain ID stable', () => {
  assert.strictEqual(DOMAIN_ID.LEGAL_TITLE, 'LEGAL_TITLE');
  assert.ok(platformRegistry.getDomain(DOMAIN_ID.LEGAL_TITLE));
  assert.strictEqual(LEGAL_TITLE_DOMAIN_VERSION, 'legal-title-domain-0.1.0');
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.LEGAL_TITLE).version, LEGAL_TITLE_DOMAIN_VERSION);
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.LEGAL_TITLE).wiredIntoLiveAnalysis, true);
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.LEGAL_TITLE).implementationStatus, 'PARTIAL');
});

test('2. UNKNOWN title state valid', () => {
  const ref = createTitleRef({});
  assert.strictEqual(ref.present, false);
  assert.strictEqual(ref.state, 'NOT_ASSESSED');
  assert.strictEqual(ref.entityKind, IDENTITY_KIND.TITLE);
});

test('3. PROPERTY does not equal TITLE', () => {
  assert.notStrictEqual(IDENTITY_KIND.PROPERTY, IDENTITY_KIND.TITLE);
  const propertyRef = createSubjectRef({ kind: IDENTITY_KIND.PROPERTY, id: 'asset-1' });
  const titleRef = createTitleRef({ identifier: 'MAN123456', identifierType: TITLE_IDENTIFIER_TYPE.TITLE_NUMBER });
  assert.strictEqual(assertPropertyIsNotTitle(propertyRef, titleRef), true);
  const relation = createIdentityRelation(propertyRef, createSubjectRef({
    kind: IDENTITY_KIND.TITLE,
    id: 'MAN123456',
  }), 'UNKNOWN');
  assert.strictEqual(relation.legalRelationshipClaimed, false);
});

test('4. UPRN does not become title number', () => {
  assert.throws(() => createTitleRef({ identifier: '10001233621', identifierType: 'UPRN' }), /UPRN_IS_NOT_A_TITLE_NUMBER/);
  assert.throws(() => createTitleRef({ identifier: '10001233621', fromUprn: true }), /UPRN_IS_NOT_A_TITLE_NUMBER/);
  assert.throws(
    () => adaptLegalTitleFoundation({
      identity: identity(),
      titleRefs: [{ identifier: '10001233621', identifierType: TITLE_IDENTIFIER_TYPE.TITLE_NUMBER }],
    }),
    /UPRN_IS_NOT_A_TITLE_NUMBER/
  );
});

test('5. one property may reference multiple titles', () => {
  const { envelope } = adaptLegalTitleFoundation({
    identity: identity(),
    titleRefs: [
      { identifier: 'MAN111', identifierType: TITLE_IDENTIFIER_TYPE.TITLE_NUMBER, source: 'UserReported' },
      { identifier: 'MAN222', identifierType: TITLE_IDENTIFIER_TYPE.TITLE_NUMBER, source: 'UserReported' },
    ],
  });
  assert.strictEqual(envelope.subject.titles.length, 2);
  assert.strictEqual(envelope.subject.propertyIsNotTitle, true);
});

test('6. document type UNKNOWN valid', () => {
  const doc = createLegalDocument({
    documentId: 'doc-1',
    documentType: LEGAL_DOCUMENT_TYPE.UNKNOWN,
    filename: 'scan.pdf',
  });
  assert.strictEqual(doc.documentType, 'UNKNOWN');
  assert.strictEqual(doc.filenameIsNotDocumentType, true);
});

test('7-9. missing document is not no restriction / freehold / clean title', () => {
  const register = missingDocumentAssessment(MISSING_DOCUMENT.TITLE_REGISTER_NOT_PROVIDED);
  const lease = missingDocumentAssessment(MISSING_DOCUMENT.LEASE_NOT_PROVIDED);
  assert.strictEqual(register.value, null);
  assert.strictEqual(register.notClearTitle, true);
  assert.strictEqual(register.notNoRestriction, true);
  assert.strictEqual(lease.notFreehold, true);
  const { envelope } = adaptLegalTitleFoundation({ identity: identity() });
  const blob = JSON.stringify(envelope);
  assert.ok(!/title is clean|title is good|there is no restriction|no covenants exist/i.test(blob));
  assert.strictEqual(envelope.assessment.titleRegisterAvailable, false);
  assert.strictEqual(envelope.assessment.titlePlanAvailable, false);
  assert.strictEqual(envelope.assessment.liveLegalAssessmentAvailable, false);
});

test('10-12. listing-declared tenure retains provenance and is not authoritative', () => {
  const { envelope } = adaptLegalTitleFoundation({
    identity: identity(),
    propertyFacts: {
      facts: {
        tenure: {
          available: true,
          value: 'leasehold',
          source: 'InternalListing',
          retrievedAt: '2026-08-01T10:00:00.000Z',
        },
      },
    },
  });
  const tenure = envelope.evidence.find((row) => row.factType === LEGAL_FACT_TYPE.TENURE);
  assert.strictEqual(tenure.value, 'LEASEHOLD');
  assert.strictEqual(tenure.sourceType, SOURCE_TYPE.USER_REPORTED);
  assert.strictEqual(tenure.provenance.source, 'InternalListing');
  assert.strictEqual(tenure.authoritative, false);
  assert.strictEqual(isAuthoritativeEvidence(tenure), false);
  assert.strictEqual(tenure.legalClass, LEGAL_EVIDENCE_CLASS.LEGAL_TITLE_ADJACENT);
});

test('11. document-supported tenure retains provenance', () => {
  const { envelope } = adaptLegalTitleFoundation({
    identity: identity(),
    propertyFacts: {
      facts: {
        tenure: { available: true, value: 'Leasehold', source: 'PropertyData_registeredLeases' },
      },
      registeredLeases: [{ leaseId: 'L1' }],
    },
  });
  const tenure = envelope.evidence.find((row) => row.factType === LEGAL_FACT_TYPE.TENURE);
  assert.strictEqual(tenure.sourceType, SOURCE_TYPE.LICENSED_PROVIDER);
  assert.strictEqual(tenure.provenance.source, 'PropertyData_registeredLeases');
});

test('13. conflicting tenure is not silently overwritten', () => {
  const { envelope } = adaptLegalTitleFoundation({
    identity: identity(),
    listingTenure: 'freehold',
    propertyFacts: {
      facts: { tenure: { available: true, value: 'freehold', source: 'InternalListing' } },
      registeredLeases: [{ leaseId: 'L1', termStartDate: '2000-01-01' }],
    },
  });
  assert.strictEqual(envelope.assessment.conflict.state, LEGAL_CONFLICT.CONFLICTING_EVIDENCE);
  assert.strictEqual(envelope.assessment.conflict.resolvedValue, null);
  assert.strictEqual(envelope.assessment.conflict.silentlyOverwritten, false);
  assert.ok(!envelope.evidence.some((row) => row.factType === LEGAL_FACT_TYPE.TENURE));
  assert.ok(envelope.findings.some((row) => row.id === 'conflicting_tenure_evidence'));
});

test('14. source / effective / retrieval dates remain distinct', () => {
  assert.notStrictEqual(TIME_FIELD.retrievedAt, TIME_FIELD.evidenceAsOf);
  assert.notStrictEqual(TIME_FIELD.documentDate, TIME_FIELD.retrievedAt);
  assert.notStrictEqual(TIME_FIELD.effectiveFrom, TIME_FIELD.analysisAt);
  const fact = createLegalTitleFact({
    factType: LEGAL_FACT_TYPE.LEASE_START_DATE,
    value: '2000-01-01',
    subjectRef: createSubjectRef({ kind: IDENTITY_KIND.LISTING, id: '12' }),
    documentRef: 'doc-lease',
    provenance: { source: 'LeaseDocument' },
    documentDate: '1999-12-01',
    effectiveFrom: '2000-01-01',
    retrievedAt: '2026-08-01T10:00:00.000Z',
    evidenceAsOf: '2026-08-01T10:00:00.000Z',
    legalRole: LEGAL_ROLE.EXTRACTED_FACT,
  });
  assert.strictEqual(fact.documentDate, '1999-12-01');
  assert.strictEqual(fact.effectiveFrom, '2000-01-01');
  assert.strictEqual(fact.retrievedAt, '2026-08-01T10:00:00.000Z');
  assert.notStrictEqual(fact.documentDate, fact.retrievedAt);
});

test('15. private document cannot leak as shared property evidence', () => {
  const doc = createLegalDocument({
    documentId: 'priv-1',
    documentType: LEGAL_DOCUMENT_TYPE.LEASE,
    uploadedBy: 99,
    visibility: VISIBILITY.PRIVATE,
  });
  assert.strictEqual(doc.visibility, VISIBILITY.PRIVATE);
  assert.strictEqual(doc.sharedPropertyEvidence, false);
  assert.strictEqual(doc.uploadedBy, 99);
  assert.throws(
    () => assertEvidenceVisibility({
      factType: 'legalDocumentUpload',
      visibility: VISIBILITY.PRIVATE,
      sharedPropertyEvidence: true,
    }),
    /PRIVATE_DATA_CANNOT_BE_SHARED_PROPERTY_EVIDENCE/
  );
});

test('16. historical snapshot unchanged', () => {
  const old = { modelVersion: 'property-intelligence-v1.1', personalDecision: { score: 40 } };
  assert.strictEqual(historicalReportIsReadable(old), true);
  assert.strictEqual(old.legalTitleDomain, undefined);
  const history = read('../../client/src/Utils/savedIntelligenceReport.js');
  assert.ok(!/adaptLegalTitleFoundation|getTitleRegister/.test(history));
});

test('17-18. model-assisted extraction is non-authoritative and keeps document ref', () => {
  const fact = createLegalTitleFact({
    factType: LEGAL_FACT_TYPE.LEASE_TERM_YEARS,
    value: 125,
    subjectRef: createSubjectRef({ kind: IDENTITY_KIND.LISTING, id: '12' }),
    documentRef: 'doc-lease',
    sourceType: SOURCE_TYPE.MODEL_ASSISTED,
    provenance: { source: 'LeaseDocument', extractor: 'model' },
    legalRole: LEGAL_ROLE.EXTRACTED_FACT,
  });
  assert.strictEqual(fact.authoritative, false);
  assert.strictEqual(fact.classification, EVIDENCE_CLASS.INFERENCE);
  assert.strictEqual(fact.documentRef, 'doc-lease');
  assert.strictEqual(isAuthoritativeEvidence(fact), false);
});

test('19-22. no covenant, easement, title-quality, or legal recommendation invented', () => {
  assert.throws(
    () => createLegalTitleFact({
      factType: FORBIDDEN_LEGAL_FACT_TYPE.NO_COVENANTS,
      subjectRef: createSubjectRef({ kind: IDENTITY_KIND.LISTING, id: '1' }),
      provenance: { source: 'x' },
    }),
    /FORBIDDEN_LEGAL_CONCLUSION/
  );
  assert.throws(
    () => createLegalTitleFact({
      factType: FORBIDDEN_LEGAL_FACT_TYPE.NO_EASEMENT,
      subjectRef: createSubjectRef({ kind: IDENTITY_KIND.LISTING, id: '1' }),
      provenance: { source: 'x' },
    }),
    /FORBIDDEN_LEGAL_CONCLUSION/
  );
  assert.throws(
    () => createLegalTitleFact({
      factType: FORBIDDEN_LEGAL_FACT_TYPE.TITLE_QUALITY,
      subjectRef: createSubjectRef({ kind: IDENTITY_KIND.LISTING, id: '1' }),
      provenance: { source: 'x' },
    }),
    /FORBIDDEN_LEGAL_CONCLUSION/
  );
  assert.throws(
    () => createLegalTitleFact({
      factType: FORBIDDEN_LEGAL_FACT_TYPE.LEGAL_RECOMMENDATION,
      subjectRef: createSubjectRef({ kind: IDENTITY_KIND.LISTING, id: '1' }),
      provenance: { source: 'x' },
    }),
    /FORBIDDEN_LEGAL_CONCLUSION/
  );
  assert.throws(
    () => createLegalTitleFact({
      factType: LEGAL_FACT_TYPE.TENURE,
      value: 'LEASEHOLD',
      subjectRef: createSubjectRef({ kind: IDENTITY_KIND.LISTING, id: '1' }),
      provenance: { source: 'x' },
      legalRole: LEGAL_ROLE.LEGAL_INTERPRETATION,
    }),
    /LEGAL_INTERPRETATION_NOT_PERMITTED/
  );
});

test('23-25. listed building, conservation area, Article 4 are not title evidence', () => {
  assert.strictEqual(DESIGNATION_OWNERSHIP.listedBuilding, LEGAL_EVIDENCE_CLASS.HERITAGE_DESIGNATION);
  assert.strictEqual(DESIGNATION_OWNERSHIP.conservationArea, LEGAL_EVIDENCE_CLASS.HERITAGE_DESIGNATION);
  assert.strictEqual(DESIGNATION_OWNERSHIP.article4, LEGAL_EVIDENCE_CLASS.PLANNING_CONSTRAINT);
  const src = read('../services/domains/legalTitleDomain.js');
  assert.ok(!src.includes('listedBuildingEvidence'));
  assert.ok(!src.includes('conservationAreaEvidence'));
  assert.ok(!src.includes('article4Evidence'));
  const { envelope } = adaptLegalTitleFoundation({
    identity: identity(),
    propertyFacts: {
      facts: {
        listedBuilding: { available: true, value: 'Grade II' },
        conservationArea: { available: true, value: 'Yes' },
        article4: { available: true, value: 'Yes' },
      },
    },
  });
  assert.ok(!envelope.evidence.some((row) => /listed|conservation|article4/i.test(row.factType)));
});

['RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL', 'AGRICULTURAL', 'LAND', 'DEVELOPMENT_SITE', 'MIXED_USE'].forEach((cls) => {
  test(`${cls} legal foundation is CONDITIONAL, not full support`, () => {
    const { envelope, assetClassUnchanged } = adaptLegalTitleFoundation({
      identity: identity(),
      assetClassification: { assetClass: cls },
    });
    assert.strictEqual(envelope.subject.assetClass, cls);
    assert.strictEqual(assetClassUnchanged, cls);
    assert.strictEqual(capabilityFor(DOMAIN_ID.LEGAL_TITLE, cls), CAPABILITY.CONDITIONAL);
    assert.notStrictEqual(capabilityFor(DOMAIN_ID.LEGAL_TITLE, cls), CAPABILITY.SUPPORTED);
  });
});

test('33. UNKNOWN asset class remains valid', () => {
  const { envelope } = adaptLegalTitleFoundation({
    identity: identity(),
    assetClassification: { assetClass: ASSET_CLASS.UNKNOWN },
  });
  assert.strictEqual(envelope.subject.assetClass, ASSET_CLASS.UNKNOWN);
});

test('34-35. PLANNING and ENVIRONMENT stay live and compose without LEGAL_TITLE', () => {
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.PLANNING).wiredIntoLiveAnalysis, true);
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.ENVIRONMENT).wiredIntoLiveAnalysis, true);
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.LEGAL_TITLE).wiredIntoLiveAnalysis, true);
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
  const legal = adaptLegalTitleFoundation({ identity: identity() }).envelope;
  const live = composeLiveDomainEnvelopes([planning, environment, legal]);
  assert.strictEqual(live.domains.length, 3);
  assert.ok(live.byId.PLANNING);
  assert.ok(live.byId.ENVIRONMENT);
  assert.ok(live.byId.LEGAL_TITLE);
  const isolated = composeLiveDomainEnvelopes([planning, environment, null]);
  assert.ok(isolated.byId.PLANNING);
  assert.ok(isolated.byId.ENVIRONMENT);
  assert.strictEqual(isolated.byId.LEGAL_TITLE, undefined);
});

test('43-47. freeze — no provider, no fake HMLR title, no LLM authority', () => {
  const src = read('../services/domains/legalTitleDomain.js');
  assert.ok(!src.includes('getSoldPrices'));
  assert.ok(!src.includes('queryFloodMapForPlanning'));
  assert.ok(!src.includes('openai'));
  assert.ok(!src.includes('require(\'../ai/valuationEngine\')'));
  assert.ok(!src.includes('require(\'../ai/financialEngine\')'));
  assert.ok(!src.includes('require(\'../ai/personalDecisionEngine\')'));
  assert.ok(!src.includes('require(\'../ai/decisionIntelligence\')'));
  assert.ok(src.includes('noAdditionalProviderCall: true'));
  assert.ok(src.includes('TITLE REGISTER = NOT AVAILABLE'));
  const contract = read('../architecture/legalTitleContract.js');
  assert.ok(contract.includes('UPRN_IS_NOT_A_TITLE_NUMBER'));
});

test('48. V1.1 tag unchanged; live domain versions unchanged', () => {
  const versions = read('../architecture/versions.js');
  assert.ok(versions.includes("propertyIntelligenceV11: 'property-intelligence-v1.1'"));
  assert.strictEqual(PLANNING_DOMAIN_VERSION, 'planning-domain-1.0.0');
  assert.strictEqual(ENVIRONMENT_DOMAIN_VERSION, 'environment-domain-1.0.0');
});

test('PERSON and ORGANISATION exist; missing lease != freehold', () => {
  assert.strictEqual(IDENTITY_KIND.PERSON, 'PERSON');
  assert.strictEqual(IDENTITY_KIND.ORGANISATION, 'ORGANISATION');
  const { envelope } = adaptLegalTitleFoundation({
    identity: identity(),
    listingTenure: 'leasehold',
    propertyFacts: {
      facts: { tenure: { available: true, value: 'leasehold', source: 'InternalListing' } },
    },
  });
  assert.ok(envelope.findings.some((row) => row.id === 'lease_document_not_provided'));
  assert.ok(!/is freehold/i.test(JSON.stringify(envelope)));
});

test('extraction states and unreadable document semantics', () => {
  const unread = createLegalDocument({
    documentId: 'bad',
    documentType: LEGAL_DOCUMENT_TYPE.TITLE_REGISTER,
    extractionState: EXTRACTION_STATE.UNREADABLE,
  });
  assert.strictEqual(unread.extractionState, EXTRACTION_STATE.UNREADABLE);
  const unavailable = missingDocumentAssessment(MISSING_DOCUMENT.DOCUMENT_UNREADABLE);
  assert.strictEqual(unavailable.state, KERNEL_ASSESSMENT.UNAVAILABLE);
});

test('malformed adapter input degrades safely', () => {
  const attached = attachLegalTitleFoundation({ titleRefs: [{ identifier: identity().uprn, fromUprn: true }] });
  assert.strictEqual(attached.legalTitleDomain.domain, 'LEGAL_TITLE');
  assert.ok(attached.legalTitleDomain.status);
});

test('normalizeTenureValue does not invent values', () => {
  assert.strictEqual(normalizeTenureValue('maybe'), null);
  assert.strictEqual(normalizeTenureValue('share_of_freehold'), 'SHARE_OF_FREEHOLD');
});

asyncTest('36-42. live PI includes LEGAL_TITLE envelope; valuation/rent isolation', async () => {
  const report = await assemblePropertyIntelligenceReport({
    property: listing(),
    access: access(),
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
  assert.ok(report.legalTitleDomain);
  assert.strictEqual(report.legalTitleDomain.assessment.liveLegalAssessmentAvailable, false);
  assert.ok(report.planningDomain);
  assert.ok(report.environmentDomain);
  assert.ok(report.domains.byId.LEGAL_TITLE);
  assert.strictEqual(report.marketIntelligence.sale.centralEstimate, 195000);
  assert.strictEqual(report.marketIntelligence.rent.recommendedRent, 1100);
  const engine = read('../services/ai/propertyIntelligenceEngine.js');
  assert.ok(engine.includes('attachLegalTitleFoundation'));
  assert.ok(!engine.includes('require(\'../ai/valuationEngine\')'));
});

(async () => {
  for (const item of pending) {
    await item.fn();
    console.log(`  ok  ${item.name}`);
  }
  console.log('\nlegal title foundation passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
