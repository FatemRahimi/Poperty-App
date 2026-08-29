/**
 * Canonical Article 4 direction-area evidence for Property Intelligence.
 * Report/context only — geographic membership at the property coordinates.
 * Does not score, value, or adjust finance. Does not assess which
 * permitted-development rights are restricted. Unknown remains notAssessed,
 * not “not in an Article 4 area”.
 */

const { createProvenance } = require('../../utils/provenance');
const { propertyIntelligenceConfig } = require('../../config/propertyIntelligence.config');
const {
  DISPLAY_LIMIT,
  mapArticle4Area,
  classifyArticle4Area,
  compareArticle4Areas,
  queryArticle4DirectionAreas,
  readCoords,
  inUkBounds,
} = require('../providers/planningData/article4DirectionAreaClient');

const UNAVAILABLE_REASONS = Object.freeze({
  providerDisabled: 'provider_disabled',
  locationUnavailable: 'property_location_unavailable',
  unsupportedGeography: 'unsupported_geography',
  providerUnavailable: 'provider_unavailable',
  malformed: 'malformed_provider_response',
  noApplicableEvidence: 'no_applicable_evidence_returned',
  notAttached: 'not_attached',
});

const RESTRICTION_REASON = 'authoritative_restriction_schedule_not_integrated';
const RESTRICTION_NOTE =
  'The specific permitted-development rights affected have not been assessed.';

const SCORE_KEYS = Object.freeze([
  'score',
  'article4Score',
  'article4Restrictions',
  'restrictionScore',
  'permittedDevelopmentRights',
  'pdRights',
  'riskScore',
  'numericScore',
  'developmentScore',
  'heritageScore',
]);

const SOURCE = 'MHCLG_PlanningData_Article4DirectionArea';
const PROVIDER = 'MHCLG_PlanningData';
const AUTHORITY = 'MHCLG Planning Data (local planning authorities)';

const GEOGRAPHIC_RESOLUTION =
  'Property coordinates intersecting a published Article 4 Direction Area polygon. This is geographic membership at the point, not a statement of which permitted-development rights are restricted.';

const LIMITATIONS = Object.freeze([
  'This is the MHCLG Planning Data article-4-direction-area dataset for England, using local planning authority polygons.',
  'Coverage is incomplete and does not cover all of England. No area returned is not evidence that the property is outside an Article 4 area.',
  'Membership is point-in-polygon at the property coordinates, not a building footprint or title plan.',
  'A postcode is not used as Article 4 membership proof.',
  'Geographic membership is not a statement of which permitted-development rights are withdrawn, whether permission is required, or whether a direction is legally applicable to proposed works.',
  'Permitted-development-right codes, names, descriptions, and experimental catalogues are not converted into restriction conclusions.',
  'A missing end-date is not proof that the direction is currently or permanently legally effective.',
  'Article 4 evidence is not a risk score, valuation adjustment, mortgage assumption, or Personal Decision input, and is not legal advice.',
]);

