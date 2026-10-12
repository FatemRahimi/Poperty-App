/**
 * Provider-neutral subject property attributes.
 * Bedrooms / bathrooms / outdoor / parking — not PropertyData enums as the model.
 * finish_quality is NOT a canonical platform fact (see providerRequestInputs).
 */

const { createProvenance } = require('../utils/provenance');

const ATTRIBUTE = Object.freeze({
  BEDROOMS: 'bedrooms',
  BATHROOMS: 'bathrooms',
  OUTDOOR: 'outdoor',
  OFF_STREET_PARKING: 'offStreetParking',
});

const PROVENANCE = Object.freeze({
  OFFICIAL: 'OFFICIAL',
  LICENSED_PROVIDER: 'LICENSED_PROVIDER',
  FIRST_PARTY: 'FIRST_PARTY',
  USER_REPORTED: 'USER_REPORTED',
});

const ASSESSMENT = Object.freeze({
  ASSESSED: 'ASSESSED',
  NOT_ASSESSED: 'NOT_ASSESSED',
  CONFLICT: 'CONFLICT',
});

/** Coarse outdoor presence — provider mapping is separate. */
const OUTDOOR_VALUE = Object.freeze({
  NONE: 'none',
  GARDEN: 'garden',
  BALCONY_TERRACE: 'balcony_terrace',
});

const PROVIDER_FINISH_ENUMS = Object.freeze([
  'very_high',
  'high',
  'average',
  'below_average',
  'unmodernised',
]);

function emptyObservation(field) {
  return {
    field,
    available: false,
    value: null,
    state: ASSESSMENT.NOT_ASSESSED,
    provenance: null,
    source: null,
    asOf: null,
    conflict: null,
    note: null,
  };
}

function assessedObservation(field, value, {
  provenance,
  source,
  asOf = null,
  note = null,
  conflict = null,
} = {}) {
  return {
    field,
    available: true,
    value,
    state: conflict ? ASSESSMENT.CONFLICT : ASSESSMENT.ASSESSED,
    provenance,
    source,
    asOf: asOf || new Date().toISOString(),
    conflict,
    note,
  };
}

function parseNonNegativeInt(raw, { max = 99, allowZero = true } = {}) {
  if (raw === undefined || raw === null || raw === '') return { ok: false, reason: 'absent' };
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return { ok: false, reason: 'not_integer' };
  if (n < 0) return { ok: false, reason: 'negative' };
  if (!allowZero && n === 0) return { ok: false, reason: 'zero_not_allowed_here' };
  if (n > max) return { ok: false, reason: 'above_max' };
  return { ok: true, value: n };
}

function parseOutdoorValue(raw) {
  if (raw === undefined || raw === null || raw === '') return { ok: false, reason: 'absent' };
  const text = String(raw).trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (text === 'none' || text === 'no' || text === 'no_outdoor') {
    return { ok: true, value: OUTDOOR_VALUE.NONE };
  }
  if (text === 'garden' || text === 'has_garden' || text === 'yes_garden') {
    return { ok: true, value: OUTDOOR_VALUE.GARDEN };
  }
  if (text === 'balcony_terrace' || text === 'balcony' || text === 'terrace' || text === 'has_balcony') {
    return { ok: true, value: OUTDOOR_VALUE.BALCONY_TERRACE };
  }
  return { ok: false, reason: 'unrecognised_outdoor_value' };
}

function parseFinishQualityProviderInput(raw) {
  if (raw === undefined || raw === null || raw === '') return { ok: false, reason: 'absent' };
  const text = String(raw).trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (PROVIDER_FINISH_ENUMS.includes(text)) return { ok: true, value: text };
  return { ok: false, reason: 'unrecognised_finish_quality' };
}

/**
 * Parse subject-native USER_REPORTED capture body.
 * Rejects trust/official injection. Does not invent values.
 */
