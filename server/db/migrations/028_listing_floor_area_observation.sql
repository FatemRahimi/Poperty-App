-- Listing first-party internal floor area observation (raw value + unit).
ALTER TABLE properties ADD COLUMN IF NOT EXISTS floor_area NUMERIC;
