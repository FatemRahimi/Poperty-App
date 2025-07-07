-- Migration script for Smart Search functionality
-- Run this on existing databases to add the new columns and indexes

-- Add latitude and longitude columns if they don't exist (already added successfully)
-- ALTER TABLE properties 
-- ADD COLUMN IF NOT EXISTS latitude DECIMAL(10,8),
-- ADD COLUMN IF NOT EXISTS longitude DECIMAL(11,8);

-- Enable PostgreSQL trigram extension for fuzzy text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Smart search indexes for better performance (only for existing columns)
CREATE INDEX IF NOT EXISTS idx_properties_city ON properties(city);
CREATE INDEX IF NOT EXISTS idx_properties_category ON properties(category);
CREATE INDEX IF NOT EXISTS idx_properties_zip_code ON properties(zip_code);
CREATE INDEX IF NOT EXISTS idx_properties_state ON properties(state);
CREATE INDEX IF NOT EXISTS idx_properties_coordinates ON properties(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_properties_price ON properties(price);
CREATE INDEX IF NOT EXISTS idx_properties_monthly_rent ON properties(monthly_rent);
CREATE INDEX IF NOT EXISTS idx_properties_bedrooms ON properties(bedrooms);
CREATE INDEX IF NOT EXISTS idx_properties_bathrooms ON properties(bathrooms);

-- Full-text search indexes for title and description
CREATE INDEX IF NOT EXISTS idx_properties_title_trgm ON properties USING gin(title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_properties_description_trgm ON properties USING gin(description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_properties_address_trgm ON properties USING gin(address_line1 gin_trgm_ops);

-- Optional: Add separate house_number and street_name columns for future use
-- (Uncomment these if you want to add them later)
-- ALTER TABLE properties 
-- ADD COLUMN IF NOT EXISTS house_number VARCHAR(20),
-- ADD COLUMN IF NOT EXISTS street_name VARCHAR(200);

-- Clean up any empty address_line1 entries
UPDATE properties 
SET address_line1 = NULL 
WHERE TRIM(COALESCE(address_line1, '')) = '';

COMMIT; 