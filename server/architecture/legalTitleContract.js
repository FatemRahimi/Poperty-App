/**
 * Legal & Title evidence/document contracts.
 * Foundation only. Does not interpret covenants, score title, or give legal advice.
 */

const { IDENTITY_KIND, createSubjectRef } = require('./identityModel');
const { UNIT } = require('./units');
const {
  createEvidence,
  EVIDENCE_CLASS,
  SOURCE_TYPE,
  VISIBILITY,
  TIME_FIELD,
} = require('./evidenceContract');
const { KERNEL_ASSESSMENT } = require('./assessmentStates');
const { assertEvidenceVisibility, markPrivate } = require('./privacyBoundary');

const TITLE_IDENTIFIER_TYPE = Object.freeze({
  TITLE_NUMBER: 'TITLE_NUMBER',
  UNKNOWN: 'UNKNOWN',
});

const TITLE_JURISDICTION = Object.freeze({
  ENG_WALES: 'ENG_WALES',
  SCOTLAND: 'SCOTLAND',
  NI: 'NI',
  UNKNOWN: 'UNKNOWN',
});

const LEGAL_DOCUMENT_TYPE = Object.freeze({
  TITLE_REGISTER: 'TITLE_REGISTER',
  TITLE_PLAN: 'TITLE_PLAN',
  LEASE: 'LEASE',
  TRANSFER: 'TRANSFER',
  CONVEYANCE: 'CONVEYANCE',
  DEED: 'DEED',
  DEED_OF_VARIATION: 'DEED_OF_VARIATION',
  RESTRICTION: 'RESTRICTION',
  COVENANT_DOCUMENT: 'COVENANT_DOCUMENT',
  EASEMENT_DOCUMENT: 'EASEMENT_DOCUMENT',
  CHARGE_DOCUMENT: 'CHARGE_DOCUMENT',
  PLANNING_AGREEMENT: 'PLANNING_AGREEMENT',
  SURVEY: 'SURVEY',
  OFFICIAL_COPY: 'OFFICIAL_COPY',
  OTHER: 'OTHER',
  OTHER_LEGAL_DOCUMENT: 'OTHER_LEGAL_DOCUMENT',
  UNKNOWN: 'UNKNOWN',
});

const LEGAL_FACT_TYPE = Object.freeze({
  TENURE: 'TENURE',
  TENURE_TEXT: 'TENURE_TEXT',
  LEASE_TERM_YEARS: 'LEASE_TERM_YEARS',
  LEASE_TERM_TEXT: 'LEASE_TERM_TEXT',
  LEASE_START_DATE: 'LEASE_START_DATE',
  LEASE_END_DATE: 'LEASE_END_DATE',
  TITLE_NUMBER: 'TITLE_NUMBER',
  DOCUMENT_DATE: 'DOCUMENT_DATE',
  REGISTER_REFERENCE: 'REGISTER_REFERENCE',
});

const FORBIDDEN_LEGAL_FACT_TYPE = Object.freeze({
  GOOD_TITLE: 'GOOD_TITLE',
  CLEAN_TITLE: 'CLEAN_TITLE',
  NO_COVENANTS: 'NO_COVENANTS',
  NO_EASEMENT: 'NO_EASEMENT',
  NO_RESTRICTION: 'NO_RESTRICTION',
  NO_LEASE_ISSUE: 'NO_LEASE_ISSUE',
  NO_OWNERSHIP_ISSUE: 'NO_OWNERSHIP_ISSUE',
  DEVELOPMENT_ALLOWED: 'DEVELOPMENT_ALLOWED',
  TITLE_QUALITY: 'TITLE_QUALITY',
  LEGAL_RECOMMENDATION: 'LEGAL_RECOMMENDATION',
});

const LEGAL_ROLE = Object.freeze({
  DOCUMENT_FACT: 'DOCUMENT_FACT',
  EXTRACTED_FACT: 'EXTRACTED_FACT',
  LEGAL_INTERPRETATION: 'LEGAL_INTERPRETATION',
});

