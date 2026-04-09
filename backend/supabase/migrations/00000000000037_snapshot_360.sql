-- ============================================================================
-- Migration 037: Athlete Snapshot 360 Enhancement
-- ============================================================================
--
-- Expands athlete_snapshots from ~44 fields to ~107 fields for a true 360-degree
-- athlete view. All new columns are NULLABLE with NO DEFAULTS.
--
-- Null discipline:
--   NULL = data not available or not yet collected
--   0    = confirmed zero value (zero load, zero sessions, zero debt)
--   Sentinel values (like -1) are FORBIDDEN
--
-- References:
--   - athlete_snapshots created in migration 012
--   - Planning IP fields added in migration 036
--   - athlete_daily_vitals (migration 032) provides resolved vital data
--   - athlete_daily_load (migration 032) provides load data
--   - training_journals (migration 023) provides journal data
-- ============================================================================


-- ── Block 1: Performance Science ────────────────────────────────────────────
-- Novel Tomo IP: Banister training science model + data confidence scoring

ALTER TABLE public.athlete_snapshots
  ADD COLUMN IF NOT EXISTS training_monotony         NUMERIC,
  -- weekly_load_mean / weekly_load_sd (Banister 1991)
  -- > 2.0 = injury predictor independent of ACWR
  -- NULL if fewer than 4 daily load data points

  ADD COLUMN IF NOT EXISTS training_strain           NUMERIC,
  -- weekly_total_load × training_monotony
  -- NULL if monotony is null

  ADD COLUMN IF NOT EXISTS data_confidence_score     NUMERIC,
  -- 0–100 weighted composite of data freshness
  -- Weights: wearable=0.30, checkin=0.25, session=0.25, subjects=0.20

  ADD COLUMN IF NOT EXISTS data_confidence_breakdown JSONB,
  -- { "wearable": 0.0–1.0, "checkin": 0.0–1.0, "session": 0.0–1.0, "subjects": 0.0–1.0 }

  ADD COLUMN IF NOT EXISTS season_phase              TEXT,
  -- 'pre_season' | 'in_season' | 'post_season' | 'off_season'

  ADD COLUMN IF NOT EXISTS season_phase_week         INT,
  -- Week number within current phase (1-based)

  ADD COLUMN IF NOT EXISTS readiness_delta           NUMERIC,
  -- subjective_readiness (checkin) - objective_readiness (HRV)
  -- Positive = athlete feels better than data suggests (overreaching risk)
  -- Negative = athlete feels worse than data suggests (motivation/mood flag)

  ADD COLUMN IF NOT EXISTS resting_hr_trend_7d       TEXT;
  -- 'IMPROVING' | 'STABLE' | 'DECLINING'


-- ── Block 2: Vitals Enrichment ──────────────────────────────────────────────
-- Source: athlete_daily_vitals (resolved from health_data metric_type rows)

ALTER TABLE public.athlete_snapshots
  ADD COLUMN IF NOT EXISTS spo2_pct                  NUMERIC,
  -- Blood oxygen %. Source: athlete_daily_vitals.spo2_percent

  ADD COLUMN IF NOT EXISTS skin_temp_c               NUMERIC,
  -- Skin temperature Celsius. Source: health_data WHERE metric_type='body_temp'

  ADD COLUMN IF NOT EXISTS recovery_score            NUMERIC,
  -- Wearable recovery score (WHOOP/Garmin native). Source: athlete_daily_vitals.recovery_score

  ADD COLUMN IF NOT EXISTS sleep_hours               NUMERIC,
  -- Raw sleep duration hours. Source: athlete_daily_vitals.sleep_hours

  ADD COLUMN IF NOT EXISTS sleep_consistency_score   NUMERIC,
  -- Computed: 100 - (stddev(sleep_hours, 7d) × 20), clamped 0–100
  -- NULL if fewer than 4 data points

  ADD COLUMN IF NOT EXISTS sleep_debt_3d             NUMERIC;
  -- Computed: sum(max(0, 8 - actual_sleep_hours)) over last 3 nights
  -- NULL if any of the 3 nights has no data


-- ── Block 3: Trend Fields ───────────────────────────────────────────────────
-- Direction indicators for key metrics. All follow computeTrend() pattern:
-- Compare avg of last 3 values vs avg of prior values. >3% change = direction.

