-- ============================================================================
-- Migration 033: Extended PD Protocols — Academic, Load Management, Wellness
-- ============================================================================
--
-- Migrates ALL remaining hardcoded thresholds into PD-managed protocols.
-- These complement the 10 built-in safety/recovery protocols from migration 031.
--
-- Source files being externalized:
--   - dualLoadEngine.ts         → Protocols 11–14 (academic/dual-load)
--   - academicComputer.ts       → Protocols 15–17 (exam recommendations)
--   - recommendationConfig.ts   → Protocols 18–23 (HRV, sleep, wellness, beginner)
--   - loadWarningComputer.ts    → Protocols 24–25 (detraining, PHV+ACWR)
--   - scheduleRuleEngine.ts     → Protocols 26–28 (league, match day, session cap)
--
-- After this migration, EVERY threshold the Performance Director might
-- want to tune is in pd_protocols — zero code changes needed.
-- ============================================================================

-- ══════════════════════════════════════════════════════════════════════════════
-- ACADEMIC & DUAL-LOAD PROTOCOLS (from dualLoadEngine.ts + academicComputer.ts)
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Protocol 11: Dual Load Critical (DLI ≥ 80) ─────────────────────────────
-- Currently hardcoded as DLI_CRITICAL = 80 in dualLoadEngine.ts
-- Exam period: 0.5x intensity. Non-exam: 0.6x intensity.
INSERT INTO pd_protocols (
  name, description, category, priority, is_built_in, safety_critical,
  conditions,
  load_multiplier, intensity_cap,
  blocked_rec_categories, mandatory_rec_categories,
  priority_override, override_message,
  ai_system_injection,
  evidence_source, evidence_grade
) VALUES (
  'Dual Load Critical',
  'Combined athletic + academic load index exceeds 80/100. The athlete is under significant combined stress. Training should be minimal — recovery and light movement only.',
  'academic',
  16,
  true,
  false,
  '{"match": "all", "conditions": [{"field": "dual_load_index", "operator": "gte", "value": 80}]}',
  0.50,
  'light',
  ARRAY['strength_development', 'speed_development', 'power_development', 'volume_accumulation'],
  ARRAY['recovery', 'academic_balance'],
  'P1',
  'Your combined training and academic load is very high. Focus on recovery — your body and brain both need rest to perform.',
  'DUAL LOAD CRITICAL (DLI ≥ 80):
The athlete''s combined athletic + academic load index is at or above 80/100. This is a RED zone for total body stress — cognitive fatigue compounds physical fatigue disproportionately in youth athletes. Training should be reduced to recovery or light movement only (50% load cap). Do NOT recommend additional training volume or intensity. Focus coaching on: sleep quality, nutrition timing, stress management, and efficient short sessions (30 min max). If the athlete asks to train hard, explain that cognitive fatigue impairs motor learning — training hard right now would be counterproductive even without the academic stress.',
  'Brink et al. 2010; Noon et al. 2015',
  'B'
);

-- ── Protocol 12: Dual Load High (DLI ≥ 65) ─────────────────────────────────
-- Currently hardcoded as DLI_HIGH = 65 in dualLoadEngine.ts
INSERT INTO pd_protocols (
  name, description, category, priority, is_built_in,
  conditions,
  load_multiplier, intensity_cap,
  mandatory_rec_categories,
  ai_system_injection,
  evidence_source, evidence_grade
) VALUES (
  'Dual Load Elevated',
  'Combined athletic + academic load index between 65–80. Moderate combined stress. Reduce training volume by 25% and keep sessions efficient.',
  'academic',
  20,
  true,
  '{"match": "all", "conditions": [{"field": "dual_load_index", "operator": "gte", "value": 65}]}',
  0.75,
  'moderate',
  ARRAY['academic_balance', 'load_management'],
  'DUAL LOAD ELEVATED (DLI 65–80):
The athlete''s combined load is elevated but not critical. Reduce training volume by approximately 25%. Keep sessions focused and efficient — prioritise quality over quantity. Suggest shorter warmups, fewer sets, and emphasise key movements only. If exam period is approaching, proactively suggest a study-training schedule that optimises both.',
  'Brink et al. 2010; Noon et al. 2015',
  'B'
);

