/**
 * Canonical planning/development evidence for Property Intelligence.
 * Report/context only — does not score, value, or adjust finance.
 */

const { createProvenance } = require('../../utils/provenance');
const { propertyIntelligenceConfig } = require('../../config/propertyIntelligence.config');
const {
  DEFAULT_SEARCH_RADIUS_M,
  SUBJECT_SITE_M,
  QUERY_LIMIT,
  searchRadiusMetres,
  mapApplication,
  classifyApplication,
  compareApplications,
  looksLikeUprn,
  queryPlanningApplications,
  readCoords,
  inUkBounds,
} = require('../providers/planningData/planningApplicationClient');

const UNAVAILABLE_REASONS = Object.freeze({
  providerDisabled: 'provider_disabled',
  locationUnavailable: 'property_location_unavailable',
  unsupportedGeography: 'unsupported_geography',
  providerUnavailable: 'provider_unavailable',
  malformed: 'malformed_provider_response',
  noApplicationsReturned: 'no_applications_returned',
  notAttached: 'not_attached',
});

const SCORE_KEYS = Object.freeze([
  'score',
  'planningScore',
  'developmentScore',
  'impactScore',
  'materialityScore',
  'riskScore',
]);

const DISPLAY_LIMIT_SUBJECT = 5;
const DISPLAY_LIMIT_NEARBY = 5;

const LIMITATIONS = Object.freeze([
  'This is the MHCLG Planning Data planning-application dataset for England.',
  'Local planning authorities are not required to supply every application to this dataset, so coverage varies.',
  'No applications returned is not evidence that there is no planning activity.',
  'Nearby applications are not applications for this property.',
  'Planning status is not an investment quality rating and is not a valuation or Personal Decision input.',
  `Nearby search uses a fixed ${DEFAULT_SEARCH_RADIUS_M} metre radius around the property coordinates.`,
  `An application is treated as property-specific only when its UPRN matches or its recorded point is within ${SUBJECT_SITE_M} metres.`,
]);

