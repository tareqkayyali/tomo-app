-- ============================================================================
-- Migration 032: Unified Data Layer Tables
-- ============================================================================
--
-- Part of the Unified Architecture — consolidates fragmented data sources
-- into pre-aggregated tables that getAthleteState() reads from.
--
-- These tables solve the root cause of contradicting advice across screens:
-- instead of 5 screens each querying different raw tables and computing
-- different values, every consumer reads from ONE set of pre-aggregated
-- tables via getAthleteState().
--
-- Tables created:
--   1. athlete_daily_vitals    — One row/athlete/day (resolved sleep, HRV, wellness)
--   2. athlete_benchmark_cache — Cached benchmark profile (invalidated on new test)
--   3. athlete_weekly_digest   — 7-day aggregates for trend analysis
--   4. athlete_monthly_summary — Monthly aggregates for CV and progress arc
-- ============================================================================

-- ── 1. athlete_daily_vitals ──────────────────────────────────────────────────
-- One row per athlete per day. Resolves "sleep in 3 tables" and "HRV in 2 tables"
-- permanently. Source priority: WEARABLE > SLEEP_LOG > CHECKIN per field.
--
-- This table is the SINGLE source of truth for "what happened today" — no consumer
-- should ever read raw checkins, health_data, or sleep_logs directly.