const LEGAL_EVIDENCE_CLASS = Object.freeze({
  LEGAL_TITLE_CORE: 'LEGAL_TITLE_CORE',
  LEGAL_TITLE_ADJACENT: 'LEGAL_TITLE_ADJACENT',
  PLANNING_CONSTRAINT: 'PLANNING_CONSTRAINT',
  HERITAGE_DESIGNATION: 'HERITAGE_DESIGNATION',
  OWNERSHIP_PRIVATE: 'OWNERSHIP_PRIVATE',
  MARKET_TRANSACTION_DATA: 'MARKET_TRANSACTION_DATA',
  NOT_LEGAL_EVIDENCE: 'NOT_LEGAL_EVIDENCE',
});

const MISSING_DOCUMENT = Object.freeze({
  TITLE_REGISTER_NOT_PROVIDED: 'TITLE_REGISTER_NOT_PROVIDED',
  TITLE_PLAN_NOT_PROVIDED: 'TITLE_PLAN_NOT_PROVIDED',
  LEASE_NOT_PROVIDED: 'LEASE_NOT_PROVIDED',
  DOCUMENT_UNREADABLE: 'DOCUMENT_UNREADABLE',
  DOCUMENT_TYPE_UNKNOWN: 'DOCUMENT_TYPE_UNKNOWN',
});

const LEGAL_CONFLICT = Object.freeze({
  CONFLICTING_EVIDENCE: 'CONFLICTING_EVIDENCE',
});

const EXTRACTION_STATE = Object.freeze({
  NOT_EXTRACTED: 'NOT_EXTRACTED',
  EXTRACTED_UNVALIDATED: 'EXTRACTED_UNVALIDATED',
  EXTRACTED_VALIDATED: 'EXTRACTED_VALIDATED',
  UNREADABLE: 'UNREADABLE',
});

const VALIDATION_STATE = Object.freeze({
  NOT_VALIDATED: 'NOT_VALIDATED',
  VALIDATED: 'VALIDATED',
  REJECTED: 'REJECTED',
});

const TITLE_REF_STATE = Object.freeze({
  ASSESSED: 'ASSESSED',
  NOT_ASSESSED: 'NOT_ASSESSED',
  UNKNOWN: 'UNKNOWN',
});

const DESIGNATION_OWNERSHIP = Object.freeze({
  listedBuilding: LEGAL_EVIDENCE_CLASS.HERITAGE_DESIGNATION,
  conservationArea: LEGAL_EVIDENCE_CLASS.HERITAGE_DESIGNATION,
  article4: LEGAL_EVIDENCE_CLASS.PLANNING_CONSTRAINT,
  planning: LEGAL_EVIDENCE_CLASS.PLANNING_CONSTRAINT,
  flood: LEGAL_EVIDENCE_CLASS.PLANNING_CONSTRAINT,
});

function normalizeTenureValue(value) {
  if (value == null || value === '') return null;
  const raw = String(value).trim().toLowerCase().replace(/[_-]+/g, ' ');
  if (raw === 'freehold') return 'FREEHOLD';
  if (raw === 'leasehold') return 'LEASEHOLD';
  if (raw === 'commonhold') return 'COMMONHOLD';
  if (raw === 'share of freehold') return 'SHARE_OF_FREEHOLD';
  return null;
}

function createTitleRef({
  identifier = null,
  identifierType = TITLE_IDENTIFIER_TYPE.UNKNOWN,
  jurisdiction = TITLE_JURISDICTION.UNKNOWN,
  source = null,
  state = TITLE_REF_STATE.UNKNOWN,
  fromUprn = false,
} = {}) {
  if (fromUprn || identifierType === 'UPRN') {
    throw new Error('UPRN_IS_NOT_A_TITLE_NUMBER');
  }
  const present = identifier != null && String(identifier).trim() !== '';
  if (!present) {
    return {
      entityKind: IDENTITY_KIND.TITLE,
      identifier: null,
      identifierType: TITLE_IDENTIFIER_TYPE.UNKNOWN,
      jurisdiction: jurisdiction || TITLE_JURISDICTION.UNKNOWN,
      source: source || null,
      state: TITLE_REF_STATE.NOT_ASSESSED,
      present: false,
    };
  }
  const type = TITLE_IDENTIFIER_TYPE[identifierType] || TITLE_IDENTIFIER_TYPE.UNKNOWN;
  return {
    entityKind: IDENTITY_KIND.TITLE,
    identifier: String(identifier).trim(),
    identifierType: type,
    jurisdiction: TITLE_JURISDICTION[jurisdiction] || TITLE_JURISDICTION.UNKNOWN,
    source: source || null,
    state: TITLE_REF_STATE[state] || TITLE_REF_STATE.UNKNOWN,
    present: true,
  };
}

