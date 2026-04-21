-- ═══════════════════════════════════════════════════════════════════
--  Notification Wiring — Subtle defaults + cron observability
--
--  1. Tighten athlete_notification_preferences defaults for subtlety
--     (target audience is 13–17 year olds — pushiness erodes trust):
--       - quiet_hours_start  23:00 → 21:00   (earlier cut-off)
--       - quiet_hours_end    07:00 → 08:00   (later resume)
--       - max_push_per_day   5     → 3       (lower cap)
--  2. Add min_push_interval_minutes column (default 120 = 2h between
--     non-critical pushes). Critical bypasses this.
--  3. Create cron_run_log table for scheduled-trigger observability.
--
--  Only the DEFAULT is changed on existing columns — existing user rows
--  are NOT mutated (respects any preferences they already set).
--
--  Idempotent. Safe to re-apply.
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────
--  1. Subtle default changes for NEW users
-- ───────────────────────────────────────────────────────────────────

ALTER TABLE public.athlete_notification_preferences
  ALTER COLUMN quiet_hours_start SET DEFAULT '21:00';

ALTER TABLE public.athlete_notification_preferences
  ALTER COLUMN quiet_hours_end SET DEFAULT '08:00';

ALTER TABLE public.athlete_notification_preferences
  ALTER COLUMN max_push_per_day SET DEFAULT 3;

-- ───────────────────────────────────────────────────────────────────
--  2. Minimum inter-push interval (non-critical throttle)
-- ───────────────────────────────────────────────────────────────────

ALTER TABLE public.athlete_notification_preferences
  ADD COLUMN IF NOT EXISTS min_push_interval_minutes smallint
    DEFAULT 120
    CHECK (min_push_interval_minutes BETWEEN 0 AND 720);

COMMENT ON COLUMN public.athlete_notification_preferences.min_push_interval_minutes IS
  'Minimum minutes between non-critical pushes. Critical category bypasses. Default 120 (2h).';

-- ───────────────────────────────────────────────────────────────────
--  3. Optional school-hours quiet (referenced by pushDelivery.ts)
--     Ensure the column exists — opt-in, default off.
-- ───────────────────────────────────────────────────────────────────

ALTER TABLE public.athlete_notification_preferences
  ADD COLUMN IF NOT EXISTS school_hours_quiet boolean DEFAULT false;

-- ───────────────────────────────────────────────────────────────────
--  4. cron_run_log — observability for every scheduled trigger
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cron_run_log (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  job_name          text NOT NULL,
  started_at        timestamptz NOT NULL DEFAULT now(),
  finished_at       timestamptz,
  duration_ms       integer,
  status            text NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running', 'success', 'partial', 'failed')),
  processed_count   integer DEFAULT 0,
  sent_count        integer DEFAULT 0,
  queued_count      integer DEFAULT 0,
  failed_count      integer DEFAULT 0,
  error_message     text,
  details           jsonb DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_cron_run_log_job_started
  ON public.cron_run_log (job_name, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_cron_run_log_failed
  ON public.cron_run_log (status, started_at DESC)
  WHERE status IN ('failed', 'partial');

ALTER TABLE public.cron_run_log ENABLE ROW LEVEL SECURITY;

-- Only service role reads/writes — no athlete policies needed.
-- Admins can query via admin tooling (separate path).
DROP POLICY IF EXISTS "cron_run_log service only" ON public.cron_run_log;
CREATE POLICY "cron_run_log service only"
  ON public.cron_run_log FOR ALL
  USING (false)
  WITH CHECK (false);

-- Auto-purge rows older than 30 days (can be dropped/rescheduled in future)
-- Kept as a comment — pg_cron or a daily trigger endpoint can enforce.
-- DELETE FROM public.cron_run_log WHERE started_at < now() - interval '30 days';
