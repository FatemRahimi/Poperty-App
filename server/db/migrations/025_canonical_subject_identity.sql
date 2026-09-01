-- Additive canonical subject identity fields on existing property_identities.
-- Does not rewrite properties.* source address columns.

ALTER TABLE property_identities
  ADD COLUMN IF NOT EXISTS paon TEXT,
  ADD COLUMN IF NOT EXISTS saon TEXT,
  ADD COLUMN IF NOT EXISTS postcode_compact VARCHAR(12),
  ADD COLUMN IF NOT EXISTS identity_state VARCHAR(32) DEFAULT 'UNRESOLVED',
  ADD COLUMN IF NOT EXISTS identity_source VARCHAR(80),
  ADD COLUMN IF NOT EXISTS evidence_source_type VARCHAR(40),
  ADD COLUMN IF NOT EXISTS verification_state VARCHAR(32) DEFAULT 'UNRESOLVED',
  ADD COLUMN IF NOT EXISTS retrieved_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS uprn_retrieved_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS identity_contract_version VARCHAR(40),
  ADD COLUMN IF NOT EXISTS identity_limitations JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS source_address JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_property_identities_paon
  ON property_identities (postcode_compact, paon)
  WHERE postcode_compact IS NOT NULL AND paon IS NOT NULL;

CREATE TABLE IF NOT EXISTS property_identity_events (
  id SERIAL PRIMARY KEY,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  identity_state VARCHAR(32),
  verification_state VARCHAR(32),
  uprn VARCHAR(20),
  paon TEXT,
  saon TEXT,
  source VARCHAR(80),
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_property_identity_events_property
  ON property_identity_events (property_id, created_at DESC);

COMMENT ON TABLE property_identity_events IS
  'Append-only canonical identity changes for a listing. Source address on properties is not overwritten.';
COMMENT ON COLUMN property_identities.identity_state IS
  'VERIFIED_EXACT | SOURCE_ASSERTED | USER_DECLARED | INFERRED | UNRESOLVED';
COMMENT ON COLUMN property_identities.uprn IS
  'Addressable-property identifier. Not a title number. Null when unresolved or multiple candidates.';
