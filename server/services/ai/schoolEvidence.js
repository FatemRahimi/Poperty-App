/**
 * Canonical school evidence for Property Intelligence.
 * Report/context only — nearby establishments are not catchment, admission,
 * quality scores, valuation adjustments, or Personal Decision inputs.
 */

const { createProvenance } = require('../../utils/provenance');
const { propertyIntelligenceConfig } = require('../../config/propertyIntelligence.config');
const {
  DEFAULT_SEARCH_RADIUS_M,
  DISPLAY_LIMIT,
  searchRadiusMetres,
  mapEstablishment,
  classifyEstablishment,
  compareEstablishments,
  queryEducationalEstablishments,
  readCoords,
  inUkBounds,
} = require('../providers/planningData/educationalEstablishmentClient');

const UNAVAILABLE_REASONS = Object.freeze({
  providerDisabled: 'provider_disabled',
  locationUnavailable: 'property_location_unavailable',
  unsupportedGeography: 'unsupported_geography',
  providerUnavailable: 'provider_unavailable',
  malformed: 'malformed_provider_response',
  noApplicableEvidence: 'no_applicable_evidence_returned',
  notAttached: 'not_attached',
  noCatchmentSource: 'no_authoritative_catchment_source_integrated',
});

const SCORE_KEYS = Object.freeze([
  'score',
  'schoolScore',
  'educationScore',
  'familyScore',
  'ofstedScore',
  'OfstedScore',
  'catchmentScore',
]);

const SOURCE = 'MHCLG_PlanningData_EducationalEstablishment';
const PROVIDER = 'MHCLG_PlanningData';
const AUTHORITY = 'Department for Education (GIAS via MHCLG Planning Data)';

const LIMITATIONS = Object.freeze([
  'This is the MHCLG Planning Data educational-establishment dataset for England, using Department for Education GIAS identifiers.',
  'Nearby establishments are proximity only. They are not catchment, admissions, walking-route, or commute evidence.',
  'No establishments returned is not evidence that there are no schools.',
  `Nearby search uses a fixed ${DEFAULT_SEARCH_RADIUS_M} metre radius around the property coordinates.`,
  'Distance is a straight-line coordinate measurement, not a walking route or travel time.',
  'Establishment type and status are native GIAS wording. Phase of education is not supplied by this dataset.',
  'Inspection and performance judgements are not included. GIAS removed Ofsted rating fields in January 2025.',
  'Catchment and admissions are not assessed. No national authoritative catchment source is integrated.',
  'School evidence is not a quality score and is not a valuation or Personal Decision input.',
]);

