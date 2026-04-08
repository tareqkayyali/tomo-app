-- ============================================================================
-- Migration 031: Seed Built-In PD Protocols
-- ============================================================================
--
-- These 10 protocols are the IMMUTABLE SAFETY FLOOR of Tomo's coaching.
-- They are seeded as is_built_in = true:
--   - Cannot be deleted via CMS (soft-delete blocked for built-in)
--   - Thresholds can be tuned (e.g., ACWR threshold from 1.5 to 1.4)
--   - The PD can ADD new protocols on top of these
--
-- Each protocol maps to real sports science evidence. The evidence_source
-- and evidence_grade fields document the research backing.
--
-- Priority ranges:
--   1–5:   Safety (PHV, injury, ACWR danger) — highest authority
--   6–10:  Recovery (post-match, consecutive RED days)
--   11–15: Performance (match week taper)
--   16–20: Academic (exam period)
--   21–30: Load management (HRV, sleep, dual load, beginner)
-- ============================================================================

-- ── Protocol 1: PHV Mid-Stage Safety (Priority 1) ───────────────────────────
-- The most important protocol in Tomo. Growth plate vulnerability during PHV
-- requires absolute exercise restrictions regardless of any other factor.
INSERT INTO pd_protocols (
  name, description, category, priority, is_built_in, safety_critical,
  conditions,
  load_multiplier, intensity_cap,
  contraindications,
  required_elements,
  blocked_rec_categories, mandatory_rec_categories,
  forced_rag_domains,
  ai_system_injection,
  evidence_source, evidence_grade
) VALUES (
  'PHV Mid-Stage Safety Protocol',
  'Growth plate protection for athletes in Peak Height Velocity mid-stage. Applies absolute exercise restrictions and load reduction to prevent growth plate injuries during the most vulnerable development window.',
  'safety',
  1,
  true,
  true,
  '{"match": "all", "conditions": [{"field": "phv_stage", "operator": "eq", "value": "mid"}]}',
  0.70,
  'moderate',
  ARRAY['barbell_back_squat', 'barbell_front_squat', 'depth_jumps', 'box_jumps', 'maximal_sprinting', 'heavy_deadlift', 'power_clean', 'snatch', 'olympic_lifting', 'plyometric_bounding', 'stiff_leg_deadlift', 'good_morning', 'loaded_carry_heavy'],
  ARRAY['hip_hinge_bodyweight', 'glute_bridge', 'lateral_band_work'],
  ARRAY['max_strength', 'power_development'],
  ARRAY['movement_quality', 'injury_prevention'],
  ARRAY['phv_mid', 'load_management'],
  'CRITICAL — PHV MID-STAGE ACTIVE:
This athlete is in Peak Height Velocity mid-stage. Bone growth plates are at maximum vulnerability. Apply 0.70 load multiplier to ALL training. The 13 contraindicated exercises are BLOCKED regardless of program or user request. Prioritise movement quality over intensity. Never recommend maximal strength or power work. Focus coaching on hip hinge patterns, core stability, and aerobic development. Reference growth plate safety in all load explanations. Use encouraging language — the athlete should understand this is temporary and protects their long-term potential.',
  'Lloyd & Oliver 2012; Myer et al. 2011; LTAD Framework',
  'A'
);

