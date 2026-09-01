/**
 * Building & Condition evidence contracts.
 * Foundation only. Does not survey, diagnose, cost, or score condition.
 */

const { IDENTITY_KIND, createSubjectRef } = require('./identityModel');
const {
  createEvidence,
  EVIDENCE_CLASS,
  SOURCE_TYPE,
  VISIBILITY,
  TIME_FIELD,
} = require('./evidenceContract');
const { KERNEL_ASSESSMENT } = require('./assessmentStates');
const { assertEvidenceVisibility, markPrivate } = require('./privacyBoundary');

const BUILDING_COMPONENT = Object.freeze({
  STRUCTURE: 'STRUCTURE',
  ROOF: 'ROOF',
  EXTERNAL_WALLS: 'EXTERNAL_WALLS',
  WINDOWS_DOORS: 'WINDOWS_DOORS',
  FOUNDATIONS: 'FOUNDATIONS',
  INTERNAL_WALLS: 'INTERNAL_WALLS',
  FLOORS: 'FLOORS',
  CEILINGS: 'CEILINGS',
  ELECTRICAL: 'ELECTRICAL',
  PLUMBING: 'PLUMBING',
  HEATING: 'HEATING',
  VENTILATION: 'VENTILATION',
  DRAINAGE: 'DRAINAGE',
  FIRE_SAFETY: 'FIRE_SAFETY',
  LIFTS: 'LIFTS',
  EXTERNAL_AREAS: 'EXTERNAL_AREAS',
  OUTBUILDINGS: 'OUTBUILDINGS',
  OTHER: 'OTHER',
  UNKNOWN: 'UNKNOWN',
});

const OBSERVATION_STATE = Object.freeze({
  OBSERVED: 'OBSERVED',
  REPORTED: 'REPORTED',
  EXTRACTED: 'EXTRACTED',
  INFERRED: 'INFERRED',
  NOT_INSPECTED: 'NOT_INSPECTED',
  NOT_ASSESSED: 'NOT_ASSESSED',
  UNAVAILABLE: 'UNAVAILABLE',
  CONFLICTING_EVIDENCE: 'CONFLICTING_EVIDENCE',
});

const INSPECTION_COMPLETENESS = Object.freeze({
  INSPECTED: 'INSPECTED',
  PARTIALLY_INSPECTED: 'PARTIALLY_INSPECTED',
  NOT_INSPECTED: 'NOT_INSPECTED',
  UNKNOWN: 'UNKNOWN',
});

const CONDITION_VOCABULARY = Object.freeze({
  SOURCE_NATIVE: 'SOURCE_NATIVE',
  UNKNOWN: 'UNKNOWN',
});

const BUILDING_DOCUMENT_TYPE = Object.freeze({
  CONDITION_SURVEY: 'CONDITION_SURVEY',
  STRUCTURAL_REPORT: 'STRUCTURAL_REPORT',
  RICS_SURVEY: 'RICS_SURVEY',
  ELECTRICAL_REPORT: 'ELECTRICAL_REPORT',
  GAS_REPORT: 'GAS_REPORT',
  FIRE_ASSESSMENT: 'FIRE_ASSESSMENT',
  PHOTOGRAPH: 'PHOTOGRAPH',
  FLOOR_PLAN: 'FLOOR_PLAN',
  EPC: 'EPC',
  OTHER: 'OTHER',
  UNKNOWN: 'UNKNOWN',
});

const BUILDING_EVIDENCE_CLASS = Object.freeze({
  PHYSICAL_FACT: 'PHYSICAL_FACT',
  CONDITION_EVIDENCE: 'CONDITION_EVIDENCE',
  PROPERTY_CHARACTERISTIC: 'PROPERTY_CHARACTERISTIC',
  ENERGY_EVIDENCE: 'ENERGY_EVIDENCE',
  USER_REPORTED: 'USER_REPORTED',
  MODEL_ASSISTED: 'MODEL_ASSISTED',
  PROFESSIONAL_DOCUMENT: 'PROFESSIONAL_DOCUMENT',
  AREA_CONTEXT: 'AREA_CONTEXT',
  NOT_CONDITION_EVIDENCE: 'NOT_CONDITION_EVIDENCE',
  LEGACY_HEURISTIC: 'LEGACY_HEURISTIC',
});

