-- ONS Census 2021 TS054 Tenure — lower tier local authority household counts.
-- Separate from IoD, population, UKHPI, and official sale transactions.
-- Historical Census structural context as at Census Day 2021-03-21. Not current tenure.

CREATE TABLE IF NOT EXISTS census2021_lad_tenure_import_runs (
  id SERIAL PRIMARY KEY,
  source VARCHAR(64) NOT NULL DEFAULT 'ONS_CENSUS_2021_TS054',
  dataset VARCHAR(120) NOT NULL DEFAULT 'Census 2021 — Tenure (TS054)',
  source_product TEXT NOT NULL DEFAULT 'ONS Census 2021 topic summary TS054 Tenure — lower tier local authorities CSV (v4)',
  release_label VARCHAR(80) NOT NULL DEFAULT 'CENSUS2021_TS054_V4',
  status VARCHAR(40) NOT NULL DEFAULT 'STARTED',
  rows_processed INTEGER NOT NULL DEFAULT 0,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  unchanged_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  conflict_count INTEGER NOT NULL DEFAULT 0,
  failure_reason TEXT,
  geographic_coverage TEXT NOT NULL DEFAULT 'England and Wales lower tier local authorities',
  provenance JSONB NOT NULL DEFAULT '{}',
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP,
  duration_ms INTEGER
);

CREATE TABLE IF NOT EXISTS census2021_lad_tenure_observations (
  id BIGSERIAL PRIMARY KEY,
  source VARCHAR(64) NOT NULL DEFAULT 'ONS_CENSUS_2021_TS054',
  dataset VARCHAR(120) NOT NULL DEFAULT 'Census 2021 — Tenure (TS054)',
  dataset_id VARCHAR(16) NOT NULL DEFAULT 'TS054',
  edition VARCHAR(16) NOT NULL DEFAULT '2021',
  version INTEGER NOT NULL DEFAULT 4,
  source_product TEXT NOT NULL DEFAULT 'ONS Census 2021 topic summary TS054 Tenure — lower tier local authorities CSV (v4)',
  record_kind VARCHAR(40) NOT NULL DEFAULT 'OFFICIAL_OBSERVATION',
  geography_type VARCHAR(40) NOT NULL DEFAULT 'LAD',
  geography_vintage VARCHAR(40) NOT NULL DEFAULT 'CENSUS_2021_LTLA',
  geography_code VARCHAR(16) NOT NULL,
  geography_name TEXT,
  category_code VARCHAR(8) NOT NULL,
  category_label TEXT NOT NULL,
  household_count BIGINT NOT NULL,
  reference_period DATE NOT NULL DEFAULT DATE '2021-03-21',
  release_label VARCHAR(80) NOT NULL DEFAULT 'CENSUS2021_TS054_V4',
  content_fingerprint CHAR(64) NOT NULL,
  ingested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  provenance JSONB NOT NULL DEFAULT '{}',
  limitations JSONB NOT NULL DEFAULT '[]',
  UNIQUE (source, geography_code, geography_vintage, reference_period, category_code, release_label),
  CONSTRAINT census2021_lad_tenure_observations_kind
    CHECK (record_kind = 'OFFICIAL_OBSERVATION'),
  CONSTRAINT census2021_lad_tenure_non_negative
    CHECK (household_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_census2021_lad_tenure_geography
  ON census2021_lad_tenure_observations (geography_code, reference_period, release_label);

COMMENT ON TABLE census2021_lad_tenure_observations IS
  'Official Census 2021 TS054 household tenure category counts at LTLA. Historical Census Day 2021-03-21 context. Raw categories only. Not property legal tenure, current 2026 tenure, rental demand, or an investment recommendation. Missing is not zero.';
