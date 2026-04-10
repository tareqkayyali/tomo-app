#!/usr/bin/env python3
"""
Tomo AI Service — Knowledge Graph Seed Script
Populates knowledge_entities + knowledge_relationships tables.

~83 entities across 7 types, ~130 relationships across 10 types.
Embeds all entity descriptions via Voyage AI (voyage-3-lite, 512-dim).

Usage:
  cd ai-service
  export $(grep -v '^#' .env | xargs)
  python -m scripts.seed_knowledge_graph

Requires:
  - Migration 040 applied (knowledge_entities + knowledge_relationships)
  - VOYAGE_API_KEY set
  - SUPABASE_DB_URL set
"""

from __future__ import annotations

import asyncio
import logging
import sys
import time
from pathlib import Path

# Add parent dir to path for imports
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db.supabase import init_db_pool, close_db_pool
from app.rag.embedder import embed_documents, close_client
from app.rag.graph_store import bulk_upsert_entities, bulk_upsert_relationships

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("seed_knowledge_graph")


# ══════════════════════════════════════════════════════════════════════════════
# ENTITY DEFINITIONS (~83 entities)
# ══════════════════════════════════════════════════════════════════════════════

ENTITIES: list[dict] = [
    # ── Conditions (15) ──────────────────────────────────────────────────
    {"entity_type": "condition", "name": "red_readiness", "display_name": "RED Readiness",
     "description": "RED readiness flag — athlete reports high soreness, poor sleep, low energy, or elevated stress. All high-intensity training must be replaced with active recovery or rest. Indicates potential overreaching or illness onset.",
     "properties": {"severity": "critical", "action": "block_high_intensity"}},

    {"entity_type": "condition", "name": "amber_readiness", "display_name": "AMBER Readiness",
     "description": "AMBER readiness — moderate concern. One or more readiness components below threshold. Training can proceed at reduced intensity (RPE 6-7 max). Monitor closely for decline to RED.",
     "properties": {"severity": "warning", "action": "reduce_intensity"}},

    {"entity_type": "condition", "name": "green_readiness", "display_name": "GREEN Readiness",
     "description": "GREEN readiness — all systems go. Sleep, energy, soreness, mood, and stress all within normal range. Full training and competition cleared.",
     "properties": {"severity": "normal", "action": "full_training"}},

    {"entity_type": "condition", "name": "high_acwr", "display_name": "High ACWR (>1.5)",
     "description": "Acute-to-Chronic Workload Ratio exceeding 1.5 — elevated injury risk zone. Training load has spiked relative to the 28-day chronic baseline. Requires immediate load management: deload or modified sessions.",
     "properties": {"threshold": 1.5, "risk": "elevated_injury"}},

    {"entity_type": "condition", "name": "critical_acwr", "display_name": "Critical ACWR (>2.0)",
     "description": "ACWR exceeding 2.0 — danger zone with very high injury probability. Immediate deload mandatory. No high-intensity or high-volume sessions until ACWR returns below 1.3.",
     "properties": {"threshold": 2.0, "risk": "very_high_injury"}},

    {"entity_type": "condition", "name": "pre_phv", "display_name": "Pre-PHV",
     "description": "Pre-Peak Height Velocity — athlete has not yet entered the growth spurt. Focus on fundamental movement skills, multi-sport participation, coordination, and fun. Avoid early specialization and heavy loading.",
     "properties": {"phv_stage": "PRE", "age_typical": "U13"}},

    {"entity_type": "condition", "name": "mid_phv", "display_name": "Mid-PHV (Peak Height Velocity)",
     "description": "Mid-PHV (CIRCA) — athlete is in their peak growth spurt. Growth plates are highly vulnerable. Contraindicated: heavy barbell squats, heavy deadlifts, Olympic lifts, depth jumps, maximal sprinting, 1RM testing. Loading must be reduced by 40% (0.6× multiplier). Focus on bodyweight, bands, and technique.",
     "properties": {"phv_stage": "CIRCA", "loading_multiplier": 0.6, "age_typical": "U13-U15"}},

    {"entity_type": "condition", "name": "post_phv", "display_name": "Post-PHV",
     "description": "Post-Peak Height Velocity — growth spurt has passed, athlete can progressively return to full loading. Gradual reintroduction of strength training, plyometrics, and sport-specific conditioning. Monitor for residual growth-related issues.",
     "properties": {"phv_stage": "POST", "age_typical": "U15-U17"}},

    {"entity_type": "condition", "name": "exam_period", "display_name": "Exam Period Active",
     "description": "Academic exam period — cognitive load is high, increasing total stress burden. Training volume should be reduced 30-40%. Prioritize short, high-quality sessions. Avoid new skill acquisition. Focus on maintenance and stress relief.",
     "properties": {"academic": True, "volume_reduction": 0.35}},

    {"entity_type": "condition", "name": "high_dual_load", "display_name": "High Dual Load (DLI >60)",
     "description": "Dual Load Index exceeding 60 — combined school + sport stress is dangerously high. Risk of burnout, illness, and underperformance. Must reduce one or both stressors immediately.",
     "properties": {"threshold": 60, "risk": "burnout"}},

    {"entity_type": "condition", "name": "match_day", "display_name": "Match Day",
     "description": "Competition day — all training should be match preparation only. No additional conditioning. Pre-match activation protocols apply. Post-match recovery begins immediately.",
     "properties": {"type": "competition"}},

    {"entity_type": "condition", "name": "match_plus_1", "display_name": "Match Day +1",
     "description": "Day after match — recovery priority. Active recovery only (pool, light walk, foam rolling). No high-intensity or high-volume training for 24-48h post-competition.",
     "properties": {"type": "recovery", "hours_post": 24}},

    {"entity_type": "condition", "name": "injured", "display_name": "Active Injury",
     "description": "Athlete has an active injury. All training must be modified around the injury. Consult medical professional. Do not train through pain. Return-to-play protocol required.",
     "properties": {"action": "medical_consult"}},

    {"entity_type": "condition", "name": "returning_from_injury", "display_name": "Returning from Injury",
     "description": "Athlete in return-to-play phase. Graduated loading protocol: 50% → 75% → 90% → 100% over 2-4 weeks. Monitor pain, swelling, and function at each stage.",
     "properties": {"action": "graduated_loading"}},

    {"entity_type": "condition", "name": "overtraining", "display_name": "Overtraining Syndrome",
     "description": "Chronic overtraining — persistent fatigue, declining performance, mood disturbance, elevated resting HR, suppressed HRV. Requires extended rest period (1-4 weeks). Medical evaluation recommended.",
     "properties": {"severity": "critical", "rest_weeks": "1-4"}},

    # ── Exercises (20) ───────────────────────────────────────────────────
    {"entity_type": "exercise", "name": "barbell_squat", "display_name": "Barbell Squat",
     "description": "Heavy barbell back squat — primary lower body compound lift. High axial loading through spine and lower extremities. Contraindicated during mid-PHV due to growth plate stress on femoral and tibial epiphyses.",
     "properties": {"muscle_groups": ["quadriceps", "glutes", "hamstrings"], "load_type": "heavy_axial"}},

    {"entity_type": "exercise", "name": "heavy_deadlift", "display_name": "Heavy Deadlift",
     "description": "Heavy conventional or sumo deadlift — maximal posterior chain loading. High spinal compression forces. Contraindicated during mid-PHV due to lumbar growth plate vulnerability.",
     "properties": {"muscle_groups": ["posterior_chain", "back"], "load_type": "heavy_axial"}},

    {"entity_type": "exercise", "name": "olympic_lifts", "display_name": "Olympic Lifts (Clean/Snatch)",
     "description": "Olympic weightlifting — clean, snatch, power clean. Ballistic heavy loading with high technical demand. Contraindicated during mid-PHV due to rapid force application on immature skeletal structures.",
     "properties": {"muscle_groups": ["full_body"], "load_type": "ballistic_heavy"}},

    {"entity_type": "exercise", "name": "depth_jumps", "display_name": "Plyometric Depth Jumps",
     "description": "High-impact plyometric depth jumps from elevated surface. Extreme ground reaction forces (5-7× body weight). Contraindicated during mid-PHV due to growth plate and tendon stress. One of the highest-risk exercises for growing athletes.",
     "properties": {"muscle_groups": ["lower_body"], "load_type": "high_impact_plyometric", "grf_multiplier": "5-7x"}},

    {"entity_type": "exercise", "name": "maximal_sprint", "display_name": "Maximal Sprint (100% effort)",
     "description": "Full-effort sprinting at 100% intensity. High hamstring strain risk and growth plate stress in immature athletes. Contraindicated during mid-PHV — use tempo runs (70-80%) as alternative.",
     "properties": {"intensity": "maximal", "risk": "hamstring_strain"}},

    {"entity_type": "exercise", "name": "one_rm_testing", "display_name": "1RM Testing",
     "description": "One-repetition maximum strength testing. Maximum load on a single lift. Contraindicated during mid-PHV and for athletes under U15. Use RPE-based or sub-maximal estimation instead.",
     "properties": {"intensity": "maximal", "load_type": "max_effort"}},

    {"entity_type": "exercise", "name": "hiit", "display_name": "High-Intensity Interval Training (HIIT)",
     "description": "High-intensity interval training — repeated bouts at 85-95% max HR with short recovery. Effective for cardiovascular and metabolic conditioning. Contraindicated when readiness is RED or ACWR is critical.",
     "properties": {"intensity": "high", "hr_zone": "85-95%"}},

    {"entity_type": "exercise", "name": "bodyweight_squat", "display_name": "Bodyweight Squat",
     "description": "Bodyweight or goblet squat — safe lower body strengthening without axial spinal loading. Appropriate for all PHV stages including mid-PHV. Focus on depth, alignment, and movement quality.",
     "properties": {"intensity": "low-moderate", "load_type": "bodyweight", "phv_safe": True}},

    {"entity_type": "exercise", "name": "band_resistance", "display_name": "Resistance Band Training",
     "description": "Resistance band exercises — accommodating resistance that reduces joint stress at end ranges. Safe for mid-PHV athletes. Builds strength without heavy axial loading.",
     "properties": {"intensity": "moderate", "load_type": "accommodating", "phv_safe": True}},

    {"entity_type": "exercise", "name": "medicine_ball_throws", "display_name": "Medicine Ball Throws",
     "description": "Medicine ball throws and slams — develops power and rotational strength with controlled loading. Safe alternative to Olympic lifts for mid-PHV athletes. Use age-appropriate ball weight (2-4kg).",
     "properties": {"intensity": "moderate", "load_type": "ballistic_light", "phv_safe": True}},

    {"entity_type": "exercise", "name": "low_box_step_ups", "display_name": "Low Box Step-Ups",
     "description": "Low-height box step-ups (15-30cm) — develops single-leg strength and balance without high-impact forces. Safe alternative to depth jumps for mid-PHV athletes.",
     "properties": {"intensity": "low-moderate", "load_type": "bodyweight", "phv_safe": True}},

    {"entity_type": "exercise", "name": "tempo_runs", "display_name": "Tempo Runs (70-80%)",
     "description": "Sub-maximal tempo running at 70-80% effort. Develops aerobic capacity and running mechanics without the hamstring strain risk of maximal sprinting. Safe for all PHV stages.",
     "properties": {"intensity": "moderate", "effort_pct": "70-80%", "phv_safe": True}},

    {"entity_type": "exercise", "name": "rpe_based_testing", "display_name": "RPE-Based Load Assessment",
     "description": "Sub-maximal strength assessment using Rate of Perceived Exertion (RPE) scales. Estimates max capacity without actually lifting maximal loads. Safe alternative to 1RM testing for youth athletes.",
     "properties": {"intensity": "moderate", "load_type": "sub_maximal", "phv_safe": True}},

    {"entity_type": "exercise", "name": "active_recovery_exercise", "display_name": "Active Recovery Movement",
     "description": "Light movement for recovery — walking, pool sessions, gentle cycling, yoga. HR stays below 60% max. Used on RED readiness days and post-match recovery. Essential for maintaining blood flow without adding training stress.",
     "properties": {"intensity": "very_low", "hr_zone": "<60%"}},

    {"entity_type": "exercise", "name": "agility_drills", "display_name": "Agility & Change of Direction",
     "description": "Agility ladders, cone drills, shuttle runs — develops neuromuscular coordination and change of direction speed. Sport-specific for football, padel, basketball, tennis.",
     "properties": {"intensity": "moderate-high", "skill_type": "neuromuscular"}},

    {"entity_type": "exercise", "name": "plyometrics_low", "display_name": "Low-Impact Plyometrics",
     "description": "Low-impact plyometrics — ankle hops, skipping, bounding at moderate intensity. Develops reactive strength without the extreme ground reaction forces of depth jumps. Safe for mid-PHV with technique focus.",
     "properties": {"intensity": "moderate", "load_type": "low_impact_plyometric", "phv_safe": True}},

    {"entity_type": "exercise", "name": "isometric_holds", "display_name": "Isometric Holds",
     "description": "Static strength positions (wall sit, plank, single-leg hold). Builds strength without joint movement — very safe for all PHV stages. Develops tendon resilience and neuromuscular control.",
     "properties": {"intensity": "moderate", "load_type": "isometric", "phv_safe": True}},

    {"entity_type": "exercise", "name": "foam_rolling", "display_name": "Foam Rolling / SMR",
     "description": "Self-myofascial release using foam rollers — reduces DOMS, improves range of motion, supports recovery. Can be done daily. Part of the warm-up or cool-down routine.",
     "properties": {"intensity": "recovery", "type": "mobility"}},

    {"entity_type": "exercise", "name": "flexibility_stretching", "display_name": "Flexibility & Stretching",
     "description": "Static and dynamic stretching, mobility work, yoga-based movements. Essential during mid-PHV when muscle tightness increases due to rapid bone growth outpacing muscle lengthening.",
     "properties": {"intensity": "low", "type": "mobility"}},

    # ── Protocols (15) ───────────────────────────────────────────────────
    {"entity_type": "protocol", "name": "deload_week", "display_name": "Deload Week",
     "description": "Planned recovery week with 40-60% reduction in training volume and intensity. Essential after 3-4 weeks of progressive overload or when ACWR exceeds 1.5. Maintains fitness while allowing adaptation.",
     "properties": {"duration_days": 7, "volume_reduction": 0.5, "evidence_grade": "A"}},

    {"entity_type": "protocol", "name": "active_recovery_protocol", "display_name": "Active Recovery Protocol",
     "description": "Structured recovery session: light cardio (15min), foam rolling (10min), stretching (10min), meditation (5min). Used on RED readiness days and post-match. HR stays below 60% max throughout.",
     "properties": {"duration_min": 40, "hr_max_pct": 60, "evidence_grade": "A"}},

    {"entity_type": "protocol", "name": "progressive_overload", "display_name": "Progressive Overload",
     "description": "Systematic increase of training stimulus over time — 5-10% volume increase per week maximum. Foundational principle of strength and conditioning. Requires GREEN readiness and ACWR below 1.3.",
     "properties": {"weekly_increase_pct": "5-10", "evidence_grade": "A"}},

    {"entity_type": "protocol", "name": "return_to_play", "display_name": "Return-to-Play Protocol",
     "description": "Graduated return from injury: Stage 1 (pain-free ROM) → Stage 2 (light loading 50%) → Stage 3 (moderate 75%) → Stage 4 (full training 90%) → Stage 5 (competition 100%). Each stage minimum 3 days. Regression if pain returns.",
     "properties": {"stages": 5, "min_days_per_stage": 3, "evidence_grade": "A"}},

    {"entity_type": "protocol", "name": "pre_season_loading", "display_name": "Pre-Season Loading Framework",
     "description": "8-12 week pre-season preparation: Phase 1 (base fitness, 2-3 weeks) → Phase 2 (sport-specific conditioning, 3-4 weeks) → Phase 3 (competition readiness, 2-3 weeks). Progressive increase in intensity and sport-specific volume.",
     "properties": {"duration_weeks": "8-12", "phases": 3, "evidence_grade": "A"}},

    {"entity_type": "protocol", "name": "in_season_maintenance", "display_name": "In-Season Maintenance",
     "description": "Maintenance training during competitive season — 2 sessions/week, reduced volume (60-70% of pre-season), maintain strength and power. Prioritize recovery around match days.",
     "properties": {"sessions_per_week": 2, "volume_pct": "60-70", "evidence_grade": "B+"}},

    {"entity_type": "protocol", "name": "sleep_hygiene", "display_name": "Sleep Hygiene Protocol",
     "description": "Optimize sleep for youth athletes: 8-10 hours for U13-U17, consistent bed/wake times, no screens 1hr before bed, cool dark room, avoid caffeine after 2pm. Sleep quality directly impacts HRV, recovery, and cognitive function.",
     "properties": {"hours_target": "8-10", "evidence_grade": "A"}},

    {"entity_type": "protocol", "name": "hydration_protocol", "display_name": "Hydration Protocol",
     "description": "Pre-training: 500ml water 2hr before. During: 150-250ml every 15-20min. Post: replace 150% of fluid lost. Add electrolytes for sessions >60min or in heat. Dehydration of 2%+ impairs performance by 10-20%.",
     "properties": {"pre_ml": 500, "during_ml_per_20min": "150-250", "evidence_grade": "A"}},

    {"entity_type": "protocol", "name": "nutrition_timing", "display_name": "Nutrition Timing Protocol",
     "description": "Pre-training (2-3hr): complex carbs + moderate protein. During (>60min): simple carbs + fluids. Post (within 30min): protein (20-30g) + carbs (1g/kg). Recovery window is critical for muscle repair and glycogen replenishment.",
     "properties": {"post_protein_g": "20-30", "evidence_grade": "A"}},

    {"entity_type": "protocol", "name": "cold_water_immersion", "display_name": "Cold Water Immersion (CWI)",
     "description": "Post-exercise cold water immersion at 10-15°C for 10-15 minutes. Reduces DOMS and perceived fatigue. Most effective within 1hr post-exercise. Not recommended during strength adaptation phases (may blunt hypertrophy signaling).",
     "properties": {"temp_c": "10-15", "duration_min": "10-15", "evidence_grade": "A"}},

    {"entity_type": "protocol", "name": "exam_period_modification", "display_name": "Exam Period Training Modification",
     "description": "Training modifications during exams: reduce volume 30-40%, maintain intensity for short sessions (30-45min), prioritize stress relief activities, no new skill learning, focus on maintenance and enjoyment.",
     "properties": {"volume_reduction": 0.35, "max_session_min": 45, "evidence_grade": "B"}},

    {"entity_type": "protocol", "name": "match_day_preparation", "display_name": "Match Day Preparation",
     "description": "Match day protocol: light activation (15-20min), dynamic stretching, sport-specific warm-up, tactical review. No fatiguing exercises. Pre-match meal 3-4hr before. Hydration from morning.",
     "properties": {"activation_min": "15-20", "evidence_grade": "A"}},

    {"entity_type": "protocol", "name": "post_match_recovery", "display_name": "Post-Match Recovery (24-72h)",
     "description": "Post-match recovery timeline: 0-2h (nutrition + hydration), 2-12h (sleep priority), 24h (active recovery only), 48h (light training OK), 72h (full training if GREEN). Cold water immersion optional within 1hr.",
     "properties": {"full_return_hours": 72, "evidence_grade": "A"}},

    {"entity_type": "protocol", "name": "phv_training_modification", "display_name": "PHV Training Modification",
     "description": "Training modifications for mid-PHV athletes: 40% load reduction (0.6× multiplier), no heavy axial loading, no maximal effort, focus on bodyweight + technique, extra flexibility work, reduced plyometric volume, monitor growth rate monthly.",
     "properties": {"load_multiplier": 0.6, "evidence_grade": "A"}},

    {"entity_type": "protocol", "name": "cns_recovery", "display_name": "CNS Recovery Protocol",
     "description": "Central nervous system recovery between high-intensity sessions: minimum 48-72h between maximal sprint/power sessions, ensure adequate sleep (8-10h), manage total training stress, include parasympathetic activities (breathing, meditation).",
     "properties": {"min_recovery_hours": 48, "evidence_grade": "B+"}},

    # ── Concepts (15) ────────────────────────────────────────────────────
    {"entity_type": "concept", "name": "acwr", "display_name": "Acute:Chronic Workload Ratio (ACWR)",
     "description": "Ratio of acute (7-day) to chronic (28-day) training load. Sweet spot: 0.8-1.3. Above 1.5 = elevated injury risk. Above 2.0 = danger zone. Used to guide load progression and detect spikes. Foundation of training load management.",
     "properties": {"sweet_spot": "0.8-1.3", "evidence_grade": "A"}},

    {"entity_type": "concept", "name": "hrv", "display_name": "Heart Rate Variability (HRV)",
     "description": "Variation in time between heartbeats — reflects autonomic nervous system balance. Higher HRV = better recovery and readiness. Suppressed HRV (>15% below baseline) indicates incomplete recovery or overreaching. Best measured morning, supine.",
     "properties": {"measurement": "morning_supine", "evidence_grade": "A"}},

    {"entity_type": "concept", "name": "phv", "display_name": "Peak Height Velocity (PHV)",
     "description": "Period of maximum growth rate during adolescence, typically age 12-14 for boys, 10-12 for girls. Growth plates are most vulnerable during this period. Training must be modified to protect immature skeletal structures while maintaining fitness.",
     "properties": {"boys_age": "12-14", "girls_age": "10-12", "evidence_grade": "A"}},

    {"entity_type": "concept", "name": "maturity_offset", "display_name": "Maturity Offset",
     "description": "Years before or after PHV, calculated using the Mirwald equation (height, weight, sitting height, leg length, age). Negative = pre-PHV, 0 = at PHV, positive = post-PHV. Determines training modifications and growth plate risk.",
     "properties": {"method": "mirwald_equation", "evidence_grade": "A"}},

    {"entity_type": "concept", "name": "periodization", "display_name": "Periodization",
     "description": "Systematic planning of training cycles — macro (year), meso (4-6 weeks), micro (weekly). Balances stress and recovery to optimize adaptation. Key for injury prevention and long-term athlete development.",
     "properties": {"evidence_grade": "A"}},

    {"entity_type": "concept", "name": "dual_load", "display_name": "Dual Load (Academic + Athletic)",
     "description": "Combined stress from school/academic demands and athletic training. Unique to youth athletes. High dual load increases fatigue, illness risk, and burnout. Must be managed — especially during exam periods.",
     "properties": {"evidence_grade": "B+"}},

    {"entity_type": "concept", "name": "speed_window", "display_name": "Speed Development Window",
     "description": "Sensitive period for speed development in youth athletes — typically U13-U15. Neural adaptations are prioritized: reaction time, coordination, stride frequency. Training during this window produces lasting gains that are harder to achieve later.",
     "properties": {"age_range": "U13-U15", "evidence_grade": "B+"}},

    {"entity_type": "concept", "name": "strength_window", "display_name": "Strength Development Window",
     "description": "Optimal period for strength development — post-PHV (U15-U17). Hormonal changes support muscle hypertrophy. Progressive overload can be introduced safely. Pre-PHV athletes should focus on bodyweight and movement quality.",
     "properties": {"age_range": "U15-U17", "evidence_grade": "B+"}},

    {"entity_type": "concept", "name": "growth_plate_stress", "display_name": "Growth Plate Stress & Apophysitis",
     "description": "Stress on open growth plates (epiphyseal/apophyseal) in growing athletes. Risk of Osgood-Schlatter, Sever's disease, and traction apophysitis. Highest risk during mid-PHV with repetitive loading. Requires load modification.",
     "properties": {"conditions": ["osgood_schlatter", "severs_disease"], "evidence_grade": "A"}},

    {"entity_type": "concept", "name": "self_determination_theory", "display_name": "Self-Determination Theory (SDT)",
     "description": "Motivation framework — three basic needs: Autonomy (choice in training), Competence (feeling of improvement), Relatedness (belonging to team). Supporting these needs increases intrinsic motivation and long-term engagement in youth athletes.",
     "properties": {"needs": ["autonomy", "competence", "relatedness"], "evidence_grade": "A"}},

    {"entity_type": "concept", "name": "streak_psychology", "display_name": "Streak Psychology & Habit Formation",
     "description": "Behavioral science of habit formation through streaks and consistency. 21-66 days to form a habit. Visual streak tracking increases adherence by 30-40%. Loss aversion (not wanting to break streak) is a powerful motivator for youth athletes.",
     "properties": {"habit_days": "21-66", "evidence_grade": "B"}},

    {"entity_type": "concept", "name": "relative_energy_deficiency", "display_name": "Relative Energy Deficiency (RED-S)",
     "description": "Insufficient energy intake relative to exercise expenditure. Impacts bone health, hormonal function, immunity, and performance. Especially concerning in youth athletes during growth periods. Screen for underfueling in athletes with declining performance.",
     "properties": {"evidence_grade": "A"}},

    {"entity_type": "concept", "name": "cns_fatigue", "display_name": "Central Nervous System Fatigue",
     "description": "Fatigue of the central nervous system from high-intensity, maximal-effort activities (sprinting, heavy lifting, plyometrics). Requires 48-72h recovery. Cannot be trained through — attempting to do so leads to poor movement quality and injury risk.",
     "properties": {"recovery_hours": "48-72", "evidence_grade": "B+"}},

    {"entity_type": "concept", "name": "doms", "display_name": "Delayed Onset Muscle Soreness (DOMS)",
     "description": "Muscle soreness appearing 24-72h after training, especially with eccentric loading or novel exercises. Not an indicator of training quality. Active recovery can help manage symptoms. Severe DOMS may indicate excessive training stimulus.",
     "properties": {"onset_hours": "24-72", "evidence_grade": "A"}},

    {"entity_type": "concept", "name": "talent_identification", "display_name": "Talent Identification & Benchmarking",
     "description": "Objective performance benchmarking against age-group norms — sprint times, vertical jump, agility, endurance. Used for scouting, selection, and development tracking. Percentile-based comparison accounts for biological maturation differences.",
     "properties": {"evidence_grade": "B"}},

    # ── Sports (5) ───────────────────────────────────────────────────────
    {"entity_type": "sport", "name": "football", "display_name": "Football (Soccer)",
     "description": "Multi-directional field sport requiring endurance, speed, agility, strength, and technical skill. Positions: GK, CB, FB, CM, CAM, ST. High match load (10-13km/game). Specific injury risks: ACL, hamstring, ankle.",
     "properties": {"positions": ["GK", "CB", "FB", "CM", "CAM", "ST"]}},

    {"entity_type": "sport", "name": "padel", "display_name": "Padel",
     "description": "Racket sport played in enclosed court with glass walls. High demand on wrist, shoulder, and lateral movement. Tournament format creates high match density. Specific risks: wrist overuse, shoulder impingement, lateral ankle sprains.",
     "properties": {"positions": ["all"]}},

    {"entity_type": "sport", "name": "athletics", "display_name": "Athletics (Track & Field)",
     "description": "Individual sport — sprints, middle distance, throws, jumps. CNS-intensive for sprinters. Periodized year with clear competition peaks. Specific risks: hamstring (sprints), stress fractures (distance), growth plate (throws).",
     "properties": {"events": ["sprints", "middle_distance", "throws", "jumps"]}},

    {"entity_type": "sport", "name": "basketball", "display_name": "Basketball",
     "description": "Court sport with high vertical jump demands, change of direction, and running volume. Position-specific conditioning (guards vs forwards vs centers). Specific risks: ankle sprains, ACL, patellar tendinopathy.",
     "properties": {"positions": ["guard", "forward", "center"]}},

    {"entity_type": "sport", "name": "tennis", "display_name": "Tennis",
     "description": "Racket sport with high serve velocity demands, lateral movement, and match endurance. Tournament format creates high match density. Specific risks: wrist/elbow overuse (tennis elbow), shoulder, lateral movement injuries.",
     "properties": {"positions": ["all"]}},

    # ── Age Bands (5) ────────────────────────────────────────────────────
    {"entity_type": "age_band", "name": "u13", "display_name": "U13 (Under 13)",
     "description": "Athletes under 13 — foundational development phase. Multi-sport participation recommended. Focus on fun, movement literacy, coordination, and basic physical literacy. Avoid early specialization. PHV may be starting for early maturers.",
     "properties": {"age_range": "10-12", "focus": "movement_literacy"}},

    {"entity_type": "age_band", "name": "u15", "display_name": "U15 (Under 15)",
     "description": "Athletes 13-14 — peak growth spurt for many. PHV most likely occurring. Begin sport specialization gradually. Introduce basic strength training (bodyweight first). Monitor growth rate and adjust loading.",
     "properties": {"age_range": "13-14", "focus": "specialization_transition"}},

    {"entity_type": "age_band", "name": "u17", "display_name": "U17 (Under 17)",
     "description": "Athletes 15-16 — post-PHV for most. Can begin progressive strength training. Competition becomes more structured. Mental performance skills become important. Academic dual load management critical.",
     "properties": {"age_range": "15-16", "focus": "competition_preparation"}},

    {"entity_type": "age_band", "name": "u19", "display_name": "U19 (Under 19)",
     "description": "Athletes 17-18 — transition to senior training. Full strength and conditioning programs. Recruitment/showcase preparation. Career pathway decisions. High dual load (exams + competition).",
     "properties": {"age_range": "17-18", "focus": "senior_transition"}},

    {"entity_type": "age_band", "name": "adult", "display_name": "Adult (19+)",
     "description": "Senior athletes — full training capacity. Professional-level periodization. Injury prevention focus shifts to chronic overuse management. Recovery becomes increasingly important with training age.",
     "properties": {"age_range": "19+", "focus": "peak_performance"}},

    # ── Body Regions (7) ─────────────────────────────────────────────────
    {"entity_type": "body_region", "name": "knee", "display_name": "Knee",
     "description": "Knee joint — high injury risk in youth athletes. Osgood-Schlatter disease during PHV. ACL risk in multi-directional sports. Patellar tendinopathy from jumping sports. Quadriceps/hamstring strength ratio critical for protection.",
     "properties": {"common_injuries": ["osgood_schlatter", "acl", "patellar_tendinopathy"]}},

    {"entity_type": "body_region", "name": "ankle", "display_name": "Ankle",
     "description": "Ankle joint — most common injury site in youth sport. Lateral sprains from change of direction. Growth plate fractures (Salter-Harris) in immature athletes. Proprioceptive training reduces injury risk by 40-50%.",
     "properties": {"common_injuries": ["lateral_sprain", "growth_plate_fracture"]}},

    {"entity_type": "body_region", "name": "growth_plate", "display_name": "Growth Plates (Epiphyseal)",
     "description": "Epiphyseal growth plates — areas of developing cartilage at the ends of long bones. Open until skeletal maturity (16-18 years). Weakest link in the musculoskeletal chain during growth. Vulnerable to overuse, repetitive loading, and acute trauma.",
     "properties": {"closure_age": "16-18", "vulnerability": "mid_phv"}},

    {"entity_type": "body_region", "name": "wrist", "display_name": "Wrist",
     "description": "Wrist joint — high stress in racket sports (padel, tennis) and gymnastics. Distal radial growth plate at risk in growing athletes. Overuse can lead to stress reactions. Grip strength and forearm conditioning are protective.",
     "properties": {"common_injuries": ["stress_reaction", "overuse"]}},

    {"entity_type": "body_region", "name": "shoulder", "display_name": "Shoulder",
     "description": "Shoulder complex — high injury risk in overhead and throwing sports. Rotator cuff overuse, impingement, and instability. Youth athletes at risk of proximal humeral epiphysitis (Little League shoulder). Load management is critical.",
     "properties": {"common_injuries": ["rotator_cuff", "impingement", "instability"]}},

    {"entity_type": "body_region", "name": "spine", "display_name": "Spine (Lumbar/Thoracic)",
     "description": "Spinal column — axial loading during heavy lifts stresses vertebral growth plates and intervertebral discs. Spondylolysis risk in extension-based sports (gymnastics, cricket). Avoid heavy axial loading during mid-PHV.",
     "properties": {"common_injuries": ["spondylolysis", "disc_stress"]}},

    {"entity_type": "body_region", "name": "hip", "display_name": "Hip",
     "description": "Hip joint — femoroacetabular impingement risk in athletes with high kicking/squatting demands. Apophysitis of the iliac crest and ischial tuberosity during growth. Hip flexor tightness common during rapid growth periods.",
     "properties": {"common_injuries": ["fai", "apophysitis", "flexor_tightness"]}},
]


