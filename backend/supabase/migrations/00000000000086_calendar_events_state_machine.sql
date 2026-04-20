-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 086 — calendar_events state machine
-- ═══════════════════════════════════════════════════════════════════════════
--
-- PR 5 of the config-engine + completion-UX series. Adds the state-machine
-- columns needed to distinguish a scheduled event from one the athlete
-- actually completed. The consumers (completion API, mobile UI, bridge
-- filter) land in PR 6+7. This PR only adds columns + backfills historical
-- rows so the column is always populated on reads.
--
-- State model (see load_attribution_v1 config for the trigger policy):
--   scheduled → completed   (athlete tap OR check-in retro-confirm OR
--                            wearable match)
--   scheduled → skipped     (24h after end_at with no completion signal)
--   scheduled → deleted     (athlete removes the event)
--   completed / skipped are terminal (new events replace, never mutate).
--
-- Columns added (all NULL-able at first, tightened in PR 6):
--   status              'scheduled' | 'completed' | 'skipped' | 'deleted'
--   completed_at        when the flip to completed happened
--   completion_source   'manual' | 'checkin' | 'wearable' | 'blend' | 'backfill'
--   reported_rpe        athlete's post-session RPE (1–10)
--   reported_duration   athlete-reported actual duration (minutes)
--   effective_intensity the intensity that drove the AU on SESSION_LOG
--                       (may differ from the scheduled `intensity` after a
--                        wearable/RPE re-resolve)
--   confidence_score    0.0–1.0 — how trustworthy is this completion signal
--
-- Relationship to the existing `completed: boolean` column (migration 056):
--   The boolean is kept for backward compatibility — week-plan compliance
--   math, FlowTimeline mobile UI, PATCH /api/v1/calendar/events/[id]
--   already key off it. The new `status` column is the richer source of
--   truth. Consumers that can handle the state machine should read
--   `status`; callers that only know `completed` still work.
--
--   PR 6 updates the PATCH endpoint so toggling `completed` also writes
--   `status` (and vice-versa) so the two never drift.
--
-- Backfill policy:
--   completed=true          → status='completed' (preserves existing signal)
--   end_at < NOW() ∧ !completed → status='completed', completion_source='backfill'
--                       (preserves current ATL/CTL exactly; historical rows
--                        already bridged into daily_load keep contributing)
--   end_at >= NOW()  → status='scheduled' (the default)
--   end_at IS NULL   → status='scheduled' (no-end-time events can't auto-
--                       skip by time; they stay scheduled until someone
--                       acts on them)
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + UPDATE WHERE status IS NULL.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Columns ───────────────────────────────────────────────────────────────

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS status TEXT
    CHECK (status IS NULL OR status IN ('scheduled', 'completed', 'skipped', 'deleted'));

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS completion_source TEXT
    CHECK (completion_source IS NULL
        OR completion_source IN ('manual', 'checkin', 'wearable', 'blend', 'backfill'));

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS reported_rpe SMALLINT
    CHECK (reported_rpe IS NULL OR reported_rpe BETWEEN 1 AND 10);

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS reported_duration INTEGER
    CHECK (reported_duration IS NULL OR reported_duration > 0);

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS effective_intensity TEXT
    CHECK (effective_intensity IS NULL
        OR effective_intensity IN ('REST', 'LIGHT', 'MODERATE', 'HARD'));

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(3,2)
    CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1));


-- ─── Column comments ──────────────────────────────────────────────────────

COMMENT ON COLUMN public.calendar_events.status IS
  'State-machine position. scheduled = future or not-yet-confirmed; completed = athlete confirmed (via tap, check-in retro-confirm, or wearable match); skipped = auto-flagged 24h post-end with no signal; deleted = removed. Only completed + scheduled contribute to ATL/CTL when load_attribution_v1.atl_ctl_includes_scheduled is true; only completed when false.';

COMMENT ON COLUMN public.calendar_events.completed_at IS
  'Timestamp when status flipped to completed. NULL when status != completed.';

COMMENT ON COLUMN public.calendar_events.completion_source IS
  'Which trigger flipped the event to completed. Audit signal for ops and for the confidence_score calculation.';

COMMENT ON COLUMN public.calendar_events.reported_rpe IS
  'Athlete post-session RPE on the 1–10 scale. Feeds intensity re-resolve when present (rpe → bucket via intensity_catalog_v1.rpe_to_intensity).';

COMMENT ON COLUMN public.calendar_events.reported_duration IS
  'Athlete-reported actual minutes. When different from (end_at - start_at), wins for AU computation.';

COMMENT ON COLUMN public.calendar_events.effective_intensity IS
  'The intensity bucket that drove the SESSION_LOG AU. Set by the completion pipeline; may differ from the scheduled `intensity` when wearable/RPE re-resolve the session.';

COMMENT ON COLUMN public.calendar_events.confidence_score IS
  'Blended confidence across the completion triggers that fired (0.0–1.0). Feeds the CCRS freshness/confidence machinery so low-signal completions don''t over-weight.';


-- ─── Indexes for the hot bridge filter ────────────────────────────────────
-- The daily bridge will soon filter WHERE status='completed' + user_id + date window.
-- Index supports that query pattern once load_attribution_v1.atl_ctl_includes_scheduled
-- flips to false (PR 6+).

CREATE INDEX IF NOT EXISTS idx_calendar_events_user_status_start
  ON public.calendar_events (user_id, status, start_at);


-- ─── Backfill historical rows ─────────────────────────────────────────────
-- Running UPDATE WHERE status IS NULL keeps the migration idempotent (re-runs
-- only touch rows that still haven't been labeled).

-- 1. Anything already flagged completed=true → status=completed, high confidence.
UPDATE public.calendar_events
SET
  status            = 'completed',
  completion_source = 'manual',
  confidence_score  = COALESCE(confidence_score, 1.00)
WHERE status IS NULL
  AND completed = TRUE;

-- 2. Past events not flagged completed → assume they happened (so current
--    ATL/CTL bytes are preserved) but mark with backfill source + mid confidence.
UPDATE public.calendar_events
SET
  status            = 'completed',
  completed_at      = COALESCE(completed_at, end_at, start_at),
  completion_source = 'backfill',
  confidence_score  = COALESCE(confidence_score, 0.50),
  completed         = TRUE
WHERE status IS NULL
  AND end_at IS NOT NULL
  AND end_at < NOW();

-- 3. Everything else (future events, no-end-time events) → scheduled.
UPDATE public.calendar_events
SET status = 'scheduled'
WHERE status IS NULL;
