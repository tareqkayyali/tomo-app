-- ─────────────────────────────────────────────────────────────────────────
-- Progress Metrics — CMS-driven config for the Signal > Progress tab
-- ─────────────────────────────────────────────────────────────────────────
--
-- Each row defines a metric that can surface as a ring card on the athlete's
-- Progress tab. The `source_kind` + `source_field` pair tells the backend
-- resolver where to read the value from; `direction` determines whether a
-- positive delta is good or bad; `notification_triggers` holds the
-- (optional, Phase 4) threshold rules that feed the notification engine.
--
-- Admin CRUD lives at /admin/progress-metrics. Athlete-facing resolution
-- lives behind GET /api/v1/progress/metrics.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS progress_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  metric_key TEXT UNIQUE NOT NULL,           -- e.g. 'recovery', 'hrv', 'study_hours'
  display_name TEXT NOT NULL,                -- e.g. 'Recovery'
  display_unit TEXT NOT NULL,                -- e.g. '%', 'h', 'ms', '/10'
  category TEXT NOT NULL CHECK (category IN (
    'readiness', 'wellness', 'academic', 'performance', 'engagement'
  )),

  -- Data source — tells the resolver where to read this metric from.
  --   snapshot_field       → athlete_snapshots.{source_field} (point-in-time)
  --   daily_vitals_avg     → avg of athlete_daily_vitals.{source_field} over window
  --   daily_vitals_latest  → most recent athlete_daily_vitals.{source_field}
  --   checkin_avg          → avg of checkins.{source_field} over window
  --   checkin_latest       → most recent checkins.{source_field}
  --   daily_load_sum       → sum of athlete_daily_load.{source_field} over window
  --   event_aggregate      → custom event aggregations (study_hours, journal rate, etc.)
  --   benchmark            → latest test_log.{source_field} (athlete-measured)
  source_kind TEXT NOT NULL CHECK (source_kind IN (
    'snapshot_field',
    'daily_vitals_avg', 'daily_vitals_latest',
    'checkin_avg', 'checkin_latest',
    'daily_load_sum',
    'event_aggregate',
    'benchmark'
  )),
  source_field TEXT NOT NULL,

  -- Delta semantics
  direction TEXT NOT NULL CHECK (direction IN (
    'higher_better', 'lower_better', 'neutral'
  )),

  -- Ring normalisation range (nullable — mobile falls back to auto-range)
  value_min NUMERIC,
  value_max NUMERIC,

  -- Display + filtering
  sort_order INT NOT NULL DEFAULT 100,
  sport_filter TEXT[],                       -- NULL = all sports
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,

  -- Notification triggers (Phase 4). JSONB shape:
  --   { triggers: [{
  --       kind: 'threshold' | 'trend',
  --       operator: 'lt'|'lte'|'gt'|'gte'|'delta_lt_pct'|'delta_gt_pct',
  --       value: number,
  --       window_days: number (for trend),
  --       priority: 'P1'|'P2'|'P3',
  --       category: string,
  --       title_template: string,
  --       body_template: string,
  --       cooldown_hours: number
  --     }, ...] }
  notification_triggers JSONB,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

CREATE INDEX IF NOT EXISTS idx_progress_metrics_enabled_order
  ON progress_metrics (is_enabled, sort_order) WHERE is_enabled;
CREATE INDEX IF NOT EXISTS idx_progress_metrics_key
  ON progress_metrics (metric_key);

-- RLS: service role only (admin/backend reads via supabaseAdmin; no direct
-- athlete access — they go through /api/v1/progress/metrics).
ALTER TABLE progress_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "progress_metrics service role full access" ON progress_metrics;
CREATE POLICY "progress_metrics service role full access"
  ON progress_metrics FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- updated_at auto-maintenance
CREATE OR REPLACE FUNCTION touch_progress_metrics_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_progress_metrics_updated_at ON progress_metrics;
CREATE TRIGGER trg_touch_progress_metrics_updated_at
  BEFORE UPDATE ON progress_metrics
  FOR EACH ROW EXECUTE FUNCTION touch_progress_metrics_updated_at();


-- ─────────────────────────────────────────────────────────────────────────
-- Audit table for notification trigger firings (Phase 4) — declared here so
-- the cron + cooldown logic has a home to write to when it lands.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS progress_metric_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL,
  metric_key TEXT NOT NULL,
  trigger_hash TEXT NOT NULL,                -- sha1 of the trigger config, for cooldown scoping
  fired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metric_value NUMERIC,
  delta_pct NUMERIC,
  notification_id UUID,                      -- references notifications(id) when dispatched
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_progress_metric_alerts_athlete_metric_fired
  ON progress_metric_alerts (athlete_id, metric_key, fired_at DESC);

ALTER TABLE progress_metric_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "progress_metric_alerts service role full access" ON progress_metric_alerts;
CREATE POLICY "progress_metric_alerts service role full access"
  ON progress_metric_alerts FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');


-- ─────────────────────────────────────────────────────────────────────────
-- Seed — 8 default metrics (Phase 1 cohort).
-- Idempotent: ON CONFLICT DO NOTHING on metric_key.
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO progress_metrics (
  metric_key, display_name, display_unit, category,
  source_kind, source_field, direction,
  value_min, value_max, sort_order, sport_filter, is_enabled
) VALUES
  ('recovery',         'Recovery',         '%',    'readiness',
   'snapshot_field',     'readiness_score',      'higher_better',
   0, 100, 100, NULL, TRUE),

  ('sleep',            'Sleep',            'h',    'readiness',
   'daily_vitals_latest','sleep_hours',          'higher_better',
   0, 12, 200, NULL, TRUE),

  ('hrv',              'HRV',              'ms',   'readiness',
   'daily_vitals_latest','hrv_morning_ms',       'higher_better',
   20, 150, 300, NULL, TRUE),

  ('mood',             'Mood',             '/10',  'wellness',
   'checkin_avg',        'mood',                 'higher_better',
   1, 10, 400, NULL, TRUE),

  ('energy',           'Energy',           '/10',  'wellness',
   'checkin_avg',        'energy',               'higher_better',
   1, 10, 500, NULL, TRUE),

  ('soreness',         'Soreness',         '/10',  'wellness',
   'checkin_avg',        'soreness',             'lower_better',
   1, 10, 600, NULL, TRUE),

  ('study_hours',      'Study Hours',      'h',    'academic',
   'event_aggregate',    'study_hours_7d',       'neutral',
   0, 40, 700, NULL, TRUE),

  ('journal_completion','Journal Completion','%',  'engagement',
   'snapshot_field',     'journal_completeness_7d','higher_better',
   0, 100, 800, NULL, TRUE)

ON CONFLICT (metric_key) DO NOTHING;
