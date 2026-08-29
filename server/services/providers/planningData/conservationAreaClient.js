/**
 * MHCLG Planning Data — conservation-area dataset.
 * Official open API for England. No API key.
 *
 * Spatial path: latitude/longitude point-in-polygon against conservation-area
 * polygons. A geometry buffer is not used (that would treat nearby areas as
 * membership). A postcode query is not used (q= is not property-level proof).
 *
 * Absence of a returned area is not evidence that the property is outside a
 * conservation area. Coverage is incomplete.
 */

const { propertyIntelligenceConfig } = require('../../../config/propertyIntelligence.config');
const {
  buildCacheKey,
  getCachedResponse,
  setCachedResponse,
} = require('../cache/DataProviderCache');
const { readCoords, inUkBounds } = require('../environmentAgency/floodMapForPlanning');

const PROVIDER = 'mhclg_planning_data';
const PRODUCT = 'conservation_area';
const DATASET = 'conservation-area';
const QUERY_LIMIT = 50;
const DISPLAY_LIMIT = 5;

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

function parseRing(text) {
  const pairs = String(text).split(',').map((pair) => pair.trim()).filter(Boolean);
  const ring = [];
  pairs.forEach((pair) => {
    const parts = pair.split(/\s+/);
    const x = Number(parts[0]);
    const y = Number(parts[1]);
    if (Number.isFinite(x) && Number.isFinite(y)) ring.push({ x, y });
  });
  return ring.length >= 3 ? ring : null;
}

function parseWktPolygons(value) {
  const text = presentText(value);
  if (!text) return [];
  const polygons = [];
  if (/^POLYGON/i.test(text)) {
    const rings = [];
    const ringRe = /\(\s*((?:-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?(?:\s*,\s*)?)+)\s*\)/g;
    let match;
    while ((match = ringRe.exec(text))) {
      const ring = parseRing(match[1]);
      if (ring) rings.push(ring);
    }
    if (rings.length) polygons.push(rings);
    return polygons;
  }
  if (/^MULTIPOLYGON/i.test(text)) {
    const body = text.replace(/^MULTIPOLYGON\s*/i, '').trim();
    const polyRe = /\(\s*((?:\(\s*-?\d[\s\S]*?\)\s*,?\s*)+)\)/g;
    let polyMatch;
    while ((polyMatch = polyRe.exec(body))) {
      const rings = [];
      const ringRe = /\(\s*((?:-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?(?:\s*,\s*)?)+)\s*\)/g;
      let ringMatch;
      while ((ringMatch = ringRe.exec(polyMatch[1]))) {
        const ring = parseRing(ringMatch[1]);
        if (ring) rings.push(ring);
      }
      if (rings.length) polygons.push(rings);
    }
  }
  return polygons;
}

function pointInRing(longitude, latitude, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].x;
    const yi = ring[i].y;
    const xj = ring[j].x;
    const yj = ring[j].y;
    const intersect = ((yi > latitude) !== (yj > latitude))
      && (longitude < ((xj - xi) * (latitude - yi)) / (yj - yi + 0) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPolygonRings(longitude, latitude, rings) {
  if (!rings || !rings.length) return false;
  if (!pointInRing(longitude, latitude, rings[0])) return false;
  for (let i = 1; i < rings.length; i += 1) {
    if (pointInRing(longitude, latitude, rings[i])) return false;
  }
  return true;
}

function pointInPolygonWkt(coords, wkt) {
  if (!coords || !Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude)) return false;
  const polygons = parseWktPolygons(wkt);
  return polygons.some((rings) => pointInPolygonRings(coords.longitude, coords.latitude, rings));
}

function isCurrentArea(row) {
  return !presentDate(row?.['end-date']);
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
      // Cache is optional; conservation-area evidence must still degrade honestly without Postgres.
    }
  }

  const started = Date.now();
  const controller = new AbortController();
  const timeoutMs = propertyIntelligenceConfig.providers.conservationArea.timeoutMs;
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

function parseConservationAreaEntities(data) {
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

function mapConservationArea(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    entityId: row.entity != null ? Number(row.entity) : null,
    name: presentText(row.name),
    reference: presentText(row.reference),
    organisationEntity: row['organisation-entity'] != null ? Number(row['organisation-entity']) : null,
    nativeQuality: presentText(row.quality),
    designationDate: presentDate(row['designation-date']),
    startDate: presentDate(row['start-date']),
    endDate: presentDate(row['end-date']),
    providerEntryDate: presentDate(row['entry-date']),
    documentationUrl: safeHttpUrl(row['documentation-url'] || row['document-url']),
    geometryWkt: presentText(row.geometry),
    currentArea: isCurrentArea(row),
  };
}

function classifyConservationArea(mapped, coords) {
  if (!mapped || !mapped.currentArea) return null;
  if (!coords) return null;
  if (mapped.geometryWkt) {
    if (!pointInPolygonWkt(coords, mapped.geometryWkt)) return null;
    return {
      ...mapped,
      scope: 'area_membership',
      matchMethod: 'coordinate_point_in_polygon',
    };
  }
  return {
    ...mapped,
    scope: 'area_membership',
    matchMethod: 'provider_point_in_polygon',
  };
}

function compareConservationAreas(a, b) {
  const nameA = a.name || '';
  const nameB = b.name || '';
  if (nameA !== nameB) return nameA.localeCompare(nameB);
  return String(a.reference || '').localeCompare(String(b.reference || ''));
}

async function queryConservationAreas({ coords = null, skipCache = false } = {}, context = {}) {
  const cfg = propertyIntelligenceConfig.providers.conservationArea;
  const ttlMs = propertyIntelligenceConfig.cacheTtl.conservationArea;
  const root = String(cfg.baseUrl).replace(/\/$/, '');

  if (!coords) {
    return { success: false, reason: 'property_location_unavailable' };
  }

  const url = new URL(`${root}/entity.json`);
  url.searchParams.set('dataset', DATASET);
  url.searchParams.set('latitude', String(coords.latitude));
  url.searchParams.set('longitude', String(coords.longitude));
  url.searchParams.set('limit', String(QUERY_LIMIT));
  const params = {
    lat: cacheCoord(coords.latitude),
    lng: cacheCoord(coords.longitude),
    limit: String(QUERY_LIMIT),
  };

  const fetched = await cachedGet(url.toString(), params, {
    ttlMs,
    skipCache: skipCache || context.skipCache === true,
  });
  const parsed = parseConservationAreaEntities(fetched.data);
  if (!parsed.ok) {
    return { success: false, reason: parsed.reason, retrievedAt: fetched.retrievedAt };
  }
  return {
    success: true,
    entities: parsed.entities,
    providerCount: parsed.count,
    retrievedAt: fetched.retrievedAt,
    cacheHit: Boolean(fetched.cacheHit),
    queryKind: 'point_in_polygon',
  };
}

module.exports = {
  PROVIDER,
  PRODUCT,
  DATASET,
  QUERY_LIMIT,
  DISPLAY_LIMIT,
  parseConservationAreaEntities,
  mapConservationArea,
  classifyConservationArea,
  compareConservationAreas,
  queryConservationAreas,
  parseWktPolygons,
  pointInPolygonWkt,
  readCoords,
  inUkBounds,
};
