/**
 * Shared private evidence-document contract.
 * Domain-neutral identity, privacy, storage, lifecycle, and provenance.
 * Does not own title, covenant, survey, quote, or lease interpretation.
 */

const { PRIVATE_EVIDENCE_CONTRACT_VERSION } = require('./versions');
const { IDENTITY_KIND, createSubjectRef } = require('./identityModel');
const { VISIBILITY } = require('./evidenceContract');
const { markPrivate } = require('./privacyBoundary');

const PRIVATE_EVIDENCE_SOURCE_TYPE = Object.freeze({
  USER_UPLOADED_OFFICIAL_COPY: 'USER_UPLOADED_OFFICIAL_COPY',
  USER_UPLOADED_PRIVATE_DOCUMENT: 'USER_UPLOADED_PRIVATE_DOCUMENT',
  PROFESSIONAL_DOCUMENT: 'PROFESSIONAL_DOCUMENT',
});

const VERIFICATION_STATE = Object.freeze({
  UNVERIFIED: 'UNVERIFIED',
  USER_DECLARED: 'USER_DECLARED',
});

const PRIVATE_EXTRACTION_STATE = Object.freeze({
  NOT_ATTEMPTED: 'NOT_ATTEMPTED',
  NOT_EXTRACTED: 'NOT_EXTRACTED',
  NOT_SUPPORTED: 'NOT_SUPPORTED',
  EXTRACTED_UNVALIDATED: 'EXTRACTED_UNVALIDATED',
  EXTRACTED_VALIDATED: 'EXTRACTED_VALIDATED',
  FAILED: 'FAILED',
  UNREADABLE: 'UNREADABLE',
});

const SCAN_STATE = Object.freeze({
  NOT_SCANNED: 'NOT_SCANNED',
  SCAN_PENDING: 'SCAN_PENDING',
  CLEAN: 'CLEAN',
  REJECTED: 'REJECTED',
  SCAN_UNAVAILABLE: 'SCAN_UNAVAILABLE',
  ERROR: 'ERROR',
});

const AVAILABILITY_STATE = Object.freeze({
  RECEIVED: 'RECEIVED',
  QUARANTINED: 'QUARANTINED',
  AVAILABLE: 'AVAILABLE',
  UNAVAILABLE: 'UNAVAILABLE',
});

const LIFECYCLE_STATE = Object.freeze({
  ACTIVE: 'ACTIVE',
  ARCHIVED: 'ARCHIVED',
  DELETION_PENDING: 'DELETION_PENDING',
  DELETE_FAILED: 'DELETE_FAILED',
  DELETED: 'DELETED',
});

const DURABILITY_STATE = Object.freeze({
  DEVELOPMENT_LOCAL: 'DEVELOPMENT_LOCAL',
  DURABLE_PRIVATE: 'DURABLE_PRIVATE',
  UNAVAILABLE: 'UNAVAILABLE',
});

const STORAGE_PROVIDER = Object.freeze({
  LOCAL_PRIVATE: 'LOCAL_PRIVATE',
  PRODUCTION_PRIVATE: 'PRODUCTION_PRIVATE',
  UNAVAILABLE: 'UNAVAILABLE',
});

const AUTHORIZATION_CLASS = Object.freeze({
  OWNER_ACCESS: 'OWNER_ACCESS',
  ADMINISTRATIVE_ACCESS: 'ADMINISTRATIVE_ACCESS',
});

const CAPABILITY_STATUS = Object.freeze({
  AVAILABLE: 'AVAILABLE',
  DEGRADED: 'DEGRADED',
  UNAVAILABLE: 'UNAVAILABLE',
});

const ENCRYPTION_STATUS = Object.freeze({
  VERIFIED_PROVIDER_ENCRYPTION: 'VERIFIED_PROVIDER_ENCRYPTION',
  HOST_LEVEL_ONLY: 'HOST_LEVEL_ONLY',
  NOT_VERIFIED: 'NOT_VERIFIED',
});

