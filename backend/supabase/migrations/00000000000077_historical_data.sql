-- ───────────────────────────────────────────────────────────────────────────
-- Migration 077: Athlete Historical Data (Profile > Historical Data)
--
-- Adds pre-Tomo training context so the AI chat context builder and CV
-- engine can reason about the athlete's true training age and history,
-- instead of treating users.created_at as epoch zero.
--
-- Scope:
--   1) users.training_started_at + users.training_history_note
--   2) phone_test_sessions.source flag (historical_self_reported vs manual)
--   3) athlete_injury_history table (past injuries, read-only for risk model)
--
-- All statements are idempotent — safe to re-run on partially-applied states.
-- ───────────────────────────────────────────────────────────────────────────

-- 1) Training history columns on users --------------------------------------

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS training_started_at date,
  ADD COLUMN IF NOT EXISTS training_history_note text;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_training_note_len_chk;
ALTER TABLE public.users
  ADD CONSTRAINT users_training_note_len_chk
  CHECK (training_history_note IS NULL OR char_length(training_history_note) <= 280);

COMMENT ON COLUMN public.users.training_started_at IS
  'Self-reported date when athlete started training seriously (pre-Tomo). NULL = unknown; fall back to created_at.';
COMMENT ON COLUMN public.users.training_history_note IS
  'Free-text note about training history prior to Tomo (e.g. "academy from age 8, futsal before that"). Max 280 chars.';

-- 2) Source flag on phone_test_sessions -------------------------------------

ALTER TABLE public.phone_test_sessions
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

CREATE INDEX IF NOT EXISTS idx_phone_tests_source
  ON public.phone_test_sessions(user_id, source, date DESC);

COMMENT ON COLUMN public.phone_test_sessions.source IS
  'Origin of the test: manual (live Tomo test), historical_self_reported (pre-Tomo), wearable, etc.';

-- 3) Injury history table ---------------------------------------------------

CREATE TABLE IF NOT EXISTS public.athlete_injury_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  body_area   text NOT NULL,
  severity    text NOT NULL CHECK (severity IN ('minor','moderate','severe')),
  year        smallint NOT NULL CHECK (year BETWEEN 1990 AND 2100),
  weeks_out   smallint CHECK (weeks_out IS NULL OR weeks_out BETWEEN 0 AND 260),
  resolved    boolean NOT NULL DEFAULT true,
  note        text CHECK (note IS NULL OR char_length(note) <= 280),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_injury_history_user
  ON public.athlete_injury_history(user_id, year DESC);

ALTER TABLE public.athlete_injury_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "injury_history_select_own" ON public.athlete_injury_history;
CREATE POLICY "injury_history_select_own" ON public.athlete_injury_history
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "injury_history_insert_own" ON public.athlete_injury_history;
CREATE POLICY "injury_history_insert_own" ON public.athlete_injury_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "injury_history_update_own" ON public.athlete_injury_history;
CREATE POLICY "injury_history_update_own" ON public.athlete_injury_history
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "injury_history_delete_own" ON public.athlete_injury_history;
CREATE POLICY "injury_history_delete_own" ON public.athlete_injury_history
  FOR DELETE USING (auth.uid() = user_id);

COMMENT ON TABLE public.athlete_injury_history IS
  'Self-reported pre-Tomo injury history. Read-only input to AI coaching prompts; does NOT feed current injury_risk_flag in v1.';
