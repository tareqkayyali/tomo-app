-- ════════════════════════════════════════════════════════════════════════════
-- Migration 034: pd_signals — Signal Layer for Dashboard
-- ════════════════════════════════════════════════════════════════════════════
--
-- Extends PDIL with a CMS-managed signal system for the Dashboard.
-- Each signal has conditions (same DSL as pd_protocols), visual config,
-- coaching text templates, pill configs, and trigger configs.
--
-- The PD can tune thresholds, colors, coaching text, add new signals.
-- Priority order: lower = checked first = wins if multiple match.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS pd_signals (
  signal_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  key                 TEXT NOT NULL UNIQUE,
  display_name        TEXT NOT NULL,
  subtitle            TEXT NOT NULL,

  -- Conditions (same DSL as pd_protocols)
  conditions          JSONB NOT NULL,

  -- Priority (lower = checked first = wins if multiple match)
  priority            INT NOT NULL,

  -- Visual config (CMS-editable)
  color               TEXT NOT NULL,
  hero_background     TEXT NOT NULL,
  arc_opacity         JSONB NOT NULL,
  pill_background     TEXT NOT NULL,
  bar_rgba            TEXT NOT NULL,
  coaching_color      TEXT NOT NULL,

  -- Content (CMS-editable, supports {field} interpolation)
  coaching_text       TEXT NOT NULL,
  pill_config         JSONB NOT NULL,
  trigger_config      JSONB NOT NULL,

  -- Plan adaptation overrides
  adapted_plan_name   TEXT,
  adapted_plan_meta   TEXT,

  -- Urgency
  show_urgency_badge  BOOLEAN DEFAULT FALSE,
  urgency_label       TEXT,

  -- Behavior
  is_built_in         BOOLEAN DEFAULT FALSE,
  is_enabled          BOOLEAN DEFAULT TRUE,

  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- Index for fast loading
CREATE INDEX IF NOT EXISTS idx_pd_signals_enabled_priority
  ON pd_signals (is_enabled, priority ASC)
  WHERE is_enabled = TRUE;

-- ── RLS ──
ALTER TABLE pd_signals ENABLE ROW LEVEL SECURITY;

-- Admin full access (service role bypasses RLS anyway, but explicit is better)
CREATE POLICY pd_signals_admin_all ON pd_signals
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- SEED: 8 Built-in Signals
-- ════════════════════════════════════════════════════════════════════════════

-- 1. PHV_GATE (Priority 1) — Safety-critical, always fires for mid-PHV
INSERT INTO pd_signals (key, display_name, subtitle, conditions, priority, color, hero_background, arc_opacity, pill_background, bar_rgba, coaching_color, coaching_text, pill_config, trigger_config, adapted_plan_name, adapted_plan_meta, show_urgency_badge, urgency_label, is_built_in) VALUES (
  'PHV_GATE',
  'PHV GATE',
  'Growth-plate safety active',
  '{"match": "all", "conditions": [{"field": "phv_stage", "operator": "eq", "value": "mid"}]}',
  1,
  '#A05A4A',
  '#1C0F0C',
  '{"large": 1.0, "medium": 1.0, "small": 1.0}',
  'rgba(160,90,74,0.10)',
  'rgba(160,90,74,0.5)',
  '#7A3A2A',
  'Growth-plate safety protocol active. Load capped at {load_multiplier}%. No plyometrics, no maximal lifts. Focus on movement quality and technical skills.',
  '[{"metric": "phv_stage", "label_template": "PHV MID", "sub_label": "growth phase"}, {"metric": "load_multiplier", "label_template": "Load {load_multiplier}%", "sub_label": "capped"}]',
  '[{"metric": "phv_stage", "label": "Growth Phase", "value_template": "MID-PHV", "baseline_template": "safety protocol", "delta_template": "active", "positive_when": "below"}]',
  'Modified Strength Session',
  'Load × 0.70 · Hip hinge only · No plyometrics',
  true,
  'safety active',
  true
);

-- 2. OVERLOADED (Priority 2) — Fatigue emergency
INSERT INTO pd_signals (key, display_name, subtitle, conditions, priority, color, hero_background, arc_opacity, pill_background, bar_rgba, coaching_color, coaching_text, pill_config, trigger_config, adapted_plan_name, adapted_plan_meta, show_urgency_badge, urgency_label, is_built_in) VALUES (
  'OVERLOADED',
  'OVERLOADED',
  'Body needs recovery',
  '{"match": "any", "conditions": [{"field": "acwr", "operator": "gt", "value": 1.5}, {"field": "consecutive_red_days", "operator": "gte", "value": 2}]}',
  2,
  '#c49a3c',
  '#151209',
  '{"large": 1.0, "medium": 1.0, "small": 1.0}',
  'rgba(196,154,60,0.10)',
  'rgba(196,154,60,0.5)',
  '#8A6A30',
  'Your body is signalling fatigue. ACWR at {acwr} — training load has spiked beyond your chronic baseline. Prioritise recovery today. Light movement only.',
  '[{"metric": "acwr", "label_template": "ACWR {acwr}", "sub_label": "above safe zone"}, {"metric": "soreness", "label_template": "Soreness {soreness}/5", "sub_label": "elevated"}]',
  '[{"metric": "acwr", "label": "ACWR", "value_template": "{acwr}", "baseline_template": "safe zone 0.8–1.3", "delta_template": "+{delta}", "positive_when": "below"}, {"metric": "hrv_morning_ms", "label": "HRV", "value_template": "{value}ms", "baseline_template": "baseline {hrv_baseline_ms}ms", "delta_template": "{hrv_delta}%", "positive_when": "above"}, {"metric": "soreness", "label": "Soreness", "value_template": "{soreness}/5", "baseline_template": "self-reported", "delta_template": "{soreness_delta}", "positive_when": "below"}]',
  'Recovery Walk / Rest Day',
  'Light only · No weights · 20–30 min max',
  false,
  NULL,
  true
);

-- 3. SLEEP_DEBT (Priority 3) — Chronic sleep deficit
INSERT INTO pd_signals (key, display_name, subtitle, conditions, priority, color, hero_background, arc_opacity, pill_background, bar_rgba, coaching_color, coaching_text, pill_config, trigger_config, adapted_plan_name, adapted_plan_meta, show_urgency_badge, urgency_label, is_built_in) VALUES (
  'SLEEP_DEBT',
  'SLEEP DEBT',
  'Cumulative sleep deficit detected',
  '{"match": "all", "conditions": [{"field": "sleep_debt_3d", "operator": "gte", "value": 3}, {"field": "sleep_hours", "operator": "lt", "value": 7}]}',
  3,
  '#c49a3c',
  '#151209',
  '{"large": 0.2, "medium": 0.5, "small": 1.0}',
  'rgba(196,154,60,0.10)',
  'rgba(196,154,60,0.5)',
  '#8A6A30',
  'You''ve accumulated {sleep_debt_3d}h of sleep debt over 3 nights. Sleep quality directly affects recovery, HRV, and reaction time. Aim for 8+ hours tonight.',
  '[{"metric": "sleep_hours", "label_template": "{sleep_hours}h sleep", "sub_label": "last night"}, {"metric": "sleep_debt_3d", "label_template": "{sleep_debt_3d}h debt", "sub_label": "3-day total"}]',
  '[{"metric": "sleep_hours", "label": "Sleep", "value_template": "{sleep_hours}h", "baseline_template": "target 7.5h+", "delta_template": "{sleep_delta}h", "positive_when": "above"}, {"metric": "hrv_morning_ms", "label": "HRV", "value_template": "{value}ms", "baseline_template": "baseline {hrv_baseline_ms}ms", "delta_template": "{hrv_delta}%", "positive_when": "above"}]',
  NULL,
  'Moderate intensity · Extended warm-up · Focus on technique',
  false,
  NULL,
  true
);

-- 4. DUAL_LOAD (Priority 4) — Academic collision
INSERT INTO pd_signals (key, display_name, subtitle, conditions, priority, color, hero_background, arc_opacity, pill_background, bar_rgba, coaching_color, coaching_text, pill_config, trigger_config, adapted_plan_name, adapted_plan_meta, show_urgency_badge, urgency_label, is_built_in) VALUES (
  'DUAL_LOAD',
  'DUAL LOAD',
  'Academic + athletic load collision',
  '{"match": "all", "conditions": [{"field": "dual_load_index", "operator": "gte", "value": 70}, {"field": "days_to_next_exam", "operator": "lte", "value": 7}]}',
  4,
  '#c49a3c',
  '#151209',
  '{"large": 0.25, "medium": 0.9, "small": 0.9}',
  'rgba(196,154,60,0.10)',
  'rgba(196,154,60,0.5)',
  '#8A6A30',
  'Dual load index at {dual_load_index}%. Exam in {days_to_next_exam} days. Training volume reduced to protect both academic and athletic performance.',
  '[{"metric": "dual_load_index", "label_template": "Load {dual_load_index}%", "sub_label": "dual index"}, {"metric": "days_to_next_exam", "label_template": "Exam in {days_to_next_exam}d", "sub_label": "upcoming"}]',
  '[{"metric": "dual_load_index", "label": "Dual Load", "value_template": "{dual_load_index}%", "baseline_template": "threshold 70%", "delta_template": "elevated", "positive_when": "below"}, {"metric": "academic_stress", "label": "Academic Stress", "value_template": "{academic_stress}/5", "baseline_template": "self-reported", "delta_template": "—", "positive_when": "below"}]',
  NULL,
  'Reduced volume · Short sessions · Prioritise study blocks',
  false,
  NULL,
  true
);

-- 5. MATCH_WINDOW (Priority 5) — Competition taper
INSERT INTO pd_signals (key, display_name, subtitle, conditions, priority, color, hero_background, arc_opacity, pill_background, bar_rgba, coaching_color, coaching_text, pill_config, trigger_config, adapted_plan_name, adapted_plan_meta, show_urgency_badge, urgency_label, is_built_in) VALUES (
  'MATCH_WINDOW',
  'MATCH WINDOW',
  'Competition taper active',
  '{"match": "all", "conditions": [{"field": "days_to_next_match", "operator": "lte", "value": 3}]}',
  5,
  '#7a9b76',
  '#101C14',
  '{"large": 0.55, "medium": 1.0, "small": 1.0}',
  'rgba(122,155,118,0.12)',
  'rgba(122,155,118,0.5)',
  '#567A5C',
  'Match in {days_to_next_match} days. Taper protocol active — reduced volume, maintain intensity. Focus on activation and tactical prep.',
  '[{"metric": "days_to_next_match", "label_template": "Match in {days_to_next_match}d", "sub_label": "competition"}, {"metric": "readiness_score", "label_template": "Ready {readiness_score}", "sub_label": "score"}]',
  '[{"metric": "days_to_next_match", "label": "Match Day", "value_template": "{days_to_next_match} days", "baseline_template": "taper window ≤3d", "delta_template": "active", "positive_when": "below"}, {"metric": "readiness_score", "label": "Readiness", "value_template": "{readiness_score}", "baseline_template": "target 70+", "delta_template": "—", "positive_when": "above"}]',
  NULL,
  'Match prep · Activation drills · Low volume · High intent',
  false,
  NULL,
  true
);

-- 6. RECOVERING (Priority 6) — Post-fatigue bounce
INSERT INTO pd_signals (key, display_name, subtitle, conditions, priority, color, hero_background, arc_opacity, pill_background, bar_rgba, coaching_color, coaching_text, pill_config, trigger_config, adapted_plan_name, adapted_plan_meta, show_urgency_badge, urgency_label, is_built_in) VALUES (
  'RECOVERING',
  'RECOVERING',
  'Bouncing back — trending positive',
  '{"match": "all", "conditions": [{"field": "readiness_score", "operator": "lt", "value": 60}, {"field": "hrv_ratio", "operator": "gte", "value": 0.9}]}',
  6,
  '#5A8A9F',
  '#0C1315',
  '{"large": 0.3, "medium": 0.8, "small": 1.0}',
  'rgba(90,138,159,0.12)',
  'rgba(90,138,159,0.5)',
  '#3A6A7F',
  'Your HRV is bouncing back ({hrv_delta}% vs baseline). Readiness still below optimal — ease back in with moderate intensity. Quality over volume today.',
  '[{"metric": "hrv_ratio", "label_template": "HRV {hrv_delta}%", "sub_label": "vs baseline"}, {"metric": "readiness_score", "label_template": "Ready {readiness_score}", "sub_label": "building"}]',
  '[{"metric": "hrv_morning_ms", "label": "HRV", "value_template": "{value}ms", "baseline_template": "baseline {hrv_baseline_ms}ms", "delta_template": "{hrv_delta}%", "positive_when": "above"}, {"metric": "soreness", "label": "Soreness", "value_template": "{soreness}/5", "baseline_template": "self-reported", "delta_template": "{soreness_delta}", "positive_when": "below"}]',
  NULL,
  'Moderate intensity · Progressive loading · Listen to your body',
  false,
  NULL,
  true
);

-- 7. MENTAL_LOAD (Priority 7) — Cognitive not physical
INSERT INTO pd_signals (key, display_name, subtitle, conditions, priority, color, hero_background, arc_opacity, pill_background, bar_rgba, coaching_color, coaching_text, pill_config, trigger_config, adapted_plan_name, adapted_plan_meta, show_urgency_badge, urgency_label, is_built_in) VALUES (
  'MENTAL_LOAD',
  'MENTAL LOAD',
  'Mind fatigued, body ready',
  '{"match": "all", "conditions": [{"field": "hrv_ratio", "operator": "gte", "value": 0.9}, {"field": "mood", "operator": "lte", "value": 2}, {"field": "academic_stress", "operator": "gte", "value": 4}]}',
  7,
  '#c49a3c',
  '#151209',
  '{"large": 0.4, "medium": 0.85, "small": 0.85}',
  'rgba(196,154,60,0.10)',
  'rgba(196,154,60,0.5)',
  '#8A6A30',
  'Your body is physically ready (HRV {hrv_delta}% vs baseline) but mental load is high. Mood {mood}/5, stress {academic_stress}/5. Use training as a mental reset — enjoyable, low-pressure sessions.',
  '[{"metric": "mood", "label_template": "Mood {mood}/5", "sub_label": "low"}, {"metric": "academic_stress", "label_template": "Stress {academic_stress}/5", "sub_label": "academic"}]',
  '[{"metric": "mood", "label": "Mood", "value_template": "{mood}/5", "baseline_template": "self-reported", "delta_template": "low", "positive_when": "above"}, {"metric": "academic_stress", "label": "Academic Stress", "value_template": "{academic_stress}/5", "baseline_template": "self-reported", "delta_template": "high", "positive_when": "below"}, {"metric": "hrv_morning_ms", "label": "HRV", "value_template": "{value}ms", "baseline_template": "baseline {hrv_baseline_ms}ms", "delta_template": "{hrv_delta}%", "positive_when": "above"}]',
  NULL,
  'Enjoyable session · Low pressure · Movement as mental reset',
  false,
  NULL,
  true
);

-- 8. PRIMED (Priority 8) — Default positive state
INSERT INTO pd_signals (key, display_name, subtitle, conditions, priority, color, hero_background, arc_opacity, pill_background, bar_rgba, coaching_color, coaching_text, pill_config, trigger_config, adapted_plan_name, adapted_plan_meta, show_urgency_badge, urgency_label, is_built_in) VALUES (
  'PRIMED',
  'PRIMED',
  'Peak performance window',
  '{"match": "all", "conditions": [{"field": "hrv_ratio", "operator": "gte", "value": 1.0}, {"field": "readiness_score", "operator": "gte", "value": 65}, {"field": "soreness", "operator": "lte", "value": 3}]}',
  8,
  '#7a9b76',
  '#101C14',
  '{"large": 1.0, "medium": 1.0, "small": 1.0}',
  'rgba(122,155,118,0.12)',
  'rgba(122,155,118,0.5)',
  '#567A5C',
  'Your body is ready. HRV {hrv_delta}% above baseline, readiness {readiness_score}. Quality session window — push intensity today.',
  '[{"metric": "hrv_ratio", "label_template": "HRV {hrv_delta}%", "sub_label": "above baseline"}, {"metric": "readiness_score", "label_template": "Ready {readiness_score}", "sub_label": "optimal"}, {"metric": "soreness", "label_template": "Soreness {soreness}/5", "sub_label": "low"}]',
  '[{"metric": "hrv_morning_ms", "label": "HRV", "value_template": "{value}ms", "baseline_template": "baseline {hrv_baseline_ms}ms", "delta_template": "{hrv_delta}%", "positive_when": "above"}, {"metric": "soreness", "label": "Soreness", "value_template": "{soreness}/5", "baseline_template": "self-reported", "delta_template": "{soreness_delta}", "positive_when": "below"}, {"metric": "energy", "label": "Energy", "value_template": "{energy}/5", "baseline_template": "self-reported", "delta_template": "—", "positive_when": "above"}]',
  NULL,
  NULL,
  false,
  NULL,
  true
);
