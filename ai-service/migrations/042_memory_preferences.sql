-- Migration 042: Athlete Memory Preferences
-- Stores per-athlete memory configuration for the 4-tier memory system.
-- Run in Supabase SQL Editor.

-- ── Table ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS athlete_memory_preferences (
  athlete_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Memory tier toggles (all default ON)
  episodic_enabled   BOOLEAN NOT NULL DEFAULT true,   -- Zep session history
  semantic_enabled   BOOLEAN NOT NULL DEFAULT true,   -- Zep fact extraction
  procedural_enabled BOOLEAN NOT NULL DEFAULT true,   -- AIB generation
  longitudinal_enabled BOOLEAN NOT NULL DEFAULT true, -- Cross-session Haiku extraction

  -- Privacy preferences
  remember_goals     BOOLEAN NOT NULL DEFAULT true,
  remember_concerns  BOOLEAN NOT NULL DEFAULT true,
  remember_injuries  BOOLEAN NOT NULL DEFAULT true,
  remember_preferences BOOLEAN NOT NULL DEFAULT true,

  -- Zep metadata
  zep_user_created   BOOLEAN NOT NULL DEFAULT false,  -- Whether user exists in Zep
  zep_session_count  INT NOT NULL DEFAULT 0,          -- Tracked Zep sessions
  last_memory_sync   TIMESTAMPTZ,                     -- Last Zep sync timestamp

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-update timestamp
CREATE OR REPLACE FUNCTION update_memory_preferences_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_memory_preferences_updated
  BEFORE UPDATE ON athlete_memory_preferences
  FOR EACH ROW EXECUTE FUNCTION update_memory_preferences_timestamp();

-- ── RLS ──────────────────────────────────────────────────────────────

ALTER TABLE athlete_memory_preferences ENABLE ROW LEVEL SECURITY;

-- Athletes can read their own preferences
CREATE POLICY "Athletes can read own memory preferences"
  ON athlete_memory_preferences FOR SELECT
  USING (athlete_id = auth.uid());

-- Athletes can update their own preferences
CREATE POLICY "Athletes can update own memory preferences"
  ON athlete_memory_preferences FOR UPDATE
  USING (athlete_id = auth.uid());

-- Service role has full access
CREATE POLICY "Service role full access to memory preferences"
  ON athlete_memory_preferences FOR ALL
  USING (auth.role() = 'service_role');

-- ── Index ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_memory_prefs_last_sync
  ON athlete_memory_preferences(last_memory_sync)
  WHERE last_memory_sync IS NOT NULL;

-- ── Comment ──────────────────────────────────────────────────────────

COMMENT ON TABLE athlete_memory_preferences IS
  'Per-athlete memory preferences for the 4-tier memory system (Zep CE + AIB + longitudinal).';
