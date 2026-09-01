-- Phase 9.1 private evidence lifecycle, scan, and access audit.

ALTER TABLE evidence_documents
  ADD COLUMN IF NOT EXISTS scan_state VARCHAR(64) NOT NULL DEFAULT 'SCAN_UNAVAILABLE';

ALTER TABLE evidence_documents
  ADD COLUMN IF NOT EXISTS availability_state VARCHAR(64) NOT NULL DEFAULT 'AVAILABLE';

ALTER TABLE evidence_documents
  ADD COLUMN IF NOT EXISTS lifecycle_state VARCHAR(64) NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE evidence_documents
  ADD COLUMN IF NOT EXISTS durability_state VARCHAR(64) NOT NULL DEFAULT 'DEVELOPMENT_LOCAL';

ALTER TABLE evidence_documents
  ADD COLUMN IF NOT EXISTS storage_provider VARCHAR(64) NOT NULL DEFAULT 'LOCAL_PRIVATE';

ALTER TABLE evidence_documents
  ADD COLUMN IF NOT EXISTS bytes_removed BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE evidence_documents
  ADD COLUMN IF NOT EXISTS last_integrity_ok BOOLEAN;

CREATE TABLE IF NOT EXISTS evidence_access_events (
  id SERIAL PRIMARY KEY,
  document_id UUID NOT NULL,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(32) NOT NULL,
  authorization_class VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS evidence_access_events_document
  ON evidence_access_events(document_id);

CREATE INDEX IF NOT EXISTS evidence_access_events_actor
  ON evidence_access_events(actor_user_id);

COMMENT ON TABLE evidence_access_events IS
  'Minimal private-evidence access audit. No filenames, hashes, paths, or file bytes.';
