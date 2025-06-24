-- Migration: Add building_type column and separate property types from building types
-- This migration fixes the confusion between property_type (rent/sale/lease) and building_type (detached/flat/etc.)

-- Step 1: Add building_type column
ALTER TABLE properties ADD COLUMN building_type VARCHAR(50);

-- Step 2: Migrate existing data - move building types from property_type to building_type
UPDATE properties SET building_type = property_type 
WHERE property_type IN ('detached', 'semi-detached', 'terraced', 'flat', 'bungalow', 'land', 'park_home', 'student_hall');

-- Step 3: Update property_type to contain actual property categories
-- For now, set all to 'rent' as default - this should be updated based on your business logic
UPDATE properties SET property_type = 'rent' 
WHERE property_type IN ('detached', 'semi-detached', 'terraced', 'flat', 'bungalow', 'land', 'park_home', 'student_hall');

-- Step 4: Add index for better performance
CREATE INDEX IF NOT EXISTS idx_properties_building_type ON properties(building_type);

-- Step 5: Update schema comments for clarity
COMMENT ON COLUMN properties.property_type IS 'Property category: rent, sale, lease';
COMMENT ON COLUMN properties.building_type IS 'Building type: detached, semi-detached, terraced, flat, bungalow, land, park_home, student_hall'; 