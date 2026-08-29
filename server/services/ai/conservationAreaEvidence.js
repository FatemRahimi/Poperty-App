/**
 * Canonical conservation-area evidence for Property Intelligence.
 * Report/context only — area membership at the property coordinates.
 * Does not score, value, or adjust finance. Unknown remains notAssessed,
 * not “not in a conservation area”.
 */

const { createProvenance } = require('../../utils/provenance');
const { propertyIntelligenceConfig } = require('../../config/propertyIntelligence.config');
const {
  DISPLAY_LIMIT,
  mapConservationArea,
  classifyConservationArea,
  compareConservationAreas,
  queryConservationAreas,
  readCoords,
  inUkBounds,
} = require('../providers/planningData/conservationAreaClient');

const UNAVAILABLE_REASONS = Object.freeze({
  providerDisabled: 'provider_disabled',
  locationUnavailable: 'property_location_unavailable',
  unsupportedGeography: 'unsupported_geography',
  providerUnavailable: 'provider_unavailable',
  malformed: 'malformed_provider_response',
  noApplicableEvidence: 'no_applicable_evidence_returned',
  notAttached: 'not_attached',
});

const SCORE_KEYS = Object.freeze([
  'score',
  'conservationScore',
  'conservationAreaScore',
  'heritageScore',
  'heritageRiskScore',
  'riskScore',
  'numericScore',
]);

const SOURCE = 'MHCLG_PlanningData_ConservationArea';
const PROVIDER = 'MHCLG_PlanningData';
const AUTHORITY = 'MHCLG Planning Data (local planning authorities and Historic England)';

const GEOGRAPHIC_RESOLUTION =
  'Property coordinates intersecting a conservation-area polygon. This is area membership at the point, not a listed-building designation, curtilage, or permission outcome.';

const LIMITATIONS = Object.freeze([
  'This is the MHCLG Planning Data conservation-area dataset for England, using local planning authority and Historic England polygons.',
  'Coverage is incomplete and may include duplicates. No area returned is not evidence that the property is outside a conservation area.',
  'Membership is point-in-polygon at the property coordinates, not a building footprint or title plan.',
  'A postcode is not used as conservation-area membership proof.',
  'Conservation-area membership is not a listed-building designation and is not a planning application.',
  'This does not mean specific alterations are prohibited, or that permission will or will not be granted.',
  'Conservation-area evidence is not a heritage score, valuation adjustment, mortgage assumption, or Personal Decision input.',
]);