function isoTimestamp(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function article4Identity(property = {}, coords = null, extras = {}) {
  return {
    listingId: extras.listingId ?? property.id ?? null,
    subjectId: extras.subjectId ?? property.subjectId ?? null,
    uprn: extras.uprn ?? property.uprn ?? null,
    postcode: extras.postcode ?? property.zip_code ?? property.postcode ?? null,
    latitude: coords?.latitude ?? null,
    longitude: coords?.longitude ?? null,
    coordinateSource: coords ? (extras.coordinateSource || 'property_record') : null,
    postcodeUsedAsArticle4Location: false,
  };
}

function publicRestrictions() {
  return {
    available: false,
    value: null,
    state: 'notAssessed',
    trust: 'notAssessed',
    assessed: false,
    reason: RESTRICTION_REASON,
    note: RESTRICTION_NOTE,
  };
}

function publicArea(row) {
  if (!row) return null;
  return {
    name: row.name || null,
    reference: row.reference || null,
    entityId: Number.isFinite(row.entityId) ? row.entityId : null,
    organisationEntity: Number.isFinite(row.organisationEntity) ? row.organisationEntity : null,
    directionReference: row.directionReference || null,
    nativeQuality: row.nativeQuality || null,
    startDate: row.startDate || null,
    endDate: row.endDate || null,
    entryDate: row.entryDate || null,
    scope: 'area_membership',
    matchMethod: row.matchMethod || 'coordinate_point_in_polygon',
    geographicMembershipOnly: true,
    restrictionsAssessed: false,
    legalEffectivenessAssessed: false,
    notAScore: true,
    notLegalAdvice: true,
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
  if (areas.length > 1) return `${areas.length} Article 4 direction areas`;
  return null;
}

function article4Base(extras = {}) {
  const retrievedAt = isoTimestamp(extras.retrievedAt);
  const evidenceAsOf = isoTimestamp(extras.evidenceAsOf) || retrievedAt;
  return {
    field: 'article4',
    available: false,
    value: null,
    state: 'notAssessed',
    trust: 'notAssessed',
    source: null,
    provider: extras.provider === undefined ? PROVIDER : extras.provider,
    sourceKind: 'authoritative_open_data',
    authority: AUTHORITY,
    scope: extras.scope || 'coordinate_point_in_polygon',
    method: extras.method || 'article_4_point_in_polygon',
    observedAt: null,
    retrievedAt,
    evidenceAsOf,
    unavailableReason: extras.unavailableReason ?? null,
    note: extras.note ?? null,
    areas: extras.areas || [],
    summary: extras.summary || { subjectCount: 0, displayedSubjectCount: 0 },
    restrictions: publicRestrictions(),
    geographicMembershipOnly: true,
    restrictionsAssessed: false,
    legalEffectivenessAssessed: false,
    missingEndDateDoesNotProveCurrentLegalEffect: true,
    geographicResolution:
      extras.geographicResolution === undefined ? GEOGRAPHIC_RESOLUTION : extras.geographicResolution,
    notAScore: true,
    notLegalAdvice: true,
    notAValuationAdjustment: true,
    notPersonalDecisionInput: true,
    notOutsideProof: true,
    scoringActivated: false,
    decisionClass: 'report_context_evidence',
    limitations: LIMITATIONS,
    identity: extras.identity || {},
    ...extras,
    field: 'article4',
    retrievedAt: isoTimestamp(extras.retrievedAt) ?? retrievedAt,
    evidenceAsOf: isoTimestamp(extras.evidenceAsOf) || isoTimestamp(extras.retrievedAt) || evidenceAsOf,
    restrictions: publicRestrictions(),
    geographicMembershipOnly: true,
    restrictionsAssessed: false,
    legalEffectivenessAssessed: false,
    missingEndDateDoesNotProveCurrentLegalEffect: true,
    scoringActivated: false,
    notAScore: true,
    notLegalAdvice: true,
    notAValuationAdjustment: true,
    notPersonalDecisionInput: true,
    notOutsideProof: true,
  };
}

function notAssessedArticle4({ reason, note, retrievedAt = null, identity = {}, provider } = {}) {
  const queried = reason !== UNAVAILABLE_REASONS.notAttached;
  const hasCoords = identity?.latitude != null && identity?.longitude != null;
  return {
    ...article4Base({
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
        method: 'article_4_point_in_polygon',
        retrievedAt: retrievedAt || undefined,
        providerEndpoint: queried ? '/entity.json?dataset=article-4-direction-area' : null,
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

function unattachedArticle4Fact(extras = {}) {
  return notAssessedArticle4({
    reason: UNAVAILABLE_REASONS.notAttached,
    note:
      extras.note
      || 'Article 4 evidence was not attached in this assembly. Missing Article 4 status is not “not in an Article 4 area”.',
    identity: extras.identity || {},
  });
}

function assessedArticle4({
  areas,
  retrievedAt,
  identity,
  providerCount,
}) {
  const displayed = areas.slice(0, DISPLAY_LIMIT);
  const publicAreas = displayed.map(publicArea).filter(Boolean);
  return article4Base({
    available: true,
    value: summaryValue(publicAreas),
    state: 'observed',
    trust: 'observed',
    source: SOURCE,
    provider: PROVIDER,
    scope: 'coordinate_point_in_polygon',
    method: 'article_4_point_in_polygon',
    retrievedAt,
    evidenceAsOf: retrievedAt,
    unavailableReason: null,
    note:
      'The property coordinates intersect a published Article 4 Direction Area. The specific permitted-development rights affected have not been assessed. A missing end-date is not proof that the direction is currently legally effective.',
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
      method: 'article_4_point_in_polygon',
      retrievedAt,
      providerEndpoint: '/entity.json?dataset=article-4-direction-area',
      notes: 'England Article 4 direction-area polygons. Coverage is incomplete. Point-in-polygon is geographic membership only and is not a restriction schedule or legal determination.',
    }),
  });
}

function sanitizeArticle4Fact(fact) {
  if (!fact || typeof fact !== 'object' || Array.isArray(fact)) {
    return unattachedArticle4Fact();
  }
  const cleaned = { ...fact };
  SCORE_KEYS.forEach((key) => {
    delete cleaned[key];
  });
  delete cleaned.permittedDevelopmentRights;
  delete cleaned.article4Restrictions;
  const areas = Array.isArray(cleaned.areas)
    ? cleaned.areas.map(publicArea).filter(Boolean)
    : [];
  const available = cleaned.available === true && areas.length > 0;
  return article4Base({
    ...cleaned,
    available,
    value: available ? cleaned.value || summaryValue(areas) : null,
    state: available ? (cleaned.state || 'observed') : 'notAssessed',
    trust: available ? (cleaned.trust || 'observed') : 'notAssessed',
    areas: available ? areas : [],
    scoringActivated: false,
    notAScore: true,
    notLegalAdvice: true,
    notAValuationAdjustment: true,
    notPersonalDecisionInput: true,
    geographicMembershipOnly: true,
    restrictionsAssessed: false,
    legalEffectivenessAssessed: false,
    notOutsideProof: true,
    decisionClass: 'report_context_evidence',
  });
}

async function getArticle4Evidence(property = {}, context = {}) {
  const contextIdentity = context.identity && typeof context.identity === 'object' ? context.identity : {};
  const coords = readCoords(property) || readCoords(contextIdentity);
  const identity = article4Identity(property, coords, contextIdentity);
  const cfg = propertyIntelligenceConfig.providers.article4;
  const query = typeof context.queryArticle4DirectionAreas === 'function'
    ? context.queryArticle4DirectionAreas
    : queryArticle4DirectionAreas;

  if (!cfg.enabled) {
    return notAssessedArticle4({
      reason: UNAVAILABLE_REASONS.providerDisabled,
      note: 'Article 4 lookup is disabled. Missing Article 4 status is not “not in an Article 4 area”.',
      identity,
    });
  }

  if (!coords) {
    return notAssessedArticle4({
      reason: UNAVAILABLE_REASONS.locationUnavailable,
      note: 'Property coordinates were not available, so Article 4 membership was not queried. A postcode is not used as Article 4 membership proof.',
      identity: article4Identity(property, null, contextIdentity),
    });
  }

  if (!inUkBounds(coords)) {
    return notAssessedArticle4({
      reason: UNAVAILABLE_REASONS.unsupportedGeography,
      note: 'Coordinates are outside the England coverage used for Article 4 queries. Missing Article 4 status is not “not in an Article 4 area”.',
      identity: article4Identity(property, coords, contextIdentity),
    });
  }

  try {
    const result = await query({ coords, skipCache: context.skipCache === true }, context);
    const retrievedAt = result.retrievedAt || new Date().toISOString();
    const located = article4Identity(property, coords, contextIdentity);
    if (!result.success) {
      const reason =
        result.reason === 'malformed_provider_response'
          ? UNAVAILABLE_REASONS.malformed
          : result.reason === 'property_location_unavailable'
            ? UNAVAILABLE_REASONS.locationUnavailable
            : UNAVAILABLE_REASONS.providerUnavailable;
      return notAssessedArticle4({
        reason,
        note:
          reason === UNAVAILABLE_REASONS.malformed
            ? 'The Article 4 response could not be parsed. Missing Article 4 status is not “not in an Article 4 area”.'
            : 'The Article 4 service was unavailable. Missing Article 4 status is not “not in an Article 4 area”.',
        retrievedAt,
        identity: located,
      });
    }

    const areas = (result.entities || [])
      .map(mapArticle4Area)
      .map((row) => classifyArticle4Area(row, coords, context.asOf || retrievedAt))
      .filter(Boolean)
      .sort(compareArticle4Areas);

    if (!areas.length) {
      return notAssessedArticle4({
        reason: UNAVAILABLE_REASONS.noApplicableEvidence,
        note:
          'This source returned no current Article 4 direction area intersecting these coordinates. That is not evidence that the property is outside an Article 4 area, and coverage is incomplete.',
        retrievedAt,
        identity: located,
      });
    }

    return assessedArticle4({
      areas,
      retrievedAt,
      identity: located,
      providerCount: result.providerCount,
    });
  } catch (error) {
    const aborted = error?.name === 'AbortError';
    const malformed = error?.message === 'malformed_provider_response';
    return notAssessedArticle4({
      reason: malformed ? UNAVAILABLE_REASONS.malformed : UNAVAILABLE_REASONS.providerUnavailable,
      note: malformed
        ? 'The Article 4 response could not be parsed. Missing Article 4 status is not “not in an Article 4 area”.'
        : aborted
          ? 'The Article 4 request timed out. Missing Article 4 status is not “not in an Article 4 area”.'
          : 'The Article 4 service could not be reached. Missing Article 4 status is not “not in an Article 4 area”.',
      retrievedAt: new Date().toISOString(),
      identity: article4Identity(property, coords, contextIdentity),
    });
  }
}

module.exports = {
  getArticle4Evidence,
  notAssessedArticle4,
  unattachedArticle4Fact,
  assessedArticle4,
  sanitizeArticle4Fact,
  article4Identity,
  UNAVAILABLE_REASONS,
  RESTRICTION_REASON,
  LIMITATIONS,
  GEOGRAPHIC_RESOLUTION,
  DISPLAY_LIMIT,
  SOURCE,
};
