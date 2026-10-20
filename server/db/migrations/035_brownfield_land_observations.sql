-- MHCLG Planning Data brownfield-land register / development-site observations.
-- England. Official site evidence only. Not planning-application pipeline,
-- construction tracking, housing delivery, regeneration, or investment scoring.
-- Geometry stored as source WKT/point text — no PostGIS dependency.
-- Future spatial queries may require additional infrastructure (NOT VERIFIED here).

CREATE TABLE IF NOT EXISTS brownfield_land_import_runs (
  id SERIAL PRIMARY KEY,
  source VARCHAR(64) NOT NULL DEFAULT 'MHCLG_PLANNING_DATA',
  dataset VARCHAR(120) NOT NULL DEFAULT 'Brownfield land',
  source_product TEXT NOT NULL DEFAULT 'MHCLG Planning Data — brownfield-land entities',
  release_label VARCHAR(80) NOT NULL DEFAULT 'BROWNFIELD_LAND',
  status VARCHAR(40) NOT NULL DEFAULT 'STARTED',
  rows_processed INTEGER NOT NULL DEFAULT 0,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  unchanged_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  conflict_count INTEGER NOT NULL DEFAULT 0,
  failure_reason TEXT,
  geographic_coverage TEXT NOT NULL DEFAULT 'England',
  retrieved_at TIMESTAMP,
  provenance JSONB NOT NULL DEFAULT '{}',
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP,
  duration_ms INTEGER
);

CREATE TABLE IF NOT EXISTS brownfield_land_observations (
  id BIGSERIAL PRIMARY KEY,
  source VARCHAR(64) NOT NULL DEFAULT 'MHCLG_PLANNING_DATA',
  dataset VARCHAR(64) NOT NULL DEFAULT 'brownfield-land',
  dataset_label VARCHAR(120) NOT NULL DEFAULT 'Brownfield land',
  source_product TEXT NOT NULL DEFAULT 'MHCLG Planning Data — brownfield-land entities',
  record_kind VARCHAR(40) NOT NULL DEFAULT 'OFFICIAL_OBSERVATION',
  geography_type VARCHAR(40) NOT NULL DEFAULT 'SITE',
  geographic_scope VARCHAR(40) NOT NULL DEFAULT 'England',
  source_entity_id BIGINT NOT NULL,
  organisation_entity BIGINT,
  reference TEXT,
  name TEXT,
  site_address TEXT,
  ownership_status TEXT,
  planning_permission_status TEXT,
  planning_permission_type TEXT,
  planning_permission_date DATE,
  minimum_net_dwellings INTEGER,
  maximum_net_dwellings INTEGER,
  dwelling_nature VARCHAR(64) NOT NULL DEFAULT 'ESTIMATED_NET_DWELLING_CAPACITY',
  deliverable TEXT,
  hectares TEXT,
  point_wkt TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  geometry_wkt TEXT,
  coordinate_reference_system VARCHAR(32),
  entry_date DATE,
  start_date DATE,
  end_date DATE,
  notes TEXT,
  site_plan_url TEXT,
  release_label VARCHAR(80) NOT NULL DEFAULT 'BROWNFIELD_LAND',
  content_fingerprint CHAR(64) NOT NULL,
  retrieved_at TIMESTAMP,
  ingested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  provenance JSONB NOT NULL DEFAULT '{}',
  limitations JSONB NOT NULL DEFAULT '[]',
  UNIQUE (source, source_entity_id, release_label),
  CONSTRAINT brownfield_land_observations_kind
    CHECK (record_kind = 'OFFICIAL_OBSERVATION'),
  CONSTRAINT brownfield_land_min_dwellings_non_negative
    CHECK (minimum_net_dwellings IS NULL OR minimum_net_dwellings >= 0),
  CONSTRAINT brownfield_land_max_dwellings_non_negative
    CHECK (maximum_net_dwellings IS NULL OR maximum_net_dwellings >= 0)
);

CREATE INDEX IF NOT EXISTS idx_brownfield_land_source_entity
  ON brownfield_land_observations (source_entity_id, release_label);

CREATE INDEX IF NOT EXISTS idx_brownfield_land_organisation
  ON brownfield_land_observations (organisation_entity, release_label);

COMMENT ON TABLE brownfield_land_observations IS
  'Official MHCLG Planning Data brownfield-land register sites (England). Estimated net dwelling capacity is not delivered housing. Permission status is not construction. Ownership is not developer. Missing dwellings are null, not zero. Absence of rows is not proof of no development.';
