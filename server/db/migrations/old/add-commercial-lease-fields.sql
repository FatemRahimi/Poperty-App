-- Migration script to add commercial lease-specific fields
-- Run this script to add new fields for commercial lease properties

-- ========================================
-- BASIC SPACE INFORMATION
-- ========================================

-- Space subtypes (e.g., Warehouse, Showroom)
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS space_subtypes VARCHAR(255);

-- Lease type (FRI, IRL, Inclusive)
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS lease_type VARCHAR(100);

-- Use class (Class E, B2, B8, Sui Generis)
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS use_class VARCHAR(100);

-- ========================================
-- BUILDING DETAILS & MEASUREMENTS
-- ========================================

-- Minimum divisible area in sqft
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS min_divisible INTEGER;

-- Vacant square footage
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS vacant_sqft INTEGER;

-- Land size in acres
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS land_acres DECIMAL(10,2);

-- Lot size unit (acres, sqft, sqm)
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS lot_size_unit VARCHAR(50);

-- ========================================
-- BUILDING SPECIFICATIONS
-- ========================================

-- Taxes per square foot
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS taxes_per_sqft DECIMAL(10,2);

-- Power specification (e.g., 3-phase, 100 amp)
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS power VARCHAR(255);

-- Zoning classification
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS zoning VARCHAR(255);

-- Floor loading capacity
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS floor_load_capacity VARCHAR(100);

-- ========================================
-- FINANCIAL TERMS
-- ========================================

-- Service charge amount
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS service_charge DECIMAL(10,2);

-- Business rates
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS business_rates DECIMAL(10,2);

-- ========================================
-- FACILITIES & AMENITIES
-- ========================================

-- Heating and cooling system type
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS heating_cooling VARCHAR(100);

-- Toilet and kitchen facilities
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS toilet_kitchen VARCHAR(100);

-- Utilities (water, gas, internet, electricity) - JSONB format
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS utilities JSONB DEFAULT '{}'::jsonb;

-- Security features (cctv, keyFob, secureAccess) - JSONB format
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS security JSONB DEFAULT '{}'::jsonb;

-- ========================================
-- OPERATIONAL & REGULATORY
-- ========================================

-- Allowed opening hours
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS opening_hours VARCHAR(255);

-- Multiple tenancy allowed
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS is_multiple_tenancy BOOLEAN DEFAULT false;

-- Signage allowed
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS signage_allowed BOOLEAN DEFAULT false;

-- Disability access
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS disability_access BOOLEAN DEFAULT false;

-- ========================================
-- LEASE TERMS
-- ========================================

-- Break clause in lease
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS break_clause BOOLEAN DEFAULT false;

-- Deposit required
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS deposit_required BOOLEAN DEFAULT false;

-- ========================================
-- INDEXES FOR PERFORMANCE
-- ========================================

CREATE INDEX IF NOT EXISTS idx_properties_space_subtypes ON properties(space_subtypes);
CREATE INDEX IF NOT EXISTS idx_properties_lease_type ON properties(lease_type);
CREATE INDEX IF NOT EXISTS idx_properties_use_class ON properties(use_class);
CREATE INDEX IF NOT EXISTS idx_properties_vacant_sqft ON properties(vacant_sqft);
CREATE INDEX IF NOT EXISTS idx_properties_min_divisible ON properties(min_divisible);
CREATE INDEX IF NOT EXISTS idx_properties_service_charge ON properties(service_charge);
CREATE INDEX IF NOT EXISTS idx_properties_business_rates ON properties(business_rates);
CREATE INDEX IF NOT EXISTS idx_properties_is_multiple_tenancy ON properties(is_multiple_tenancy);

-- JSONB indexes for complex queries
CREATE INDEX IF NOT EXISTS idx_properties_utilities ON properties USING gin(utilities);
CREATE INDEX IF NOT EXISTS idx_properties_security ON properties USING gin(security);

-- ========================================
-- COMMENTS FOR DOCUMENTATION
-- ========================================

COMMENT ON COLUMN properties.space_subtypes IS 'Commercial space subtypes (e.g., Warehouse, Showroom, Office Suite)';
COMMENT ON COLUMN properties.lease_type IS 'Type of lease: FRI (Full Repairing & Insuring), IRL (Internal Repairing Lease), Inclusive';
COMMENT ON COLUMN properties.use_class IS 'UK use class designation: Class E, B2, B8, Sui Generis';
COMMENT ON COLUMN properties.min_divisible IS 'Minimum divisible area in square feet';
COMMENT ON COLUMN properties.vacant_sqft IS 'Vacant square footage available';
COMMENT ON COLUMN properties.land_acres IS 'Land size in acres';
COMMENT ON COLUMN properties.lot_size_unit IS 'Unit for lot size measurement: acres, sqft, sqm';
COMMENT ON COLUMN properties.taxes_per_sqft IS 'Tax amount per square foot';
COMMENT ON COLUMN properties.power IS 'Power specifications (e.g., 3-phase, 100 amp)';
COMMENT ON COLUMN properties.zoning IS 'Zoning classification';
COMMENT ON COLUMN properties.service_charge IS 'Monthly service charge amount';
COMMENT ON COLUMN properties.business_rates IS 'Annual business rates';
COMMENT ON COLUMN properties.floor_load_capacity IS 'Floor loading capacity specification';
COMMENT ON COLUMN properties.heating_cooling IS 'Heating and cooling system type: central, individual, none';
COMMENT ON COLUMN properties.toilet_kitchen IS 'Toilet and kitchen facilities: shared, private, none';
COMMENT ON COLUMN properties.utilities IS 'JSONB object for utilities: {water, gas, internet, electricity}';
COMMENT ON COLUMN properties.security IS 'JSONB object for security features: {cctv, keyFob, secureAccess}';
COMMENT ON COLUMN properties.opening_hours IS 'Permitted operating hours';
COMMENT ON COLUMN properties.is_multiple_tenancy IS 'Whether multiple tenancy is allowed';
COMMENT ON COLUMN properties.signage_allowed IS 'Whether external signage is permitted';
COMMENT ON COLUMN properties.disability_access IS 'Whether property has disability access';
COMMENT ON COLUMN properties.break_clause IS 'Whether lease includes a break clause';
COMMENT ON COLUMN properties.deposit_required IS 'Whether a deposit is required for the lease';

-- ========================================
-- VERIFICATION QUERY
-- ========================================

-- Verify all new columns have been added
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'properties' 
AND column_name IN (
  'space_subtypes', 'lease_type', 'use_class', 'min_divisible', 'vacant_sqft', 
  'land_acres', 'lot_size_unit', 'taxes_per_sqft', 'power', 'zoning', 
  'service_charge', 'business_rates', 'floor_load_capacity', 'heating_cooling', 
  'toilet_kitchen', 'utilities', 'security', 'opening_hours', 'is_multiple_tenancy', 
  'signage_allowed', 'disability_access', 'break_clause', 'deposit_required'
)
ORDER BY column_name;

