-- Idempotency for first-party sold / let / under_offer / withdrawn events.
-- Additive unique indexes only. Does not backfill historical outcomes.
--
-- Rollback: DROP INDEX IF EXISTS listing_events_one_sold;
--           DROP INDEX IF EXISTS listing_events_one_let;
--           DROP INDEX IF EXISTS listing_events_one_under_offer;
--           DROP INDEX IF EXISTS listing_events_one_withdrawn;
-- Outcome columns (sold_at, let_at, achieved_price, achieved_rent, …) stay in
-- place; they were added in 016 and must not be dropped here.

CREATE UNIQUE INDEX IF NOT EXISTS listing_events_one_sold
  ON listing_events (property_id)
  WHERE event_type = 'sold';

CREATE UNIQUE INDEX IF NOT EXISTS listing_events_one_let
  ON listing_events (property_id)
  WHERE event_type = 'let';

CREATE UNIQUE INDEX IF NOT EXISTS listing_events_one_under_offer
  ON listing_events (property_id)
  WHERE event_type = 'under_offer';

CREATE UNIQUE INDEX IF NOT EXISTS listing_events_one_withdrawn
  ON listing_events (property_id)
  WHERE event_type = 'withdrawn';

COMMENT ON INDEX listing_events_one_sold IS
  'Exactly one sold completion event per listing. Identical retries must not duplicate.';

COMMENT ON INDEX listing_events_one_let IS
  'Exactly one let completion event per listing. Identical retries must not duplicate.';

COMMENT ON INDEX listing_events_one_under_offer IS
  'Exactly one under_offer event per listing. Identical retries must not duplicate.';

COMMENT ON INDEX listing_events_one_withdrawn IS
  'Exactly one withdrawn event per listing. Identical retries must not duplicate.';