-- ── Protocol 13: Exam Imminent (≤ 3 days) ──────────────────────────────────
-- Currently hardcoded in academicComputer.ts: examDays <= 3 + dualLoad > 70
INSERT INTO pd_protocols (
  name, description, category, priority, is_built_in,
  conditions,
  load_multiplier, intensity_cap, session_cap_minutes,
  mandatory_rec_categories,
  priority_override, override_message,
  forced_rag_domains,
  ai_system_injection,
  evidence_source, evidence_grade
) VALUES (
  'Exam Imminent — 3 Day Gate',
  'Exam within 3 days. Maximum cognitive preservation. Training capped at light, short sessions only.',
  'academic',
  12,
  true,
  '{"match": "all", "conditions": [{"field": "days_to_next_exam", "operator": "lte", "value": 3}]}',
  0.60,
  'light',
  30,
  ARRAY['academic_balance', 'recovery'],
  'P1',
  'Exam in 3 days — keep training light and short. Your brain needs the energy for studying.',
  ARRAY['academic_performance', 'dual_load'],
  'EXAM IMMINENT (≤ 3 DAYS):
The athlete has an exam within 3 days. Academic performance is the immediate priority. Training should be limited to 30-minute light sessions maximum — walking, light stretching, yoga, or a brief jog. Moderate exercise before study enhances executive function (cite Tomporowski 2008 if asked), but anything above light intensity will impair cognitive consolidation. NO gym sessions, NO high-intensity work. Help the athlete plan their pre-exam routine: light movement → study → sleep. Frame this as strategic periodization, not skipping training.',
  'Tomporowski et al. 2008; Hillman et al. 2009',
  'A'
);

-- ── Protocol 14: Exam Approaching (≤ 7 days) ───────────────────────────────
-- Currently hardcoded in academicComputer.ts: examDays <= 7 + dualLoad > 60
-- Also in dualLoadEngine.ts: EXAM_PROXIMITY_DAYS = 7, modifier 0.85
INSERT INTO pd_protocols (
  name, description, category, priority, is_built_in,
  conditions,
  load_multiplier, intensity_cap,
  mandatory_rec_categories,
  ai_system_injection,
  evidence_source, evidence_grade
) VALUES (
  'Exam Approaching — 7 Day Notice',
  'Exam within 7 days. Begin tapering training intensity to preserve cognitive energy. Moderate sessions are fine, but no new training stimulus.',
  'academic',
  18,
  false,
  '{"match": "all", "conditions": [{"field": "days_to_next_exam", "operator": "lte", "value": 7}]}',
  0.85,
  'moderate',
  ARRAY['academic_balance'],
  'EXAM APPROACHING (≤ 7 DAYS):
Exams are within a week. Begin a gradual taper of training intensity. Moderate sessions are appropriate — maintain fitness without adding new stimulus. Help the athlete build a study-training schedule that puts moderate exercise BEFORE study sessions (1–2 hours before optimal cognitive window). Suggest they avoid late-night training which impairs sleep quality before exams.',
  'Tomporowski et al. 2008; Hillman et al. 2009',
  'B'
);

-- ══════════════════════════════════════════════════════════════════════════════
-- LOAD MANAGEMENT PROTOCOLS (from recommendationConfig.ts)
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Protocol 15: HRV Severely Suppressed ────────────────────────────────────
-- Currently hardcoded: hrvRatio < 0.7 → 60% cap (recommendationConfig.ts)
INSERT INTO pd_protocols (
  name, description, category, priority, is_built_in,
  conditions,
  load_multiplier, intensity_cap,
  mandatory_rec_categories,
  ai_system_injection,
  evidence_source, evidence_grade
) VALUES (
  'HRV Severely Suppressed',
  'Heart rate variability is below 70% of baseline — significant autonomic nervous system stress. The body is not recovering adequately.',
  'recovery',
  7,
  true,
  '{"match": "all", "conditions": [{"field": "hrv_ratio", "operator": "lt", "value": 0.7}]}',
  0.60,
  'light',
  ARRAY['recovery', 'sleep_optimisation'],
  'HRV SEVERELY SUPPRESSED (< 70% of baseline):
The athlete''s heart rate variability is significantly below their personal baseline. This indicates the autonomic nervous system is under substantial stress — the body is not recovering between sessions. Recommend: rest day or very light active recovery only. Investigate potential causes: poor sleep, accumulated training load, illness onset, emotional stress, dehydration. If HRV has been suppressed for 3+ days, suggest the athlete checks in with their support network.',
  'Plews et al. 2013; Buchheit 2014',
  'A'
);

