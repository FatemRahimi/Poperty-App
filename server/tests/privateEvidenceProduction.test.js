/**
 * Phase 9.2 — production private evidence deployment and operational validation.
 * Run: node server/tests/privateEvidenceProduction.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  DOMAIN_ID,
  IDENTITY_KIND,
  ASSET_CLASS,
  SOURCE_TYPE,
  platformRegistry,
  LEGAL_DOCUMENT_TYPE,
  SCAN_STATE,
  AVAILABILITY_STATE,
  LIFECYCLE_STATE,
  DURABILITY_STATE,
  STORAGE_PROVIDER,
  CAPABILITY_STATUS,
  ENCRYPTION_STATUS,
  BACKUP_STATUS,
  SCANNER_CLASS,
  DEPLOYMENT_STORAGE_CLASS,
  createLegalDocument,
  createPrivateEvidenceDocument,
  toPublicEvidenceDocument,
} = require('../architecture');
const { adaptLegalTitleFoundation } = require('../services/domains/legalTitleDomain');
const { composeLiveDomainEnvelopes } = require('../services/domains/composeLiveDomains');
const storage = require('../services/evidence/privateEvidenceStorage');
const {
  getPrivateEvidenceCapability,
  resolveStorageMode,
  IMPLEMENTED_PRODUCTION_BACKENDS,
  classifyDeploymentStorage,
  getEncryptionStatus,
  getBackupStatus,
  signedAccessImplemented,
  isPublicUploadsPath,
  publicUploadsDir,
} = require('../services/evidence/privateEvidenceConfig');
const {
  IMPLEMENTED_SCANNERS,
  classifyScanner,
  setScannerForTests,
  resetScannerForTests,
  scanPrivateEvidenceBuffer,
  decideIngestStates,
  isDownloadableEvidence,
  isLegalAvailableEvidence,
} = require('../services/evidence/malwareScanner');
const {
  registerProductionAdapterForTests,
  resetProductionAdaptersForTests,
  createMemoryAdapterForTests,
} = require('../services/evidence/storageAdapters/productionRegistry');
const {
  readAuthorizedFile,
  canReadDocument,
} = require('../services/evidence/privateEvidenceIngest');
const repository = require('../services/evidence/evidenceDocumentRepository');
const { loadLegalEvidenceForAnalysis, snapshotLegalEvidence } = require('../services/evidence/legalEvidenceConsumer');
const { sanitizePrivateEvidenceSnapshot } = require('../services/evidence/sanitizePrivateEvidence');
const { classifyStorageReconcile } = require('../services/evidence/privateEvidenceAudit');
const {
  evaluateProductionReuseGate,
  REAL_DOCUMENT_SMOKE,
} = require('../services/evidence/privateEvidenceReuseGate');
const { attachPlanningDomain } = require('../services/domains/planningDomain');
const { attachEnvironmentDomain } = require('../services/domains/environmentDomain');
const { redactSensitiveLogText } = require('../services/ai/propertyIntelligenceProduction');

function pdfBuffer(extra = '') {
  return Buffer.from(`%PDF-1.4\n${extra}1 0 obj<<>>endobj\n%%EOF\n`);
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

function restoreEnv(overrides, previous) {
  Object.keys(overrides).forEach((key) => {
    if (previous[key] == null) delete process.env[key];
    else process.env[key] = previous[key];
  });
}

function withEnv(overrides, fn) {
  const previous = {};
  Object.keys(overrides).forEach((key) => {
    previous[key] = process.env[key];
    if (overrides[key] == null) delete process.env[key];
    else process.env[key] = overrides[key];
  });
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.finally(() => restoreEnv(overrides, previous));
    }
    restoreEnv(overrides, previous);
    return result;
  } catch (error) {
    restoreEnv(overrides, previous);
    throw error;
  }
}

function identity() {
  return {
    listingId: '12',
    subjectId: null,
    uprn: '100023336956',
    kind: IDENTITY_KIND.PROPERTY,
  };
}

console.log('private evidence production\n');

test('1. production cannot use local fallback', () => {
  withEnv({
    NODE_ENV: 'production',
    PRIVATE_EVIDENCE_PROVIDER: 'local',
    PRIVATE_EVIDENCE_PRODUCTION_BACKEND: '',
  }, () => {
    const mode = resolveStorageMode();
    assert.strictEqual(mode.ingestAvailable, false);
    assert.strictEqual(mode.durability, DURABILITY_STATE.UNAVAILABLE);
    assert.notStrictEqual(mode.provider, STORAGE_PROVIDER.LOCAL_PRIVATE);
  });
});

test('2. production cannot use public /uploads', () => {
  const uploads = publicUploadsDir();
  assert.strictEqual(isPublicUploadsPath(uploads), true);
  assert.strictEqual(isPublicUploadsPath(path.join(uploads, 'photo.jpg')), true);
  withEnv({
    NODE_ENV: 'production',
    PRIVATE_EVIDENCE_PROVIDER: 'local',
    PRIVATE_EVIDENCE_ROOT: uploads,
  }, () => {
    assert.strictEqual(resolveStorageMode().ingestAvailable, false);
    assert.strictEqual(resolveStorageMode().reason, 'PUBLIC_UPLOADS_FORBIDDEN');
  });
  withEnv({
    NODE_ENV: 'test',
    PRIVATE_EVIDENCE_PROVIDER: 'local',
    PRIVATE_EVIDENCE_ROOT: uploads,
  }, () => {
    assert.strictEqual(resolveStorageMode().ingestAvailable, false);
  });
});

test('3. unknown provider fails closed', () => {
  withEnv({
    NODE_ENV: 'production',
    PRIVATE_EVIDENCE_PROVIDER: 's3',
    PRIVATE_EVIDENCE_PRODUCTION_BACKEND: 's3',
  }, () => {
    assert.strictEqual(resolveStorageMode().ingestAvailable, false);
    assert.deepStrictEqual(IMPLEMENTED_PRODUCTION_BACKENDS, []);
  });
  withEnv({
    NODE_ENV: 'test',
    PRIVATE_EVIDENCE_PROVIDER: 'not-a-provider',
  }, () => {
    assert.strictEqual(resolveStorageMode().ingestAvailable, false);
  });
});

test('4. provider credentials remain server-side', () => {
  const clientSrc = [
    read('../../client/src/components/ai/LegalTitleEvidencePanel.js'),
    read('../../client/src/services/aiService.js'),
  ].join('\n');
  assert.ok(!/AWS_SECRET|SECRET_ACCESS|PRIVATE_EVIDENCE_PRODUCTION_BACKEND/i.test(clientSrc));
  const env = read('../ENV_SETUP.md');
  assert.ok(env.includes('PRIVATE_EVIDENCE_PROVIDER=local'));
  assert.ok(!env.includes('AKIA'));
  const pkg = read('../package.json');
  assert.ok(!pkg.includes('@aws-sdk'));
  assert.ok(!pkg.includes('aws-sdk'));
  assert.ok(!pkg.includes('@azure'));
  assert.ok(!pkg.includes('@google-cloud'));
});

test('5-7. private object semantics; no signed access', () => {
  assert.strictEqual(signedAccessImplemented(), false);
  const src = read('../services/evidence/privateEvidenceStorage.js');
  assert.ok(!/getSignedUrl|presigned|public-read|ACL/i.test(src));
  assert.ok(src.includes('put'));
  assert.ok(src.includes('localDiskAllowed'));
  assert.ok(src.includes('productionPathRequired'));
});

test('6. unauthorized object access impossible through app', () => {
  assert.strictEqual(
    canReadDocument({ ownerUserId: 9, archivedAt: null }, { userId: 2, role: 'user' }),
    false
  );
});

test('8. CLEAN requires verified real clean result', () => {
  const unverified = decideIngestStates(
    { state: SCAN_STATE.CLEAN, verifiedClean: false },
    { provider: STORAGE_PROVIDER.PRODUCTION_PRIVATE }
  );
  assert.notStrictEqual(unverified.scanState, SCAN_STATE.CLEAN);
  assert.notStrictEqual(unverified.availabilityState, AVAILABILITY_STATE.AVAILABLE);
  const verified = decideIngestStates(
    { state: SCAN_STATE.CLEAN, verifiedClean: true },
    { provider: STORAGE_PROVIDER.PRODUCTION_PRIVATE }
  );
  assert.strictEqual(verified.scanState, SCAN_STATE.CLEAN);
  assert.strictEqual(verified.availabilityState, AVAILABILITY_STATE.AVAILABLE);
});

test('9. scanner unavailable does not assign CLEAN', () => {
  assert.deepStrictEqual(IMPLEMENTED_SCANNERS, []);
  assert.strictEqual(classifyScanner(), SCANNER_CLASS.NO_SCANNER_AVAILABLE);
  const states = decideIngestStates(
    { state: SCAN_STATE.SCAN_UNAVAILABLE, verifiedClean: false },
    { provider: STORAGE_PROVIDER.PRODUCTION_PRIVATE }
  );
  assert.notStrictEqual(states.scanState, SCAN_STATE.CLEAN);
  assert.strictEqual(states.availabilityState, AVAILABILITY_STATE.QUARANTINED);
});

test('10. scanner malicious result rejected', () => {
  const states = decideIngestStates(
    { state: SCAN_STATE.REJECTED, verifiedClean: false },
    { provider: STORAGE_PROVIDER.PRODUCTION_PRIVATE }
  );
  assert.strictEqual(states.scanState, SCAN_STATE.REJECTED);
  assert.strictEqual(states.availabilityState, AVAILABILITY_STATE.UNAVAILABLE);
  assert.strictEqual(isDownloadableEvidence({
    availabilityState: states.availabilityState,
    scanState: states.scanState,
  }), false);
});

asyncTest('11. scanner timeout fail-safe', async () => {
  withEnv({ NODE_ENV: 'test', PRIVATE_EVIDENCE_SCANNER: 'test' }, async () => {
    setScannerForTests(() => new Promise(() => {}));
    try {
      const result = await scanPrivateEvidenceBuffer(pdfBuffer(), { timeoutMs: 50 });
      assert.strictEqual(result.state, SCAN_STATE.ERROR);
      assert.strictEqual(result.verifiedClean, false);
      assert.strictEqual(result.reason, 'SCANNER_TIMEOUT');
    } finally {
      resetScannerForTests();
    }
  });
});

test('12-13. quarantine not downloadable and not Legal-available', () => {
  const quarantined = {
    availabilityState: AVAILABILITY_STATE.QUARANTINED,
    scanState: SCAN_STATE.SCAN_UNAVAILABLE,
  };
  assert.strictEqual(isDownloadableEvidence(quarantined), false);
  assert.strictEqual(isLegalAvailableEvidence(quarantined), false);
  const { envelope } = adaptLegalTitleFoundation({
    identity: identity(),
    documents: [{
      ...createLegalDocument({ documentId: 'q', documentType: LEGAL_DOCUMENT_TYPE.TITLE_REGISTER }),
      fileAvailability: AVAILABILITY_STATE.QUARANTINED,
    }],
  });
  assert.strictEqual(envelope.assessment.titleRegisterAvailable, false);
  assert.ok(envelope.findings.some((row) => row.id === 'stored_bytes_unavailable'));
});

test('14. clean object becomes available only after verified clean', () => {
  const states = decideIngestStates(
    { state: SCAN_STATE.CLEAN, verifiedClean: true },
    { provider: STORAGE_PROVIDER.PRODUCTION_PRIVATE }
  );
  assert.strictEqual(isDownloadableEvidence({
    availabilityState: states.availabilityState,
    scanState: states.scanState,
  }), true);
});

test('15-17. object/DB failure and duplicate retry stay safe', () => {
  const ingest = read('../services/evidence/privateEvidenceIngest.js');
  assert.ok(ingest.includes("error.code === '23505'"));
  assert.ok(ingest.includes('storage.delete(stored.storageKey)'));
  assert.ok(ingest.includes('orphan cleanup best-effort'));
  assert.ok(ingest.includes('findActiveByOwnerHash'));
});

asyncTest('18-20. object delete success/failure and reconcile', async () => {
  const adapter = createMemoryAdapterForTests();
  const key = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  await adapter.put(pdfBuffer('del'), { storageKey: key });
  assert.strictEqual(await adapter.delete(key), true);
  assert.strictEqual(await adapter.exists(key), false);
  assert.strictEqual(await adapter.delete(key), false);
  const reconcile = classifyStorageReconcile({
    dbRows: [{
      storageKey: key,
      archivedAt: '2026-08-30',
      lifecycleState: 'DELETE_FAILED',
      bytesRemoved: false,
    }],
    diskKeys: [key],
  });
  assert.strictEqual(reconcile.deleteFailed, 1);
  assert.strictEqual(reconcile.archivedWithFile, 1);
});

test('21-22. missing and orphan object audit', () => {
  const missing = classifyStorageReconcile({
    dbRows: [{ storageKey: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', archivedAt: null, lifecycleState: 'ACTIVE' }],
    diskKeys: [],
  });
  assert.strictEqual(missing.activeWithoutFile, 1);
  const orphan = classifyStorageReconcile({
    dbRows: [],
    diskKeys: ['dddddddd-dddd-4ddd-8ddd-dddddddddddd'],
  });
  assert.strictEqual(orphan.orphanStoredObjects, 1);
  const unsupported = classifyStorageReconcile({
    dbRows: [{ storageKey: 'x', archivedAt: null, lifecycleState: 'ACTIVE' }],
    diskKeys: [],
    listingSupported: false,
  });
  assert.strictEqual(unsupported.orphanStoredObjects, 'NOT_VERIFIED');
});

asyncTest('23-24. integrity mismatch blocked; no corrupted stream', async () => {
  const originals = {
    findByDocumentId: repository.findByDocumentId,
    listSubjects: repository.listSubjects,
    recordAccessEvent: repository.recordAccessEvent,
    markIntegrity: repository.markIntegrity,
    read: storage.read,
  };
  repository.findByDocumentId = async () => ({
    documentId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    ownerUserId: 1,
    domain: 'LEGAL_TITLE',
    documentType: 'TITLE_REGISTER',
    originalFilename: 'reg.pdf',
    mimeType: 'application/pdf',
    byteSize: 12,
    contentHash: 'not-the-real-hash',
    storageKey: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    sourceType: 'USER_UPLOADED_PRIVATE_DOCUMENT',
    source: 'USER_UPLOADED_PRIVATE_DOCUMENT',
    verificationState: 'UNVERIFIED',
    extractionState: 'NOT_EXTRACTED',
    archivedAt: null,
    scanState: SCAN_STATE.SCAN_UNAVAILABLE,
    availabilityState: AVAILABILITY_STATE.AVAILABLE,
    subjects: [],
  });
  repository.listSubjects = async () => [];
  repository.recordAccessEvent = async () => {};
  repository.markIntegrity = async () => {};
  storage.read = async () => pdfBuffer('corrupt');
  try {
    await assert.rejects(
      () => readAuthorizedFile('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', { userId: 1, role: 'user' }),
      (err) => err.code === 'INTEGRITY_FAILURE' && !/ENOENT|private-evidence|storageKey/i.test(err.message)
    );
  } finally {
    repository.findByDocumentId = originals.findByDocumentId;
    repository.listSubjects = originals.listSubjects;
    repository.recordAccessEvent = originals.recordAccessEvent;
    repository.markIntegrity = originals.markIntegrity;
    storage.read = originals.read;
  }
});

test('25-26. encryption and backup status are truthful', () => {
  assert.strictEqual(getEncryptionStatus(), ENCRYPTION_STATUS.NOT_VERIFIED);
  assert.strictEqual(getBackupStatus(), BACKUP_STATUS.NOT_VERIFIED);
  assert.strictEqual(classifyDeploymentStorage(), DEPLOYMENT_STORAGE_CLASS.NO_PRODUCTION_PROVIDER_EVIDENCE);
});

test('27-28. startup evidence health; outage does not kill PI', () => {
  const cap = getPrivateEvidenceCapability();
  assert.ok([
    CAPABILITY_STATUS.AVAILABLE,
    CAPABILITY_STATUS.DEGRADED,
    CAPABILITY_STATUS.UNAVAILABLE,
  ].includes(cap.status));
  const server = read('../server.js');
  assert.ok(server.includes('Property Intelligence continues'));
  const engine = read('../services/ai/propertyIntelligenceEngine.js');
  assert.ok(engine.includes('legalDocuments = [];'));
});

test('29-31. Legal failure isolated; Planning and Environment unaffected', () => {
  const planning = attachPlanningDomain({ identity: identity() }).planningDomain;
  const environment = attachEnvironmentDomain({ identity: identity() }).environmentDomain;
  const composed = composeLiveDomainEnvelopes([planning, environment, null]);
  assert.ok(composed.byId.PLANNING);
  assert.ok(composed.byId.ENVIRONMENT);
  assert.strictEqual(composed.byId.LEGAL_TITLE, undefined);
});

test('32-34. snapshot strips provider details, hash, and credentials', () => {
  const snap = snapshotLegalEvidence([{
    documentId: 'hist-2',
    documentType: 'TITLE_REGISTER',
    sourceType: SOURCE_TYPE.USER_REPORTED,
    storageKey: 'should-not-appear',
    contentHash: 'hash-must-go',
    storageProvider: 's3',
    signedUrl: 'https://bucket.example/secret',
    credentials: 'AKIAEXAMPLEKEY0000',
    bucket: 'private-bucket',
  }]);
  const sanitized = sanitizePrivateEvidenceSnapshot({
    legalTitleDomain: { documents: snap, storageProvider: 's3', signedUrl: 'https://x' },
    accessKeyId: 'AKIAEXAMPLEKEY0000',
  });
  const json = JSON.stringify(sanitized);
  assert.ok(!json.includes('should-not-appear'));
  assert.ok(!json.includes('hash-must-go'));
  assert.ok(!json.includes('AKIAEXAMPLEKEY0000'));
  assert.ok(!json.includes('private-bucket'));
  assert.ok(!json.includes('https://bucket.example/secret'));
  assert.strictEqual(sanitized.accessKeyId, undefined);
  assert.strictEqual(sanitized.legalTitleDomain.signedUrl, undefined);
});

test('35-37. historical immutability; archive does not rewrite history; live excludes archived', () => {
  const snap = snapshotLegalEvidence([{
    documentId: 'hist-keep',
    documentType: 'TITLE_REGISTER',
    documentDate: '2019-02-02',
    fileAvailability: AVAILABILITY_STATE.AVAILABLE,
  }]);
  assert.strictEqual(snap[0].documentDate, '2019-02-02');
  const src = read('../services/evidence/evidenceDocumentRepository.js');
  assert.ok(src.includes("includeArchived = false"));
  assert.ok(src.includes('d.archived_at IS NULL'));
});

test('38-40. owner isolation; admin intentional; cross-owner duplicate private', () => {
  assert.strictEqual(
    canReadDocument({ ownerUserId: 1, archivedAt: null }, { userId: 1, role: 'user' }),
    true
  );
  const ingest = read('../services/evidence/privateEvidenceIngest.js');
  assert.ok(ingest.includes('ADMINISTRATIVE_ACCESS'));
  assert.ok(!/already belongs to another user/i.test(ingest));
});

test('41. Legal semantics unchanged', () => {
  const { envelope } = adaptLegalTitleFoundation({
    identity: identity(),
    documents: [createLegalDocument({ documentId: 'n', documentType: LEGAL_DOCUMENT_TYPE.TITLE_REGISTER })],
  });
  assert.strictEqual(envelope.assessment.liveLegalAssessmentAvailable, false);
  assert.strictEqual(envelope.assessment.absenceSemantics.noExtractedCovenant, 'NOT_NO_COVENANT');
  assert.ok(envelope.limitations.some((row) => /DOCUMENT != FACT/i.test(row)));
  assert.ok(envelope.limitations.some((row) => /UPLOAD != AUTHENTICITY/i.test(row)));
});

test('42-44. Building Condition, Development, Project Cost remain unwired', () => {
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.BUILDING_CONDITION).wiredIntoLiveAnalysis, false);
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.DEVELOPMENT).wiredIntoLiveAnalysis, false);
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.PROJECT_COST).wiredIntoLiveAnalysis, false);
});

test('45-53. neighbouring intelligence remains unchanged', () => {
  const legal = read('../services/domains/legalTitleDomain.js');
  assert.ok(!legal.includes('calculatePropertyValuation'));
  assert.ok(!legal.includes('analyseRent'));
  assert.ok(!legal.includes('personalDecisionEngine'));
  assert.ok(!legal.includes('decisionIntelligence'));
  assert.ok(!legal.includes('compareIntelligenceWhatIf'));
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.PLANNING).wiredIntoLiveAnalysis, true);
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.ENVIRONMENT).wiredIntoLiveAnalysis, true);
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.LEGAL_TITLE).mayIncurProviderCost, false);
  const cost = read('../services/providers/cache/providerCostProtection.js');
  assert.ok(cost.includes('logProviderCostEvent'));
});

test('54. V1.1 tag name remains frozen', () => {
  const versions = read('../architecture/versions.js');
  assert.ok(versions.includes("propertyIntelligenceV11: 'property-intelligence-v1.1'"));
});

test('logs redact access keys', () => {
  const redacted = redactSensitiveLogText('failed AKIAIOSFODNN7EXAMPLE SecretAccessKey=supersecret');
  assert.ok(!redacted.includes('AKIAIOSFODNN7EXAMPLE'));
  assert.ok(!redacted.includes('supersecret'));
});

test('shared contract stays domain-neutral', () => {
  const shared = read('../architecture/privateEvidenceContract.js');
  assert.ok(!shared.includes('declaredTitleNumber'));
  assert.ok(!shared.includes('survey defect'));
  assert.ok(!shared.includes('quote amounts'));
  assert.ok(!shared.includes('invoice'));
  assert.ok(!shared.includes("require('./legalTitleContract')"));
});

test('no invented production provider in code', () => {
  assert.deepStrictEqual(IMPLEMENTED_PRODUCTION_BACKENDS, []);
  assert.strictEqual(classifyDeploymentStorage(), DEPLOYMENT_STORAGE_CLASS.NO_PRODUCTION_PROVIDER_EVIDENCE);
  const docker = read('../../docker-compose.yml');
  assert.ok(docker.includes('NODE_ENV=development'));
  assert.ok(!/clamav|minio|s3|r2/i.test(docker));
});

asyncTest('memory adapter private put/read/delete without public URL', async () => {
  resetProductionAdaptersForTests();
  const adapter = createMemoryAdapterForTests();
  registerProductionAdapterForTests('memory-test', adapter);
  const buffer = pdfBuffer('adapter');
  const stored = await adapter.put(buffer);
  assert.ok(/^[0-9a-f-]{36}$/i.test(stored.storageKey));
  assert.strictEqual(await adapter.exists(stored.storageKey), true);
  const readBack = await adapter.read(stored.storageKey);
  assert.strictEqual(storage.computeContentHash(readBack), storage.computeContentHash(buffer));
  assert.strictEqual(await adapter.delete(stored.storageKey), true);
  resetProductionAdaptersForTests();
});

asyncTest('production ingest stays closed without implemented backend/scanner', async () => {
  await withEnv({
    NODE_ENV: 'production',
    PRIVATE_EVIDENCE_PROVIDER: 'production',
    PRIVATE_EVIDENCE_PRODUCTION_BACKEND: 'memory-test',
    PRIVATE_EVIDENCE_SCANNER: 'test',
  }, async () => {
    assert.throws(
      () => registerProductionAdapterForTests('memory-test', createMemoryAdapterForTests()),
      /TEST_ADAPTER_FORBIDDEN_IN_PRODUCTION/
    );
    assert.strictEqual(getPrivateEvidenceCapability().ingestAvailable, false);
    await assert.rejects(
      () => storage.put(pdfBuffer('prod')),
      (err) => err.code === 'EVIDENCE_STORAGE_UNAVAILABLE'
    );
  });
});

asyncTest('test-only adapter+scanner can quarantine then clean', async () => {
  await withEnv({
    NODE_ENV: 'test',
    PRIVATE_EVIDENCE_PROVIDER: 'production',
    PRIVATE_EVIDENCE_PRODUCTION_BACKEND: 'memory-test',
    PRIVATE_EVIDENCE_SCANNER: 'test',
  }, async () => {
    const adapter = createMemoryAdapterForTests();
    registerProductionAdapterForTests('memory-test', adapter);
    setScannerForTests(() => ({ state: SCAN_STATE.SCAN_UNAVAILABLE, verifiedClean: false }));
    try {
      const unavailable = decideIngestStates(
        await scanPrivateEvidenceBuffer(pdfBuffer()),
        { provider: STORAGE_PROVIDER.PRODUCTION_PRIVATE }
      );
      assert.strictEqual(unavailable.availabilityState, AVAILABILITY_STATE.QUARANTINED);
      setScannerForTests(() => ({ state: SCAN_STATE.CLEAN, verifiedClean: true }));
      const clean = decideIngestStates(
        await scanPrivateEvidenceBuffer(pdfBuffer()),
        { provider: STORAGE_PROVIDER.PRODUCTION_PRIVATE }
      );
      assert.strictEqual(clean.scanState, SCAN_STATE.CLEAN);
      const stored = await storage.put(pdfBuffer('ok'));
      assert.ok(stored.storageKey);
      await storage.delete(stored.storageKey);
    } finally {
      resetScannerForTests();
      resetProductionAdaptersForTests();
    }
  });
});

asyncTest('Legal consumer does not treat quarantined rows as available', async () => {
  const originals = {
    listForOwnerScope: repository.listForOwnerScope,
    exists: storage.exists,
  };
  repository.listForOwnerScope = async () => ([{
    documentId: 'qqqqqqqq-qqqq-4qqq-8qqq-qqqqqqqqqqqq',
    ownerUserId: 1,
    documentType: 'TITLE_REGISTER',
    sourceType: 'USER_UPLOADED_PRIVATE_DOCUMENT',
    scanState: SCAN_STATE.ERROR,
    availabilityState: AVAILABILITY_STATE.QUARANTINED,
    storageKey: 'qqqqqqqq-qqqq-4qqq-8qqq-qqqqqqqqqqqq',
    subjects: [],
  }]);
  storage.exists = async () => true;
  try {
    const loaded = await loadLegalEvidenceForAnalysis({ ownerUserId: 1, propertyId: 12 });
    assert.strictEqual(loaded.documents[0].fileAvailability, AVAILABILITY_STATE.QUARANTINED);
  } finally {
    repository.listForOwnerScope = originals.listForOwnerScope;
    storage.exists = originals.exists;
  }
});

test('reuse gate remains NOT_READY while infrastructure is absent', () => {
  const gate = evaluateProductionReuseGate({
    smokeStatus: REAL_DOCUMENT_SMOKE.BLOCKED_BY_NO_USER_DOCUMENT,
  });
  assert.strictEqual(gate.criteria.storageAbstractionStable, true);
  assert.strictEqual(gate.criteria.privateProductionStorageOperational, false);
  assert.strictEqual(gate.criteria.malwarePolicyOperational, false);
  assert.strictEqual(gate.criteria.encryptionAtRestVerified, false);
  assert.strictEqual(gate.criteria.backupRecoveryVerified, false);
  assert.strictEqual(gate.criteria.realDocumentSmoke, true);
  assert.strictEqual(gate.verdict, 'FAILED');
  assert.strictEqual(gate.secondDomain, 'NOT_READY_FOR_SECOND_DOMAIN');
  assert.ok(gate.blockers.includes('NO_PRODUCTION_PROVIDER_EVIDENCE'));
});

test('public document never claims scanClean', () => {
  const publicDoc = toPublicEvidenceDocument(createPrivateEvidenceDocument({
    documentId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    ownerUserId: 1,
    domain: 'LEGAL_TITLE',
    documentType: 'UNKNOWN',
    mimeType: 'application/pdf',
    byteSize: 8,
    contentHash: 'hidden',
    scanState: SCAN_STATE.SCAN_UNAVAILABLE,
  }));
  assert.strictEqual(publicDoc.scanClean, false);
  assert.strictEqual(publicDoc.contentHash, undefined);
});

['LAND', 'COMMERCIAL', 'INDUSTRIAL', 'AGRICULTURAL'].forEach((cls) => {
  test(`${cls} compatibility unchanged`, () => {
    const { envelope } = adaptLegalTitleFoundation({
      identity: identity(),
      assetClassification: { assetClass: ASSET_CLASS[cls] || cls },
      documents: [createLegalDocument({ documentId: cls, documentType: LEGAL_DOCUMENT_TYPE.UNKNOWN })],
    });
    assert.strictEqual(envelope.subject.assetClass, cls);
  });
});

(async () => {
  for (const item of pending) {
    await item.fn();
    console.log(`  ok  ${item.name}`);
  }
  console.log(`\nprivate evidence production passed (${passed + pending.length} checks)`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
