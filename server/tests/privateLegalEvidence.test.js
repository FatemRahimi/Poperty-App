/**
 * Phase 9 — private legal evidence ingest + LEGAL_TITLE consumption.
 * Run: node server/tests/privateLegalEvidence.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  DOMAIN_ID,
  DOMAIN_STATUS,
  KERNEL_ASSESSMENT,
  IDENTITY_KIND,
  ASSET_CLASS,
  SOURCE_TYPE,
  VISIBILITY,
  platformRegistry,
  LEGAL_DOCUMENT_TYPE,
  LEGAL_FACT_TYPE,
  EXTRACTION_STATE,
  createTitleRef,
  createLegalDocument,
  PRIVATE_EVIDENCE_SOURCE_TYPE,
  VERIFICATION_STATE,
  PRIVATE_EXTRACTION_STATE,
  MAX_EVIDENCE_BYTES,
  normalizeDocumentType,
  normalizeLegalDocumentType,
  normalizeSourceType,
  sanitizeOriginalFilename,
  createClaimedSubjectRef,
  createPrivateEvidenceDocument,
  toPublicEvidenceDocument,
} = require('../architecture');
const { adaptLegalTitleFoundation } = require('../services/domains/legalTitleDomain');
const { composeLiveDomainEnvelopes } = require('../services/domains/composeLiveDomains');
const storage = require('../services/evidence/privateEvidenceStorage');
const { sanitizePrivateEvidenceSnapshot } = require('../services/evidence/sanitizePrivateEvidence');
const { canReadDocument, toSafeRecord, ingestError } = require('../services/evidence/privateEvidenceIngest');
const { snapshotLegalEvidence } = require('../services/evidence/legalEvidenceConsumer');
const { assemblePropertyIntelligenceReport } = require('../services/ai/propertyIntelligenceEngine');
const { applyReportAccessPolicy } = require('../services/ai/propertyIntelligenceAccess');
const { toPublicIntelligenceHttpOutput } = require('../services/ai/propertyIntelligenceProduction');

function identity() {
  return {
    listingId: '12',
    subjectId: null,
    uprn: '100023336956',
    kind: IDENTITY_KIND.PROPERTY,
  };
}

function pdfBuffer(extra = '') {
  return Buffer.from(`%PDF-1.4\n${extra}1 0 obj<<>>endobj\n%%EOF\n`);
}

function listing() {
  return {
    id: 12,
    title: '12 Test Street',
    city: 'London',
    zip_code: 'E1 6AN',
    property_type: 'flat',
    property_category: 'residential',
    price: 200000,
    bedrooms: 2,
    bathrooms: 1,
    tenure: 'leasehold',
    user_id: 1,
    status: 'approved',
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

function read(rel) {
  return fs.readFileSync(path.join(__dirname, rel), 'utf8');
}

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const pending = [];
function asyncTest(name, fn) {
  pending.push({ name, fn });
}

console.log('private legal evidence\n');

test('1. authorised contract accepts a legal upload envelope', () => {
  const doc = createPrivateEvidenceDocument({
    documentId: '11111111-1111-1111-1111-111111111111',
    ownerUserId: 1,
    domain: 'LEGAL_TITLE',
    documentType: LEGAL_DOCUMENT_TYPE.TITLE_REGISTER,
    mimeType: 'application/pdf',
    byteSize: 1200,
    contentHash: 'abc',
    sourceType: PRIVATE_EVIDENCE_SOURCE_TYPE.USER_UPLOADED_OFFICIAL_COPY,
    originalFilename: 'title.pdf',
  });
  assert.strictEqual(doc.fileReceived, true);
  assert.strictEqual(doc.authenticityVerified, false);
  assert.strictEqual(doc.officialSource, false);
  assert.strictEqual(doc.visibility, VISIBILITY.PRIVATE);
  assert.strictEqual(doc.sharedPropertyEvidence, false);
});

test('2. unauthenticated ingest error', () => {
  const err = ingestError('UNAUTHENTICATED');
  assert.strictEqual(err.status, 401);
});

test('3. unauthorized subject ingest error', () => {
  assert.strictEqual(ingestError('UNAUTHORIZED_SUBJECT').status, 403);
});

test('4. unauthorized document read is a 404, not an existence leak', () => {
  const err = ingestError('DOCUMENT_NOT_FOUND');
  assert.strictEqual(err.status, 404);
  assert.ok(!/another user|already belongs/i.test(err.message));
  assert.strictEqual(canReadDocument({ ownerUserId: 2, archivedAt: null }, { userId: 1, role: 'user' }), false);
  assert.strictEqual(canReadDocument({ ownerUserId: 1, archivedAt: null }, { userId: 1, role: 'user' }), true);
  assert.strictEqual(canReadDocument({ ownerUserId: 2, archivedAt: null }, { userId: 1, role: 'admin' }), true);
});

test('5. shared property identity does not share another user document', () => {
  const mine = canReadDocument({ ownerUserId: 1, archivedAt: null }, { userId: 1 });
  const theirs = canReadDocument({ ownerUserId: 2, archivedAt: null }, { userId: 1 });
  assert.strictEqual(mine, true);
  assert.strictEqual(theirs, false);
});

test('6-8. private storage uses generated identity and is not a public URL', () => {
  const key = storage.createStorageKey();
  assert.ok(/^[0-9a-f-]{36}$/i.test(key));
  const dest = storage.resolveStoragePath(key);
  assert.ok(dest.includes('private-evidence') || dest.includes(process.env.PRIVATE_EVIDENCE_ROOT || 'private-evidence'));
  assert.ok(!dest.includes('/uploads/'));
  assert.throws(() => storage.resolveStoragePath('../secret'), /INVALID_STORAGE_KEY/);
  assert.throws(() => storage.resolveStoragePath('a/b'), /INVALID_STORAGE_KEY/);
});

test('9. path traversal filename is metadata-only', () => {
  assert.strictEqual(sanitizeOriginalFilename('..\\..\\etc\\passwd.pdf'), 'passwd.pdf');
  assert.strictEqual(sanitizeOriginalFilename('/tmp/../title-register.pdf'), 'title-register.pdf');
});

test('10. MIME validation rejects unsupported types', () => {
  assert.throws(
    () => storage.validateUploadBuffer({
      buffer: Buffer.from('hello'),
      mimeType: 'application/zip',
      originalFilename: 'x.zip',
    }),
    /UNSUPPORTED_FILE_TYPE/
  );
});

test('11. extension mismatch is rejected', () => {
  assert.throws(
    () => storage.validateUploadBuffer({
      buffer: pdfBuffer(),
      mimeType: 'application/pdf',
      originalFilename: 'register.exe',
    }),
    /EXTENSION_MISMATCH/
  );
});

test('12. file-size limit', () => {
  assert.throws(
    () => storage.validateUploadBuffer({
      buffer: Buffer.alloc(MAX_EVIDENCE_BYTES + 1, 1),
      mimeType: 'application/pdf',
      originalFilename: 'big.pdf',
    }),
    /FILE_TOO_LARGE/
  );
});

test('13. zero-byte rejection', () => {
  assert.throws(
    () => storage.validateUploadBuffer({
      buffer: Buffer.alloc(0),
      mimeType: 'application/pdf',
      originalFilename: 'empty.pdf',
    }),
    /ZERO_BYTE_FILE/
  );
});

test('14. unsupported file rejection', () => {
  assert.throws(
    () => storage.validateUploadBuffer({
      buffer: Buffer.from('not-a-pdf'),
      mimeType: 'text/plain',
      originalFilename: 'note.txt',
    }),
    /UNSUPPORTED_FILE_TYPE/
  );
});

test('15. malformed PDF rejected; malformed request safe', () => {
  assert.throws(
    () => storage.validateUploadBuffer({
      buffer: Buffer.from('XXXX not pdf'),
      mimeType: 'application/pdf',
      originalFilename: 'fake.pdf',
    }),
    /MALFORMED_PDF/
  );
  assert.throws(
    () => storage.validateUploadBuffer({ buffer: null, mimeType: 'application/pdf', originalFilename: 'a.pdf' }),
    /MALFORMED_UPLOAD/
  );
});

test('16. content hash generated', () => {
  const a = storage.computeContentHash(pdfBuffer('one'));
  const b = storage.computeContentHash(pdfBuffer('two'));
  assert.strictEqual(a.length, 64);
  assert.notStrictEqual(a, b);
});

test('17. same-user duplicate is owner-hash scoped', () => {
  const src = read('../services/evidence/evidenceDocumentRepository.js');
  assert.ok(src.includes('owner_user_id = $1 AND content_hash = $2 AND domain = $3'));
});

test('18. cross-user duplicate existence is not leaked', () => {
  const src = read('../services/evidence/privateEvidenceIngest.js');
  assert.ok(!/already belongs to another user/i.test(src));
  const err = ingestError('DOCUMENT_NOT_FOUND');
  assert.ok(!/another user/i.test(err.message));
});

test('19-21. filename is not document type; UNKNOWN remains valid', () => {
  const type = normalizeDocumentType('UNKNOWN');
  assert.strictEqual(type, LEGAL_DOCUMENT_TYPE.UNKNOWN);
  const doc = createPrivateEvidenceDocument({
    documentId: '22222222-2222-2222-2222-222222222222',
    ownerUserId: 1,
    domain: 'LEGAL_TITLE',
    documentType: LEGAL_DOCUMENT_TYPE.UNKNOWN,
    originalFilename: 'title-register.pdf',
    mimeType: 'application/pdf',
    byteSize: 10,
    contentHash: 'h',
  });
  assert.strictEqual(doc.documentType, LEGAL_DOCUMENT_TYPE.UNKNOWN);
  assert.strictEqual(doc.filenameIsNotDocumentType, true);
  assert.throws(() => normalizeLegalDocumentType('SURVEY'), /DOCUMENT_TYPE_NOT_ACCEPTED/);
});

test('22. TITLE_REGISTER != TITLE_PLAN', () => {
  const { envelope } = adaptLegalTitleFoundation({
    identity: identity(),
    documents: [
      createLegalDocument({ documentId: 'reg', documentType: LEGAL_DOCUMENT_TYPE.TITLE_REGISTER }),
    ],
  });
  assert.strictEqual(envelope.assessment.titleRegisterAvailable, true);
  assert.strictEqual(envelope.assessment.titlePlanAvailable, false);
});

test('23. PROPERTY != TITLE', () => {
  const ref = createClaimedSubjectRef({ kind: IDENTITY_KIND.PROPERTY, id: '12' });
  assert.strictEqual(ref.kind, IDENTITY_KIND.PROPERTY);
  assert.strictEqual(ref.legalRelationshipProven, false);
  const title = createTitleRef({ identifier: 'NGL123' });
  assert.strictEqual(title.entityKind, IDENTITY_KIND.TITLE);
  assert.notStrictEqual(ref.kind, title.entityKind);
});

test('24. UPRN is not a title number', () => {
  assert.throws(
    () => createTitleRef({ identifier: identity().uprn, fromUprn: true }),
    /UPRN_IS_NOT_A_TITLE_NUMBER/
  );
});

test('25-26. upload != authenticity and document != legal conclusion', () => {
  const { envelope } = adaptLegalTitleFoundation({
    identity: identity(),
    documents: [
      createLegalDocument({ documentId: 'reg', documentType: LEGAL_DOCUMENT_TYPE.TITLE_REGISTER }),
    ],
  });
  assert.strictEqual(envelope.assessment.liveLegalAssessmentAvailable, false);
  assert.strictEqual(envelope.assessment.substantiveContentsAssessed, false);
  const findingsText = envelope.findings.map((row) => row.text).join(' ');
  assert.ok(!/good title|title is clean|safe to purchase/i.test(findingsText));
  assert.ok(envelope.findings.some((row) => row.id === 'title_register_supplied'));
  assert.ok(envelope.findings.some((row) => row.id === 'document_not_substantively_assessed'));
});

test('27-31. absence semantics', () => {
  const { envelope } = adaptLegalTitleFoundation({ identity: identity() });
  assert.strictEqual(envelope.assessment.absenceSemantics.noLegalDocument, 'NOT_GOOD_TITLE');
  assert.strictEqual(envelope.assessment.absenceSemantics.noExtractedCovenant, 'NOT_NO_COVENANT');
  assert.strictEqual(envelope.assessment.absenceSemantics.noExtractedEasement, 'NOT_NO_EASEMENT');
  assert.strictEqual(envelope.assessment.absenceSemantics.noExtractedCharge, 'NOT_NO_CHARGE');
  assert.strictEqual(envelope.assessment.absenceSemantics.noExtractedRestriction, 'NOT_NO_RESTRICTION');
  assert.strictEqual(envelope.assessment.absenceSemantics.noTitlePlan, 'NOT_NO_BOUNDARY_ISSUE');
});

test('32-33. model extraction remains non-authoritative; failure != absence', () => {
  const doc = createLegalDocument({
    documentId: 'x',
    documentType: LEGAL_DOCUMENT_TYPE.LEASE,
    extractionState: EXTRACTION_STATE.UNREADABLE,
  });
  assert.notStrictEqual(doc.extractionState, 'ABSENT');
  const { envelope } = adaptLegalTitleFoundation({ identity: identity(), documents: [doc] });
  assert.strictEqual(envelope.assessment.documentsPresent, true);
  assert.ok(envelope.findings.some((row) => row.id === 'lease_document_supplied'));
});

test('34-37. time semantics preserved; old document is not current', () => {
  const { envelope } = adaptLegalTitleFoundation({
    identity: identity(),
    analysisAt: '2026-08-30T00:00:00.000Z',
    documents: [
      createLegalDocument({
        documentId: 'old-reg',
        documentType: LEGAL_DOCUMENT_TYPE.TITLE_REGISTER,
        documentDate: '2018-01-01',
        evidenceAsOf: '2018-01-01',
      }),
    ],
  });
  const dateFact = envelope.evidence.find((row) => row.factType === LEGAL_FACT_TYPE.DOCUMENT_DATE);
  assert.strictEqual(dateFact.value, '2018-01-01');
  assert.strictEqual(envelope.assessment.currentRegisterStatus, KERNEL_ASSESSMENT.NOT_ASSESSED);
  assert.ok(envelope.findings.some((row) => row.id === 'document_date_recorded'));
  assert.ok(!envelope.findings.some((row) => row.id === 'document_may_not_be_current'));
  assert.ok(!envelope.unresolvedDependencies.some((row) => row.id === 'CURRENT_REGISTER_EVIDENCE_MAY_BE_REQUIRED'));
  const text = envelope.findings.map((row) => row.text).join(' ');
  assert.ok(!/one year|365 day|older than one year/i.test(text));
});

test('38-39. conflicting evidence retained; LLM does not resolve', () => {
  const { envelope } = adaptLegalTitleFoundation({
    identity: identity(),
    documents: [
      { ...createLegalDocument({ documentId: 'a', documentType: LEGAL_DOCUMENT_TYPE.TITLE_REGISTER }), declaredTitleNumber: 'NGL1' },
      { ...createLegalDocument({ documentId: 'b', documentType: LEGAL_DOCUMENT_TYPE.TITLE_PLAN }), declaredTitleNumber: 'NGL2' },
    ],
  });
  assert.ok(envelope.findings.some((row) => row.id === 'conflicting_title_references'));
  assert.strictEqual(envelope.assessment.conflict.resolvedValue, null);
  const src = read('../services/domains/legalTitleDomain.js');
  assert.ok(!src.includes('openai'));
});

test('40-41. legal fact is source-linked and document-linked', () => {
  const { envelope } = adaptLegalTitleFoundation({
    identity: identity(),
    documents: [
      {
        ...createLegalDocument({ documentId: 'tn', documentType: LEGAL_DOCUMENT_TYPE.TITLE_REGISTER }),
        declaredTitleNumber: 'NGL999',
      },
    ],
  });
  const fact = envelope.evidence.find((row) => row.factType === LEGAL_FACT_TYPE.TITLE_NUMBER);
  assert.strictEqual(fact.value, 'NGL999');
  assert.strictEqual(fact.documentRef, 'tn');
  assert.ok(fact.provenance.source);
});

test('42-43. no documents is NOT_ASSESSED; partial document is not fully assessed', () => {
  const empty = adaptLegalTitleFoundation({ identity: identity() }).envelope;
  assert.strictEqual(empty.status, DOMAIN_STATUS.NOT_ASSESSED);
  assert.strictEqual(empty.assessment.state, KERNEL_ASSESSMENT.INSUFFICIENT_EVIDENCE);
  const partial = adaptLegalTitleFoundation({
    identity: identity(),
    documents: [createLegalDocument({ documentId: 'p', documentType: LEGAL_DOCUMENT_TYPE.LEASE })],
  }).envelope;
  assert.strictEqual(partial.status, DOMAIN_STATUS.PARTIAL);
  assert.strictEqual(partial.assessment.liveLegalAssessmentAvailable, false);
  assert.notStrictEqual(partial.assessment.state, KERNEL_ASSESSMENT.ASSESSED);
});

test('44-48. deterministic safe findings only', () => {
  const { envelope } = adaptLegalTitleFoundation({
    identity: identity(),
    documents: [
      createLegalDocument({ documentId: 'r', documentType: LEGAL_DOCUMENT_TYPE.TITLE_REGISTER }),
      createLegalDocument({ documentId: 'p', documentType: LEGAL_DOCUMENT_TYPE.TITLE_PLAN }),
      createLegalDocument({ documentId: 'l', documentType: LEGAL_DOCUMENT_TYPE.LEASE }),
    ],
  });
  const text = envelope.findings.map((row) => row.text).join(' ');
  assert.ok(/Title register document supplied/.test(text));
  assert.ok(/Title plan document supplied/.test(text));
  assert.ok(/Lease document supplied/.test(text));
  assert.ok(!/good title|clean title|no adverse rights|development permitted|access guaranteed|mortgageable/i.test(text));
  assert.strictEqual(envelope.assessment.legalRiskScore, null);
  assert.strictEqual(envelope.assessment.solicitorRecommendation, null);
});

test('49-54. current intelligence freeze — source isolation', () => {
  const engine = read('../services/ai/propertyIntelligenceEngine.js');
  assert.ok(!engine.includes('legalTitleDomain.valuation'));
  const legal = read('../services/domains/legalTitleDomain.js');
  assert.ok(!legal.includes('calculatePropertyValuation'));
  assert.ok(!legal.includes('analyseRent'));
  assert.ok(!legal.includes('personalDecisionEngine'));
  assert.ok(!legal.includes('decisionIntelligence'));
  assert.ok(!legal.includes('compareIntelligenceWhatIf'));
});

test('55-62. neighbouring domains and provider cost unchanged', () => {
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.PLANNING).wiredIntoLiveAnalysis, true);
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.ENVIRONMENT).wiredIntoLiveAnalysis, true);
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.BUILDING_CONDITION).wiredIntoLiveAnalysis, false);
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.DEVELOPMENT).wiredIntoLiveAnalysis, false);
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.PROJECT_COST).wiredIntoLiveAnalysis, false);
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.LEGAL_TITLE).mayIncurProviderCost, false);
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.LEGAL_TITLE).wiredIntoLiveAnalysis, true);
});

test('63-67. snapshot sanitization strips storage and bytes', () => {
  const snap = sanitizePrivateEvidenceSnapshot({
    legalTitleDomain: {
      documents: [{
        documentId: 'd1',
        storageKey: 'secret-key',
        storagePath: '/tmp/private-evidence/secret-key',
        bytes: Buffer.from('abc').toString('base64'),
      }],
    },
  });
  assert.strictEqual(snap.legalTitleDomain.documents[0].documentId, 'd1');
  assert.strictEqual(snap.legalTitleDomain.documents[0].storageKey, undefined);
  assert.strictEqual(snap.legalTitleDomain.documents[0].storagePath, undefined);
  assert.strictEqual(snap.legalTitleDomain.documents[0].bytes, undefined);
  const publicHttp = toPublicIntelligenceHttpOutput({
    success: true,
    storage_key: 'nope',
    legalTitleDomain: { documents: [{ object_key: 's3://x' }] },
  });
  assert.strictEqual(publicHttp.storage_key, undefined);
  assert.strictEqual(publicHttp.legalTitleDomain.documents[0].object_key, undefined);
});

['LAND', 'DEVELOPMENT_SITE', 'COMMERCIAL', 'INDUSTRIAL', 'AGRICULTURAL', 'MIXED_USE', 'UNKNOWN'].forEach((cls) => {
  test(`${cls} legal evidence subject remains valid`, () => {
    const { envelope } = adaptLegalTitleFoundation({
      identity: identity(),
      assetClassification: { assetClass: ASSET_CLASS[cls] || cls },
      documents: [createLegalDocument({ documentId: cls, documentType: LEGAL_DOCUMENT_TYPE.UNKNOWN })],
    });
    assert.strictEqual(envelope.subject.assetClass, cls);
    assert.strictEqual(envelope.assessment.liveLegalAssessmentAvailable, false);
  });
});

test('75-76. no paid provider; no legal advice', () => {
  const ingest = read('../services/evidence/privateEvidenceIngest.js');
  assert.ok(!/hmlr|landregistry|titleplus/i.test(ingest));
  const { envelope } = adaptLegalTitleFoundation({ identity: identity() });
  assert.ok(envelope.limitations.some((row) => /not legal advice/i.test(row)));
});

test('77. live-domain failure isolation', () => {
  const isolated = composeLiveDomainEnvelopes([
    { domain: DOMAIN_ID.PLANNING, version: 'planning-domain-1.0.0', status: DOMAIN_STATUS.AVAILABLE },
    { domain: DOMAIN_ID.ENVIRONMENT, version: 'environment-domain-1.0.0', status: DOMAIN_STATUS.AVAILABLE },
    null,
  ]);
  assert.ok(isolated.byId.PLANNING);
  assert.ok(isolated.byId.ENVIRONMENT);
  assert.strictEqual(isolated.byId.LEGAL_TITLE, undefined);
});

test('upload is never OFFICIAL_SOURCE', () => {
  assert.throws(() => normalizeSourceType('OFFICIAL_SOURCE'), /UPLOAD_IS_NOT_OFFICIAL_SOURCE/);
  assert.strictEqual(
    normalizeSourceType(PRIVATE_EVIDENCE_SOURCE_TYPE.USER_UPLOADED_OFFICIAL_COPY),
    PRIVATE_EVIDENCE_SOURCE_TYPE.USER_UPLOADED_OFFICIAL_COPY
  );
});

test('public API document omits storage key', () => {
  const publicDoc = toPublicEvidenceDocument(createPrivateEvidenceDocument({
    documentId: '33333333-3333-3333-3333-333333333333',
    ownerUserId: 9,
    domain: 'LEGAL_TITLE',
    documentType: LEGAL_DOCUMENT_TYPE.DEED,
    mimeType: 'application/pdf',
    byteSize: 20,
    contentHash: 'hash',
    originalFilename: 'deed.pdf',
  }));
  assert.strictEqual(publicDoc.storageKey, undefined);
  assert.strictEqual(publicDoc.contentHash, undefined);
  assert.strictEqual(publicDoc.ownerUserId, undefined);
  assert.strictEqual(publicDoc.extractionState, PRIVATE_EXTRACTION_STATE.NOT_EXTRACTED);
  assert.ok(publicDoc.verificationState === VERIFICATION_STATE.UNVERIFIED
    || publicDoc.verificationState === VERIFICATION_STATE.USER_DECLARED);
});

test('safe record used by API never includes storageKey', () => {
  const safe = toSafeRecord({
    documentId: '44444444-4444-4444-4444-444444444444',
    ownerUserId: 3,
    domain: 'LEGAL_TITLE',
    documentType: LEGAL_DOCUMENT_TYPE.TRANSFER,
    originalFilename: 'transfer.pdf',
    mimeType: 'application/pdf',
    byteSize: 30,
    contentHash: 'c',
    storageKey: 'should-not-leak',
    sourceType: PRIVATE_EVIDENCE_SOURCE_TYPE.USER_UPLOADED_PRIVATE_DOCUMENT,
    source: PRIVATE_EVIDENCE_SOURCE_TYPE.USER_UPLOADED_PRIVATE_DOCUMENT,
    documentDate: '2020-01-01',
    uploadedAt: '2026-08-30T00:00:00.000Z',
    evidenceAsOf: '2020-01-01',
    verificationState: VERIFICATION_STATE.USER_DECLARED,
    extractionState: PRIVATE_EXTRACTION_STATE.NOT_EXTRACTED,
    privacy: VISIBILITY.PRIVATE,
    provenance: {},
    subjects: [{ kind: IDENTITY_KIND.PROPERTY, id: '12' }],
  });
  assert.strictEqual(safe.storageKey, undefined);
  assert.strictEqual(JSON.stringify(safe).includes('should-not-leak'), false);
});

test('snapshot legal evidence has no storage path', () => {
  const snap = snapshotLegalEvidence([
    {
      documentId: 's1',
      documentType: 'TITLE_REGISTER',
      sourceType: SOURCE_TYPE.USER_REPORTED,
      storageKey: 'abc',
      storagePath: '/secret',
    },
  ]);
  assert.strictEqual(snap[0].storageKey, undefined);
  assert.strictEqual(snap[0].storagePath, undefined);
});

test('public report policy strips another viewer from legal documents', () => {
  const filtered = applyReportAccessPolicy({
    legalTitleDomain: {
      documents: [{ documentId: 'secret' }],
      evidence: [{ factType: 'TITLE_NUMBER' }],
      assessment: { documentsPresent: true, titleRegisterAvailable: true },
    },
    professionalInsights: { x: 1 },
  }, { accessLevel: 'public_intelligence', userId: 9, role: 'buyer', relationship: 'public_viewer' });
  assert.deepStrictEqual(filtered.legalTitleDomain.documents, []);
  assert.strictEqual(filtered.professionalInsights, null);
});

test('very long filename is truncated', () => {
  const name = `${'a'.repeat(400)}.pdf`;
  assert.ok(sanitizeOriginalFilename(name).length <= 255);
});

test('extraction default is NOT_ATTEMPTED / NOT_EXTRACTED', () => {
  assert.strictEqual(PRIVATE_EXTRACTION_STATE.NOT_ATTEMPTED, 'NOT_ATTEMPTED');
  const doc = createLegalDocument({ documentId: 'e', documentType: LEGAL_DOCUMENT_TYPE.OFFICIAL_COPY });
  assert.strictEqual(doc.extractionState, EXTRACTION_STATE.NOT_EXTRACTED);
});

asyncTest('storage write/read/delete uses generated key only', async () => {
  const prev = process.env.PRIVATE_EVIDENCE_ROOT;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-evidence-'));
  process.env.PRIVATE_EVIDENCE_ROOT = root;
  try {
    const buffer = pdfBuffer('stored');
    const stored = await storage.storePrivateBuffer(buffer);
    assert.ok(!stored.storageKey.includes('/'));
    const readBack = await storage.readPrivateBuffer(stored.storageKey);
    assert.strictEqual(storage.computeContentHash(readBack), storage.computeContentHash(buffer));
    await storage.deletePrivateBuffer(stored.storageKey);
  } finally {
    process.env.PRIVATE_EVIDENCE_ROOT = prev;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

asyncTest('live analysis keeps valuation/rent/finance isolation with legal envelope', async () => {
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
  assert.strictEqual(report.marketIntelligence.sale.centralEstimate, 195000);
  assert.strictEqual(report.marketIntelligence.rent.recommendedRent, 1100);
  assert.ok(report.planningDomain);
  assert.ok(report.environmentDomain);
  assert.strictEqual(report.buildingConditionDomain, undefined);
  assert.strictEqual(report.developmentDomain, undefined);
  assert.strictEqual(report.projectCostDomain, undefined);
  const persist = read('../services/ai/propertyIntelligenceProduction.js');
  assert.ok(persist.includes('sanitizePrivateEvidenceSnapshot(output)'));
});

(async () => {
  for (const item of pending) {
    await item.fn();
    console.log(`  ok  ${item.name}`);
  }
  console.log(`\nprivate legal evidence passed (${passed + pending.length} checks)`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
