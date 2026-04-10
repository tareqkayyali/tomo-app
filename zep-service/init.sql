-- Zep CE pre-flight: dedicated Railway PostgreSQL (pgvector/pgvector:pg16)
-- Idempotent — safe to run on every container restart

-- 1. Create pgvector extension in public schema if not exists
CREATE EXTENSION IF NOT EXISTS vector SCHEMA public;

-- 2. Verify pgvector is ready
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
  ELSE
    RAISE EXCEPTION 'pgvector creation failed — Zep cannot start';
  END IF;
END $$;
