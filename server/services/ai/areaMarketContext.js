/**
 * Area /demand and /demand-rent stay area context.
 * They are not property-specific demand, tenant demand, or a probability.
 */

function slimAreaDemand(evidence, { rental = false } = {}) {
  if (!evidence || evidence.available !== true) {
    return {
      available: false,
      state: 'notAssessed',
      role: 'context_only',
      geographicGranularity: 'area',
      notPropertySpecific: true,
      notTenantDemand: true,
      notSaleProbability: true,
      notLettingProbability: true,
      band: null,
      providerEndpoint: rental ? '/demand-rent' : '/demand',
    };
  }
  return {
    available: true,
    state: 'observed',
    role: 'context_only',
    geographicGranularity: evidence.scope || evidence.radius || 'postcode_or_radius',
    notPropertySpecific: true,
    notTenantDemand: true,
    notSaleProbability: true,
    notLettingProbability: true,
    band: evidence.band ?? null,
    providerEndpoint: evidence.providerEndpoint || (rental ? '/demand-rent' : '/demand'),
    retrievedAt: evidence.retrievedAt || null,
    observationPeriod: evidence.observationPeriod || null,
    sampleSize: evidence.sampleSize ?? null,
    confidence: evidence.confidence ?? null,
    source: evidence.source || 'PropertyData',
  };
}

function buildAreaMarketContext({ areaMarketDemand = null, areaRentalDemand = null } = {}) {
  return {
    role: 'context_only',
    notPropertySpecificDemand: true,
    notConnectedToLandlordDemandScore: true,
    salesDemand: slimAreaDemand(areaMarketDemand, { rental: false }),
    rentalDemand: slimAreaDemand(areaRentalDemand, { rental: true }),
  };
}

module.exports = { buildAreaMarketContext, slimAreaDemand };
