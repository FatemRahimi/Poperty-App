-- English Indices of Deprivation 2025 File 10 v2 LAD summaries.
-- Separate from UKHPI and official sale transactions.
-- England-only relative deprivation. Not property-level evidence and not an investment score.

CREATE TABLE IF NOT EXISTS iod2025_lad_import_runs (
  id SERIAL PRIMARY KEY,
  source VARCHAR(40) NOT NULL DEFAULT 'MHCLG_IOD_2025',
  dataset VARCHAR(120) NOT NULL DEFAULT 'English Indices of Deprivation 2025',
  source_product TEXT NOT NULL DEFAULT 'File 10 v2 — Local Authority District summaries',
  release_label VARCHAR(80) NOT NULL DEFAULT 'IoD2025_File10_v2',
  status VARCHAR(40) NOT NULL DEFAULT 'STARTED',
  rows_processed INTEGER NOT NULL DEFAULT 0,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  unchanged_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  conflict_count INTEGER NOT NULL DEFAULT 0,
  failure_reason TEXT,
  geographic_coverage TEXT NOT NULL DEFAULT 'England',
  provenance JSONB NOT NULL DEFAULT '{}',
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP,
  duration_ms INTEGER
);

CREATE TABLE IF NOT EXISTS iod2025_lad_observations (
  id BIGSERIAL PRIMARY KEY,
  source VARCHAR(40) NOT NULL DEFAULT 'MHCLG_IOD_2025',
  dataset VARCHAR(120) NOT NULL DEFAULT 'English Indices of Deprivation 2025',
  source_product TEXT NOT NULL DEFAULT 'File 10 v2 — Local Authority District summaries',
  record_kind VARCHAR(40) NOT NULL DEFAULT 'OFFICIAL_OBSERVATION',
  geography_type VARCHAR(40) NOT NULL DEFAULT 'LAD',
  geography_vintage VARCHAR(40) NOT NULL DEFAULT 'LAD_2024',
  geography_code VARCHAR(16) NOT NULL,
  geography_name TEXT,
  imd_average_score NUMERIC,
  imd_rank_of_average_score INTEGER,
  imd_proportion_most_deprived_10 NUMERIC,
  release_label VARCHAR(80) NOT NULL DEFAULT 'IoD2025_File10_v2',
  content_fingerprint CHAR(64) NOT NULL,
  ingested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  provenance JSONB NOT NULL DEFAULT '{}',
  limitations JSONB NOT NULL DEFAULT '[]',
  UNIQUE (source, geography_code, geography_vintage, release_label),
  CONSTRAINT iod2025_lad_observations_kind
    CHECK (record_kind = 'OFFICIAL_OBSERVATION')
);

CREATE INDEX IF NOT EXISTS idx_iod2025_lad_geography
  ON iod2025_lad_observations (geography_code, release_label);

COMMENT ON TABLE iod2025_lad_observations IS
  'Official IoD 2025 File 10 v2 LAD summaries. England-only relative deprivation area context. Not a property fact, forecast, or investment recommendation. Null metrics are unknown, not zero.';
