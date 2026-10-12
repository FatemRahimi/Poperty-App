/**
 * Canonical official MHCLG Energy Performance of Buildings evidence.
 * Energy / physical certificate facts only. EPC is not a survey, title, or valuation input.
 * Restricted address/postcode fields are matching-transient and must not be persisted as a gazetteer.
 */

const { OFFICIAL_EPB_EVIDENCE_VERSION } = require('./versions');
const {
  createEvidence,
  EVIDENCE_CLASS,
  SOURCE_TYPE,
  TIME_FIELD,
} = require('./evidenceContract');
const { BUILDING_EVIDENCE_CLASS } = require('./buildingConditionContract');
const { IDENTITY_VERIFICATION_STATE, IDENTITY_EVIDENCE_SOURCE_TYPE } = require('./identityModel');
const { DOMAIN_ID } = require('./domainRegistry');

const EPB_SOURCE = 'MHCLG_EPBD';
const EPB_SOURCE_TYPE = SOURCE_TYPE.OFFICIAL;
const EPB_SOURCE_GEOGRAPHY = 'ENGLAND_WALES';

const CERTIFICATE_TYPE = Object.freeze({
  DOMESTIC: 'DOMESTIC',
  NON_DOMESTIC: 'NON_DOMESTIC',
});

const EPB_CAPABILITY = Object.freeze({
  AVAILABLE: 'AVAILABLE',
  UNAVAILABLE_MISSING_CREDENTIAL: 'UNAVAILABLE_MISSING_CREDENTIAL',
  SOURCE_OUTSIDE_GEOGRAPHY: 'SOURCE_OUTSIDE_GEOGRAPHY',
  GEOGRAPHY_NOT_ESTABLISHED: 'GEOGRAPHY_NOT_ESTABLISHED',
  SOURCE_ERROR: 'SOURCE_ERROR',
});

const EPB_ATTACHMENT = Object.freeze({
  UNIQUE_ATTACH: 'UNIQUE_ATTACH',
  UNRESOLVED_IDENTITY: 'UNRESOLVED_IDENTITY',
  UNRESOLVED_UNIT_IDENTITY: 'UNRESOLVED_UNIT_IDENTITY',
  NO_MATCH_FOUND: 'NO_MATCH_FOUND',
  SOURCE_OUTSIDE_GEOGRAPHY: 'SOURCE_OUTSIDE_GEOGRAPHY',
  GEOGRAPHY_NOT_ESTABLISHED: 'GEOGRAPHY_NOT_ESTABLISHED',
  SOURCE_ERROR: 'SOURCE_ERROR',
  UNAVAILABLE_MISSING_CREDENTIAL: 'UNAVAILABLE_MISSING_CREDENTIAL',
  NOT_ASSESSED: 'NOT_ASSESSED',
  REUSED: 'REUSED',
  LICENSING_REVIEW_REQUIRED: 'LICENSING_REVIEW_REQUIRED',
});

const EPB_ERROR = Object.freeze({
  TIMEOUT: 'TIMEOUT',
  HTTP_4XX: 'HTTP_4XX',
  HTTP_5XX: 'HTTP_5XX',
  RATE_LIMITED: 'RATE_LIMITED',
  MALFORMED: 'MALFORMED',
  NETWORK: 'NETWORK',
  MISSING_CREDENTIAL: 'MISSING_CREDENTIAL',
  UNEXPECTED: 'UNEXPECTED',
});

const OFFICIAL_MISSING_SENTINELS = Object.freeze([
  'NO DATA!',
  'NO DATA',
  'N/A',
  'NA',
  'NOT RECORDED',
  'INVALID',
  'INVALID!',
  'NULL',
  '-',
  '--',
  'NONE',
]);

/** Official DEC default operational rating. Not valid energy evidence. */
const DEC_DEFAULT_OPERATIONAL_RATING = 9999;

const RESTRICTED_ADDRESS_KEYS = Object.freeze([
  'address',
  'address1',
  'address2',
  'address3',
  'address4',
  'addressLine1',
  'addressLine2',
  'addressLine3',
  'addressLine4',
  'address_line_1',
  'address_line_2',
  'address_line_3',
  'address_line_4',
  'postcode',
  'post_code',
  'postTown',
  'post_town',
  'posttown',
]);