-- ── Protocol 16: HRV Mildly Suppressed ──────────────────────────────────────
-- Currently hardcoded: hrvRatio < 0.85 → 80% cap
INSERT INTO pd_protocols (
  name, description, category, priority, is_built_in,
  conditions,
  load_multiplier,
  ai_system_injection,
  evidence_source, evidence_grade
) VALUES (
  'HRV Mildly Suppressed',
  'Heart rate variability is between 70–85% of baseline — mild autonomic stress. Reduce load slightly and monitor.',
  'recovery',
  22,
  false,
  '{"match": "all", "conditions": [{"field": "hrv_ratio", "operator": "lt", "value": 0.85}]}',
  0.80,
  'HRV MILDLY SUPPRESSED (70–85% of baseline):
The athlete''s HRV is slightly below normal. This is not alarming but suggests incomplete recovery. Cap training load at 80% and avoid introducing new high-intensity stimuli today. Monitor over the next 2–3 days — if HRV continues declining, the higher-priority suppression protocol will activate.',
  'Plews et al. 2013; Buchheit 2014',
  'B'
);

-- ── Protocol 17: Poor Sleep ─────────────────────────────────────────────────
-- Currently hardcoded: sleepQuality < 5 → 80% cap (recommendationConfig.ts)
-- Adapted to use sleep_hours < 6 as the primary trigger
INSERT INTO pd_protocols (
  name, description, category, priority, is_built_in,
  conditions,
  load_multiplier,
  mandatory_rec_categories,
  ai_system_injection,
  evidence_source, evidence_grade
) VALUES (
  'Poor Sleep Recovery',
  'Sleep duration below 6 hours — cognitive and physical recovery is impaired. Reduce training load and prioritise sleep hygiene.',
  'recovery',
  21,
  false,
  '{"match": "all", "conditions": [{"field": "sleep_hours", "operator": "lt", "value": 6}]}',
  0.80,
  ARRAY['sleep_optimisation'],
  'POOR SLEEP (< 6 HOURS):
The athlete slept less than 6 hours. Both cognitive function and physical recovery are impaired. Reduce training load by 20% and keep sessions focused on quality movement, not volume. Recommend: earlier bedtime tonight, no screens 1 hour before bed, cool room, consistent wake time. If this is a recurring pattern (3+ nights in a week), escalate to a sleep hygiene conversation.',
  'Watson et al. 2017 (Sleep & Athletic Performance)',
  'A'
);

-- ── Protocol 18: Declining Wellness Trend ───────────────────────────────────
-- Currently hardcoded: decliningAvgThreshold < 3 → 70% cap
INSERT INTO pd_protocols (
  name, description, category, priority, is_built_in,
  conditions,
  load_multiplier,
  mandatory_rec_categories,
  ai_system_injection,
  evidence_source, evidence_grade
) VALUES (
  'Wellness Declining',
  'Rolling 7-day wellness average has dropped below 3.0 — the athlete is on a downward trajectory across energy, soreness, and mood.',
  'recovery',
  23,
  false,
  '{"match": "all", "conditions": [{"field": "wellness_7day_avg", "operator": "lt", "value": 3.0}]}',
  0.70,
  ARRAY['recovery', 'load_management'],
  'WELLNESS DECLINING (7-day avg < 3.0):
The athlete''s wellness trend is declining across multiple indicators (energy, soreness, mood). This is often a precursor to overtraining syndrome if not addressed. Reduce training volume by 30%. Focus on recovery quality and check in about non-training stressors (school, social, sleep). This is a critical coaching moment — help the athlete understand that recognising and responding to wellness trends is what separates smart athletes from injured ones.',
  'Saw et al. 2016 (Subjective Monitoring in Sport)',
  'B'
);

-- ── Protocol 19: Training Age Beginner ──────────────────────────────────────
-- Currently hardcoded: trainingAgeWeeks < 8 → 70% cap, block power
INSERT INTO pd_protocols (
  name, description, category, priority, is_built_in,
  conditions,
  load_multiplier,
  contraindications,
  blocked_rec_categories,
  ai_system_injection,
  evidence_source, evidence_grade
) VALUES (
  'Beginner Athlete Protection',
  'Athlete has less than 8 weeks of structured training. Progressive overload principles require a conservative ramp — no advanced power exercises.',
  'development',
  25,
  true,
  '{"match": "all", "conditions": [{"field": "training_age_weeks", "operator": "lt", "value": 8}]}',
  0.70,
  ARRAY['power_clean', 'snatch', 'depth_jumps', 'heavy_deadlift', 'barbell_back_squat'],
  ARRAY['power_development'],
  'BEGINNER ATHLETE (< 8 WEEKS TRAINING AGE):
This athlete is in their first 8 weeks of structured training. The musculoskeletal system is not yet adapted to handle advanced loading. Cap load at 70% and block all advanced power exercises. Focus on: movement quality, body awareness, fundamental patterns (squat, hinge, push, pull, carry), and building a training habit. Praise consistency over intensity. The goal in this phase is building a training foundation that lasts years, not impressive first-month numbers.',
  'LTAD Framework; Lloyd & Oliver 2012',
  'B'
);

