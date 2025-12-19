-- Migration: Add property_consultant field to properties table
-- This field stores the name of the property consultant when user skipped advisor profile setup

ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS property_consultant VARCHAR(255);

-- Add comment for documentation
COMMENT ON COLUMN properties.property_consultant IS 'Name of property consultant when user skipped advisor profile setup'; 