const BACKUP_STATUS = Object.freeze({
  VERIFIED_COORDINATED_RECOVERY: 'VERIFIED_COORDINATED_RECOVERY',
  INDEPENDENT_BACKUPS_ONLY: 'INDEPENDENT_BACKUPS_ONLY',
  NOT_VERIFIED: 'NOT_VERIFIED',
});

const SCANNER_CLASS = Object.freeze({
  REAL_SCANNER_AVAILABLE: 'REAL_SCANNER_AVAILABLE',
  SCANNER_CONFIG_PRESENT_BUT_UNVERIFIED: 'SCANNER_CONFIG_PRESENT_BUT_UNVERIFIED',
  NO_SCANNER_AVAILABLE: 'NO_SCANNER_AVAILABLE',
});

const DEPLOYMENT_STORAGE_CLASS = Object.freeze({
  EXISTING_CONFIGURED_PROVIDER: 'EXISTING_CONFIGURED_PROVIDER',
  EXISTING_PROVIDER_BUT_INCOMPLETE_CONFIG: 'EXISTING_PROVIDER_BUT_INCOMPLETE_CONFIG',
  NO_PRODUCTION_PROVIDER_EVIDENCE: 'NO_PRODUCTION_PROVIDER_EVIDENCE',
});

const SUBJECT_RELATION = Object.freeze({
  CLAIMED_REFERENCE: 'CLAIMED_REFERENCE',
});

const ALLOWED_SUBJECT_KINDS = Object.freeze([
  IDENTITY_KIND.PROPERTY,
  IDENTITY_KIND.TITLE,
  IDENTITY_KIND.LAND_PARCEL,
  IDENTITY_KIND.BUILDING,
  IDENTITY_KIND.UNIT,
  IDENTITY_KIND.SITE,
  IDENTITY_KIND.DEVELOPMENT_SITE,
  IDENTITY_KIND.SUBJECT,
  IDENTITY_KIND.LISTING,
]);

const ALLOWED_MIME_TYPES = Object.freeze({
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
});

const MAX_EVIDENCE_BYTES = 20 * 1024 * 1024;
const MAX_FILENAME_LENGTH = 255;

function normalizeDocumentType(value) {
  if (value == null || value === '') return 'UNKNOWN';
  const key = String(value).trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(key)) {
    throw new Error('INVALID_DOCUMENT_TYPE');
  }
  return key;
}

function normalizeSourceType(value) {
  if (value == null || value === '') {
    return PRIVATE_EVIDENCE_SOURCE_TYPE.USER_UPLOADED_PRIVATE_DOCUMENT;
  }
  const key = String(value).trim().toUpperCase();
  if (key === 'OFFICIAL_SOURCE' || key === 'OFFICIAL' || key === 'LICENSED_PROVIDER') {
    throw new Error('UPLOAD_IS_NOT_OFFICIAL_SOURCE');
  }
  if (!PRIVATE_EVIDENCE_SOURCE_TYPE[key]) {
    throw new Error('INVALID_SOURCE_TYPE');
  }
  return key;
}

function normalizeVerificationState({ sourceType, hasUserDeclaration } = {}) {
  if (hasUserDeclaration) return VERIFICATION_STATE.USER_DECLARED;
  if (sourceType === PRIVATE_EVIDENCE_SOURCE_TYPE.USER_UPLOADED_OFFICIAL_COPY
    || sourceType === PRIVATE_EVIDENCE_SOURCE_TYPE.PROFESSIONAL_DOCUMENT) {
    return VERIFICATION_STATE.USER_DECLARED;
  }
  return VERIFICATION_STATE.UNVERIFIED;
}

function mapExtractionState(value) {
  if (!value) return PRIVATE_EXTRACTION_STATE.NOT_EXTRACTED;
  if (value === PRIVATE_EXTRACTION_STATE.NOT_ATTEMPTED) {
    return PRIVATE_EXTRACTION_STATE.NOT_EXTRACTED;
  }
  return PRIVATE_EXTRACTION_STATE[value] || PRIVATE_EXTRACTION_STATE.NOT_EXTRACTED;
}