const FORBIDDEN_CONDITION_FACT = Object.freeze({
  STRUCTURALLY_SOUND: 'STRUCTURALLY_SOUND',
  EXCELLENT_CONDITION: 'EXCELLENT_CONDITION',
  SAFE_TO_OCCUPY: 'SAFE_TO_OCCUPY',
  NO_DEFECT_EXISTS: 'NO_DEFECT_EXISTS',
  ROOF_LIFE_REMAINING: 'ROOF_LIFE_REMAINING',
  REFURBISHMENT_COST: 'REFURBISHMENT_COST',
  CONDITION_SCORE: 'CONDITION_SCORE',
});

const ADJACENT_NOT_CONDITION = Object.freeze({
  epcRating: BUILDING_EVIDENCE_CLASS.ENERGY_EVIDENCE,
  floorPlan: BUILDING_EVIDENCE_CLASS.NOT_CONDITION_EVIDENCE,
  listingPhotograph: BUILDING_EVIDENCE_CLASS.USER_REPORTED,
  listingDescription: BUILDING_EVIDENCE_CLASS.USER_REPORTED,
  buildRisks: BUILDING_EVIDENCE_CLASS.LEGACY_HEURISTIC,
  flood: BUILDING_EVIDENCE_CLASS.AREA_CONTEXT,
  planning: BUILDING_EVIDENCE_CLASS.AREA_CONTEXT,
  listedBuilding: BUILDING_EVIDENCE_CLASS.AREA_CONTEXT,
});

function observationToKernel(state) {
  if (state === OBSERVATION_STATE.OBSERVED || state === OBSERVATION_STATE.REPORTED
    || state === OBSERVATION_STATE.EXTRACTED) {
    return KERNEL_ASSESSMENT.ASSESSED;
  }
  if (state === OBSERVATION_STATE.UNAVAILABLE) return KERNEL_ASSESSMENT.UNAVAILABLE;
  if (state === OBSERVATION_STATE.CONFLICTING_EVIDENCE) return KERNEL_ASSESSMENT.INSUFFICIENT_EVIDENCE;
  if (state === OBSERVATION_STATE.INFERRED) return KERNEL_ASSESSMENT.INSUFFICIENT_EVIDENCE;
  return KERNEL_ASSESSMENT.NOT_ASSESSED;
}

function createComponentRef({
  category = BUILDING_COMPONENT.UNKNOWN,
  id = null,
  inspected = false,
} = {}) {
  const resolved = BUILDING_COMPONENT[category] || BUILDING_COMPONENT.UNKNOWN;
  return {
    category: resolved,
    id: id == null || id === '' ? null : String(id),
    inspected: inspected === true,
    inspectionImplied: false,
  };
}

function assertPropertyIsNotBuilding(propertyRef, buildingRef) {
  if (!propertyRef || !buildingRef) return true;
  if (propertyRef.kind === IDENTITY_KIND.BUILDING) {
    throw new Error('PROPERTY_REF_MUST_NOT_BE_BUILDING');
  }
  if (buildingRef.kind === IDENTITY_KIND.PROPERTY && propertyRef.kind === IDENTITY_KIND.PROPERTY
    && String(propertyRef.id) === String(buildingRef.id)) {
    throw new Error('PROPERTY_IS_NOT_BUILDING');
  }
  return true;
}

