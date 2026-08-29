-- Idempotency for once-in-lifetime listing lifecycle events.
-- Additive only. Does not backfill historical events.

CREATE UNIQUE INDEX IF NOT EXISTS listing_events_one_listing_created
  ON listing_events (property_id)
  WHERE event_type = 'listing_created';

CREATE UNIQUE INDEX IF NOT EXISTS listing_events_one_first_published
  ON listing_events (property_id)
  WHERE event_type = 'first_published';

COMMENT ON INDEX listing_events_one_listing_created IS
  'Exactly one listing_created event per listing. Retries must not duplicate.';

COMMENT ON INDEX listing_events_one_first_published IS
  'Exactly one first_published event per listing. Repeat approval must not duplicate.';
