-- Zep CE pre-flight: fix Supabase compatibility before Zep starts
-- Idempotent — safe to run on every container restart

-- 1. Verify pgvector is in public schema (moved manually via SQL Editor)
DO $$
DECLARE
  ext_schema text;
BEGIN
  SELECT n.nspname INTO ext_schema
  FROM pg_extension e
  JOIN pg_namespace n ON e.extnamespace = n.oid
  WHERE e.extname = 'vector';

  IF ext_schema = 'public' THEN
    RAISE NOTICE 'pgvector in public schema — OK';
  ELSIF ext_schema IS NOT NULL THEN
    RAISE WARNING 'pgvector is in % schema — Zep needs it in public!', ext_schema;
  ELSE
    RAISE WARNING 'pgvector extension not found!';
  END IF;
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
