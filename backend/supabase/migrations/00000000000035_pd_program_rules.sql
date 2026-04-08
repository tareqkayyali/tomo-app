-- ============================================================================
-- PD Program Rules — Performance Director Program Assignment Guidelines
-- ============================================================================
--
-- This table stores PD-authored rules that guide the AI Training Program
-- Intelligence Engine. Each rule defines CONDITIONS (same DSL as pd_protocols)
-- and PROGRAM GUIDANCE (which programs to mandate, prioritize, or block).
--
-- These are GUIDELINES — the AI uses them alongside athlete context, RAG,
-- and benchmark data to make final program assignments.
-- ============================================================================

CREATE TABLE IF NOT EXISTS pd_program_rules (
  rule_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  name                TEXT NOT NULL,
  description         TEXT,
  category            TEXT NOT NULL CHECK (category IN (
                        'safety', 'development', 'recovery', 'performance',
                        'injury_prevention', 'position_specific', 'load_management'
                      )),

  -- Activation Conditions (same JSONB DSL as pd_protocols)
  -- Schema: { "match": "all"|"any", "conditions": [{ "field", "operator", "value" }] }
  conditions          JSONB NOT NULL,

  -- Priority (lower = higher priority = evaluated first)
  priority            INT NOT NULL DEFAULT 100,

  -- ── PROGRAM GUIDANCE ──

  -- Programs that MUST be assigned when this rule fires
  -- References program IDs from the 31-program catalog (footballPrograms.ts)
  mandatory_programs    TEXT[] DEFAULT '{}',

  -- Programs that should be elevated to HIGH priority
  high_priority_programs TEXT[] DEFAULT '{}',

  -- Programs that should be BLOCKED (excluded from recommendations)
  blocked_programs      TEXT[] DEFAULT '{}',

  -- Program CATEGORIES to prioritize (e.g., 'recovery', 'mobility', 'speed')
  prioritize_categories TEXT[] DEFAULT '{}',

  -- Program CATEGORIES to block (e.g., 'strength', 'power')
  block_categories      TEXT[] DEFAULT '{}',

  -- ── PRESCRIPTION OVERRIDES ──
  -- Applied to ALL programs when this rule fires

  -- Load multiplier (0.0–1.0, applied to volume/intensity)
  load_multiplier       DECIMAL(3,2),

  -- Max session duration
  session_cap_minutes   INT,

  -- Frequency cap (max sessions per week for affected categories)
  frequency_cap         INT,

  -- Intensity ceiling
  intensity_cap         TEXT CHECK (intensity_cap IN ('full', 'moderate', 'light', 'rest')),

  -- ── AI COACHING CONTEXT ──
  -- Injected into the AI system prompt for program selection

  -- Free-text guidance for the AI (interpolated with {field} values)
  ai_guidance_text      TEXT,

  -- Whether this rule is safety-critical (AI cannot override)
  safety_critical       BOOLEAN DEFAULT FALSE,

  -- ── SCOPE FILTERS (pre-conditions) ──
  sport_filter          TEXT[],
  phv_filter            TEXT[],
  age_band_filter       TEXT[],
  position_filter       TEXT[],

  -- ── BEHAVIOR ──
  is_built_in       BOOLEAN DEFAULT FALSE,
  is_enabled        BOOLEAN DEFAULT TRUE,
  version           INT DEFAULT 1,

  -- ── METADATA ──
  evidence_source   TEXT,
  evidence_grade    TEXT CHECK (evidence_grade IN ('A', 'B', 'C')),
  created_by        UUID,
  updated_by        UUID,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- Index for priority ordering
CREATE INDEX IF NOT EXISTS idx_pd_program_rules_priority ON pd_program_rules(priority ASC);
CREATE INDEX IF NOT EXISTS idx_pd_program_rules_enabled ON pd_program_rules(is_enabled);

-- Audit log for rule evaluations
CREATE TABLE IF NOT EXISTS pd_program_rule_audit (
  audit_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id          UUID NOT NULL,
  rule_id             UUID NOT NULL REFERENCES pd_program_rules(rule_id),
  triggered_at        TIMESTAMPTZ DEFAULT now(),
  condition_values    JSONB NOT NULL,
  programs_mandated   TEXT[],
  programs_blocked    TEXT[],
  categories_prioritized TEXT[],
  categories_blocked  TEXT[],
  source_trigger      TEXT
);

CREATE INDEX IF NOT EXISTS idx_pd_program_rule_audit_athlete ON pd_program_rule_audit(athlete_id, triggered_at DESC);

-- RLS
ALTER TABLE pd_program_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE pd_program_rule_audit ENABLE ROW LEVEL SECURITY;

-- Admin-only access via service role (CMS uses service role)
CREATE POLICY "pd_program_rules_service_role" ON pd_program_rules
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "pd_program_rule_audit_service_role" ON pd_program_rule_audit
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- SEED: Built-in Program Rules
-- ============================================================================

INSERT INTO pd_program_rules (
  name, description, category, priority, is_built_in, safety_critical,
  conditions,
  mandatory_programs, blocked_programs,
  prioritize_categories, block_categories,
  load_multiplier, intensity_cap,
  ai_guidance_text,
  evidence_source, evidence_grade
) VALUES
-- 1. PHV Mid-Stage — Safety Critical
(
  'PHV Mid-Stage Program Safety',
  'Growth plate protection: blocks heavy loading programs, mandates injury prevention and mobility work during Peak Height Velocity mid-stage.',
  'safety', 1, true, true,
  '{"match": "all", "conditions": [{"field": "phv_stage", "operator": "eq", "value": "mid"}]}',
  ARRAY['acl_prevention_protocol', 'mobility_hip_ankle', 'ankle_stability_protocol'],
  ARRAY['strength_lower_compound', 'strength_upper_push_pull', 'power_olympic_lifts', 'plyo_lower_body'],
  ARRAY['mobility', 'injury-prevention'],
  ARRAY['strength', 'power'],
  0.70, 'moderate',
  'SAFETY-CRITICAL: Athlete is in PHV mid-stage. All programs must enforce 0.70 load multiplier. Exclude ALL heavy compound lifts, plyometrics, and Olympic derivatives. Prioritize bodyweight movement quality, injury prevention protocols, and aerobic development. This is a non-negotiable growth plate safety requirement.',
  'Lloyd & Oliver 2012; Myer et al. 2011; LTAD Framework',
  'A'
),

-- 2. ACWR Overload — Block high intensity
(
  'High ACWR Load Management',
  'When acute:chronic workload ratio exceeds safe zone, prioritize recovery and block high-intensity programs.',
  'load_management', 2, true, false,
  '{"match": "all", "conditions": [{"field": "acwr", "operator": "gt", "value": 1.3}]}',
  ARRAY[]::TEXT[],
  ARRAY['sprint_linear_10_30', 'sprint_flying_20_40', 'endurance_hiit', 'power_olympic_lifts'],
  ARRAY['recovery', 'mobility'],
  ARRAY['speed', 'power'],
  0.75, 'moderate',
  'Athlete ACWR is above 1.3 (overload zone). Reduce total training volume by 25%. Block sprint and high-intensity interval programs. Prioritize recovery protocols and mobility. Any assigned programs should use reduced sets and frequency.',
  'Gabbett 2016; Hulin et al. 2014',
  'A'
),

-- 3. RED Readiness — Recovery Day
(
  'RED Readiness Recovery Protocol',
  'When readiness flags RED, mandate recovery programs and block all high-intensity work.',
  'recovery', 3, true, false,
  '{"match": "all", "conditions": [{"field": "readiness_rag", "operator": "eq", "value": "RED"}]}',
  ARRAY[]::TEXT[],
  ARRAY['sprint_linear_10_30', 'sprint_flying_20_40', 'sled_resisted_sprint', 'strength_lower_compound', 'strength_upper_push_pull', 'power_olympic_lifts', 'plyo_lower_body', 'endurance_hiit'],
  ARRAY['recovery', 'mobility'],
  ARRAY['speed', 'strength', 'power', 'endurance'],
  0.50, 'light',
  'Athlete readiness is RED — body needs recovery. Block ALL high-intensity programs. Only assign recovery, mobility, and light technical work. Session duration must not exceed 30 minutes. Focus on nervous system recovery and gentle movement.',
  'Halson 2014; Kellmann et al. 2018',
  'A'
),

-- 4. Match Day -1 — Taper
(
  'Match Eve Taper Protocol',
  'Day before match: light activation only, no heavy loading, preserve energy for competition.',
  'performance', 5, true, false,
  '{"match": "all", "conditions": [{"field": "days_to_next_match", "operator": "eq", "value": 1}]}',
  ARRAY[]::TEXT[],
  ARRAY['strength_lower_compound', 'strength_upper_push_pull', 'power_olympic_lifts', 'endurance_hiit', 'endurance_aerobic_base'],
  ARRAY['mobility'],
  ARRAY['strength', 'endurance'],
  0.40, 'light',
  'Match tomorrow — taper day. Block all strength and endurance programs. Only light activation, mobility, and technical visualization. Sessions under 25 minutes. Athlete should feel fresh, not fatigued.',
  'Mujika & Padilla 2003; Bosquet et al. 2007',
  'B'
),

-- 5. Sleep Debt — Recovery Priority
(
  'Sleep Debt Recovery Focus',
  'When sleep is consistently below 7 hours, prioritize recovery and reduce training volume.',
  'recovery', 6, true, false,
  '{"match": "all", "conditions": [{"field": "sleep_debt_3d", "operator": "gt", "value": 3}]}',
  ARRAY[]::TEXT[],
  ARRAY[]::TEXT[],
  ARRAY['recovery', 'mobility'],
  ARRAY[]::TEXT[],
  0.80, 'moderate',
  'Athlete has accumulated sleep debt (3+ hours below target over 3 days). Reduce training volume by 20%. Avoid early morning high-intensity sessions. Prioritize recovery and sleep hygiene. Technical work is fine but keep RPE below 7.',
  'Vitale et al. 2019; Simpson et al. 2017',
  'B'
),

-- 6. Injury Prevention — Hamstring Focus for Speed Positions
(
  'Hamstring Prevention for Speed Positions',
  'Players in speed-dependent positions must include Nordic hamstring and hip mobility protocols.',
  'injury_prevention', 10, true, false,
  '{"match": "any", "conditions": [{"field": "phv_stage", "operator": "in", "value": ["post", "not_applicable"]}]}',
  ARRAY['nordic_hamstring_protocol'],
  ARRAY[]::TEXT[],
  ARRAY['injury-prevention'],
  ARRAY[]::TEXT[],
  NULL, NULL,
  'Include Nordic hamstring protocol for all post-PHV athletes in speed-dependent positions. This is the gold-standard hamstring injury prevention protocol with Grade A evidence. Minimum 2x per week.',
  'Van der Horst et al. 2015; Al Attar et al. 2017',
  'A'
),

-- 7. Low Training Age — Foundation First
(
  'Beginner Foundation Protocol',
  'Athletes with low training age need fundamental movement patterns before specialized programs.',
  'development', 15, true, false,
  '{"match": "all", "conditions": [{"field": "training_age_weeks", "operator": "lt", "value": 12}]}',
  ARRAY['mobility_hip_ankle', 'strength_single_leg'],
  ARRAY['power_olympic_lifts', 'sled_resisted_sprint'],
  ARRAY['mobility', 'injury-prevention'],
  ARRAY['power'],
  0.70, 'moderate',
  'Athlete has low training age (<12 weeks). Prioritize movement quality and fundamental patterns. Block advanced power programs. Build base with single-leg strength, mobility, and bodyweight exercises before progressing to complex movements.',
  'LTAD Framework; Lloyd & Oliver 2012',
  'B'
),

-- 8. Exam Period — Reduced Volume
(
  'Exam Period Load Reduction',
  'During exam periods, reduce training volume to manage dual academic-athletic load.',
  'load_management', 12, true, false,
  '{"match": "all", "conditions": [{"field": "days_to_next_exam", "operator": "lte", "value": 7}]}',
  ARRAY[]::TEXT[],
  ARRAY[]::TEXT[],
  ARRAY['technical'],
  ARRAY[]::TEXT[],
  0.80, NULL,
  'Athlete has exams within 7 days. Reduce training volume by 20% to manage dual load. Prioritize technical and tactical work (low physical stress, high engagement). Keep sessions short and mentally refreshing.',
  'Stambulova et al. 2015',
  'C'
);