ALTER TABLE public.athlete_snapshots
  ADD COLUMN IF NOT EXISTS hrv_trend_7d_pct          NUMERIC,
  -- (avg_last_3d / avg_prev_4d - 1) × 100. Positive = improving

  ADD COLUMN IF NOT EXISTS load_trend_7d_pct         NUMERIC,
  -- Load trajectory percentage change

  ADD COLUMN IF NOT EXISTS readiness_distribution_7d JSONB,
  -- { "green": N, "amber": N, "red": N } — week quality at a glance

  ADD COLUMN IF NOT EXISTS acwr_trend                TEXT,
  -- 'IMPROVING' | 'STABLE' | 'DECLINING'

  ADD COLUMN IF NOT EXISTS sleep_trend_7d            TEXT,
  -- 'IMPROVING' | 'STABLE' | 'DECLINING'

  ADD COLUMN IF NOT EXISTS body_feel_trend_7d        NUMERIC;
  -- Avg of training_journals.post_body_feel over 7d (1–10)
  -- Declining = overtraining signal


-- ── Block 4: Schedule & Context ─────────────────────────────────────────────
-- Forward-looking context from calendar_events

ALTER TABLE public.athlete_snapshots
  ADD COLUMN IF NOT EXISTS matches_next_7d           INT,
  ADD COLUMN IF NOT EXISTS exams_next_14d            INT,
  ADD COLUMN IF NOT EXISTS in_exam_period            BOOLEAN,
  ADD COLUMN IF NOT EXISTS sessions_scheduled_next_7d INT,
  ADD COLUMN IF NOT EXISTS days_since_last_session   INT;


-- ── Block 5: Injury Detail ─────────────────────────────────────────────────
-- Enriched injury context beyond the existing injury_risk_flag

ALTER TABLE public.athlete_snapshots
  ADD COLUMN IF NOT EXISTS active_injury_count       INT,
  ADD COLUMN IF NOT EXISTS injury_locations          JSONB,
  -- ["left_hamstring", "right_ankle"] — array of active injury sites
  -- Empty array [] = confirmed no active injuries
  -- NULL = not yet computed

  ADD COLUMN IF NOT EXISTS days_since_injury         INT;
  -- Days since most recent INJURY_FLAG event. NULL if no injury history.


-- ── Block 6: Engagement & Behavioral ────────────────────────────────────────
-- How the athlete engages with Tomo — critical for coachability scoring,
-- AI tone calibration, and retention metrics

ALTER TABLE public.athlete_snapshots
  -- Chat engagement
  ADD COLUMN IF NOT EXISTS chat_sessions_7d          INT,
  -- COUNT(DISTINCT session_id) from chat_messages last 7d
  ADD COLUMN IF NOT EXISTS chat_messages_7d          INT,
  ADD COLUMN IF NOT EXISTS last_chat_at              TIMESTAMPTZ,

  -- Recommendation follow-through
  ADD COLUMN IF NOT EXISTS rec_action_rate_30d       NUMERIC,
  -- 0.0–1.0 ratio of acted / delivered recommendations
  ADD COLUMN IF NOT EXISTS notification_action_rate_7d NUMERIC,

  -- Drill & program engagement
  ADD COLUMN IF NOT EXISTS drills_completed_7d       INT,
  -- Source: blazepod_sessions (interim until user_drill_history exists)
  ADD COLUMN IF NOT EXISTS avg_drill_rating_30d      NUMERIC,
  ADD COLUMN IF NOT EXISTS active_program_count      INT,
  -- From calendar_events with program links
  ADD COLUMN IF NOT EXISTS program_compliance_rate   NUMERIC,

  -- Compliance & consistency
  ADD COLUMN IF NOT EXISTS plan_compliance_7d        NUMERIC,
  ADD COLUMN IF NOT EXISTS checkin_consistency_7d    NUMERIC,
  -- 0.0–1.0 (days with checkin / 7)
  ADD COLUMN IF NOT EXISTS total_points_7d           INT,
  -- SUM from points_ledger last 7d
  ADD COLUMN IF NOT EXISTS longest_streak            INT;
  -- From users.longest_streak


-- ── Block 7: Triangle Engagement ────────────────────────────────────────────
-- B2B metrics for coach retention dashboards. Hidden from athlete visibility.

ALTER TABLE public.athlete_snapshots
  ADD COLUMN IF NOT EXISTS days_since_coach_interaction  INT,
  -- Days since coach-role user last engaged with this athlete's data
  -- NULL if no coach linked

  ADD COLUMN IF NOT EXISTS days_since_parent_interaction INT,
  -- NULL if no parent linked

  ADD COLUMN IF NOT EXISTS triangle_engagement_score     NUMERIC;
  -- 0–100 composite: (athlete × 0.40) + (coach × 0.35) + (parent × 0.25)
  -- NULL if solo athlete (no coach/parent linked)