# ══════════════════════════════════════════════════════════════════════════════
# RELATIONSHIP DEFINITIONS (~130 relationships)
# ══════════════════════════════════════════════════════════════════════════════

RELATIONSHIPS: list[dict] = [
    # ── PHV Contraindication Chain (THE GATE REQUIREMENT) ────────────────
    {"source": "mid_phv", "target": "barbell_squat", "type": "CONTRAINDICATED_FOR", "weight": 1.0,
     "properties": {"reason": "Heavy axial loading on immature growth plates", "evidence_grade": "A"}},
    {"source": "mid_phv", "target": "heavy_deadlift", "type": "CONTRAINDICATED_FOR", "weight": 1.0,
     "properties": {"reason": "Spinal compression on lumbar growth plates", "evidence_grade": "A"}},
    {"source": "mid_phv", "target": "olympic_lifts", "type": "CONTRAINDICATED_FOR", "weight": 1.0,
     "properties": {"reason": "Ballistic heavy loading on immature skeleton", "evidence_grade": "A"}},
    {"source": "mid_phv", "target": "depth_jumps", "type": "CONTRAINDICATED_FOR", "weight": 1.0,
     "properties": {"reason": "Extreme ground reaction forces (5-7× BW) on growth plates", "evidence_grade": "A"}},
    {"source": "mid_phv", "target": "maximal_sprint", "type": "CONTRAINDICATED_FOR", "weight": 1.0,
     "properties": {"reason": "Hamstring strain risk + growth plate stress at max effort", "evidence_grade": "A"}},
    {"source": "mid_phv", "target": "one_rm_testing", "type": "CONTRAINDICATED_FOR", "weight": 1.0,
     "properties": {"reason": "Maximum load on single lift — extreme growth plate risk", "evidence_grade": "A"}},

    # ── Safe Alternatives (reverse direction: alternative → SAFE_ALTERNATIVE_TO → risky exercise)
    {"source": "bodyweight_squat", "target": "barbell_squat", "type": "SAFE_ALTERNATIVE_TO", "weight": 0.9,
     "properties": {"context": "PHV-safe lower body strength without axial loading"}},
    {"source": "band_resistance", "target": "heavy_deadlift", "type": "SAFE_ALTERNATIVE_TO", "weight": 0.9,
     "properties": {"context": "Accommodating resistance reduces joint stress"}},
    {"source": "medicine_ball_throws", "target": "olympic_lifts", "type": "SAFE_ALTERNATIVE_TO", "weight": 0.9,
     "properties": {"context": "Develops power without heavy ballistic loading"}},
    {"source": "low_box_step_ups", "target": "depth_jumps", "type": "SAFE_ALTERNATIVE_TO", "weight": 0.9,
     "properties": {"context": "Single-leg strength without high-impact forces"}},
    {"source": "tempo_runs", "target": "maximal_sprint", "type": "SAFE_ALTERNATIVE_TO", "weight": 0.9,
     "properties": {"context": "Sub-maximal running maintains fitness safely"}},
    {"source": "rpe_based_testing", "target": "one_rm_testing", "type": "SAFE_ALTERNATIVE_TO", "weight": 0.9,
     "properties": {"context": "Estimates max without lifting maximal loads"}},

    # ── PHV → Body Region effects ──
    {"source": "mid_phv", "target": "growth_plate", "type": "AFFECTS", "weight": 1.0,
     "properties": {"mechanism": "Growth plates are weakest link during rapid growth"}},
    {"source": "mid_phv", "target": "knee", "type": "AFFECTS", "weight": 0.9,
     "properties": {"mechanism": "Osgood-Schlatter risk, tibial tuberosity apophysitis"}},
    {"source": "mid_phv", "target": "spine", "type": "AFFECTS", "weight": 0.9,
     "properties": {"mechanism": "Vertebral growth plates vulnerable to axial loading"}},
    {"source": "mid_phv", "target": "hip", "type": "AFFECTS", "weight": 0.8,
     "properties": {"mechanism": "Iliac crest and ischial apophysitis risk"}},

    # ── Readiness Contraindications ──
    {"source": "red_readiness", "target": "hiit", "type": "CONTRAINDICATED_FOR", "weight": 1.0,
     "properties": {"reason": "High-intensity training with compromised recovery state"}},
    {"source": "red_readiness", "target": "maximal_sprint", "type": "CONTRAINDICATED_FOR", "weight": 1.0,
     "properties": {"reason": "Max effort with poor readiness = injury risk"}},
    {"source": "red_readiness", "target": "one_rm_testing", "type": "CONTRAINDICATED_FOR", "weight": 1.0,
     "properties": {"reason": "Maximal loading with compromised recovery"}},

    # ── Readiness Recommendations ──
    {"source": "active_recovery_protocol", "target": "red_readiness", "type": "RECOMMENDED_FOR", "weight": 1.0,
     "properties": {"evidence_grade": "A"}},
    {"source": "sleep_hygiene", "target": "red_readiness", "type": "RECOMMENDED_FOR", "weight": 0.9,
     "properties": {"evidence_grade": "A"}},
    {"source": "deload_week", "target": "amber_readiness", "type": "RECOMMENDED_FOR", "weight": 0.8,
     "properties": {"evidence_grade": "B+"}},
    {"source": "progressive_overload", "target": "green_readiness", "type": "RECOMMENDED_FOR", "weight": 0.7,
     "properties": {"evidence_grade": "A"}},

    # ── ACWR relationships ──
    {"source": "high_acwr", "target": "overtraining", "type": "TRIGGERS", "weight": 0.8,
     "properties": {"mechanism": "Sustained high ACWR leads to chronic overreaching"}},
    {"source": "critical_acwr", "target": "injured", "type": "TRIGGERS", "weight": 0.9,
     "properties": {"mechanism": "Very high load spikes dramatically increase injury probability"}},
    {"source": "deload_week", "target": "high_acwr", "type": "RECOMMENDED_FOR", "weight": 1.0,
     "properties": {"evidence_grade": "A"}},
    {"source": "deload_week", "target": "critical_acwr", "type": "RECOMMENDED_FOR", "weight": 1.0,
     "properties": {"evidence_grade": "A"}},
    {"source": "critical_acwr", "target": "hiit", "type": "CONTRAINDICATED_FOR", "weight": 1.0,
     "properties": {"reason": "Any high-intensity training in danger zone"}},
    {"source": "critical_acwr", "target": "maximal_sprint", "type": "CONTRAINDICATED_FOR", "weight": 1.0,
     "properties": {"reason": "Maximal effort with critically high training load"}},

    # ── Protocol → Condition recommendations ──
    {"source": "return_to_play", "target": "returning_from_injury", "type": "RECOMMENDED_FOR", "weight": 1.0},
    {"source": "exam_period_modification", "target": "exam_period", "type": "RECOMMENDED_FOR", "weight": 1.0},
    {"source": "match_day_preparation", "target": "match_day", "type": "RECOMMENDED_FOR", "weight": 1.0},
    {"source": "post_match_recovery", "target": "match_plus_1", "type": "RECOMMENDED_FOR", "weight": 1.0},
    {"source": "phv_training_modification", "target": "mid_phv", "type": "RECOMMENDED_FOR", "weight": 1.0},
    {"source": "cold_water_immersion", "target": "match_plus_1", "type": "RECOMMENDED_FOR", "weight": 0.8},
    {"source": "active_recovery_protocol", "target": "match_plus_1", "type": "RECOMMENDED_FOR", "weight": 0.9},
    {"source": "hydration_protocol", "target": "match_day", "type": "RECOMMENDED_FOR", "weight": 0.9},
    {"source": "nutrition_timing", "target": "match_day", "type": "RECOMMENDED_FOR", "weight": 0.9},
    {"source": "cns_recovery", "target": "overtraining", "type": "RECOMMENDED_FOR", "weight": 0.9},

    # ── Concept → Protocol evidence ──
    {"source": "periodization", "target": "pre_season_loading", "type": "EVIDENCE_SUPPORTS", "weight": 0.9},
    {"source": "periodization", "target": "in_season_maintenance", "type": "EVIDENCE_SUPPORTS", "weight": 0.9},
    {"source": "periodization", "target": "deload_week", "type": "EVIDENCE_SUPPORTS", "weight": 0.9},
    {"source": "hrv", "target": "active_recovery_protocol", "type": "EVIDENCE_SUPPORTS", "weight": 0.8,
     "properties": {"mechanism": "HRV suppression guides recovery decisions"}},
    {"source": "acwr", "target": "deload_week", "type": "EVIDENCE_SUPPORTS", "weight": 0.9},
    {"source": "acwr", "target": "progressive_overload", "type": "EVIDENCE_SUPPORTS", "weight": 0.8},
    {"source": "cns_fatigue", "target": "cns_recovery", "type": "EVIDENCE_SUPPORTS", "weight": 0.9},
    {"source": "dual_load", "target": "exam_period_modification", "type": "EVIDENCE_SUPPORTS", "weight": 0.9},
    {"source": "phv", "target": "phv_training_modification", "type": "EVIDENCE_SUPPORTS", "weight": 1.0},
    {"source": "growth_plate_stress", "target": "phv_training_modification", "type": "EVIDENCE_SUPPORTS", "weight": 1.0},
    {"source": "self_determination_theory", "target": "progressive_overload", "type": "EVIDENCE_SUPPORTS", "weight": 0.6,
     "properties": {"mechanism": "Competence need — visible progress increases motivation"}},
    {"source": "relative_energy_deficiency", "target": "nutrition_timing", "type": "EVIDENCE_SUPPORTS", "weight": 0.8},

    # ── Condition chains (TRIGGERS) ──
    {"source": "exam_period", "target": "high_dual_load", "type": "TRIGGERS", "weight": 0.8,
     "properties": {"mechanism": "Exam stress adds to total athlete load"}},
    {"source": "high_dual_load", "target": "red_readiness", "type": "TRIGGERS", "weight": 0.7,
     "properties": {"mechanism": "Excessive combined stress overwhelms recovery capacity"}},
    {"source": "overtraining", "target": "injured", "type": "TRIGGERS", "weight": 0.8,
     "properties": {"mechanism": "Chronic overreaching compromises tissue integrity"}},
    {"source": "mid_phv", "target": "growth_plate_stress", "type": "TRIGGERS", "weight": 0.9,
     "properties": {"mechanism": "Rapid bone growth outpaces muscle/tendon adaptation"}},
    {"source": "injured", "target": "returning_from_injury", "type": "TRIGGERS", "weight": 0.7,
     "properties": {"mechanism": "Injury resolves → return-to-play phase begins"}},

    # ── Concept hierarchy (PART_OF) ──
    {"source": "maturity_offset", "target": "phv", "type": "PART_OF", "weight": 0.9},
    {"source": "acwr", "target": "periodization", "type": "PART_OF", "weight": 0.8},
    {"source": "growth_plate_stress", "target": "phv", "type": "PART_OF", "weight": 0.9},
    {"source": "doms", "target": "cns_fatigue", "type": "PART_OF", "weight": 0.5,
     "properties": {"note": "DOMS is peripheral, CNS fatigue is central — related but distinct"}},
    {"source": "streak_psychology", "target": "self_determination_theory", "type": "PART_OF", "weight": 0.6},
    {"source": "talent_identification", "target": "periodization", "type": "PART_OF", "weight": 0.5},

    # ── Protocol prerequisites ──
    {"source": "progressive_overload", "target": "pre_season_loading", "type": "PREREQUISITE_FOR", "weight": 0.7,
     "properties": {"note": "Base strength needed before pre-season loading ramp"}},
    {"source": "return_to_play", "target": "progressive_overload", "type": "PREREQUISITE_FOR", "weight": 0.8,
     "properties": {"note": "Must complete RTP before returning to progressive loading"}},

    # ── PHV → Age Band applicability ──
    {"source": "phv_training_modification", "target": "u13", "type": "APPLICABLE_TO", "weight": 0.7},
    {"source": "phv_training_modification", "target": "u15", "type": "APPLICABLE_TO", "weight": 1.0},
    {"source": "progressive_overload", "target": "u17", "type": "APPLICABLE_TO", "weight": 0.9},
    {"source": "progressive_overload", "target": "u19", "type": "APPLICABLE_TO", "weight": 1.0},
    {"source": "progressive_overload", "target": "adult", "type": "APPLICABLE_TO", "weight": 1.0},
    {"source": "pre_season_loading", "target": "u17", "type": "APPLICABLE_TO", "weight": 0.9},
    {"source": "pre_season_loading", "target": "u19", "type": "APPLICABLE_TO", "weight": 1.0},

    # ── Exercise → Sport associations ──
    {"source": "agility_drills", "target": "football", "type": "BELONGS_TO", "weight": 0.9},
    {"source": "agility_drills", "target": "basketball", "type": "BELONGS_TO", "weight": 0.9},
    {"source": "agility_drills", "target": "tennis", "type": "BELONGS_TO", "weight": 0.8},
    {"source": "agility_drills", "target": "padel", "type": "BELONGS_TO", "weight": 0.8},
    {"source": "tempo_runs", "target": "athletics", "type": "BELONGS_TO", "weight": 1.0},
    {"source": "tempo_runs", "target": "football", "type": "BELONGS_TO", "weight": 0.7},

    # ── Body region vulnerabilities ──
    {"source": "growth_plate_stress", "target": "knee", "type": "AFFECTS", "weight": 0.9,
     "properties": {"mechanism": "Osgood-Schlatter at tibial tuberosity"}},
    {"source": "growth_plate_stress", "target": "ankle", "type": "AFFECTS", "weight": 0.8,
     "properties": {"mechanism": "Sever's disease at calcaneal apophysis"}},
    {"source": "growth_plate_stress", "target": "spine", "type": "AFFECTS", "weight": 0.8,
     "properties": {"mechanism": "Vertebral ring apophysis stress"}},
    {"source": "growth_plate_stress", "target": "hip", "type": "AFFECTS", "weight": 0.7,
     "properties": {"mechanism": "Iliac crest apophysitis"}},

    # ── Concept → Body region ──
    {"source": "relative_energy_deficiency", "target": "growth_plate", "type": "AFFECTS", "weight": 0.8,
     "properties": {"mechanism": "Underfueling impairs bone mineralization during growth"}},

    # ── Additional exercise → PHV safe alternatives for completeness ──
    {"source": "plyometrics_low", "target": "depth_jumps", "type": "SAFE_ALTERNATIVE_TO", "weight": 0.8,
     "properties": {"context": "Low-impact plyometrics maintain reactive strength safely"}},
    {"source": "isometric_holds", "target": "barbell_squat", "type": "SAFE_ALTERNATIVE_TO", "weight": 0.7,
     "properties": {"context": "Static holds build strength without dynamic axial loading"}},
    {"source": "flexibility_stretching", "target": "foam_rolling", "type": "SAFE_ALTERNATIVE_TO", "weight": 0.5,
     "properties": {"context": "Both serve recovery — complementary rather than substitutive"}},
    {"source": "active_recovery_exercise", "target": "hiit", "type": "SAFE_ALTERNATIVE_TO", "weight": 0.8,
     "properties": {"context": "Light movement on RED readiness days instead of HIIT"}},

    # ── Speed/Strength windows → age bands ──
    {"source": "speed_window", "target": "u13", "type": "APPLICABLE_TO", "weight": 0.9},
    {"source": "speed_window", "target": "u15", "type": "APPLICABLE_TO", "weight": 1.0},
    {"source": "strength_window", "target": "u15", "type": "APPLICABLE_TO", "weight": 0.7},
    {"source": "strength_window", "target": "u17", "type": "APPLICABLE_TO", "weight": 1.0},
]


