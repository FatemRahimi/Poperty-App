/**
 * Canonical flood evidence for Property Intelligence.
 * Report/context only — does not score, value, or adjust finance.
 */

const { createProvenance } = require('../../utils/provenance');
const { propertyIntelligenceConfig } = require('../../config/propertyIntelligence.config');
const {
  readCoords,
  inUkBounds,
  queryFloodMapForPlanning,
} = require('../providers/environmentAgency/floodMapForPlanning');

const UNAVAILABLE_REASONS = Object.freeze({
  providerDisabled: 'provider_disabled',
  locationUnavailable: 'property_location_unavailable',
  unsupportedGeography: 'unsupported_geography',
  providerUnavailable: 'provider_unavailable',
  noApplicableEvidence: 'no_applicable_evidence_returned',
  malformed: 'malformed_provider_response',
  notAttached: 'not_attached',
});

const SCORE_KEYS = Object.freeze(['score', 'floodScore', 'riskScore', 'numericScore']);
const CANONICAL_FLOOD_VALUES = Object.freeze(['Flood Zone 2', 'Flood Zone 3']);

const GEOGRAPHIC_RESOLUTION =
  'Environment Agency flood-zone polygon intersecting the property coordinates (not a UPRN building footprint).';

const LIMITATIONS = Object.freeze([
  'This is Flood Map for Planning (rivers and sea) only.',
  'Surface water is not assessed by this product.',
  'Reservoir flooding is not assessed by this product.',
  'Evidence is the mapped zone intersecting the property coordinates, not a building survey.',
  'Absence of Zone 2 or 3 is not “no flood risk” and is not a valuation or Personal Decision input.',
]);

