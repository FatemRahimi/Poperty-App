-- Migration: 007_add_property_consultant.sql
-- Description: Add property_consultant field for when user skips advisor profile setup
-- Date: Initial migration
-- Dependencies: 006

-- Add property_consultant field to properties table
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS property_consultant VARCHAR(255);

-- Add comment for documentation
COMMENT ON COLUMN properties.property_consultant IS 'Name of property consultant when user skipped advisor profile setup';

