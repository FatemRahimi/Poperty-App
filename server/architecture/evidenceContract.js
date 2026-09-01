/**
 * Domain-neutral evidence contract.
 * UNKNOWN != FALSE, UNKNOWN != ZERO, EMPTY != NONE.
 * MODEL_ASSISTED is never authoritative by default.
 */

const { EVIDENCE_CONTRACT_VERSION } = require('./versions');
const { createSubjectRef } = require('./identityModel');
const { createMeasuredValue, isKnownUnit } = require('./units');

const EVIDENCE_CLASS = Object.freeze({
  FACT: 'FACT',
  AREA_CONTEXT: 'AREA_CONTEXT',
  DERIVED: 'DERIVED',
  USER_INPUT: 'USER_INPUT',
  SCENARIO: 'SCENARIO',
  INFERENCE: 'INFERENCE',
  NOT_ASSESSED: 'NOT_ASSESSED',
});

const SOURCE_TYPE = Object.freeze({
  OFFICIAL: 'OFFICIAL',
  LICENSED_PROVIDER: 'LICENSED_PROVIDER',
  FIRST_PARTY: 'FIRST_PARTY',
  USER_REPORTED: 'USER_REPORTED',
  DERIVED: 'DERIVED',
  MODEL_ASSISTED: 'MODEL_ASSISTED',
});

const VISIBILITY = Object.freeze({
  SHARED: 'SHARED',
  PRIVATE: 'PRIVATE',
});

const TIME_FIELD = Object.freeze({
  retrievedAt: 'retrievedAt',
  evidenceAsOf: 'evidenceAsOf',
  observedAt: 'observedAt',
  effectiveFrom: 'effectiveFrom',
  effectiveTo: 'effectiveTo',
  analysisAt: 'analysisAt',
  documentDate: 'documentDate',
  inspectionDate: 'inspectionDate',
});

const SPATIAL_RELATION = Object.freeze({
  SUBJECT: 'SUBJECT',
  SAME_SITE: 'SAME_SITE',
  CONTAINS: 'CONTAINS',
  WITHIN: 'WITHIN',
  INTERSECTS: 'INTERSECTS',
  NEARBY: 'NEARBY',
  AREA_CONTEXT: 'AREA_CONTEXT',
  UNKNOWN: 'UNKNOWN',
});

const REQUIRED_EVIDENCE_FIELDS = Object.freeze([
  'domain',
  'subjectRef',
  'factType',
  'classification',
  'sourceType',
]);

function isMissingValue(value) {
  return value === undefined || value === null || value === '';
}

function createEvidence(input = {}) {
  REQUIRED_EVIDENCE_FIELDS.forEach((key) => {
    if (input[key] == null || input[key] === '') {
      throw new Error(`Evidence requires ${key}`);
    }
  });
  if (!EVIDENCE_CLASS[input.classification]) {
    throw new Error('Unknown evidence classification');
  }
  if (!SOURCE_TYPE[input.sourceType]) {
    throw new Error('Unknown sourceType');
  }
  if (!input.provenance || !input.provenance.source) {
    throw new Error('Evidence requires provenance.source');
  }

  const subjectRef = input.subjectRef.kind
    ? input.subjectRef
    : createSubjectRef(input.subjectRef);

  let value = input.value;
  if (value === undefined) value = null;

  if (value !== null && typeof value === 'number' && input.unit && !isKnownUnit(input.unit)) {
    throw new Error('Numeric evidence requires a known unit');
  }

  const measured = typeof value === 'number'
    ? createMeasuredValue(value, input.unit)
    : { value, unit: input.unit || null, present: !isMissingValue(value) };

  const modelAssisted = input.sourceType === SOURCE_TYPE.MODEL_ASSISTED;
  const authoritative = modelAssisted ? false : Boolean(input.authoritative);

  return {
    evidenceId: input.evidenceId || null,
    domain: input.domain,
    subjectRef,
    factType: input.factType,
    classification: input.classification,
    value: measured.value,
    unit: measured.unit,
    present: measured.present,
    source: input.provenance.source,
    sourceType: input.sourceType,
    sourceRecordId: input.sourceRecordId || null,
    retrievedAt: input.retrievedAt || null,
    evidenceAsOf: input.evidenceAsOf || null,
    observedAt: input.observedAt || null,
    effectiveFrom: input.effectiveFrom || null,
    effectiveTo: input.effectiveTo || null,
    spatialRelation: input.spatialRelation || null,
    trust: input.trust || null,
    provenance: { ...input.provenance },
    limitations: Array.isArray(input.limitations) ? input.limitations : [],
    assessmentState: input.assessmentState || null,
    visibility: input.visibility || VISIBILITY.SHARED,
    sharedPropertyEvidence: input.sharedPropertyEvidence === true,
    version: input.version || EVIDENCE_CONTRACT_VERSION,
    authoritative,
  };
}

function isAuthoritativeEvidence(evidence) {
  if (!evidence) return false;
  if (evidence.sourceType === SOURCE_TYPE.MODEL_ASSISTED) return false;
  return evidence.authoritative === true;
}

function missingIsNotFalse(evidence) {
  if (!evidence || evidence.present) return evidence?.value;
  return null;
}

function missingIsNotZero(evidence) {
  if (!evidence || !evidence.present) return null;
  return evidence.value;
}

module.exports = {
  EVIDENCE_CONTRACT_VERSION,
  EVIDENCE_CLASS,
  SOURCE_TYPE,
  VISIBILITY,
  TIME_FIELD,
  SPATIAL_RELATION,
  REQUIRED_EVIDENCE_FIELDS,
  createEvidence,
  isAuthoritativeEvidence,
  isMissingValue,
  missingIsNotFalse,
  missingIsNotZero,
};