function parseSubjectAttributeInput(body = {}) {
  const errors = [];
  const attributes = {};
  const providerRequestInputs = {};

  const forbidden = [
    'verificationState', 'official', 'OFFICIAL', 'provenanceOfficial',
    'habitable_rooms', 'habitableRoomCount', 'habitable_room_count',
    'heated_room_count', 'heatedRoomCount',
    'rooms_with_bath_and_or_shower', 'rooms_with_bath_and_mixer_shower',
    'epcRating', 'energyRating', 'currentEnergyRating',
  ];
  for (const key of forbidden) {
    if (Object.prototype.hasOwnProperty.call(body, key) && body[key] != null) {
      errors.push({ field: key, reason: 'forbidden_trust_or_inference_key' });
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, 'bedrooms')) {
    const parsed = parseNonNegativeInt(body.bedrooms, { max: 20, allowZero: true });
    if (!parsed.ok && body.bedrooms !== null && body.bedrooms !== '') {
      errors.push({ field: 'bedrooms', reason: parsed.reason });
    } else if (parsed.ok) {
      attributes.bedrooms = parsed.value;
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, 'bathrooms')) {
    const parsed = parseNonNegativeInt(body.bathrooms, { max: 20, allowZero: true });
    if (!parsed.ok && body.bathrooms !== null && body.bathrooms !== '') {
      errors.push({ field: 'bathrooms', reason: parsed.reason });
    } else if (parsed.ok) {
      attributes.bathrooms = parsed.value;
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, 'outdoor')
    || Object.prototype.hasOwnProperty.call(body, 'outdoorSpace')
    || Object.prototype.hasOwnProperty.call(body, 'garden')) {
    const raw = body.outdoor ?? body.outdoorSpace
      ?? (body.garden === true ? 'garden' : body.garden === false ? 'none' : body.garden);
    const parsed = parseOutdoorValue(raw);
    if (!parsed.ok) errors.push({ field: 'outdoor', reason: parsed.reason });
    else attributes.outdoor = parsed.value;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'offStreetParking')
    || Object.prototype.hasOwnProperty.call(body, 'parkingSpaces')
    || Object.prototype.hasOwnProperty.call(body, 'parking')) {
    const raw = body.offStreetParking ?? body.parkingSpaces ?? body.parking;
    const parsed = parseNonNegativeInt(raw, { max: 20, allowZero: true });
    if (!parsed.ok) errors.push({ field: 'offStreetParking', reason: parsed.reason });
    else attributes.offStreetParking = parsed.value;
  }

  // Provider-request-only subjective input — not a canonical property fact.
  if (Object.prototype.hasOwnProperty.call(body, 'finishQuality')
    || Object.prototype.hasOwnProperty.call(body, 'finish_quality')
    || Object.prototype.hasOwnProperty.call(body, 'propertyFinish')) {
    const raw = body.finishQuality ?? body.finish_quality ?? body.propertyFinish;
    const parsed = parseFinishQualityProviderInput(raw);
    if (!parsed.ok) errors.push({ field: 'finishQuality', reason: parsed.reason });
    else {
      providerRequestInputs.finishQuality = parsed.value;
      providerRequestInputs.finishQualityIsProviderRequestOnly = true;
    }
  }

  if (errors.length) return { ok: false, errors };
  if (!Object.keys(attributes).length && !Object.keys(providerRequestInputs).length) {
    return { ok: false, errors: [{ field: '_', reason: 'no_attributes_supplied' }] };
  }
  return { ok: true, attributes, providerRequestInputs };
}

function observationFromStored(field, stored) {
  if (!stored || typeof stored !== 'object') return emptyObservation(field);
  if (stored.value === undefined || stored.value === null) return emptyObservation(field);
  return assessedObservation(field, stored.value, {
    provenance: stored.provenance || PROVENANCE.USER_REPORTED,
    source: stored.source || 'subject_attribute_capture',
    asOf: stored.asOf || stored.updatedAt || null,
    note: stored.note || null,
    conflict: stored.conflict || null,
  });
}

module.exports = {
  ATTRIBUTE,
  PROVENANCE,
  ASSESSMENT,
  OUTDOOR_VALUE,
  PROVIDER_FINISH_ENUMS,
  emptyObservation,
  assessedObservation,
  parseNonNegativeInt,
  parseOutdoorValue,
  parseFinishQualityProviderInput,
  parseSubjectAttributeInput,
  observationFromStored,
  createProvenance,
};
