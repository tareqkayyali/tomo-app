-- Zep CE pre-flight database initialization
-- Runs BEFORE Zep starts to ensure clean schema

-- 1. Create dedicated schema for Zep (isolates from Supabase public schema)
CREATE SCHEMA IF NOT EXISTS zep;

-- 2. Handle conflicting objects in public schema
-- Supabase may have a public.users view/table that conflicts with Zep's users table
DO $$
BEGIN
  -- Rename conflicting view
  IF EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'users'
  ) THEN
    ALTER VIEW public.users RENAME TO _users_pre_zep_backup;
    RAISE NOTICE 'Renamed public.users VIEW to _users_pre_zep_backup';
  END IF;
END $$;

-- 3. Ensure pgvector extension is available
CREATE EXTENSION IF NOT EXISTS vector SCHEMA public;
