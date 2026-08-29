/**
 * Canonical listed-building evidence for Property Intelligence.
 * Report/context only — does not score, value, or adjust finance.
 * Native Historic England grades are preserved. Nearby listings are not
 * property-level proof. Unknown remains notAssessed, not “not listed”.
 */

const { createProvenance } = require('../../utils/provenance');
const { propertyIntelligenceConfig } = require('../../config/propertyIntelligence.config');
const {
  DEFAULT_SEARCH_RADIUS_M,
  DISPLAY_LIMIT,
  searchRadiusMetres,
  mapListedBuilding,
  classifyListedBuilding,
  compareListedBuildings,
  nativeGrade,
  queryListedBuildings,
  readCoords,
  inUkBounds,
} = require('../providers/planningData/listedBuildingClient');

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
  'heritageScore',
  'listedBuildingScore',
  'listedScore',
  'heritageRiskScore',
  'riskScore',
  'numericScore',
  'gradeScore',
]);

const SOURCE = 'MHCLG_PlanningData_ListedBuilding';
const PROVIDER = 'MHCLG_PlanningData';
const AUTHORITY = 'Historic England (NHLE via MHCLG Planning Data)';

const GEOGRAPHIC_RESOLUTION =
  'Historic England listed-building point intersecting a same-site coordinate buffer. This is not a building footprint, title plan, or curtilage.';

const LIMITATIONS = Object.freeze([
  'This is the MHCLG Planning Data listed-building dataset for England, using Historic England National Heritage List for England (NHLE) list-entry numbers and native grades.',
  'The source records a point within the listed building, not the listing extent or curtilage.',
  'No listing returned at these coordinates is not evidence that the property is not listed.',
  'A postcode is not used as property-level proof of listing.',
  'Nearby listed buildings are not listings of this property.',
  'Grade is the native Historic England wording (I, II*, II). It is not a heritage, risk, or value score.',
  'Listed-building evidence is not a valuation adjustment and is not a Personal Decision input.',
  'Coverage is England (NHLE). Wales, Scotland and Northern Ireland listing regimes are not assessed.',
]);

function isoTimestamp(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function listedBuildingIdentity(property = {}, coords = null, extras = {}) {
  return {
    listingId: extras.listingId ?? property.id ?? null,
    subjectId: extras.subjectId ?? property.subjectId ?? null,
    uprn: extras.uprn ?? property.uprn ?? null,
    postcode: extras.postcode ?? property.zip_code ?? property.postcode ?? null,
    latitude: coords?.latitude ?? null,
    longitude: coords?.longitude ?? null,
    coordinateSource: coords ? (extras.coordinateSource || 'property_record') : null,
    postcodeUsedAsListedBuildingLocation: false,
  };
}

function publicListing(row) {
  if (!row) return null;
  const grade = nativeGrade(row.nativeGrade) || nativeGrade(row.grade) || null;
  return {
    listEntryNumber: row.listEntryNumber || null,
    entityId: Number.isFinite(row.entityId) ? row.entityId : null,
    name: row.name || null,
    nativeGrade: grade,
    listedDate: row.listedDate || null,
    documentationUrl: row.documentationUrl || null,
    distanceMetres: row.distanceMetres,
    scope: 'property',
    matchMethod: row.matchMethod || 'same_site_coordinates',
    notAScore: true,
    notAValuationAdjustment: true,
    notPersonalDecisionInput: true,
  };
}

function displayGrade(grade) {
  return grade ? `Grade ${grade}` : null;
}

function summaryValue(listings) {
  const grades = listings
    .map((row) => displayGrade(row.nativeGrade))
    .filter(Boolean);
  const unique = [...new Set(grades)];
  if (listings.length === 1) {
    return unique[0] || 'Listed building';
  }
  if (unique.length === 1) {
    return `${listings.length} listed buildings (${unique[0]})`;
  }
  if (unique.length) {
    return `${listings.length} listed buildings (${unique.join(', ')})`;
  }
  return `${listings.length} listed buildings`;
}

function listedBuildingBase(extras = {}) {
  const retrievedAt = isoTimestamp(extras.retrievedAt);
  const evidenceAsOf = isoTimestamp(extras.evidenceAsOf) || retrievedAt;
  const radiusMetres = extras.searchRadiusMetres ?? searchRadiusMetres();
  return {
    field: 'listedBuilding',
    available: false,
    value: null,
    state: 'notAssessed',
    trust: 'notAssessed',
    source: null,
    provider: extras.provider === undefined ? PROVIDER : extras.provider,
    sourceKind: 'authoritative_open_data',
    authority: AUTHORITY,
    scope: extras.scope || 'property',
    method: extras.method || 'listed_building_same_site_geometry_buffer',
    observedAt: null,
    retrievedAt,
    evidenceAsOf,
    unavailableReason: extras.unavailableReason ?? null,
    note: extras.note ?? null,
    searchRadiusMetres: radiusMetres,
    nativeGrade: extras.nativeGrade ?? null,
    listings: extras.listings || [],
    summary: extras.summary || {
      subjectCount: 0,
      displayedSubjectCount: 0,
      searchRadiusMetres: radiusMetres,
    },
    geographicResolution:
      extras.geographicResolution === undefined ? GEOGRAPHIC_RESOLUTION : extras.geographicResolution,
    notAScore: true,
    notAValuationAdjustment: true,
    notPersonalDecisionInput: true,
    notListedAbsenceProof: true,
    scoringActivated: false,
    decisionClass: 'report_context_evidence',
    limitations: LIMITATIONS,
    identity: extras.identity || {},
    ...extras,
    field: 'listedBuilding',
    retrievedAt: isoTimestamp(extras.retrievedAt) ?? retrievedAt,
    evidenceAsOf: isoTimestamp(extras.evidenceAsOf) || isoTimestamp(extras.retrievedAt) || evidenceAsOf,
    scoringActivated: false,
    notAScore: true,
    notAValuationAdjustment: true,
    notPersonalDecisionInput: true,
    notListedAbsenceProof: true,
  };
}

function notAssessedListedBuilding({ reason, note, retrievedAt = null, identity = {}, provider } = {}) {
  const queried = reason !== UNAVAILABLE_REASONS.notAttached;
  const hasCoords = identity?.latitude != null && identity?.longitude != null;
  return {
    ...listedBuildingBase({
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
        method: 'listed_building_same_site_geometry_buffer',
        retrievedAt: retrievedAt || undefined,
        providerEndpoint: queried ? '/entity.json?dataset=listed-building' : null,
        notes: note,
      }),
    }),
    available: false,
    value: null,
    state: 'notAssessed',
    trust: 'notAssessed',
    nativeGrade: null,
    listings: [],
    geographicResolution: hasCoords ? GEOGRAPHIC_RESOLUTION : null,
  };
}