# ══════════════════════════════════════════════════════════════════════════════
# SEEDING LOGIC
# ══════════════════════════════════════════════════════════════════════════════

async def seed():
    """Main seeding function."""
    t0 = time.time()

    # Initialize DB pool
    await init_db_pool()

    logger.info(f"Seeding {len(ENTITIES)} entities and {len(RELATIONSHIPS)} relationships...")

    # Step 1: Embed all entity descriptions
    descriptions = [e["description"] for e in ENTITIES]
    logger.info(f"Embedding {len(descriptions)} entity descriptions via Voyage AI...")

    # Batch embed with rate limiting
    embeddings = await embed_documents(descriptions)
    logger.info(f"Embedded {len(embeddings)} descriptions")

    # Step 2: Attach embeddings to entities
    for i, ent in enumerate(ENTITIES):
        ent["embedding"] = embeddings[i]

    # Step 3: Bulk upsert entities
    name_to_id = await bulk_upsert_entities(ENTITIES)
    logger.info(f"Upserted {len(name_to_id)} entities")

    # Step 4: Build relationship records with resolved entity IDs
    rel_records = []
    skipped = 0
    for rel in RELATIONSHIPS:
        source_id = name_to_id.get(rel["source"])
        target_id = name_to_id.get(rel["target"])
        if not source_id or not target_id:
            logger.warning(f"Skipping relationship: {rel['source']} → {rel['target']} (entity not found)")
            skipped += 1
            continue
        rel_records.append({
            "source_entity_id": source_id,
            "target_entity_id": target_id,
            "relation_type": rel["type"],
            "properties": rel.get("properties", {}),
            "weight": rel.get("weight", 1.0),
        })

    if skipped:
        logger.warning(f"Skipped {skipped} relationships due to missing entities")

    # Step 5: Bulk upsert relationships
    count = await bulk_upsert_relationships(rel_records)
    logger.info(f"Upserted {count} relationships")

    # Cleanup
    await close_client()
    await close_db_pool()

    elapsed = time.time() - t0
    logger.info(f"Knowledge graph seeded in {elapsed:.1f}s: {len(name_to_id)} entities, {count} relationships")


if __name__ == "__main__":
    asyncio.run(seed())
