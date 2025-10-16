-- Migration: Add UK-specific lease fields
-- These fields are required for commercial lease properties in the UK

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

-- Verify the columns were added
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'properties' 
AND column_name IN ('vat_on_rent', 'repairing_obligation', 'insurance_responsibility', 'rent_review_frequency')
ORDER BY column_name;
