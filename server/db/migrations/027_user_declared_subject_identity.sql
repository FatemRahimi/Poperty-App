-- User-declared canonical subject identity (additive).
-- Source listing address on properties.* is not rewritten.
-- building_name is distinct from PAON and from SAON/unit.
-- component_states records per-field verification without promoting USER_DECLARED to VERIFIED_EXACT.
-- actor_user_id on events is owner/admin audit only; not a public identity feed.

ALTER TABLE property_identities
  ADD COLUMN IF NOT EXISTS building_name TEXT,
  ADD COLUMN IF NOT EXISTS component_states JSONB DEFAULT '{}'::jsonb;

ALTER TABLE property_identity_events
  ADD COLUMN IF NOT EXISTS actor_user_id INTEGER,
  ADD COLUMN IF NOT EXISTS building_name TEXT;

COMMENT ON COLUMN property_identities.building_name IS
  'Named building when distinct from PAON. Not a unit identifier and not a title.';
COMMENT ON COLUMN property_identities.component_states IS
  'Per-component verification states (paon, saon, buildingName, uprn, postcode) plus conflict flags.';
COMMENT ON COLUMN property_identity_events.actor_user_id IS
  'Owner or admin who declared or edited identity. Internal audit; not public.';
