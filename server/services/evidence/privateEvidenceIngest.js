/**
 * Private evidence ingest for LEGAL_TITLE.
 * Upload proves FILE_RECEIVED, not authenticity or legal conclusions.
 */

const crypto = require('crypto');
const { IDENTITY_KIND } = require('../../architecture/identityModel');
const { VISIBILITY } = require('../../architecture/evidenceContract');
const {
  PRIVATE_EXTRACTION_STATE,
  SUBJECT_RELATION,
  SCAN_STATE,
  AVAILABILITY_STATE,
  LIFECYCLE_STATE,
  AUTHORIZATION_CLASS,
  normalizeSourceType,
  normalizeVerificationState,
  createClaimedSubjectRef,
  createPrivateEvidenceDocument,
  toPublicEvidenceDocument,
} = require('../../architecture/privateEvidenceContract');
const { normalizeLegalDocumentType } = require('../../architecture/legalEvidenceTypes');
const { getPrivateEvidenceCapability } = require('./privateEvidenceConfig');
const { resolvePropertyAccess } = require('../ai/propertyIntelligenceAccess');
const { assertSubjectAccess } = require('../ai/externalPropertyLookupService');
const {
  scanPrivateEvidenceBuffer,
  decideIngestStates,
  isDownloadableEvidence,
} = require('./malwareScanner');
const storage = require('./privateEvidenceStorage');
const repository = require('./evidenceDocumentRepository');

const PUBLIC_ERROR = Object.freeze({
  UNAUTHENTICATED: { status: 401, code: 'UNAUTHENTICATED', message: 'Authentication required.' },
  UNAUTHORIZED_SUBJECT: { status: 403, code: 'UNAUTHORIZED_SUBJECT', message: 'You cannot attach evidence to this subject.' },
  DOCUMENT_NOT_FOUND: { status: 404, code: 'DOCUMENT_NOT_FOUND', message: 'Document not found.' },
  SUBJECT_REQUIRED: { status: 400, code: 'SUBJECT_REQUIRED', message: 'A property or intelligence subject is required.' },
  INVALID_DOCUMENT_TYPE: { status: 400, code: 'INVALID_DOCUMENT_TYPE', message: 'Document type is not accepted.' },
  DOCUMENT_TYPE_NOT_ACCEPTED: { status: 400, code: 'DOCUMENT_TYPE_NOT_ACCEPTED', message: 'This document type is not accepted for legal evidence.' },
  INVALID_SOURCE_TYPE: { status: 400, code: 'INVALID_SOURCE_TYPE', message: 'Source type is not accepted.' },
  UPLOAD_IS_NOT_OFFICIAL_SOURCE: { status: 400, code: 'UPLOAD_IS_NOT_OFFICIAL_SOURCE', message: 'An upload is not an independently verified official source.' },
  INVALID_SUBJECT_TYPE: { status: 400, code: 'INVALID_SUBJECT_TYPE', message: 'Subject type is not accepted.' },
  MALFORMED_UPLOAD: { status: 400, code: 'MALFORMED_UPLOAD', message: 'The upload could not be read.' },
  ZERO_BYTE_FILE: { status: 400, code: 'ZERO_BYTE_FILE', message: 'Empty files are not accepted.' },
  FILE_TOO_LARGE: { status: 400, code: 'FILE_TOO_LARGE', message: 'The file exceeds the 20MB limit.' },
  UNSUPPORTED_FILE_TYPE: { status: 400, code: 'UNSUPPORTED_FILE_TYPE', message: 'Only PDF, JPEG, and PNG files are accepted.' },
  EXTENSION_MISMATCH: { status: 400, code: 'EXTENSION_MISMATCH', message: 'File extension does not match the file type.' },
  MALFORMED_PDF: { status: 400, code: 'MALFORMED_PDF', message: 'The PDF could not be accepted.' },
  UPRN_IS_NOT_A_TITLE_NUMBER: { status: 400, code: 'UPRN_IS_NOT_A_TITLE_NUMBER', message: 'UPRN is not a title number.' },
  INVALID_TITLE_NUMBER: { status: 400, code: 'INVALID_TITLE_NUMBER', message: 'Title number could not be accepted.' },
  SIGNATURE_MISMATCH: { status: 400, code: 'SIGNATURE_MISMATCH', message: 'The file type does not match the file contents.' },
  UNSUPPORTED_ACTIVE_CONTENT: { status: 400, code: 'UNSUPPORTED_ACTIVE_CONTENT', message: 'Active or executable content is not accepted.' },
  EVIDENCE_STORAGE_UNAVAILABLE: { status: 503, code: 'EVIDENCE_STORAGE_UNAVAILABLE', message: 'Private evidence is temporarily unavailable.' },
  DOCUMENT_NOT_AVAILABLE: { status: 404, code: 'DOCUMENT_NOT_FOUND', message: 'Document not found.' },
  INTEGRITY_FAILURE: { status: 409, code: 'INTEGRITY_FAILURE', message: 'The stored document could not be verified.' },
});

