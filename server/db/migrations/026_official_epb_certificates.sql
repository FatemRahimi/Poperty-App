-- Official MHCLG Energy Performance of Buildings evidence.
-- Additive. Does not store EPC address/postcode as a reusable gazetteer.
-- Certificate history is retained; a newer certificate does not delete an older one.

CREATE TABLE IF NOT EXISTS official_epb_certificates (
  id SERIAL PRIMARY KEY,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  certificate_number VARCHAR(40) NOT NULL,
  certificate_type VARCHAR(20) NOT NULL,
  uprn VARCHAR(20),
  uprn_source TEXT,
  inspection_date DATE,
  lodgement_date DATE,
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  attachment_status VARCHAR(40) NOT NULL,
  schema_type TEXT,
  facts JSONB NOT NULL DEFAULT '{}'::jsonb,
  provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  limitations JSONB NOT NULL DEFAULT '[]'::jsonb,
  retrieved_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source VARCHAR(40) NOT NULL DEFAULT 'MHCLG_EPBD',
  source_geography VARCHAR(40) NOT NULL DEFAULT 'ENGLAND_WALES',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (property_id, certificate_number)
);

CREATE INDEX IF NOT EXISTS idx_official_epb_certificates_property
  ON official_epb_certificates (property_id, is_current DESC, lodgement_date DESC);

CREATE INDEX IF NOT EXISTS idx_official_epb_certificates_uprn
  ON official_epb_certificates (uprn)
  WHERE uprn IS NOT NULL;

CREATE TABLE IF NOT EXISTS official_epb_acquisition_runs (
  id SERIAL PRIMARY KEY,
  property_id INTEGER REFERENCES properties(id) ON DELETE CASCADE,
  status VARCHAR(40) NOT NULL,
  attachment_status VARCHAR(40) NOT NULL,
  search_attempted BOOLEAN NOT NULL DEFAULT FALSE,
  cache_hit BOOLEAN NOT NULL DEFAULT FALSE,
  candidate_count INTEGER,
  unique_attach BOOLEAN NOT NULL DEFAULT FALSE,
  certificate_refresh BOOLEAN NOT NULL DEFAULT FALSE,
  error_code VARCHAR(80),
  retrieved_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_official_epb_acquisition_runs_property
  ON official_epb_acquisition_runs (property_id, retrieved_at DESC);

COMMENT ON TABLE official_epb_certificates IS
  'Canonical official EPB physical/energy facts. Restricted address fields are not stored.';
COMMENT ON COLUMN official_epb_certificates.facts IS
  'OGL-permitted non-address fields only. Address/postcode from MHCLG must not appear here.';
COMMENT ON COLUMN official_epb_certificates.certificate_number IS
  'CERTIFICATE_NUMBER / certificateNumber. Not LMK_KEY.';
