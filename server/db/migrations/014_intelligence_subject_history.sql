-- Recent external lookup tracking + subject-scoped analysis history

ALTER TABLE ai_requests
  ADD COLUMN IF NOT EXISTS subject_id INTEGER REFERENCES intelligence_subjects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ai_requests_subject_id ON ai_requests(subject_id);

CREATE TABLE IF NOT EXISTS intelligence_subject_lookups (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id INTEGER NOT NULL REFERENCES intelligence_subjects(id) ON DELETE CASCADE,
  last_accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  access_count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_subject_lookups_user_time
  ON intelligence_subject_lookups(user_id, last_accessed_at DESC);

COMMENT ON TABLE intelligence_subject_lookups IS 'Per-user recent UK property intelligence lookups (not marketplace listings)';
