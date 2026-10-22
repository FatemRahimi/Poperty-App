-- Phase 3D: repair Brownfield observation uniqueness.
-- Migration 036 drops the obsolete (source, source_entity_id, release_label) key
-- and then adds the revision key. Those statements are one script, so PostgreSQL
-- runs them in one transaction: a failure rolls both back.
-- Boot detection previously treated the revision index as proof that the old
-- key was gone. This script corrects a database left with the obsolete key,
-- or with neither unique key, and is safe to re-run.
-- The whole script is one implicit transaction. A failure does not commit a
-- drop without the replacement key.

DO $$
DECLARE
  obsolete_name text;
BEGIN
  SELECT c.conname INTO obsolete_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'brownfield_land_observations'
    AND c.contype = 'u'
    AND pg_get_constraintdef(c.oid) LIKE '%source_entity_id%'
    AND pg_get_constraintdef(c.oid) LIKE '%release_label%'
    AND pg_get_constraintdef(c.oid) NOT LIKE '%content_fingerprint%'
  LIMIT 1;

  IF obsolete_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE brownfield_land_observations DROP CONSTRAINT %I',
      obsolete_name
    );
  END IF;

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
