/**
 * MHCLG Planning Data — planning-application dataset.
 * Official open API for England. No API key.
 *
 * Spatial path: one buffered-polygon intersect query around property coordinates.
 * Point-intersect is not used as a nearby search (it only finds geometries
 * covering the exact coordinate).
 *
 * Absence of returned applications is not “no planning activity”.
 * Coverage varies by local planning authority.
 */

const { propertyIntelligenceConfig } = require('../../../config/propertyIntelligence.config');
const {
  buildCacheKey,
  getCachedResponse,
  setCachedResponse,
} = require('../cache/DataProviderCache');
const { readCoords, inUkBounds } = require('../environmentAgency/floodMapForPlanning');

const PROVIDER = 'mhclg_planning_data';
const PRODUCT = 'planning_application';
const DATASET = 'planning-application';
const EARTH_RADIUS_M = 6371000;
const DEFAULT_SEARCH_RADIUS_M = 400;
const SUBJECT_SITE_M = 10;
const QUERY_LIMIT = 50;

function searchRadiusMetres() {
  const n = Number(propertyIntelligenceConfig.providers.planningData.searchRadiusMetres);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_SEARCH_RADIUS_M;
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function haversineMetres(from, to) {
  if (!from || !to) return null;
  const dLat = toRad(to.latitude - from.latitude);
  const dLng = toRad(to.longitude - from.longitude);
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const metres = 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
  return Math.round(metres);
}

function bufferPolygonWkt({ latitude, longitude }, radiusMetres) {
  const dLat = radiusMetres / 111320;
  const cosLat = Math.cos(toRad(latitude));
  const metresPerLng = 111320 * (Math.abs(cosLat) < 0.01 ? 0.01 : cosLat);
  const dLng = radiusMetres / metresPerLng;
  const west = longitude - dLng;
  const east = longitude + dLng;
  const south = latitude - dLat;
  const north = latitude + dLat;
  return `POLYGON((${west} ${south},${east} ${south},${east} ${north},${west} ${north},${west} ${south}))`;
}

function parseWktPoint(value) {
  if (!value || typeof value !== 'string') return null;
  const match = value.trim().match(/^POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)$/i);
  if (!match) return null;
  const longitude = Number(match[1]);
  const latitude = Number(match[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function presentText(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function presentDate(value) {
  const text = presentText(value);
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}/.test(text)) return null;
  return text.slice(0, 10);
}

function looksLikeUprn(value) {
  const text = presentText(value);
  if (!text) return false;
  return /^\d{5,12}$/.test(text);
}

function safeHttpUrl(value) {
  const text = presentText(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function cacheCoord(n) {
  return Number(n).toFixed(5);
}

async function cachedGet(url, params, { ttlMs, skipCache = false }) {
  const cacheKey = buildCacheKey(PROVIDER, PRODUCT, params);
  if (!skipCache) {
    try {
      const cached = await getCachedResponse(cacheKey);
      if (cached?.data) {
        return { data: cached.data, cacheHit: true, retrievedAt: cached.retrievedAt };
      }
    } catch {
      // Cache is optional; planning evidence must still degrade honestly without Postgres.
    }
  }

  const started = Date.now();
  const controller = new AbortController();
  const timeoutMs = propertyIntelligenceConfig.providers.planningData.timeoutMs;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error('malformed_provider_response');
    }
    if (!response.ok) {
      throw new Error(`provider_http_${response.status}`);
    }
    if (!skipCache) {
      try {
        await setCachedResponse({
          cacheKey,
          provider: PROVIDER,
          endpoint: PRODUCT,
          response: data,
          ttlMs,
          creditsUsed: 0,
        });
      } catch {
        // Ignore cache write failures.
      }
    }
    return {
      data,
      cacheHit: false,
      retrievedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}

function parsePlanningEntities(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, reason: 'malformed_provider_response' };
  }
  if (data.error) {
    return { ok: false, reason: 'provider_unavailable', detail: data.error.message || data.error || null };
  }
  if (!Array.isArray(data.entities)) {
    return { ok: false, reason: 'malformed_provider_response' };
  }
  return {
    ok: true,
    entities: data.entities,
    count: Number.isFinite(Number(data.count)) ? Number(data.count) : data.entities.length,
  };
}

function mapApplication(row) {
  if (!row || typeof row !== 'object') return null;
  const point = parseWktPoint(row.point);
  return {
    entityId: row.entity != null ? Number(row.entity) : null,
    reference: presentText(row.reference),
    name: presentText(row.name),
    description: presentText(row.description),
    address: presentText(row['address-text'] || row.address),
    uprn: looksLikeUprn(row.uprn) ? String(row.uprn).trim() : null,
    organisationEntity: row['organisation-entity'] != null ? Number(row['organisation-entity']) : null,
    nativeType: presentText(row['planning-application-type']),
    nativeStatus: presentText(row['planning-application-status']),
    nativeDecision: presentText(row['planning-decision']),
    nativeDecisionType: presentText(row['planning-decision-type']),
    submittedDate: presentDate(row['start-date']),
    decisionDate: presentDate(row['decision-date']),
    providerEntryDate: presentDate(row['entry-date']),
    documentationUrl: safeHttpUrl(row['documentation-url']),
    point,
  };
}

function classifyApplication(mapped, coords, propertyUprn, radiusMetres, queryKind = 'geometry_buffer') {
  if (!mapped) return null;
  const distanceMetres = coords && mapped.point ? haversineMetres(coords, mapped.point) : null;
  const uprnMatch = Boolean(
    propertyUprn && mapped.uprn && String(mapped.uprn) === String(propertyUprn)
  );
  const sameSite = distanceMetres != null && distanceMetres <= SUBJECT_SITE_M;
  if (queryKind === 'uprn') {
    return {
      ...mapped,
      distanceMetres,
      scope: 'property',
      matchMethod: uprnMatch ? 'uprn' : 'uprn_query',
    };
  }
  if (distanceMetres != null && distanceMetres > radiusMetres && !uprnMatch) return null;
  const scope = uprnMatch || sameSite ? 'property' : 'nearby';
  return {
    ...mapped,
    distanceMetres,
    scope,
    matchMethod: uprnMatch ? 'uprn' : sameSite ? 'same_site_coordinates' : 'search_radius',
  };
}

function compareApplications(a, b) {
  const da = a.distanceMetres;
  const db = b.distanceMetres;
  if (da != null && db != null && da !== db) return da - db;
  if (da != null && db == null) return -1;
  if (da == null && db != null) return 1;
  const dateA = a.decisionDate || a.submittedDate || '';
  const dateB = b.decisionDate || b.submittedDate || '';
  if (dateA !== dateB) return dateB.localeCompare(dateA);
  return String(a.reference || '').localeCompare(String(b.reference || ''));
}

async function queryPlanningApplications({ coords = null, uprn = null, skipCache = false } = {}, context = {}) {
  const cfg = propertyIntelligenceConfig.providers.planningData;
  const ttlMs = propertyIntelligenceConfig.cacheTtl.planning;
  const radiusMetres = searchRadiusMetres();
  const root = String(cfg.baseUrl).replace(/\/$/, '');

  let url;
  let params;
  if (coords) {
    const geometry = bufferPolygonWkt(coords, radiusMetres);
    url = new URL(`${root}/entity.json`);
    url.searchParams.set('dataset', DATASET);
    url.searchParams.set('geometry', geometry);
    url.searchParams.set('geometry_relation', 'intersects');
    url.searchParams.set('limit', String(QUERY_LIMIT));
    params = {
      lat: cacheCoord(coords.latitude),
      lng: cacheCoord(coords.longitude),
      radius: String(radiusMetres),
      limit: String(QUERY_LIMIT),
    };
  } else if (looksLikeUprn(uprn)) {
    url = new URL(`${root}/entity.json`);
    url.searchParams.set('dataset', DATASET);
    url.searchParams.set('q', String(uprn).trim());
    url.searchParams.set('limit', String(QUERY_LIMIT));
    params = { q: String(uprn).trim(), limit: String(QUERY_LIMIT) };
  } else {
    return { success: false, reason: 'property_location_unavailable' };
  }

  const fetched = await cachedGet(url.toString(), params, {
    ttlMs,
    skipCache: skipCache || context.skipCache === true,
  });
  const parsed = parsePlanningEntities(fetched.data);
  if (!parsed.ok) {
    return { success: false, reason: parsed.reason, retrievedAt: fetched.retrievedAt };
  }
  return {
    success: true,
    entities: parsed.entities,
    providerCount: parsed.count,
    retrievedAt: fetched.retrievedAt,
    cacheHit: Boolean(fetched.cacheHit),
    radiusMetres,
    queryKind: coords ? 'geometry_buffer' : 'uprn',
  };
}

module.exports = {
  PROVIDER,
  PRODUCT,
  DATASET,
  DEFAULT_SEARCH_RADIUS_M,
  SUBJECT_SITE_M,
  QUERY_LIMIT,
  searchRadiusMetres,
  haversineMetres,
  bufferPolygonWkt,
  parseWktPoint,
  parsePlanningEntities,
  mapApplication,
  classifyApplication,
  compareApplications,
  looksLikeUprn,
  queryPlanningApplications,
  readCoords,
  inUkBounds,
};
