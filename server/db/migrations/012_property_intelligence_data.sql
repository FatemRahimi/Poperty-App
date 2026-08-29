-- Phase 2: Property intelligence data layer (identity, enrichment, provider cache)

CREATE TABLE IF NOT EXISTS property_identities (
  id SERIAL PRIMARY KEY,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  uprn VARCHAR(20),
  normalized_address TEXT NOT NULL,
  postcode VARCHAR(12),
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  match_confidence VARCHAR(20) DEFAULT 'low',
  match_method VARCHAR(80) DEFAULT 'listing_fields',
  provider VARCHAR(50),
  provider_payload JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(property_id)
);

CREATE INDEX IF NOT EXISTS idx_property_identities_uprn ON property_identities(uprn);
CREATE INDEX IF NOT EXISTS idx_property_identities_postcode ON property_identities(postcode);

CREATE TABLE IF NOT EXISTS property_enrichments (
  id SERIAL PRIMARY KEY,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  enrichment_type VARCHAR(80) NOT NULL,
  source VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  provenance JSONB NOT NULL DEFAULT '{}',
  observed_at TIMESTAMP,
  retrieved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  UNIQUE(property_id, enrichment_type, source)
);

CREATE INDEX IF NOT EXISTS idx_property_enrichments_property_id ON property_enrichments(property_id);
CREATE INDEX IF NOT EXISTS idx_property_enrichments_type ON property_enrichments(enrichment_type);
CREATE INDEX IF NOT EXISTS idx_property_enrichments_expires ON property_enrichments(expires_at);

CREATE TABLE IF NOT EXISTS data_provider_cache (
  id SERIAL PRIMARY KEY,
  cache_key VARCHAR(512) UNIQUE NOT NULL,
  provider VARCHAR(50) NOT NULL,
  endpoint VARCHAR(100) NOT NULL,
  response JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'ok',
  hit_count INTEGER NOT NULL DEFAULT 0,
  credits_used INTEGER NOT NULL DEFAULT 0,
  retrieved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_data_provider_cache_provider ON data_provider_cache(provider);
CREATE INDEX IF NOT EXISTS idx_data_provider_cache_expires ON data_provider_cache(expires_at);

CREATE TABLE IF NOT EXISTS data_provider_usage (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
  provider VARCHAR(50) NOT NULL,
  endpoint VARCHAR(100) NOT NULL,
  cache_hit BOOLEAN NOT NULL DEFAULT false,
  credits_used INTEGER NOT NULL DEFAULT 0,
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  latency_ms INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_data_provider_usage_created ON data_provider_usage(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_data_provider_usage_provider ON data_provider_usage(provider);

COMMENT ON TABLE property_identities IS 'Resolved UK property identity (UPRN, normalized address) linked to internal listings';
COMMENT ON TABLE property_enrichments IS 'Persisted external property intelligence snapshots with provenance';
COMMENT ON TABLE data_provider_cache IS 'TTL cache for paid external property data API responses';
COMMENT ON TABLE data_provider_usage IS 'Observability log for external provider API calls';
