/**
 * Maps persisted private legal documents into LEGAL_TITLE contracts.
 * Does not extract document contents or invent legal conclusions.
 */

const { IDENTITY_KIND } = require('../../architecture/identityModel');
const { SOURCE_TYPE, VISIBILITY, EVIDENCE_CLASS } = require('../../architecture/evidenceContract');
const {
  createLegalDocument,
  createTitleRef,
  LEGAL_DOCUMENT_TYPE,
  EXTRACTION_STATE,
  VALIDATION_STATE,
  TITLE_IDENTIFIER_TYPE,
} = require('../../architecture/legalTitleContract');
const { createClaimedSubjectRef, AVAILABILITY_STATE } = require('../../architecture/privateEvidenceContract');
const { isLegalAvailableEvidence } = require('./malwareScanner');
const repository = require('./evidenceDocumentRepository');
const storage = require('./privateEvidenceStorage');

function toLegalDocument(record) {
  const subjectRefs = (record.subjects || []).map((row) => createClaimedSubjectRef({
    kind: row.kind,
    id: row.id,
    listingId: row.propertyId || null,
    subjectId: row.intelligenceSubjectId || null,
  }));
  const titleRefs = [];
  if (record.declaredTitleNumber) {
    titleRefs.push(createTitleRef({
      identifier: record.declaredTitleNumber,
      identifierType: TITLE_IDENTIFIER_TYPE.TITLE_NUMBER,
      source: record.sourceType,
      state: 'UNKNOWN',
    }));
  }
  const document = createLegalDocument({
    documentId: record.documentId,
    documentType: LEGAL_DOCUMENT_TYPE[record.documentType] || LEGAL_DOCUMENT_TYPE.UNKNOWN,
    subjectRefs,
    titleRefs,
    sourceType: SOURCE_TYPE.USER_REPORTED,
    source: record.sourceType,
    uploadedBy: record.ownerUserId,
    visibility: VISIBILITY.PRIVATE,
    documentDate: record.documentDate,
    evidenceAsOf: record.evidenceAsOf || record.documentDate || record.uploadedAt,
    extractionState: EXTRACTION_STATE[record.extractionState] || EXTRACTION_STATE.NOT_EXTRACTED,
    validationState: VALIDATION_STATE.NOT_VALIDATED,
    filename: record.originalFilename,
    provenance: {
      source: record.sourceType,
      verificationState: record.verificationState,
      extractionState: record.extractionState,
      officialSource: false,
      authenticityVerified: false,
    },
    limitations: [
      'Upload is not authenticity verification.',
      'Document presence is not a legal conclusion.',
      'Filename is not the document type.',
    ],
  });
  return {
    ...document,
    uploadedAt: record.uploadedAt,
    verificationState: record.verificationState,
    declaredTitleNumber: record.declaredTitleNumber || null,
    declaredTenure: record.declaredTenure || null,
    mimeType: record.mimeType,
    byteSize: record.byteSize,
    fileAvailability: record.fileAvailability || AVAILABILITY_STATE.AVAILABLE,
    highRiskContent: {
      covenants: 'CONTENT_NOT_ASSESSED',
      easements: 'CONTENT_NOT_ASSESSED',
      charges: 'CONTENT_NOT_ASSESSED',
      restrictions: 'CONTENT_NOT_ASSESSED',
    },
  };
}

async function loadLegalEvidenceForAnalysis({
  ownerUserId,
  propertyId = null,
  subjectId = null,
} = {}) {
  if (!ownerUserId) {
    return { documents: [], titleRefs: [] };
  }
  const rows = await repository.listForOwnerScope({
    ownerUserId,
    propertyId,
    subjectId,
    domain: 'LEGAL_TITLE',
  });
  const documents = [];
  for (const row of rows) {
    let fileAvailability = AVAILABILITY_STATE.UNAVAILABLE;
    if (!isLegalAvailableEvidence(row)) {
      fileAvailability = row.availabilityState === AVAILABILITY_STATE.QUARANTINED
        || row.scanState === 'SCAN_PENDING'
        || row.scanState === 'ERROR'
        ? AVAILABILITY_STATE.QUARANTINED
        : AVAILABILITY_STATE.UNAVAILABLE;
    } else {
      try {
        const present = await storage.exists(row.storageKey);
        fileAvailability = present ? AVAILABILITY_STATE.AVAILABLE : AVAILABILITY_STATE.UNAVAILABLE;
      } catch {
        fileAvailability = AVAILABILITY_STATE.UNAVAILABLE;
      }
    }
    documents.push(toLegalDocument({ ...row, fileAvailability }));
  }
  const titleRefs = [];
  const seen = new Set();
  documents.forEach((doc) => {
    (doc.titleRefs || []).forEach((ref) => {
      if (!ref?.present) return;
      const key = `${ref.identifierType}:${ref.identifier}`;
      if (seen.has(key)) return;
      seen.add(key);
      titleRefs.push(ref);
    });
  });
  return { documents, titleRefs };
}

function snapshotLegalEvidence(documents = []) {
  return documents.map((doc) => ({
    documentId: doc.documentId,
    documentType: doc.documentType,
    sourceType: doc.sourceType,
    source: doc.source,
    verificationState: doc.verificationState,
    extractionState: doc.extractionState,
    documentDate: doc.documentDate,
    uploadedAt: doc.uploadedAt,
    evidenceAsOf: doc.evidenceAsOf,
    fileAvailability: doc.fileAvailability || AVAILABILITY_STATE.AVAILABLE,
    declaredTitleNumber: doc.declaredTitleNumber || null,
    filenameIsNotDocumentType: true,
    officialSource: false,
    authenticityVerified: false,
    highRiskContent: doc.highRiskContent || {
      covenants: 'CONTENT_NOT_ASSESSED',
      easements: 'CONTENT_NOT_ASSESSED',
      charges: 'CONTENT_NOT_ASSESSED',
      restrictions: 'CONTENT_NOT_ASSESSED',
    },
    classification: EVIDENCE_CLASS.USER_INPUT,
    subjectKinds: (doc.subjectRefs || []).map((ref) => ref.kind).filter(Boolean),
    propertyIsNotTitle: true,
    titleKindPresent: (doc.subjectRefs || []).some((ref) => ref.kind === IDENTITY_KIND.TITLE)
      || Boolean(doc.declaredTitleNumber),
  }));
}

module.exports = {
  toLegalDocument,
  loadLegalEvidenceForAnalysis,
  snapshotLegalEvidence,
};
