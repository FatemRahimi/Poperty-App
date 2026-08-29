const { propertyIntelligenceConfig } = require('../../config/propertyIntelligence.config');
const PropertyDataAdapter = require('./propertyData/PropertyDataAdapter');
const SpriftAdapter = require('./sprift/SpriftAdapter');
const HometrackAdapter = require('./hometrack/HometrackAdapter');

let registryInstance = null;

class ProviderRegistry {
  constructor() {
    this.providers = {
      propertydata: new PropertyDataAdapter(),
      sprift: new SpriftAdapter(),
      hometrack: new HometrackAdapter(),
    };
  }

  get(name) {
    return this.providers[name] || null;
  }

  getAvailableProviders() {
    return Object.entries(this.providers)
      .filter(([, adapter]) => adapter.isAvailable())
      .map(([name, adapter]) => ({
        name,
        capabilities: adapter.getCapabilities(),
      }));
  }

  getPrimaryIdentityProvider() {
    if (this.providers.propertydata.isAvailable()) return this.providers.propertydata;
    if (this.providers.sprift.isAvailable()) return this.providers.sprift;
    return null;
  }

  getPrimaryMarketDataProvider() {
    if (this.providers.propertydata.isAvailable()) return this.providers.propertydata;
    if (this.providers.sprift.isAvailable()) return this.providers.sprift;
    return null;
  }
}

function getProviderRegistry() {
  if (!registryInstance) {
    registryInstance = new ProviderRegistry();
  }
  return registryInstance;
}

module.exports = {
  ProviderRegistry,
  getProviderRegistry,
  propertyIntelligenceConfig,
};