-- ── Block 8: Academic Detail ────────────────────────────────────────────────

ALTER TABLE public.athlete_snapshots
  ADD COLUMN IF NOT EXISTS study_hours_7d            NUMERIC,
  -- From calendar_events WHERE event_type='study' duration sum
  ADD COLUMN IF NOT EXISTS academic_stress_latest    INT,
  -- 1–10 from most recent checkin
  ADD COLUMN IF NOT EXISTS exam_count_active         INT;
  -- From athlete_subjects WHERE is_active = true AND exam_date >= now()


-- ── Block 9: CV & Recruiting ────────────────────────────────────────────────

ALTER TABLE public.athlete_snapshots
  ADD COLUMN IF NOT EXISTS cv_views_total            INT,
  -- From cv_share_views COUNT
  ADD COLUMN IF NOT EXISTS cv_views_7d               INT,
  ADD COLUMN IF NOT EXISTS cv_statement_status       TEXT,
  -- 'draft' | 'approved' | 'needs_update' — from cv_profiles
  ADD COLUMN IF NOT EXISTS cv_sections_complete      JSONB;
  -- { "career": N, "academic": N, "media": N, "references": N, "traits": N }


-- ── Block 10: Benchmark & Performance ───────────────────────────────────────

ALTER TABLE public.athlete_snapshots
  ADD COLUMN IF NOT EXISTS overall_percentile        NUMERIC,
  -- From athlete_benchmark_cache.overall_percentile
  ADD COLUMN IF NOT EXISTS top_strengths             JSONB,
  -- [{ "category": "acceleration", "percentile": 85 }, ...]
  ADD COLUMN IF NOT EXISTS key_gaps                  JSONB;
  -- [{ "category": "upper_strength", "percentile": 22 }, ...]


-- ── Block 11: Longitudinal AI Context ───────────────────────────────────────

ALTER TABLE public.athlete_snapshots
  ADD COLUMN IF NOT EXISTS active_goals_count        INT,
  -- From athlete_longitudinal_memory.memory_json.currentGoals length
  ADD COLUMN IF NOT EXISTS unresolved_concerns_count INT,
  ADD COLUMN IF NOT EXISTS coaching_preference       TEXT;
  -- 'direct' | 'encouraging' | 'data_focused' | etc.


-- ── Block 12: Wearable Status ───────────────────────────────────────────────

ALTER TABLE public.athlete_snapshots
  ADD COLUMN IF NOT EXISTS wearable_connected        BOOLEAN,
  -- Derived from athlete_daily_vitals freshness (last 24h has data)
  ADD COLUMN IF NOT EXISTS wearable_last_sync_at     TIMESTAMPTZ;
  -- Last WEARABLE-sourced event timestamp from athlete_events


-- ── Block 13: Journal Quality ───────────────────────────────────────────────

ALTER TABLE public.athlete_snapshots
  ADD COLUMN IF NOT EXISTS pre_journal_completion_rate   NUMERIC,
  -- Pre-journals completed / scheduled sessions, last 7d (0.0–1.0)
  ADD COLUMN IF NOT EXISTS post_journal_completion_rate  NUMERIC,
  -- Post-journals completed / sessions done, last 7d (0.0–1.0)
  ADD COLUMN IF NOT EXISTS avg_post_body_feel_7d         NUMERIC;
  -- training_journals.post_body_feel AVG last 7d (1–10)


-- ══════════════════════════════════════════════════════════════════════════════
-- INDEXES
-- ══════════════════════════════════════════════════════════════════════════════
-- Only index fields used in WHERE clauses by protocol engine, recommendation
-- computers, or periodic enrichment queries.

CREATE INDEX IF NOT EXISTS idx_snapshots_training_monotony
  ON public.athlete_snapshots(training_monotony)
  WHERE training_monotony IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_snapshots_sleep_hours
  ON public.athlete_snapshots(sleep_hours)
  WHERE sleep_hours IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_snapshots_data_confidence
  ON public.athlete_snapshots(data_confidence_score)
  WHERE data_confidence_score IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_snapshots_season_phase
  ON public.athlete_snapshots(season_phase)
  WHERE season_phase IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_snapshots_readiness_dist
  ON public.athlete_snapshots USING gin(readiness_distribution_7d)
  WHERE readiness_distribution_7d IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_snapshots_injury_locations
  ON public.athlete_snapshots USING gin(injury_locations)
  WHERE injury_locations IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_snapshots_dli
  ON public.athlete_snapshots(dual_load_index)
  WHERE dual_load_index IS NOT NULL;
