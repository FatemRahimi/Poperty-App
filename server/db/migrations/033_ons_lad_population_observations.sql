-- ONS mid-year population estimates (Explore Local Statistics ltla population-count extract).
-- Separate from IoD, UKHPI, and official sale transactions.
-- Official ESTIMATES of usual residents at LAD/ltla. Not property-level evidence and not growth analytics.

CREATE TABLE IF NOT EXISTS ons_lad_population_import_runs (
  id SERIAL PRIMARY KEY,
  source VARCHAR(64) NOT NULL DEFAULT 'ONS_MID_YEAR_POPULATION_ESTIMATES',
  dataset VARCHAR(120) NOT NULL DEFAULT 'Mid-year population estimates',
  source_product TEXT NOT NULL DEFAULT 'Explore Local Statistics — population-count ltla CSV (total usual residents)',
  release_label VARCHAR(80) NOT NULL DEFAULT 'MYE_MID_2024',
  status VARCHAR(40) NOT NULL DEFAULT 'STARTED',
  rows_processed INTEGER NOT NULL DEFAULT 0,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  unchanged_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  conflict_count INTEGER NOT NULL DEFAULT 0,
  failure_reason TEXT,
  geographic_coverage TEXT NOT NULL DEFAULT 'United Kingdom local authorities (ltla) as published in the selected extract',
  provenance JSONB NOT NULL DEFAULT '{}',
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP,
  duration_ms INTEGER
);

CREATE TABLE IF NOT EXISTS ons_lad_population_observations (
  id BIGSERIAL PRIMARY KEY,
  source VARCHAR(64) NOT NULL DEFAULT 'ONS_MID_YEAR_POPULATION_ESTIMATES',
  dataset VARCHAR(120) NOT NULL DEFAULT 'Mid-year population estimates',
  source_product TEXT NOT NULL DEFAULT 'Explore Local Statistics — population-count ltla CSV (total usual residents)',
  record_kind VARCHAR(40) NOT NULL DEFAULT 'OFFICIAL_OBSERVATION',
  geography_type VARCHAR(40) NOT NULL DEFAULT 'LAD',
  geography_vintage VARCHAR(40) NOT NULL DEFAULT 'LTLA_MID_2024',
  geography_code VARCHAR(16) NOT NULL,
  geography_name TEXT,
  observation_date DATE NOT NULL,
  total_usual_resident_population BIGINT NOT NULL,
  release_label VARCHAR(80) NOT NULL DEFAULT 'MYE_MID_2024',
  content_fingerprint CHAR(64) NOT NULL,
  ingested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  provenance JSONB NOT NULL DEFAULT '{}',
  limitations JSONB NOT NULL DEFAULT '[]',
  UNIQUE (source, geography_code, geography_vintage, observation_date, release_label),
  CONSTRAINT ons_lad_population_observations_kind
    CHECK (record_kind = 'OFFICIAL_OBSERVATION'),
  CONSTRAINT ons_lad_population_non_negative
    CHECK (total_usual_resident_population >= 0)
);

CREATE INDEX IF NOT EXISTS idx_ons_lad_population_geography
  ON ons_lad_population_observations (geography_code, observation_date, release_label);

COMMENT ON TABLE ons_lad_population_observations IS
  'Official ONS mid-year population ESTIMATES (usual residents) at LAD/ltla. Area context only. Each year is its own observation. Null/missing is not zero. No app-derived growth.';
