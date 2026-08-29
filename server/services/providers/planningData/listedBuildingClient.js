/**
 * MHCLG Planning Data — listed-building dataset.
 * Official open API for England. No API key.
 *
 * Records originate from Historic England's National Heritage List for England
 * (NHLE) list-entry numbers and native grades (I, II*, II).
 * Spatial path: one buffered-polygon intersect around property coordinates,
 * then a same-site distance filter. Point-intersect at the exact coordinate
 * is not used (listed-building geometries are points inside the building).
 *
 * A postcode or nearby listed building is not property-level proof.
 * Absence of a returned listing is not evidence that the property is not listed.
 */

const { propertyIntelligenceConfig } = require('../../../config/propertyIntelligence.config');
const {
  buildCacheKey,
  getCachedResponse,
  setCachedResponse,
} = require('../cache/DataProviderCache');
const { readCoords, inUkBounds } = require('../environmentAgency/floodMapForPlanning');
const {
  haversineMetres,
  bufferPolygonWkt,
  parseWktPoint,
} = require('./planningApplicationClient');

const PROVIDER = 'mhclg_planning_data';
const PRODUCT = 'listed_building';
const DATASET = 'listed-building';
const DEFAULT_SEARCH_RADIUS_M = 25;
const QUERY_LIMIT = 50;
const DISPLAY_LIMIT = 5;
const NATIVE_GRADES = Object.freeze(['I', 'II*', 'II']);

function searchRadiusMetres() {
  const n = Number(propertyIntelligenceConfig.providers.listedBuilding.searchRadiusMetres);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_SEARCH_RADIUS_M;
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

function nativeGrade(value) {
  const text = presentText(value);
  if (!text) return null;
  const stripped = text.replace(/^grade\s+/i, '').trim();
  return NATIVE_GRADES.includes(stripped) ? stripped : null;
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

function isCurrentListing(row) {
  const ended = presentDate(row?.['end-date']);
  return !ended;
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
      // Cache is optional; listed-building evidence must still degrade honestly without Postgres.
    }
  }

  const started = Date.now();
  const controller = new AbortController();
  const timeoutMs = propertyIntelligenceConfig.providers.listedBuilding.timeoutMs;
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

function parseListedBuildingEntities(data) {
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

function mapListedBuilding(row) {
  if (!row || typeof row !== 'object') return null;
  const point = parseWktPoint(row.point);
  const listEntryNumber = presentText(row.reference);
  const grade = nativeGrade(row['listed-building-grade']);
  return {
    listEntryNumber,
    entityId: row.entity != null ? Number(row.entity) : null,
    name: presentText(row.name),
    nativeGrade: grade,
    listedDate: presentDate(row['start-date']),
    endDate: presentDate(row['end-date']),
    providerEntryDate: presentDate(row['entry-date']),
    documentationUrl: safeHttpUrl(row['documentation-url'])
      || (listEntryNumber
        ? `https://historicengland.org.uk/listing/the-list/list-entry/${listEntryNumber}`
        : null),
    point,
    currentListing: isCurrentListing(row),
  };
}

function classifyListedBuilding(mapped, coords, radiusMetres) {
  if (!mapped || !mapped.currentListing) return null;
  if (!mapped.point || !coords) return null;
  const distanceMetres = haversineMetres(coords, mapped.point);
  if (distanceMetres == null || distanceMetres > radiusMetres) return null;
  return {
    ...mapped,
    distanceMetres,
    scope: 'property',
    matchMethod: 'same_site_coordinates',
  };
}

function compareListedBuildings(a, b) {
  const da = a.distanceMetres;
  const db = b.distanceMetres;
  if (da != null && db != null && da !== db) return da - db;
  if (da != null && db == null) return -1;
  if (da == null && db != null) return 1;
  return String(a.listEntryNumber || '').localeCompare(String(b.listEntryNumber || ''));
}

async function queryListedBuildings({ coords = null, skipCache = false } = {}, context = {}) {
  const cfg = propertyIntelligenceConfig.providers.listedBuilding;
  const ttlMs = propertyIntelligenceConfig.cacheTtl.listedBuilding;
  const radiusMetres = searchRadiusMetres();
  const root = String(cfg.baseUrl).replace(/\/$/, '');

  if (!coords) {
    return { success: false, reason: 'property_location_unavailable' };
  }

  const geometry = bufferPolygonWkt(coords, radiusMetres);
  const url = new URL(`${root}/entity.json`);
  url.searchParams.set('dataset', DATASET);
  url.searchParams.set('geometry', geometry);
  url.searchParams.set('geometry_relation', 'intersects');
  url.searchParams.set('limit', String(QUERY_LIMIT));
  const params = {
    lat: cacheCoord(coords.latitude),
    lng: cacheCoord(coords.longitude),
    radius: String(radiusMetres),
    limit: String(QUERY_LIMIT),
  };

  const fetched = await cachedGet(url.toString(), params, {
    ttlMs,
    skipCache: skipCache || context.skipCache === true,
  });
  const parsed = parseListedBuildingEntities(fetched.data);
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
    queryKind: 'geometry_buffer',
  };
}

module.exports = {
  PROVIDER,
  PRODUCT,
  DATASET,
  DEFAULT_SEARCH_RADIUS_M,
  QUERY_LIMIT,
  DISPLAY_LIMIT,
  NATIVE_GRADES,
  searchRadiusMetres,
  parseListedBuildingEntities,
  mapListedBuilding,
  classifyListedBuilding,
  compareListedBuildings,
  nativeGrade,
  queryListedBuildings,
  readCoords,
  inUkBounds,
  haversineMetres,
  parseWktPoint,
};
