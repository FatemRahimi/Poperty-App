-- Phase 3E: content-addressed Brownfield artifact manifest.
-- SHA-256 identifies artifact bytes. It is not site chronology and not release_label.
-- Historical import runs keep a null artifact_id and remain readable.

CREATE TABLE IF NOT EXISTS brownfield_land_artifacts (
  id BIGSERIAL PRIMARY KEY,
  source VARCHAR(64) NOT NULL,
  dataset VARCHAR(120) NOT NULL,
  source_product TEXT NOT NULL,
  source_url TEXT NOT NULL,
  resolved_url TEXT,
  artifact_filename TEXT NOT NULL,
  content_type TEXT,
  content_length BIGINT,
  byte_length BIGINT NOT NULL,
  etag TEXT,
  last_modified TEXT,
  sha256 CHAR(64) NOT NULL,
  retrieved_at TIMESTAMP NOT NULL,
  status VARCHAR(40) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT brownfield_land_artifacts_sha256_key UNIQUE (sha256)
);

ALTER TABLE brownfield_land_import_runs
  ADD COLUMN IF NOT EXISTS artifact_id BIGINT REFERENCES brownfield_land_artifacts(id);

CREATE INDEX IF NOT EXISTS idx_brownfield_land_import_runs_artifact
  ON brownfield_land_import_runs (artifact_id);

COMMENT ON TABLE brownfield_land_artifacts IS
  'Immutable official brownfield-land artifact identity. last_modified and etag are HTTP retrieval metadata, not publication chronology. Row counts from the artifact are not an England site census.';
