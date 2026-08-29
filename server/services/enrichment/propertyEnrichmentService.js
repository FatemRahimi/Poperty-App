/**
 * Property enrichment orchestrator — resolve identity, fetch external data, cache, persist.
 *
 * Architecture: Internal DB (system of record) + external provider enrichment layer.
 * Never replaces listing data; supplements intelligence with licensed external sources.
 */

const {
  isExternalEnrichmentAvailable,
  propertyIntelligenceConfig,
} = require('../../config/propertyIntelligence.config');
const {
  buildSoldPriceFilters,
  isResidentialRentsEligible,
} = require('../providers/propertyData/propertyTypeMapping');
const { applyPropertyDataEvidence } = require('../providers/propertyData/propertyDataEvidence');
const { getProviderRegistry } = require('../providers/ProviderRegistry');
const { mergeSources } = require('../../utils/provenance');
const { normalisePostcode } = require('../../utils/ukAddress');
const {
  findIdentityByPropertyId,
  upsertIdentity,
  createListingFallbackIdentity,
  findEnrichment,
  upsertEnrichment,
  listEnrichmentsForProperty,
} = require('./propertyIdentityRepository');

function ttlToExpiresAt(ttlMs) {
  return new Date(Date.now() + ttlMs);
}

async function resolvePropertyIdentity(property, context = {}) {
  const existing = await findIdentityByPropertyId(property.id);
  if (existing?.uprn && existing.match_confidence !== 'low') {
    return { success: true, identity: existing, fromCache: true };
  }

  const registry = getProviderRegistry();
  const identityProvider = registry.getPrimaryIdentityProvider();

  if (!identityProvider?.isAvailable()) {
    const fallback = existing || (await createListingFallbackIdentity(property));
    return {
      success: true,
      identity: fallback,
      fromCache: Boolean(existing),
      externalResolution: false,
      message: 'External identity provider unavailable — using listing address only',
    };
  }

  try {
    const resolved = await identityProvider.resolveIdentity(property, {
      userId: context.userId,
      propertyId: property.id,
    });

    if (!resolved.success) {
      const fallback = existing || (await createListingFallbackIdentity(property));
      return {
        success: true,
        identity: fallback,
        externalResolution: false,
        resolutionAttempt: resolved,
      };
    }

    const identity = await upsertIdentity({
      propertyId: property.id,
      uprn: resolved.uprn,
      normalizedAddress: resolved.address,
      postcode: normalisePostcode(property.zip_code || property.postcode),
      latitude: resolved.latitude || property.latitude,
      longitude: resolved.longitude || property.longitude,
      matchConfidence: resolved.matchConfidence,
      matchMethod: resolved.matchMethod,
      provider: resolved.provider,
      providerPayload: {
        classificationCode: resolved.classificationCode,
        classificationCodeDesc: resolved.classificationCodeDesc,
        alternativeMatches: resolved.alternativeMatches,
      },
    });

    return { success: true, identity, externalResolution: true, resolution: resolved };
  } catch (error) {
    const fallback = existing || (await createListingFallbackIdentity(property));
    return {
      success: true,
      identity: fallback,
      externalResolution: false,
      error: error.message,
    };
  }
}

async function fetchAndPersistEnrichment({
  property,
  enrichmentType,
  source,
  fetchFn,
  ttlMs,
  context,
}) {
  const cached = await findEnrichment(property.id, enrichmentType, source);
  if (cached) {
    return {
      success: true,
      enrichmentType,
      source,
      data: cached.payload,
      provenance: cached.provenance,
      fromPersistence: true,
    };
  }

  const fetched = await fetchFn();
  if (!fetched?.success) {
    return fetched;
  }

  const expiresAt = ttlToExpiresAt(ttlMs);
  await upsertEnrichment({
    propertyId: property.id,
    enrichmentType,
    source,
    payload: fetched.data || fetched.profile || fetched.valuation || fetched,
    provenance: fetched.provenance || { source, method: enrichmentType },
    expiresAt,
  });

  return {
    success: true,
    enrichmentType,
    source,
    data: fetched.data || fetched.profile || fetched.valuation,
    provenance: fetched.provenance,
    cacheHit: fetched.cacheHit,
    creditsUsed: fetched.creditsUsed || 0,
  };
}

/**
 * Fetch external intelligence bundle for a property analysis run.
 * Cost-conscious: postcode market data first; UPRN profile only when UPRN exists.
 */
