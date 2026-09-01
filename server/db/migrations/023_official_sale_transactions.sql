-- Official completed-sale transactions (HMLR Price Paid Data).
-- Offline ingest only. Not a valuation, comparable, or title register.
-- UPRN is not a title number. INSPIRE ID is not a title number.

CREATE TABLE IF NOT EXISTS official_sale_import_runs (
  id SERIAL PRIMARY KEY,
  source VARCHAR(40) NOT NULL DEFAULT 'HMLR_PRICE_PAID_DATA',
  release_label VARCHAR(80),
  ppd_path TEXT,
  uprn_path TEXT,
  inspire_path TEXT,
  status VARCHAR(40) NOT NULL DEFAULT 'STARTED',
  rows_processed INTEGER NOT NULL DEFAULT 0,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  unchanged_count INTEGER NOT NULL DEFAULT 0,
  deleted_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  invalid_count INTEGER NOT NULL DEFAULT 0,
  uprn_matched_count INTEGER NOT NULL DEFAULT 0,
  inspire_matched_count INTEGER NOT NULL DEFAULT 0,
  failure_reason TEXT,
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP,
  duration_ms INTEGER
);

CREATE TABLE IF NOT EXISTS official_sale_transactions (
  id BIGSERIAL PRIMARY KEY,
  source VARCHAR(40) NOT NULL DEFAULT 'HMLR_PRICE_PAID_DATA',
  source_transaction_id VARCHAR(80) NOT NULL,
  record_status VARCHAR(8),
  live BOOLEAN NOT NULL DEFAULT true,
  price_gbp NUMERIC,
  price_present BOOLEAN NOT NULL DEFAULT false,
  transfer_date DATE,
  postcode VARCHAR(12),
  postcode_compact VARCHAR(12),
  property_type_code VARCHAR(8),
  new_build_indicator VARCHAR(8),
  tenure_code VARCHAR(8),
  paon TEXT,
  saon TEXT,
  street TEXT,
  locality TEXT,
  town_city TEXT,
  district TEXT,
  county TEXT,
  category_type VARCHAR(8),
  uprn VARCHAR(20),
  inspire_id VARCHAR(40),
  match_method VARCHAR(40),
  dataset_version VARCHAR(80),
  imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  retrieved_at TIMESTAMP,
  evidence_as_of DATE,
  provenance JSONB NOT NULL DEFAULT '{}',
  limitations JSONB NOT NULL DEFAULT '[]',
  UNIQUE (source, source_transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_official_sale_tx_uprn
  ON official_sale_transactions (uprn)
  WHERE live AND uprn IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_official_sale_tx_postcode
  ON official_sale_transactions (postcode_compact)
  WHERE live AND postcode_compact IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_official_sale_tx_date
  ON official_sale_transactions (transfer_date DESC)
  WHERE live;

CREATE INDEX IF NOT EXISTS idx_official_sale_tx_address
  ON official_sale_transactions (postcode_compact, paon)
  WHERE live AND postcode_compact IS NOT NULL AND paon IS NOT NULL;

COMMENT ON TABLE official_sale_transactions IS
  'Canonical official completed-sale transactions. Transaction is not a comparable. UPRN is not title. INSPIRE ID is not title number. England and Wales Price Paid coverage.';
COMMENT ON TABLE official_sale_import_runs IS
  'Audit log for offline HMLR Price Paid imports. User analyse must not download the national dataset.';
