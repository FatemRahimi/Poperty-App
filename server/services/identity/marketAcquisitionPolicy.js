/**
 * Deterministic market-provider routing.
 * Applicability decides which paid residential endpoints may run.
 * Does not invent valuations or add providers.
 */

const { residentialMethodologyGate } = require('./assetClassificationRuntime');
const { isResidentialRentsEligible } = require('../providers/propertyData/propertyTypeMapping');

const MARKET_ACQUISITION_VERSION = 'market-acquisition-1.0.0';

function resolveMarketAcquisitionPolicy({ classification = {}, property = {} } = {}) {
  const gate = residentialMethodologyGate(classification);
  const residentialMethodologyAllowed = gate.allowed === true;

  return Object.freeze({
    version: MARKET_ACQUISITION_VERSION,
    assetClass: gate.assetClass,
    methodologyGate: gate,
    residentialMethodologyAllowed,
    fetchIdentity: true,
    fetchUprnProfile: true,
    fetchSoldPrices: true,
    fetchSoldPricesPerSqf: true,
    fetchDemand: true,
    fetchRents: residentialMethodologyAllowed && isResidentialRentsEligible(property),
    fetchDemandRent: residentialMethodologyAllowed,
    fetchSaleValuation: residentialMethodologyAllowed,
    skipResidentialAvm: !residentialMethodologyAllowed,
    skipResidentialRents: !residentialMethodologyAllowed,
    notes: residentialMethodologyAllowed
      ? 'Residential AVM/rent endpoints remain eligible under the current methodology gate.'
      : `Residential AVM, rents, and rental-demand endpoints are skipped for proven ${gate.assetClass}.`,
  });
}

function acquisitionFromContext(context = {}, property = {}) {
  if (context.acquisition && typeof context.acquisition === 'object') {
    return context.acquisition;
  }
  return resolveMarketAcquisitionPolicy({
    classification: context.classification || property.assetClassification || {},
    property,
  });
}

module.exports = {
  MARKET_ACQUISITION_VERSION,
  resolveMarketAcquisitionPolicy,
  acquisitionFromContext,
};
