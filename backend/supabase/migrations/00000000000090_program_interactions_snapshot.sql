-- =========================================================================
-- Migration 090: program_interactions snapshot + source
-- =========================================================================
-- Adds full program data + provenance to program_interactions so that
-- "active" and "player_selected" programs survive AI re-generation and
-- can render their source (coach / ai_recommended / player_added) in the
-- Signal Dashboard Programs tab without re-fetching from other tables.
--
-- Idempotent. Safe to re-run.
-- =========================================================================

ALTER TABLE program_interactions
  ADD COLUMN IF NOT EXISTS program_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS source TEXT;

-- Constrain source to known provenances. Done separately from ADD COLUMN
-- so re-running doesn't error on an already-present constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'program_interactions_source_check'
  ) THEN
    ALTER TABLE program_interactions
      ADD CONSTRAINT program_interactions_source_check
      CHECK (source IS NULL OR source IN ('coach', 'ai_recommended', 'player_added'));
  END IF;
END $$;

-- Index the hot read pattern (per-user lookups by action).
CREATE INDEX IF NOT EXISTS idx_program_interactions_user_action
  ON program_interactions(user_id, action);

-- RLS is already on program_interactions from the foundation schema. No change needed.
