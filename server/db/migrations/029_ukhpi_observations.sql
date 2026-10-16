-- UK House Price Index observations.
-- Separate from official_sale_transactions. An index row is not a sale.
-- No address fields. Missing metrics stay null. This file does not download data.

CREATE TABLE IF NOT EXISTS ukhpi_import_runs (
  id SERIAL PRIMARY KEY,
  source VARCHAR(40) NOT NULL DEFAULT 'UK_HOUSE_PRICE_INDEX',
  dataset VARCHAR(80) NOT NULL DEFAULT 'UK House Price Index',
  release_label VARCHAR(80),
  status VARCHAR(40) NOT NULL DEFAULT 'STARTED',
  rows_processed INTEGER NOT NULL DEFAULT 0,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  unchanged_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  conflict_count INTEGER NOT NULL DEFAULT 0,
  failure_reason TEXT,
  provenance JSONB NOT NULL DEFAULT '{}',
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP,
  duration_ms INTEGER
);

CREATE TABLE IF NOT EXISTS ukhpi_observations (
  id BIGSERIAL PRIMARY KEY,
  source VARCHAR(40) NOT NULL DEFAULT 'UK_HOUSE_PRICE_INDEX',
  dataset VARCHAR(80) NOT NULL DEFAULT 'UK House Price Index',
  geography_code VARCHAR(20) NOT NULL,
  geography_name TEXT,
  geography_type VARCHAR(40),
  observation_date DATE NOT NULL,
  index_value NUMERIC,
  average_price NUMERIC,
  annual_change NUMERIC,
  monthly_change NUMERIC,
  property_category VARCHAR(40) NOT NULL DEFAULT 'all',
  release_label VARCHAR(80),
  content_fingerprint CHAR(64) NOT NULL,
  ingested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  provenance JSONB NOT NULL DEFAULT '{}',
  UNIQUE (source, geography_code, observation_date, property_category)
);

CREATE INDEX IF NOT EXISTS idx_ukhpi_observations_date
  ON ukhpi_observations (observation_date DESC);

COMMENT ON TABLE ukhpi_observations IS
  'Official UKHPI time series. Not a sale transaction, not a property valuation, and not a growth forecast. Null metrics are unknown, not zero.';

COMMENT ON TABLE official_sale_transactions IS
  'Canonical official completed-sale transactions. Transaction is not a comparable. UPRN is not title. INSPIRE ID is not title number. England and Wales Price Paid coverage. Address columns (paon, saon, street, locality, town_city, district, county) may carry third-party rights and must not be used as a national gazetteer. Market analytics should use price, date, postcode, type, new-build, tenure, and record status.';