function sanitizeOriginalFilename(filename) {
  const raw = String(filename || 'document').replace(/\\/g, '/');
  const base = raw.split('/').pop() || 'document';
  const cleaned = base.replace(/\0/g, '').replace(/^\.+/, '').trim() || 'document';
  return cleaned.slice(0, MAX_FILENAME_LENGTH);
}

function filenameExtension(filename) {
  const name = sanitizeOriginalFilename(filename);
  const idx = name.lastIndexOf('.');
  if (idx <= 0) return '';
  return name.slice(idx).toLowerCase();
}

function createClaimedSubjectRef({
  kind,
  id,
  uprn = null,
  listingId = null,
  subjectId = null,
} = {}) {
  if (!kind || !ALLOWED_SUBJECT_KINDS.includes(kind)) {
    throw new Error('INVALID_SUBJECT_TYPE');
  }
  const ref = createSubjectRef({ kind, id, uprn, listingId, subjectId });
  return {
    ...ref,
    relationship: SUBJECT_RELATION.CLAIMED_REFERENCE,
    legalRelationshipProven: false,
    cadastralMatch: false,
    uploadDoesNotProveLegalRelationship: true,
  };
}

function createPrivateEvidenceDocument({
  documentId,
  ownerUserId,
  subjectRefs = [],
  domain,
  documentType = 'UNKNOWN',
  originalFilename = null,
  mimeType,
  byteSize,
  contentHash,
  sourceType = PRIVATE_EVIDENCE_SOURCE_TYPE.USER_UPLOADED_PRIVATE_DOCUMENT,
  source = null,
  documentDate = null,
  uploadedAt = null,
  evidenceAsOf = null,
  verificationState = VERIFICATION_STATE.UNVERIFIED,
  extractionState = PRIVATE_EXTRACTION_STATE.NOT_EXTRACTED,
  privacy = VISIBILITY.PRIVATE,
  provenance = null,
  version = PRIVATE_EVIDENCE_CONTRACT_VERSION,
  scanState = SCAN_STATE.SCAN_UNAVAILABLE,
  availabilityState = AVAILABILITY_STATE.AVAILABLE,
  lifecycleState = LIFECYCLE_STATE.ACTIVE,
  durabilityState = DURABILITY_STATE.DEVELOPMENT_LOCAL,
  storageProvider = STORAGE_PROVIDER.LOCAL_PRIVATE,
} = {}) {
  if (documentId == null || documentId === '') {
    throw new Error('Private evidence document requires documentId');
  }
  if (ownerUserId == null || ownerUserId === '') {
    throw new Error('Private evidence document requires ownerUserId');
  }
  if (!contentHash) {
    throw new Error('Private evidence document requires contentHash');
  }
  if (!domain) {
    throw new Error('Private evidence document requires domain');
  }
  const type = normalizeDocumentType(documentType);
  const resolvedSource = normalizeSourceType(sourceType);
  return markPrivate({
    documentId: String(documentId),
    ownerUserId,
    subjectRefs: Array.isArray(subjectRefs) ? subjectRefs : [],
    domain: String(domain),
    documentType: type,
    filenameIsNotDocumentType: true,
    originalFilename: originalFilename ? sanitizeOriginalFilename(originalFilename) : null,
    mimeType: mimeType || null,
    byteSize: Number.isFinite(byteSize) ? byteSize : null,
    contentHash: String(contentHash),
    sourceType: resolvedSource,
    source: source || resolvedSource,
    officialSource: false,
    authenticityVerified: false,
    fileReceived: true,
    documentDate: documentDate || null,
    uploadedAt: uploadedAt || null,
    evidenceAsOf: evidenceAsOf || documentDate || uploadedAt || null,
    verificationState: VERIFICATION_STATE[verificationState] || VERIFICATION_STATE.UNVERIFIED,
    extractionState: mapExtractionState(extractionState),
    scanState: SCAN_STATE[scanState] || SCAN_STATE.SCAN_UNAVAILABLE,
    availabilityState: AVAILABILITY_STATE[availabilityState] || AVAILABILITY_STATE.AVAILABLE,
    lifecycleState: LIFECYCLE_STATE[lifecycleState] || LIFECYCLE_STATE.ACTIVE,
    durabilityState: DURABILITY_STATE[durabilityState] || DURABILITY_STATE.DEVELOPMENT_LOCAL,
    storageProvider: STORAGE_PROVIDER[storageProvider] || STORAGE_PROVIDER.LOCAL_PRIVATE,
    privacy: VISIBILITY.PRIVATE,
    visibility: VISIBILITY.PRIVATE,
    sharedPropertyEvidence: false,
    provenance: provenance || {
      suppliedByUserId: ownerUserId,
      claimedType: type,
      sourceType: resolvedSource,
    },
    version,
    factType: 'privateEvidenceUpload',
  });
}

