-- Zep CE pre-flight: handle Supabase conflicts before Zep starts
-- Idempotent — safe to run on every container restart

-- 1. Rename Supabase's public.users VIEW so Zep can create its own users TABLE
--    (Supabase creates this convenience view over auth.users; Zep needs the name)
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

-- 2. Ensure pgvector is available (no-op on Supabase — already installed)
DO $$
BEGIN
  PERFORM 1 FROM pg_extension WHERE extname = 'vector';
  IF NOT FOUND THEN
    CREATE EXTENSION vector;
    RAISE NOTICE 'Created pgvector extension';
  ELSE
    RAISE NOTICE 'pgvector extension already installed';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgvector check: % (non-fatal)', SQLERRM;
END $$;