CREATE TABLE IF NOT EXISTS athlete_daily_vitals (
  athlete_id        UUID NOT NULL,
  vitals_date       DATE NOT NULL,

  -- HRV (resolved from health_data > phone_test)
  hrv_morning_ms    DECIMAL(6,1),
  hrv_avg_ms        DECIMAL(6,1),

  -- Heart rate
  resting_hr_bpm    INT,

  -- Sleep (single resolved value — source tracked)
  sleep_hours       DECIMAL(4,1),
  sleep_quality     DECIMAL(3,1),
  deep_sleep_min    INT,
  rem_sleep_min     INT,

  -- Wellness (from check-in)
  energy            INT,              -- 1–5
  soreness          INT,              -- 1–10
  mood              INT,              -- 1–5
  academic_stress   INT,              -- 1–5
  pain_flag         BOOLEAN DEFAULT FALSE,

  -- Wearable extras
  spo2_percent      DECIMAL(4,1),
  recovery_score    INT,
  steps             INT,
  active_calories   INT,

  -- Computed readiness (single formula, one place)
  readiness_score   INT,              -- 0–100
  readiness_rag     TEXT,             -- 'GREEN' | 'AMBER' | 'RED'

  -- Pre-computed directive text and intensity cap from PDIL
  -- Prevents recomputation on every render and ensures consistency
  intensity_cap     TEXT,             -- 'full' | 'moderate' | 'light' | 'rest'
  directive_text    TEXT,             -- "Your body is recovered. Push intensity today."

  -- Full source audit trail per field
  -- e.g. {"hrv": "whoop", "sleep": "checkin", "readiness": "computed"}
  sources_resolved  JSONB DEFAULT '{}',

  updated_at        TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (athlete_id, vitals_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_vitals_athlete_date
  ON athlete_daily_vitals(athlete_id, vitals_date DESC);

-- ── 2. athlete_benchmark_cache ───────────────────────────────────────────────
-- Cached benchmark profile — avoids recomputing normative lookups on every screen load.
-- Invalidated explicitly on: ASSESSMENT_RESULT event, position change, age_band change.

CREATE TABLE IF NOT EXISTS athlete_benchmark_cache (
  athlete_id          UUID PRIMARY KEY,
  overall_percentile  INT,
  strengths           TEXT[],           -- Top 3 attribute names
  gaps                TEXT[],           -- Bottom 3 attribute names
  strength_attributes TEXT[],           -- Detailed strength list
  gap_attributes      TEXT[],           -- Detailed gap list
  results_json        JSONB,            -- Full BenchmarkProfile object
  age_band            TEXT,
  position            TEXT,
  sport               TEXT,
  computed_at         TIMESTAMPTZ DEFAULT now(),
  expires_at          TIMESTAMPTZ,      -- Explicit expiry (backup to event-based invalidation)
  trigger_event_id    UUID              -- Event that caused last recompute
);

-- ── 3. athlete_weekly_digest ─────────────────────────────────────────────────
-- One row per athlete per ISO week. Pre-computed 7-day aggregates.
-- Written by: lazy recompute in getAthleteState (if stale >6h) + Sunday night cron.

CREATE TABLE IF NOT EXISTS athlete_weekly_digest (
  athlete_id              UUID NOT NULL,
  iso_year                INT NOT NULL,
  iso_week                INT NOT NULL,

  -- Load
  total_training_load_au  DECIMAL(10,1),
  total_academic_load_au  DECIMAL(10,1),
  session_count           INT,

  -- Biometrics
  avg_hrv_ms              DECIMAL(6,1),
  avg_resting_hr          DECIMAL(5,1),
  avg_sleep_hours         DECIMAL(4,1),

  -- Wellness
  avg_energy              DECIMAL(3,1),
  avg_soreness            DECIMAL(3,1),
  avg_mood                DECIMAL(3,1),
  hrv_trend_pct           DECIMAL(5,1),  -- % change vs previous week
  load_trend_pct          DECIMAL(5,1),  -- % change vs previous week
  wellness_trend          TEXT,           -- 'IMPROVING' | 'STABLE' | 'DECLINING'

  -- Readiness distribution
  green_days              INT DEFAULT 0,
  amber_days              INT DEFAULT 0,
  red_days                INT DEFAULT 0,

  -- Journal
  journal_completion_rate DECIMAL(3,2),   -- 0.00–1.00

  computed_at             TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (athlete_id, iso_year, iso_week)
);

-- ── 4. athlete_monthly_summary ───────────────────────────────────────────────
-- One row per athlete per month. Required for Progress Arc and Athletic CV.
-- Written by: pg_cron on 1st of each month + on-demand for current month.

CREATE TABLE IF NOT EXISTS athlete_monthly_summary (
  athlete_id              UUID NOT NULL,
  summary_month           DATE NOT NULL,    -- First day of month (e.g. 2026-03-01)

  -- Load
  total_sessions          INT,
  avg_acwr                DECIMAL(4,2),
  peak_training_load_au   DECIMAL(10,1),
  total_training_load_au  DECIMAL(10,1),

  -- Biometrics
  peak_hrv_ms             DECIMAL(6,1),
  avg_hrv_ms              DECIMAL(6,1),
  avg_sleep_hours         DECIMAL(4,1),

  -- Readiness
  green_days              INT DEFAULT 0,
  amber_days              INT DEFAULT 0,
  red_days                INT DEFAULT 0,
  avg_readiness_score     INT,

  -- Development snapshot (state at month end)
  benchmark_snapshot      JSONB,            -- Percentile scores at end of month
  cv_completeness         INT,
  coachability_index      DECIMAL(4,2),

  -- Identity markers (captured for CV timeline)
  phv_stage               TEXT,
  position                TEXT,
  age_band                TEXT,

  -- Achievements
  achievements            JSONB,            -- [{ type, title, value, date }]

  computed_at             TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (athlete_id, summary_month)
);

CREATE INDEX IF NOT EXISTS idx_monthly_summary_athlete
  ON athlete_monthly_summary(athlete_id, summary_month DESC);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE athlete_daily_vitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE athlete_benchmark_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE athlete_weekly_digest ENABLE ROW LEVEL SECURITY;
ALTER TABLE athlete_monthly_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on athlete_daily_vitals"
  ON athlete_daily_vitals FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on athlete_benchmark_cache"
  ON athlete_benchmark_cache FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on athlete_weekly_digest"
  ON athlete_weekly_digest FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on athlete_monthly_summary"
  ON athlete_monthly_summary FOR ALL USING (true) WITH CHECK (true);
