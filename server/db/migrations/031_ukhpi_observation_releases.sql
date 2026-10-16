-- Release-aware UKHPI history.
-- Keeps every official release. Does not delete or rewrite an existing observation value.
-- Migration 029 is left in place. This only relaxes the one-row-per-month uniqueness.

ALTER TABLE ukhpi_observations
  ADD COLUMN IF NOT EXISTS record_kind VARCHAR(40) NOT NULL DEFAULT 'OFFICIAL_OBSERVATION';

UPDATE ukhpi_observations
SET release_label = 'unspecified'
WHERE release_label IS NULL OR btrim(release_label) = '';

ALTER TABLE ukhpi_observations
  ALTER COLUMN release_label SET NOT NULL;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'ukhpi_observations'
      AND c.contype = 'u'
      AND pg_get_constraintdef(c.oid) NOT ILIKE '%release_label%'
  LOOP
    EXECUTE format('ALTER TABLE ukhpi_observations DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ukhpi_observations_release_identity'
  ) THEN
    ALTER TABLE ukhpi_observations
      ADD CONSTRAINT ukhpi_observations_release_identity
      UNIQUE (source, geography_code, observation_date, property_category, release_label);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ukhpi_observations_record_kind_official'
  ) THEN
    ALTER TABLE ukhpi_observations
      ADD CONSTRAINT ukhpi_observations_record_kind_official
      CHECK (record_kind = 'OFFICIAL_OBSERVATION');
  END IF;
END $$;

COMMENT ON COLUMN ukhpi_observations.record_kind IS
  'OFFICIAL_OBSERVATION only. A calculated growth metric must not be stored in this table.';
