-- Phase 3C: Planning Data brownfield provider coverage.
-- LPA identities, provider index, and organisation-to-LPA reference links.
-- No site observations, no geometry, no area counts, no completeness percentage.

CREATE TABLE IF NOT EXISTS brownfield_coverage_runs (
  id SERIAL PRIMARY KEY,
  source VARCHAR(64) NOT NULL DEFAULT 'MHCLG_PLANNING_DATA',
  source_family VARCHAR(64) NOT NULL,
  status VARCHAR(40) NOT NULL,
  source_url TEXT,
  retrieved_at TIMESTAMP,
  failure_reason TEXT,
  rows_accepted INTEGER NOT NULL DEFAULT 0,
  rows_rejected INTEGER NOT NULL DEFAULT 0,
  provenance JSONB NOT NULL DEFAULT '{}',
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP,
  CONSTRAINT brownfield_coverage_runs_family
    CHECK (source_family IN ('LPA_IDENTITY', 'PROVIDER_INDEX', 'ORGANISATION_RECORD')),
  CONSTRAINT brownfield_coverage_runs_status
    CHECK (status IN ('STARTED', 'SUCCEEDED', 'SOURCE_ERROR', 'RETRIEVAL_FAILED'))
);

CREATE INDEX IF NOT EXISTS idx_brownfield_coverage_runs_family
  ON brownfield_coverage_runs (source_family, id DESC);

CREATE TABLE IF NOT EXISTS brownfield_lpa_identities (
  id BIGSERIAL PRIMARY KEY,
  source VARCHAR(64) NOT NULL DEFAULT 'MHCLG_PLANNING_DATA',
  dataset VARCHAR(64) NOT NULL DEFAULT 'local-planning-authority',
  source_entity_id BIGINT NOT NULL,
  name TEXT NOT NULL,
  reference TEXT NOT NULL,
  entry_date DATE,
  start_date DATE,
  end_date DATE,
  source_url TEXT,
  retrieved_at TIMESTAMP,
  provenance JSONB NOT NULL DEFAULT '{}',
  limitations JSONB NOT NULL DEFAULT '[]',
  UNIQUE (source, source_entity_id),
  UNIQUE (source, reference)
);

CREATE INDEX IF NOT EXISTS idx_brownfield_lpa_reference
  ON brownfield_lpa_identities (source, reference);

CREATE TABLE IF NOT EXISTS brownfield_provider_index (
  id BIGSERIAL PRIMARY KEY,
  source VARCHAR(64) NOT NULL DEFAULT 'MHCLG_PLANNING_DATA',
  dataset VARCHAR(64) NOT NULL DEFAULT 'brownfield-land',
  organisation_entity BIGINT NOT NULL,
  organisation_name TEXT NOT NULL,
  source_url TEXT,
  retrieved_at TIMESTAMP,
  provenance JSONB NOT NULL DEFAULT '{}',
  limitations JSONB NOT NULL DEFAULT '[]',
  UNIQUE (source, organisation_entity)
);

CREATE INDEX IF NOT EXISTS idx_brownfield_provider_organisation
  ON brownfield_provider_index (source, organisation_entity);

CREATE TABLE IF NOT EXISTS brownfield_organisation_lpa_links (
  id BIGSERIAL PRIMARY KEY,
  source VARCHAR(64) NOT NULL DEFAULT 'MHCLG_PLANNING_DATA',
  organisation_entity BIGINT NOT NULL,
  organisation_name TEXT NOT NULL,
  local_planning_authority_code TEXT,
  statistical_geography TEXT,
  start_date DATE,
  end_date DATE,
  mapping_status VARCHAR(64) NOT NULL,
  matched_lpa_reference TEXT,
  matched_lpa_entity_id BIGINT,
  source_url TEXT,
  retrieved_at TIMESTAMP,
  provenance JSONB NOT NULL DEFAULT '{}',
  limitations JSONB NOT NULL DEFAULT '[]',
  UNIQUE (source, organisation_entity),
  CONSTRAINT brownfield_org_lpa_mapping_status
    CHECK (mapping_status IN ('ORGANISATION_LPA_MAPPED', 'ORGANISATION_LPA_UNMAPPED')),
  CONSTRAINT brownfield_org_lpa_map_consistency
    CHECK (
      (
        mapping_status = 'ORGANISATION_LPA_MAPPED'
        AND matched_lpa_reference IS NOT NULL
        AND local_planning_authority_code = matched_lpa_reference
      )
      OR (
        mapping_status = 'ORGANISATION_LPA_UNMAPPED'
        AND matched_lpa_reference IS NULL
        AND matched_lpa_entity_id IS NULL
      )
    )
);

CREATE INDEX IF NOT EXISTS idx_brownfield_org_lpa_code
  ON brownfield_organisation_lpa_links (source, local_planning_authority_code);

CREATE INDEX IF NOT EXISTS idx_brownfield_org_matched_lpa
  ON brownfield_organisation_lpa_links (source, matched_lpa_reference);

COMMENT ON TABLE brownfield_lpa_identities IS
  'Planning Data local-planning-authority identities. organisation-entity from that dataset is not stored and is not a council mapping.';

COMMENT ON TABLE brownfield_provider_index IS
  'Planning Data brownfield provider index. Listed is not complete data. Absent is not proof of no brownfield register.';

COMMENT ON TABLE brownfield_organisation_lpa_links IS
  'Organisation.local-planning-authority matched exactly to LPA.reference. No name matching and no predecessor inference.';