function isoTimestamp(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function planningIdentity(property = {}, coords = null, extras = {}) {
  return {
    listingId: extras.listingId ?? property.id ?? null,
    subjectId: extras.subjectId ?? property.subjectId ?? null,
    uprn: extras.uprn ?? property.uprn ?? null,
    postcode: extras.postcode ?? property.zip_code ?? property.postcode ?? null,
    latitude: coords?.latitude ?? null,
    longitude: coords?.longitude ?? null,
    coordinateSource: coords ? (extras.coordinateSource || 'property_record') : null,
    postcodeUsedAsPlanningLocation: false,
  };
}

function publicApplication(row) {
  if (!row) return null;
  return {
    reference: row.reference || null,
    entityId: Number.isFinite(row.entityId) ? row.entityId : null,
    description: row.description || null,
    address: row.address || null,
    nativeType: row.nativeType || null,
    category: row.nativeType || null,
    nativeStatus: row.nativeStatus || null,
    nativeDecision: row.nativeDecision || null,
    nativeDecisionType: row.nativeDecisionType || null,
    submittedDate: row.submittedDate || null,
    decisionDate: row.decisionDate || null,
    providerEntryDate: row.providerEntryDate || null,
    distanceMetres: row.distanceMetres,
    scope: row.scope,
    matchMethod: row.matchMethod || null,
    organisationEntity: Number.isFinite(row.organisationEntity) ? row.organisationEntity : null,
    documentationUrl: row.documentationUrl || null,
    notAScore: true,
  };
}

function planningBase(extras = {}) {
  const retrievedAt = isoTimestamp(extras.retrievedAt);
  const evidenceAsOf = isoTimestamp(extras.evidenceAsOf) || retrievedAt;
  const radiusMetres = extras.searchRadiusMetres ?? searchRadiusMetres();
  return {
    field: 'planning',
    available: false,
    value: null,
    state: 'notAssessed',
    trust: 'notAssessed',
    source: null,
    provider: extras.provider === undefined ? 'MHCLG_PlanningData' : extras.provider,
    sourceKind: 'authoritative_open_data',
    authority: 'MHCLG Planning Data',
    scope: extras.scope || 'search_radius',
    method: extras.method || 'planning_application_geometry_buffer',
    observedAt: null,
    retrievedAt,
    evidenceAsOf,
    unavailableReason: extras.unavailableReason ?? null,
    note: extras.note ?? null,
    searchRadiusMetres: radiusMetres,
    subjectSiteMetres: SUBJECT_SITE_M,
    subjectApplications: extras.subjectApplications || [],
    nearbyApplications: extras.nearbyApplications || [],
    summary: extras.summary || {
      subjectCount: 0,
      nearbyCount: 0,
      displayedSubjectCount: 0,
      displayedNearbyCount: 0,
      searchRadiusMetres: radiusMetres,
    },
    geographicResolution:
      extras.geographicResolution === undefined
        ? `Applications intersecting a ${radiusMetres} metre coordinate buffer. Not a full local-authority history.`
        : extras.geographicResolution,
    notAScore: true,
    notAValuationAdjustment: true,
    notPersonalDecisionInput: true,
    notADevelopmentOpportunityScore: true,
    scoringActivated: false,
    decisionClass: 'report_context_evidence',
    limitations: LIMITATIONS,
    identity: extras.identity || {},
    ...extras,
    field: 'planning',
    retrievedAt: isoTimestamp(extras.retrievedAt) ?? retrievedAt,
    evidenceAsOf: isoTimestamp(extras.evidenceAsOf) || isoTimestamp(extras.retrievedAt) || evidenceAsOf,
    scoringActivated: false,
    notAScore: true,
    notAValuationAdjustment: true,
    notPersonalDecisionInput: true,
    notADevelopmentOpportunityScore: true,
  };
}

function notAssessedPlanning({ reason, note, retrievedAt = null, identity = {}, provider } = {}) {
  const queried = reason !== UNAVAILABLE_REASONS.notAttached;
  return {
    ...planningBase({
      provider: provider === undefined ? (queried ? 'MHCLG_PlanningData' : null) : provider,
      source: queried ? 'MHCLG_PlanningData' : null,
      retrievedAt,
      evidenceAsOf: retrievedAt,
      unavailableReason: reason,
      note,
      identity,
      geographicResolution: identity?.latitude != null ? undefined : null,
      provenance: createProvenance({
        source: queried ? 'MHCLG_PlanningData' : null,
        method: 'planning_application_geometry_buffer',
        retrievedAt: retrievedAt || undefined,
        providerEndpoint: queried ? '/entity.json?dataset=planning-application' : null,
        notes: note,
      }),
    }),
    available: false,
    value: null,
    state: 'notAssessed',
    trust: 'notAssessed',
    subjectApplications: [],
    nearbyApplications: [],
  };
}

function unattachedPlanningFact(extras = {}) {
  return notAssessedPlanning({
    reason: UNAVAILABLE_REASONS.notAttached,
    note:
      extras.note
      || 'Planning evidence was not attached in this assembly. Missing planning is not “no planning activity”.',
    identity: extras.identity || {},
  });
}

function summaryValue({ subjectCount, nearbyCount, radiusMetres }) {
  if (subjectCount > 0 && nearbyCount > 0) {
    return `${subjectCount} at this location, ${nearbyCount} nearby within ${radiusMetres}m`;
  }
  if (subjectCount > 0) {
    return subjectCount === 1
      ? '1 application at this location'
      : `${subjectCount} applications at this location`;
  }
  if (nearbyCount > 0) {
    return nearbyCount === 1
      ? `1 nearby application within ${radiusMetres}m`
      : `${nearbyCount} nearby applications within ${radiusMetres}m`;
  }
  return 'No applications returned by this source';
}

function assessedPlanning({
  subjectApplications,
  nearbyApplications,
  retrievedAt,
  identity,
  radiusMetres,
  queryKind,
  providerCount,
  capped,
}) {
  const subjectCount = subjectApplications.length;
  const nearbyCount = nearbyApplications.length;
  const displayedSubject = subjectApplications.slice(0, DISPLAY_LIMIT_SUBJECT);
  const displayedNearby = nearbyApplications.slice(0, DISPLAY_LIMIT_NEARBY);
  const hasSubject = subjectCount > 0;
  const empty = subjectCount === 0 && nearbyCount === 0;
  return planningBase({
    available: true,
    value: summaryValue({ subjectCount, nearbyCount, radiusMetres }),
    state: 'observed',
    trust: hasSubject ? 'observed' : nearbyCount > 0 ? 'areaContext' : 'observed',
    source: 'MHCLG_PlanningData',
    provider: 'MHCLG_PlanningData',
    scope: hasSubject && nearbyCount > 0 ? 'mixed' : hasSubject ? 'property' : nearbyCount > 0 ? 'area' : 'search_radius',
    method: queryKind === 'uprn' ? 'planning_application_uprn_query' : 'planning_application_geometry_buffer',
    retrievedAt,
    evidenceAsOf: retrievedAt,
    unavailableReason: empty ? UNAVAILABLE_REASONS.noApplicationsReturned : null,
    note: empty
      ? 'This source returned no planning applications for the search. That is not evidence that there is no planning activity, and it is not a valuation or Personal Decision input.'
      : hasSubject
        ? 'Applications listed under this property are spatially or UPRN-linked. Nearby applications are area context only.'
        : 'These applications are nearby area context, not applications for this property.',
    searchRadiusMetres: radiusMetres,
    subjectApplications: displayedSubject.map(publicApplication),
    nearbyApplications: displayedNearby.map(publicApplication),
    summary: {
      subjectCount,
      nearbyCount,
      displayedSubjectCount: displayedSubject.length,
      displayedNearbyCount: displayedNearby.length,
      searchRadiusMetres: radiusMetres,
      providerCount: providerCount ?? null,
      resultsCapped: Boolean(capped),
    },
    identity,
    provenance: createProvenance({
      source: 'MHCLG_PlanningData',
      method: queryKind === 'uprn' ? 'planning_application_uprn_query' : 'planning_application_geometry_buffer',
      retrievedAt,
      providerEndpoint: '/entity.json?dataset=planning-application',
      notes: 'England planning-application dataset. Coverage varies by local planning authority.',
    }),
  });
}

function sanitizePlanningFact(fact) {
  if (!fact || typeof fact !== 'object' || Array.isArray(fact)) {
    return unattachedPlanningFact();
  }
  const cleaned = { ...fact };
  SCORE_KEYS.forEach((key) => {
    delete cleaned[key];
  });
  const subjectApplications = Array.isArray(cleaned.subjectApplications)
    ? cleaned.subjectApplications.map(publicApplication).filter(Boolean)
    : [];
  const nearbyApplications = Array.isArray(cleaned.nearbyApplications)
    ? cleaned.nearbyApplications.map(publicApplication).filter(Boolean)
    : [];
  const available = cleaned.available === true;
  return planningBase({
    ...cleaned,
    available,
    value: available ? cleaned.value || null : null,
    state: available ? (cleaned.state || 'observed') : 'notAssessed',
    trust: available ? (cleaned.trust || 'observed') : 'notAssessed',
    subjectApplications: available ? subjectApplications : [],
    nearbyApplications: available ? nearbyApplications : [],
    scoringActivated: false,
    notAScore: true,
    notAValuationAdjustment: true,
    notPersonalDecisionInput: true,
    notADevelopmentOpportunityScore: true,
    decisionClass: 'report_context_evidence',
  });
}

async function getPlanningEvidence(property = {}, context = {}) {
  const contextIdentity = context.identity && typeof context.identity === 'object' ? context.identity : {};
  const coords = readCoords(property) || readCoords(contextIdentity);
  const identity = planningIdentity(property, coords, contextIdentity);
  const cfg = propertyIntelligenceConfig.providers.planningData;
  const uprn = looksLikeUprn(identity.uprn) ? String(identity.uprn) : null;
  const query = typeof context.queryPlanningApplications === 'function'
    ? context.queryPlanningApplications
    : queryPlanningApplications;

  if (!cfg.enabled) {
    return notAssessedPlanning({
      reason: UNAVAILABLE_REASONS.providerDisabled,
      note: 'MHCLG Planning Data lookup is disabled. Missing planning is not “no planning activity”.',
      identity,
    });
  }

  if (!coords && !uprn) {
    return notAssessedPlanning({
      reason: UNAVAILABLE_REASONS.locationUnavailable,
      note: 'Property coordinates and UPRN were not available, so planning applications were not queried. A postcode is not used as a planning location.',
      identity: planningIdentity(property, null, contextIdentity),
    });
  }

  if (coords && !inUkBounds(coords)) {
    return notAssessedPlanning({
      reason: UNAVAILABLE_REASONS.unsupportedGeography,
      note: 'Coordinates are outside the England coverage used for MHCLG Planning Data queries.',
      identity: planningIdentity(property, coords, contextIdentity),
    });
  }

  try {
    const result = await query({ coords, uprn, skipCache: context.skipCache === true }, context);
    const retrievedAt = result.retrievedAt || new Date().toISOString();
    const located = planningIdentity(property, coords, contextIdentity);
    if (!result.success) {
      const reason =
        result.reason === 'malformed_provider_response'
          ? UNAVAILABLE_REASONS.malformed
          : result.reason === 'property_location_unavailable'
            ? UNAVAILABLE_REASONS.locationUnavailable
            : UNAVAILABLE_REASONS.providerUnavailable;
      return notAssessedPlanning({
        reason,
        note:
          reason === UNAVAILABLE_REASONS.malformed
            ? 'The Planning Data response could not be parsed. Missing planning is not “no planning activity”.'
            : 'The Planning Data service was unavailable. Missing planning is not “no planning activity”.',
        retrievedAt,
        identity: located,
      });
    }

    const radiusMetres = result.radiusMetres || searchRadiusMetres();
    const classified = (result.entities || [])
      .map(mapApplication)
      .map((row) => classifyApplication(row, coords, uprn, radiusMetres, result.queryKind))
      .filter(Boolean)
      .sort(compareApplications);

    const subjectApplications = classified.filter((row) => row.scope === 'property');
    const nearbyApplications = coords
      ? classified.filter((row) => row.scope === 'nearby')
      : [];

    return assessedPlanning({
      subjectApplications,
      nearbyApplications,
      retrievedAt,
      identity: located,
      radiusMetres,
      queryKind: result.queryKind,
      providerCount: result.providerCount,
      capped: Number(result.providerCount) > QUERY_LIMIT || (result.entities || []).length >= QUERY_LIMIT,
    });
  } catch (error) {
    const aborted = error?.name === 'AbortError';
    const malformed = error?.message === 'malformed_provider_response';
    return notAssessedPlanning({
      reason: malformed ? UNAVAILABLE_REASONS.malformed : UNAVAILABLE_REASONS.providerUnavailable,
      note: malformed
        ? 'The Planning Data response could not be parsed. Missing planning is not “no planning activity”.'
        : aborted
          ? 'The Planning Data request timed out. Missing planning is not “no planning activity”.'
          : 'The Planning Data service could not be reached. Missing planning is not “no planning activity”.',
      retrievedAt: new Date().toISOString(),
      identity: planningIdentity(property, coords, contextIdentity),
    });
  }
}

module.exports = {
  getPlanningEvidence,
  notAssessedPlanning,
  unattachedPlanningFact,
  assessedPlanning,
  sanitizePlanningFact,
  UNAVAILABLE_REASONS,
  LIMITATIONS,
  DISPLAY_LIMIT_SUBJECT,
  DISPLAY_LIMIT_NEARBY,
};
