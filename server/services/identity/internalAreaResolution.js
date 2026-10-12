/**
 * Resolve canonical subject internal floor area from existing persisted evidence.
 * Does not acquire EPB, call providers, infer, or fabricate area.
 */

const { createProvenance } = require('../../utils/provenance');
const { canonicalPropertyTypeToken } = require('../../utils/canonicalPropertyType');
const { parseUprnProfile } = require('../providers/propertyData/propertyDataParsers');
const {
  CANONICAL_INTERNAL_AREA_VERSION,
  AREA_UNIT,
  AREA_SOURCE,
  SOURCE_PRECEDENCE,
  READINESS,
  normaliseUnit,
  toPositiveNumber,
  convertToSqft,
  isPlausibleSqft,
  AVM_MIN_SQFT,
} = require('../../architecture/canonicalInternalArea');

function emptyResolution(extras = {}) {
  return {
    version: CANONICAL_INTERNAL_AREA_VERSION,
    available: false,
    state: 'notAssessed',
    rawValue: null,
    rawUnit: AREA_UNIT.UNKNOWN,
    normalisedValueSqft: null,
    normalisedUnit: AREA_UNIT.SQFT,
    selectedSource: null,
    observations: [],
    conflicts: [],
    readiness: {
      state: READINESS.MISSING_INTERNAL_AREA,
      reasonCode: 'MISSING_INTERNAL_AREA',
      missingFields: ['internal_area'],
    },
    provenance: null,
    subjectScope: 'property',
    ...extras,
  };
}

function observation(source, rawValue, rawUnit, extras = {}) {
  const normalisedValueSqft = convertToSqft(rawValue, rawUnit);
  return {
    source,
    rawValue,
    rawUnit,
    normalisedValueSqft,
    normalisedUnit: AREA_UNIT.SQFT,
    available: normalisedValueSqft != null,
    subjectScope: extras.subjectScope || 'property',
    provenance: extras.provenance || null,
    retrievedAt: extras.retrievedAt || null,
    declaredAt: extras.declaredAt || null,
    official: extras.official === true,
    note: extras.note || null,
  };
}

function isUnitLikeProperty(property = {}) {
  const token = canonicalPropertyTypeToken(property.property_type);
  return ['flat', 'apartment', 'maisonette', 'studio'].includes(token || '');
}

function listingSaon(property = {}, identity = {}) {
  return identity.saon || property.saon || property.flat_number || null;
}

function epbClientSnapshot(epbEvidence) {
  if (!epbEvidence) return null;
  const client = epbEvidence.client || epbEvidence;
  const status = client.attachmentStatus || client.status || epbEvidence.attachmentStatus;
  if (status !== 'UNIQUE_ATTACH' && status !== 'REUSED') return null;
  return client;
}

function observationFromListing(property = {}) {
  const sqftField = property.square_feet ?? property.squareFeet;
  const floorField = property.floor_area ?? property.floorArea;
  const sqftNumeric = toPositiveNumber(sqftField);
  if (sqftNumeric != null) {
    return observation(AREA_SOURCE.INTERNAL_LISTING, sqftNumeric, AREA_UNIT.SQFT, {
      provenance: createProvenance({
        source: 'InternalListing',
        method: 'listing_field',
        notes: 'First-party listing square_feet. Not official evidence.',
      }),
    });
  }
  const numeric = toPositiveNumber(floorField);
  if (numeric == null) return null;
  const rawUnit = property.floor_area_unit ?? property.floorAreaUnit ?? null;
  if (rawUnit == null || rawUnit === '') {
    return observation(AREA_SOURCE.INTERNAL_LISTING, numeric, AREA_UNIT.UNKNOWN, {
      note: 'Listing floor area present but unit is unknown.',
      provenance: createProvenance({
        source: 'InternalListing',
        method: 'listing_field',
        notes: 'floor_area on listing record without unit — cannot normalise.',
      }),
    });
  }
  const unit = normaliseUnit(rawUnit);
  if (unit === AREA_UNIT.UNKNOWN) {
    return observation(AREA_SOURCE.INTERNAL_LISTING, numeric, AREA_UNIT.UNKNOWN, {
      note: 'Listing floor area present but unit is unknown.',
      provenance: createProvenance({
        source: 'InternalListing',
        method: 'listing_field',
        notes: 'floor_area unit not recognised — cannot normalise.',
      }),
    });
  }
  return observation(AREA_SOURCE.INTERNAL_LISTING, numeric, unit, {
    provenance: createProvenance({
      source: 'InternalListing',
      method: 'listing_field',
      notes: 'First-party listing-supplied floor area. Not official evidence.',
    }),
  });
}

