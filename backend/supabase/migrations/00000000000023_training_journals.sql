-- ============================================================================
-- Migration 023: Training Journals — Pre/Post Session Journaling
-- Structured pre-session target setting and post-session reflection for
-- all training-related calendar events (training, match, recovery).
-- ============================================================================

-- Core journals table
CREATE TABLE public.training_journals (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id               UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  calendar_event_id     UUID NOT NULL REFERENCES public.calendar_events(id) ON DELETE CASCADE,
  event_date            DATE NOT NULL,
  training_category     TEXT NOT NULL,        -- sourced from event title or schedule category
  training_name         TEXT NOT NULL,

  -- Pre-session fields
  pre_target            TEXT,                 -- "What's your target?"
  pre_mental_cue        TEXT,                 -- optional one word/phrase
  pre_focus_tag         TEXT,                 -- strength|speed|technique|tactical|fitness
  pre_set_at            TIMESTAMPTZ,

  -- Post-session fields
  post_outcome          TEXT CHECK (post_outcome IN ('fell_short', 'hit_it', 'exceeded')),
  post_reflection       TEXT,                 -- "What happened?"
  post_next_focus       TEXT,                 -- optional
  post_body_feel        SMALLINT CHECK (post_body_feel BETWEEN 1 AND 10),
  post_set_at           TIMESTAMPTZ,

  -- Journal variant (standard training, recovery, match)
  journal_variant       TEXT NOT NULL DEFAULT 'standard'
                        CHECK (journal_variant IN ('standard', 'recovery', 'match')),

  -- AI-derived (generated async after post submission)
  ai_insight            TEXT,
  ai_insight_generated  BOOLEAN DEFAULT false,

  -- State machine: empty → pre_set → complete
  journal_state         TEXT NOT NULL DEFAULT 'empty'
                        CHECK (journal_state IN ('empty', 'pre_set', 'complete')),
  locked_at             TIMESTAMPTZ,          -- set 24h after post_set_at (app-level)
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One journal per calendar event
  UNIQUE (user_id, calendar_event_id)
);

-- Primary query: athlete's journals by date
CREATE INDEX idx_journals_athlete
  ON public.training_journals (user_id, event_date DESC);

-- FK lookup from calendar events
CREATE INDEX idx_journals_event
  ON public.training_journals (calendar_event_id);

-- State-based queries (pending reflections)
CREATE INDEX idx_journals_state
  ON public.training_journals (user_id, journal_state);

-- Pending post-reflection query
CREATE INDEX idx_journals_pending_post
  ON public.training_journals (user_id, post_set_at)
  WHERE journal_state = 'pre_set';

-- Row-level security
ALTER TABLE public.training_journals ENABLE ROW LEVEL SECURITY;

-- Athletes read/write own journals
CREATE POLICY "Athletes manage own journals"
  ON public.training_journals FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Coaches read linked athlete journals (metrics only — text gated by sharing prefs, future)
CREATE POLICY "Coaches read linked athlete journals"
  ON public.training_journals FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.relationships
      WHERE guardian_id = auth.uid()
        AND player_id = public.training_journals.user_id
        AND status = 'accepted'
    )
  );

-- Service role full access
GRANT ALL ON public.training_journals TO service_role;


-- ============================================================================
-- Snapshot Additions — Journal tracking fields
-- ============================================================================

ALTER TABLE public.athlete_snapshots
  ADD COLUMN IF NOT EXISTS journal_completeness_7d      NUMERIC(4,3),
  ADD COLUMN IF NOT EXISTS journal_streak_days           SMALLINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS target_achievement_rate_30d   NUMERIC(4,3),
  ADD COLUMN IF NOT EXISTS last_journal_at               TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pending_pre_journal_count     SMALLINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pending_post_journal_count    SMALLINT DEFAULT 0;


-- ============================================================================
-- Recommendation type update — add JOURNAL_NUDGE
-- ============================================================================

ALTER TABLE public.athlete_recommendations
  DROP CONSTRAINT IF EXISTS athlete_recommendations_rec_type_check;

ALTER TABLE public.athlete_recommendations
  ADD CONSTRAINT athlete_recommendations_rec_type_check
  CHECK (rec_type IN (
    'READINESS', 'LOAD_WARNING', 'RECOVERY', 'DEVELOPMENT',
    'ACADEMIC', 'CV_OPPORTUNITY', 'TRIANGLE_ALERT', 'MOTIVATION',
    'JOURNAL_NUDGE'
  ));
