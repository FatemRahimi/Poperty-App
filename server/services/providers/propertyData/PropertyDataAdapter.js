/**
 * PropertyData provider adapter — identity, market data, and valuation capabilities.
 * Endpoints documented at https://propertydata.co.uk/api/documentation
 */

const PropertyDataClient = require('./PropertyDataClient');
const {
  buildValuationSaleRequest,
  buildSoldPricesQueryParams,
  buildRentsQueryParams,
  buildDemandQueryParams,
  buildDemandRentQueryParams,
  omitAbsentProviderParams,
} = require('./propertyTypeMapping');
const { propertyIntelligenceConfig } = require('../../../config/propertyIntelligence.config');
const { createProvenance } = require('../../../utils/provenance');
const { buildPropertyDataSearchAddress, buildPropertyDataSearchAddressFromQuery, inferMatchConfidenceFromRank, normalizeIdentitySearchAddress } = require('../../../utils/ukAddress');
const { selectUniqueUprnMatch } = require('../../../architecture/canonicalIdentity');
const {
  buildCacheKey,
  getCachedResponse,
  setCachedResponse,
} = require('../cache/DataProviderCache');
const { logProviderUsage } = require('../cache/usageLogger');
const { coalesceCachedProviderRequest } = require('../cache/providerExecutionGuard');
const { classifyProviderFailure, logProviderCostEvent } = require('../cache/providerCostProtection');

const PROVIDER = 'propertydata';

class PropertyDataAdapter {
  constructor() {
    this.client = new PropertyDataClient();
  }

  isAvailable() {
    return this.client.isConfigured();
  }

  getCapabilities() {
    return [
      'identity',
      'uprn_profile',
      'sold_prices',
      'sold_prices_per_sqf',
      'valuation_sale',
      'rents',
      'demand',
      'demand_rent',
    ];
  }

  async _cachedRequest(endpoint, params, { ttlMs, userId, propertyId }) {
    params = omitAbsentProviderParams(params);
    const cacheKey = buildCacheKey(PROVIDER, endpoint, params);
    const started = Date.now();
    const creditsUsed = this.client.getEndpointCreditCost(endpoint);

    try {
      const coalesced = await coalesceCachedProviderRequest({
        cacheKey,
        getCached: async (key) => {
          const cached = await getCachedResponse(key);
          if (!cached) return null;
          return {
            cacheEnvelope: true,
            data: cached.data,
            retrievedAt: cached.retrievedAt,
          };
        },
        useSharedLock: true,
        execute: () => this.client.request(endpoint, params),
        setCached: (data) =>
          setCachedResponse({
            cacheKey,
            provider: PROVIDER,
            endpoint,
            response: data?.cacheEnvelope ? data.data : data,
            ttlMs,
            creditsUsed,
          }),
      });

      const cacheHit = coalesced.outcome !== 'provider_execution';
      const envelope = coalesced.result && coalesced.result.cacheEnvelope;
      const data = envelope ? coalesced.result.data : coalesced.result;
      const retrievedAt =
        envelope && coalesced.result.retrievedAt
          ? new Date(coalesced.result.retrievedAt).toISOString()
          : new Date().toISOString();
      logProviderCostEvent({
        event: 'request',
        provider: PROVIDER,
        endpoint,
        outcome: coalesced.outcome,
        userId,
      });
      await logProviderUsage({
        userId,
        propertyId,
        provider: PROVIDER,
        endpoint,
        cacheHit,
        creditsUsed: cacheHit ? 0 : creditsUsed,
        success: true,
        latencyMs: Date.now() - started,
      });

      return {
        data,
        cacheHit,
        endpoint,
        provider: PROVIDER,
        creditsUsed: cacheHit ? 0 : creditsUsed,
        retrievedAt,
        outcome: coalesced.outcome,
      };
    } catch (error) {
      const classified = classifyProviderFailure(error);
      logProviderCostEvent({
        event: 'provider_failure',
        provider: PROVIDER,
        endpoint,
        outcome: classified.usageCode,
        userId,
      });
      await logProviderUsage({
        userId,
        propertyId,
        provider: PROVIDER,
        endpoint,
        cacheHit: false,
        creditsUsed: 0,
        success: false,
        errorMessage: classified.usageCode,
        latencyMs: Date.now() - started,
      });
      const safe = new Error(classified.message);
      safe.code = classified.code;
      throw safe;
    }
  }