const UPRN_IDENTITY_SEMANTICS = Object.freeze({
  verificationState: IDENTITY_VERIFICATION_STATE.SOURCE_ASSERTED,
  evidenceSourceType: IDENTITY_EVIDENCE_SOURCE_TYPE.OFFICIAL_OPEN,
  notVerifiedExact: true,
  uprnIsNotTitleNumber: true,
});

function isOfficialMissing(value) {
  if (value === undefined || value === null) return true;
  if (typeof value === 'number') {
    return !Number.isFinite(value);
  }
  const text = String(value).trim();
  if (!text) return true;
  return OFFICIAL_MISSING_SENTINELS.includes(text.toUpperCase());
}

function officialPresent(value) {
  if (isOfficialMissing(value)) return null;
  return value;
}

function officialNumber(value) {
  if (isOfficialMissing(value)) return null;
  const n = Number(String(value).replace(/,/g, '').trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function officialEnergyScore(value) {
  const n = officialNumber(value);
  if (n == null) return null;
  if (n === DEC_DEFAULT_OPERATIONAL_RATING) return null;
  return n;
}

function compactPresentFields(record) {
  if (!record || typeof record !== 'object') return {};
  const out = {};
  Object.entries(record).forEach(([key, value]) => {
    if (value == null || value === '') return;
    out[key] = value;
  });
  return out;
}

function normalizeCertificateNumber(value) {
  if (isOfficialMissing(value)) return null;
  const text = String(value).trim().toUpperCase().replace(/\s+/g, '');
  if (!text) return null;
  return text;
}

function stripRestrictedAddress(record) {
  if (!record || typeof record !== 'object') return record;
  const out = { ...record };
  RESTRICTED_ADDRESS_KEYS.forEach((key) => {
    delete out[key];
  });
  return out;
}

function createEpbEvidence({
  factType,
  value,
  unit = null,
  subjectRef,
  certificateNumber,
  certificateType = CERTIFICATE_TYPE.DOMESTIC,
  inspectionDate = null,
  lodgementDate = null,
  retrievedAt = null,
  classification = EVIDENCE_CLASS.FACT,
  buildingClass = BUILDING_EVIDENCE_CLASS.ENERGY_EVIDENCE,
  limitations = [],
  sourceRecordId = null,
  provenance = null,
} = {}) {
  const modelled = classification === EVIDENCE_CLASS.INFERENCE;
  return {
    ...createEvidence({
      domain: DOMAIN_ID.BUILDING_CONDITION,
      subjectRef,
      factType,
      classification,
      sourceType: EPB_SOURCE_TYPE,
      provenance: provenance || { source: EPB_SOURCE },
      value: isOfficialMissing(value) ? null : value,
      unit,
      retrievedAt,
      evidenceAsOf: inspectionDate || lodgementDate || retrievedAt || null,
      observedAt: inspectionDate || null,
      sourceRecordId: sourceRecordId || certificateNumber || null,
      assessmentState: isOfficialMissing(value) ? 'notAssessed' : 'assessed',
      sharedPropertyEvidence: true,
      authoritative: false,
      limitations,
    }),
    certificateNumber: normalizeCertificateNumber(certificateNumber),
    certificateType,
    inspectionDate: inspectionDate || null,
    lodgementDate: lodgementDate || null,
    buildingEvidenceClass: buildingClass,
    modelledImprovement: modelled,
    epcIsNotSurvey: true,
    timeFields: TIME_FIELD,
    sourceGeography: EPB_SOURCE_GEOGRAPHY,
  };
}

module.exports = {
  OFFICIAL_EPB_EVIDENCE_VERSION,
  EPB_SOURCE,
  EPB_SOURCE_TYPE,
  EPB_SOURCE_GEOGRAPHY,
  CERTIFICATE_TYPE,
  EPB_CAPABILITY,
  EPB_ATTACHMENT,
  EPB_ERROR,
  OFFICIAL_MISSING_SENTINELS,
  RESTRICTED_ADDRESS_KEYS,
  UPRN_IDENTITY_SEMANTICS,
  isOfficialMissing,
  officialPresent,
  officialNumber,
  officialEnergyScore,
  compactPresentFields,
  DEC_DEFAULT_OPERATIONAL_RATING,
  normalizeCertificateNumber,
  stripRestrictedAddress,
  createEpbEvidence,
};