-- ══════════════════════════════════════════════════════════════════════════════
-- SCHEDULE & COMPETITION PROTOCOLS (from scheduleRuleEngine.ts)
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Protocol 20: Match Day Cap ──────────────────────────────────────────────
-- Currently hardcoded: no HARD training on match day
INSERT INTO pd_protocols (
  name, description, category, priority, is_built_in,
  conditions,
  intensity_cap, session_cap_minutes,
  blocked_rec_categories, mandatory_rec_categories,
  ai_system_injection,
  evidence_source, evidence_grade
) VALUES (
  'Match Day Intensity Cap',
  'Match scheduled today. All non-match training capped at light — preserve neuromuscular freshness for competition.',
  'performance',
  9,
  true,
  '{"match": "all", "conditions": [{"field": "has_match_today", "operator": "eq", "value": true}]}',
  'light',
  30,
  ARRAY['strength_development', 'volume_accumulation'],
  ARRAY['activation', 'match_preparation'],
  'MATCH DAY:
The athlete has a match today. All non-match physical activity should be limited to light activation work: dynamic stretching, movement prep, brief neuromuscular activation sets. No gym sessions, no extra conditioning. Mental preparation is as important as physical — suggest pre-match visualisation and routine. Nutrition focus: easily digestible carbohydrates 2–3 hours before match, adequate hydration.',
  'Bishop 2003 (Warm-Up & Performance); Mujika & Padilla 2003',
  'A'
);

-- ── Protocol 21: PHV + Elevated ACWR Compound Risk ──────────────────────────
-- Currently hardcoded in loadWarningComputer.ts: mid_phv + ACWR > 1.2 → P1
-- This is a COMPOUND safety rule — the PHV stage lowers the ACWR danger threshold
INSERT INTO pd_protocols (
  name, description, category, priority, is_built_in, safety_critical,
  conditions,
  load_multiplier, intensity_cap,
  blocked_rec_categories, mandatory_rec_categories,
  priority_override, override_message,
  forced_rag_domains,
  ai_system_injection,
  phv_filter,
  evidence_source, evidence_grade
) VALUES (
  'PHV + ACWR Compound Risk',
  'Mid-PHV athlete with ACWR above 1.2 — this is a CRITICAL compound risk. Growth plate vulnerability combined with training spike requires immediate load reduction.',
  'safety',
  2,
  true,
  true,
  '{"match": "all", "conditions": [{"field": "phv_stage", "operator": "eq", "value": "mid"}, {"field": "acwr", "operator": "gte", "value": 1.2}]}',
  0.50,
  'light',
  ARRAY['max_strength', 'power_development', 'speed_development', 'volume_accumulation'],
  ARRAY['recovery', 'injury_prevention'],
  'P0',
  'Growth phase + training spike — your body needs protection right now. Light movement and recovery only.',
  ARRAY['phv_mid', 'load_management', 'injury_prevention'],
  'CRITICAL — PHV MID-STAGE + ELEVATED ACWR (≥ 1.2):
This is the MOST DANGEROUS combination in youth athletics. The athlete is in Peak Height Velocity mid-stage (growth plates maximally vulnerable) AND has an ACWR that would be safe for an adult but is DANGEROUS for a growing athlete. The threshold is 1.2, NOT 1.5 — growth phase demands a lower danger threshold. Immediate actions: 50% load cap, light intensity only, block ALL high-impact and power exercises. Communicate urgency without panic — explain that protecting their growth plates NOW enables elite performance LATER. This protocol takes absolute precedence over any other recommendation.',
  ARRAY['mid'],
  'Lloyd & Oliver 2012; Myer et al. 2011; Gabbett 2016',
  'A'
);

