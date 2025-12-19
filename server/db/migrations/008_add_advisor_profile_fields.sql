-- Migration: 008_add_advisor_profile_fields.sql
-- Description: Add missing fields to advisor_profiles table that are used by backend code
-- Date: Initial migration
-- Dependencies: 007

-- Add missing fields to advisor_profiles table
ALTER TABLE advisor_profiles 
ADD COLUMN IF NOT EXISTS expert_team JSONB DEFAULT '[]'::jsonb;

ALTER TABLE advisor_profiles 
ADD COLUMN IF NOT EXISTS company_website VARCHAR(255);

ALTER TABLE advisor_profiles 
ADD COLUMN IF NOT EXISTS company_email VARCHAR(255);

ALTER TABLE advisor_profiles 
ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(50);

-- Add index for expert_team queries
CREATE INDEX IF NOT EXISTS idx_advisor_profiles_expert_team ON advisor_profiles USING gin(expert_team);

-- Add comments for documentation
COMMENT ON COLUMN advisor_profiles.expert_team IS 'JSONB array of expert team members (legacy field, advisor_experts table is preferred)';
COMMENT ON COLUMN advisor_profiles.company_website IS 'Company website URL';
COMMENT ON COLUMN advisor_profiles.company_email IS 'Company email address';
COMMENT ON COLUMN advisor_profiles.contact_phone IS 'Contact phone number';

