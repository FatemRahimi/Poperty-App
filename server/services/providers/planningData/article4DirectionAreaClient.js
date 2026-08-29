/**
 * MHCLG Planning Data — article-4-direction-area dataset.
 * Official open API for England. No API key.
 *
 * Spatial path: latitude/longitude point-in-polygon against published
 * Article 4 direction-area polygons. A geometry buffer is not used (that
 * would treat nearby areas as membership). A postcode query is not used
 * (q= is not property-level proof).
 *
 * Geographic membership only. Permitted-development-right codes are not
 * converted into restriction conclusions. Absence of a returned area is
 * not evidence that the property is outside an Article 4 area. Coverage
 * is incomplete.
 */

const { propertyIntelligenceConfig } = require('../../../config/propertyIntelligence.config');
const {
  buildCacheKey,
  getCachedResponse,
  setCachedResponse,
} = require('../cache/DataProviderCache');
const { readCoords, inUkBounds } = require('../environmentAgency/floodMapForPlanning');
const { pointInPolygonWkt } = require('./conservationAreaClient');

const PROVIDER = 'mhclg_planning_data';
const PRODUCT = 'article_4_direction_area';
const DATASET = 'article-4-direction-area';
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

function cacheCoord(n) {
  return Number(n).toFixed(5);
}

function evidenceDay(asOf) {
  if (!asOf) return new Date().toISOString().slice(0, 10);
  if (asOf instanceof Date) {
    return Number.isNaN(asOf.getTime()) ? new Date().toISOString().slice(0, 10) : asOf.toISOString().slice(0, 10);
  }
  const text = String(asOf).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString().slice(0, 10) : parsed.toISOString().slice(0, 10);
}

function hasEndedAsOf(endDate, asOf) {
  const ended = presentDate(endDate);
  if (!ended) return false;
  return ended <= evidenceDay(asOf);
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
      // Cache is optional; Article 4 evidence must still degrade honestly without Postgres.
    }
  }

  const started = Date.now();
  const controller = new AbortController();
  const timeoutMs = propertyIntelligenceConfig.providers.article4.timeoutMs;
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

function parseArticle4AreaEntities(data) {
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

function mapArticle4Area(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    entityId: row.entity != null ? Number(row.entity) : null,
    name: presentText(row.name),
    reference: presentText(row.reference),
    organisationEntity: row['organisation-entity'] != null ? Number(row['organisation-entity']) : null,
    directionReference: presentText(row['article-4-direction']),
    nativeQuality: presentText(row.quality),
    startDate: presentDate(row['start-date']),
    endDate: presentDate(row['end-date']),
    entryDate: presentDate(row['entry-date']),
    geometryWkt: presentText(row.geometry),
  };
}

function classifyArticle4Area(mapped, coords, asOf) {
  if (!mapped) return null;
  if (hasEndedAsOf(mapped.endDate, asOf)) return null;
  if (!coords) return null;
  if (!mapped.geometryWkt) return null;
  if (!pointInPolygonWkt(coords, mapped.geometryWkt)) return null;
  return {
    ...mapped,
    scope: 'area_membership',
    matchMethod: 'coordinate_point_in_polygon',
    geographicMembershipOnly: true,
    restrictionsAssessed: false,
    legalEffectivenessAssessed: false,
  };
}

function compareArticle4Areas(a, b) {
  const nameA = a.name || '';
  const nameB = b.name || '';
  if (nameA !== nameB) return nameA.localeCompare(nameB);
  return String(a.reference || '').localeCompare(String(b.reference || ''));
}

async function queryArticle4DirectionAreas({ coords = null, skipCache = false } = {}, context = {}) {
  const cfg = propertyIntelligenceConfig.providers.article4;
  const ttlMs = propertyIntelligenceConfig.cacheTtl.article4;
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
  const parsed = parseArticle4AreaEntities(fetched.data);
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
  parseArticle4AreaEntities,
  mapArticle4Area,
  classifyArticle4Area,
  compareArticle4Areas,
  queryArticle4DirectionAreas,
  hasEndedAsOf,
  evidenceDay,
  pointInPolygonWkt,
  readCoords,
  inUkBounds,
};