-- ── Protocol 22: Detraining Risk ────────────────────────────────────────────
-- Currently hardcoded: ACWR < 0.8 + days_since_session > 5 → P3
INSERT INTO pd_protocols (
  name, description, category, priority, is_built_in,
  conditions,
  mandatory_rec_categories,
  ai_system_injection,
  evidence_source, evidence_grade
) VALUES (
  'Detraining Risk',
  'ACWR below 0.8 and no training for 5+ days. The athlete risks losing fitness adaptations. Gentle re-engagement recommended.',
  'development',
  30,
  false,
  '{"match": "all", "conditions": [{"field": "acwr", "operator": "lt", "value": 0.8}, {"field": "days_since_last_session", "operator": "gte", "value": 5}]}',
  ARRAY['return_to_training', 'engagement'],
  'DETRAINING RISK (ACWR < 0.8, 5+ days inactive):
The athlete has been inactive for 5+ days and their ACWR is in the detraining zone. Fitness adaptations begin reversing after 5–7 days of inactivity. This is a re-engagement coaching moment, not a scolding opportunity. Suggest a light, enjoyable return session — something fun that reminds them why they train. Do NOT suggest jumping back to previous intensity — follow a 3-session progressive return: Day 1 light (50%), Day 2 moderate (70%), Day 3 normal. Ask what kept them away and address barriers.',
  'Mujika & Padilla 2000 (Detraining)',
  'B'
);

-- ── Protocol 23: High Soreness Alert ────────────────────────────────────────
-- Soreness ≥ 4 (out of 5) → reduce load, recommend recovery
INSERT INTO pd_protocols (
  name, description, category, priority, is_built_in,
  conditions,
  load_multiplier, intensity_cap,
  mandatory_rec_categories,
  ai_system_injection,
  evidence_source, evidence_grade
) VALUES (
  'High Soreness Alert',
  'Athlete reports soreness ≥ 4 out of 5. Delayed onset muscle soreness (DOMS) or accumulated fatigue. Reduce load and recommend active recovery.',
  'recovery',
  24,
  false,
  '{"match": "all", "conditions": [{"field": "soreness", "operator": "gte", "value": 4}]}',
  0.70,
  'moderate',
  ARRAY['recovery', 'mobility'],
  'HIGH SORENESS (≥ 4/5):
The athlete is reporting significant muscle soreness. This could be DOMS from recent training or accumulated fatigue. Reduce training load by 30% and focus on: light movement to promote blood flow, foam rolling, stretching, and adequate protein intake. If soreness persists beyond 72 hours, it may indicate inadequate recovery capacity — look at sleep and nutrition quality.',
  'Cheung et al. 2003 (DOMS); Dupuy et al. 2018 (Recovery Strategies)',
  'B'
);

-- ── Protocol 24: Pain Reported — Immediate Gate ─────────────────────────────
-- pain_flag = true → block all high-impact, recommend medical review
INSERT INTO pd_protocols (
  name, description, category, priority, is_built_in, safety_critical,
  conditions,
  load_multiplier, intensity_cap,
  contraindications,
  blocked_rec_categories, mandatory_rec_categories,
  priority_override, override_message,
  ai_system_injection,
  evidence_source, evidence_grade
) VALUES (
  'Pain Reported — Safety Gate',
  'Athlete has reported pain in their check-in. This is a hard safety gate — block high-impact exercises and recommend medical review.',
  'safety',
  3,
  true,
  true,
  '{"match": "all", "conditions": [{"field": "pain_flag", "operator": "eq", "value": true}]}',
  0.50,
  'light',
  ARRAY['barbell_back_squat', 'barbell_front_squat', 'depth_jumps', 'box_jumps', 'heavy_deadlift', 'power_clean', 'snatch', 'maximal_sprinting', 'plyometric_bounding'],
  ARRAY['strength_development', 'speed_development', 'power_development'],
  ARRAY['injury_prevention', 'recovery'],
  'P1',
  'You reported pain today. Let''s keep it light and safe — talk to your coach or physio if it persists.',
  'PAIN REPORTED — SAFETY GATE ACTIVE:
The athlete has flagged pain in their check-in. This is a NON-NEGOTIABLE safety gate. Do NOT recommend any exercise that could aggravate the pain. Block all high-impact and heavy loading exercises. Recommend: light movement that doesn''t involve the painful area, general mobility work, and — most importantly — encourage the athlete to communicate the pain to their coach, physio, or parent. If the athlete asks to train through the pain, firmly but kindly explain that training through pain risks turning a minor issue into a serious injury. Ask where the pain is and suggest safe alternatives that avoid that area.',
  'Sports Medicine Australia Youth Guidelines',
  'A'
);
