-- =========================================================================
-- Migration 102: program_interactions table + snapshot/source columns
-- =========================================================================
-- History: this content was originally migration 090
-- (00000000000090_program_interactions_snapshot.sql) but had two
-- compounding bugs that blocked `supabase db reset`:
--   1. The migration only ALTERed an existing program_interactions
--      table — the CREATE was missing from any earlier migration.
--   2. The version 090 prefix collided with another migration of the
--      same number (00000000000090_dynamic_hero_coaching.sql), causing
--      a unique-key conflict on supabase_migrations.schema_migrations.
-- Renumbered to 102 (next free after 101_prompt_render_log) and rewritten
-- to be self-bootstrapping. Idempotent — safe on prod where the table
-- already exists with some subset of these columns. Prod's existing
-- schema_migrations row for version 090 (if any) becomes a harmless
-- orphan; the file at version 102 applies cleanly.
--
-- Stores: per-user program interactions ("active", "player_selected", etc).
-- Includes the full program snapshot so the Programs tab can render
-- coach-set / player-added / ai-recommended programs after AI regenerates,
-- without re-fetching the source training_programs row.
-- =========================================================================

-- Bare table — id + timestamps. All other columns added below as
-- ADD COLUMN IF NOT EXISTS for idempotency on environments where the
-- table was created by hand earlier.
CREATE TABLE IF NOT EXISTS public.program_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.program_interactions
  ADD COLUMN IF NOT EXISTS user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE public.program_interactions
  ADD COLUMN IF NOT EXISTS program_id UUID NOT NULL REFERENCES public.training_programs(id) ON DELETE CASCADE;

ALTER TABLE public.program_interactions
  ADD COLUMN IF NOT EXISTS action TEXT NOT NULL;

ALTER TABLE public.program_interactions
  ADD COLUMN IF NOT EXISTS program_snapshot JSONB;

ALTER TABLE public.program_interactions
  ADD COLUMN IF NOT EXISTS source TEXT;

-- Unique key for the upsert pattern in /api/v1/programs/interact
-- (onConflict: "user_id,program_id"). Created as a constraint so
-- ON CONFLICT can target it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'program_interactions_user_program_uq'
  ) THEN
    ALTER TABLE public.program_interactions
      ADD CONSTRAINT program_interactions_user_program_uq
      UNIQUE (user_id, program_id);
  END IF;
END $$;

-- Constrain source to known provenances. Done separately from ADD COLUMN
-- so re-running doesn't error on an already-present constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'program_interactions_source_check'
  ) THEN
    ALTER TABLE public.program_interactions
      ADD CONSTRAINT program_interactions_source_check
      CHECK (source IS NULL OR source IN ('coach', 'ai_recommended', 'player_added'));
  END IF;
END $$;

-- Index the hot read pattern (per-user lookups by action).
CREATE INDEX IF NOT EXISTS idx_program_interactions_user_action
  ON public.program_interactions(user_id, action);

-- RLS — athlete owns their own rows. Service role bypasses (route handlers).
ALTER TABLE public.program_interactions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'program_interactions'
      AND policyname = 'program_interactions_owner_read'
  ) THEN
    CREATE POLICY "program_interactions_owner_read"
      ON public.program_interactions FOR SELECT
      TO authenticated
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'program_interactions'
      AND policyname = 'program_interactions_owner_write'
  ) THEN
    CREATE POLICY "program_interactions_owner_write"
      ON public.program_interactions FOR ALL
      TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

COMMENT ON TABLE public.program_interactions IS
  'Per-user training program interactions ("active", "player_selected", etc). Stores program_snapshot + source so the Programs tab survives AI re-generation.';