function observationFromEpb(epbEvidence, property = {}, identity = {}) {
  const client = epbClientSnapshot(epbEvidence);
  if (!client) return null;
  const sqm = toPositiveNumber(client.current?.floorAreaSqm);
  if (sqm == null) return null;
  if (isUnitLikeProperty(property) && !listingSaon(property, identity)) {
    return observation(AREA_SOURCE.MHCLG_EPBD, sqm, AREA_UNIT.SQM, {
      subjectScope: 'unavailable',
      official: true,
      note:
        'EPB floor area withheld for unit-like property without SAON/unit identity — building certificate may not be unit-specific.',
      provenance: createProvenance({
        source: 'MHCLG_EPBD',
        method: 'official_epc_unique_attach',
        notes: 'Persisted EPB total_floor_area not bound to unit-like subject without SAON.',
      }),
    });
  }
  const certType = String(client.certificateType || client.current?.certificateType || '').toUpperCase();
  if (certType.includes('CEPC') || certType.includes('NON_DOMESTIC')) {
    return null;
  }
  return observation(AREA_SOURCE.MHCLG_EPBD, sqm, AREA_UNIT.SQM, {
    official: true,
    retrievedAt: client.retrievedAt || null,
    provenance: createProvenance({
      source: 'MHCLG_EPBD',
      method: 'official_epc_unique_attach',
      observedAt: client.inspectionDate || client.lodgementDate || null,
      retrievedAt: client.retrievedAt || null,
      notes: 'Official EPB total_floor_area (sqm). Energy certificate — not a building survey.',
    }),
  });
}

function observationFromUprn(externalEnrichment = {}, property = {}) {
  const enrichments = externalEnrichment?.enrichments || {};
  const payload = enrichments.uprn_profile?.success
    ? enrichments.uprn_profile.data || enrichments.uprn_profile.profile
    : null;
  if (!payload) return null;
  const profile = parseUprnProfile(payload);
  const uprn = property.uprn || externalEnrichment?.identity?.uprn || profile.uprn;
  if (!uprn) return null;
  const area = toPositiveNumber(profile.internalArea);
  if (area == null) return null;
  return observation(AREA_SOURCE.PROPERTYDATA_UPRN, area, AREA_UNIT.SQFT, {
    provenance: createProvenance({
      source: 'PropertyData',
      method: 'uprn_profile',
      providerEndpoint: '/uprn',
      retrievedAt: enrichments.uprn_profile?.provenance?.retrievedAt || null,
      notes: 'PropertyData UPRN profile internal area. Property-level UPRN match required.',
    }),
  });
}

function observationFromUserDeclared(declared) {
  if (!declared || typeof declared !== 'object') return null;
  const numeric = toPositiveNumber(declared.value);
  if (numeric == null) return null;
  const unit = normaliseUnit(declared.unit);
  if (unit === AREA_UNIT.UNKNOWN) {
    return observation(AREA_SOURCE.USER_DECLARED, numeric, AREA_UNIT.UNKNOWN, {
      note: 'User-declared floor area with unknown unit.',
      declaredAt: declared.declaredAt || new Date().toISOString(),
      provenance: createProvenance({
        source: 'USER_DECLARED',
        method: 'user_input',
        notes: 'Optional user-declared internal area for valuation readiness. Not official evidence.',
      }),
    });
  }
  return observation(AREA_SOURCE.USER_DECLARED, numeric, unit, {
    declaredAt: declared.declaredAt || new Date().toISOString(),
    provenance: createProvenance({
      source: 'USER_DECLARED',
      method: 'user_input',
      notes: 'Optional user-declared internal area for valuation readiness. Not official evidence.',
    }),
  });
}

