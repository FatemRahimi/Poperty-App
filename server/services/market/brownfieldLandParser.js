/**
 * Deterministic parser for MHCLG Planning Data brownfield-land entities.
 * Official register/site observations only. No construction or delivery inference.
 */

const crypto = require('crypto');
const {
  BROWNFIELD_SOURCE,
  BROWNFIELD_DATASET,
  BROWNFIELD_DATASET_LABEL,
  BROWNFIELD_SOURCE_PRODUCT,
  BROWNFIELD_RELEASE_LABEL,
  BROWNFIELD_GEOGRAPHIC_SCOPE,
  BROWNFIELD_GEOGRAPHY_TYPE,
  BROWNFIELD_SOURCE_URL,
  BROWNFIELD_API_ENTITY_URL,
  BROWNFIELD_ATTRIBUTION,
  BROWNFIELD_DWELLING_NATURE,
  BROWNFIELD_PROVENANCE,
  BROWNFIELD_LIMITATIONS,
  MARKET_RECORD_KIND,
} = require('../../architecture/officialBrownfieldLandDataset');

function blank(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function presentDate(value) {
  const text = blank(value);
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}/.test(text)) return null;
  return text.slice(0, 10);
}

function parseEntityId(raw) {
  if (raw === undefined || raw === null || raw === '') {
    return { ok: false, reason: 'missing_source_entity_id' };
  }
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || !Number.isInteger(raw) || raw <= 0) {
      return { ok: false, reason: 'invalid_source_entity_id' };
    }
    return { ok: true, value: raw };
  }
  const text = String(raw).trim();
  if (!/^\d+$/.test(text)) return { ok: false, reason: 'invalid_source_entity_id' };
  const number = Number(text);
  if (!Number.isSafeInteger(number) || number <= 0) {
    return { ok: false, reason: 'invalid_source_entity_id' };
  }
  return { ok: true, value: number };
}

function parseOptionalEntityId(raw) {
  if (raw === undefined || raw === null || raw === '') {
    return { ok: true, value: null };
  }
  return parseEntityId(raw);
}

/**
 * Integer dwelling capacity. Missing → null. Explicit 0 → 0.
 * Rejects decimals, negatives, and non-numeric text (never coerced to 0).
 */
function parseDwellingCount(raw, fieldName) {
  if (raw === undefined || raw === null || raw === '') {
    return { ok: true, value: null, present: false };
  }
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return { ok: false, reason: `non_numeric_${fieldName}` };
    if (!Number.isInteger(raw)) return { ok: false, reason: `non_integer_${fieldName}` };
    if (raw < 0) return { ok: false, reason: `negative_${fieldName}` };
    return { ok: true, value: raw, present: true };
  }
  const text = String(raw).trim();
  if (!text) return { ok: true, value: null, present: false };
  if (/^-?\d+\.\d+$/.test(text)) return { ok: false, reason: `non_integer_${fieldName}` };
  if (!/^-?\d+$/.test(text)) return { ok: false, reason: `non_numeric_${fieldName}` };
  const number = Number(text);
  if (!Number.isFinite(number) || !Number.isInteger(number)) {
    return { ok: false, reason: `non_integer_${fieldName}` };
  }
  if (number < 0) return { ok: false, reason: `negative_${fieldName}` };
  return { ok: true, value: number, present: true };
}

function parseWktPoint(value) {
  const text = blank(value);
  if (!text) return { pointWkt: null, latitude: null, longitude: null };
  const match = text.match(/^POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)$/i);
  if (!match) {
    return { pointWkt: text, latitude: null, longitude: null };
  }
  const longitude = Number(match[1]);
  const latitude = Number(match[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { pointWkt: text, latitude: null, longitude: null };
  }
  return { pointWkt: text, latitude, longitude };
}

function contentFingerprint(row) {
  return crypto.createHash('sha256').update(JSON.stringify({
    sourceEntityId: row.sourceEntityId,
    organisationEntity: row.organisationEntity,
    reference: row.reference,
    siteAddress: row.siteAddress,
    name: row.name,
    ownershipStatus: row.ownershipStatus,
    planningPermissionStatus: row.planningPermissionStatus,
    planningPermissionType: row.planningPermissionType,
    planningPermissionDate: row.planningPermissionDate,
    minimumNetDwellings: row.minimumNetDwellings,
    maximumNetDwellings: row.maximumNetDwellings,
    deliverable: row.deliverable,
    hectares: row.hectares,
    pointWkt: row.pointWkt,
    geometryWkt: row.geometryWkt,
    entryDate: row.entryDate,
    startDate: row.startDate,
    endDate: row.endDate,
    notes: row.notes,
    releaseLabel: row.releaseLabel,
  })).digest('hex');
}

function entitySourceUrl(sourceEntityId) {
  if (sourceEntityId == null) return BROWNFIELD_SOURCE_URL;
  return `https://www.planning.data.gov.uk/entity/${sourceEntityId}`;
}

