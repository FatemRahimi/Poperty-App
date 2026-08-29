/**
 * MHCLG Planning Data — educational-establishment dataset.
 * Official open API for England. No API key.
 *
 * Records originate from Department for Education Get Information About Schools
 * (GIAS) identifiers (URN / establishment type / status) published on Planning Data.
 * Spatial path: one buffered-polygon intersect around property coordinates.
 *
 * Nearby results are proximity only. They are not catchment, admission,
 * walking-route, quality, or valuation evidence.
 * Absence of returned establishments is not “no schools”.
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
const PRODUCT = 'educational_establishment';
const DATASET = 'educational-establishment';
const DEFAULT_SEARCH_RADIUS_M = 800;
const QUERY_LIMIT = 50;
const DISPLAY_LIMIT = 8;

/** Official GIAS TypeOfEstablishment (name) for native type codes. */
const GIAS_TYPE_NAMES = Object.freeze({
  '01': 'Community School',
  '02': 'Voluntary Aided School',
  '03': 'Voluntary Controlled School',
  '05': 'Foundation School',
  '06': 'City Technology College',
  '07': 'Community Special School',
  '08': 'Non-Maintained Special School',
  '09': 'Independent School Special',
  '10': 'Other Independent Special School',
  '11': 'Other Independent School',
  '12': 'Foundation Special School',
  '14': 'Pupil Referral Unit',
  '15': 'LA Nursery School',
  '18': 'Further Education',
  '24': 'Secure Unit',
  '25': 'Offshore School',
  '26': "Service Children's Education",
  '27': 'Miscellaneous',
  '28': 'Academy Sponsor Led',
  '29': 'Higher Education Institution',
  '31': 'Sixth Form Centres',
  '32': 'Special Post 16 Institution',
  '33': 'Academy Special Sponsor Led',
  '34': 'Academy Converter',
  '35': 'Free Schools',
  '36': 'Free Schools Special',
  '38': 'Free Schools - Alternative Provision',
  '39': 'Free Schools - 16-19',
  '40': 'University Technical College',
  '41': 'Studio Schools',
  '42': 'Academy Alternative Provision Converter',
  '43': 'Academy Alternative Provision Sponsor Led',
  '44': 'Academy Special Converter',
  '45': 'Academy 16-19 Converter',
  '46': 'Academy 16-19 Sponsor Led',
  '47': "Children's Centre",
  '48': "Children's Centre Linked Site",
  '56': 'Institution funded by other government department',
  '57': 'Academy Secure 16 to 19',
});

/** Official GIAS EstablishmentStatus (name) for native status codes. */
const GIAS_STATUS_NAMES = Object.freeze({
  '1': 'Open',
  '2': 'Closed',
  '3': 'Open, but proposed to close',
  '4': 'Proposed to open',
});

function searchRadiusMetres() {
  const n = Number(propertyIntelligenceConfig.providers.educationalEstablishment.searchRadiusMetres);
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

function padTypeCode(value) {
  const text = presentText(value);
  if (!text) return null;
  if (/^\d+$/.test(text)) return text.padStart(2, '0');
  return text;
}

function nativeTypeName(code) {
  return GIAS_TYPE_NAMES[code] || null;
}

function nativeStatusName(code) {
  return GIAS_STATUS_NAMES[code] || null;
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
      // Cache is optional; school evidence must still degrade honestly without Postgres.
    }
  }

  const started = Date.now();
  const controller = new AbortController();
  const timeoutMs = propertyIntelligenceConfig.providers.educationalEstablishment.timeoutMs;
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

function parseEstablishmentEntities(data) {
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

function mapEstablishment(row) {
  if (!row || typeof row !== 'object') return null;
  const point = parseWktPoint(row.point);
  const typeCode = padTypeCode(row['educational-establishment-type']);
  const statusCode = presentText(row['educational-establishment-status']);
  const urn = presentText(row.reference);
  return {
    urn,
    entityId: row.entity != null ? Number(row.entity) : null,
    name: presentText(row.name),
    nativeTypeCode: typeCode,
    nativeType: nativeTypeName(typeCode) || typeCode,
    nativeStatusCode: statusCode,
    nativeStatus: nativeStatusName(statusCode) || statusCode,
    gender: null,
    phase: null,
    websiteUrl: safeHttpUrl(row['website-url']),
    schoolCapacity: presentText(row['school-capacity']),
    establishmentNumber: presentText(row['educational-establishment-number']),
    uprn: presentText(row.uprn),
    providerEntryDate: presentDate(row['entry-date']),
    openDate: presentDate(row['start-date']),
    closeDate: presentDate(row['end-date']),
    point,
  };
}

function classifyEstablishment(mapped, coords, radiusMetres) {
  if (!mapped || !mapped.point || !coords) return null;
  const distanceMetres = haversineMetres(coords, mapped.point);
  if (distanceMetres == null || distanceMetres > radiusMetres) return null;
  return {
    ...mapped,
    distanceMetres,
    scope: 'nearby',
    matchMethod: 'search_radius',
  };
}

function compareEstablishments(a, b) {
  const openRank = (row) => {
    if (row.nativeStatusCode === '1' || row.nativeStatusCode === '3') return 0;
    return 1;
  };
  const openDelta = openRank(a) - openRank(b);
  if (openDelta !== 0) return openDelta;
  const da = a.distanceMetres;
  const db = b.distanceMetres;
  if (da != null && db != null && da !== db) return da - db;
  if (da != null && db == null) return -1;
  if (da == null && db != null) return 1;
  return String(a.name || '').localeCompare(String(b.name || ''));
}

async function queryEducationalEstablishments({ coords = null, skipCache = false } = {}, context = {}) {
  const cfg = propertyIntelligenceConfig.providers.educationalEstablishment;
  const ttlMs = propertyIntelligenceConfig.cacheTtl.schools;
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
  const parsed = parseEstablishmentEntities(fetched.data);
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
  GIAS_TYPE_NAMES,
  GIAS_STATUS_NAMES,
  searchRadiusMetres,
  parseEstablishmentEntities,
  mapEstablishment,
  classifyEstablishment,
  compareEstablishments,
  queryEducationalEstablishments,
  nativeTypeName,
  nativeStatusName,
  readCoords,
  inUkBounds,
  haversineMetres,
  parseWktPoint,
};