function isoTimestamp(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function schoolIdentity(property = {}, coords = null, extras = {}) {
  return {
    listingId: extras.listingId ?? property.id ?? null,
    subjectId: extras.subjectId ?? property.subjectId ?? null,
    uprn: extras.uprn ?? property.uprn ?? null,
    postcode: extras.postcode ?? property.zip_code ?? property.postcode ?? null,
    latitude: coords?.latitude ?? null,
    longitude: coords?.longitude ?? null,
    coordinateSource: coords ? (extras.coordinateSource || 'property_record') : null,
    postcodeUsedAsSchoolLocation: false,
  };
}

function catchmentNotAssessed(extras = {}) {
  return {
    available: false,
    state: 'notAssessed',
    reason: UNAVAILABLE_REASONS.noCatchmentSource,
    note:
      extras.note
      || 'No authoritative catchment or admissions-area source is integrated. Nearby schools are not catchment schools.',
    notAdmissionGuarantee: true,
    notEstimatedFromRadius: true,
  };
}

function publicSchool(row) {
  if (!row) return null;
  return {
    urn: row.urn || null,
    entityId: Number.isFinite(row.entityId) ? row.entityId : null,
    name: row.name || null,
    nativeType: row.nativeType || null,
    nativeTypeCode: row.nativeTypeCode || null,
    nativeStatus: row.nativeStatus || null,
    nativeStatusCode: row.nativeStatusCode || null,
    phase: null,
    gender: null,
    coordinates: row.point
      ? { latitude: row.point.latitude, longitude: row.point.longitude }
      : null,
    distanceMetres: row.distanceMetres,
    scope: 'nearby',
    matchMethod: row.matchMethod || 'search_radius',
    websiteUrl: row.websiteUrl || null,
    schoolCapacity: row.schoolCapacity || null,
    providerEntryDate: row.providerEntryDate || null,
    openDate: row.openDate || null,
    closeDate: row.closeDate || null,
    documentationUrl: row.urn
      ? `https://www.get-information-schools.service.gov.uk/Establishments/Establishment/Details/${row.urn}`
      : null,
    inspection: null,
    notAScore: true,
    notCatchment: true,
    notAdmissionEvidence: true,
  };
}

function schoolBase(extras = {}) {
  const retrievedAt = isoTimestamp(extras.retrievedAt);
  const evidenceAsOf = isoTimestamp(extras.evidenceAsOf) || retrievedAt;
  const radiusMetres = extras.searchRadiusMetres ?? searchRadiusMetres();
  return {
    field: 'schools',
    available: false,
    value: null,
    state: 'notAssessed',
    trust: 'notAssessed',
    source: null,
    provider: extras.provider === undefined ? PROVIDER : extras.provider,
    sourceKind: 'authoritative_open_data',
    authority: AUTHORITY,
    scope: extras.scope || 'area',
    method: extras.method || 'educational_establishment_geometry_buffer',
    observedAt: null,
    retrievedAt,
    evidenceAsOf,
    unavailableReason: extras.unavailableReason ?? null,
    note: extras.note ?? null,
    searchRadiusMetres: radiusMetres,
    nearbySchools: extras.nearbySchools || [],
    catchment: extras.catchment || catchmentNotAssessed(),
    summary: extras.summary || {
      nearbyCount: 0,
      displayedNearbyCount: 0,
      searchRadiusMetres: radiusMetres,
    },
    geographicResolution:
      extras.geographicResolution === undefined
        ? `Establishments intersecting a ${radiusMetres} metre coordinate buffer. Proximity is not catchment.`
        : extras.geographicResolution,
    notAScore: true,
    notAValuationAdjustment: true,
    notPersonalDecisionInput: true,
    notCatchment: true,
    notAdmissionEvidence: true,
    scoringActivated: false,
    decisionClass: 'report_context_evidence',
    limitations: LIMITATIONS,
    identity: extras.identity || {},
    ...extras,
    field: 'schools',
    retrievedAt: isoTimestamp(extras.retrievedAt) ?? retrievedAt,
    evidenceAsOf: isoTimestamp(extras.evidenceAsOf) || isoTimestamp(extras.retrievedAt) || evidenceAsOf,
    scoringActivated: false,
    notAScore: true,
    notAValuationAdjustment: true,
    notPersonalDecisionInput: true,
    notCatchment: true,
    notAdmissionEvidence: true,
    catchment: extras.catchment || catchmentNotAssessed(),
  };
}

function notAssessedSchools({ reason, note, retrievedAt = null, identity = {}, provider } = {}) {
  const queried = reason !== UNAVAILABLE_REASONS.notAttached;
  return {
    ...schoolBase({
      provider: provider === undefined ? (queried ? PROVIDER : null) : provider,
      source: queried ? SOURCE : null,
      retrievedAt,
      evidenceAsOf: retrievedAt,
      unavailableReason: reason,
      note,
      identity,
      geographicResolution: identity?.latitude != null ? undefined : null,
      provenance: createProvenance({
        source: queried ? SOURCE : null,
        method: 'educational_establishment_geometry_buffer',
        retrievedAt: retrievedAt || undefined,
        providerEndpoint: queried ? '/entity.json?dataset=educational-establishment' : null,
        notes: note,
      }),
    }),
    available: false,
    value: null,
    state: 'notAssessed',
    trust: 'notAssessed',
    nearbySchools: [],
    catchment: catchmentNotAssessed(),
  };
}

function unattachedSchoolFact(extras = {}) {
  return notAssessedSchools({
    reason: UNAVAILABLE_REASONS.notAttached,
    note:
      extras.note
      || 'School evidence was not attached in this assembly. Missing schools is not “no schools”, and nearby is not catchment.',
    identity: extras.identity || {},
  });
}

function summaryValue({ nearbyCount, radiusMetres }) {
  if (nearbyCount === 1) return `1 nearby establishment within ${radiusMetres}m`;
  if (nearbyCount > 1) return `${nearbyCount} nearby establishments within ${radiusMetres}m`;
  return 'No establishments returned by this source';
}

function assessedSchools({
  nearbySchools,
  retrievedAt,
  identity,
  radiusMetres,
  providerCount,
  capped,
}) {
  const nearbyCount = nearbySchools.length;
  const displayedNearby = nearbySchools.slice(0, DISPLAY_LIMIT);
  const empty = nearbyCount === 0;
  return schoolBase({
    available: true,
    value: summaryValue({ nearbyCount, radiusMetres }),
    state: 'observed',
    trust: 'areaContext',
    source: SOURCE,
    provider: PROVIDER,
    scope: 'area',
    method: 'educational_establishment_geometry_buffer',
    retrievedAt,
    evidenceAsOf: retrievedAt,
    unavailableReason: empty ? UNAVAILABLE_REASONS.noApplicableEvidence : null,
    note: empty
      ? 'This source returned no educational establishments for the search. That is not evidence that there are no schools, and nearby is not catchment.'
      : 'These establishments are nearby area context. They are not catchment schools and are not admission or valuation evidence.',
    searchRadiusMetres: radiusMetres,
    nearbySchools: displayedNearby.map(publicSchool),
    catchment: catchmentNotAssessed(),
    summary: {
      nearbyCount,
      displayedNearbyCount: displayedNearby.length,
      searchRadiusMetres: radiusMetres,
      providerCount: providerCount ?? null,
      resultsCapped: Boolean(capped),
    },
    identity,
    provenance: createProvenance({
      source: SOURCE,
      method: 'educational_establishment_geometry_buffer',
      retrievedAt,
      providerEndpoint: '/entity.json?dataset=educational-establishment',
      notes: 'England educational-establishment dataset. Nearby is not catchment.',
    }),
  });
}

function sanitizeSchoolFact(fact) {
  if (!fact || typeof fact !== 'object' || Array.isArray(fact)) {
    return unattachedSchoolFact();
  }
  const cleaned = { ...fact };
  SCORE_KEYS.forEach((key) => {
    delete cleaned[key];
  });
  const nearbySchools = Array.isArray(cleaned.nearbySchools)
    ? cleaned.nearbySchools.map(publicSchool).filter(Boolean)
    : [];
  const available = cleaned.available === true;
  return schoolBase({
    ...cleaned,
    available,
    value: available ? cleaned.value || null : null,
    state: available ? (cleaned.state || 'observed') : 'notAssessed',
    trust: available ? 'areaContext' : 'notAssessed',
    nearbySchools: available ? nearbySchools : [],
    catchment: catchmentNotAssessed(cleaned.catchment || {}),
    scoringActivated: false,
    notAScore: true,
    notAValuationAdjustment: true,
    notPersonalDecisionInput: true,
    notCatchment: true,
    notAdmissionEvidence: true,
    decisionClass: 'report_context_evidence',
  });
}

async function getSchoolEvidence(property = {}, context = {}) {
  const contextIdentity = context.identity && typeof context.identity === 'object' ? context.identity : {};
  const coords = readCoords(property) || readCoords(contextIdentity);
  const identity = schoolIdentity(property, coords, contextIdentity);
  const cfg = propertyIntelligenceConfig.providers.educationalEstablishment;
  const query = typeof context.queryEducationalEstablishments === 'function'
    ? context.queryEducationalEstablishments
    : queryEducationalEstablishments;

  if (!cfg.enabled) {
    return notAssessedSchools({
      reason: UNAVAILABLE_REASONS.providerDisabled,
      note: 'Educational establishment lookup is disabled. Missing schools is not “no schools”, and nearby is not catchment.',
      identity,
    });
  }

  if (!coords) {
    return notAssessedSchools({
      reason: UNAVAILABLE_REASONS.locationUnavailable,
      note: 'Property coordinates were not available, so nearby schools were not queried. A postcode is not used as a school location. Catchment is not assessed.',
      identity: schoolIdentity(property, null, contextIdentity),
    });
  }

  if (!inUkBounds(coords)) {
    return notAssessedSchools({
      reason: UNAVAILABLE_REASONS.unsupportedGeography,
      note: 'Coordinates are outside the England coverage used for educational-establishment queries. Catchment is not assessed.',
      identity: schoolIdentity(property, coords, contextIdentity),
    });
  }

  try {
    const result = await query({ coords, skipCache: context.skipCache === true }, context);
    const retrievedAt = result.retrievedAt || new Date().toISOString();
    const located = schoolIdentity(property, coords, contextIdentity);
    if (!result.success) {
      const reason =
        result.reason === 'malformed_provider_response'
          ? UNAVAILABLE_REASONS.malformed
          : result.reason === 'property_location_unavailable'
            ? UNAVAILABLE_REASONS.locationUnavailable
            : UNAVAILABLE_REASONS.providerUnavailable;
      return notAssessedSchools({
        reason,
        note:
          reason === UNAVAILABLE_REASONS.malformed
            ? 'The educational-establishment response could not be parsed. Missing schools is not “no schools”.'
            : 'The educational-establishment service was unavailable. Missing schools is not “no schools”.',
        retrievedAt,
        identity: located,
      });
    }

    const radiusMetres = result.radiusMetres || searchRadiusMetres();
    const nearbySchools = (result.entities || [])
      .map(mapEstablishment)
      .map((row) => classifyEstablishment(row, coords, radiusMetres))
      .filter(Boolean)
      .sort(compareEstablishments);

    return assessedSchools({
      nearbySchools,
      retrievedAt,
      identity: located,
      radiusMetres,
      providerCount: result.providerCount,
      capped: Number(result.providerCount) > 50 || (result.entities || []).length >= 50,
    });
  } catch (error) {
    const aborted = error?.name === 'AbortError';
    const malformed = error?.message === 'malformed_provider_response';
    return notAssessedSchools({
      reason: malformed ? UNAVAILABLE_REASONS.malformed : UNAVAILABLE_REASONS.providerUnavailable,
      note: malformed
        ? 'The educational-establishment response could not be parsed. Missing schools is not “no schools”.'
        : aborted
          ? 'The educational-establishment request timed out. Missing schools is not “no schools”.'
          : 'The educational-establishment service could not be reached. Missing schools is not “no schools”.',
      retrievedAt: new Date().toISOString(),
      identity: schoolIdentity(property, coords, contextIdentity),
    });
  }
}

module.exports = {
  getSchoolEvidence,
  notAssessedSchools,
  unattachedSchoolFact,
  assessedSchools,
  sanitizeSchoolFact,
  catchmentNotAssessed,
  UNAVAILABLE_REASONS,
  LIMITATIONS,
  DISPLAY_LIMIT,
  SOURCE,
};