function assertPropertyIsNotTitle(propertyRef, titleRef) {
  if (!propertyRef || !titleRef) return true;
  if (propertyRef.kind === IDENTITY_KIND.TITLE) {
    throw new Error('PROPERTY_REF_MUST_NOT_BE_TITLE');
  }
  if (titleRef.entityKind !== IDENTITY_KIND.TITLE && titleRef.kind !== IDENTITY_KIND.TITLE) {
    throw new Error('TITLE_REF_REQUIRED');
  }
  if (propertyRef.id && titleRef.identifier && String(propertyRef.id) === String(titleRef.identifier)
    && propertyRef.kind === IDENTITY_KIND.PROPERTY) {
    throw new Error('PROPERTY_ID_IS_NOT_TITLE_NUMBER');
  }
  return true;
}

function createLegalDocument({
  documentId,
  documentType = LEGAL_DOCUMENT_TYPE.UNKNOWN,
  subjectRefs = [],
  titleRefs = [],
  sourceType = SOURCE_TYPE.USER_REPORTED,
  source = null,
  uploadedBy = null,
  visibility = VISIBILITY.PRIVATE,
  documentDate = null,
  effectiveFrom = null,
  effectiveTo = null,
  retrievedAt = null,
  evidenceAsOf = null,
  version = null,
  contentHash = null,
  extractionState = EXTRACTION_STATE.NOT_EXTRACTED,
  validationState = VALIDATION_STATE.NOT_VALIDATED,
  limitations = [],
  provenance = null,
  filename = null,
} = {}) {
  if (documentId == null || documentId === '') {
    throw new Error('Legal document requires documentId');
  }
  const type = LEGAL_DOCUMENT_TYPE[documentType] || LEGAL_DOCUMENT_TYPE.UNKNOWN;
  const vis = visibility === VISIBILITY.SHARED ? VISIBILITY.SHARED : VISIBILITY.PRIVATE;
  const document = {
    documentId: String(documentId),
    documentType: type,
    filenameIsNotDocumentType: true,
    filename: filename || null,
    subjectRefs: Array.isArray(subjectRefs) ? subjectRefs : [],
    titleRefs: Array.isArray(titleRefs) ? titleRefs : [],
    sourceType: SOURCE_TYPE[sourceType] || SOURCE_TYPE.USER_REPORTED,
    source: source || null,
    uploadedBy: vis === VISIBILITY.PRIVATE ? uploadedBy : null,
    visibility: vis,
    sharedPropertyEvidence: false,
    documentDate: documentDate || null,
    effectiveFrom: effectiveFrom || null,
    effectiveTo: effectiveTo || null,
    retrievedAt: retrievedAt || null,
    evidenceAsOf: evidenceAsOf || null,
    version: version || null,
    contentHash: contentHash || null,
    extractionState: EXTRACTION_STATE[extractionState] || EXTRACTION_STATE.NOT_EXTRACTED,
    validationState: VALIDATION_STATE[validationState] || VALIDATION_STATE.NOT_VALIDATED,
    limitations: Array.isArray(limitations) ? limitations : [],
    provenance: provenance || { source: source || null },
    timeFields: TIME_FIELD,
  };
  if (vis === VISIBILITY.PRIVATE) {
    return markPrivate({
      ...document,
      factType: 'legalDocumentUpload',
      visibility: VISIBILITY.PRIVATE,
      sharedPropertyEvidence: false,
    });
  }
  return assertEvidenceVisibility({
    ...document,
    factType: 'legalDocumentUpload',
    visibility: vis,
    sharedPropertyEvidence: false,
  });
}

