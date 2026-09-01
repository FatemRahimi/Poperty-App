/**
 * Property Intelligence platform configuration and feature flags.
 * All secrets remain in process.env — never expose provider keys to the client.
 */

const parseBool = (val, defaultValue = false) => {
  if (val === undefined || val === null || val === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(String(val).toLowerCase());
};

const parseIntEnv = (val, defaultValue) => {
  const n = parseInt(val, 10);
  return Number.isFinite(n) ? n : defaultValue;
};

const parseFloatEnv = (val, defaultValue) => {
  const n = parseFloat(val);
  return Number.isFinite(n) ? n : defaultValue;
};

const propertyIntelligenceConfig = {
  enabled: parseBool(process.env.PROPERTY_INTELLIGENCE_ENABLED, true),

  providers: {
    propertyData: {
      enabled: parseBool(process.env.PROPERTYDATA_ENABLED, false),
      apiKey: process.env.PROPERTYDATA_API_KEY || '',
      baseUrl: process.env.PROPERTYDATA_BASE_URL || 'https://api.propertydata.co.uk',
      timeoutMs: parseIntEnv(process.env.PROPERTYDATA_TIMEOUT_MS, 15000),
    },
    sprift: {
      enabled: parseBool(process.env.SPRIFT_ENABLED, false),
      apiKey: process.env.SPRIFT_API_KEY || '',
    },
    hometrack: {
      enabled: parseBool(process.env.HOMETRACK_ENABLED, false),
      clientId: process.env.HOMETRACK_CLIENT_ID || '',
      clientSecret: process.env.HOMETRACK_CLIENT_SECRET || '',
    },
    environmentAgencyFlood: {
      enabled: parseBool(process.env.ENVIRONMENT_AGENCY_FLOOD_ENABLED, true),
      timeoutMs: parseIntEnv(process.env.ENVIRONMENT_AGENCY_FLOOD_TIMEOUT_MS, 15000),
      baseUrl:
        process.env.ENVIRONMENT_AGENCY_FLOOD_BASE_URL ||
        'https://environment.data.gov.uk/KB6uNVj5ZcJr7jUP/ArcGIS/rest/services/Flood_Map_for_Planning/FeatureServer',
    },
    planningData: {
      enabled: parseBool(process.env.PLANNING_DATA_ENABLED, true),
      timeoutMs: parseIntEnv(process.env.PLANNING_DATA_TIMEOUT_MS, 15000),
      baseUrl: process.env.PLANNING_DATA_BASE_URL || 'https://www.planning.data.gov.uk',
      searchRadiusMetres: parseIntEnv(process.env.PLANNING_DATA_SEARCH_RADIUS_M, 400),
    },
    educationalEstablishment: {
      enabled: parseBool(process.env.EDUCATIONAL_ESTABLISHMENT_ENABLED, true),
      timeoutMs: parseIntEnv(process.env.EDUCATIONAL_ESTABLISHMENT_TIMEOUT_MS, 15000),
      baseUrl: process.env.EDUCATIONAL_ESTABLISHMENT_BASE_URL || 'https://www.planning.data.gov.uk',
      searchRadiusMetres: parseIntEnv(process.env.EDUCATIONAL_ESTABLISHMENT_SEARCH_RADIUS_M, 800),
    },
    listedBuilding: {
      enabled: parseBool(process.env.LISTED_BUILDING_ENABLED, true),
      timeoutMs: parseIntEnv(process.env.LISTED_BUILDING_TIMEOUT_MS, 15000),
      baseUrl: process.env.LISTED_BUILDING_BASE_URL || 'https://www.planning.data.gov.uk',
      searchRadiusMetres: parseIntEnv(process.env.LISTED_BUILDING_SEARCH_RADIUS_M, 25),
    },
    conservationArea: {
      enabled: parseBool(process.env.CONSERVATION_AREA_ENABLED, true),
      timeoutMs: parseIntEnv(process.env.CONSERVATION_AREA_TIMEOUT_MS, 15000),
      baseUrl: process.env.CONSERVATION_AREA_BASE_URL || 'https://www.planning.data.gov.uk',
    },
    article4: {
      enabled: parseBool(process.env.ARTICLE_4_ENABLED, true),
      timeoutMs: parseIntEnv(process.env.ARTICLE_4_TIMEOUT_MS, 15000),
      baseUrl: process.env.ARTICLE_4_BASE_URL || 'https://www.planning.data.gov.uk',
    },
  },

  /**
   * Provider-cost protection. Does not consume AI generation credits.
   * Limits paid identity/UPRN executions per user. Cache hits do not count.
   */
  providerProtection: {
    minLookupQueryLength: parseIntEnv(process.env.PROVIDER_LOOKUP_MIN_QUERY_LENGTH, 3),
    expensiveEndpoints: ['address-match-uprn', 'uprn'],
    maxPaidExecutionsPerUserHour: parseIntEnv(
      process.env.PROVIDER_PAID_EXECUTIONS_PER_USER_HOUR,
      40
    ),
    quotaWindowMs: parseIntEnv(process.env.PROVIDER_QUOTA_WINDOW_MS, 60 * 60 * 1000),
    identityResolution: {
      uniqueUprnOnly: true,
      analysePaysForUprn: false,
      creditsPerAddressMatch: 10,
      doNotInferUprnFromPostcode: true,
    },
  },

  /** Cache TTL in milliseconds */
  cacheTtl: {
    identity: parseIntEnv(process.env.CACHE_TTL_IDENTITY_MS, 30 * 24 * 60 * 60 * 1000),
    uprnProfile: parseIntEnv(process.env.CACHE_TTL_UPRN_PROFILE_MS, 30 * 24 * 60 * 60 * 1000),
    soldPrices: parseIntEnv(process.env.CACHE_TTL_SOLD_PRICES_MS, 30 * 24 * 60 * 60 * 1000),
    soldPricesPerSqf: parseIntEnv(process.env.CACHE_TTL_SOLD_PSF_MS, 30 * 24 * 60 * 60 * 1000),
    rents: parseIntEnv(process.env.CACHE_TTL_RENTS_MS, 24 * 60 * 60 * 1000),
    marketDemand: parseIntEnv(process.env.CACHE_TTL_MARKET_DEMAND_MS, 24 * 60 * 60 * 1000),
    valuation: parseIntEnv(process.env.CACHE_TTL_VALUATION_MS, 7 * 24 * 60 * 60 * 1000),
    flood: parseIntEnv(process.env.CACHE_TTL_FLOOD_MS, 30 * 24 * 60 * 60 * 1000),
    planning: parseIntEnv(process.env.CACHE_TTL_PLANNING_MS, 24 * 60 * 60 * 1000),
    schools: parseIntEnv(process.env.CACHE_TTL_SCHOOLS_MS, 24 * 60 * 60 * 1000),
    listedBuilding: parseIntEnv(process.env.CACHE_TTL_LISTED_BUILDING_MS, 30 * 24 * 60 * 60 * 1000),
    conservationArea: parseIntEnv(process.env.CACHE_TTL_CONSERVATION_AREA_MS, 30 * 24 * 60 * 60 * 1000),
    article4: parseIntEnv(process.env.CACHE_TTL_ARTICLE_4_MS, 30 * 24 * 60 * 60 * 1000),
  },

  /**
   * Confidence model tunables. Versioned so any stated level can be reproduced:
   * the effective values are stamped onto every assessment. Override only with a
   * matching version bump, and re-run server/tests/confidenceSensitivity.test.js —
   * the thresholds are justified by sensitivity boundaries, not taste.
   */
  confidence: {
    /**
     * Share of total factor weight that must be measurable before any level is
     * stated. Must sit above the weight of dataCompleteness + providerCoverage
     * (0.10 — paperwork and provider presence are not evidence) and at or below
     * sampleSize + similarity (0.38 — real comparable evidence must be assessable).
     */
    minAssessableWeight: parseFloatEnv(process.env.CONFIDENCE_MIN_ASSESSABLE_WEIGHT, 0.35),
    /** Internal index at or above which the level is High. */
    highThreshold: parseIntEnv(process.env.CONFIDENCE_HIGH_THRESHOLD, 78),
    /** Internal index at or above which the level is Medium. */
    mediumThreshold: parseIntEnv(process.env.CONFIDENCE_MEDIUM_THRESHOLD, 55),
  },

  /** PropertyData API credit costs (for usage tracking) — from official docs */
  providerCredits: {
    propertydata: {
      'address-match-uprn': 10,
      uprn: 10,
      'sold-prices': 1,
      'sold-prices-per-sqf': 1,
      'valuation-sale': 1,
      rents: 1,
      demand: 1,
      'demand-rent': 1,
      'valuation-rent': 1,
      uprns: 1,
    },
  },
};

function isPropertyDataConfigured() {
  const pd = propertyIntelligenceConfig.providers.propertyData;
  return pd.enabled && Boolean(pd.apiKey);
}

function getPropertyDataSetupStatus() {
  const pd = propertyIntelligenceConfig.providers.propertyData;
  if (!pd.enabled) {
    return {
      configured: false,
      reason: 'disabled',
      message: 'PropertyData is disabled. Set PROPERTYDATA_ENABLED=true in server/.env',
    };
  }
  if (!pd.apiKey) {
    return {
      configured: false,
      reason: 'missing_api_key',
      message:
        'PropertyData API key is missing. Add PROPERTYDATA_API_KEY=your_key to server/.env and restart the server.',
    };
  }
  return { configured: true, reason: 'ok', message: 'PropertyData is configured' };
}

function isExternalEnrichmentAvailable() {
  return (
    propertyIntelligenceConfig.enabled &&
    (isPropertyDataConfigured() ||
      propertyIntelligenceConfig.providers.sprift.enabled ||
      propertyIntelligenceConfig.providers.hometrack.enabled)
  );
}

module.exports = {
  propertyIntelligenceConfig,
  isPropertyDataConfigured,
  getPropertyDataSetupStatus,
  isExternalEnrichmentAvailable,
};
