-- Migration script to add new fields to properties table
-- Run this script to add the new fields for EPC Rating, Key Features, and Layout

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

-- Verify the changes
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'properties' 
AND column_name IN ('epc_rating', 'key_features', 'layout_file_name', 'layout_file_url', 'apartment_size', 'floor_number', 'custom_features')
ORDER BY column_name; 