function publicError(code, fallbackStatus = 400) {
  return PUBLIC_ERROR[code] || {
    status: fallbackStatus,
    code: 'INVALID_REQUEST',
    message: 'The request could not be accepted.',
  };
}

function ingestError(code) {
  const mapped = publicError(code);
  const err = new Error(mapped.message);
  err.code = mapped.code;
  err.status = mapped.status;
  err.expose = true;
  return err;
}

function parseOptionalDate(value) {
  if (value == null || value === '') return null;
  const raw = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    throw ingestError('MALFORMED_UPLOAD');
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw ingestError('MALFORMED_UPLOAD');
  }
  return raw.slice(0, 10);
}

function sanitizeDeclaredTitleNumber(value, uprn) {
  if (value == null || String(value).trim() === '') return null;
  const titleNumber = String(value).trim().slice(0, 64);
  if (uprn && String(titleNumber) === String(uprn)) {
    throw ingestError('UPRN_IS_NOT_A_TITLE_NUMBER');
  }
  if (/^\d+$/.test(titleNumber) && titleNumber.length <= 12 && uprn && String(uprn).includes(titleNumber)) {
    throw ingestError('UPRN_IS_NOT_A_TITLE_NUMBER');
  }
  return titleNumber;
}

async function authorizeAttach({ userId, propertyId, subjectId }) {
  if (!userId) throw ingestError('UNAUTHENTICATED');
  if (!propertyId && !subjectId) throw ingestError('SUBJECT_REQUIRED');
  if (propertyId) {
    const access = await resolvePropertyAccess(propertyId, userId);
    if (!access.allowed || access.accessLevel !== 'professional_intelligence') {
      throw ingestError('UNAUTHORIZED_SUBJECT');
    }
  }
  if (subjectId) {
    try {
      await assertSubjectAccess(userId, subjectId);
    } catch {
      throw ingestError('UNAUTHORIZED_SUBJECT');
    }
  }
}

function authorizationClass(record, { userId, role } = {}) {
  if (record && Number(record.ownerUserId) === Number(userId)) return AUTHORIZATION_CLASS.OWNER_ACCESS;
  if (role === 'admin') return AUTHORIZATION_CLASS.ADMINISTRATIVE_ACCESS;
  return null;
}

function canReadDocument(record, { userId, role } = {}) {
  if (!record || record.archivedAt) return false;
  return Boolean(authorizationClass(record, { userId, role }));
}

