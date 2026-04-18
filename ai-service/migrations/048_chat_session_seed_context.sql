-- Migration 048: chat_sessions seed context (P3.2, 2026-04-18)
--
-- Adds the optional seed_context + seed_kind + seeded_at columns to
-- chat_sessions so the Ask Tomo Conflict Mediation flow can spin up a
-- new session with pinned context (event, annotations, triangle
-- inputs, safety snapshot). The Python supervisor hydrates this on
-- every turn via P3.3.
--
-- Design principles:
--   1. Nullable + default null. Every existing caller keeps working
--      unchanged. AI Chat Baseline Protection preserved.
--   2. seed_kind is a discriminator — callers reading the JSONB use
--      it to pick the right handler (conflict_mediation vs event
--      discussion vs program approval vs suggestion reply).
--   3. Pinned snapshot. The JSONB embeds 'snapshot_snapshot_at' so
--      the mediation transcript is reproducible even if athlete_
--      snapshots changes after the session opens. See P3.3.
--   4. Index is partial so un-seeded sessions don't bloat it.
--
-- Idempotent.

ALTER TABLE chat_sessions
  ADD COLUMN IF NOT EXISTS seed_context JSONB;

ALTER TABLE chat_sessions
  ADD COLUMN IF NOT EXISTS seed_kind TEXT
    CHECK (seed_kind IS NULL OR seed_kind IN (
      'event','program','suggestion','conflict_mediation'
    ));

ALTER TABLE chat_sessions
  ADD COLUMN IF NOT EXISTS seeded_at TIMESTAMPTZ;

COMMENT ON COLUMN chat_sessions.seed_context IS
  'Optional JSONB seed for sessions opened from a contextual pill (Ask Tomo conflict mediation, program approval, etc.). Pinned at session creation so the transcript stays reproducible. Shape varies per seed_kind. P3.2 2026-04-18.';

COMMENT ON COLUMN chat_sessions.seed_kind IS
  'Discriminator for seed_context shape. Null = conventional session (no seed). conflict_mediation = Ask Tomo pill on event with coach/parent disagreement.';

CREATE INDEX IF NOT EXISTS idx_chat_sessions_seed_kind
  ON chat_sessions (user_id, seed_kind, seeded_at DESC)
  WHERE seed_context IS NOT NULL;
