/**
 * Hometrack adapter stub — optional professional AVM when credentials exist.
 * Keep distinct from internal analytics and PropertyData estimates.
 */

const { propertyIntelligenceConfig } = require('../../../config/propertyIntelligence.config');

class HometrackAdapter {
  isAvailable() {
    const cfg = propertyIntelligenceConfig.providers.hometrack;
    return cfg.enabled && Boolean(cfg.clientId && cfg.clientSecret);
  }

  getCapabilities() {
    return this.isAvailable() ? ['professional_avm'] : [];
  }

  async getProfessionalValuation() {
    return {
      success: false,
      available: false,
      provider: 'hometrack',
      message: 'Hometrack professional valuation not yet connected. Requires HOMETRACK_CLIENT_ID and HOMETRACK_CLIENT_SECRET.',
    };
  }
}

module.exports = HometrackAdapter;