function buildSubjectRows({ propertyId, subjectId, subjectKind, subjectKey, titleNumber, uprn }) {
  const rows = [];
  if (propertyId) {
    rows.push({
      kind: IDENTITY_KIND.PROPERTY,
      id: String(propertyId),
      propertyId: Number(propertyId),
      intelligenceSubjectId: null,
      titleNumber: titleNumber || null,
      relationship: SUBJECT_RELATION.CLAIMED_REFERENCE,
    });
  }
  if (subjectId) {
    rows.push({
      kind: subjectKind && subjectKind !== IDENTITY_KIND.PROPERTY
        ? subjectKind
        : IDENTITY_KIND.SUBJECT,
      id: String(subjectId),
      propertyId: propertyId ? Number(propertyId) : null,
      intelligenceSubjectId: Number(subjectId),
      titleNumber: titleNumber || null,
      relationship: SUBJECT_RELATION.CLAIMED_REFERENCE,
    });
  }
  if (titleNumber) {
    rows.push({
      kind: IDENTITY_KIND.TITLE,
      id: titleNumber,
      propertyId: propertyId ? Number(propertyId) : null,
      intelligenceSubjectId: subjectId ? Number(subjectId) : null,
      titleNumber,
      relationship: SUBJECT_RELATION.CLAIMED_REFERENCE,
    });
  }
  if (subjectKind && subjectKey && !rows.some((row) => row.kind === subjectKind && row.id === String(subjectKey))) {
    createClaimedSubjectRef({ kind: subjectKind, id: subjectKey, uprn: uprn || null });
    rows.push({
      kind: subjectKind,
      id: String(subjectKey),
      propertyId: propertyId ? Number(propertyId) : null,
      intelligenceSubjectId: subjectId ? Number(subjectId) : null,
      titleNumber: titleNumber || null,
      relationship: SUBJECT_RELATION.CLAIMED_REFERENCE,
    });
  }
  return rows;
}

function toSafeRecord(record, extra = {}) {
  const subjectRefs = (record.subjects || []).map((row) => createClaimedSubjectRef({
    kind: row.kind,
    id: row.id,
    listingId: row.propertyId || null,
    subjectId: row.intelligenceSubjectId || null,
  }));
  const document = createPrivateEvidenceDocument({
    documentId: record.documentId,
    ownerUserId: record.ownerUserId,
    subjectRefs,
    domain: record.domain,
    documentType: record.documentType,
    originalFilename: record.originalFilename,
    mimeType: record.mimeType,
    byteSize: record.byteSize,
    contentHash: record.contentHash,
    sourceType: record.sourceType,
    source: record.source,
    documentDate: record.documentDate,
    uploadedAt: record.uploadedAt,
    evidenceAsOf: record.evidenceAsOf,
    verificationState: record.verificationState,
    extractionState: record.extractionState,
    privacy: VISIBILITY.PRIVATE,
    provenance: record.provenance,
    scanState: record.scanState,
    availabilityState: record.availabilityState,
    lifecycleState: record.lifecycleState,
    durabilityState: record.durabilityState,
    storageProvider: record.storageProvider,
  });
  const legalExtras = record.domain === 'LEGAL_TITLE'
    ? {
      declaredTitleNumber: record.declaredTitleNumber || null,
      declaredTenure: record.declaredTenure || null,
    }
    : {};
  return toPublicEvidenceDocument({ ...document, ...extra }, legalExtras);
}