function isoTimestamp(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function conservationAreaIdentity(property = {}, coords = null, extras = {}) {
  return {
    listingId: extras.listingId ?? property.id ?? null,
    subjectId: extras.subjectId ?? property.subjectId ?? null,
    uprn: extras.uprn ?? property.uprn ?? null,
    postcode: extras.postcode ?? property.zip_code ?? property.postcode ?? null,
    latitude: coords?.latitude ?? null,
    longitude: coords?.longitude ?? null,
    coordinateSource: coords ? (extras.coordinateSource || 'property_record') : null,
    postcodeUsedAsConservationAreaLocation: false,
  };
}

function publicArea(row) {
  if (!row) return null;
  return {
    name: row.name || null,
    reference: row.reference || null,
    entityId: Number.isFinite(row.entityId) ? row.entityId : null,
    organisationEntity: Number.isFinite(row.organisationEntity) ? row.organisationEntity : null,
    nativeQuality: row.nativeQuality || null,
    designationDate: row.designationDate || null,
    startDate: row.startDate || null,
    documentationUrl: row.documentationUrl || null,
    scope: 'area_membership',
    matchMethod: row.matchMethod || 'coordinate_point_in_polygon',
    notAScore: true,
    notAListedBuilding: true,
    notAPlanningApplication: true,
    notAValuationAdjustment: true,
    notPersonalDecisionInput: true,
  };
}

function summaryValue(areas) {
  const names = areas.map((row) => row.name).filter(Boolean);
  const unique = [...new Set(names)];
  if (unique.length === 1) return unique[0];
  if (unique.length > 1) return unique.join('; ');
  if (areas.length === 1 && areas[0].reference) return areas[0].reference;
  if (areas.length > 1) return `${areas.length} conservation areas`;
  return null;
}

function conservationAreaBase(extras = {}) {
  const retrievedAt = isoTimestamp(extras.retrievedAt);
  const evidenceAsOf = isoTimestamp(extras.evidenceAsOf) || retrievedAt;
  return {
    field: 'conservationArea',
    available: false,
    value: null,
    state: 'notAssessed',
    trust: 'notAssessed',
    source: null,
    provider: extras.provider === undefined ? PROVIDER : extras.provider,
    sourceKind: 'authoritative_open_data',
    authority: AUTHORITY,
    scope: extras.scope || 'coordinate_point_in_polygon',
    method: extras.method || 'conservation_area_point_in_polygon',
    observedAt: null,
    retrievedAt,
    evidenceAsOf,
    unavailableReason: extras.unavailableReason ?? null,
    note: extras.note ?? null,
    areas: extras.areas || [],
    summary: extras.summary || { subjectCount: 0, displayedSubjectCount: 0 },
    geographicResolution:
      extras.geographicResolution === undefined ? GEOGRAPHIC_RESOLUTION : extras.geographicResolution,
    notAScore: true,
    notAValuationAdjustment: true,
    notPersonalDecisionInput: true,
    notAListedBuilding: true,
    notAPlanningApplication: true,
    notOutsideProof: true,
    scoringActivated: false,
    decisionClass: 'report_context_evidence',
    limitations: LIMITATIONS,
    identity: extras.identity || {},
    ...extras,
    field: 'conservationArea',
    retrievedAt: isoTimestamp(extras.retrievedAt) ?? retrievedAt,
    evidenceAsOf: isoTimestamp(extras.evidenceAsOf) || isoTimestamp(extras.retrievedAt) || evidenceAsOf,
    scoringActivated: false,
    notAScore: true,
    notAValuationAdjustment: true,
    notPersonalDecisionInput: true,
    notAListedBuilding: true,
    notAPlanningApplication: true,
    notOutsideProof: true,
  };
}

function notAssessedConservationArea({ reason, note, retrievedAt = null, identity = {}, provider } = {}) {
  const queried = reason !== UNAVAILABLE_REASONS.notAttached;
  const hasCoords = identity?.latitude != null && identity?.longitude != null;
  return {
    ...conservationAreaBase({
      provider: provider === undefined ? (queried ? PROVIDER : null) : provider,
      source: queried ? SOURCE : null,
      retrievedAt,
      evidenceAsOf: retrievedAt,
      unavailableReason: reason,
      note,
      identity,
      geographicResolution: hasCoords ? GEOGRAPHIC_RESOLUTION : null,
      provenance: createProvenance({
        source: queried ? SOURCE : null,
        method: 'conservation_area_point_in_polygon',
        retrievedAt: retrievedAt || undefined,
        providerEndpoint: queried ? '/entity.json?dataset=conservation-area' : null,
        notes: note,
      }),
    }),
    available: false,
    value: null,
    state: 'notAssessed',
    trust: 'notAssessed',
    areas: [],
    geographicResolution: hasCoords ? GEOGRAPHIC_RESOLUTION : null,
  };
}

function unattachedConservationAreaFact(extras = {}) {
  return notAssessedConservationArea({
    reason: UNAVAILABLE_REASONS.notAttached,
    note:
      extras.note
      || 'Conservation-area evidence was not attached in this assembly. Missing conservation-area status is not “not in a conservation area”.',
    identity: extras.identity || {},
  });
}

function assessedConservationArea({
  areas,
  retrievedAt,
  identity,
  providerCount,
}) {
  const displayed = areas.slice(0, DISPLAY_LIMIT);
  const publicAreas = displayed.map(publicArea).filter(Boolean);
  return conservationAreaBase({
    available: true,
    value: summaryValue(publicAreas),
    state: 'observed',
    trust: 'observed',
    source: SOURCE,
    provider: PROVIDER,
    scope: 'coordinate_point_in_polygon',
    method: 'conservation_area_point_in_polygon',
    retrievedAt,
    evidenceAsOf: retrievedAt,
    unavailableReason: null,
    note:
      'The property coordinates intersect this conservation-area polygon. That is area membership at the point, not a listed-building designation, a permission outcome, or a valuation adjustment.',
    areas: publicAreas,
    summary: {
      subjectCount: areas.length,
      displayedSubjectCount: publicAreas.length,
      providerCount: providerCount ?? null,
    },
    identity,
    geographicResolution: GEOGRAPHIC_RESOLUTION,
    provenance: createProvenance({
      source: SOURCE,
      method: 'conservation_area_point_in_polygon',
      retrievedAt,
      providerEndpoint: '/entity.json?dataset=conservation-area',
      notes: 'England conservation-area polygons. Coverage is incomplete. Point-in-polygon is not a curtilage or consent determination.',
    }),
  });
}

function sanitizeConservationAreaFact(fact) {
  if (!fact || typeof fact !== 'object' || Array.isArray(fact)) {
    return unattachedConservationAreaFact();
  }
  const cleaned = { ...fact };
  SCORE_KEYS.forEach((key) => {
    delete cleaned[key];
  });
  const areas = Array.isArray(cleaned.areas)
    ? cleaned.areas.map(publicArea).filter(Boolean)
    : [];
  const available = cleaned.available === true && areas.length > 0;
  return conservationAreaBase({
    ...cleaned,
    available,
    value: available ? cleaned.value || summaryValue(areas) : null,
    state: available ? (cleaned.state || 'observed') : 'notAssessed',
    trust: available ? (cleaned.trust || 'observed') : 'notAssessed',
    areas: available ? areas : [],
    scoringActivated: false,
    notAScore: true,
    notAValuationAdjustment: true,
    notPersonalDecisionInput: true,
    notAListedBuilding: true,
    notAPlanningApplication: true,
    notOutsideProof: true,
    decisionClass: 'report_context_evidence',
  });
}

async function getConservationAreaEvidence(property = {}, context = {}) {
  const contextIdentity = context.identity && typeof context.identity === 'object' ? context.identity : {};
  const coords = readCoords(property) || readCoords(contextIdentity);
  const identity = conservationAreaIdentity(property, coords, contextIdentity);
  const cfg = propertyIntelligenceConfig.providers.conservationArea;
  const query = typeof context.queryConservationAreas === 'function'
    ? context.queryConservationAreas
    : queryConservationAreas;

  if (!cfg.enabled) {
    return notAssessedConservationArea({
      reason: UNAVAILABLE_REASONS.providerDisabled,
      note: 'Conservation-area lookup is disabled. Missing conservation-area status is not “not in a conservation area”.',
      identity,
    });
  }

  if (!coords) {
    return notAssessedConservationArea({
      reason: UNAVAILABLE_REASONS.locationUnavailable,
      note: 'Property coordinates were not available, so conservation-area membership was not queried. A postcode is not used as conservation-area membership proof.',
      identity: conservationAreaIdentity(property, null, contextIdentity),
    });
  }

  if (!inUkBounds(coords)) {
    return notAssessedConservationArea({
      reason: UNAVAILABLE_REASONS.unsupportedGeography,
      note: 'Coordinates are outside the England coverage used for conservation-area queries. Missing conservation-area status is not “not in a conservation area”.',
      identity: conservationAreaIdentity(property, coords, contextIdentity),
    });
  }

  try {
    const result = await query({ coords, skipCache: context.skipCache === true }, context);
    const retrievedAt = result.retrievedAt || new Date().toISOString();
    const located = conservationAreaIdentity(property, coords, contextIdentity);
    if (!result.success) {
      const reason =
        result.reason === 'malformed_provider_response'
          ? UNAVAILABLE_REASONS.malformed
          : result.reason === 'property_location_unavailable'
            ? UNAVAILABLE_REASONS.locationUnavailable
            : UNAVAILABLE_REASONS.providerUnavailable;
      return notAssessedConservationArea({
        reason,
        note:
          reason === UNAVAILABLE_REASONS.malformed
            ? 'The conservation-area response could not be parsed. Missing conservation-area status is not “not in a conservation area”.'
            : 'The conservation-area service was unavailable. Missing conservation-area status is not “not in a conservation area”.',
        retrievedAt,
        identity: located,
      });
    }

    const areas = (result.entities || [])
      .map(mapConservationArea)
      .map((row) => classifyConservationArea(row, coords))
      .filter(Boolean)
      .sort(compareConservationAreas);

    if (!areas.length) {
      return notAssessedConservationArea({
        reason: UNAVAILABLE_REASONS.noApplicableEvidence,
        note:
          'This source returned no current conservation area intersecting these coordinates. That is not evidence that the property is outside a conservation area, and coverage is incomplete.',
        retrievedAt,
        identity: located,
      });
    }

    return assessedConservationArea({
      areas,
      retrievedAt,
      identity: located,
      providerCount: result.providerCount,
    });
  } catch (error) {
    const aborted = error?.name === 'AbortError';
    const malformed = error?.message === 'malformed_provider_response';
    return notAssessedConservationArea({
      reason: malformed ? UNAVAILABLE_REASONS.malformed : UNAVAILABLE_REASONS.providerUnavailable,
      note: malformed
        ? 'The conservation-area response could not be parsed. Missing conservation-area status is not “not in a conservation area”.'
        : aborted
          ? 'The conservation-area request timed out. Missing conservation-area status is not “not in a conservation area”.'
          : 'The conservation-area service could not be reached. Missing conservation-area status is not “not in a conservation area”.',
      retrievedAt: new Date().toISOString(),
      identity: conservationAreaIdentity(property, coords, contextIdentity),
    });
  }
}

module.exports = {
  getConservationAreaEvidence,
  notAssessedConservationArea,
  unattachedConservationAreaFact,
  assessedConservationArea,
  sanitizeConservationAreaFact,
  conservationAreaIdentity,
  UNAVAILABLE_REASONS,
  LIMITATIONS,
  GEOGRAPHIC_RESOLUTION,
  DISPLAY_LIMIT,
  SOURCE,
};
