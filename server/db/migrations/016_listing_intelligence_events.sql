-- Listing intelligence fields already collected on some installs, plus an event
-- model for future demand/liquidity ML. No ML is trained in this migration.
-- Do not invent values for existing rows.

ALTER TABLE properties ADD COLUMN IF NOT EXISTS tenure TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS service_charges NUMERIC;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS ground_rent NUMERIC;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS price_type TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS floor_area_unit TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS broadband_availability TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS council_tax_band VARCHAR(10);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS council_tax_status TEXT;

ALTER TABLE properties ADD COLUMN IF NOT EXISTS first_published_at TIMESTAMP;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS original_asking_price NUMERIC;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS final_asking_price NUMERIC;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS achieved_price NUMERIC;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS achieved_rent NUMERIC;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS under_offer_at TIMESTAMP;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS sold_at TIMESTAMP;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS let_at TIMESTAMP;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS withdrawn_at TIMESTAMP;

COMMENT ON COLUMN properties.created_at IS 'Listing created date (internal). Not a sold/let transaction date.';
COMMENT ON COLUMN properties.first_published_at IS 'First time the listing was publicly visible. Null until recorded.';
COMMENT ON COLUMN properties.original_asking_price IS 'First advertised asking price. Null if never captured.';
COMMENT ON COLUMN properties.final_asking_price IS 'Last advertised asking price before sale/let/withdrawal.';
COMMENT ON COLUMN properties.achieved_price IS 'Completed sale price where legitimately known. Not asking price.';
COMMENT ON COLUMN properties.achieved_rent IS 'Achieved letting rent where legitimately known. Not asking rent.';
COMMENT ON COLUMN properties.sold_at IS 'Completion/sold date. Do not backfill from updated_at.';
COMMENT ON COLUMN properties.let_at IS 'Let completion date. Do not backfill from updated_at.';
COMMENT ON COLUMN properties.ground_rent IS 'Annual ground rent. Null means unknown — never treat as zero.';
COMMENT ON COLUMN properties.service_charges IS 'Residential service charge. Distinct from commercial service_charge.';

CREATE TABLE IF NOT EXISTS listing_events (
  id SERIAL PRIMARY KEY,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  event_type VARCHAR(40) NOT NULL,
  event_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actor_user_id INTEGER,
  payload JSONB,
  provenance JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_listing_events_property_type_at
  ON listing_events (property_id, event_type, event_at DESC);

COMMENT ON TABLE listing_events IS
  'Append-only listing activity. event_type: listing_created, first_published, price_change, view, unique_view, enquiry, viewing_request, offer, under_offer, sold, let, withdrawn, status_change. Empty until collectors are wired. Not a demand score.';

CREATE TABLE IF NOT EXISTS listing_engagement_daily (
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  unique_viewers INTEGER NOT NULL DEFAULT 0,
  enquiries INTEGER NOT NULL DEFAULT 0,
  viewing_requests INTEGER NOT NULL DEFAULT 0,
  offers INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (property_id, day)
);

COMMENT ON TABLE listing_engagement_daily IS
  'Daily rollup of first-party engagement. Null/zero counts mean none recorded, not zero market demand.';
