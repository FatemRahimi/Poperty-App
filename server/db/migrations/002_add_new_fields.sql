-- Migration: 002_add_new_fields.sql
-- Description: Add EPC Rating, Key Features, Layout, and Custom Features fields
-- Date: Initial migration
-- Dependencies: 001 (init.sql)

-- Add EPC Rating field
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS epc_rating VARCHAR(10);

-- Add Key Features field (JSONB for storing array of features)
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS key_features JSONB;

-- Add Layout of Property fields
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS layout_file_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS layout_file_url TEXT,
ADD COLUMN IF NOT EXISTS apartment_size VARCHAR(50),
ADD COLUMN IF NOT EXISTS floor_number VARCHAR(50);

-- Update existing records to have default values
UPDATE properties 
SET key_features = '[]'::jsonb 
WHERE key_features IS NULL;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_properties_epc_rating ON properties(epc_rating);
CREATE INDEX IF NOT EXISTS idx_properties_key_features ON properties USING gin(key_features);

-- Add custom features field for user-defined features
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS custom_features TEXT;

-- Add index for custom_features
CREATE INDEX IF NOT EXISTS idx_properties_custom_features ON properties(custom_features);

-- Add comment to describe the custom_features field
COMMENT ON COLUMN properties.custom_features IS 'JSON array of custom features added by users (e.g., ["Sea view", "Wine cellar", "Smart home system"])';

-- Add reception rooms field (number of reception/living rooms)
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS reception_rooms INTEGER;

-- Add local authority field (UK council/local authority name)
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS local_authority VARCHAR(255);

-- Add nearest transport links field (description of nearby transport)
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS nearest_transport_links TEXT;

-- Add virtual tour link field (URL to virtual tour)
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS virtual_tour_link TEXT;

-- Add heating type field (e.g., "gas", "electric", "oil", "heat pump")
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS heating_type VARCHAR(100);

-- Add broadband availability field (e.g., "fibre", "cable", "ADSL")
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS broadband_availability VARCHAR(100);

-- Add accessibility features field (JSON array of accessibility features)
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS accessibility_features TEXT;

-- Add indexes for new fields
CREATE INDEX IF NOT EXISTS idx_properties_reception_rooms ON properties(reception_rooms);
CREATE INDEX IF NOT EXISTS idx_properties_local_authority ON properties(local_authority);
CREATE INDEX IF NOT EXISTS idx_properties_heating_type ON properties(heating_type);
CREATE INDEX IF NOT EXISTS idx_properties_broadband_availability ON properties(broadband_availability);

