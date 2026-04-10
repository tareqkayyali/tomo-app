-- Zep CE pre-flight: fix Supabase compatibility before Zep starts
-- Idempotent — safe to run on every container restart

-- 0. Disable pgaudit for this session (Supabase's pgaudit blocks extension DDL)
SET pgaudit.log = 'none';

-- 1. CRITICAL: Move pgvector from 'extensions' schema to 'public' schema
--    Supabase installs pgvector in 'extensions' but Zep resolves types
--    in 'public' only. Moving the extension makes the 'vector' type
--    findable regardless of search_path settings.
DO $$
DECLARE
  ext_schema text;
BEGIN
  SELECT n.nspname INTO ext_schema
  FROM pg_extension e
  JOIN pg_namespace n ON e.extnamespace = n.oid
  WHERE e.extname = 'vector';

  IF ext_schema IS NULL THEN
    -- pgvector not installed at all — create it in public
    CREATE EXTENSION vector SCHEMA public;
    RAISE NOTICE 'Created pgvector in public schema';
  ELSIF ext_schema = 'public' THEN
    RAISE NOTICE 'pgvector already in public schema — OK';
  ELSE
    -- pgvector is in extensions/other schema — move to public
    EXECUTE format('ALTER EXTENSION vector SET SCHEMA public');
    RAISE NOTICE 'Moved pgvector from % to public schema', ext_schema;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'pgvector schema fix failed: %. Trying search_path fallback...', SQLERRM;
  -- Fallback: set database-level search_path to include extensions
  BEGIN
    EXECUTE 'ALTER DATABASE postgres SET search_path TO "$user", public, extensions';
    RAISE NOTICE 'Set database search_path to include extensions (fallback)';
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Database search_path fallback also failed: %', SQLERRM;
  END;
END $$;

-- 2. Rename Supabase's public.users VIEW so Zep can create its own users TABLE
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'users'
  ) THEN
    EXECUTE 'ALTER VIEW public.users RENAME TO _users_supabase_backup';
    RAISE NOTICE 'Renamed public.users VIEW → _users_supabase_backup';
  END IF;
END $$;