  /**
   * Match address to UPRN — 10 credits per call.
   * GET /address-match-uprn?key=&address=
   */
  async resolveIdentity(property, context = {}) {
    const address = normalizeIdentitySearchAddress(
      property.searchAddress ||
        (property.address_line1 && !property.house_number && !property.street_name
          ? buildPropertyDataSearchAddressFromQuery(property.address_line1)
          : '') ||
        buildPropertyDataSearchAddress(property)
    );
    if (!address || address.length < 8) {
      return {
        success: false,
        message: 'Insufficient address data for UPRN resolution',
        provider: PROVIDER,
      };
    }

    const result = await this._cachedRequest(
      'address-match-uprn',
      { address },
      {
        ttlMs: propertyIntelligenceConfig.cacheTtl.identity,
        userId: context.userId,
        propertyId: context.propertyId || property.id,
      }
    );

    const matches = result.data?.results || result.data?.data || result.data?.matches || [];
    const list = Array.isArray(matches) ? matches : [];
    const unique = selectUniqueUprnMatch(list);

    if (!unique.unique) {
      return {
        success: false,
        unresolved: true,
        reason: unique.reason || 'NO_UPRN',
        message: unique.reason === 'MULTIPLE_CANDIDATE_UPRNS'
          ? 'Multiple UPRN candidates; none selected'
          : 'No UPRN match returned from PropertyData',
        provider: PROVIDER,
        uprn: null,
        alternativeMatches: list.slice(0, 8),
        candidateUprns: unique.candidateUprns,
        candidateCount: unique.candidateCount,
        matchMethod: unique.reason === 'MULTIPLE_CANDIDATE_UPRNS'
          ? 'unresolved_multiple_uprn'
          : 'unresolved_no_uprn',
        cacheHit: result.cacheHit,
        creditsUsed: result.creditsUsed,
      };
    }

    const best = unique.match || list.find((row) => String(row?.uprn || '').trim() === unique.uprn);
    const confidence = inferMatchConfidenceFromRank(0, 1);

    return {
      success: true,
      provider: PROVIDER,
      uprn: String(unique.uprn),
      address: best?.address || address,
      latitude: best?.latitude ?? best?.lat ?? null,
      longitude: best?.longitude ?? best?.lng ?? null,
      classificationCode: best?.classificationCode || null,
      classificationCodeDesc: best?.classificationCodeDesc || null,
      matchConfidence: confidence,
      matchMethod: 'propertydata_unique_uprn',
      uniqueUprn: true,
      alternativeMatches: [],
      provenance: createProvenance({
        source: 'PropertyData',
        method: 'address_match_uprn',
        providerEndpoint: '/address-match-uprn',
        retrievedAt: result.retrievedAt || new Date(),
        confidence,
        notes: 'Persisted only because exactly one distinct UPRN was returned. Not VERIFIED_EXACT. Not title identity.',
      }),
      cacheHit: result.cacheHit,
      creditsUsed: result.creditsUsed,
    };
  }

  /**
   * UPRN profile — 10 credits per call.
   * GET /uprn?key=&uprn=
   */
  async getUprnProfile(uprn, context = {}) {
    if (!uprn) {
      return { success: false, message: 'UPRN required', provider: PROVIDER };
    }

    const result = await this._cachedRequest(
      'uprn',
      { uprn: String(uprn) },
      {
        ttlMs: propertyIntelligenceConfig.cacheTtl.uprnProfile,
        userId: context.userId,
        propertyId: context.propertyId,
      }
    );

    return {
      success: true,
      provider: PROVIDER,
      uprn: String(uprn),
      profile: result.data,
      provenance: createProvenance({
        source: 'PropertyData',
        method: 'uprn_profile',
        providerEndpoint: '/uprn',
        retrievedAt: result.retrievedAt || new Date(),
        notes: 'Includes HM Land Registry and EPC-derived fields where available',
      }),
      cacheHit: result.cacheHit,
      creditsUsed: result.creditsUsed,
    };
  }

