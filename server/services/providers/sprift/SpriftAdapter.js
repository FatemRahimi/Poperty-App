/**
 * Sprift adapter stub — enable when SPRIFT_ENABLED=true and credentials are configured.
 * Designed for future premium agency/professional data without duplicating PropertyData calls.
 */

const { propertyIntelligenceConfig } = require('../../../config/propertyIntelligence.config');

class SpriftAdapter {
  isAvailable() {
    const cfg = propertyIntelligenceConfig.providers.sprift;
    return cfg.enabled && Boolean(cfg.apiKey);
  }

  getCapabilities() {
    return this.isAvailable()
      ? ['identity', 'comparables', 'planning', 'environmental_risk', 'valuation']
      : [];
  }

  async resolveIdentity() {
    return {
      success: false,
      available: false,
      provider: 'sprift',
      message: 'Sprift integration is not yet connected. Configure SPRIFT_API_KEY when licensed.',
    };
  }

  async getPropertyProfile() {
    return {
      success: false,
      available: false,
      provider: 'sprift',
      message: 'Sprift property profile not yet implemented',
    };
  }
}

module.exports = SpriftAdapter;