async function enrichPropertyForIntelligence(property, context = {}) {
  if (!isExternalEnrichmentAvailable()) {
    return {
      available: false,
      enabled: propertyIntelligenceConfig.enabled,
      message: 'External enrichment disabled or no provider credentials configured',
      identity: await createListingFallbackIdentity(property),
      enrichments: {},
      sources: ['ApplicationDatabase'],
      partial: true,
    };
  }

  const registry = getProviderRegistry();
  const marketProvider = registry.getPrimaryMarketDataProvider();
  const ctx = { userId: context.userId, propertyId: property.id };

  const identityResult = await resolvePropertyIdentity(property, context);
  const identity = identityResult.identity;
  const enrichments = {};
  const errors = [];
  let totalCreditsUsed = 0;

  const postcode = normalisePostcode(property.zip_code || property.postcode || identity.postcode);

  if (marketProvider?.isAvailable() && postcode) {
    const soldFilters = buildSoldPriceFilters(property);
    for (const [type, method, ttlKey] of [
      ['sold_prices', 'getSoldPrices', 'soldPrices'],
      ['sold_prices_per_sqf', 'getSoldPricesPerSqf', 'soldPricesPerSqf'],
    ]) {
      try {
        const result = await fetchAndPersistEnrichment({
          property,
          enrichmentType: type,
          source: 'PropertyData',
          ttlMs: propertyIntelligenceConfig.cacheTtl[ttlKey],
          context: ctx,
          fetchFn: () => marketProvider[method](postcode, ctx, soldFilters),
        });
        enrichments[type] = result;
        if (result.creditsUsed) totalCreditsUsed += result.creditsUsed;
        if (!result.success) errors.push({ type, message: result.message });
      } catch (err) {
        errors.push({ type, message: err.message });
      }
    }

    if (isResidentialRentsEligible(property)) {
      const rentFilters = buildSoldPriceFilters(property);
      try {
        const rentsResult = await fetchAndPersistEnrichment({
          property,
          enrichmentType: 'rents',
          source: 'PropertyData',
          ttlMs: propertyIntelligenceConfig.cacheTtl.rents,
          context: ctx,
          fetchFn: () => marketProvider.getRents(postcode, ctx, rentFilters),
        });
        enrichments.rents = rentsResult;
        if (rentsResult.creditsUsed) totalCreditsUsed += rentsResult.creditsUsed;
        if (!rentsResult.success) errors.push({ type: 'rents', message: rentsResult.message });
      } catch (err) {
        errors.push({ type: 'rents', message: err.message });
      }
    }

    if (typeof marketProvider.getDemand === 'function') {
      try {
        const demandResult = await fetchAndPersistEnrichment({
          property,
          enrichmentType: 'demand',
          source: 'PropertyData',
          ttlMs: propertyIntelligenceConfig.cacheTtl.marketDemand,
          context: ctx,
          fetchFn: () => marketProvider.getDemand(postcode, ctx),
        });
        enrichments.demand = demandResult;
        if (demandResult.creditsUsed) totalCreditsUsed += demandResult.creditsUsed;
        if (!demandResult.success) errors.push({ type: 'demand', message: demandResult.message });
      } catch (err) {
        errors.push({ type: 'demand', message: err.message });
      }
    }

    if (typeof marketProvider.getDemandRent === 'function') {
      try {
        const demandRentResult = await fetchAndPersistEnrichment({
          property,
          enrichmentType: 'demand_rent',
          source: 'PropertyData',
          ttlMs: propertyIntelligenceConfig.cacheTtl.marketDemand,
          context: ctx,
          fetchFn: () => marketProvider.getDemandRent(postcode, ctx),
        });
        enrichments.demand_rent = demandRentResult;
        if (demandRentResult.creditsUsed) totalCreditsUsed += demandRentResult.creditsUsed;
        if (!demandRentResult.success) errors.push({ type: 'demand_rent', message: demandRentResult.message });
      } catch (err) {
        errors.push({ type: 'demand_rent', message: err.message });
      }
    }
  }

  if (marketProvider?.isAvailable() && identity?.uprn) {
    try {
      const uprnResult = await fetchAndPersistEnrichment({
        property,
        enrichmentType: 'uprn_profile',
        source: 'PropertyData',
        ttlMs: propertyIntelligenceConfig.cacheTtl.uprnProfile,
        context: ctx,
        fetchFn: () => marketProvider.getUprnProfile(identity.uprn, ctx),
      });
      enrichments.uprn_profile = uprnResult;
      if (uprnResult.creditsUsed) totalCreditsUsed += uprnResult.creditsUsed;
    } catch (err) {
      errors.push({ type: 'uprn_profile', message: err.message });
    }
  }

  if (marketProvider?.isAvailable() && property.category === 'sale') {
    const avmProperty = applyPropertyDataEvidence(property, { enrichments, identity }).property;
    try {
      const valResult = await fetchAndPersistEnrichment({
        property,
        enrichmentType: 'valuation_sale',
        source: 'PropertyData',
        ttlMs: propertyIntelligenceConfig.cacheTtl.valuation,
        context: ctx,
        fetchFn: () => marketProvider.getSaleValuation(avmProperty, ctx),
      });
      enrichments.valuation_sale = valResult;
      if (valResult.creditsUsed) totalCreditsUsed += valResult.creditsUsed;
      if (!valResult.success && valResult.message) {
        errors.push({ type: 'valuation_sale', message: valResult.message });
      }
    } catch (err) {
      errors.push({ type: 'valuation_sale', message: err.message });
    }
  }

  const sources = mergeSources(
    'ApplicationDatabase',
    identity?.provider === 'propertydata' ? 'PropertyData' : identity?.provider,
    enrichments.sold_prices?.success ? 'PropertyData' : null,
    enrichments.sold_prices?.provenance?.source === 'PropertyData' ? 'HM_Land_Registry' : null
  );

  return {
    available: true,
    enabled: true,
    identity,
    identityResolution: identityResult,
    enrichments,
    sources,
    errors,
    totalCreditsUsed,
    partial: errors.length > 0,
    providers: registry.getAvailableProviders(),
  };
}

module.exports = {
  resolvePropertyIdentity,
  enrichPropertyForIntelligence,
  listEnrichmentsForProperty,
};
