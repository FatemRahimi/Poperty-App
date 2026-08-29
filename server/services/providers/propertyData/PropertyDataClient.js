/**
 * Low-level PropertyData HTTP client.
 * Official API: https://api.propertydata.co.uk
 * Docs: https://propertydata.co.uk/api/documentation
 *
 * Authentication: `key` query parameter (server-side only).
 */

const { propertyIntelligenceConfig } = require('../../../config/propertyIntelligence.config');

const PROVIDER_NAME = 'propertydata';

class PropertyDataClient {
  constructor(config = propertyIntelligenceConfig.providers.propertyData) {
    this.config = config;
  }

  isConfigured() {
    return Boolean(this.config.enabled && this.config.apiKey);
  }

  async request(endpoint, params = {}, { timeoutMs } = {}) {
    if (!this.isConfigured()) {
      throw new Error('PropertyData is not configured. Set PROPERTYDATA_ENABLED=true and PROPERTYDATA_API_KEY.');
    }

    const url = new URL(`${this.config.baseUrl.replace(/\/$/, '')}/${endpoint.replace(/^\//, '')}`);
    url.searchParams.set('key', this.config.apiKey);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs || this.config.timeoutMs);

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });

      const text = await response.text();
      let data;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(`PropertyData returned non-JSON response (${response.status})`);
      }

      if (!response.ok) {
        const message = data.message || data.error || `PropertyData HTTP ${response.status}`;
        throw new Error(message);
      }

      if (data.status && data.status !== 'success') {
        const message = data.message || data.error || `PropertyData status: ${data.status}`;
        throw new Error(message);
      }

      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  getEndpointCreditCost(endpoint) {
    return propertyIntelligenceConfig.providerCredits.propertydata[endpoint] || 1;
  }

  get providerName() {
    return PROVIDER_NAME;
  }
}

module.exports = PropertyDataClient;