function unattachedListedBuildingFact(extras = {}) {
  return notAssessedListedBuilding({
    reason: UNAVAILABLE_REASONS.notAttached,
    note:
      extras.note
      || 'Listed-building evidence was not attached in this assembly. Missing listed-building status is not “not listed”.',
    identity: extras.identity || {},
  });
}

function assessedListedBuilding({
  listings,
  retrievedAt,
  identity,
  radiusMetres,
  providerCount,
  capped,
}) {
  const displayed = listings.slice(0, DISPLAY_LIMIT);
  const publicListings = displayed.map(publicListing).filter(Boolean);
  return listedBuildingBase({
    available: true,
    value: summaryValue(publicListings),
    state: 'observed',
    trust: 'observed',
    source: SOURCE,
    provider: PROVIDER,
    scope: 'property',
    method: 'listed_building_same_site_geometry_buffer',
    retrievedAt,
    evidenceAsOf: retrievedAt,
    unavailableReason: null,
    note:
      'This is Historic England listed-building evidence at the property coordinates. Grade is the native listing grade, not a heritage score or valuation adjustment.',
    searchRadiusMetres: radiusMetres,
    nativeGrade: publicListings[0]?.nativeGrade || null,
    listings: publicListings,
    summary: {
      subjectCount: listings.length,
      displayedSubjectCount: publicListings.length,
      searchRadiusMetres: radiusMetres,
      providerCount: providerCount ?? null,
      resultsCapped: Boolean(capped),
    },
    identity,
    geographicResolution: GEOGRAPHIC_RESOLUTION,
    provenance: createProvenance({
      source: SOURCE,
      method: 'listed_building_same_site_geometry_buffer',
      retrievedAt,
      providerEndpoint: '/entity.json?dataset=listed-building',
      notes: 'England listed-building dataset from Historic England NHLE. A point match is not a curtilage determination.',
    }),
  });
}

function sanitizeListedBuildingFact(fact) {
  if (!fact || typeof fact !== 'object' || Array.isArray(fact)) {
    return unattachedListedBuildingFact();
  }
  const cleaned = { ...fact };
  SCORE_KEYS.forEach((key) => {
    delete cleaned[key];
  });
  const listings = Array.isArray(cleaned.listings)
    ? cleaned.listings.map(publicListing).filter(Boolean)
    : [];
  const available = cleaned.available === true && listings.length > 0;
  return listedBuildingBase({
    ...cleaned,
    available,
    value: available ? cleaned.value || summaryValue(listings) : null,
    state: available ? (cleaned.state || 'observed') : 'notAssessed',
    trust: available ? (cleaned.trust || 'observed') : 'notAssessed',
    nativeGrade: available ? nativeGrade(cleaned.nativeGrade) || listings[0]?.nativeGrade || null : null,
    listings: available ? listings : [],
    scoringActivated: false,
    notAScore: true,
    notAValuationAdjustment: true,
    notPersonalDecisionInput: true,
    notListedAbsenceProof: true,
    decisionClass: 'report_context_evidence',
  });
}

