-- External UK property intelligence subjects (UPRN-keyed, not marketplace listings)

CREATE TABLE IF NOT EXISTS intelligence_subjects (
  id SERIAL PRIMARY KEY,
  uprn VARCHAR(20),
  normalized_address TEXT NOT NULL,
  postcode VARCHAR(12),
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
  attributes JSONB NOT NULL DEFAULT '{}',
  profile_snapshot JSONB NOT NULL DEFAULT '{}',
  provider VARCHAR(50) DEFAULT 'PropertyData',
  match_confidence VARCHAR(20) DEFAULT 'medium',
  match_method VARCHAR(80) DEFAULT 'address_match_uprn',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_intelligence_subjects_uprn
  ON intelligence_subjects(uprn) WHERE uprn IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_intelligence_subjects_postcode ON intelligence_subjects(postcode);
CREATE INDEX IF NOT EXISTS idx_intelligence_subjects_created_by ON intelligence_subjects(created_by);

ALTER TABLE property_enrichments
  ADD COLUMN IF NOT EXISTS subject_id INTEGER REFERENCES intelligence_subjects(id) ON DELETE CASCADE;

ALTER TABLE property_enrichments
  ALTER COLUMN property_id DROP NOT NULL;

ALTER TABLE property_enrichments
  DROP CONSTRAINT IF EXISTS property_enrichments_property_id_enrichment_type_source_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_property_enrichments_listing
  ON property_enrichments(property_id, enrichment_type, source)
  WHERE property_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_property_enrichments_subject
  ON property_enrichments(subject_id, enrichment_type, source)
  WHERE subject_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_property_enrichments_subject_id ON property_enrichments(subject_id);

COMMENT ON TABLE intelligence_subjects IS 'Normalized UK properties resolved for intelligence analysis — not marketplace listings';