function toPublicEvidenceDocument(document, extras = {}) {
  if (!document) return null;
  return {
    documentId: document.documentId,
    domain: document.domain,
    documentType: document.documentType,
    originalFilename: document.originalFilename || document.filename || null,
    mimeType: document.mimeType,
    byteSize: document.byteSize,
    sourceType: document.sourceType,
    source: document.source,
    officialSource: false,
    authenticityVerified: false,
    fileReceived: true,
    filenameIsNotDocumentType: true,
    documentDate: document.documentDate,
    uploadedAt: document.uploadedAt,
    evidenceAsOf: document.evidenceAsOf,
    verificationState: document.verificationState,
    extractionState: document.extractionState,
    scanState: document.scanState || SCAN_STATE.SCAN_UNAVAILABLE,
    scanClean: false,
    availabilityState: document.availabilityState || AVAILABILITY_STATE.AVAILABLE,
    lifecycleState: document.lifecycleState || LIFECYCLE_STATE.ACTIVE,
    durabilityState: document.durabilityState || DURABILITY_STATE.DEVELOPMENT_LOCAL,
    privacy: VISIBILITY.PRIVATE,
    subjectRefs: (document.subjectRefs || []).map((ref) => ({
      kind: ref.kind,
      id: ref.id,
      relationship: ref.relationship || SUBJECT_RELATION.CLAIMED_REFERENCE,
      legalRelationshipProven: false,
    })),
    duplicateOfDocumentId: document.duplicateOfDocumentId || extras.duplicateOfDocumentId || null,
    version: document.version || PRIVATE_EVIDENCE_CONTRACT_VERSION,
    ...extras,
  };
}

module.exports = {
  PRIVATE_EVIDENCE_CONTRACT_VERSION,
  PRIVATE_EVIDENCE_SOURCE_TYPE,
  VERIFICATION_STATE,
  PRIVATE_EXTRACTION_STATE,
  SCAN_STATE,
  AVAILABILITY_STATE,
  LIFECYCLE_STATE,
  DURABILITY_STATE,
  STORAGE_PROVIDER,
  AUTHORIZATION_CLASS,
  CAPABILITY_STATUS,
  ENCRYPTION_STATUS,
  BACKUP_STATUS,
  SCANNER_CLASS,
  DEPLOYMENT_STORAGE_CLASS,
  SUBJECT_RELATION,
  ALLOWED_SUBJECT_KINDS,
  ALLOWED_MIME_TYPES,
  MAX_EVIDENCE_BYTES,
  MAX_FILENAME_LENGTH,
  normalizeDocumentType,
  normalizeSourceType,
  normalizeVerificationState,
  mapExtractionState,
  sanitizeOriginalFilename,
  filenameExtension,
  createClaimedSubjectRef,
  createPrivateEvidenceDocument,
  toPublicEvidenceDocument,
};
