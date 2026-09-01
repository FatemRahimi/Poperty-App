/**
 * Sale-valuation numeric integrity helpers.
 * UNKNOWN stays null — it is never coerced to 0 for money or area.
 */

const ASKING_LISTING_METHOD = 'internal_sale_comparables';

const INDEPENDENT_VALUATION_METHODS = new Set([
  'valuation_sale_avm',
  'uprn_profile',
  'sold_prices_statistics',
  'sqft_implied',
]);

function parseFiniteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isFinitePositiveMoney(value) {
  const n = parseFiniteNumber(value);
  return n != null && n > 0;
}

function isFinitePositiveArea(value) {
  const n = parseFiniteNumber(value);
  return n != null && n > 0;
}

function isValidBlendEstimate(value) {
  return isFinitePositiveMoney(value);
}

function isValidBlendWeight(value) {
  const n = parseFiniteNumber(value);
  return n != null && n > 0;
}

function parsePositiveMoney(value) {
  return isFinitePositiveMoney(value) ? parseFiniteNumber(value) : null;
}

function parsePositiveArea(value) {
  return isFinitePositiveArea(value) ? parseFiniteNumber(value) : null;
}

function optionalPositiveBound(value) {
  if (value === null || value === undefined || value === '') return null;
  return isFinitePositiveMoney(value) ? parseFiniteNumber(value) : null;
}

function isIndependentValuationMethod(method) {
  return INDEPENDENT_VALUATION_METHODS.has(method);
}

function isAskingListingMethod(method) {
  return method === ASKING_LISTING_METHOD;
}

function explicitFloorAreaUnit(property = {}) {
  const raw = property.floorAreaUnit || property.squareFeetUnit || property.areaUnit || null;
  return raw ? String(raw).toLowerCase().replace(/\s+/g, '_') : null;
}

function isExternalSubjectProperty(property = {}) {
  return (
    property.source === 'external_intelligence_subject' ||
    property.subjectId != null ||
    property.floorAreaSource === 'uprn_internal_area' ||
    property.squareFeetSource === 'PropertyData' ||
    property.areaProvenance === 'unprovenanced' ||
    property.squareFeetProvenance === 'unprovenanced'
  );
}

function hasExplicitSqftProvenance(property = {}) {
  const provenance = property.floorAreaProvenance || property.squareFeetProvenance;
  if (provenance === 'listing_ingest_sqft' || provenance === 'user_supplied_sqft') return true;
  const unit = explicitFloorAreaUnit(property);
  return unit === 'sqft' || unit === 'sq_ft';
}

/**
 * UPRN / external internalArea is copied into square_feet without a proven unit.
 * Do not apply £/sqft unless the area is listing-ingest or explicitly sqft.
 */
function isUnprovenancedFloorArea(property = {}, uprnInternalArea = null) {
  if (hasExplicitSqftProvenance(property)) return false;
  const unit = explicitFloorAreaUnit(property);
  if (unit === 'sqm' || unit === 'sq_m' || unit === 'm2') return true;
  if (isExternalSubjectProperty(property)) return true;

  const area = parsePositiveArea(property.square_feet);
  const uprnArea = parsePositiveArea(uprnInternalArea);
  if (area != null && uprnArea != null && area === uprnArea) return true;
  return false;
}

function hasProvenancedAssessableFloorArea(property = {}, uprnInternalArea = null) {
  if (!isFinitePositiveArea(property.square_feet)) return false;
  if (isUnprovenancedFloorArea(property, uprnInternalArea)) return false;
  return true;
}

module.exports = {
  ASKING_LISTING_METHOD,
  INDEPENDENT_VALUATION_METHODS,
  parseFiniteNumber,
  isFinitePositiveMoney,
  isFinitePositiveArea,
  isValidBlendEstimate,
  isValidBlendWeight,
  parsePositiveMoney,
  parsePositiveArea,
  optionalPositiveBound,
  isIndependentValuationMethod,
  isAskingListingMethod,
  isUnprovenancedFloorArea,
  hasProvenancedAssessableFloorArea,
};