function createConditionEvidence({
  evidenceId = null,
  subjectRef,
  componentRef = null,
  observationType = 'conditionNote',
  value = null,
  observationState = OBSERVATION_STATE.NOT_ASSESSED,
  severity = null,
  sourceType = SOURCE_TYPE.USER_REPORTED,
  source = null,
  observedAt = null,
  inspectionDate = null,
  retrievedAt = null,
  evidenceAsOf = null,
  inspectionMethod = null,
  classification = EVIDENCE_CLASS.NOT_ASSESSED,
  provenance = null,
  limitations = [],
  visibility = VISIBILITY.SHARED,
  sharedPropertyEvidence = false,
} = {}) {
  const state = OBSERVATION_STATE[observationState] || OBSERVATION_STATE.NOT_ASSESSED;
  const resolvedClass = sourceType === SOURCE_TYPE.MODEL_ASSISTED
    ? EVIDENCE_CLASS.INFERENCE
    : (classification || EVIDENCE_CLASS.NOT_ASSESSED);
  const component = componentRef || createComponentRef();
  if (FORBIDDEN_CONDITION_FACT[observationType]) {
    throw new Error('FORBIDDEN_CONDITION_CONCLUSION');
  }
  const evidence = createEvidence({
    domain: 'BUILDING_CONDITION',
    subjectRef: subjectRef || createSubjectRef({ kind: IDENTITY_KIND.PROPERTY, id: 'unidentified' }),
    factType: observationType,
    classification: resolvedClass,
    sourceType,
    provenance: provenance || { source: source || null },
    value,
    retrievedAt,
    evidenceAsOf,
    observedAt: observedAt || inspectionDate || null,
    assessmentState: observationToKernel(state),
    limitations,
    visibility,
    sharedPropertyEvidence: visibility === VISIBILITY.PRIVATE ? false : sharedPropertyEvidence,
    authoritative: false,
  });
  const record = {
    ...evidence,
    evidenceId: evidenceId || evidence.evidenceId,
    componentRef: { ...component, inspectionImplied: false },
    observationState: state,
    severity: severity == null ? null : severity,
    inspectionMethod: inspectionMethod || null,
    inspectionDate: inspectionDate || null,
    documentDate: null,
    conditionVocabulary: CONDITION_VOCABULARY.SOURCE_NATIVE,
    timeFields: TIME_FIELD,
    oldEvidenceIsNotCurrent: true,
  };
  if (sourceType === SOURCE_TYPE.MODEL_ASSISTED) {
    record.authoritative = false;
    record.classification = EVIDENCE_CLASS.INFERENCE;
  }
  return visibility === VISIBILITY.PRIVATE ? markPrivate(record) : assertEvidenceVisibility(record);
}

function createDefectRecord({
  componentRef,
  observedIssue,
  source,
  observedAt = null,
  observationState = OBSERVATION_STATE.OBSERVED,
  subjectRef,
  sourceType = SOURCE_TYPE.USER_REPORTED,
  provenance,
  limitations = [],
  visibility = VISIBILITY.PRIVATE,
} = {}) {
  if (!observedIssue) throw new Error('DEFECT_REQUIRES_OBSERVED_ISSUE');
  if (/likely |probably |unsafe|subsidence/i.test(String(observedIssue))
    && sourceType === SOURCE_TYPE.MODEL_ASSISTED) {
    throw new Error('FORBIDDEN_CONDITION_CONCLUSION');
  }
  return createConditionEvidence({
    subjectRef,
    componentRef: componentRef || createComponentRef(),
    observationType: 'defectRecord',
    value: observedIssue,
    observationState,
    sourceType: SOURCE_TYPE[sourceType] || SOURCE_TYPE.USER_REPORTED,
    source,
    observedAt,
    provenance: provenance || { source: source || null },
    limitations: limitations.length
      ? limitations
      : ['Observed issue record only. Not a structural diagnosis or cost estimate.'],
    classification: EVIDENCE_CLASS.FACT,
    visibility,
    sharedPropertyEvidence: false,
  });
}

