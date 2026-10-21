-- Phase 3B: retain brownfield observation revisions under the edition-family release label.
-- Same source entity + same fingerprint remains unique.
-- Changed fingerprint inserts a distinct revision; history is not overwritten.
-- Effective current state is selected in application code via source entry-date only.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'brownfield_land_observations_source_source_entity_id_release_label_key'
  ) THEN
    ALTER TABLE brownfield_land_observations
      DROP CONSTRAINT brownfield_land_observations_source_source_entity_id_release_label_key;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'brownfield_land_observations_revision_identity'
  ) THEN
    ALTER TABLE brownfield_land_observations
      ADD CONSTRAINT brownfield_land_observations_revision_identity
      UNIQUE (source, source_entity_id, release_label, content_fingerprint);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_brownfield_land_entity_revisions
  ON brownfield_land_observations (source, source_entity_id, release_label, entry_date);

COMMENT ON CONSTRAINT brownfield_land_observations_revision_identity ON brownfield_land_observations IS
  'Revision identity: edition-family release_label plus content fingerprint. Changed source content retains a new revision; effective selection uses source entry-date, never ingest time.';
