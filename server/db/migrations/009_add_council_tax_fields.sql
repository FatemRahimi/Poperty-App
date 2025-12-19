-- Migration: 009_add_council_tax_fields.sql
-- Description: Add council tax band and status fields for UK properties
-- Date: 2025-01-XX
-- Dependencies: init.sql (base schema), 002_add_new_fields.sql

-- Add council tax band (e.g., A, B, C, D, E, F, G, H)
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS council_tax_band VARCHAR(10);

-- Add council tax status (e.g., 'included', 'excluded', 'student_exempt')
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS council_tax_status VARCHAR(50);

-- Add index for council tax band (useful for filtering)
CREATE INDEX IF NOT EXISTS idx_properties_council_tax_band ON properties(council_tax_band);