function createLegalTitleFact({
  factType,
  value = null,
  unit = null,
  subjectRef,
  titleRef = null,
  documentRef = null,
  classification = EVIDENCE_CLASS.FACT,
  sourceType = SOURCE_TYPE.USER_REPORTED,
  provenance,
  effectiveFrom = null,
  effectiveTo = null,
  evidenceAsOf = null,
  retrievedAt = null,
  documentDate = null,
  assessmentState = KERNEL_ASSESSMENT.NOT_ASSESSED,
  limitations = [],
  legalRole = LEGAL_ROLE.DOCUMENT_FACT,
  legalClass = LEGAL_EVIDENCE_CLASS.LEGAL_TITLE_ADJACENT,
  visibility = VISIBILITY.SHARED,
  sharedPropertyEvidence = false,
} = {}) {
  if (FORBIDDEN_LEGAL_FACT_TYPE[factType]) {
    throw new Error('FORBIDDEN_LEGAL_CONCLUSION');
  }
  if (!LEGAL_FACT_TYPE[factType]) {
    throw new Error('UNKNOWN_LEGAL_FACT_TYPE');
  }
  if (legalRole === LEGAL_ROLE.LEGAL_INTERPRETATION) {
    throw new Error('LEGAL_INTERPRETATION_NOT_PERMITTED');
  }
  const resolvedClass = sourceType === SOURCE_TYPE.MODEL_ASSISTED
    ? EVIDENCE_CLASS.INFERENCE
    : classification;
  const resolvedUnit = unit || (factType === LEGAL_FACT_TYPE.LEASE_TERM_YEARS ? UNIT.YEARS : null);
  const evidence = createEvidence({
    domain: 'LEGAL_TITLE',
    subjectRef: subjectRef || createSubjectRef({ kind: IDENTITY_KIND.PROPERTY, id: 'unidentified' }),
    factType,
    classification: resolvedClass,
    sourceType,
    provenance: provenance || { source: null },
    value,
    unit: resolvedUnit,
    retrievedAt,
    evidenceAsOf,
    observedAt: documentDate || null,
    effectiveFrom,
    effectiveTo,
    assessmentState,
    limitations,
    visibility,
    sharedPropertyEvidence: visibility === VISIBILITY.PRIVATE ? false : sharedPropertyEvidence,
    authoritative: false,
  });
  if (sourceType === SOURCE_TYPE.MODEL_ASSISTED && evidence.authoritative) {
    throw new Error('MODEL_ASSISTED_MUST_BE_NON_AUTHORITATIVE');
  }
  const fact = {
    ...evidence,
    titleRef: titleRef || null,
    documentRef: documentRef || null,
    documentDate: documentDate || null,
    legalRole,
    legalClass,
    authoritative: false,
  };
  return visibility === VISIBILITY.PRIVATE ? markPrivate(fact) : assertEvidenceVisibility(fact);
}

function missingDocumentAssessment(reason) {
  if (!MISSING_DOCUMENT[reason]) {
    throw new Error('UNKNOWN_MISSING_DOCUMENT_REASON');
  }
  return {
    reason,
    state: reason === MISSING_DOCUMENT.DOCUMENT_UNREADABLE
      ? KERNEL_ASSESSMENT.UNAVAILABLE
      : KERNEL_ASSESSMENT.INSUFFICIENT_EVIDENCE,
    value: null,
    notFalse: true,
    notClearTitle: true,
    notNoRestriction: true,
    notFreehold: reason === MISSING_DOCUMENT.LEASE_NOT_PROVIDED,
  };
}

function describeTenureConflict(left, right) {
  return {
    state: LEGAL_CONFLICT.CONFLICTING_EVIDENCE,
    left,
    right,
    resolvedValue: null,
    silentlyOverwritten: false,
  };
}

module.exports = {
  TITLE_IDENTIFIER_TYPE,
  TITLE_JURISDICTION,
  LEGAL_DOCUMENT_TYPE,
  LEGAL_FACT_TYPE,
  FORBIDDEN_LEGAL_FACT_TYPE,
  LEGAL_ROLE,
  LEGAL_EVIDENCE_CLASS,
  MISSING_DOCUMENT,
  LEGAL_CONFLICT,
  EXTRACTION_STATE,
  VALIDATION_STATE,
  TITLE_REF_STATE,
  DESIGNATION_OWNERSHIP,
  normalizeTenureValue,
  createTitleRef,
  assertPropertyIsNotTitle,
  createLegalDocument,
  createLegalTitleFact,
  missingDocumentAssessment,
  describeTenureConflict,
};