-- ── Protocol 2: ACWR Danger Zone (Priority 2) ───────────────────────────────
-- ACWR ≥ 1.5 = significantly elevated injury risk (2–4x baseline).
INSERT INTO pd_protocols (
  name, description, category, priority, is_built_in, safety_critical,
  conditions,
  load_multiplier, intensity_cap,
  blocked_rec_categories, mandatory_rec_categories,
  priority_override, override_message,
  ai_system_injection,
  evidence_source, evidence_grade
) VALUES (
  'ACWR Danger Zone',
  'Acute:Chronic Workload Ratio exceeds 1.5 — injury risk is 2–4x baseline. Immediate load reduction and recovery focus required.',
  'safety',
  2,
  true,
  false,
  '{"match": "all", "conditions": [{"field": "acwr", "operator": "gte", "value": 1.5}]}',
  0.50,
  'light',
  ARRAY['strength_development', 'speed_development', 'power_development'],
  ARRAY['recovery'],
  'P1',
  'Training spike detected — your recent load is significantly higher than your body is prepared for. Focus on recovery to protect against injury.',
  'HIGH ACWR WARNING — ACWR EXCEEDS 1.5:
Injury risk is significantly elevated. This athlete has accumulated acute load exceeding chronic preparation by 50% or more. All recommendations must prioritise recovery and load reduction. Do NOT suggest high-intensity training, new stimulus introduction, or additional volume. Communicate the injury risk clearly but constructively — the goal is protecting the athlete for the medium term, not scaring them. Frame deloading as a smart strategy, not a setback.',
  'Gabbett 2016; Hulin et al. 2014',
  'A'
);

-- ── Protocol 3: ACWR High Zone (Priority 3) ─────────────────────────────────
-- ACWR ≥ 1.3 = moderately elevated injury risk.
INSERT INTO pd_protocols (
  name, description, category, priority, is_built_in, safety_critical,
  conditions,
  load_multiplier, intensity_cap,
  mandatory_rec_categories,
  ai_system_injection,
  evidence_source, evidence_grade
) VALUES (
  'ACWR Elevated Zone',
  'Acute:Chronic Workload Ratio between 1.3–1.5 — injury risk is moderately elevated. Load should be managed carefully.',
  'safety',
  3,
  true,
  false,
  '{"match": "all", "conditions": [{"field": "acwr", "operator": "gte", "value": 1.3}]}',
  0.70,
  'moderate',
  ARRAY['recovery', 'load_management'],
  'ACWR ELEVATED (1.3–1.5):
Training load is building faster than the athlete''s chronic preparation. Be cautious with intensity recommendations. Suggest maintaining current load without increases. If the athlete asks for more volume, explain the risk and recommend consolidation over accumulation.',
  'Gabbett 2016; Blanch & Gabbett 2016',
  'A'
);

-- ── Protocol 4: Readiness RED Gate (Priority 4) ─────────────────────────────
-- RED readiness = significant recovery deficit. Rest or light only.
INSERT INTO pd_protocols (
  name, description, category, priority, is_built_in, safety_critical,
  conditions,
  load_multiplier, intensity_cap,
  blocked_rec_categories, mandatory_rec_categories,
  priority_override, override_message,
  ai_system_injection,
  evidence_source, evidence_grade
) VALUES (
  'Readiness RED Gate',
  'Athlete''s computed readiness is RED — significant recovery deficit detected from biometrics, wellness, and/or sleep data. Training should be rest or light only.',
  'recovery',
  4,
  true,
  false,
  '{"match": "all", "conditions": [{"field": "readiness_rag", "operator": "eq", "value": "RED"}]}',
  0.50,
  'light',
  ARRAY['strength_development', 'speed_development', 'power_development', 'technical_development'],
  ARRAY['recovery', 'sleep_optimisation'],
  'P1',
  'Your body needs rest today. Recovery or light movement only — pushing through will slow your progress.',
  'READINESS RED — RECOVERY DEFICIT:
The athlete is showing a significant recovery deficit based on biometrics, wellness, and/or sleep data. All recommendations must focus exclusively on recovery quality: sleep optimisation, nutrition support, active recovery movement, and stress reduction. Do NOT suggest training intensity. Address the recovery deficit directly and empathetically — avoiding overtraining is as important as training itself for long-term development. This is a coaching moment: help the athlete understand that rest IS training.',
  'Halson 2014; Kellmann et al. 2018',
  'A'
);

