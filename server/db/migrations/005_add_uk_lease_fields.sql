-- Migration: 005_add_uk_lease_fields.sql
-- Description: Add UK-specific lease fields
-- Date: Initial migration
-- Dependencies: 004

-- Add UK-specific lease fields
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS vat_on_rent VARCHAR(50);

ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS repairing_obligation VARCHAR(100);

ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS insurance_responsibility VARCHAR(100);

ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS rent_review_frequency INTEGER;

-- Add comments for documentation
COMMENT ON COLUMN properties.vat_on_rent IS 'VAT status: included, excluded, or not-applicable';
COMMENT ON COLUMN properties.repairing_obligation IS 'Who is responsible for repairs: full-repairing, internal-only, or landlord';
COMMENT ON COLUMN properties.insurance_responsibility IS 'Who handles insurance: landlord, tenant, or shared';
COMMENT ON COLUMN properties.rent_review_frequency IS 'How often rent is reviewed (in years)';

