/**
 * Environment Agency Flood Map for Planning — rivers and sea flood zones.
 * Official open spatial product. No API key. England coverage.
 *
 * Layers queried (same product, not a blended score):
 *   1 = Flood Zone 3
 *   2 = Flood Zone 2
 *
 * Absence of Zone 2/3 is NOT treated as “safe” or Flood Zone 1.
 */

const { propertyIntelligenceConfig } = require('../../../config/propertyIntelligence.config');
const {
  buildCacheKey,
  getCachedResponse,
  setCachedResponse,
} = require('../cache/DataProviderCache');

const PROVIDER = 'environment_agency';
const PRODUCT = 'flood_map_for_planning_rivers_and_sea';
const LAYER_ZONE_3 = 1;
const LAYER_ZONE_2 = 2;

/**
 * Coarse WGS84 envelope around the official Flood Map for Planning service
 * extent (British National Grid fullExtent, England rivers-and-sea product).
 * Coordinates outside this box are unsupported geography — not “low risk”.
 * Empty intersections inside the box stay notAssessed (not Flood Zone 1).
 */
const EA_FMF_P_BOUNDS = Object.freeze({
  minLat: 49.8,
  maxLat: 55.82,
  minLng: -6.5,
  maxLng: 2.0,
});
const UK_BOUNDS = EA_FMF_P_BOUNDS;

function isFiniteCoord(value) {
  if (value === undefined || value === null || value === '') return false;
  if (typeof value === 'boolean') return false;
  const n = Number(value);
  return Number.isFinite(n);
}

function readCoords(property = {}) {
  const latitude = isFiniteCoord(property.latitude) ? Number(property.latitude) : null;
  const longitude = isFiniteCoord(property.longitude) ? Number(property.longitude) : null;
  if (latitude == null || longitude == null) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

function inUkBounds({ latitude, longitude }) {
  return (
    latitude >= UK_BOUNDS.minLat &&
    latitude <= UK_BOUNDS.maxLat &&
    longitude >= UK_BOUNDS.minLng &&
    longitude <= UK_BOUNDS.maxLng
  );
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
      // Cache is optional; flood evidence must still degrade honestly without Postgres.
    }
  }

  const started = Date.now();
  const controller = new AbortController();
  const timeoutMs = propertyIntelligenceConfig.providers.environmentAgencyFlood.timeoutMs;
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

function layerQueryUrl(baseUrl, layerId, { longitude, latitude }) {
  const root = String(baseUrl).replace(/\/$/, '');
  const url = new URL(`${root}/${layerId}/query`);
  url.searchParams.set('geometry', `${longitude},${latitude}`);
  url.searchParams.set('geometryType', 'esriGeometryPoint');
  url.searchParams.set('inSR', '4326');
  url.searchParams.set('spatialRel', 'esriSpatialRelIntersects');
  url.searchParams.set('outFields', 'layer,type');
  url.searchParams.set('returnGeometry', 'false');
  url.searchParams.set('f', 'json');
  return url.toString();
}

function parseLayerResponse(data) {
  if (!data || typeof data !== 'object') {
    return { ok: false, reason: 'malformed_provider_response' };
  }
  if (data.error) {
    return { ok: false, reason: 'provider_unavailable', detail: data.error.message || null };
  }
  if (!Array.isArray(data.features)) {
    return { ok: false, reason: 'malformed_provider_response' };
  }
  const attributes = data.features
    .map((row) => row?.attributes || null)
    .filter(Boolean);
  return { ok: true, hit: attributes.length > 0, attributes };
}

async function queryFloodMapForPlanning(coords, context = {}) {
  const cfg = propertyIntelligenceConfig.providers.environmentAgencyFlood;
  const ttlMs = propertyIntelligenceConfig.cacheTtl.flood;
  const params = {
    lat: cacheCoord(coords.latitude),
    lng: cacheCoord(coords.longitude),
  };

  const skipCache = context.skipCache === true;
  const zone3 = await cachedGet(layerQueryUrl(cfg.baseUrl, LAYER_ZONE_3, coords), {
    ...params,
    layer: String(LAYER_ZONE_3),
  }, { ttlMs, skipCache });
  const parsed3 = parseLayerResponse(zone3.data);
  if (!parsed3.ok) {
    return { success: false, reason: parsed3.reason, retrievedAt: zone3.retrievedAt };
  }

  const zone2 = await cachedGet(layerQueryUrl(cfg.baseUrl, LAYER_ZONE_2, coords), {
    ...params,
    layer: String(LAYER_ZONE_2),
  }, { ttlMs, skipCache });
  const parsed2 = parseLayerResponse(zone2.data);
  if (!parsed2.ok) {
    if (parsed3.hit) {
      return {
        success: true,
        zone: 3,
        layersMatched: ['Flood Zone 3'],
        attributes: parsed3.attributes,
        retrievedAt: zone3.retrievedAt,
        cacheHit: Boolean(zone3.cacheHit),
        context,
      };
    }
    return { success: false, reason: parsed2.reason, retrievedAt: zone2.retrievedAt };
  }

  const retrievedAt = zone2.retrievedAt || zone3.retrievedAt;
  if (parsed3.hit) {
    return {
      success: true,
      zone: 3,
      layersMatched: parsed2.hit ? ['Flood Zone 3', 'Flood Zone 2'] : ['Flood Zone 3'],
      attributes: [...parsed3.attributes, ...parsed2.attributes],
      retrievedAt,
      cacheHit: Boolean(zone3.cacheHit && zone2.cacheHit),
      context,
    };
  }
  if (parsed2.hit) {
    return {
      success: true,
      zone: 2,
      layersMatched: ['Flood Zone 2'],
      attributes: parsed2.attributes,
      retrievedAt,
      cacheHit: Boolean(zone2.cacheHit),
      context,
    };
  }
  return {
    success: true,
    zone: null,
    layersMatched: [],
    attributes: [],
    retrievedAt,
    cacheHit: Boolean(zone3.cacheHit && zone2.cacheHit),
    noApplicablePolygon: true,
    context,
  };
}

module.exports = {
  PROVIDER,
  PRODUCT,
  LAYER_ZONE_3,
  LAYER_ZONE_2,
  readCoords,
  inUkBounds,
  queryFloodMapForPlanning,
  parseLayerResponse,
};
