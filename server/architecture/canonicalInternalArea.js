/**
 * Canonical internal floor-area contract.
 * Shared Property Intelligence Kernel attribute — not valuation-specific.
 */

const CANONICAL_INTERNAL_AREA_VERSION = 'canonical-internal-area-1.0.0';

const AREA_UNIT = Object.freeze({
  SQFT: 'sqft',
  SQM: 'sqm',
  UNKNOWN: 'unknown',
});

const AREA_SOURCE = Object.freeze({
  MHCLG_EPBD: 'MHCLG_EPBD',
  INTERNAL_LISTING: 'InternalListing',
  PROPERTYDATA_UPRN: 'PropertyData_uprn',
  USER_DECLARED: 'USER_DECLARED',
});

/** Matches propertyFacts SOURCE_PRECEDENCE.floorArea order. */
const SOURCE_PRECEDENCE = Object.freeze([
  AREA_SOURCE.MHCLG_EPBD,
  AREA_SOURCE.INTERNAL_LISTING,
  AREA_SOURCE.PROPERTYDATA_UPRN,
  AREA_SOURCE.USER_DECLARED,
]);

const READINESS = Object.freeze({
  PROVIDER_ELIGIBLE: 'PROVIDER_ELIGIBLE',
  MISSING_INTERNAL_AREA: 'MISSING_INTERNAL_AREA',
  INVALID_INTERNAL_AREA: 'INVALID_INTERNAL_AREA',
  AMBIGUOUS_INTERNAL_AREA: 'AMBIGUOUS_INTERNAL_AREA',
  IDENTITY_MISMATCH: 'IDENTITY_MISMATCH',
});

const SQM_TO_SQFT = 10.7639;
const AVM_MIN_SQFT = 300;
const MAX_REASONABLE_SQFT = 100000;

function normaliseUnit(raw) {
  if (raw == null || raw === '') return AREA_UNIT.UNKNOWN;
  const text = String(raw).toLowerCase().replace(/[\s_-]+/g, '');
  if (['sqft', 'sqft', 'ft2', 'squarefeet', 'sqft'].includes(text) || text === 'sq_ft') {
    return AREA_UNIT.SQFT;
  }
  if (['sqm', 'm2', 'squaremetres', 'squaremeters', 'sqm'].includes(text) || text === 'sq_m') {
    return AREA_UNIT.SQM;
  }
  if (text === 'sqft') return AREA_UNIT.SQFT;
  if (text === 'sqm' || text === 'sq_m') return AREA_UNIT.SQM;
  if (text.includes('sqft') || text.includes('sqft')) return AREA_UNIT.SQFT;
  if (text.includes('sqm') || text.includes('sq_m') || text.includes('metre')) return AREA_UNIT.SQM;
  return AREA_UNIT.UNKNOWN;
}

function toPositiveNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function convertToSqft(value, unit) {
  const numeric = toPositiveNumber(value);
  if (numeric == null) return null;
  if (unit === AREA_UNIT.SQFT) return Math.round(numeric);
  if (unit === AREA_UNIT.SQM) return Math.round(numeric * SQM_TO_SQFT);
  return null;
}

function isPlausibleSqft(sqft) {
  return Number.isFinite(sqft) && sqft >= AVM_MIN_SQFT && sqft <= MAX_REASONABLE_SQFT;
}

module.exports = {
  CANONICAL_INTERNAL_AREA_VERSION,
  AREA_UNIT,
  AREA_SOURCE,
  SOURCE_PRECEDENCE,
  READINESS,
  SQM_TO_SQFT,
  AVM_MIN_SQFT,
  MAX_REASONABLE_SQFT,
  normaliseUnit,
  toPositiveNumber,
  convertToSqft,
  isPlausibleSqft,
};