  /**
   * Local sold prices — 1 credit.
   * GET /sold-prices?key=&postcode=&bedrooms=&property_type= (filters optional)
   */
  async getSoldPrices(postcode, context = {}, filters = {}) {
    const params = buildSoldPricesQueryParams(postcode, filters);
    if (!params) return { success: false, message: 'Postcode required', provider: PROVIDER };
    const pc = params.postcode;

    const result = await this._cachedRequest(
      'sold-prices',
      params,
      {
        ttlMs: propertyIntelligenceConfig.cacheTtl.soldPrices,
        userId: context.userId,
        propertyId: context.propertyId,
      }
    );

    return {
      success: true,
      provider: PROVIDER,
      postcode: pc,
      data: result.data,
      provenance: createProvenance({
        source: 'PropertyData',
        method: 'sold_prices',
        providerEndpoint: '/sold-prices',
        notes: params.property_type
          ? 'Derived from HM Land Registry price paid data'
          : 'property_type filter omitted because type was unavailable; not defaulted to flat. Results are postcode-wide. Derived from HM Land Registry price paid data.',
      }),
      cacheHit: result.cacheHit,
      creditsUsed: result.creditsUsed,
    };
  }

  /**
   * Local sold £/sqft — 1 credit.
   * GET /sold-prices-per-sqf?key=&postcode=
   */
  async getSoldPricesPerSqf(postcode, context = {}, filters = {}) {
    const params = buildSoldPricesQueryParams(postcode, filters);
    if (!params) return { success: false, message: 'Postcode required', provider: PROVIDER };
    const pc = params.postcode;

    const result = await this._cachedRequest(
      'sold-prices-per-sqf',
      params,
      {
        ttlMs: propertyIntelligenceConfig.cacheTtl.soldPricesPerSqf,
        userId: context.userId,
        propertyId: context.propertyId,
      }
    );

    return {
      success: true,
      provider: PROVIDER,
      postcode: pc,
      data: result.data,
      provenance: createProvenance({
        source: 'PropertyData',
        method: 'sold_prices_per_sqf',
        providerEndpoint: '/sold-prices-per-sqf',
        notes: params.property_type
          ? 'HM Land Registry + MHCLG EPC matched data'
          : 'property_type filter omitted because type was unavailable; not defaulted to flat. Results are postcode-wide.',
      }),
      cacheHit: result.cacheHit,
      creditsUsed: result.creditsUsed,
    };
  }

  /**
   * Area long-let asking rents — live portal listings, not achieved lettings.
   * GET /rents?key=&postcode=&bedrooms=&type=
   */
  async getRents(postcode, context = {}, filters = {}) {
    const params = buildRentsQueryParams(postcode, filters);
    if (!params) return { success: false, message: 'Postcode required', provider: PROVIDER };

    const result = await this._cachedRequest('rents', params, {
      ttlMs: propertyIntelligenceConfig.cacheTtl.rents,
      userId: context.userId,
      propertyId: context.propertyId,
    });

    const filtered = params.bedrooms != null || params.type;
    return {
      success: true,
      provider: PROVIDER,
      postcode: params.postcode,
      data: result.data,
      provenance: createProvenance({
        source: 'PropertyData',
        method: 'rents_asking_long_let',
        providerEndpoint: '/rents',
        retrievedAt: result.retrievedAt || new Date(),
        notes: filtered
          ? 'Area long-let asking rents from live portal listings. Not achieved lettings. Not a property-specific rental valuation.'
          : 'Bedrooms/type filters omitted because they were unavailable; type was not defaulted to flat. Broad-area long-let asking rents. Not achieved lettings.',
      }),
      cacheHit: result.cacheHit,
      creditsUsed: result.creditsUsed,
    };
  }

