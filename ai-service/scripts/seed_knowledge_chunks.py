#!/usr/bin/env python3
"""
Tomo AI Service — Knowledge Chunks Seed Script
Populates rag_knowledge_chunks with sports science content + Voyage AI embeddings.

24 chunks across 8 domains: load management, readiness, PHV safety,
recovery, periodization, dual-load stress, nutrition/sleep, and testing.
Each chunk has athlete_summary (Gen Z language) and coach_summary (technical).

Usage:
  cd ai-service
  export $(grep -v '^#' .env | xargs)
  python -m scripts.seed_knowledge_chunks

Requires:
  - Migration 016 applied (rag_knowledge_chunks table)
  - VOYAGE_API_KEY set
  - SUPABASE_DB_URL set
"""

from __future__ import annotations

import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db.supabase import init_db_pool, close_db_pool, get_pool
from app.rag.embedder import embed_documents, close_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("seed_knowledge_chunks")


# ══════════════════════════════════════════════════════════════════════════════
# KNOWLEDGE CHUNKS (24 chunks across 8 domains)
# ══════════════════════════════════════════════════════════════════════════════

CHUNKS: list[dict] = [
    # ── Load Management (4) ──────────────────────────────────────────────
    {
        "domain": "load_acwr_fundamentals",
        "title": "ACWR — Acute:Chronic Workload Ratio",
        "content": (
            "The Acute:Chronic Workload Ratio (ACWR) compares 7-day acute load to 28-day chronic load. "
            "Sweet spot: 0.8–1.3 (low injury risk, optimal adaptation). Caution zone: 1.3–1.5 (elevated injury risk, reduce intensity). "
            "Danger zone: >1.5 (high injury risk, immediate load reduction required). Below 0.8 indicates detraining. "
            "Youth athletes (13-19) are MORE susceptible to ACWR spikes than adults due to developing musculoskeletal system. "
            "A spike from 0.9 to 1.6 in one week doubles injury probability. Always ramp load by max 10% per week."
        ),
        "athlete_summary": "Your ACWR shows how hard you've been training lately vs your normal. Stay between 0.8-1.3 and you're golden. Above 1.5 = your body needs a break.",
        "coach_summary": "ACWR 7:28 rolling ratio. Sweet spot 0.8-1.3, caution 1.3-1.5, danger >1.5. Youth populations require conservative ramp (≤10%/wk). Spikes >1.5 double injury probability.",
        "rec_types": ["LOAD_MANAGEMENT", "RECOVERY", "TRAINING_PLANNING"],
        "phv_stages": ["PRE", "CIRCA", "POST"],
        "age_groups": ["U13", "U15", "U17", "U19"],
        "sports": ["all"],
        "evidence_grade": "A",
        "primary_source": "Gabbett 2016, Windt & Gabbett 2017",
    },
    {
        "domain": "load_monotony_strain",
        "title": "Training Monotony & Strain",
        "content": (
            "Training monotony = mean daily load / standard deviation of daily load over 7 days. "
            "High monotony (>2.0) means training is too repetitive — same intensity every day with no variation. "
            "Training strain = weekly load × monotony. High strain (>6000 AU) combined with high monotony significantly increases illness and injury risk. "
            "Solution: vary session intensity across the week (HARD-LIGHT-MODERATE-REST pattern). "
            "For youth athletes, 2+ consecutive HARD days without recovery buffer is a red flag."
        ),
        "athlete_summary": "If every training day feels the same, that's bad. Mix it up — hard days, easy days, rest days. Your body adapts better with variety.",
        "coach_summary": "Monotony >2.0 + strain >6000 AU = elevated illness/injury risk. Prescribe intensity variation (H-L-M-R). Avoid consecutive high-load days in youth.",
        "rec_types": ["LOAD_MANAGEMENT", "TRAINING_PLANNING"],
        "phv_stages": ["PRE", "CIRCA", "POST"],
        "age_groups": ["U13", "U15", "U17", "U19"],
        "sports": ["all"],
        "evidence_grade": "A",
        "primary_source": "Foster 1998, Impellizzeri et al. 2004",
    },
    {
        "domain": "load_red_flag_protocol",
        "title": "RED Flag — Immediate Load Reduction Protocol",
        "content": (
            "When an athlete is flagged RED (readiness < 40, severe soreness, pain, poor sleep + low energy): "
            "1. BLOCK all high-intensity training immediately. 2. Prescribe active recovery only (walking, light stretching, mobility). "
            "3. Reassess readiness at next check-in before clearing for any moderate+ training. "
            "4. If RED persists 2+ consecutive days, recommend medical consultation. "
            "5. Never override RED with 'just push through' — youth athletes lack adult recovery capacity. "
            "RED + ACWR >1.3 = compound risk. Both flags together demand REST, not modified training."
        ),
        "athlete_summary": "RED means your body is telling you to stop. No pushing through. Rest, recover, check in again tomorrow. If RED stays 2+ days, see a doctor.",
        "coach_summary": "RED flag protocol: block high intensity, prescribe active recovery only, reassess next check-in. RED + ACWR>1.3 = compound risk → mandatory rest. 2+ consecutive RED days → medical referral.",
        "rec_types": ["RECOVERY", "LOAD_MANAGEMENT", "SAFETY"],
        "phv_stages": ["PRE", "CIRCA", "POST"],
        "age_groups": ["U13", "U15", "U17", "U19"],
        "sports": ["all"],
        "evidence_grade": "A",
        "primary_source": "Gabbett et al. 2017, Saw et al. 2016",
    },
    {
        "domain": "load_return_to_play",
        "title": "Graduated Return to Training",
        "content": (
            "After illness, injury, or extended REST period (>5 days off): "
            "Week 1: 50% of previous chronic load, LIGHT intensity only. "
            "Week 2: 70% chronic load, MODERATE intensity max. "
            "Week 3: 85% chronic load, one HARD session allowed. "
            "Week 4: Full return if ACWR stays below 1.3. "
            "Monitor ACWR daily during return — spikes are most common in weeks 2-3. "
            "Youth athletes need LONGER graduated returns than adults (add 1 extra week per growth phase)."
        ),
        "athlete_summary": "Coming back after time off? Don't go 0-100. Start at half effort, build up over 3-4 weeks. Your body needs time to readjust.",
        "coach_summary": "Graduated return: 50%→70%→85%→100% over 4 weeks. Monitor ACWR daily. Youth athletes require +1 week per growth stage. Spike risk highest in weeks 2-3.",
        "rec_types": ["RECOVERY", "LOAD_MANAGEMENT", "TRAINING_PLANNING"],
        "phv_stages": ["PRE", "CIRCA", "POST"],
        "age_groups": ["U13", "U15", "U17", "U19"],
        "sports": ["all"],
        "evidence_grade": "B",
        "primary_source": "Blanch & Gabbett 2016",
    },

    # ── Readiness & Recovery (3) ─────────────────────────────────────────
    {
        "domain": "readiness_interpretation",
        "title": "Readiness Score Interpretation",
        "content": (
            "Readiness is a composite of 5 inputs: energy (1-5), soreness (1-5 inverted), sleep hours, mood (1-5), and academic stress (1-5 inverted). "
            "GREEN (70-100): Full training capacity. All intensities appropriate. "
            "YELLOW (40-69): Reduced capacity. Max MODERATE intensity. Monitor during session. "
            "RED (0-39): Recovery mode. LIGHT only — active recovery, mobility, stretching. "
            "Trend matters more than single readings — 3+ days of declining readiness = systemic fatigue, not just a bad day."
        ),
        "athlete_summary": "Green = go hard. Yellow = take it easier. Red = recovery day only. If you've been yellow/red for 3+ days, your body needs real rest.",
        "coach_summary": "Readiness composite: energy, soreness (inv), sleep, mood, academic stress (inv). GREEN≥70 (full), YELLOW 40-69 (moderate max), RED<40 (recovery only). 3+ day decline = systemic fatigue.",
        "rec_types": ["READINESS", "RECOVERY", "LOAD_MANAGEMENT"],
        "phv_stages": ["PRE", "CIRCA", "POST"],
        "age_groups": ["U13", "U15", "U17", "U19"],
        "sports": ["all"],
        "evidence_grade": "A",
        "primary_source": "Hooper & Mackinnon 1995, Saw et al. 2016",
    },
    {
        "domain": "recovery_active",
        "title": "Active Recovery Protocols",
        "content": (
            "Active recovery accelerates return to baseline faster than complete rest. "
            "Optimal active recovery: 20-30 min at RPE 3-4 (very light effort). "
            "Options: walking, light cycling, swimming, yoga, foam rolling, dynamic stretching. "
            "Post-match recovery: 24-48h window. Day+1: active recovery only. Day+2: LIGHT if readiness is GREEN. "
            "Sleep is the #1 recovery tool — 8-10 hours for youth athletes (more than adults need). "
            "Hydration and protein within 30 min post-training support muscle repair."
        ),
        "athlete_summary": "Recovery doesn't mean doing nothing. Light movement (walk, stretch, foam roll) helps you bounce back faster. Sleep 8-10 hours — that's when your body actually repairs.",
        "coach_summary": "Active recovery: 20-30 min RPE 3-4 outperforms passive rest. Post-match: D+1 recovery, D+2 light if GREEN. Youth sleep target: 8-10h. Protein within 30 min post-session.",
        "rec_types": ["RECOVERY", "TRAINING_PLANNING"],
        "phv_stages": ["PRE", "CIRCA", "POST"],
        "age_groups": ["U13", "U15", "U17", "U19"],
        "sports": ["all"],
        "evidence_grade": "A",
        "primary_source": "Barnett 2006, Dupuy et al. 2018",
    },
    {
        "domain": "recovery_sleep_youth",
        "title": "Sleep Requirements for Youth Athletes",
        "content": (
            "Youth athletes (13-19) need 8-10 hours of sleep per night — MORE than adults. "
            "Sleep debt accumulates: 3 nights of 6h sleep = performance equivalent of staying awake 24h. "
            "Sleep quality markers: consistent bed/wake times, dark room, no screens 30 min before bed. "
            "HRV drops significantly with <7h sleep — directly impacts next-day readiness. "
            "Pre-competition: extra 30-60 min sleep in the 3 nights before can improve reaction time by 10-15%. "
            "Academic stress disrupts sleep quality even when duration is adequate — monitor both."
        ),
        "athlete_summary": "You need 8-10 hours of sleep, no cap. Three nights of bad sleep tanks your performance like being awake for 24 hours straight. Put the phone down 30 min before bed.",
        "coach_summary": "Youth sleep: 8-10h target. 3-night debt at 6h = 24h awake equivalent. HRV drops with <7h. Pre-comp banking: +30-60 min × 3 nights = 10-15% reaction time improvement. Academic stress disrupts quality independent of duration.",
        "rec_types": ["RECOVERY", "READINESS"],
        "phv_stages": ["PRE", "CIRCA", "POST"],
        "age_groups": ["U13", "U15", "U17", "U19"],
        "sports": ["all"],
        "evidence_grade": "A",
        "primary_source": "Mah et al. 2011, Bird 2013",
    },

    # ── PHV Safety (4) ───────────────────────────────────────────────────
    {
        "domain": "phv_overview",
        "title": "Peak Height Velocity — Growth & Training Safety",
        "content": (
            "Peak Height Velocity (PHV) is the period of fastest growth during puberty. "
            "Pre-PHV: Growth plates open, moderate loading safe, focus on movement quality and fun. "
            "Mid-PHV: CRITICAL PERIOD — bones growing faster than muscles/tendons. High injury risk. "
            "Post-PHV: Growth plates closing, progressive loading appropriate, strength gains accelerate. "
            "Mid-PHV athletes MUST avoid: barbell squats, depth/drop jumps, Olympic lifts, maximal sprints, heavy deadlifts. "
            "These movements create excessive load on growth plates and tendon attachment points."
        ),
        "athlete_summary": "If you're in your growth spurt (Mid-PHV), some exercises are off-limits — no heavy squats, no box jumps, no max sprints. Your bones are growing faster than your muscles, so we keep it safe.",
        "coach_summary": "Mid-PHV: growth plates vulnerable. Contraindicated: barbell squat, depth/drop jump, Olympic lifts, maximal sprint, heavy deadlift. Focus: bodyweight, controlled tempo, submaximal loads.",
        "rec_types": ["SAFETY", "TRAINING_PLANNING"],
        "phv_stages": ["CIRCA"],
        "age_groups": ["U13", "U15", "U17"],
        "sports": ["all"],
        "evidence_grade": "A",
        "primary_source": "Lloyd & Oliver 2012, Myer et al. 2011",
    },
    {
        "domain": "phv_mid_alternatives",
        "title": "Mid-PHV Safe Training Alternatives",
        "content": (
            "Instead of contraindicated movements, Mid-PHV athletes should use: "
            "Instead of barbell squat → goblet squat, bodyweight squat, wall sit. "
            "Instead of depth/drop jumps → low box step-ups, lateral bounds (controlled), skipping. "
            "Instead of Olympic lifts → medicine ball throws, kettlebell swings (light), resistance band work. "
            "Instead of maximal sprints → tempo runs (75-85% effort), acceleration drills over 10m. "
            "Instead of heavy deadlifts → Romanian deadlift with light dumbbells, hip hinges, glute bridges. "
            "Focus: movement quality, proprioception, body awareness. RPE 6-7 max."
        ),
        "athlete_summary": "Growth spurt doesn't mean no training — it means smarter training. Goblet squats instead of barbell, tempo runs instead of all-out sprints, medicine balls instead of Olympic lifts.",
        "coach_summary": "Mid-PHV substitutions: barbell squat→goblet/BW, depth jumps→low box/skipping, Olympic lifts→med ball throws, max sprint→tempo 75-85%, heavy DL→light RDL/hip hinge. RPE ≤7.",
        "rec_types": ["TRAINING_PLANNING", "SAFETY"],
        "phv_stages": ["CIRCA"],
        "age_groups": ["U13", "U15", "U17"],
        "sports": ["all"],
        "evidence_grade": "B",
        "primary_source": "Lloyd & Oliver 2012, Faigenbaum et al. 2009",
    },
    {
        "domain": "phv_pre_training",
        "title": "Pre-PHV Training Principles",
        "content": (
            "Pre-PHV athletes (before growth spurt) are in the 'golden age' of motor learning. "
            "Priority: movement literacy, coordination, agility, fun. "
            "Strength: bodyweight exercises, light resistance bands, medicine balls. "
            "Speed: short sprints (10-20m), agility courses, change of direction games. "
            "No periodization needed — multi-sport exposure is optimal. "
            "Sessions should be 45-60 min with rest breaks. High volume OK if intensity stays moderate."
        ),
        "athlete_summary": "Before your growth spurt, it's all about learning how to move well. Play different sports, do bodyweight stuff, have fun. This is when your body learns fastest.",
        "coach_summary": "Pre-PHV: motor learning window. Focus on movement literacy, coordination, multi-sport. Bodyweight + light resistance. 45-60 min sessions. Volume OK, intensity moderate. No formal periodization needed.",
        "rec_types": ["TRAINING_PLANNING"],
        "phv_stages": ["PRE"],
        "age_groups": ["U13", "U15"],
        "sports": ["all"],
        "evidence_grade": "B",
        "primary_source": "Lloyd & Oliver 2012, Balyi & Hamilton 2004",
    },
    {
        "domain": "phv_post_training",
        "title": "Post-PHV Training Progression",
        "content": (
            "Post-PHV athletes have closing growth plates and can begin progressive loading. "
            "Strength: introduce barbell movements with proper coaching. Start with technique, not load. "
            "Plyometrics: can begin depth jumps and drop landings (progressive, supervised). "
            "Sprint: maximal sprints allowed with proper warm-up and progressive exposure. "
            "Key risk: overconfidence — athletes feel invincible post-growth but tendons lag 6-12 months behind muscle adaptation. "
            "Monitor ACWR closely during this phase — injury risk remains elevated vs adults."
        ),
        "athlete_summary": "After your growth spurt, you can start lifting heavier and sprinting all-out. But don't go crazy — your tendons need 6-12 months to catch up with your muscles.",
        "coach_summary": "Post-PHV: progressive barbell loading with coaching. Plyometrics reintroduction (supervised). Max sprint allowed. Tendon adaptation lags muscle by 6-12 months. ACWR monitoring critical.",
        "rec_types": ["TRAINING_PLANNING", "LOAD_MANAGEMENT"],
        "phv_stages": ["POST"],
        "age_groups": ["U15", "U17", "U19"],
        "sports": ["all"],
        "evidence_grade": "B",
        "primary_source": "Myer et al. 2011, Lloyd et al. 2014",
    },

    # ── Dual-Load Stress (3) ─────────────────────────────────────────────
    {
        "domain": "dual_load_fundamentals",
        "title": "Dual-Load Stress — Academic + Athletic Pressure",
        "content": (
            "Dual-load stress occurs when academic pressure (exams, deadlines) overlaps with high training load. "
            "The effect is MULTIPLICATIVE, not additive: stress + training fatigue = 2-3x recovery time. "
            "Academic cortisol elevation impairs sleep quality, which reduces HRV, which drops readiness. "
            "During exam periods: reduce training volume by 30-50%, intensity to MODERATE max. "
            "Cognitive Window: 30-90 min after moderate exercise is optimal for studying (BDNF elevation). "
            "Never schedule HARD training on exam days or the day before a major exam."
        ),
        "athlete_summary": "Exams + hard training = recipe for burnout. When school is stressful, train lighter. Pro tip: studying 30-90 min AFTER a moderate workout is when your brain works best.",
        "coach_summary": "Dual-load: academic + athletic stress is multiplicative. Exam period: -30-50% volume, MODERATE max. Cognitive Window: 30-90 min post-moderate exercise (BDNF peak). No HARD on exam day or D-1.",
        "rec_types": ["LOAD_MANAGEMENT", "TRAINING_PLANNING", "ACADEMIC"],
        "phv_stages": ["PRE", "CIRCA", "POST"],
        "age_groups": ["U13", "U15", "U17", "U19"],
        "sports": ["all"],
        "evidence_grade": "B",
        "primary_source": "Kellmann 2010, Hartmann et al. 2015",
    },
    {
        "domain": "dual_load_exam_protocol",
        "title": "Exam Period Training Protocol",
        "content": (
            "When exams are active (within 14 days): "
            "1. Switch to STUDY mode — max 3 sessions/week, LIGHT-MODERATE only. "
            "2. No matches or competitions if possible (or treat as HARD and reduce other sessions). "
            "3. Each session max 45 min — shorter than normal to preserve cognitive energy. "
            "4. Schedule training BEFORE study sessions (not after) to leverage Cognitive Window. "
            "5. Sleep is non-negotiable — if student must choose between training and 8h sleep, sleep wins. "
            "6. Post-exam: don't immediately return to full load. Ramp over 1 week."
        ),
        "athlete_summary": "Exam mode: 3 sessions max per week, nothing too hard, keep it under 45 min. Train BEFORE studying — your brain works better after exercise. And sleep always beats training.",
        "coach_summary": "Exam protocol: ≤3 sessions/wk, LIGHT-MOD, 45 min max. Train before study (Cognitive Window). Sleep priority over training. Post-exam: 1-week ramp back. No competitions if avoidable.",
        "rec_types": ["TRAINING_PLANNING", "ACADEMIC", "LOAD_MANAGEMENT"],
        "phv_stages": ["PRE", "CIRCA", "POST"],
        "age_groups": ["U13", "U15", "U17", "U19"],
        "sports": ["all"],
        "evidence_grade": "B",
        "primary_source": "Kellmann 2010",
    },
    {
        "domain": "dual_load_data_confidence",
        "title": "Data Confidence & Stale Check-ins",
        "content": (
            "Data confidence measures how reliable the athlete's current readiness assessment is. "
            "100%: Check-in today + wearable sync + recent test data. "
            "60-80%: Check-in 1-2 days old — still usable but less precise. "
            "40-60%: Check-in 3-5 days old — training recommendations should be conservative. "
            "<40%: Check-in >5 days old or missing — essentially flying blind. "
            "When data confidence is low: recommend a fresh check-in before any training decision. "
            "Never prescribe HARD training when data confidence is below 60%."
        ),
        "athlete_summary": "The more you check in, the smarter your training advice gets. If you haven't checked in for 3+ days, we're guessing — and we'd rather be safe than sorry.",
        "coach_summary": "Data confidence: 100%=today's check-in+wearable, 60-80%=1-2d old, 40-60%=3-5d (conservative), <40%=flying blind. Never prescribe HARD below 60% confidence. Prompt check-in before decisions.",
        "rec_types": ["READINESS", "LOAD_MANAGEMENT"],
        "phv_stages": ["PRE", "CIRCA", "POST"],
        "age_groups": ["U13", "U15", "U17", "U19"],
        "sports": ["all"],
        "evidence_grade": "C",
        "primary_source": "Tomo internal protocol",
    },

    # ── Periodization (3) ────────────────────────────────────────────────
    {
        "domain": "periodization_youth",
        "title": "Youth Periodization Principles",
        "content": (
            "Youth athletes don't need complex periodization models (no Verkhoshansky block periodization). "
            "Simple weekly structure: 2-3 quality sessions + 1-2 light/recovery sessions + 1-2 rest days. "
            "In-season (league active): training supports match performance, not the other way around. "
            "Match day -1: LIGHT only. Match day +1: REST or active recovery. "
            "No back-to-back HARD sessions. Minimum 48h between HARD sessions. "
            "Multi-sport is better than early specialization for athletes under 15."
        ),
        "athlete_summary": "Keep it simple: 2-3 real training days, 1-2 easy days, 1-2 rest days. Day before a game = light. Day after = recovery. Never go hard two days in a row.",
        "coach_summary": "Youth periodization: simple weekly (2-3 quality + 1-2 light + 1-2 rest). Match D-1: LIGHT. Match D+1: REST. Min 48h between HARD sessions. Multi-sport before 15. No block periodization.",
        "rec_types": ["TRAINING_PLANNING"],
        "phv_stages": ["PRE", "CIRCA", "POST"],
        "age_groups": ["U13", "U15", "U17", "U19"],
        "sports": ["all"],
        "evidence_grade": "A",
        "primary_source": "Lloyd & Oliver 2012, Bompa & Carrera 2005",
    },
    {
        "domain": "periodization_intensity_matching",
        "title": "Intensity-Readiness Matching",
        "content": (
            "Every training session intensity must match current readiness state: "
            "GREEN readiness: All intensities appropriate (LIGHT through HARD). Choose based on weekly plan. "
            "YELLOW readiness: MODERATE maximum. No HARD sessions. Reduce volume by 20%. "
            "RED readiness: LIGHT only — active recovery, mobility, stretching. No skills work above RPE 5. "
            "HRV below personal baseline by >10%: treat as YELLOW regardless of subjective readiness. "
            "When readiness and HRV conflict, always go with the MORE conservative signal."
        ),
        "athlete_summary": "Green = do what's planned. Yellow = dial it back to moderate. Red = recovery only. If your HRV is low, that overrides how you 'feel'.",
        "coach_summary": "Intensity matching: GREEN=all, YELLOW=moderate max (-20% volume), RED=light/recovery only. HRV >10% below baseline = YELLOW override. Conservative signal always wins.",
        "rec_types": ["TRAINING_PLANNING", "READINESS", "LOAD_MANAGEMENT"],
        "phv_stages": ["PRE", "CIRCA", "POST"],
        "age_groups": ["U13", "U15", "U17", "U19"],
        "sports": ["all"],
        "evidence_grade": "A",
        "primary_source": "Plews et al. 2014, Saw et al. 2016",
    },
    {
        "domain": "periodization_deload",
        "title": "Deload Weeks for Youth Athletes",
        "content": (
            "Every 3-4 weeks of progressive training should include a deload week. "
            "Deload: reduce volume by 40-50%, keep intensity at MODERATE, maintain frequency. "
            "Purpose: allow accumulated fatigue to dissipate and supercompensation to occur. "
            "Signs you need a deload NOW: declining readiness 3+ days, HRV trending down, motivation drop, persistent soreness. "
            "Youth athletes often skip deloads because they 'feel fine' — coach must enforce this proactively. "
            "Post-deload: expect a performance bump within 5-7 days."
        ),
        "athlete_summary": "Every 3-4 weeks, take an easy week. Less volume, same frequency, moderate effort. You'll come back stronger — that's how your body actually builds fitness.",
        "coach_summary": "Deload every 3-4 weeks: -40-50% volume, MODERATE intensity, maintain frequency. Signs: 3+ day readiness decline, HRV down-trend, motivation drop. Supercompensation within 5-7 days post-deload.",
        "rec_types": ["TRAINING_PLANNING", "RECOVERY", "LOAD_MANAGEMENT"],
        "phv_stages": ["PRE", "CIRCA", "POST"],
        "age_groups": ["U13", "U15", "U17", "U19"],
        "sports": ["all"],
        "evidence_grade": "B",
        "primary_source": "Bompa & Haff 2009",
    },

    # ── Testing & Benchmarks (3) ─────────────────────────────────────────
    {
        "domain": "testing_cmj",
        "title": "Counter-Movement Jump (CMJ) Testing",
        "content": (
            "CMJ measures lower body power — a key predictor of sprint speed and change of direction ability. "
            "Protocol: stand on force plate/jump mat, dip and jump maximally, land on both feet. 3 attempts, best score counts. "
            "Norms vary by sport, age, and position. Football midfielders: 35-40cm (U15), 40-48cm (U17). "
            "CMJ also serves as a daily readiness indicator: >10% drop from personal best = fatigue, consider load reduction. "
            "Test monthly for tracking, weekly for readiness monitoring. Morning, standardized warm-up, rested state."
        ),
        "athlete_summary": "CMJ tests how explosive your legs are. 3 jumps, best one counts. If your jump drops 10%+ from your best, your body might be tired — time to back off training.",
        "coach_summary": "CMJ: lower body power proxy. 3 trials, best score. Monthly for tracking, weekly for readiness. >10% drop from PB = fatigue indicator. Sport/age/position norms apply. Morning testing, standardized protocol.",
        "rec_types": ["TESTING", "READINESS"],
        "phv_stages": ["PRE", "CIRCA", "POST"],
        "age_groups": ["U13", "U15", "U17", "U19"],
        "sports": ["all"],
        "evidence_grade": "A",
        "primary_source": "McMahon et al. 2018, Claudino et al. 2017",
    },
    {
        "domain": "testing_sprint",
        "title": "Sprint Testing Protocols",
        "content": (
            "Sprint testing: 10m (acceleration), 20m (transition), 30m (max velocity). "
            "10m split is most important for team sports (first 2-3 steps decide most 1v1 situations). "
            "Flying 20m (from running start) isolates max velocity — different quality from standing start. "
            "Always use timing gates for reliability. Hand-timing adds 0.2-0.3s error. "
            "Sprint performance is readiness-sensitive: test on GREEN days only. "
            "Mid-PHV athletes: use 10m acceleration only (no maximal 30m+), monitor for growth-related pain."
        ),
        "athlete_summary": "10m sprint = your acceleration (most important in games). 20m = your top speed. Always test when you're feeling fresh (GREEN day). Mid-growth spurt? Stick to 10m only.",
        "coach_summary": "Sprint protocol: 10m (accel), 20m (transition), 30m (max V). Flying 20m for isolated max velocity. Timing gates only. GREEN readiness days only. Mid-PHV: 10m max, monitor growth-related pain.",
        "rec_types": ["TESTING"],
        "phv_stages": ["PRE", "CIRCA", "POST"],
        "age_groups": ["U13", "U15", "U17", "U19"],
        "sports": ["football", "athletics", "basketball", "tennis", "padel"],
        "evidence_grade": "A",
        "primary_source": "Haugen & Buchheit 2016",
    },
    {
        "domain": "testing_yo_yo",
        "title": "Yo-Yo Intermittent Recovery Test",
        "content": (
            "Yo-Yo IR1: gold standard for intermittent endurance in team sports. "
            "Protocol: 2×20m shuttle runs with progressive speed increase, 10s active recovery between reps. "
            "Measures: ability to repeatedly perform high-intensity efforts with brief recovery — exactly what matches demand. "
            "Age-specific norms: U15 football average = 1040m, U17 = 1400m, U19 = 1760m. "
            "Test quarterly. Not suitable as a daily readiness indicator (too fatiguing). "
            "Mid-PHV: can perform but expect lower scores due to growth-related inefficiency. Don't compare to pre-growth results."
        ),
        "athlete_summary": "Yo-Yo test shows how well you recover between sprints — exactly like a real game. Test every 3 months to track your fitness. Expect lower scores during growth spurts.",
        "coach_summary": "Yo-Yo IR1: intermittent endurance gold standard. 2×20m progressive shuttle + 10s recovery. Quarterly testing. U15 avg: 1040m, U17: 1400m, U19: 1760m. Mid-PHV: lower scores expected, no cross-growth comparison.",
        "rec_types": ["TESTING"],
        "phv_stages": ["PRE", "CIRCA", "POST"],
        "age_groups": ["U13", "U15", "U17", "U19"],
        "sports": ["football", "basketball"],
        "evidence_grade": "A",
        "primary_source": "Krustrup et al. 2003, Bangsbo et al. 2008",
    },

    # ── Nutrition & Hydration (2) ────────────────────────────────────────
    {
        "domain": "nutrition_youth_athlete",
        "title": "Youth Athlete Nutrition Fundamentals",
        "content": (
            "Youth athletes need MORE calories than sedentary peers: +500-1000 kcal/day during training periods. "
            "Protein: 1.2-1.6g/kg/day for muscle repair (higher end during growth spurts). "
            "Carbohydrate: primary fuel — 5-7g/kg/day for moderate training, 7-10g/kg for heavy training days. "
            "Pre-training meal: 2-3h before, carb-focused. Pre-training snack: 30-60 min before, easy to digest. "
            "Post-training: protein + carbs within 30 min (chocolate milk is an excellent recovery drink). "
            "Hydration: 500ml 2h before training, 200ml every 15-20 min during. Electrolytes only for 60+ min sessions."
        ),
        "athlete_summary": "Eat more than your non-athlete friends. Carbs before training, protein + carbs after. Chocolate milk is legit recovery fuel. Drink water before, during, and after every session.",
        "coach_summary": "Youth athlete nutrition: +500-1000 kcal/day. Protein 1.2-1.6g/kg (higher during growth). Carbs 5-10g/kg based on load. Post-training: protein+carbs within 30 min. Hydration: 500ml pre, 200ml/15-20 min.",
        "rec_types": ["NUTRITION", "RECOVERY"],
        "phv_stages": ["PRE", "CIRCA", "POST"],
        "age_groups": ["U13", "U15", "U17", "U19"],
        "sports": ["all"],
        "evidence_grade": "A",
        "primary_source": "Desbrow et al. 2014, Thomas et al. 2016",
    },
    {
        "domain": "nutrition_match_day",
        "title": "Match Day Nutrition Protocol",
        "content": (
            "Match day -1: Carb-loading (7-10g/kg). Hydrate well. Avoid new foods. "
            "Match day breakfast: Familiar, carb-rich, moderate protein, low fat. 3-4h before kickoff. "
            "Pre-match snack: 60-90 min before. Light, easy to digest (banana, energy bar, toast with honey). "
            "Half-time: 200-300ml fluid + fast carbs (energy gel, diluted juice, orange slices). "
            "Post-match: protein + carbs within 30 min. Full recovery meal within 2h. "
            "Avoid: caffeine (under 16), energy drinks, untested supplements, heavy meals within 2h of kickoff."
        ),
        "athlete_summary": "Game day: eat a big carb meal the night before, familiar breakfast 3-4h out, light snack 1h before. Half-time: quick fuel (banana, juice). After: protein + carbs ASAP. No energy drinks.",
        "coach_summary": "Match day: D-1 carb load 7-10g/kg. Breakfast 3-4h pre, snack 60-90 min pre. Half-time: 200-300ml + fast carbs. Post-match: recovery nutrition within 30 min. No caffeine <16y, no energy drinks.",
        "rec_types": ["NUTRITION", "TRAINING_PLANNING"],
        "phv_stages": ["PRE", "CIRCA", "POST"],
        "age_groups": ["U13", "U15", "U17", "U19"],
        "sports": ["football", "basketball", "tennis", "padel"],
        "evidence_grade": "A",
        "primary_source": "Burke et al. 2011, Thomas et al. 2016",
    },

    # ── Warm-up & Injury Prevention (2) ──────────────────────────────────
    {
        "domain": "warmup_protocol",
        "title": "Youth Athlete Warm-up Protocol",
        "content": (
            "Every session must start with a structured warm-up (10-15 min minimum). "
            "Phase 1 (5 min): General activation — light jog, skipping, lateral shuffles. "
            "Phase 2 (5 min): Dynamic stretching — leg swings, hip circles, walking lunges, inchworms. "
            "Phase 3 (3-5 min): Sport-specific activation — ball work, agility patterns, acceleration builds. "
            "Never skip warm-up, especially in cold weather or early morning. "
            "FIFA 11+ protocol reduces injuries by 30-50% in youth football (validated by multiple RCTs). "
            "Static stretching AFTER training only, not before (reduces power output if done pre-session)."
        ),
        "athlete_summary": "Always warm up 10-15 min: light jog → dynamic stretches → sport moves. Never skip it — cold muscles get injured. Save static stretching for AFTER training.",
        "coach_summary": "3-phase warm-up: general activation (5 min) → dynamic stretching (5 min) → sport-specific (3-5 min). FIFA 11+ reduces youth injuries 30-50%. No static stretching pre-session (reduces power). 10-15 min minimum.",
        "rec_types": ["TRAINING_PLANNING", "SAFETY"],
        "phv_stages": ["PRE", "CIRCA", "POST"],
        "age_groups": ["U13", "U15", "U17", "U19"],
        "sports": ["all"],
        "evidence_grade": "A",
        "primary_source": "Soligard et al. 2008, Emery & Meeuwisse 2010",
    },
    {
        "domain": "injury_prevention_acl",
        "title": "ACL Injury Prevention in Youth Athletes",
        "content": (
            "ACL injuries peak in youth athletes ages 14-18, especially in cutting/pivoting sports. "
            "Female athletes: 3-6x higher ACL risk than males in the same sport. "
            "Prevention programs (FIFA 11+, PEP): neuromuscular training 2-3x/week reduces ACL risk by 50-70%. "
            "Key exercises: single-leg balance, lateral band walks, Nordic hamstring curls, proper landing mechanics (soft knees, no knee valgus). "
            "Landing technique: land on balls of feet, bend knees 30°+, knees track over toes. "
            "Players who fatigue show worse landing mechanics — most ACL injuries happen in last 15 min of games."
        ),
        "athlete_summary": "ACL tears are preventable. Train your landing (soft knees, no knees caving in), do hamstring work, and single-leg balance. Most ACL injuries happen when you're tired — stay sharp late in games.",
        "coach_summary": "ACL peak: ages 14-18, females 3-6x risk. Prevention: neuromuscular training 2-3x/wk (FIFA 11+/PEP) reduces risk 50-70%. Key: single-leg balance, Nordic hamstrings, landing mechanics. Fatigue = late-game risk.",
        "rec_types": ["SAFETY", "TRAINING_PLANNING"],
        "phv_stages": ["CIRCA", "POST"],
        "age_groups": ["U15", "U17", "U19"],
        "sports": ["football", "basketball", "tennis", "padel"],
        "evidence_grade": "A",
        "primary_source": "Hewett et al. 2005, Sugimoto et al. 2015",
    },
]