async function ingestPrivateLegalDocument({
  userId,
  userRole,
  file,
  documentType,
  sourceType,
  propertyId = null,
  subjectId = null,
  subjectKind = null,
  subjectKey = null,
  documentDate = null,
  declaredTitleNumber = null,
  declaredTenure = null,
  uprn = null,
  supersededDocumentId = null,
} = {}) {
  if (!userId) throw ingestError('UNAUTHENTICATED');
  const capability = getPrivateEvidenceCapability();
  if (!capability.ingestAvailable) {
    throw ingestError('EVIDENCE_STORAGE_UNAVAILABLE');
  }
  await authorizeAttach({ userId, propertyId, subjectId });

  let type;
  let source;
  try {
    type = normalizeLegalDocumentType(documentType);
    source = normalizeSourceType(sourceType);
  } catch (error) {
    throw ingestError(error.message);
  }

  let validated;
  try {
    validated = storage.validateUploadBuffer({
      buffer: file?.buffer,
      mimeType: file?.mimetype,
      originalFilename: file?.originalname,
      declaredMimeType: file?.mimetype,
    });
  } catch (error) {
    throw ingestError(error.code || error.message);
  }

  const titleNumber = sanitizeDeclaredTitleNumber(declaredTitleNumber, uprn);
  if (titleNumber && /^\s*$/.test(titleNumber)) {
    throw ingestError('INVALID_TITLE_NUMBER');
  }

  let subjectRows;
  try {
    subjectRows = buildSubjectRows({
      propertyId,
      subjectId,
      subjectKind,
      subjectKey,
      titleNumber,
      uprn,
    });
  } catch (error) {
    throw ingestError(error.message);
  }

  const existing = await repository.findActiveByOwnerHash(
    userId,
    validated.contentHash,
    'LEGAL_TITLE'
  );
  if (existing) {
    existing.subjects = await repository.listSubjects(existing.documentId);
    await repository.attachSubjects(existing.documentId, subjectRows);
    existing.subjects = await repository.listSubjects(existing.documentId);
    return {
      document: toSafeRecord(existing, { duplicateOfDocumentId: existing.documentId }),
      duplicate: true,
    };
  }

  const uploadedAt = new Date().toISOString();
  const evidenceAsOf = parseOptionalDate(documentDate) || uploadedAt;
  const verificationState = normalizeVerificationState({
    sourceType: source,
    hasUserDeclaration: Boolean(type !== 'UNKNOWN' || titleNumber || declaredTenure),
  });
  const documentId = crypto.randomUUID();
  const scanResult = await scanPrivateEvidenceBuffer(file.buffer);
  const ingestStates = decideIngestStates(scanResult, { provider: capability.provider });
  let stored = null;
  try {
    stored = await storage.put(file.buffer);
    const record = await repository.insertDocument({
      documentId,
      ownerUserId: userId,
      domain: 'LEGAL_TITLE',
      documentType: type,
      originalFilename: validated.originalFilename,
      mimeType: validated.mimeType,
      byteSize: validated.byteSize,
      contentHash: validated.contentHash,
      storageKey: stored.storageKey,
      sourceType: source,
      source: source,
      documentDate: parseOptionalDate(documentDate),
      uploadedAt,
      evidenceAsOf,
      verificationState,
      extractionState: PRIVATE_EXTRACTION_STATE.NOT_EXTRACTED,
      privacy: VISIBILITY.PRIVATE,
      provenance: {
        suppliedByUserId: userId,
        claimedType: type,
        sourceType: source,
        uploadRole: userRole || 'user',
        filenameIsNotDocumentType: true,
        supersededDocumentId: supersededDocumentId || null,
      },
      declaredTitleNumber: titleNumber,
      declaredTenure: declaredTenure ? String(declaredTenure).slice(0, 80) : null,
      supersededDocumentId: supersededDocumentId || null,
      scanState: ingestStates.scanState || SCAN_STATE.SCAN_UNAVAILABLE,
      availabilityState: ingestStates.availabilityState,
      lifecycleState: LIFECYCLE_STATE.ACTIVE,
      durabilityState: capability.durability,
      storageProvider: capability.provider,
    }, subjectRows);
    return { document: toSafeRecord(record), duplicate: false };
  } catch (error) {
    if (error && error.code === '23505') {
      const raced = await repository.findActiveByOwnerHash(
        userId,
        validated.contentHash,
        'LEGAL_TITLE'
      );
      if (stored?.storageKey) {
        await storage.delete(stored.storageKey);
      }
      if (raced) {
        raced.subjects = await repository.listSubjects(raced.documentId);
        return {
          document: toSafeRecord(raced, { duplicateOfDocumentId: raced.documentId }),
          duplicate: true,
        };
      }
    }
    if (stored?.storageKey) {
      try {
        await storage.delete(stored.storageKey);
      } catch {
        // orphan cleanup best-effort
      }
    }
    if (error.expose) throw error;
    throw ingestError('MALFORMED_UPLOAD');
  }
}

async function getReadableDocument(documentId, { userId, role } = {}) {
  if (!userId) throw ingestError('UNAUTHENTICATED');
  const record = await repository.findByDocumentId(documentId);
  if (!canReadDocument(record, { userId, role })) {
    throw ingestError('DOCUMENT_NOT_FOUND');
  }
  record.subjects = await repository.listSubjects(record.documentId);
  await repository.recordAccessEvent({
    documentId: record.documentId,
    actorUserId: userId,
    action: 'read',
    authorizationClass: authorizationClass(record, { userId, role }),
  }).catch(() => {});
  return record;
}