  /**
   * Area sales-market demand/liquidity — not property-specific, not rental demand.
   * GET /demand?key=&postcode=
   */
  async getDemand(postcode, context = {}) {
    const params = buildDemandQueryParams(postcode);
    if (!params) return { success: false, message: 'Postcode required', provider: PROVIDER };

    const result = await this._cachedRequest('demand', params, {
      ttlMs: propertyIntelligenceConfig.cacheTtl.marketDemand,
      userId: context.userId,
      propertyId: context.propertyId,
    });

    return {
      success: true,
      provider: PROVIDER,
      postcode: params.postcode,
      data: result.data,
      provenance: createProvenance({
        source: 'PropertyData',
        method: 'demand_area_buyer_market',
        providerEndpoint: '/demand',
        retrievedAt: result.retrievedAt || new Date(),
        notes:
          'Area sales-market snapshot. demand_rating is a provider market-balance label for the surrounding area, not property-specific demand and not rental demand.',
      }),
      cacheHit: result.cacheHit,
      creditsUsed: result.creditsUsed,
    };
  }

  /**
   * Area rental-market demand/liquidity — not property-specific tenant demand,
   * not sales /demand, not rent valuation.
   * GET /demand-rent?key=&postcode=
   */
  async getDemandRent(postcode, context = {}) {
    const params = buildDemandRentQueryParams(postcode);
    if (!params) return { success: false, message: 'Postcode required', provider: PROVIDER };

    const result = await this._cachedRequest('demand-rent', params, {
      ttlMs: propertyIntelligenceConfig.cacheTtl.marketDemand,
      userId: context.userId,
      propertyId: context.propertyId,
    });

    return {
      success: true,
      provider: PROVIDER,
      postcode: params.postcode,
      data: result.data,
      provenance: createProvenance({
        source: 'PropertyData',
        method: 'demand_area_rental_market',
        providerEndpoint: '/demand-rent',
        retrievedAt: result.retrievedAt || new Date(),
        notes:
          'Area rental-market snapshot. rental_demand_rating is a provider market-balance label for the surrounding area, not property-specific tenant demand, not sales /demand, and not rent valuation.',
      }),
      cacheHit: result.cacheHit,
      creditsUsed: result.creditsUsed,
    };
  }

  /**
   * Sale valuation AVM — 1 credit when sufficient property attributes exist.
   * GET /valuation-sale
   */
  async getSaleValuation(property, context = {}) {
    const request = buildValuationSaleRequest(property);
    if (!request.params || !request.canRequestAvm) {
      return {
        success: false,
        message: request.type?.available
          ? 'Insufficient property attributes for PropertyData sale valuation (postcode + internal_area >= 300 sqft required)'
          : 'Property type was unavailable and was not defaulted to flat. Sale AVM skipped because PropertyData requires a mapped property_type.',
        provider: PROVIDER,
        unavailable: request.unavailable,
        provenance: request.type?.provenance || request.construction?.provenance || null,
      };
    }

    const params = request.params;
    const result = await this._cachedRequest('valuation-sale', params, {
      ttlMs: propertyIntelligenceConfig.cacheTtl.valuation,
      userId: context.userId,
      propertyId: context.propertyId || property.id,
    });

    return {
      success: true,
      provider: PROVIDER,
      valuation: result.data,
      inputParams: params,
      unavailable: request.unavailable,
      provenance: createProvenance({
        source: 'PropertyData',
        method: 'valuation_sale_avm',
        providerEndpoint: '/valuation-sale',
        retrievedAt: result.retrievedAt || new Date(),
        notes: params.construction_date
          ? 'PropertyData AVM using market £/sqft data'
          : 'construction_date omitted because build year was unavailable; age was not inferred from style, postcode or listing copy.',
      }),
      cacheHit: result.cacheHit,
      creditsUsed: result.creditsUsed,
    };
  }
}

module.exports = PropertyDataAdapter;