async function loadPersistedEpbObservation(propertyId, deps = {}) {
  if (!propertyId) return null;
  const query = deps.query || require('../../models/db').query.bind(require('../../models/db'));
  try {
    const result = await query(
      `SELECT facts, attachment_status, retrieved_at, inspection_date, lodgement_date,
              certificate_type
       FROM official_epb_certificates
       WHERE property_id = $1 AND is_current = TRUE
       ORDER BY lodgement_date DESC NULLS LAST
       LIMIT 1`,
      [propertyId]
    );
    const row = result.rows?.[0];
    if (!row || row.attachment_status !== 'UNIQUE_ATTACH') return null;
    const facts = typeof row.facts === 'string' ? JSON.parse(row.facts) : row.facts || {};
    const sqm = toPositiveNumber(facts.totalFloorAreaSqm);
    if (sqm == null) return null;
    return observation(AREA_SOURCE.MHCLG_EPBD, sqm, AREA_UNIT.SQM, {
      official: true,
      retrievedAt: row.retrieved_at || null,
      provenance: createProvenance({
        source: 'MHCLG_EPBD',
        method: 'official_epc_unique_attach_persisted',
        observedAt: row.inspection_date || row.lodgement_date || null,
        retrievedAt: row.retrieved_at || null,
        notes: 'Reused persisted EPB total_floor_area without new acquisition.',
      }),
    });
  } catch {
    return null;
  }
}

function selectObservation(observations = []) {
  const usable = observations.filter(
    (row) => row.available && row.normalisedValueSqft != null && row.subjectScope !== 'unavailable'
  );
  for (const source of SOURCE_PRECEDENCE) {
    const match = usable.find((row) => row.source === source);
    if (match) return match;
  }
  const unknownUnit = observations.find(
    (row) => row.rawValue != null && row.rawUnit === AREA_UNIT.UNKNOWN
  );
  if (unknownUnit) return { ...unknownUnit, invalidUnit: true };
  const withheld = observations.find((row) => row.subjectScope === 'unavailable');
  if (withheld) return { ...withheld, identityWithheld: true };
  return null;
}

function detectConflicts(observations = []) {
  const usable = observations.filter((row) => row.available && row.normalisedValueSqft != null);
  const conflicts = [];
  for (let i = 0; i < usable.length; i += 1) {
    for (let j = i + 1; j < usable.length; j += 1) {
      const a = usable[i];
      const b = usable[j];
      const ratio =
        a.normalisedValueSqft >= b.normalisedValueSqft
          ? a.normalisedValueSqft / b.normalisedValueSqft
          : b.normalisedValueSqft / a.normalisedValueSqft;
      if (ratio >= 1.15) {
        conflicts.push({
          sources: [a.source, b.source],
          valuesSqft: [a.normalisedValueSqft, b.normalisedValueSqft],
          note: 'Conflicting floor-area observations preserved; higher-precedence source selected. Values were not averaged.',
        });
      }
    }
  }
  return conflicts;
}

function readinessFromSelection(selected, conflicts = []) {
  if (!selected) {
    return {
      state: READINESS.MISSING_INTERNAL_AREA,
      reasonCode: 'MISSING_INTERNAL_AREA',
      missingFields: ['internal_area'],
    };
  }
  if (selected.invalidUnit) {
    return {
      state: READINESS.INVALID_INTERNAL_AREA,
      reasonCode: 'INVALID_INTERNAL_AREA',
      missingFields: ['internal_area_unit'],
    };
  }
  if (selected.identityWithheld) {
    return {
      state: READINESS.IDENTITY_MISMATCH,
      reasonCode: 'UNIT_UNKNOWN',
      missingFields: ['saon', 'internal_area'],
    };
  }
  if (!isPlausibleSqft(selected.normalisedValueSqft)) {
    const belowMin = selected.normalisedValueSqft != null && selected.normalisedValueSqft < AVM_MIN_SQFT;
    return {
      state: belowMin ? READINESS.MISSING_INTERNAL_AREA : READINESS.INVALID_INTERNAL_AREA,
      reasonCode: belowMin ? 'MISSING_INTERNAL_AREA' : 'INVALID_INTERNAL_AREA',
      note: belowMin
        ? `Normalised area ${selected.normalisedValueSqft} sqft is below provider minimum ${AVM_MIN_SQFT} sqft.`
        : `Normalised area ${selected.normalisedValueSqft} sqft is implausible.`,
    };
  }
  if (conflicts.length) {
    return {
      state: READINESS.PROVIDER_ELIGIBLE,
      reasonCode: null,
      conflictPreserved: true,
    };
  }
  return {
    state: READINESS.PROVIDER_ELIGIBLE,
    reasonCode: null,
    missingFields: [],
  };
}

