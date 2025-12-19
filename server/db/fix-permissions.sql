-- Fix Database Permissions for Advisor Profile
-- Run this script as a PostgreSQL superuser (postgres)

-- Connect to propertydb database first
\c propertydb

-- Grant all privileges on the public schema to REDACTED
GRANT ALL PRIVILEGES ON SCHEMA public TO REDACTED;

-- Grant all privileges on all existing tables
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO REDACTED;

-- Grant all privileges on all sequences (for SERIAL columns)
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO REDACTED;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO REDACTED;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO REDACTED;

-- Make REDACTED the owner of the public schema
ALTER SCHEMA public OWNER TO REDACTED;

-- If advisor_profiles table already exists, make sure REDACTED owns it
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'advisor_profiles') THEN
        ALTER TABLE advisor_profiles OWNER TO REDACTED;
    END IF;
END $$;

-- If advisor_experts table already exists, make sure REDACTED owns it
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'advisor_experts') THEN
        ALTER TABLE advisor_experts OWNER TO REDACTED;
    END IF;
END $$;

-- Make sure REDACTED owns the users table (critical for advisor profile completion)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users') THEN
        ALTER TABLE users OWNER TO REDACTED;
    END IF;
END $$;

-- Grant all privileges on users table explicitly
GRANT ALL PRIVILEGES ON TABLE users TO REDACTED;

-- Display confirmation
\echo '✅ Permissions granted successfully!'
\echo ''
\echo 'You can now:'
\echo '  - Create tables as REDACTED'
\echo '  - Insert/Update/Delete data'
\echo '  - Use all schema features'
\echo ''
\echo 'Test the fix by submitting the advisor profile form again.'

