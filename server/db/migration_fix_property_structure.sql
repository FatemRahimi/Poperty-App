-- Migration: Fix property structure - separate category (rent/sale/lease) from property_type (flat/house/etc)
-- This migration creates the correct structure based on AddRent page requirements

-- Step 1: Add category column for rent/sale/lease
ALTER TABLE properties ADD COLUMN category VARCHAR(50);

-- Step 2: Rename existing property_type column to building_type temporarily
ALTER TABLE properties RENAME COLUMN property_type TO building_type_temp;

-- Step 3: Add new property_type column for flat/house/detached/etc
ALTER TABLE properties ADD COLUMN property_type VARCHAR(50);

-- Step 4: Migrate existing data
-- Set category based on business logic (you may need to adjust this based on your data)
UPDATE properties SET category = 'rent' WHERE building_type_temp IN ('detached', 'semi-detached', 'terraced', 'flat', 'bungalow', 'land', 'park_home', 'student_hall');

-- Step 5: Move building types to property_type column
UPDATE properties SET property_type = building_type_temp 
WHERE building_type_temp IN ('detached', 'semi-detached', 'terraced', 'flat', 'bungalow', 'land', 'park_home', 'student_hall');

-- Step 6: Handle AddRent property types (flat, house, studio, etc.)
UPDATE properties SET property_type = 'flat' WHERE building_type_temp = 'flat';
UPDATE properties SET property_type = 'house' WHERE building_type_temp IN ('detached', 'semi-detached', 'terraced');
UPDATE properties SET property_type = 'bungalow' WHERE building_type_temp = 'bungalow';

-- Step 7: Drop the temporary column
ALTER TABLE properties DROP COLUMN building_type_temp;

-- Step 8: Drop the old building_type column if it exists
ALTER TABLE properties DROP COLUMN IF EXISTS building_type;

-- Step 9: Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_properties_category ON properties(category);
CREATE INDEX IF NOT EXISTS idx_properties_property_type ON properties(property_type);

-- Step 10: Update schema comments for clarity
COMMENT ON COLUMN properties.category IS 'Property category: rent, sale, lease';
COMMENT ON COLUMN properties.property_type IS 'Property type: flat, house, studio, bungalow, maisonette, duplex, detached, semi-detached, terraced, etc.'; 