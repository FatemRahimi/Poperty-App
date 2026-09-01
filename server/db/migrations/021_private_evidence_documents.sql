-- Private evidence documents (LEGAL_TITLE first consumer).
-- Files live outside public /uploads. Storage keys are never public URLs.

CREATE TABLE IF NOT EXISTS evidence_documents (
  id SERIAL PRIMARY KEY,
  document_id UUID NOT NULL UNIQUE,
  owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domain VARCHAR(64) NOT NULL DEFAULT 'LEGAL_TITLE',
  document_type VARCHAR(64) NOT NULL,
  original_filename VARCHAR(255),
  mime_type VARCHAR(128) NOT NULL,
  byte_size INTEGER NOT NULL,
  content_hash VARCHAR(64) NOT NULL,
  storage_key VARCHAR(128) NOT NULL UNIQUE,
  source_type VARCHAR(64) NOT NULL,
  source VARCHAR(128),
  document_date DATE,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  evidence_as_of TIMESTAMPTZ,
  verification_state VARCHAR(64) NOT NULL DEFAULT 'UNVERIFIED',
  extraction_state VARCHAR(64) NOT NULL DEFAULT 'NOT_EXTRACTED',
  privacy VARCHAR(32) NOT NULL DEFAULT 'PRIVATE',
  provenance JSONB NOT NULL DEFAULT '{}',
  declared_title_number VARCHAR(64),
  declared_tenure TEXT,
  superseded_document_id UUID,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS evidence_documents_owner_hash_domain_active
  ON evidence_documents(owner_user_id, content_hash, domain)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS evidence_documents_owner_id
  ON evidence_documents(owner_user_id);

CREATE INDEX IF NOT EXISTS evidence_documents_hash
  ON evidence_documents(content_hash);

CREATE INDEX IF NOT EXISTS evidence_documents_domain
  ON evidence_documents(domain);

CREATE TABLE IF NOT EXISTS evidence_document_subjects (
  id SERIAL PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES evidence_documents(document_id) ON DELETE CASCADE,
  subject_kind VARCHAR(64) NOT NULL,
  subject_key VARCHAR(128) NOT NULL,
  property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
  subject_id INTEGER REFERENCES intelligence_subjects(id) ON DELETE SET NULL,
  title_number VARCHAR(64),
  relationship VARCHAR(64) NOT NULL DEFAULT 'CLAIMED_REFERENCE',
  legal_relationship_proven BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS evidence_document_subjects_document
  ON evidence_document_subjects(document_id);

CREATE INDEX IF NOT EXISTS evidence_document_subjects_property
  ON evidence_document_subjects(property_id);

CREATE INDEX IF NOT EXISTS evidence_document_subjects_subject
  ON evidence_document_subjects(subject_id);

COMMENT ON TABLE evidence_documents IS
  'Owner-private professional/property documents. Hash is integrity identity, not authorization.';
COMMENT ON TABLE evidence_document_subjects IS
  'Claimed subject linkages only. Upload does not prove PROPERTY = TITLE = LAND_PARCEL.';
