/**
 * First-party listing internal floor area capture — create/edit validation and persistence.
 * Uses canonicalInternalArea conversion; does not assign official/licensed authority.
 */

const { createProvenance } = require('../../utils/provenance');
const {
  AREA_UNIT,
  normaliseUnit,
  convertToSqft,
} = require('../../architecture/canonicalInternalArea');

const FORBIDDEN_AUTHORITY_KEYS = Object.freeze([
  'internalAreaSource',
  'internalAreaProvenance',
  'floorAreaSource',
  'internalAreaResolution',
  'listingSuppliedOfficial',
  'official',
  'verified',
  'verifiedExact',
  'readiness',
  'selectedSource',
  'providerEligible',
  'assessmentState',
  'authority',
  'provenance',
  'evidenceSource',
  'sourceClassification',
]);

const MAX_SQM = 50000;
const MAX_SQFT = 500000;

function dbUnitFromCanonical(unit) {
  if (unit === AREA_UNIT.SQFT) return 'sq_ft';
  if (unit === AREA_UNIT.SQM) return 'sq_m';
  return null;
}

function rejectAuthorityInjection(body = {}) {
  for (const key of FORBIDDEN_AUTHORITY_KEYS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      return { ok: false, error: { field: key, message: 'client_authority_rejected' } };
    }
  }
  return null;
}

function isExplicitClear(body = {}) {
  return (
    body.clearInternalArea === true
    || body.clearInternalArea === 'true'
    || body.clearFloorArea === true
    || body.clearFloorArea === 'true'
    || body.internalAreaClear === true
    || body.internalAreaClear === 'true'
  );
}

function hasOwnInput(body, keys) {
  return keys.some((key) => Object.prototype.hasOwnProperty.call(body, key));
}

function extractRawValue(body = {}) {
  if (hasOwnInput(body, ['floor_area', 'floorArea', 'internal_floor_area', 'internalFloorArea'])) {
    return body.floor_area ?? body.floorArea ?? body.internal_floor_area ?? body.internalFloorArea;
  }
  if (hasOwnInput(body, ['square_feet', 'squareFeet'])) {
    return body.square_feet ?? body.squareFeet;
  }
  return undefined;
}

function extractUnit(body = {}, { squareFeetAlias = false } = {}) {
  if (hasOwnInput(body, ['floor_area_unit', 'floorAreaUnit'])) {
    return body.floor_area_unit ?? body.floorAreaUnit;
  }
  if (squareFeetAlias) return 'sq_ft';
  return undefined;
}

/**
 * Parse create/edit listing internal area input.
 * @returns {{ ok: boolean, omitted?: boolean, cleared?: boolean, fields?: object|null, error?: object, provenance?: object }}
 */
function parseListingInternalAreaInput(body = {}, options = {}) {
  const mode = options.mode || 'create';
  const rejected = rejectAuthorityInjection(body);
  if (rejected) return rejected;

  const inputProvided =
    hasOwnInput(body, [
      'floor_area',
      'floorArea',
      'internal_floor_area',
      'internalFloorArea',
      'square_feet',
      'squareFeet',
      'floor_area_unit',
      'floorAreaUnit',
      'clearInternalArea',
      'clearFloorArea',
      'internalAreaClear',
    ]) || isExplicitClear(body);

  if (!inputProvided) {
    return { ok: true, omitted: true, fields: null };
  }

  if (isExplicitClear(body)) {
    return {
      ok: true,
      cleared: true,
      fields: { floor_area: null, square_feet: null, floor_area_unit: null },
      provenance: null,
    };
  }

  const rawValue = extractRawValue(body);
  const squareFeetAlias = hasOwnInput(body, ['square_feet', 'squareFeet'])
    && !hasOwnInput(body, ['floor_area', 'floorArea', 'internal_floor_area', 'internalFloorArea']);

  if (rawValue === undefined) {
    return mode === 'edit'
      ? { ok: true, omitted: true, fields: null }
      : { ok: true, omitted: true, fields: { floor_area: null, square_feet: null, floor_area_unit: null } };
  }

  if (rawValue === null || rawValue === '') {
    return {
      ok: true,
      cleared: true,
      fields: { floor_area: null, square_feet: null, floor_area_unit: null },
      provenance: null,
    };
  }

  const numeric = Number(rawValue);
  if (!Number.isFinite(numeric)) {
    return { ok: false, error: { field: 'floor_area', message: 'invalid_numeric' } };
  }
  if (numeric <= 0) {
    return { ok: false, error: { field: 'floor_area', message: 'non_positive' } };
  }

  const unitRaw = extractUnit(body, { squareFeetAlias });
  if (unitRaw === undefined || unitRaw === null || unitRaw === '') {
    return { ok: false, error: { field: 'floor_area_unit', message: 'missing_unit' } };
  }

  const unit = normaliseUnit(unitRaw);
  if (unit === AREA_UNIT.UNKNOWN) {
    return { ok: false, error: { field: 'floor_area_unit', message: 'unsupported_unit' } };
  }

  const maxRaw = unit === AREA_UNIT.SQM ? MAX_SQM : MAX_SQFT;
  if (numeric > maxRaw) {
    return { ok: false, error: { field: 'floor_area', message: 'implausible_value' } };
  }

  const normalisedSqft = convertToSqft(numeric, unit);
  const dbUnit = dbUnitFromCanonical(unit);
  const fields = {
    floor_area: numeric,
    square_feet: normalisedSqft,
    floor_area_unit: dbUnit,
  };

  const provenance = createProvenance({
    source: 'InternalListing',
    method: 'listing_capture',
    notes: 'First-party listing-supplied internal floor area. Not official evidence.',
  });

  return {
    ok: true,
    fields,
    provenance,
    rawValue: numeric,
    rawUnit: unit,
    normalisedSqft,
  };
}

function applyListingInternalAreaFields(target = {}, parsed, existing = {}) {
  if (!parsed?.ok) return target;
  if (parsed.omitted) return target;
  if (parsed.fields) {
    return {
      ...target,
      floor_area: parsed.fields.floor_area,
      square_feet: parsed.fields.square_feet,
      floor_area_unit: parsed.fields.floor_area_unit,
    };
  }
  return {
    ...target,
    floor_area: existing.floor_area ?? null,
    square_feet: existing.square_feet ?? null,
    floor_area_unit: existing.floor_area_unit ?? null,
  };
}

module.exports = {
  FORBIDDEN_AUTHORITY_KEYS,
  parseListingInternalAreaInput,
  applyListingInternalAreaFields,
  dbUnitFromCanonical,
};
