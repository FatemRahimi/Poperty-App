-- Migration script to add UK-specific lease fields
-- Run this script to add new fields for lease properties

-- Add VAT on Rent field
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS vat_on_rent VARCHAR(50);

-- Add Repairing Obligations field
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS repairing_obligation VARCHAR(100);

-- Add Insurance Responsibility field
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS insurance_responsibility VARCHAR(100);

-- Add Rent Review Frequency field (in years)
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS rent_review_frequency INTEGER;

-- Add comments to describe the fields
COMMENT ON COLUMN properties.vat_on_rent IS 'VAT status on rent: included, excluded, or not-applicable';
COMMENT ON COLUMN properties.repairing_obligation IS 'Who is responsible for repairs: full-repairing, internal-only, or landlord';
COMMENT ON COLUMN properties.insurance_responsibility IS 'Who is responsible for insurance: landlord, tenant, or shared';
COMMENT ON COLUMN properties.rent_review_frequency IS 'Frequency of rent reviews in years';

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_properties_vat_on_rent ON properties(vat_on_rent);
CREATE INDEX IF NOT EXISTS idx_properties_repairing_obligation ON properties(repairing_obligation);
CREATE INDEX IF NOT EXISTS idx_properties_insurance_responsibility ON properties(insurance_responsibility);

-- Verify the changes
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'properties' 
AND column_name IN ('vat_on_rent', 'repairing_obligation', 'insurance_responsibility', 'rent_review_frequency')
ORDER BY column_name;