async function listReadableDocuments({
  userId,
  role,
  propertyId = null,
  subjectId = null,
} = {}) {
  if (!userId) throw ingestError('UNAUTHENTICATED');
  if (propertyId || subjectId) {
    await authorizeAttach({ userId, propertyId, subjectId }).catch((error) => {
      if (role === 'admin' && error.code === 'UNAUTHORIZED_SUBJECT') return null;
      throw error;
    });
  }
  const ownerUserId = role === 'admin' && (propertyId || subjectId) ? null : userId;
  const rows = await repository.listForOwnerScope({
    ownerUserId,
    propertyId,
    subjectId,
    domain: 'LEGAL_TITLE',
  });
  return rows
    .filter((row) => canReadDocument(row, { userId, role }))
    .map((row) => toSafeRecord(row));
}

async function archiveReadableDocument(documentId, { userId, role } = {}) {
  const record = await getReadableDocument(documentId, { userId, role });
  let bytesRemoved = false;
  let lifecycleState = LIFECYCLE_STATE.ARCHIVED;
  try {
    bytesRemoved = await storage.delete(record.storageKey);
    if (!bytesRemoved && await storage.exists(record.storageKey)) {
      lifecycleState = LIFECYCLE_STATE.DELETE_FAILED;
    }
  } catch {
    lifecycleState = LIFECYCLE_STATE.DELETE_FAILED;
  }
  const archived = await repository.archiveDocument(record.documentId, {
    lifecycleState,
    bytesRemoved,
  });
  await repository.recordAccessEvent({
    documentId: record.documentId,
    actorUserId: userId,
    action: 'archive',
    authorizationClass: authorizationClass(record, { userId, role }),
  }).catch(() => {});
  return {
    document: toSafeRecord({
      ...record,
      ...archived,
      archivedAt: archived?.archivedAt || new Date().toISOString(),
      lifecycleState,
      bytesRemoved,
    }),
    archived: true,
    bytesRemoved,
    deleted: bytesRemoved,
    lifecycleState,
  };
}

async function readAuthorizedFile(documentId, { userId, role } = {}) {
  const record = await getReadableDocument(documentId, { userId, role });
  if (record.availabilityState === AVAILABILITY_STATE.QUARANTINED || !isDownloadableEvidence(record)) {
    throw ingestError('DOCUMENT_NOT_AVAILABLE');
  }
  let buffer;
  try {
    buffer = await storage.read(record.storageKey);
  } catch {
    throw ingestError('DOCUMENT_NOT_AVAILABLE');
  }
  const hash = storage.computeContentHash(buffer);
  const integrityOk = hash === record.contentHash && buffer.length === record.byteSize;
  await repository.markIntegrity(record.documentId, integrityOk).catch(() => {});
  if (!integrityOk) {
    throw ingestError('INTEGRITY_FAILURE');
  }
  await repository.recordAccessEvent({
    documentId: record.documentId,
    actorUserId: userId,
    action: 'download',
    authorizationClass: authorizationClass(record, { userId, role }),
  }).catch(() => {});
  return {
    buffer,
    mimeType: record.mimeType,
    originalFilename: record.originalFilename,
    document: toSafeRecord(record),
    authorizationClass: authorizationClass(record, { userId, role }),
  };
}

async function retryFailedDeletes() {
  const rows = await repository.listDeleteFailed();
  const results = [];
  for (const row of rows) {
    try {
      const removed = await storage.delete(row.storageKey);
      const stillThere = await storage.exists(row.storageKey);
      const lifecycleState = !stillThere ? LIFECYCLE_STATE.ARCHIVED : LIFECYCLE_STATE.DELETE_FAILED;
      await repository.archiveDocument(row.documentId, {
        lifecycleState,
        bytesRemoved: removed && !stillThere,
      });
      results.push({ documentId: row.documentId, lifecycleState, bytesRemoved: removed && !stillThere });
    } catch {
      results.push({ documentId: row.documentId, lifecycleState: LIFECYCLE_STATE.DELETE_FAILED, bytesRemoved: false });
    }
  }
  return results;
}

module.exports = {
  publicError,
  ingestError,
  authorizeAttach,
  canReadDocument,
  ingestPrivateLegalDocument,
  getReadableDocument,
  listReadableDocuments,
  archiveReadableDocument,
  readAuthorizedFile,
  retryFailedDeletes,
  toSafeRecord,
  authorizationClass,
};
