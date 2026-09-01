/**
 * Phase 9.1 — private evidence production hardening and reuse gate.
 * Run: node server/tests/privateEvidenceHardening.test.js
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
  SCAN_STATE,
  AVAILABILITY_STATE,
  LIFECYCLE_STATE,
  DURABILITY_STATE,
  STORAGE_PROVIDER,
  AUTHORIZATION_CLASS,
  CAPABILITY_STATUS,
  MAX_EVIDENCE_BYTES,
  createLegalDocument,
  createPrivateEvidenceDocument,
  toPublicEvidenceDocument,
} = require('../architecture');
const { adaptLegalTitleFoundation } = require('../services/domains/legalTitleDomain');
const { composeLiveDomainEnvelopes } = require('../services/domains/composeLiveDomains');
const { validateContentSignature } = require('../services/evidence/contentSignature');
const storage = require('../services/evidence/privateEvidenceStorage');
const {
  getPrivateEvidenceCapability,
  resolveStorageMode,
  IMPLEMENTED_PRODUCTION_BACKENDS,
} = require('../services/evidence/privateEvidenceConfig');
const {
  canReadDocument,
  authorizationClass,
  ingestError,
  ingestPrivateLegalDocument,
  archiveReadableDocument,
  retryFailedDeletes,
  toSafeRecord,
} = require('../services/evidence/privateEvidenceIngest');
const repository = require('../services/evidence/evidenceDocumentRepository');
const { snapshotLegalEvidence } = require('../services/evidence/legalEvidenceConsumer');
const { sanitizePrivateEvidenceSnapshot } = require('../services/evidence/sanitizePrivateEvidence');
const { classifyStorageReconcile } = require('../services/evidence/privateEvidenceAudit');
const { redactSensitiveLogText } = require('../services/ai/propertyIntelligenceProduction');
const { attachPlanningDomain } = require('../services/domains/planningDomain');
const { attachEnvironmentDomain } = require('../services/domains/environmentDomain');

function pdfBuffer(extra = '') {
  return Buffer.from(`%PDF-1.4\n${extra}1 0 obj<<>>endobj\n%%EOF\n`);
}

function jpegBuffer() {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
}

function pngBuffer() {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from('IHDR'),
  ]);
}

function identity() {
  return {
    listingId: '12',
    subjectId: null,
    uprn: '100023336956',
    kind: IDENTITY_KIND.PROPERTY,
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

function withEnv(overrides, fn) {
  const previous = {};
  Object.keys(overrides).forEach((key) => {
    previous[key] = process.env[key];
    if (overrides[key] == null) delete process.env[key];
    else process.env[key] = overrides[key];
  });
  try {
    return fn();
  } finally {
    Object.keys(overrides).forEach((key) => {
      if (previous[key] == null) delete process.env[key];
      else process.env[key] = previous[key];
    });
  }
}

console.log('private evidence hardening\n');

test('1. private root is not publicly mounted', () => {
  const app = read('../app.js');
  assert.ok(app.includes("app.use('/uploads'"));
  assert.ok(!app.includes('private-evidence'));
  assert.ok(!app.includes("express.static") || !/express\.static\([^)]*private-evidence/.test(app));
});

test('2. generated storage key only', () => {
  const key = storage.createStorageKey();
  assert.ok(/^[0-9a-f-]{36}$/i.test(key));
  assert.ok(!key.includes('/'));
  assert.ok(!key.includes('..'));
});

test('3. traversal blocked', () => {
  assert.throws(() => storage.resolveStoragePath('../secret'), /INVALID_STORAGE_KEY/);
  assert.throws(() => storage.resolveStoragePath('..\\secret'), /INVALID_STORAGE_KEY/);
  assert.throws(() => storage.resolveStoragePath('a/b'), /INVALID_STORAGE_KEY/);
  assert.throws(() => storage.resolveStoragePath('title.pdf'), /INVALID_STORAGE_KEY/);
});

asyncTest('4. symlink escape blocked where applicable', async () => {
  const prev = process.env.PRIVATE_EVIDENCE_ROOT;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-ev-sym-'));
  process.env.PRIVATE_EVIDENCE_ROOT = root;
  const key = storage.createStorageKey();
  const dest = path.join(root, key);
  const outside = path.join(os.tmpdir(), `pi-escape-${key}`);
  fs.writeFileSync(outside, 'secret');
  let linked = false;
  try {
    fs.symlinkSync(outside, dest);
    linked = true;
  } catch {
    linked = false;
  }
  try {
    if (linked) {
      await assert.rejects(
        () => storage.put(pdfBuffer('sym'), { storageKey: key }),
        /SYMLINK_REJECTED|INVALID_STORAGE_KEY|EEXIST/
      );
    } else {
      const src = read('../services/evidence/privateEvidenceStorage.js');
      assert.ok(src.includes('isSymbolicLink'));
    }
  } finally {
    process.env.PRIVATE_EVIDENCE_ROOT = prev;
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { force: true });
  }
});

test('5. zero-byte rejected', () => {
  assert.throws(
    () => storage.validateUploadBuffer({
      buffer: Buffer.alloc(0),
      mimeType: 'application/pdf',
      originalFilename: 'empty.pdf',
    }),
    /ZERO_BYTE_FILE/
  );
});

test('6. oversize rejected before unsafe resource use', () => {
  assert.throws(
    () => storage.validateUploadBuffer({
      buffer: Buffer.alloc(MAX_EVIDENCE_BYTES + 1, 1),
      mimeType: 'application/pdf',
      originalFilename: 'big.pdf',
    }),
    /FILE_TOO_LARGE/
  );
  const controller = read('../controllers/evidenceDocumentController.js');
  assert.ok(controller.includes('MAX_EVIDENCE_BYTES'));
  assert.ok(controller.includes('LIMIT_FILE_SIZE'));
  assert.ok(!controller.includes('512 * 1024 * 1024'));
});

test('7. MIME/signature mismatch rejected', () => {
  assert.throws(
    () => validateContentSignature({
      buffer: jpegBuffer(),
      mimeType: 'application/pdf',
      originalFilename: 'photo.pdf',
    }),
    /SIGNATURE_MISMATCH/
  );
  assert.throws(
    () => validateContentSignature({
      buffer: pngBuffer(),
      mimeType: 'image/jpeg',
      originalFilename: 'x.jpg',
    }),
    /SIGNATURE_MISMATCH/
  );
});

test('8. unsupported active content rejected', () => {
  assert.throws(
    () => storage.validateUploadBuffer({
      buffer: Buffer.from('<!DOCTYPE html><html><script>alert(1)</script>'),
      mimeType: 'application/pdf',
      originalFilename: 'page.pdf',
    }),
    /UNSUPPORTED_ACTIVE_CONTENT/
  );
  assert.throws(
    () => storage.validateUploadBuffer({
      buffer: Buffer.from('MZ\x90\x00fake-exe'),
      mimeType: 'image/jpeg',
      originalFilename: 'photo.jpg',
    }),
    /UNSUPPORTED_ACTIVE_CONTENT/
  );
});

test('9. SHA-256 stable', () => {
  const a = storage.computeContentHash(pdfBuffer('same'));
  const b = storage.computeContentHash(pdfBuffer('same'));
  assert.strictEqual(a, b);
  assert.strictEqual(a.length, 64);
});

asyncTest('10. byte-size/hash integrity', async () => {
  const prev = process.env.PRIVATE_EVIDENCE_ROOT;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-ev-hash-'));
  process.env.PRIVATE_EVIDENCE_ROOT = root;
  try {
    const buffer = pdfBuffer('integrity');
    const stored = await storage.put(buffer);
    const stat = await storage.stat(stored.storageKey);
    assert.strictEqual(stat.byteSize, buffer.length);
    assert.strictEqual(stat.contentHash, storage.computeContentHash(buffer));
    await storage.delete(stored.storageKey);
  } finally {
    process.env.PRIVATE_EVIDENCE_ROOT = prev;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('11. same-owner dedupe remains owner-hash scoped', () => {
  const src = read('../services/evidence/evidenceDocumentRepository.js');
  assert.ok(src.includes('owner_user_id = $1 AND content_hash = $2 AND domain = $3'));
});

test('12-13. cross-owner isolation and duplicate not leaked', () => {
  assert.strictEqual(
    canReadDocument({ ownerUserId: 2, archivedAt: null }, { userId: 1, role: 'user' }),
    false
  );
  assert.ok(!/already belongs to another user/i.test(read('../services/evidence/privateEvidenceIngest.js')));
  assert.ok(!/another user/i.test(ingestError('DOCUMENT_NOT_FOUND').message));
});

test('14-15. unauthorized read and archive use safe 404', () => {
  assert.strictEqual(ingestError('DOCUMENT_NOT_FOUND').status, 404);
  assert.ok(!/ENOENT|private-evidence|storage/i.test(ingestError('DOCUMENT_NOT_FOUND').message));
});

test('16. admin access is explicit', () => {
  assert.strictEqual(
    authorizationClass({ ownerUserId: 2 }, { userId: 1, role: 'admin' }),
    AUTHORIZATION_CLASS.ADMINISTRATIVE_ACCESS
  );
  assert.strictEqual(
    authorizationClass({ ownerUserId: 1 }, { userId: 1, role: 'user' }),
    AUTHORIZATION_CLASS.OWNER_ACCESS
  );
  const src = read('../services/evidence/privateEvidenceIngest.js');
  assert.ok(src.includes('recordAccessEvent'));
  assert.ok(src.includes('ADMINISTRATIVE_ACCESS'));
});

test('17. logs do not expose storage path', () => {
  const redacted = redactSensitiveLogText('failed E:\\app\\server\\private-evidence\\aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1');
  assert.ok(!/private-evidence\\aaaa/i.test(redacted));
  assert.ok(redacted.includes('[redacted-private-path]') || redacted.includes('[redacted-storage-key]'));
});

test('18. errors do not expose storage path', () => {
  Object.values({
    a: ingestError('EVIDENCE_STORAGE_UNAVAILABLE'),
    b: ingestError('DOCUMENT_NOT_AVAILABLE'),
    c: ingestError('INTEGRITY_FAILURE'),
    d: ingestError('MALFORMED_PDF'),
  }).forEach((err) => {
    assert.ok(!/ENOENT|E:\\|private-evidence|storageKey/i.test(err.message));
  });
});

asyncTest('19-21. archive state accurate; delete failure not success; reconcile safe', async () => {
  const originals = {
    findByDocumentId: repository.findByDocumentId,
    listSubjects: repository.listSubjects,
    recordAccessEvent: repository.recordAccessEvent,
    archiveDocument: repository.archiveDocument,
    listDeleteFailed: repository.listDeleteFailed,
    deleteFn: storage.delete,
    existsFn: storage.exists,
  };
  const key = storage.createStorageKey();
  repository.findByDocumentId = async () => ({
    documentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    ownerUserId: 1,
    domain: 'LEGAL_TITLE',
    documentType: 'TITLE_REGISTER',
    originalFilename: 'reg.pdf',
    mimeType: 'application/pdf',
    byteSize: 20,
    contentHash: 'aa',
    storageKey: key,
    sourceType: 'USER_UPLOADED_PRIVATE_DOCUMENT',
    source: 'USER_UPLOADED_PRIVATE_DOCUMENT',
    verificationState: 'UNVERIFIED',
    extractionState: 'NOT_EXTRACTED',
    archivedAt: null,
    subjects: [],
  });
  repository.listSubjects = async () => [];
  repository.recordAccessEvent = async () => {};
  repository.archiveDocument = async (_id, opts) => ({
    archivedAt: '2026-08-30T00:00:00.000Z',
    lifecycleState: opts.lifecycleState,
    bytesRemoved: opts.bytesRemoved,
  });
  storage.delete = async () => {
    throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
  };
  storage.exists = async () => true;
  try {
    const result = await archiveReadableDocument('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', {
      userId: 1,
      role: 'user',
    });
    assert.strictEqual(result.archived, true);
    assert.strictEqual(result.deleted, false);
    assert.strictEqual(result.bytesRemoved, false);
    assert.strictEqual(result.lifecycleState, LIFECYCLE_STATE.DELETE_FAILED);

    repository.listDeleteFailed = async () => [{
      documentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      storageKey: key,
    }];
    storage.delete = async () => false;
    storage.exists = async () => true;
    const retry = await retryFailedDeletes();
    assert.strictEqual(retry[0].bytesRemoved, false);
    assert.strictEqual(retry[0].lifecycleState, LIFECYCLE_STATE.DELETE_FAILED);
  } finally {
    repository.findByDocumentId = originals.findByDocumentId;
    repository.listSubjects = originals.listSubjects;
    repository.recordAccessEvent = originals.recordAccessEvent;
    repository.archiveDocument = originals.archiveDocument;
    repository.listDeleteFailed = originals.listDeleteFailed;
    storage.delete = originals.deleteFn;
    storage.exists = originals.existsFn;
  }
});

test('22-24. orphan audit detects file-only and row-only; not destructive', () => {
  const key = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const fileOnly = classifyStorageReconcile({
    dbRows: [],
    diskKeys: [key],
  });
  assert.strictEqual(fileOnly.orphanStoredObjects, 1);
  const rowOnly = classifyStorageReconcile({
    dbRows: [{ storageKey: key, archivedAt: null, lifecycleState: 'ACTIVE', bytesRemoved: false }],
    diskKeys: [],
  });
  assert.strictEqual(rowOnly.activeWithoutFile, 1);
  assert.strictEqual(rowOnly.missingStoredObjects, 1);
  const reconcile = read('../scripts/reconcile-private-evidence.js');
  assert.ok(reconcile.includes('retryFailedDeletes'));
  assert.ok(!reconcile.includes('listKeys'));
  assert.ok(!reconcile.includes('unlink'));
  assert.ok(!read('../services/evidence/privateEvidenceAudit.js').includes('unlink'));
});

test('25-28. history survives archive; snapshot has no key, bytes, or unnecessary hash', () => {
  const snap = snapshotLegalEvidence([{
    documentId: 'hist-1',
    documentType: 'TITLE_REGISTER',
    sourceType: SOURCE_TYPE.USER_REPORTED,
    documentDate: '2019-02-02',
    storageKey: 'should-not-appear',
    contentHash: 'deadbeef',
    ownerUserId: 9,
    storagePath: '/secret/private-evidence/x',
    extractedText: 'full text',
  }]);
  const sanitized = sanitizePrivateEvidenceSnapshot({
    legalTitleDomain: { documents: snap, assessment: { documentsPresent: true } },
  });
  const json = JSON.stringify(sanitized);
  assert.ok(!json.includes('should-not-appear'));
  assert.ok(!json.includes('deadbeef'));
  assert.ok(!json.includes('full text'));
  assert.ok(!json.includes('/secret/'));
  assert.strictEqual(sanitized.legalTitleDomain.documents[0].documentDate, '2019-02-02');
  assert.strictEqual(sanitized.legalTitleDomain.documents[0].storageKey, undefined);
  assert.strictEqual(sanitized.legalTitleDomain.documents[0].contentHash, undefined);
});

test('29. hash not exposed publicly', () => {
  const publicDoc = toPublicEvidenceDocument(createPrivateEvidenceDocument({
    documentId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    ownerUserId: 4,
    domain: 'LEGAL_TITLE',
    documentType: LEGAL_DOCUMENT_TYPE.DEED,
    mimeType: 'application/pdf',
    byteSize: 12,
    contentHash: 'public-hash-must-not-leak',
  }));
  assert.strictEqual(publicDoc.contentHash, undefined);
  assert.ok(!JSON.stringify(publicDoc).includes('public-hash-must-not-leak'));
});

test('30-33. arbitrary one-year threshold removed; documentDate kept; status NOT_ASSESSED', () => {
  const legal = read('../services/domains/legalTitleDomain.js');
  assert.ok(!legal.includes('documentMayBeStale'));
  assert.ok(!legal.includes('365'));
  assert.ok(!legal.includes('document_may_not_be_current'));
  const { envelope } = adaptLegalTitleFoundation({
    identity: identity(),
    analysisAt: '2026-08-30T00:00:00.000Z',
    documents: [
      createLegalDocument({
        documentId: 'old',
        documentType: LEGAL_DOCUMENT_TYPE.TITLE_REGISTER,
        documentDate: '2018-01-01',
      }),
    ],
  });
  assert.strictEqual(envelope.assessment.currentRegisterStatus, KERNEL_ASSESSMENT.NOT_ASSESSED);
  assert.strictEqual(
    envelope.evidence.find((row) => row.factType === LEGAL_FACT_TYPE.DOCUMENT_DATE).value,
    '2018-01-01'
  );
  const text = envelope.findings.map((row) => row.text).join(' ');
  assert.ok(!/one year|12 months|365/i.test(text));
  assert.ok(!envelope.findings.some((row) => /freshness threshold|stale register/i.test(row.text)));
});

test('34-39. upload != verification; document != conclusion; missing != none', () => {
  const { envelope } = adaptLegalTitleFoundation({
    identity: identity(),
    documents: [createLegalDocument({ documentId: 'n', documentType: LEGAL_DOCUMENT_TYPE.TITLE_REGISTER })],
  });
  assert.strictEqual(envelope.assessment.liveLegalAssessmentAvailable, false);
  assert.strictEqual(envelope.assessment.substantiveContentsAssessed, false);
  assert.strictEqual(envelope.assessment.absenceSemantics.noExtractedRestriction, 'NOT_NO_RESTRICTION');
  assert.strictEqual(envelope.assessment.absenceSemantics.noExtractedCovenant, 'NOT_NO_COVENANT');
  assert.strictEqual(envelope.assessment.absenceSemantics.noExtractedEasement, 'NOT_NO_EASEMENT');
  assert.strictEqual(envelope.assessment.absenceSemantics.noExtractedCharge, 'NOT_NO_CHARGE');
  assert.ok(envelope.limitations.some((row) => /DOCUMENT != FACT/i.test(row)));
  assert.ok(envelope.limitations.some((row) => /UPLOAD != AUTHENTICITY/i.test(row)));
});

test('40-42. Legal storage/adapter failure isolated from Planning and Environment', () => {
  const planning = attachPlanningDomain({ identity: identity() }).planningDomain;
  const environment = attachEnvironmentDomain({ identity: identity() }).environmentDomain;
  const composed = composeLiveDomainEnvelopes([planning, environment, null]);
  assert.ok(composed.byId.PLANNING);
  assert.ok(composed.byId.ENVIRONMENT);
  assert.strictEqual(composed.byId.LEGAL_TITLE, undefined);
  const engine = read('../services/ai/propertyIntelligenceEngine.js');
  assert.ok(engine.includes('loadLegalEvidenceForAnalysis'));
  assert.ok(engine.includes('legalDocuments = [];'));
});

test('30b. missing stored bytes are not treated as validated availability', () => {
  const { envelope } = adaptLegalTitleFoundation({
    identity: identity(),
    documents: [{
      ...createLegalDocument({ documentId: 'gone', documentType: LEGAL_DOCUMENT_TYPE.TITLE_REGISTER }),
      fileAvailability: AVAILABILITY_STATE.UNAVAILABLE,
    }],
  });
  assert.strictEqual(envelope.assessment.titleRegisterAvailable, false);
  assert.ok(envelope.findings.some((row) => row.id === 'stored_bytes_unavailable'));
});

asyncTest('43-45. production insecure config fails closed; development local explicit', async () => {
  withEnv({
    NODE_ENV: 'production',
    PRIVATE_EVIDENCE_PROVIDER: 'local',
    PRIVATE_EVIDENCE_PRODUCTION_BACKEND: '',
  }, () => {
    const mode = resolveStorageMode();
    assert.strictEqual(mode.ingestAvailable, false);
    assert.strictEqual(mode.durability, DURABILITY_STATE.UNAVAILABLE);
    assert.strictEqual(getPrivateEvidenceCapability().status, CAPABILITY_STATUS.UNAVAILABLE);
  });
  withEnv({
    NODE_ENV: 'production',
    PRIVATE_EVIDENCE_PROVIDER: 'production',
    PRIVATE_EVIDENCE_PRODUCTION_BACKEND: 'imaginary-s3',
  }, () => {
    assert.deepStrictEqual(IMPLEMENTED_PRODUCTION_BACKENDS, []);
    assert.strictEqual(resolveStorageMode().ingestAvailable, false);
  });
  await withEnv({
    NODE_ENV: 'production',
    PRIVATE_EVIDENCE_PROVIDER: 'local',
  }, async () => {
    await assert.rejects(
      () => ingestPrivateLegalDocument({
        userId: 1,
        file: { buffer: pdfBuffer(), mimetype: 'application/pdf', originalname: 'a.pdf' },
        documentType: 'TITLE_REGISTER',
        propertyId: 12,
      }),
      (err) => err.code === 'EVIDENCE_STORAGE_UNAVAILABLE' && err.status === 503
    );
  });
  withEnv({
    NODE_ENV: 'test',
    PRIVATE_EVIDENCE_PROVIDER: 'local',
  }, () => {
    const cap = getPrivateEvidenceCapability();
    assert.strictEqual(cap.ingestAvailable, true);
    assert.strictEqual(cap.durability, DURABILITY_STATE.DEVELOPMENT_LOCAL);
    assert.strictEqual(cap.status, CAPABILITY_STATUS.DEGRADED);
    assert.strictEqual(cap.provider, STORAGE_PROVIDER.LOCAL_PRIVATE);
  });
});

test('46. production durability semantics explicit', () => {
  const config = read('../services/evidence/privateEvidenceConfig.js');
  assert.ok(config.includes('DURABLE_PRIVATE'));
  assert.ok(config.includes('DEVELOPMENT_LOCAL'));
  assert.ok(config.includes('IMPLEMENTED_PRODUCTION_BACKENDS'));
  assert.ok(config.includes('never silently falls back to public /uploads'));
});

test('47-48. scanner never claims CLEAN; quarantine blocks download', () => {
  const ingest = read('../services/evidence/privateEvidenceIngest.js');
  assert.ok(ingest.includes('SCAN_STATE.SCAN_UNAVAILABLE'));
  assert.ok(!ingest.includes('SCAN_STATE.CLEAN'));
  const publicDoc = toPublicEvidenceDocument(createPrivateEvidenceDocument({
    documentId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    ownerUserId: 1,
    domain: 'LEGAL_TITLE',
    documentType: 'UNKNOWN',
    mimeType: 'application/pdf',
    byteSize: 8,
    contentHash: 'x',
    scanState: SCAN_STATE.SCAN_UNAVAILABLE,
  }));
  assert.strictEqual(publicDoc.scanClean, false);
  assert.notStrictEqual(publicDoc.scanState, SCAN_STATE.CLEAN);
  assert.ok(ingest.includes('AVAILABILITY_STATE.QUARANTINED'));
  assert.ok(ingest.includes('DOCUMENT_NOT_AVAILABLE'));
});

test('49. shared contract contains no Legal interpretation', () => {
  const shared = read('../architecture/privateEvidenceContract.js');
  assert.ok(!shared.includes('declaredTitleNumber'));
  assert.ok(!shared.includes('LEGAL_DOCUMENT_TYPE'));
  assert.ok(!shared.includes("require('./legalTitleContract')"));
  assert.ok(!shared.includes('TITLE_REGISTER'));
  assert.ok(read('../architecture/legalEvidenceTypes.js').includes('normalizeLegalDocumentType'));
});

['LAND', 'DEVELOPMENT_SITE', 'COMMERCIAL', 'INDUSTRIAL', 'AGRICULTURAL', 'MIXED_USE', 'UNKNOWN'].forEach((cls) => {
  test(`${cls} compatibility unchanged`, () => {
    const { envelope } = adaptLegalTitleFoundation({
      identity: identity(),
      assetClassification: { assetClass: ASSET_CLASS[cls] || cls },
      documents: [createLegalDocument({ documentId: cls, documentType: LEGAL_DOCUMENT_TYPE.UNKNOWN })],
    });
    assert.strictEqual(envelope.subject.assetClass, cls);
  });
});

test('57-69. intelligence freeze and neighbouring domains unchanged', () => {
  const legal = read('../services/domains/legalTitleDomain.js');
  assert.ok(!legal.includes('calculatePropertyValuation'));
  assert.ok(!legal.includes('analyseRent'));
  assert.ok(!legal.includes('personalDecisionEngine'));
  assert.ok(!legal.includes('decisionIntelligence'));
  assert.ok(!legal.includes('compareIntelligenceWhatIf'));
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.PLANNING).wiredIntoLiveAnalysis, true);
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.ENVIRONMENT).wiredIntoLiveAnalysis, true);
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.BUILDING_CONDITION).wiredIntoLiveAnalysis, false);
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.DEVELOPMENT).wiredIntoLiveAnalysis, false);
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.PROJECT_COST).wiredIntoLiveAnalysis, false);
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.LEGAL_TITLE).mayIncurProviderCost, false);
  const cost = read('../services/providers/cache/providerCostProtection.js');
  assert.ok(cost.includes('logProviderCostEvent'));
});

test('70. V1.1 tag name remains frozen in versions contract', () => {
  const versions = read('../architecture/versions.js');
  assert.ok(versions.includes("propertyIntelligenceV11: 'property-intelligence-v1.1'"));
});

test('startup validation does not take the whole app down', () => {
  const server = read('../server.js');
  assert.ok(server.includes('getPrivateEvidenceCapability'));
  assert.ok(server.includes('Property Intelligence continues'));
});

test('access audit table stores no document bytes', () => {
  const sql = read('../db/migrations/022_private_evidence_hardening.sql');
  assert.ok(sql.includes('evidence_access_events'));
  assert.ok(!sql.includes('content_hash'));
  assert.ok(sql.includes('authorization_class'));
});

test('safe record still omits storage key after hardening fields', () => {
  const safe = toSafeRecord({
    documentId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    ownerUserId: 3,
    domain: 'LEGAL_TITLE',
    documentType: LEGAL_DOCUMENT_TYPE.TRANSFER,
    originalFilename: 'transfer.pdf',
    mimeType: 'application/pdf',
    byteSize: 30,
    contentHash: 'c',
    storageKey: 'should-not-leak',
    sourceType: 'USER_UPLOADED_PRIVATE_DOCUMENT',
    source: 'USER_UPLOADED_PRIVATE_DOCUMENT',
    verificationState: 'UNVERIFIED',
    extractionState: 'NOT_EXTRACTED',
    privacy: VISIBILITY.PRIVATE,
    provenance: {},
    scanState: SCAN_STATE.SCAN_UNAVAILABLE,
    availabilityState: AVAILABILITY_STATE.AVAILABLE,
    lifecycleState: LIFECYCLE_STATE.ACTIVE,
    durabilityState: DURABILITY_STATE.DEVELOPMENT_LOCAL,
    subjects: [{ kind: IDENTITY_KIND.PROPERTY, id: '12' }],
  });
  assert.strictEqual(safe.storageKey, undefined);
  assert.strictEqual(safe.contentHash, undefined);
  assert.strictEqual(safe.scanState, SCAN_STATE.SCAN_UNAVAILABLE);
  assert.strictEqual(safe.scanClean, false);
});

test('accepted jpeg/png signatures pass when consistent', () => {
  storage.validateUploadBuffer({
    buffer: jpegBuffer(),
    mimeType: 'image/jpeg',
    originalFilename: 'photo.jpg',
  });
  storage.validateUploadBuffer({
    buffer: pngBuffer(),
    mimeType: 'image/png',
    originalFilename: 'plan.png',
  });
});

(async () => {
  for (const item of pending) {
    await item.fn();
    console.log(`  ok  ${item.name}`);
  }
  console.log(`\nprivate evidence hardening passed (${passed + pending.length} checks)`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
