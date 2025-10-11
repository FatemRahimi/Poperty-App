-- Add has_residential_accommodation column to properties table
-- This field indicates if a commercial property includes residential/living accommodation

ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS has_residential_accommodation BOOLEAN DEFAULT false;

-- Add comment to explain the field
COMMENT ON COLUMN properties.has_residential_accommodation IS 'Indicates if commercial property includes residential/living accommodation (e.g., caretaker flat, living quarters)';