# ══════════════════════════════════════════════════════════════════════════════
# SEED LOGIC
# ══════════════════════════════════════════════════════════════════════════════

async def seed_chunks():
    """Embed and insert all knowledge chunks."""
    await init_db_pool()
    pool = get_pool()
    if not pool:
        logger.error("No DB pool — cannot seed")
        return

    logger.info(f"Seeding {len(CHUNKS)} knowledge chunks...")

    # 1. Embed all chunk contents via Voyage AI
    texts = [c["content"] for c in CHUNKS]
    logger.info("Embedding chunks via Voyage AI (voyage-3-lite, 512-dim)...")
    embeddings = await embed_documents(texts)
    logger.info(f"Generated {len(embeddings)} embeddings")

    # 2. Insert into rag_knowledge_chunks (upsert on domain)
    inserted = 0
    async with pool.connection() as conn:
        for chunk, embedding in zip(CHUNKS, embeddings):
            try:
                await conn.execute(
                    """
                    INSERT INTO rag_knowledge_chunks (
                        domain, title, content, athlete_summary, coach_summary,
                        rec_types, phv_stages, age_groups, sports,
                        embedding, evidence_grade, primary_source
                    ) VALUES (
                        %s, %s, %s, %s, %s,
                        %s, %s, %s, %s,
                        %s::vector, %s, %s
                    )
                    ON CONFLICT (domain) DO UPDATE SET
                        title = EXCLUDED.title,
                        content = EXCLUDED.content,
                        athlete_summary = EXCLUDED.athlete_summary,
                        coach_summary = EXCLUDED.coach_summary,
                        rec_types = EXCLUDED.rec_types,
                        phv_stages = EXCLUDED.phv_stages,
                        age_groups = EXCLUDED.age_groups,
                        sports = EXCLUDED.sports,
                        embedding = EXCLUDED.embedding,
                        evidence_grade = EXCLUDED.evidence_grade,
                        primary_source = EXCLUDED.primary_source
                    """,
                    (
                        chunk["domain"],
                        chunk["title"],
                        chunk["content"],
                        chunk["athlete_summary"],
                        chunk["coach_summary"],
                        chunk["rec_types"],
                        chunk["phv_stages"],
                        chunk["age_groups"],
                        chunk["sports"],
                        str(embedding),
                        chunk["evidence_grade"],
                        chunk["primary_source"],
                    ),
                )
                inserted += 1
            except Exception as e:
                logger.error(f"Failed to insert chunk '{chunk['domain']}': {e}")

    logger.info(f"Seeded {inserted}/{len(CHUNKS)} knowledge chunks")

    await close_client()
    await close_db_pool()


if __name__ == "__main__":
    asyncio.run(seed_chunks())
