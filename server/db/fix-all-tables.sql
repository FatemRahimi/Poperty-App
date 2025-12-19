-- Fix ALL Table Permissions - Complete Solution
-- Run this script as PostgreSQL superuser (postgres)

-- Connect to propertydb database
\c propertydb

-- Grant schema privileges
GRANT ALL PRIVILEGES ON SCHEMA public TO fatemehrahimi;

-- Grant privileges on ALL existing tables
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO fatemehrahimi;

-- Grant privileges on ALL sequences
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO fatemehrahimi;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO fatemehrahimi;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO fatemehrahimi;

-- Make fatemehrahimi owner of public schema
ALTER SCHEMA public OWNER TO fatemehrahimi;

-- Transfer ownership of ALL existing tables to fatemehrahimi
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE 'ALTER TABLE public.' || quote_ident(r.tablename) || ' OWNER TO fatemehrahimi';
        RAISE NOTICE 'Changed owner of table % to fatemehrahimi', r.tablename;
    END LOOP;
END $$;

-- Transfer ownership of ALL sequences to fatemehrahimi
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public') LOOP
        EXECUTE 'ALTER SEQUENCE public.' || quote_ident(r.sequence_name) || ' OWNER TO fatemehrahimi';
        RAISE NOTICE 'Changed owner of sequence % to fatemehrahimi', r.sequence_name;
    END LOOP;
END $$;

-- Display confirmation
\echo ''
\echo '✅ ALL PERMISSIONS GRANTED SUCCESSFULLY!'
\echo ''
\echo 'Tables owned by fatemehrahimi:'
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tableowner = 'fatemehrahimi';
\echo ''
\echo '✅ You can now use the advisor profile form!'