-- ── Protocol 5: Readiness AMBER Gate (Priority 5) ───────────────────────────
-- AMBER readiness = moderate recovery concern. Cap at moderate intensity.
INSERT INTO pd_protocols (
  name, description, category, priority, is_built_in, safety_critical,
  conditions,
  load_multiplier, intensity_cap,
  ai_system_injection,
  evidence_source, evidence_grade
) VALUES (
  'Readiness AMBER Gate',
  'Athlete''s computed readiness is AMBER — moderate recovery concern. Training should be capped at moderate intensity.',
  'recovery',
  5,
  true,
  false,
  '{"match": "all", "conditions": [{"field": "readiness_rag", "operator": "eq", "value": "AMBER"}]}',
  0.75,
  'moderate',
  'READINESS AMBER — MODERATE CONCERN:
The athlete''s readiness is AMBER. They can train but should not push to maximum effort. Recommend sticking to the planned session without extra sets or intensity escalation. If the athlete asks to go harder, gently redirect — today is about quality execution at moderate intensity, not setting records.',
  'Halson 2014; Kellmann et al. 2018',
  'B'
);

-- ── Protocol 6: Consecutive RED Recovery (Priority 6) ────────────────────────
-- 2+ consecutive RED days = accumulated recovery debt. Full rest recommended.
INSERT INTO pd_protocols (
  name, description, category, priority, is_built_in, safety_critical,
  conditions,
  load_multiplier, intensity_cap,
  blocked_rec_categories, mandatory_rec_categories,
  priority_override,
  ai_system_injection,
  evidence_source, evidence_grade
) VALUES (
  'Consecutive RED Day Recovery',
  'Two or more consecutive RED readiness days — accumulated recovery debt. Full rest day recommended.',
  'recovery',
  6,
  true,
  false,
  '{"match": "all", "conditions": [{"field": "consecutive_red_days", "operator": "gte", "value": 2}]}',
  0.40,
  'rest',
  ARRAY['strength_development', 'speed_development', 'technical_development', 'power_development'],
  ARRAY['recovery', 'sleep_optimisation', 'nutrition'],
  'P0',
  'CONSECUTIVE RED RECOVERY PROTOCOL:
This athlete has been in RED readiness for 2+ consecutive days. This is NOT a single bad day — it is accumulated recovery debt. Training is counterproductive until the underlying recovery deficit is addressed. Focus on: sleep quality improvement, stress management, nutrition adequacy, and gentle movement only (walking, light stretching). Do not suggest ANY structured training. Be empathetic but firm — returning to training too early will extend the recovery timeline.',
  'Meeusen et al. 2013 (ECSS Position Statement on Overtraining)',
  'A'
);

-- ── Protocol 7: Match Week Taper (Priority 10) ──────────────────────────────
-- Competition within 3 days. Shift to activation and freshness preservation.
INSERT INTO pd_protocols (
  name, description, category, priority, is_built_in, safety_critical,
  conditions,
  load_multiplier, intensity_cap, session_cap_minutes,
  blocked_rec_categories, mandatory_rec_categories,
  ai_system_injection,
  evidence_source, evidence_grade
) VALUES (
  'Match Week Taper',
  'Competition within 3 days. Training focus shifts to neuromuscular activation and freshness preservation.',
  'performance',
  10,
  true,
  false,
  '{"match": "all", "conditions": [{"field": "days_to_next_match", "operator": "lte", "value": 3}]}',
  0.75,
  'moderate',
  50,
  ARRAY['volume_accumulation', 'strength_development'],
  ARRAY['activation', 'recovery'],
  'MATCH WEEK — TAPER PROTOCOL ACTIVE:
Competition is within 3 days. Training focus must shift to neuromuscular activation and freshness preservation. Reduce volume by 25%, maintain intensity briefly in activation sets only. No new stimuli. All recommendations should prime the athlete physically and mentally for match performance. Discuss tactical readiness and pre-match routine. If the athlete wants to train hard, explain that freshness on match day is the goal — the fitness is already built.',
  'Mujika & Padilla 2003; Bosquet et al. 2007',
  'A'
);

