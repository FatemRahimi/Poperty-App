-- ============================================================================
-- COMPLETE PERMISSIONS FIX FOR WINDOWS POSTGRESQL
-- ============================================================================
-- This fixes the "permission denied for table users" error after restoring
-- a backup from Mac (where tables were owned by fatemehrahimi) to Windows
-- (where .env uses postgres user).
--
-- Run as: psql -U postgres -d propertydb -f server/db/grant-permissions.sql
-- ============================================================================

-- STEP 1: Make postgres owner of the database
ALTER DATABASE propertydb OWNER TO postgres;

-- STEP 2: Change ownership of ALL tables to postgres
-- (This is the KEY fix - ownership matters more than just GRANT)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format('ALTER TABLE public.%I OWNER TO postgres', r.tablename);
        RAISE NOTICE 'Changed ownership of table: %', r.tablename;
    END LOOP;
END $$;

-- STEP 3: Change ownership of ALL sequences to postgres
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT sequence_name 
        FROM information_schema.sequences 
        WHERE sequence_schema = 'public'
    LOOP
        EXECUTE format('ALTER SEQUENCE public.%I OWNER TO postgres', r.sequence_name);
        RAISE NOTICE 'Changed ownership of sequence: %', r.sequence_name;
    END LOOP;
END $$;

-- STEP 4: Grant schema permissions
GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO fatemehrahimi;

-- STEP 5: Grant permissions on all existing tables (backup, in case needed)
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO fatemehrahimi;

-- STEP 6: Grant permissions on all sequences
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO fatemehrahimi;

-- STEP 7: Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO fatemehrahimi;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO fatemehrahimi;

-- STEP 8: Verify ownership and permissions
SELECT 
    '✅ Table: ' || tablename || ' - Owner: ' || tableowner as status
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;

SELECT 
    '✅ Sequence: ' || sequence_name as status
FROM information_schema.sequences 
WHERE sequence_schema = 'public'
ORDER BY sequence_name;