function createBuildingDocument({
  documentId,
  documentType = BUILDING_DOCUMENT_TYPE.UNKNOWN,
  subjectRefs = [],
  sourceType = SOURCE_TYPE.USER_REPORTED,
  source = null,
  uploadedBy = null,
  visibility = VISIBILITY.PRIVATE,
  documentDate = null,
  inspectionDate = null,
  retrievedAt = null,
  evidenceAsOf = null,
  contentHash = null,
  limitations = [],
  provenance = null,
  filename = null,
} = {}) {
  if (documentId == null || documentId === '') {
    throw new Error('Building document requires documentId');
  }
  const type = BUILDING_DOCUMENT_TYPE[documentType] || BUILDING_DOCUMENT_TYPE.UNKNOWN;
  const vis = visibility === VISIBILITY.SHARED ? VISIBILITY.SHARED : VISIBILITY.PRIVATE;
  const professional = [
    BUILDING_DOCUMENT_TYPE.CONDITION_SURVEY,
    BUILDING_DOCUMENT_TYPE.STRUCTURAL_REPORT,
    BUILDING_DOCUMENT_TYPE.RICS_SURVEY,
    BUILDING_DOCUMENT_TYPE.ELECTRICAL_REPORT,
    BUILDING_DOCUMENT_TYPE.GAS_REPORT,
    BUILDING_DOCUMENT_TYPE.FIRE_ASSESSMENT,
  ].includes(type);
  const document = {
    documentId: String(documentId),
    documentType: type,
    legalDocumentTypeForced: false,
    filenameIsNotDocumentType: true,
    filename: filename || null,
    subjectRefs: Array.isArray(subjectRefs) ? subjectRefs : [],
    sourceType: SOURCE_TYPE[sourceType] || SOURCE_TYPE.USER_REPORTED,
    source: source || null,
    uploadedBy: vis === VISIBILITY.PRIVATE ? uploadedBy : null,
    visibility: vis,
    sharedPropertyEvidence: false,
    documentDate: documentDate || null,
    inspectionDate: inspectionDate || null,
    retrievedAt: retrievedAt || null,
    evidenceAsOf: evidenceAsOf || null,
    contentHash: contentHash || null,
    professionalDocument: professional,
    credentialsValidatedByPlatform: false,
    limitations: Array.isArray(limitations) ? limitations : [],
    provenance: provenance || { source: source || null },
    factType: professional ? 'buildingSurvey' : 'surveyDocument',
  };
  if (type === BUILDING_DOCUMENT_TYPE.PHOTOGRAPH) {
    document.factType = 'inspectionReport';
    document.structuralConclusionPermitted = false;
  }
  if (type === BUILDING_DOCUMENT_TYPE.FLOOR_PLAN || type === BUILDING_DOCUMENT_TYPE.EPC) {
    document.isConditionEvidence = false;
  }
  return vis === VISIBILITY.PRIVATE
    ? markPrivate({ ...document, sharedPropertyEvidence: false })
    : assertEvidenceVisibility({ ...document, sharedPropertyEvidence: false });
}

function describeConditionConflict(left, right) {
  return {
    state: OBSERVATION_STATE.CONFLICTING_EVIDENCE,
    left,
    right,
    resolvedValue: null,
    silentlyOverwritten: false,
    llmResolved: false,
  };
}

module.exports = {
  BUILDING_COMPONENT,
  OBSERVATION_STATE,
  INSPECTION_COMPLETENESS,
  CONDITION_VOCABULARY,
  BUILDING_DOCUMENT_TYPE,
  BUILDING_EVIDENCE_CLASS,
  FORBIDDEN_CONDITION_FACT,
  ADJACENT_NOT_CONDITION,
  observationToKernel,
  createComponentRef,
  assertPropertyIsNotBuilding,
  createConditionEvidence,
  createDefectRecord,
  createBuildingDocument,
  describeConditionConflict,
};
