-- ============================================================================
-- Migration 036: Planning Intelligence (Planning IP)
-- ============================================================================
--
-- Adds CMS-managed tables for the Planning Intelligence layer:
--   1. athlete_modes              — Mode definitions (Study/League/Balanced/Rest)
--   2. training_category_templates — CMS-managed training categories
--   3. planning_protocols         — Schedule/plan generation rules
--   4. cognitive_windows          — Session type → cognitive state mapping
--   5. dual_load_thresholds       — DLI zone definitions
--   6. athlete_subjects           — Player's academic subjects
--   7. planning_sessions          — Plan generation history
--   8. athlete_mode_history       — Mode change audit trail
--
-- Also alters:
--   - player_schedule_preferences — adds mode columns
--   - athlete_snapshots           — adds planning IP fields
--
-- References:
--   - athlete_snapshots created in migration 012
--   - player_schedule_preferences created in migration 010
--   - pd_protocols (PDIL) created in migration 030
-- ============================================================================


-- ── 1. athlete_modes ────────────────────────────────────────────────────────
-- CMS-managed mode definitions. No RLS — public read, admin middleware guards writes.
-- Follows same pattern as sports, sport_attributes (no RLS on CMS content tables).

CREATE TABLE IF NOT EXISTS public.athlete_modes (
  id              TEXT PRIMARY KEY,  -- 'study', 'league', 'balanced', 'rest'
  label           TEXT NOT NULL,
  description     TEXT,
  icon            TEXT,              -- Ionicons name
  color           TEXT,              -- Hex color
  sort_order      INT DEFAULT 0,
  params          JSONB NOT NULL DEFAULT '{}',
  -- params shape:
  --   maxHardPerWeek: number
  --   maxSessionsPerDay: number
  --   studyDurationMultiplier: number
  --   reduceGymDaysTo: number | null
  --   dropPersonalDev: boolean
  --   intensityCapOnExamDays: 'REST' | 'LIGHT' | 'MODERATE' | null
  --   addRecoveryAfterMatch: boolean
  --   studyTrainingBalanceRatio: number (0.0–1.0)
  --   loadCapMultiplier: number (0.0–1.0)
  --   aiCoachingTone: 'supportive' | 'performance' | 'balanced' | 'academic'
  --   priorityBoosts: [{ category, delta }]
  --   referenceTemplates: Record<string, TemplateEvent[]>
  sport_filter    TEXT[] DEFAULT NULL,  -- null = all sports
  is_enabled      BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT ON public.athlete_modes TO anon, authenticated;
GRANT ALL ON public.athlete_modes TO service_role;

-- Seed 4 built-in modes (mapped from existing SCENARIO_MODIFIERS)
INSERT INTO public.athlete_modes (id, label, description, icon, color, sort_order, params) VALUES
  ('balanced', 'Balanced', 'Equal focus on training and academics', 'scale-outline', '#30D158', 1,
   '{"maxHardPerWeek": 3, "maxSessionsPerDay": 2, "studyDurationMultiplier": 1.0, "reduceGymDaysTo": null, "dropPersonalDev": false, "intensityCapOnExamDays": null, "addRecoveryAfterMatch": true, "studyTrainingBalanceRatio": 0.5, "loadCapMultiplier": 1.0, "aiCoachingTone": "balanced", "priorityBoosts": [], "referenceTemplates": {}}'),
  ('league', 'League', 'Competition focus — training intensity prioritized', 'trophy-outline', '#FF6B35', 2,
   '{"maxHardPerWeek": 2, "maxSessionsPerDay": 2, "studyDurationMultiplier": 0.8, "reduceGymDaysTo": 1, "dropPersonalDev": true, "intensityCapOnExamDays": null, "addRecoveryAfterMatch": true, "studyTrainingBalanceRatio": 0.2, "loadCapMultiplier": 0.9, "aiCoachingTone": "performance", "priorityBoosts": [{"category": "match_prep", "delta": 2}], "referenceTemplates": {}}'),
  ('study', 'Study', 'Academic priority — reduced training load', 'school-outline', '#00D9FF', 3,
   '{"maxHardPerWeek": 1, "maxSessionsPerDay": 1, "studyDurationMultiplier": 1.5, "reduceGymDaysTo": 1, "dropPersonalDev": true, "intensityCapOnExamDays": "LIGHT", "addRecoveryAfterMatch": false, "studyTrainingBalanceRatio": 0.8, "loadCapMultiplier": 0.6, "aiCoachingTone": "academic", "priorityBoosts": [{"category": "academic", "delta": 3}], "referenceTemplates": {}}'),
  ('rest', 'Rest', 'Recovery focus — minimal training', 'bed-outline', '#AF52DE', 4,
   '{"maxHardPerWeek": 0, "maxSessionsPerDay": 1, "studyDurationMultiplier": 1.0, "reduceGymDaysTo": 0, "dropPersonalDev": true, "intensityCapOnExamDays": "REST", "addRecoveryAfterMatch": false, "studyTrainingBalanceRatio": 0.5, "loadCapMultiplier": 0.3, "aiCoachingTone": "supportive", "priorityBoosts": [{"category": "recovery", "delta": 5}], "referenceTemplates": {}}')
ON CONFLICT (id) DO NOTHING;


-- ── 2. training_category_templates ──────────────────────────────────────────
-- CMS-managed master list of training categories. Athletes' personal config
-- lives in player_schedule_preferences.training_categories (JSONB).
-- No RLS — same pattern as athlete_modes.

CREATE TABLE IF NOT EXISTS public.training_category_templates (
  id                      TEXT PRIMARY KEY,
  label                   TEXT NOT NULL,
  icon                    TEXT NOT NULL,
  color                   TEXT NOT NULL,
  default_mode            TEXT DEFAULT 'fixed_days',
  default_days_per_week   INT DEFAULT 3,
  default_session_duration INT DEFAULT 60,
  default_preferred_time  TEXT DEFAULT 'afternoon',
  sort_order              INT DEFAULT 0,
  sport_filter            TEXT[] DEFAULT NULL,
  is_enabled              BOOLEAN DEFAULT TRUE,
  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT ON public.training_category_templates TO anon, authenticated;
GRANT ALL ON public.training_category_templates TO service_role;

-- Seed from current hardcoded training_categories in player_schedule_preferences
INSERT INTO public.training_category_templates (id, label, icon, color, default_mode, default_days_per_week, default_session_duration, default_preferred_time, sort_order) VALUES
  ('club', 'Club / Academy', 'football-outline', '#FF6B35', 'fixed_days', 3, 90, 'afternoon', 1),
  ('gym', 'Gym', 'barbell-outline', '#00D9FF', 'days_per_week', 2, 60, 'morning', 2),
  ('personal', 'Personal', 'fitness-outline', '#30D158', 'days_per_week', 1, 60, 'evening', 3),
  ('recovery', 'Recovery', 'heart-outline', '#AF52DE', 'days_per_week', 2, 30, 'morning', 4)
ON CONFLICT (id) DO NOTHING;


-- ── 3. planning_protocols ───────────────────────────────────────────────────
-- Schedule/plan generation rules. Separate from PDIL's pd_protocols (which focus
-- on training modifiers and recommendation guardrails). Planning protocols focus
-- on HOW plans are generated — schedule slot selection, session ordering, etc.
--
-- MANDATORY protocols cross-reference PDIL: if a PDIL safety protocol blocks
-- an exercise, planning_protocols must not schedule it.
-- No RLS — CMS content table.

CREATE TABLE IF NOT EXISTS public.planning_protocols (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  description         TEXT,
  severity            TEXT NOT NULL CHECK (severity IN ('MANDATORY', 'ADVISORY', 'INFO')),
  category            TEXT NOT NULL CHECK (category IN (
                        'load_management',
                        'recovery',
                        'cognitive',
                        'academic',
                        'competition'
                      )),
  trigger_conditions  JSONB NOT NULL DEFAULT '{}',
  -- Same DSL as pd_protocols.conditions:
  -- { "match": "all"|"any", "conditions": [{ "field", "operator", "value" }] }
  actions             JSONB NOT NULL DEFAULT '{}',
  -- { "reduce_load_pct": 30, "block_session_types": ["high_intensity"], "suggest": "..." }
  scientific_basis    TEXT,
  sport_filter        TEXT[] DEFAULT NULL,
  is_enabled          BOOLEAN DEFAULT TRUE,
  version             INT DEFAULT 1,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT ON public.planning_protocols TO anon, authenticated;
GRANT ALL ON public.planning_protocols TO service_role;

-- Seed 12 planning protocols
INSERT INTO public.planning_protocols (id, name, description, severity, category, trigger_conditions, actions, scientific_basis) VALUES
  -- MANDATORY protocols (safety — never overrideable)
  ('pp_phv_load_cap', 'PHV Load Cap', 'Limit training load during peak height velocity growth phase', 'MANDATORY', 'load_management',
   '{"match": "all", "conditions": [{"field": "phv_stage", "operator": "eq", "value": "CIRCA"}]}',
   '{"reduce_load_pct": 40, "block_session_types": ["plyometrics", "heavy_resistance"], "suggest": "Focus on technique and mobility work during growth phase"}',
   'Malina et al. (2004) — Growth-related injury risk peaks during CIRCA-PHV. Load reduction 30-50% recommended.'),

  ('pp_red_readiness_block', 'RED Readiness Block', 'Block high-intensity training when readiness is RED', 'MANDATORY', 'recovery',
   '{"match": "all", "conditions": [{"field": "readiness_rag", "operator": "eq", "value": "RED"}]}',
   '{"intensity_cap": "light", "block_session_types": ["high_intensity", "match"], "suggest": "Recovery session or active rest recommended"}',
   'Halson (2014) — Training in RED state increases injury risk 2.7x. Mandatory recovery day.'),

  ('pp_acwr_danger', 'ACWR Danger Zone', 'Reduce load when ACWR exceeds safe threshold', 'MANDATORY', 'load_management',
   '{"match": "all", "conditions": [{"field": "acwr", "operator": "gte", "value": 1.5}]}',
   '{"reduce_load_pct": 50, "block_session_types": ["high_intensity"], "suggest": "Acute-to-chronic ratio critical — reduce training volume immediately"}',
   'Gabbett (2016) — ACWR >1.5 associated with 2-4x injury risk increase in team sports.'),

  ('pp_injury_active', 'Active Injury Protocol', 'Modify training around active injuries', 'MANDATORY', 'recovery',
   '{"match": "all", "conditions": [{"field": "injury_risk_flag", "operator": "eq", "value": "RED"}]}',
   '{"reduce_load_pct": 60, "block_session_types": ["contact", "high_impact"], "suggest": "Consult physiotherapist before training. Focus on unaffected areas."}',
   'Drawer & Fuller (2002) — Return-to-play protocols require graduated load progression.'),

  -- ADVISORY protocols (recommended — athlete can override with reason)
  ('pp_sleep_debt_recovery', 'Sleep Debt Recovery', 'Reduce intensity when cumulative sleep debt detected', 'ADVISORY', 'recovery',
   '{"match": "all", "conditions": [{"field": "sleep_quality", "operator": "lte", "value": 4}]}',
   '{"reduce_load_pct": 20, "suggest": "Poor sleep quality — consider lighter session and earlier bedtime"}',
   'Milewski et al. (2014) — <8h sleep increases injury risk 1.7x in adolescent athletes.'),

  ('pp_exam_proximity', 'Exam Proximity Reduction', 'Reduce training load as exams approach', 'ADVISORY', 'academic',
   '{"match": "all", "conditions": [{"field": "exam_proximity_score", "operator": "gte", "value": 70}]}',
   '{"reduce_load_pct": 30, "block_session_types": ["high_intensity"], "suggest": "Exams approaching — shift to maintenance training, prioritize study time"}',
   'Condello et al. (2019) — Academic stress compounds training stress in student-athletes.'),

  ('pp_cognitive_window', 'Post-Training Cognitive Window', 'Optimise study timing based on training session type', 'ADVISORY', 'cognitive',
   '{"match": "all", "conditions": [{"field": "dual_load_index", "operator": "gte", "value": 60}]}',
   '{"suggest": "Schedule study 2-4h after high-intensity training for optimal cognitive performance. Avoid studying immediately after exhaustive exercise."}',
   'Tomporowski (2003) — Moderate exercise enhances cognition; exhaustive exercise temporarily impairs it.'),

  ('pp_match_day_protocol', 'Match Day Protocol', 'Protect match day from other training', 'ADVISORY', 'competition',
   '{"match": "all", "conditions": [{"field": "readiness_rag", "operator": "neq", "value": "RED"}]}',
   '{"block_session_types": ["gym", "personal_training"], "suggest": "Match day: pre-match activation only, no gym or personal training"}',
   'Reilly & Ekblom (2005) — Pre-competition taper improves match performance 2-3%.'),

  ('pp_deload_week', 'Deload Week', 'Automatic deload after sustained high training load', 'ADVISORY', 'load_management',
   '{"match": "all", "conditions": [{"field": "training_monotony", "operator": "gte", "value": 2.0}]}',
   '{"reduce_load_pct": 40, "suggest": "Training monotony high — scheduled deload recommended to prevent overtraining"}',
   'Foster (1998) — Training monotony >2.0 predicts overtraining syndrome in 78% of cases.'),

  ('pp_dual_load_balance', 'Dual Load Rebalance', 'Suggest rebalancing when academic+training load is imbalanced', 'ADVISORY', 'academic',
   '{"match": "all", "conditions": [{"field": "dual_load_index", "operator": "gte", "value": 80}]}',
   '{"reduce_load_pct": 20, "suggest": "Combined academic and training load is high — consider reducing one or both temporarily"}',
   'Li et al. (2021) — Dual-career athletes show elevated burnout when combined load exceeds 80th percentile.'),

  -- INFO protocols (contextual guidance — no action required)
  ('pp_growth_spurt_info', 'Growth Spurt Awareness', 'Inform about growth considerations during PRE-PHV', 'INFO', 'load_management',
   '{"match": "all", "conditions": [{"field": "phv_stage", "operator": "eq", "value": "PRE"}]}',
   '{"suggest": "Athlete is in pre-growth phase. Focus on movement quality, coordination, and enjoyment over intensity."}',
   'Lloyd & Oliver (2012) — Youth Long-Term Athletic Development model emphasises movement literacy in pre-PHV.'),

  ('pp_season_transition', 'Season Transition', 'Guidance for off-season and pre-season phases', 'INFO', 'competition',
   '{"match": "all", "conditions": [{"field": "season_phase", "operator": "eq", "value": "off_season"}]}',
   '{"suggest": "Off-season phase: prioritise general fitness, address weaknesses, and allow mental recovery."}',
   'Bompa & Buzzichelli (2019) — Periodization theory supports structured training phases with recovery periods.')
ON CONFLICT (id) DO NOTHING;


-- ── 4. cognitive_windows ────────────────────────────────────────────────────
-- Maps session types to cognitive states. Used by the planning engine to
-- optimise study timing relative to training sessions.
-- No RLS — CMS content table.

CREATE TABLE IF NOT EXISTS public.cognitive_windows (
  id                          TEXT PRIMARY KEY,
  session_type                TEXT NOT NULL,
  cognitive_state             TEXT NOT NULL CHECK (cognitive_state IN ('enhanced', 'suppressed', 'neutral')),
  optimal_study_delay_minutes INT NOT NULL DEFAULT 120,
  description                 TEXT,
  created_at                  TIMESTAMPTZ DEFAULT now(),
  updated_at                  TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT ON public.cognitive_windows TO anon, authenticated;
GRANT ALL ON public.cognitive_windows TO service_role;

-- Seed 6 cognitive window definitions
INSERT INTO public.cognitive_windows (id, session_type, cognitive_state, optimal_study_delay_minutes, description) VALUES
  ('cw_moderate_cardio', 'moderate_cardio', 'enhanced', 30,
   'Moderate aerobic exercise (60-75% HR max) enhances cognitive function within 30 minutes. Optimal study window.'),
  ('cw_high_intensity', 'high_intensity', 'suppressed', 180,
   'High-intensity training (>85% HR max) temporarily impairs cognitive function. Study best delayed 2-3 hours.'),
  ('cw_skill_technical', 'skill_technical', 'enhanced', 60,
   'Technical skill sessions maintain cognitive engagement. Study effective after 1 hour rest.'),
  ('cw_strength', 'strength', 'neutral', 120,
   'Resistance training has neutral cognitive impact. Standard 2-hour recovery before study.'),
  ('cw_match', 'match', 'suppressed', 240,
   'Competition creates cognitive and emotional fatigue. Study should wait minimum 4 hours.'),
  ('cw_recovery', 'recovery', 'enhanced', 0,
   'Light recovery sessions (yoga, stretching) can enhance focus immediately.')
ON CONFLICT (id) DO NOTHING;


-- ── 5. dual_load_thresholds ─────────────────────────────────────────────────
-- DLI zone definitions. CMS-tunable thresholds for the Dual Load Index.
-- No RLS — CMS content table.

CREATE TABLE IF NOT EXISTS public.dual_load_thresholds (
  id                  TEXT PRIMARY KEY,
  zone                TEXT NOT NULL CHECK (zone IN ('green', 'amber', 'red', 'critical')),
  dli_min             INT NOT NULL,
  dli_max             INT NOT NULL,
  description         TEXT,
  recommended_actions JSONB DEFAULT '{}',
  sort_order          INT DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT ON public.dual_load_thresholds TO anon, authenticated;
GRANT ALL ON public.dual_load_thresholds TO service_role;

-- Seed 4 DLI zones
INSERT INTO public.dual_load_thresholds (id, zone, dli_min, dli_max, description, recommended_actions, sort_order) VALUES
  ('dlt_green', 'green', 0, 50,
   'Manageable combined load — training and academics in balance',
   '{"suggest": "Continue current plan. No adjustments needed."}', 1),
  ('dlt_amber', 'amber', 51, 70,
   'Elevated combined load — monitor for fatigue signs',
   '{"suggest": "Consider reducing one of training or study volume. Prioritise sleep and recovery.", "reduce_load_pct": 10}', 2),
  ('dlt_red', 'red', 71, 85,
   'High combined load — active intervention recommended',
   '{"suggest": "Reduce training intensity to light/moderate. Shorten study sessions. Add extra recovery.", "reduce_load_pct": 25}', 3),
  ('dlt_critical', 'critical', 86, 100,
   'Critically high combined load — immediate action required',
   '{"suggest": "Switch to rest mode. Cancel non-essential training. Focus on sleep and basic maintenance only.", "reduce_load_pct": 50}', 4)
ON CONFLICT (id) DO NOTHING;


-- ── 6. athlete_subjects ─────────────────────────────────────────────────────
-- Player's academic subjects with exam dates. Used by the planning engine
-- to calculate exam proximity and study scheduling.
-- RLS: athletes manage their own subjects.

CREATE TABLE IF NOT EXISTS public.athlete_subjects (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id          UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  subject_name        TEXT NOT NULL,
  exam_date           DATE,
  difficulty_rating   INT CHECK (difficulty_rating BETWEEN 1 AND 5),
  study_hours_per_week NUMERIC(4,1),
  is_active           BOOLEAN DEFAULT TRUE,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_athlete_subjects_athlete ON public.athlete_subjects(athlete_id);
CREATE INDEX IF NOT EXISTS idx_athlete_subjects_exam ON public.athlete_subjects(exam_date)
  WHERE exam_date IS NOT NULL;

ALTER TABLE public.athlete_subjects ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Athletes manage own subjects"
    ON public.athlete_subjects FOR ALL
    USING (auth.uid() = athlete_id)
    WITH CHECK (auth.uid() = athlete_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

GRANT ALL ON public.athlete_subjects TO service_role;


-- ── 7. planning_sessions ────────────────────────────────────────────────────
-- Plan generation history. Every time the planning engine generates a plan,
-- the full input snapshot and output are logged for auditability.
-- RLS: athletes read their own.

CREATE TABLE IF NOT EXISTS public.planning_sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id          UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  mode_id             TEXT REFERENCES public.athlete_modes(id),
  plan_type           TEXT NOT NULL CHECK (plan_type IN ('training', 'study', 'weekly', 'adjustment')),
  input_snapshot      JSONB,
  output_plan         JSONB,
  protocols_applied   TEXT[],
  status              TEXT DEFAULT 'proposed' CHECK (status IN ('proposed', 'committed', 'rejected', 'expired')),
  created_at          TIMESTAMPTZ DEFAULT now(),
  committed_at        TIMESTAMPTZ,
  expires_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_planning_sessions_athlete ON public.planning_sessions(athlete_id);
CREATE INDEX IF NOT EXISTS idx_planning_sessions_status ON public.planning_sessions(status)
  WHERE status = 'proposed';

ALTER TABLE public.planning_sessions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Athletes manage own planning sessions"
    ON public.planning_sessions FOR ALL
    USING (auth.uid() = athlete_id)
    WITH CHECK (auth.uid() = athlete_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

GRANT ALL ON public.planning_sessions TO service_role;


-- ── 8. athlete_mode_history ─────────────────────────────────────────────────
-- Immutable audit trail of mode changes. Never updated, only inserted.
-- RLS: athletes read their own history.

CREATE TABLE IF NOT EXISTS public.athlete_mode_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  previous_mode   TEXT,
  new_mode        TEXT NOT NULL REFERENCES public.athlete_modes(id),
  trigger         TEXT NOT NULL CHECK (trigger IN ('manual', 'auto', 'system')),
  changed_by      UUID REFERENCES public.users(id),
  changed_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mode_history_athlete ON public.athlete_mode_history(athlete_id);
CREATE INDEX IF NOT EXISTS idx_mode_history_time ON public.athlete_mode_history(changed_at DESC);

ALTER TABLE public.athlete_mode_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Athletes read own mode history"
    ON public.athlete_mode_history FOR SELECT
    USING (auth.uid() = athlete_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Only service role inserts (via event handler)
GRANT ALL ON public.athlete_mode_history TO service_role;


-- ══════════════════════════════════════════════════════════════════════════════
-- ALTER EXISTING TABLES
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Alter player_schedule_preferences ───────────────────────────────────────
-- Add mode columns alongside existing league_is_active / exam_period_active.
-- Legacy flags kept for backwards compatibility until adoption > 95%.

ALTER TABLE public.player_schedule_preferences
  ADD COLUMN IF NOT EXISTS athlete_mode          TEXT DEFAULT 'balanced' REFERENCES public.athlete_modes(id),
  ADD COLUMN IF NOT EXISTS mode_changed_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mode_params_override  JSONB DEFAULT '{}';


-- ── Alter athlete_snapshots ─────────────────────────────────────────────────
-- Add Planning IP fields to the snapshot. dual_load_index already exists
-- (migration 012) — SKIP.
-- All new columns nullable, no defaults (null = not yet computed).

ALTER TABLE public.athlete_snapshots
  ADD COLUMN IF NOT EXISTS athlete_mode              TEXT,
  ADD COLUMN IF NOT EXISTS mode_changed_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS study_training_balance_ratio NUMERIC,
  ADD COLUMN IF NOT EXISTS dual_load_zone            TEXT,
  ADD COLUMN IF NOT EXISTS applicable_protocol_ids   TEXT[],
  ADD COLUMN IF NOT EXISTS exam_proximity_score      NUMERIC;

-- Index for protocol array queries (GIN for array containment)
CREATE INDEX IF NOT EXISTS idx_snapshots_applicable_protocols
  ON public.athlete_snapshots USING gin(applicable_protocol_ids)
  WHERE applicable_protocol_ids IS NOT NULL;
