-- Clean base64 photo URLs from advisor_profiles expert_team field
-- This script removes large base64 data URLs that are causing form timeouts

-- Connect to the database
\c propertydb

-- Update all advisor profiles to remove base64 data URLs from expert team
UPDATE advisor_profiles
SET expert_team = (
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', expert->>'id',
      'fullName', expert->>'fullName',
      'jobTitle', expert->>'jobTitle',
      'phone', expert->>'phone',
      'email', expert->>'email',
      'profilePhotoUrl', 
        CASE 
          WHEN (expert->>'profilePhotoUrl') LIKE 'data:%' THEN NULL
          ELSE expert->>'profilePhotoUrl'
        END
    )
  )
  FROM jsonb_array_elements(expert_team) AS expert
)
WHERE expert_team IS NOT NULL 
  AND expert_team::text LIKE '%data:image%';

-- Show how many profiles were updated
SELECT COUNT(*) as profiles_cleaned 
FROM advisor_profiles 
WHERE expert_team IS NOT NULL;