function parseBrownfieldEntity(raw, {
  releaseLabel = BROWNFIELD_RELEASE_LABEL,
  retrievedAt = null,
  ingestedAt = null,
} = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: 'invalid_entity_object' };
  }
  if (raw.dataset != null && blank(raw.dataset) !== BROWNFIELD_DATASET) {
    return { ok: false, reason: 'unexpected_dataset' };
  }

  const entityId = parseEntityId(raw.entity);
  if (!entityId.ok) return { ok: false, reason: entityId.reason };

  const organisation = parseOptionalEntityId(raw['organisation-entity'] ?? raw.organisationEntity);
  if (!organisation.ok) return { ok: false, reason: 'invalid_organisation_entity' };

  const minDwellings = parseDwellingCount(
    raw['minimum-net-dwellings'] ?? raw.minimumNetDwellings,
    'minimum_net_dwellings'
  );
  if (!minDwellings.ok) return { ok: false, reason: minDwellings.reason };

  const maxDwellings = parseDwellingCount(
    raw['maximum-net-dwellings'] ?? raw.maximumNetDwellings,
    'maximum_net_dwellings'
  );
  if (!maxDwellings.ok) return { ok: false, reason: maxDwellings.reason };

  const point = parseWktPoint(raw.point);
  const geometryWkt = blank(raw.geometry);

  const release = blank(releaseLabel) || BROWNFIELD_RELEASE_LABEL;
  const row = {
    source: BROWNFIELD_SOURCE,
    dataset: BROWNFIELD_DATASET,
    datasetLabel: BROWNFIELD_DATASET_LABEL,
    sourceProduct: BROWNFIELD_SOURCE_PRODUCT,
    recordKind: MARKET_RECORD_KIND.OFFICIAL_OBSERVATION,
    geographyType: BROWNFIELD_GEOGRAPHY_TYPE,
    geographicScope: BROWNFIELD_GEOGRAPHIC_SCOPE,
    sourceEntityId: entityId.value,
    organisationEntity: organisation.value,
    reference: blank(raw.reference),
    name: blank(raw.name),
    siteAddress: blank(raw['site-address'] ?? raw.siteAddress ?? raw['address-text']),
    ownershipStatus: blank(raw['ownership-status'] ?? raw.ownershipStatus),
    planningPermissionStatus: blank(raw['planning-permission-status'] ?? raw.planningPermissionStatus),
    planningPermissionType: blank(raw['planning-permission-type'] ?? raw.planningPermissionType),
    planningPermissionDate: presentDate(raw['planning-permission-date'] ?? raw.planningPermissionDate),
    minimumNetDwellings: minDwellings.value,
    maximumNetDwellings: maxDwellings.value,
    dwellingNature: BROWNFIELD_DWELLING_NATURE,
    deliverable: blank(raw.deliverable),
    hectares: blank(raw.hectares),
    pointWkt: point.pointWkt,
    latitude: point.latitude,
    longitude: point.longitude,
    geometryWkt: geometryWkt || null,
    coordinateReferenceSystem: point.pointWkt || geometryWkt ? 'EPSG:4326' : null,
    entryDate: presentDate(raw['entry-date'] ?? raw.entryDate),
    startDate: presentDate(raw['start-date'] ?? raw.startDate),
    endDate: presentDate(raw['end-date'] ?? raw.endDate),
    notes: blank(raw.notes),
    sitePlanUrl: blank(raw['site-plan-url'] ?? raw.sitePlanUrl),
    releaseLabel: release,
    retrievedAt: retrievedAt || null,
    ingestedAt: ingestedAt || null,
    provenance: {
      ...BROWNFIELD_PROVENANCE,
      sourceEntityId: entityId.value,
      organisationEntity: organisation.value,
      siteReference: blank(raw.reference),
      sourceUrl: entitySourceUrl(entityId.value),
      datasetApiUrl: BROWNFIELD_API_ENTITY_URL,
      requiredAttribution: BROWNFIELD_ATTRIBUTION,
      retrievedAt: retrievedAt || null,
      ingestedAt: ingestedAt || null,
      geographicCoverage: BROWNFIELD_GEOGRAPHIC_SCOPE,
    },
    limitations: BROWNFIELD_LIMITATIONS.slice(),
  };
  row.contentFingerprint = contentFingerprint(row);
  return { ok: true, row };
}

function parseBrownfieldEntitiesPayload(payload, options = {}) {
  let entities = null;
  if (Array.isArray(payload)) {
    entities = payload;
  } else if (payload && typeof payload === 'object' && Array.isArray(payload.entities)) {
    entities = payload.entities;
  } else if (typeof payload === 'string') {
    let parsed;
    try {
      parsed = JSON.parse(payload);
    } catch {
      return {
        ok: false,
        rows: [],
        rejected: [{ reason: 'malformed_json' }],
        providerCount: null,
      };
    }
    return parseBrownfieldEntitiesPayload(parsed, options);
  } else {
    return {
      ok: false,
      rows: [],
      rejected: [{ reason: 'invalid_payload' }],
      providerCount: null,
    };
  }

  const rows = [];
  const rejected = [];
  entities.forEach((entity, index) => {
    const parsed = parseBrownfieldEntity(entity, options);
    if (!parsed.ok) {
      rejected.push({ index, reason: parsed.reason, entity: entity?.entity ?? null });
      return;
    }
    rows.push(parsed.row);
  });

  const providerCount = payload && typeof payload === 'object' && !Array.isArray(payload)
    && Number.isFinite(Number(payload.count))
    ? Number(payload.count)
    : entities.length;

  return {
    ok: rejected.length === 0 || rows.length > 0,
    rows,
    rejected,
    providerCount,
  };
}

module.exports = {
  blank,
  presentDate,
  parseEntityId,
  parseDwellingCount,
  parseWktPoint,
  contentFingerprint,
  parseBrownfieldEntity,
  parseBrownfieldEntitiesPayload,
};
