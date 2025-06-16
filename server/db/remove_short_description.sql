-- Migration to remove short_description column from properties table
-- Run this to remove the short_description field completely

ALTER TABLE properties DROP COLUMN IF EXISTS short_description; 