-- ── Protocol 8: Post-Match Recovery Window (Priority 11) ────────────────────
-- Within 48 hours after a match. Light movement only.
INSERT INTO pd_protocols (
  name, description, category, priority, is_built_in, safety_critical,
  conditions,
  load_multiplier, intensity_cap,
  blocked_rec_categories, mandatory_rec_categories,
  ai_system_injection,
  evidence_source, evidence_grade
) VALUES (
  'Post-Match 48h Recovery',
  'Within 48 hours after match play. Prioritise muscle repair, glycogen restoration, and nervous system recovery.',
  'recovery',
  11,
  false,
  false,
  '{"match": "all", "conditions": [{"field": "days_since_last_session", "operator": "lte", "value": 2}, {"field": "session_count_7day", "operator": "gte", "value": 1}]}',
  0.70,
  'light',
  ARRAY['strength_development', 'speed_development'],
  ARRAY['recovery', 'mobility'],
  'POST-MATCH RECOVERY WINDOW (48h):
The athlete has played recently and is within the 48-hour recovery window. Prioritise muscle repair, glycogen restoration, and nervous system recovery. Light movement only — swimming, cycling, walking, foam rolling. Nutrition focus: protein and carbohydrate replenishment. No new strength or speed stimuli for at least 48 hours after match play.',
  'Nedelec et al. 2012; Ispirlidis et al. 2008',
  'B'
);

-- ── Protocol 9: Exam Period Academic Load (Priority 15) ─────────────────────
-- Exam within 7 days OR dual load index ≥ 80. Reduce training to preserve cognitive energy.
INSERT INTO pd_protocols (
  name, description, category, priority, is_built_in, safety_critical,
  conditions,
  load_multiplier, intensity_cap,
  mandatory_rec_categories,
  forced_rag_domains,
  ai_system_injection,
  evidence_source, evidence_grade
) VALUES (
  'Exam Period Dual-Load Management',
  'Academic exams within 7 days or dual-load index exceeds 80%. Reduce training intensity to preserve cognitive energy for academic performance.',
  'academic',
  15,
  true,
  false,
  '{"match": "any", "conditions": [{"field": "days_to_next_exam", "operator": "lte", "value": 7}, {"field": "dual_load_index", "operator": "gte", "value": 80}]}',
  0.85,
  'moderate',
  ARRAY['academic_balance', 'recovery'],
  ARRAY['academic_performance', 'dual_load'],
  'EXAM PERIOD ACTIVE:
Academic stress is high or exams are approaching. Cognitive load is elevated, which impairs recovery quality and training adaptation. Reduce training intensity to preserve mental energy for academic performance. Recommend shorter, higher-quality sessions over long sessions. Actively discuss the study-training schedule and suggest optimal cognitive windows (moderate exercise 1–2 hours before study enhances executive function — cite research if asked). The athlete is juggling two performance domains — acknowledge both.',
  'Tomporowski et al. 2008; Hillman et al. 2009',
  'B'
);

-- ── Protocol 10: Injury Risk HIGH (Priority 3) ──────────────────────────────
-- Injury risk flag is RED. Prioritize prevention.
INSERT INTO pd_protocols (
  name, description, category, priority, is_built_in, safety_critical,
  conditions,
  load_multiplier,
  mandatory_rec_categories,
  ai_system_injection,
  evidence_source, evidence_grade
) VALUES (
  'Injury Risk HIGH',
  'Computed injury risk flag is RED — elevated risk based on load, wellness, and biometric indicators. Prioritize injury prevention exercises.',
  'safety',
  3,
  true,
  false,
  '{"match": "all", "conditions": [{"field": "injury_risk_flag", "operator": "eq", "value": "RED"}]}',
  0.60,
  ARRAY['injury_prevention', 'recovery'],
  'INJURY RISK HIGH (RED FLAG):
This athlete has an elevated injury risk based on load patterns, wellness indicators, and biometric data. Prioritise injury prevention exercises (ACL prevention, hamstring Nordic curls, balance work). Reduce overall volume. If the athlete asks for intense training, explain that injury prevention IS performance training — staying healthy is the fastest path to improvement.',
  'Gabbett 2016; Malone et al. 2017',
  'A'
);