async function getListedBuildingEvidence(property = {}, context = {}) {
  const contextIdentity = context.identity && typeof context.identity === 'object' ? context.identity : {};
  const coords = readCoords(property) || readCoords(contextIdentity);
  const identity = listedBuildingIdentity(property, coords, contextIdentity);
  const cfg = propertyIntelligenceConfig.providers.listedBuilding;
  const query = typeof context.queryListedBuildings === 'function'
    ? context.queryListedBuildings
    : queryListedBuildings;

  if (!cfg.enabled) {
    return notAssessedListedBuilding({
      reason: UNAVAILABLE_REASONS.providerDisabled,
      note: 'Listed-building lookup is disabled. Missing listed-building status is not “not listed”.',
      identity,
    });
  }

  if (!coords) {
    return notAssessedListedBuilding({
      reason: UNAVAILABLE_REASONS.locationUnavailable,
      note: 'Property coordinates were not available, so listed-building status was not queried. A postcode is not used as property-level proof of listing.',
      identity: listedBuildingIdentity(property, null, contextIdentity),
    });
  }

  if (!inUkBounds(coords)) {
    return notAssessedListedBuilding({
      reason: UNAVAILABLE_REASONS.unsupportedGeography,
      note: 'Coordinates are outside the England coverage used for Historic England listed-building queries. Missing listed-building status is not “not listed”.',
      identity: listedBuildingIdentity(property, coords, contextIdentity),
    });
  }

  try {
    const result = await query({ coords, skipCache: context.skipCache === true }, context);
    const retrievedAt = result.retrievedAt || new Date().toISOString();
    const located = listedBuildingIdentity(property, coords, contextIdentity);
    if (!result.success) {
      const reason =
        result.reason === 'malformed_provider_response'
          ? UNAVAILABLE_REASONS.malformed
          : result.reason === 'property_location_unavailable'
            ? UNAVAILABLE_REASONS.locationUnavailable
            : UNAVAILABLE_REASONS.providerUnavailable;
      return notAssessedListedBuilding({
        reason,
        note:
          reason === UNAVAILABLE_REASONS.malformed
            ? 'The listed-building response could not be parsed. Missing listed-building status is not “not listed”.'
            : 'The listed-building service was unavailable. Missing listed-building status is not “not listed”.',
        retrievedAt,
        identity: located,
      });
    }

    const radiusMetres = result.radiusMetres || searchRadiusMetres();
    const listings = (result.entities || [])
      .map(mapListedBuilding)
      .map((row) => classifyListedBuilding(row, coords, radiusMetres))
      .filter(Boolean)
      .sort(compareListedBuildings);

    if (!listings.length) {
      return notAssessedListedBuilding({
        reason: UNAVAILABLE_REASONS.noApplicableEvidence,
        note:
          'This source returned no current listed building at these coordinates. That is not evidence that the property is not listed, and a nearby listing is not this property.',
        retrievedAt,
        identity: located,
      });
    }

    return assessedListedBuilding({
      listings,
      retrievedAt,
      identity: located,
      radiusMetres,
      providerCount: result.providerCount,
      capped: Number(result.providerCount) > 50 || (result.entities || []).length >= 50,
    });
  } catch (error) {
    const aborted = error?.name === 'AbortError';
    const malformed = error?.message === 'malformed_provider_response';
    return notAssessedListedBuilding({
      reason: malformed ? UNAVAILABLE_REASONS.malformed : UNAVAILABLE_REASONS.providerUnavailable,
      note: malformed
        ? 'The listed-building response could not be parsed. Missing listed-building status is not “not listed”.'
        : aborted
          ? 'The listed-building request timed out. Missing listed-building status is not “not listed”.'
          : 'The listed-building service could not be reached. Missing listed-building status is not “not listed”.',
      retrievedAt: new Date().toISOString(),
      identity: listedBuildingIdentity(property, coords, contextIdentity),
    });
  }
}

module.exports = {
  getListedBuildingEvidence,
  notAssessedListedBuilding,
  unattachedListedBuildingFact,
  assessedListedBuilding,
  sanitizeListedBuildingFact,
  listedBuildingIdentity,
  UNAVAILABLE_REASONS,
  LIMITATIONS,
  GEOGRAPHIC_RESOLUTION,
  DISPLAY_LIMIT,
  SOURCE,
  DEFAULT_SEARCH_RADIUS_M,
};
