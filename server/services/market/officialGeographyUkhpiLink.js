/**
 * Identity bridge for a later analytics phase.
 * Resolves a postcode to a UKHPI geography code and the effective observations.
 * Does not calculate growth, rank, or a forecast.
 */

const { MARKET_RECORD_KIND } = require('../../architecture/officialMarketDataset');

async function linkPostcodeToUkhpi(postcode, geographyStore, ukhpiStore) {
  const lookup = await geographyStore.lookupByPostcode(postcode);
  const geographyCode = lookup.geography?.ukhpiGeographyCode || null;
  if (!lookup.matched || !geographyCode) {
    return {
      lookup,
      geographyCode,
      observations: [],
      growthCalculated: false,
      derivedMetric: null,
      recordKind: MARKET_RECORD_KIND.OFFICIAL_OBSERVATION,
    };
  }
  const query = await ukhpiStore.queryObservations({
    geographyCode,
    selection: 'effective',
  });
  return {
    lookup,
    geographyCode,
    observations: query.observations,
    growthCalculated: false,
    derivedMetric: null,
    recordKind: MARKET_RECORD_KIND.OFFICIAL_OBSERVATION,
  };
}

module.exports = {
  linkPostcodeToUkhpi,
};
