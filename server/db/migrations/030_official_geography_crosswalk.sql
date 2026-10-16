-- Official postcode to geography-code crosswalk.
-- Codes are the identity. Names are labels. No coordinates and no map fallback.
-- A postcode is not a title, a UPRN, or a property boundary.

CREATE TABLE IF NOT EXISTS official_geography_import_runs (
  id SERIAL PRIMARY KEY,
  source VARCHAR(80) NOT NULL DEFAULT 'ONS_POSTCODE_DIRECTORY',
  dataset VARCHAR(120) NOT NULL DEFAULT 'ONS Postcode Directory',
  release_label VARCHAR(80),
  status VARCHAR(40) NOT NULL DEFAULT 'STARTED',
  rows_processed INTEGER NOT NULL DEFAULT 0,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  unchanged_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  conflict_count INTEGER NOT NULL DEFAULT 0,
  failure_reason TEXT,
  geographic_coverage TEXT,
  provenance JSONB NOT NULL DEFAULT '{}',
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP,
  duration_ms INTEGER
);

CREATE TABLE IF NOT EXISTS official_geography_crosswalk (
  id BIGSERIAL PRIMARY KEY,
  source VARCHAR(80) NOT NULL DEFAULT 'ONS_POSTCODE_DIRECTORY',
  dataset VARCHAR(120) NOT NULL DEFAULT 'ONS Postcode Directory',
  record_kind VARCHAR(40) NOT NULL DEFAULT 'GEOGRAPHY_CROSSWALK',
  normalized_postcode VARCHAR(8) NOT NULL,
  postcode_compact VARCHAR(7) NOT NULL,
  country_code VARCHAR(16),
  country_name TEXT,
  local_authority_code VARCHAR(16),
  local_authority_name TEXT,
  ukhpi_geography_code VARCHAR(20),
  ukhpi_geography_name TEXT,
  release_label VARCHAR(80) NOT NULL,
  content_fingerprint CHAR(64) NOT NULL,
  ingested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  provenance JSONB NOT NULL DEFAULT '{}',
  limitations JSONB NOT NULL DEFAULT '[]',
  UNIQUE (source, normalized_postcode, release_label),
  CONSTRAINT official_geography_crosswalk_kind
    CHECK (record_kind = 'GEOGRAPHY_CROSSWALK')
);

CREATE INDEX IF NOT EXISTS idx_official_geography_postcode
  ON official_geography_crosswalk (normalized_postcode, release_label);

COMMENT ON TABLE official_geography_crosswalk IS
  'Official postcode to geography-code crosswalk. Not a coordinate gazetteer, not a title plan, and not evidence about one home.';