async function resolveCanonicalInternalArea({
  property = {},
  identity = {},
  epbEvidence = null,
  externalEnrichment = null,
  userDeclared = null,
  loadPersistedEpb = true,
  deps = {},
} = {}) {
  const observations = [];
  const listingObs = observationFromListing(property);
  if (listingObs) observations.push(listingObs);

  const epbObs =
    observationFromEpb(epbEvidence, property, identity)
    || (loadPersistedEpb ? await loadPersistedEpbObservation(property.id, deps) : null);
  if (epbObs) observations.push(epbObs);

  const uprnObs = observationFromUprn(externalEnrichment || {}, property);
  if (uprnObs) observations.push(uprnObs);

  const declaredObs = observationFromUserDeclared(userDeclared);
  if (declaredObs) observations.push(declaredObs);

  const conflicts = detectConflicts(observations);
  const selected = selectObservation(observations);
  const readiness = readinessFromSelection(selected, conflicts);

  if (!selected || readiness.state !== READINESS.PROVIDER_ELIGIBLE) {
    return emptyResolution({
      observations,
      conflicts,
      readiness,
      selectedSource: selected?.source || null,
    });
  }

  return {
    version: CANONICAL_INTERNAL_AREA_VERSION,
    available: true,
    state: 'observed',
    rawValue: selected.rawValue,
    rawUnit: selected.rawUnit,
    normalisedValueSqft: selected.normalisedValueSqft,
    normalisedUnit: AREA_UNIT.SQFT,
    selectedSource: selected.source,
    observations,
    conflicts,
    readiness,
    provenance: selected.provenance,
    subjectScope: selected.subjectScope || 'property',
  };
}

function applyCanonicalInternalAreaToProperty(property = {}, resolution = {}) {
  const base = {
    ...property,
    internalAreaResolution: resolution,
  };
  if (resolution?.readiness?.reasonCode === 'INVALID_INTERNAL_AREA') {
    return { ...base, square_feet: null };
  }
  if (!resolution?.available || !resolution.normalisedValueSqft) {
    return base;
  }
  return {
    ...base,
    square_feet: resolution.normalisedValueSqft,
    floor_area_unit: 'sq_ft',
    internalAreaSource: resolution.selectedSource,
    internalAreaProvenance: resolution.provenance,
    floorAreaSource: resolution.selectedSource,
  };
}

function parseDeclaredInternalArea(raw) {
  if (raw == null || raw === '') return { ok: true, value: null };
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw <= 0) {
      return { ok: false, error: { field: 'declaredInternalArea', message: 'invalid_value' } };
    }
    return { ok: true, value: { value: raw, unit: 'sqft' } };
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: { field: 'declaredInternalArea', message: 'malformed' } };
  }
  const forbidden = [
    'readiness',
    'provenance',
    'selectedSource',
    'canonical',
    'providerEligible',
    'authority',
    'assessmentState',
  ];
  for (const key of forbidden) {
    if (raw[key] !== undefined) {
      return {
        ok: false,
        error: { field: 'declaredInternalArea', message: 'client_authority_rejected' },
      };
    }
  }
  const value = raw.value ?? raw.area ?? raw.internalArea;
  const unit = raw.unit ?? raw.floorAreaUnit ?? raw.floor_area_unit;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return { ok: false, error: { field: 'declaredInternalArea', message: 'invalid_value' } };
  }
  if (unit == null || unit === '') {
    return { ok: false, error: { field: 'declaredInternalArea', message: 'missing_unit' } };
  }
  return { ok: true, value: { value: numeric, unit, declaredAt: new Date().toISOString() } };
}

module.exports = {
  resolveCanonicalInternalArea,
  applyCanonicalInternalAreaToProperty,
  parseDeclaredInternalArea,
  observationFromListing,
  observationFromEpb,
  observationFromUprn,
  observationFromUserDeclared,
  loadPersistedEpbObservation,
  isUnitLikeProperty,
  selectObservation,
  detectConflicts,
};
