-- Additive property identity / asset classification.
-- Does not rewrite properties, ai_requests, or historical snapshots.
-- UNKNOWN is the explicit default. No data backfill in this file.

CREATE TABLE IF NOT EXISTS asset_classifications (
  id SERIAL PRIMARY KEY,
  listing_id INTEGER REFERENCES properties(id) ON DELETE CASCADE,
  subject_id INTEGER REFERENCES intelligence_subjects(id) ON DELETE CASCADE,
  asset_class VARCHAR(40) NOT NULL DEFAULT 'UNKNOWN',
  subtype VARCHAR(80),
  subtype_registered BOOLEAN NOT NULL DEFAULT false,
  classification_state VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN',
  classification_method VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN',
  confidence VARCHAR(20),
  provenance JSONB NOT NULL DEFAULT '{}',
  version VARCHAR(40) NOT NULL DEFAULT 'asset-classification-1.0.0',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT asset_classifications_one_anchor CHECK (
    (listing_id IS NOT NULL AND subject_id IS NULL)
    OR (listing_id IS NULL AND subject_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS asset_classifications_one_listing
  ON asset_classifications(listing_id)
  WHERE listing_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS asset_classifications_one_subject
  ON asset_classifications(subject_id)
  WHERE subject_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_asset_classifications_class
  ON asset_classifications(asset_class);

CREATE TABLE IF NOT EXISTS asset_classification_events (
  id SERIAL PRIMARY KEY,
  classification_id INTEGER REFERENCES asset_classifications(id) ON DELETE SET NULL,
  listing_id INTEGER,
  subject_id INTEGER,
  previous_asset_class VARCHAR(40),
  next_asset_class VARCHAR(40),
  previous_state VARCHAR(20),
  next_state VARCHAR(20),
  action VARCHAR(40) NOT NULL,
  reason TEXT,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_asset_classification_events_listing
  ON asset_classification_events(listing_id);

CREATE INDEX IF NOT EXISTS idx_asset_classification_events_subject
  ON asset_classification_events(subject_id);

COMMENT ON TABLE asset_classifications IS
  'Canonical asset class for a listing or intelligence subject. UNKNOWN is valid. Not a valuation methodology.';
COMMENT ON TABLE asset_classification_events IS
  'Audit log for classification create/update/conflict. Does not rewrite analysis snapshots.';
