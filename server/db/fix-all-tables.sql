-- Fix ALL Table Permissions - Complete Solution
-- Run this script as PostgreSQL superuser (postgres)

-- Connect to propertydb database
\c propertydb

-- Grant schema privileges
GRANT ALL PRIVILEGES ON SCHEMA public TO REDACTED;

-- Grant privileges on ALL existing tables
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO REDACTED;

-- Grant privileges on ALL sequences
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO REDACTED;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO REDACTED;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO REDACTED;

-- Make REDACTED owner of public schema
ALTER SCHEMA public OWNER TO REDACTED;

-- Transfer ownership of ALL existing tables to REDACTED
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE 'ALTER TABLE public.' || quote_ident(r.tablename) || ' OWNER TO REDACTED';
        RAISE NOTICE 'Changed owner of table % to REDACTED', r.tablename;
    END LOOP;
END $$;

-- Transfer ownership of ALL sequences to REDACTED
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public') LOOP
        EXECUTE 'ALTER SEQUENCE public.' || quote_ident(r.sequence_name) || ' OWNER TO REDACTED';
        RAISE NOTICE 'Changed owner of sequence % to REDACTED', r.sequence_name;
    END LOOP;
END $$;

-- Display confirmation
\echo ''
\echo '✅ ALL PERMISSIONS GRANTED SUCCESSFULLY!'
\echo ''
\echo 'Tables owned by REDACTED:'
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tableowner = 'REDACTED';
\echo ''
\echo '✅ You can now use the advisor profile form!'