function isoTimestamp(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function floodBase(extras = {}) {
  const retrievedAt = isoTimestamp(extras.retrievedAt);
  const evidenceAsOf = isoTimestamp(extras.evidenceAsOf) || retrievedAt;
  return {
    field: 'flood',
    available: false,
    value: null,
    state: 'notAssessed',
    trust: 'notAssessed',
    source: null,
    provider: extras.provider === undefined ? 'EnvironmentAgency' : extras.provider,
    sourceKind: 'authoritative_open_data',
    scope: 'coordinate_point_in_polygon',
    method: 'flood_map_for_planning_point_query',
    observedAt: null,
    retrievedAt,
    evidenceAsOf,
    unavailableReason: extras.unavailableReason ?? null,
    note: extras.note ?? null,
    floodTypes: ['rivers_and_sea'],
    categories: { riversAndSea: extras.categories?.riversAndSea ?? null },
    zone: extras.zone ?? null,
    layersMatched: extras.layersMatched || [],
    geographicResolution: extras.geographicResolution === undefined
      ? GEOGRAPHIC_RESOLUTION
      : extras.geographicResolution,
    notAScore: true,
    notLowRisk: true,
    notAValuationAdjustment: true,
    notPersonalDecisionInput: true,
    scoringActivated: false,
    decisionClass: 'report_context_evidence',
    limitations: LIMITATIONS,
    identity: extras.identity || {},
    ...extras,
    field: 'flood',
    retrievedAt: isoTimestamp(extras.retrievedAt) ?? retrievedAt,
    evidenceAsOf: isoTimestamp(extras.evidenceAsOf) || isoTimestamp(extras.retrievedAt) || evidenceAsOf,
    scoringActivated: false,
    notAScore: true,
    notLowRisk: true,
    notAValuationAdjustment: true,
    notPersonalDecisionInput: true,
  };
}

function notAssessedFlood({ reason, note, retrievedAt = null, identity = {}, provider } = {}) {
  const queried = reason !== UNAVAILABLE_REASONS.notAttached;
  const hasCoords = identity?.latitude != null && identity?.longitude != null;
  return {
    ...floodBase({
      provider: provider === undefined ? (queried ? 'EnvironmentAgency' : null) : provider,
      source: queried ? 'EnvironmentAgency_FloodMapForPlanning' : null,
      retrievedAt,
      evidenceAsOf: retrievedAt,
      unavailableReason: reason,
      note,
      identity,
      geographicResolution: hasCoords ? GEOGRAPHIC_RESOLUTION : null,
      provenance: createProvenance({
        source: queried ? 'EnvironmentAgency_FloodMapForPlanning' : null,
        method: 'flood_map_for_planning_point_query',
        retrievedAt: retrievedAt || undefined,
        providerEndpoint: queried ? '/Flood_Map_for_Planning/FeatureServer' : null,
        notes: note,
      }),
    }),
    available: false,
    value: null,
    state: 'notAssessed',
    trust: 'notAssessed',
    zone: null,
    layersMatched: [],
    categories: { riversAndSea: null },
    geographicResolution: hasCoords ? GEOGRAPHIC_RESOLUTION : null,
  };
}

function unattachedFloodFact(extras = {}) {
  return notAssessedFlood({
    reason: UNAVAILABLE_REASONS.notAttached,
    note:
      extras.note
      || 'Flood evidence was not attached in this assembly. Missing flood is not low risk.',
    identity: extras.identity || {},
  });
}

function sanitizeFloodFact(fact) {
  if (!fact || typeof fact !== 'object' || Array.isArray(fact)) {
    return unattachedFloodFact();
  }
  const cleaned = { ...fact };
  SCORE_KEYS.forEach((key) => {
    delete cleaned[key];
  });
  const value = CANONICAL_FLOOD_VALUES.includes(typeof cleaned.value === 'string' ? cleaned.value.trim() : '')
    ? cleaned.value.trim()
    : null;
  const available = cleaned.available === true && value != null;
  return floodBase({
    ...cleaned,
    available,
    value: available ? value : null,
    state: available ? (cleaned.state || 'observed') : 'notAssessed',
    trust: available ? (cleaned.trust || 'observed') : 'notAssessed',
    identity: floodIdentity({}, readCoords(cleaned.identity || {}), cleaned.identity || {}),
    scoringActivated: false,
    notAScore: true,
    notLowRisk: true,
    notAValuationAdjustment: true,
    notPersonalDecisionInput: true,
    decisionClass: 'report_context_evidence',
  });
}

function assessedFlood({ zone, layersMatched, retrievedAt, identity, attributes = [] }) {
  const value = zone === 3 ? 'Flood Zone 3' : 'Flood Zone 2';
  return floodBase({
    available: true,
    value,
    state: 'observed',
    trust: 'observed',
    source: 'EnvironmentAgency_FloodMapForPlanning',
    provider: 'EnvironmentAgency',
    retrievedAt,
    evidenceAsOf: retrievedAt,
    unavailableReason: null,
    note: `${value} (rivers and sea). This is mapped planning-zone evidence at the coordinates, not a prediction that the property will flood.`,
    floodTypes: ['rivers_and_sea'],
    categories: {
      riversAndSea: zone === 3 ? 'flood_zone_3' : 'flood_zone_2',
    },
    zone,
    layersMatched,
    providerAttributes: attributes.map((row) => ({
      layer: row.layer || null,
      type: row.type || null,
    })),
    identity: floodIdentity({}, readCoords(identity || {}), identity || {}),
    geographicResolution: GEOGRAPHIC_RESOLUTION,
    provenance: createProvenance({
      source: 'EnvironmentAgency_FloodMapForPlanning',
      method: 'flood_map_for_planning_point_query',
      retrievedAt,
      providerEndpoint: '/Flood_Map_for_Planning/FeatureServer',
      notes: 'Flood Map for Planning rivers and sea. Surface water and reservoirs are not included.',
    }),
  });
}

function floodIdentity(property = {}, coords = null, extras = {}) {
  return {
    listingId: extras.listingId ?? property.id ?? null,
    subjectId: extras.subjectId ?? property.subjectId ?? null,
    uprn: extras.uprn ?? property.uprn ?? null,
    postcode: extras.postcode ?? property.zip_code ?? property.postcode ?? null,
    latitude: coords?.latitude ?? (Number.isFinite(Number(extras.latitude)) ? Number(extras.latitude) : null),
    longitude: coords?.longitude ?? (Number.isFinite(Number(extras.longitude)) ? Number(extras.longitude) : null),
    coordinateSource: coords ? (extras.coordinateSource || 'property_record') : null,
    postcodeUsedAsFloodLocation: false,
  };
}

async function getFloodEvidence(property = {}, context = {}) {
  const contextIdentity = context.identity && typeof context.identity === 'object' ? context.identity : {};
  const coords = readCoords(property) || readCoords(contextIdentity);
  const identity = floodIdentity(property, coords, contextIdentity);
  const cfg = propertyIntelligenceConfig.providers.environmentAgencyFlood;
  const query = typeof context.queryFloodMapForPlanning === 'function'
    ? context.queryFloodMapForPlanning
    : queryFloodMapForPlanning;

  if (!cfg.enabled) {
    return notAssessedFlood({
      reason: UNAVAILABLE_REASONS.providerDisabled,
      note: 'Environment Agency flood lookup is disabled. Missing flood is not low risk.',
      identity,
    });
  }

  if (!coords) {
    return notAssessedFlood({
      reason: UNAVAILABLE_REASONS.locationUnavailable,
      note: 'Property coordinates were not available, so flood evidence was not queried. A postcode is not used as a flood location.',
      identity: floodIdentity(property, null, contextIdentity),
    });
  }

  if (!inUkBounds(coords)) {
    return notAssessedFlood({
      reason: UNAVAILABLE_REASONS.unsupportedGeography,
      note: 'Coordinates are outside the Environment Agency Flood Map for Planning coverage used by this product (England rivers-and-sea planning map).',
      identity: floodIdentity(property, coords, contextIdentity),
    });
  }

  try {
    const result = await query(coords, context);
    const retrievedAt = result.retrievedAt || new Date().toISOString();
    const located = floodIdentity(property, coords, contextIdentity);
    if (!result.success) {
      const reason =
        result.reason === 'malformed_provider_response'
          ? UNAVAILABLE_REASONS.malformed
          : UNAVAILABLE_REASONS.providerUnavailable;
      return notAssessedFlood({
        reason,
        note:
          reason === UNAVAILABLE_REASONS.malformed
            ? 'The Environment Agency response could not be parsed. Missing flood is not low risk.'
            : 'The Environment Agency flood service was unavailable. Missing flood is not low risk.',
        retrievedAt,
        identity: located,
      });
    }
    if (result.noApplicablePolygon || result.zone == null) {
      return notAssessedFlood({
        reason: UNAVAILABLE_REASONS.noApplicableEvidence,
        note:
          'Flood Map for Planning did not return Zone 2 or Zone 3 at these coordinates. That is not “no flood risk”, Flood Zone 1, or a safe rating. Surface water is not assessed. Coverage is the England rivers-and-sea planning map.',
        retrievedAt,
        identity: located,
      });
    }
    return assessedFlood({
      zone: result.zone,
      layersMatched: result.layersMatched,
      retrievedAt,
      identity: located,
      attributes: result.attributes,
    });
  } catch (error) {
    const aborted = error?.name === 'AbortError';
    const malformed = error?.message === 'malformed_provider_response';
    return notAssessedFlood({
      reason: malformed ? UNAVAILABLE_REASONS.malformed : UNAVAILABLE_REASONS.providerUnavailable,
      note: malformed
        ? 'The Environment Agency response could not be parsed. Missing flood is not low risk.'
        : aborted
          ? 'The Environment Agency flood request timed out. Missing flood is not low risk.'
          : 'The Environment Agency flood service could not be reached. Missing flood is not low risk.',
      retrievedAt: new Date().toISOString(),
      identity: floodIdentity(property, coords, contextIdentity),
    });
  }
}

module.exports = {
  getFloodEvidence,
  notAssessedFlood,
  unattachedFloodFact,
  assessedFlood,
  sanitizeFloodFact,
  floodIdentity,
  UNAVAILABLE_REASONS,
  LIMITATIONS,
  GEOGRAPHIC_RESOLUTION,
};
