#!/usr/bin/env python3
"""
Tomo AI Service — Knowledge Graph Expansion Script
SUPPLEMENTS the base seed (seed_knowledge_graph.py: ~83 entities, ~130 relationships).

Adds ~150 new entities and ~300 new relationships covering:
  - Sport-specific injuries and health conditions (15)
  - Sport-specific drills: football, basketball, padel, tennis, athletics (42)
  - General prehab/strength exercises (8)
  - Advanced protocols (15)
  - Sports science concepts (15)
  - Body regions (4)

Usage:
  cd ai-service
  export $(grep -v '^#' .env | xargs)
  python -m scripts.seed_knowledge_expansion

Requires:
  - Base seed (seed_knowledge_graph.py) has been run first
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
logger = logging.getLogger("seed_knowledge_expansion")


# ==============================================================================
# ENTITY DEFINITIONS (~150 new entities)
# ==============================================================================

ENTITIES: list[dict] = [

    # =========================================================================
    # CONDITIONS — Sport-Specific Injuries & Health (~15)
    # =========================================================================

    {"entity_type": "condition", "name": "acl_injury", "display_name": "ACL Injury",
     "description": "Anterior cruciate ligament tear or sprain — one of the most devastating youth sport injuries. Incidence peaks during rapid growth and in multi-directional sports (football, basketball). Non-contact mechanisms account for 70% of cases. Neuromuscular training programs (FIFA 11+) reduce risk by 50-70%. Return-to-sport requires 9-12 months of structured rehabilitation with strict criteria-based progression.",
     "properties": {"severity": "critical", "return_timeline_months": "9-12", "evidence_grade": "A"}},

    {"entity_type": "condition", "name": "hamstring_strain", "display_name": "Hamstring Strain",
     "description": "Hamstring muscle strain — the most common non-contact injury in sprinting and kicking sports. Type I (sprinting) affects biceps femoris proximal tendon; Type II (stretching) affects semimembranosus. Nordic hamstring curls reduce recurrence by 51%. Eccentric strength deficit is the primary modifiable risk factor. Return timelines range from 2-8 weeks depending on grade.",
     "properties": {"severity": "moderate-severe", "return_timeline_weeks": "2-8", "evidence_grade": "A"}},

    {"entity_type": "condition", "name": "ankle_sprain", "display_name": "Ankle Sprain",
     "description": "Lateral ankle ligament sprain — the single most common sports injury in youth athletes, representing 15-25% of all injuries. Inversion mechanism damages the anterior talofibular ligament first. Proprioceptive training and balance work reduce recurrence by 40-50%. Chronic ankle instability develops in 20-40% of cases without proper rehabilitation. Bracing or taping recommended for return to sport.",
     "properties": {"severity": "moderate", "recurrence_rate": "20-40%", "evidence_grade": "A"}},

    {"entity_type": "condition", "name": "shoulder_impingement", "display_name": "Shoulder Impingement",
     "description": "Subacromial impingement syndrome — compression of rotator cuff tendons and subacromial bursa during overhead movements. Prevalent in tennis (serve), padel (bandeja/vibora), and basketball (shooting). Scapular dyskinesis and rotator cuff weakness are primary contributors. Prehab programs focusing on external rotation strength and scapular stability reduce incidence significantly.",
     "properties": {"severity": "moderate", "sports": ["tennis", "padel", "basketball"], "evidence_grade": "A"}},

    {"entity_type": "condition", "name": "tennis_elbow", "display_name": "Tennis Elbow (Lateral Epicondylalgia)",
     "description": "Lateral epicondylalgia — degenerative tendinopathy of the common extensor origin at the lateral elbow. Despite the name, occurs in padel more frequently than tennis due to grip demands and vibration transmission. Eccentric wrist extension exercises are the gold-standard treatment. Grip strength rehabilitation and equipment modification (grip size, string tension) are essential for management.",
     "properties": {"severity": "moderate", "sports": ["tennis", "padel"], "evidence_grade": "A"}},

    {"entity_type": "condition", "name": "osgood_schlatter", "display_name": "Osgood-Schlatter Disease",
     "description": "Traction apophysitis of the tibial tuberosity — the hallmark overuse condition of the growing knee. Peak incidence coincides with mid-PHV (boys 12-15, girls 10-13). Repetitive quadriceps contraction pulls on the unfused tibial tubercle apophysis. Management requires load modification, NOT complete rest. Isometric quadriceps exercises at pain-free angles maintain strength while allowing healing.",
     "properties": {"severity": "moderate", "phv_related": True, "age_boys": "12-15", "age_girls": "10-13", "evidence_grade": "A"}},

    {"entity_type": "condition", "name": "severs_disease", "display_name": "Sever's Disease (Calcaneal Apophysitis)",
     "description": "Calcaneal apophysitis — traction injury at the Achilles tendon insertion on the calcaneal growth plate. Most common cause of heel pain in athletes aged 8-14. Bilateral in 60% of cases. Exacerbated by running, jumping, and hard surfaces. Heel raises, calf stretching, and activity modification are first-line treatment. Self-limiting condition that resolves with skeletal maturity.",
     "properties": {"severity": "moderate", "phv_related": True, "age_range": "8-14", "evidence_grade": "A"}},

    {"entity_type": "condition", "name": "groin_strain", "display_name": "Groin Strain (Adductor Injury)",
     "description": "Adductor muscle strain — accounts for 10-18% of injuries in football due to high kicking, cutting, and change-of-direction demands. The Copenhagen adduction exercise reduces groin injury risk by 41%. Adductor squeeze strength below 80% of abductor strength is a significant risk factor. Chronic groin pain requires thorough differential diagnosis including hip joint pathology.",
     "properties": {"severity": "moderate", "return_timeline_weeks": "2-6", "evidence_grade": "A"}},

    {"entity_type": "condition", "name": "shin_splints", "display_name": "Shin Splints (Medial Tibial Stress Syndrome)",
     "description": "Medial tibial stress syndrome — periosteal inflammation along the posteromedial tibial border. Most common overuse injury in running-based sports. Risk factors include rapid training volume increases, hard surfaces, and poor footwear. If untreated, can progress to tibial stress fracture. Management includes load reduction, gait retraining, calf strengthening, and gradual return to impact activities.",
     "properties": {"severity": "moderate", "progression_risk": "stress_fracture", "evidence_grade": "A"}},

    {"entity_type": "condition", "name": "concussion", "display_name": "Concussion (Sport-Related)",
     "description": "Sport-related concussion — traumatic brain injury requiring immediate removal from play and graded return-to-sport protocol. No same-day return regardless of symptom resolution. Youth athletes require longer recovery periods than adults (2-4 weeks typical). Cognitive rest initially, then graduated return: symptom-free daily activities, light aerobic exercise, sport-specific exercise, non-contact drills, full contact, competition. Each stage minimum 24 hours.",
     "properties": {"severity": "critical", "return_timeline_weeks": "2-4", "evidence_grade": "A"}},

    {"entity_type": "condition", "name": "iron_deficiency", "display_name": "Iron Deficiency (Athletic)",
     "description": "Iron deficiency without or with anaemia — prevalent in 15-35% of female youth athletes and 5-11% of males. Impairs oxygen transport, endurance capacity, and cognitive function. Risk factors include rapid growth, menstruation, plant-based diets, and high training volumes. Ferritin below 30 mcg/L warrants supplementation. Screen all youth athletes with declining performance or unexplained fatigue.",
     "properties": {"severity": "moderate", "prevalence_female": "15-35%", "prevalence_male": "5-11%", "evidence_grade": "A"}},

    {"entity_type": "condition", "name": "dehydration_state", "display_name": "Dehydration State",
     "description": "Exercise-induced dehydration exceeding 2% body mass loss — impairs endurance performance by 10-20%, reduces cognitive function, and increases core temperature. Youth athletes have a higher surface-area-to-mass ratio, making them more susceptible to heat illness. Thirst is a poor indicator of hydration status in youth. Pre-exercise urine color monitoring and body mass tracking are the most practical assessment methods.",
     "properties": {"severity": "moderate", "performance_impact": "10-20% decline", "evidence_grade": "A"}},

    {"entity_type": "condition", "name": "relative_energy_deficiency_syndrome", "display_name": "RED-S (Relative Energy Deficiency in Sport)",
     "description": "Relative Energy Deficiency in Sport — syndrome of impaired physiological function caused by insufficient caloric intake relative to energy expenditure. Affects bone health, menstrual function, metabolic rate, immunity, protein synthesis, and cardiovascular health. Replaces the outdated female athlete triad model. Screening tools include the RED-S CAT and LEAF-Q. Early identification is critical to prevent irreversible bone density loss in growing athletes.",
     "properties": {"severity": "critical", "evidence_grade": "A"}},

    {"entity_type": "condition", "name": "competition_anxiety", "display_name": "Competition Anxiety",
     "description": "Pre-competitive anxiety state — cognitive (worry, self-doubt) and somatic (elevated HR, muscle tension, GI distress) components. Moderate arousal enhances performance (inverted-U theory), but excessive anxiety impairs decision-making and motor control. Cognitive-behavioral techniques (reframing, self-talk), breathing protocols, and pre-performance routines are evidence-based interventions. Age-appropriate mental skills training should begin at U13.",
     "properties": {"severity": "moderate", "evidence_grade": "A"}},

    {"entity_type": "condition", "name": "athlete_burnout", "display_name": "Athlete Burnout",
     "description": "Athlete burnout syndrome — characterized by emotional and physical exhaustion, reduced sense of accomplishment, and sport devaluation. Risk factors include early specialization, excessive training volume, controlling coaching, lack of autonomy, and high parental pressure. Youth athletes who specialize in a single sport before age 12 have a 70-93% higher burnout rate. Prevention requires diversified sport participation, rest periods, and athlete-centered decision-making.",
     "properties": {"severity": "critical", "evidence_grade": "A"}},

    # =========================================================================
    # EXERCISES — Football (10)
    # =========================================================================

    {"entity_type": "exercise", "name": "rondo_possession", "display_name": "Rondo / Possession Drill",
     "description": "Small-group possession game (3v1, 4v2, 5v2) — develops first touch, passing speed, decision-making under pressure, and spatial awareness. Low physical load but high cognitive demand. Appropriate for all PHV stages. Used by elite academies (Barcelona, Ajax) as a foundational training element. Scales difficulty via grid size, touch limits, and defender count.",
     "properties": {"sport": "football", "intensity": "moderate", "load_type": "technical", "phv_safe": True}},

    {"entity_type": "exercise", "name": "small_sided_game", "display_name": "Small-Sided Game (SSG)",
     "description": "Conditioned small-sided game (3v3 to 7v7) — replicates match demands in compressed space. Increases ball contacts 2-5x compared to full match. Develops tactical understanding, positional play, and match fitness simultaneously. Manipulate pitch size, player numbers, and rules to target specific physical and tactical outcomes. Heart rate typically reaches 85-95% HRmax.",
     "properties": {"sport": "football", "intensity": "high", "hr_zone": "85-95%", "load_type": "match_simulation"}},

    {"entity_type": "exercise", "name": "crossing_drill", "display_name": "Crossing & Finishing Drill",
     "description": "Combined crossing and finishing practice — develops wide-play delivery technique, timing of runs, heading mechanics, and volleying. Full-backs and wingers practice delivery from touchline; strikers and midfielders work finishing. Integrate goalkeeper involvement. Moderate intensity with sprinting components for crossing runs.",
     "properties": {"sport": "football", "intensity": "moderate-high", "positions": ["FB", "CM", "CAM", "ST"]}},

    {"entity_type": "exercise", "name": "shooting_practice", "display_name": "Shooting Practice",
     "description": "Structured shooting practice from various angles and distances — develops striking technique, placement accuracy, and shot power. Include one-touch finishes, volleys, headers, and shots after dribbling. Progressive overload via adding defenders, time pressure, or movement patterns. Moderate to high intensity depending on recovery demands between repetitions.",
     "properties": {"sport": "football", "intensity": "moderate-high", "positions": ["ST", "CAM", "CM"]}},

    {"entity_type": "exercise", "name": "defensive_shape_drill", "display_name": "Defensive Shape & Organization Drill",
     "description": "Team defensive organization training — develops compactness, pressing triggers, cover-shadow positioning, and transition awareness. Practices defensive block shape (low, mid, high) and coordinated pressing sequences. Low physical intensity but high cognitive load. Essential for center-backs and defensive midfielders. Use overload situations (attack vs defense) to stress decision-making.",
     "properties": {"sport": "football", "intensity": "moderate", "positions": ["CB", "CM", "GK"], "load_type": "tactical"}},

    {"entity_type": "exercise", "name": "positional_play_drill", "display_name": "Positional Play Drill (Juego de Posicion)",
     "description": "Position-specific tactical training emphasizing spatial occupation, rotations, and third-man combinations. Players maintain positional structure while creating numerical superiority in zones. Develops football IQ, scanning habits, and positional discipline. Moderate intensity with periods of high cognitive demand. Foundational methodology at Barcelona, Manchester City, and Bayern Munich academies.",
     "properties": {"sport": "football", "intensity": "moderate", "load_type": "tactical", "phv_safe": True}},

    {"entity_type": "exercise", "name": "set_piece_practice", "display_name": "Set Piece Practice",
     "description": "Corners, free kicks, throw-ins, and penalty routines — structured rehearsal of dead-ball situations that account for 25-35% of goals in professional football. Develops delivery accuracy, movement patterns, blocking/screening, and defensive marking. Low physical intensity but high precision demand. Allocate 10-15 minutes per training session for set-piece rehearsal.",
     "properties": {"sport": "football", "intensity": "low-moderate", "load_type": "technical"}},

    {"entity_type": "exercise", "name": "goalkeeping_drill", "display_name": "Goalkeeping Drill",
     "description": "Position-specific goalkeeper training — shot-stopping, distribution, cross collection, 1v1 scenarios, and footwork. Develops diving technique, positioning, communication, and decision-making. Separate from outfield sessions to allow position-appropriate volume. High CNS demand from reactive movements. Include kicking practice for distribution accuracy.",
     "properties": {"sport": "football", "intensity": "high", "positions": ["GK"], "load_type": "position_specific"}},

    {"entity_type": "exercise", "name": "pressing_drill", "display_name": "Pressing & Counter-Press Drill",
     "description": "Coordinated team pressing exercises — develops pressing triggers (poor touch, backwards pass, isolated player), pressing shape, and counter-pressing (gegenpressing) after losing possession. High-intensity with anaerobic demands. Work-to-rest ratios typically 1:2. Builds match fitness while developing tactical cohesion. Progressive overload via pitch dimensions and transition speed requirements.",
     "properties": {"sport": "football", "intensity": "high", "load_type": "tactical_physical"}},

    {"entity_type": "exercise", "name": "tactical_periodization_session", "display_name": "Tactical Periodization Session",
     "description": "Training session structured around Vitor Frade's tactical periodization methodology — organizes the training week by game model sub-principles with matched physical demands. Acquisition day (highest intensity), recovery day (lowest), and activation day (pre-match). Integrates tactical, technical, physical, and psychological elements within every exercise. The dominant methodology in elite football coaching.",
     "properties": {"sport": "football", "intensity": "varies", "load_type": "integrated"}},

    # =========================================================================
    # EXERCISES — Basketball (8)
    # =========================================================================

    {"entity_type": "exercise", "name": "layup_drill", "display_name": "Layup & Finishing Drill",
     "description": "Progressive layup drill — develops footwork, hand-eye coordination, finishing touch, and body control around the basket. Start with basic right/left hand layups, progress to reverse layups, euro-steps, and floaters. Include contact finishing with pads. Safe for all PHV stages at bodyweight. Critical for guards and forwards.",
     "properties": {"sport": "basketball", "intensity": "moderate", "phv_safe": True, "positions": ["guard", "forward"]}},

    {"entity_type": "exercise", "name": "free_throw_practice", "display_name": "Free Throw Practice",
     "description": "Structured free throw shooting practice — develops consistent shooting mechanics, pre-shot routine, and mental focus under pressure. Use fatigue-induced conditions (shoot after sprints) to simulate game situations. Track shooting percentage to measure improvement. Low physical intensity but high precision and concentration demand. Minimum 50 repetitions per session for meaningful development.",
     "properties": {"sport": "basketball", "intensity": "low", "load_type": "technical", "phv_safe": True}},

    {"entity_type": "exercise", "name": "defensive_slides", "display_name": "Defensive Slides & Closeouts",
     "description": "Lateral defensive slide drills with closeout technique — develops hip flexibility, lateral quickness, on-ball defensive positioning, and stance endurance. Include zig-zag slides, triangle slides, and closeout-recover patterns. High eccentric demand on groin and hip adductors. Groin prehab (Copenhagen adduction) recommended as prerequisite for high-volume defensive slide work.",
     "properties": {"sport": "basketball", "intensity": "high", "load_type": "agility"}},

    {"entity_type": "exercise", "name": "pick_and_roll_drill", "display_name": "Pick and Roll / Pop Drill",
     "description": "Two-player pick-and-roll execution and defensive coverage drill — the most frequently used play in modern basketball. Develops screening technique, rolling/popping reads, ball-handler decision-making, and defensive switching/hedging communication. Include ICE, drop, switch, and blitz coverages. Moderate physical intensity with high cognitive demand.",
     "properties": {"sport": "basketball", "intensity": "moderate", "load_type": "tactical", "phv_safe": True}},

    {"entity_type": "exercise", "name": "three_point_shooting", "display_name": "Three-Point Shooting Drill",
     "description": "Spot-up, off-screen, and pull-up three-point shooting practice — develops range, catch-and-shoot mechanics, footwork, and shot selection. For youth athletes (U13-U15), use a shorter distance or lighter ball to prevent compensatory mechanics from a full-distance three-point line. Emphasize form over distance until post-PHV strength development allows proper technique at regulation range.",
     "properties": {"sport": "basketball", "intensity": "low-moderate", "load_type": "technical"}},

    {"entity_type": "exercise", "name": "fast_break_drill", "display_name": "Fast Break & Transition Drill",
     "description": "Full-court transition offense drill — develops speed in transition, outlet passing, filling lanes, and finishing in 1v0, 2v1, and 3v2 situations. High-intensity running with anaerobic and aerobic components. Include defensive transition (getting back) as equal priority. Teaches decision-making at speed: when to push tempo versus when to organize in half-court.",
     "properties": {"sport": "basketball", "intensity": "high", "load_type": "conditioning_tactical"}},

    {"entity_type": "exercise", "name": "rebounding_drill", "display_name": "Rebounding & Box-Out Drill",
     "description": "Offensive and defensive rebounding technique drill — develops positioning, box-out mechanics, timing, and pursuit of the ball. Include tipping, putback layups, and outlet passing. Physical contact element requires controlled environment. Emphasize lower-body positioning power rather than vertical jumping for U13-U15 athletes to protect knee and ankle joints during growth.",
     "properties": {"sport": "basketball", "intensity": "moderate-high", "load_type": "physical_technical"}},

    {"entity_type": "exercise", "name": "ball_handling_drill", "display_name": "Ball Handling & Dribbling Drill",
     "description": "Progressive ball-handling development — stationary dribbling (crossovers, between legs, behind back), moving patterns, two-ball drills, and game-speed moves against live defenders. Develops hand-eye coordination, proprioception, and confidence with the ball. Very low injury risk and suitable for all PHV stages. The most transferable skill in youth basketball development.",
     "properties": {"sport": "basketball", "intensity": "low-moderate", "phv_safe": True, "load_type": "technical"}},

    # =========================================================================
    # EXERCISES — Padel (8)
    # =========================================================================

    {"entity_type": "exercise", "name": "bandeja_shot", "display_name": "Bandeja Shot Drill",
     "description": "Overhead padel-specific shot practice — the bandeja is the most important defensive overhead in padel, hit with slice to neutralize lobs and regain net position. Develops shoulder endurance, wrist stability, and footwork for overhead positioning. Moderate shoulder stress; monitor for impingement symptoms in athletes with overhead volume. Progress from feed to rally to match-play situations.",
     "properties": {"sport": "padel", "intensity": "moderate", "load_type": "technical", "body_stress": "shoulder"}},

    {"entity_type": "exercise", "name": "vibora_shot", "display_name": "Vibora Shot Drill",
     "description": "Aggressive overhead padel shot practice — the vibora adds topspin and power to the overhead game, hit with a pronation snap. Higher shoulder and wrist stress than the bandeja. Contraindicated for athletes with active shoulder impingement or tennis elbow. Develop bandeja competency first as prerequisite. Used to pressure opponents and finish points from the net position.",
     "properties": {"sport": "padel", "intensity": "moderate-high", "load_type": "technical_power", "body_stress": "shoulder_wrist"}},

    {"entity_type": "exercise", "name": "wall_rebound_drill", "display_name": "Wall Rebound & Glass Play Drill",
     "description": "Padel-specific wall and glass rebound practice — the unique element of padel is playing the ball off back and side walls. Develops spatial awareness, timing, positioning, and shot selection after the bounce. Include back-wall exits (bajada), side-wall volleys, and double-wall plays. Low physical intensity but very high cognitive and perceptual demand. Essential for padel tactical development.",
     "properties": {"sport": "padel", "intensity": "moderate", "load_type": "technical_tactical", "phv_safe": True}},

    {"entity_type": "exercise", "name": "service_drill_padel", "display_name": "Padel Service Drill",
     "description": "Padel serve practice — underarm serve technique with tactical placement (body, T-wall, side wall). Unlike tennis, padel serves are hit below waist height with an underarm motion. Develops consistency, placement accuracy, and spin variation. Very low injury risk. Practice serve-plus-one patterns (serve and first volley positioning) to develop point construction from serve.",
     "properties": {"sport": "padel", "intensity": "low", "load_type": "technical", "phv_safe": True}},

    {"entity_type": "exercise", "name": "net_volley_drill", "display_name": "Net Volley Drill (Padel)",
     "description": "Padel net play practice — volleys, bandeja preparation volleys, and block volleys from the net position. Padel is dominated by the team that controls the net. Develops soft hands, reflexes, split-step timing, and partner communication. Include transitional volleys moving from defense (back of court) to offense (net). Moderate wrist stress; grip size and racket weight should be age-appropriate.",
     "properties": {"sport": "padel", "intensity": "moderate", "load_type": "technical_reactive"}},

    {"entity_type": "exercise", "name": "lob_defense_drill", "display_name": "Lob Defense & Recovery Drill",
     "description": "Defensive lob recovery drill — trains the transition from net position back to the baseline when opponents lob overhead. Develops backward movement patterns, overhead shot selection (bandeja, vibora, or smash), and recovery footwork to regain net position. High lateral and backward movement demands. Include partner coordination for switching sides. Simulates the most common tactical pattern in padel.",
     "properties": {"sport": "padel", "intensity": "moderate-high", "load_type": "tactical_physical"}},

    {"entity_type": "exercise", "name": "footwork_split_step", "display_name": "Split-Step & Footwork Drill (Padel/Tennis)",
     "description": "Reactive footwork drill centered on the split-step — the foundational movement pattern in racket sports. Time the split-step to opponent contact, land in a balanced athletic stance, then explode to the ball. Develops reaction time, first-step quickness, and court coverage efficiency. Include multi-directional patterns: lateral, forward, backward, and diagonal. Safe for all PHV stages.",
     "properties": {"sport": "padel", "intensity": "moderate", "load_type": "agility", "phv_safe": True, "also_for": ["tennis"]}},

    {"entity_type": "exercise", "name": "doubles_positioning_drill", "display_name": "Doubles Positioning & Communication Drill",
     "description": "Padel doubles tactical positioning practice — padel is exclusively a doubles sport. Develops court coverage zones, partner rotation patterns, verbal and visual communication, and tactical decision-making (when to stay/switch). Include attack formation (both at net) and defense formation (both at baseline). Low physical intensity but high tactical complexity.",
     "properties": {"sport": "padel", "intensity": "low-moderate", "load_type": "tactical", "phv_safe": True}},

    # =========================================================================
    # EXERCISES — Tennis (8)
    # =========================================================================

    {"entity_type": "exercise", "name": "serve_practice", "display_name": "Tennis Serve Practice",
     "description": "Structured tennis serve development — the most important and most technically complex stroke in tennis. Progressive development: continental grip, trophy position, pronation, and follow-through. Include flat, slice, and kick serve variations. High shoulder demand; monitor serve volume carefully in youth (max 50-75 serves per session for U15). Shoulder prehab is prerequisite for high-volume serve training.",
     "properties": {"sport": "tennis", "intensity": "moderate-high", "body_stress": "shoulder", "max_reps_u15": "50-75"}},

    {"entity_type": "exercise", "name": "baseline_rally_drill", "display_name": "Baseline Rally Drill",
     "description": "Groundstroke rally practice from the baseline — develops forehand and backhand consistency, depth control, directional changes, and shot tolerance. Use cross-court and down-the-line patterns with target zones. Include movement patterns: recovery to center, wide-ball footwork, and inside-out positioning. Moderate to high intensity depending on rally pace and duration. Core tennis training element.",
     "properties": {"sport": "tennis", "intensity": "moderate-high", "load_type": "technical_endurance"}},

    {"entity_type": "exercise", "name": "volley_drill_tennis", "display_name": "Volley Drill (Tennis)",
     "description": "Net approach and volley technique practice — develops punch volley, drop volley, and half-volley technique. Include split-step timing, approach shot selection, and closing mechanics. Modern tennis requires all-court capability. Low-to-moderate physical intensity with high hand-eye coordination demand. Wrist stability is essential; monitor for signs of overuse in forearm extensors.",
     "properties": {"sport": "tennis", "intensity": "moderate", "load_type": "technical"}},

    {"entity_type": "exercise", "name": "return_of_serve_drill", "display_name": "Return of Serve Drill",
     "description": "Service return practice — develops split-step timing, read and react speed, compact swing adaptations for fast serves, and return positioning. The return of serve is the second most important skill in tennis after the serve itself. Include block returns, drive returns, and chip-and-charge patterns. High reactive demand with short burst movement patterns.",
     "properties": {"sport": "tennis", "intensity": "moderate-high", "load_type": "reactive_technical"}},

    {"entity_type": "exercise", "name": "slice_backhand_drill", "display_name": "Slice Backhand Drill",
     "description": "Slice backhand technique development — an essential defensive and transitional shot. Develops underspin control, approach shot capability, and drop shot touch. Lower physical demand than topspin strokes. Uses an open racket face with a high-to-low swing path. Particularly important for single-handed backhand players. Also serves as the foundation for volley technique development.",
     "properties": {"sport": "tennis", "intensity": "low-moderate", "load_type": "technical", "phv_safe": True}},

    {"entity_type": "exercise", "name": "approach_shot_drill", "display_name": "Approach Shot & Net Transition Drill",
     "description": "Approach shot technique and transition practice — develops shot selection, depth, and forward movement to close the net. Include approach off short balls, swing volleys, and first-volley positioning. Combines groundstroke technique with forward movement patterns. Moderate intensity with agility demands. Teaches decision-making: when to approach and when to stay on the baseline.",
     "properties": {"sport": "tennis", "intensity": "moderate", "load_type": "tactical_technical"}},

    {"entity_type": "exercise", "name": "overhead_smash_drill", "display_name": "Overhead Smash Drill",
     "description": "Overhead smash technique practice — develops tracking, positioning, contact point, and power production on high balls. Similar shoulder demands to the serve. Include stationary smashes, retreating smashes, and scissor-kick overheads. Monitor volume in youth athletes due to shoulder stress. Maximum 20-30 smashes per session for U15 athletes. Ensure adequate shoulder warm-up and prehab before overhead work.",
     "properties": {"sport": "tennis", "intensity": "moderate-high", "body_stress": "shoulder", "max_reps_u15": "20-30"}},

    {"entity_type": "exercise", "name": "movement_recovery_drill", "display_name": "Court Movement & Recovery Drill (Tennis)",
     "description": "Tennis-specific movement pattern training — lateral shuffles, crossover steps, split steps, and recovery runs to the center mark. Develops efficient court coverage, deceleration control, and energy system management during long points. Include ghost drills (movement without ball), live-ball directional drills, and match-simulation movement. High-intensity interval demands. Foundation for injury prevention.",
     "properties": {"sport": "tennis", "intensity": "high", "load_type": "conditioning_agility"}},

    # =========================================================================
    # EXERCISES — Athletics / Track & Field (8)
    # =========================================================================

    {"entity_type": "exercise", "name": "block_start_drill", "display_name": "Block Start Drill (Sprints)",
     "description": "Sprint start technique from blocks — develops reaction time, drive phase mechanics, first-step power, and acceleration pattern. Include block spacing (bunched, medium, elongated), set position holds, and first 10m acceleration. High CNS demand and hamstring stress during explosive hip extension. Limit to 6-10 quality repetitions per session. Not recommended for pre-PHV athletes at maximal effort.",
     "properties": {"sport": "athletics", "intensity": "maximal", "event": "sprints", "max_reps": "6-10"}},

    {"entity_type": "exercise", "name": "hurdle_technique_drill", "display_name": "Hurdle Technique Drill",
     "description": "Hurdle clearance technique development — lead leg, trail leg, and three-step rhythm between hurdles. Progressive development using low hurdles (U13), intermediate heights (U15), and competition height (U17+). Develops hip mobility, coordination, rhythm, and speed endurance. Adjust hurdle spacing for stride length. Include hurdle mobility drills (walkovers) as warm-up before speed hurdle work.",
     "properties": {"sport": "athletics", "intensity": "moderate-high", "event": "hurdles", "load_type": "technical_speed"}},

    {"entity_type": "exercise", "name": "throwing_technique", "display_name": "Throwing Technique Drill (Field Events)",
     "description": "Event-specific throwing technique development — shot put, discus, javelin mechanics. Focus on rotational or glide technique (shot), power position, release mechanics, and implement control. Use underweight implements for technique development in U13-U15. High rotational stress on spine and shoulder; monitor for spondylolysis risk in extension-rotation. Gradual implement weight progression as strength develops.",
     "properties": {"sport": "athletics", "intensity": "moderate-high", "event": "throws", "body_stress": "spine_shoulder"}},

    {"entity_type": "exercise", "name": "jump_technique_drill", "display_name": "Jump Technique Drill (Field Events)",
     "description": "Event-specific jumping technique development — long jump approach and takeoff, high jump Fosbury Flop, triple jump phase rhythm. Develops approach speed consistency, penultimate step mechanics, takeoff angle, and flight positioning. Impact forces during takeoff can reach 8-12x body weight. Limit jumping volume in mid-PHV athletes and use reduced approach runs. Landing surface must be appropriate.",
     "properties": {"sport": "athletics", "intensity": "high", "event": "jumps", "grf_multiplier": "8-12x"}},

    {"entity_type": "exercise", "name": "endurance_tempo_session", "display_name": "Endurance Tempo Session",
     "description": "Structured tempo running session for middle-distance and endurance athletes — running at 75-85% of race pace over repeated intervals (e.g., 6x400m, 4x800m). Develops lactate threshold, running economy, and pacing awareness. Lower injury risk than speed work. Appropriate for all PHV stages with appropriate pace adjustments. Heart rate monitoring ensures correct intensity zone.",
     "properties": {"sport": "athletics", "intensity": "moderate-high", "event": "middle_distance", "hr_zone": "75-85%"}},

    {"entity_type": "exercise", "name": "speed_development_session", "display_name": "Speed Development Session",
     "description": "Maximal speed development session — flying sprints (10-30m at 95-100%), acceleration runs (0-30m), and speed endurance reps (60-150m at 90-95%). Targets neural factors: motor unit recruitment, rate coding, and intermuscular coordination. Requires full CNS recovery (48-72h between sessions). Maximum 300m total high-intensity sprint volume per session. GREEN readiness required.",
     "properties": {"sport": "athletics", "intensity": "maximal", "event": "sprints", "max_volume_m": 300}},

    {"entity_type": "exercise", "name": "coordination_circuit", "display_name": "Coordination & ABC Drills Circuit",
     "description": "Athletics-specific coordination circuit — A-skip, B-skip, C-skip, high knees, butt kicks, carioca, and bounding drills. Develops running mechanics, neuromuscular coordination, hip flexor activation, and elastic strength. Forms the foundation of every athletics warm-up. Safe for all PHV stages and ages. Start every training session with 10-15 minutes of ABC drills before sport-specific work.",
     "properties": {"sport": "athletics", "intensity": "moderate", "load_type": "coordination", "phv_safe": True}},

    {"entity_type": "exercise", "name": "event_specific_conditioning", "display_name": "Event-Specific Conditioning",
     "description": "Metabolic conditioning tailored to athletics event demands — sprint events require alactic/lactic power (phosphocreatine and glycolytic systems), middle distance requires lactate tolerance, throws/jumps require explosive power with recovery. Session design must match the bioenergetic demands of the target event. Use work-to-rest ratios that mirror competition demands.",
     "properties": {"sport": "athletics", "intensity": "high", "load_type": "energy_system_specific"}},

    # =========================================================================
    # EXERCISES — General / Prehab / Strength (8)
    # =========================================================================

    {"entity_type": "exercise", "name": "nordic_hamstring_curl", "display_name": "Nordic Hamstring Curl",
     "description": "Eccentric hamstring strengthening exercise — the gold-standard evidence-based exercise for hamstring injury prevention. Reduces hamstring injury incidence by 51% (meta-analysis). Develops eccentric strength at long muscle lengths where most hamstring strains occur. Progressive overload: assisted (band), bodyweight, weighted. Minimum 2x/week, 3-4 sets of 4-8 reps. Include in all running-sport programs.",
     "properties": {"intensity": "high", "load_type": "eccentric", "evidence_grade": "A", "injury_prevention": True}},

    {"entity_type": "exercise", "name": "copenhagen_adduction", "display_name": "Copenhagen Adduction Exercise",
     "description": "Side-lying adductor strengthening exercise — reduces groin injury risk by 41% in football players. Develops adductor strength, hip stability, and core control. Progressive overload from short lever (knee support) to long lever (ankle support) to dynamic variations. Essential for football, basketball, and tennis athletes who perform frequent change-of-direction movements. 2-3x/week, 2-3 sets of 6-10 reps.",
     "properties": {"intensity": "moderate-high", "load_type": "isometric_eccentric", "evidence_grade": "A", "injury_prevention": True}},

    {"entity_type": "exercise", "name": "single_leg_romanian_deadlift", "display_name": "Single-Leg Romanian Deadlift",
     "description": "Unilateral hip-hinge pattern exercise — develops posterior chain strength (hamstrings, glutes), balance, and hip stability on a single leg. Addresses bilateral strength asymmetries that increase injury risk. Safe alternative to heavy bilateral deadlift for mid-PHV athletes when performed with bodyweight or light load. Essential movement pattern for all running and jumping sports.",
     "properties": {"intensity": "moderate", "load_type": "bodyweight_to_loaded", "phv_safe": True}},

    {"entity_type": "exercise", "name": "plank_variations", "display_name": "Plank Variations",
     "description": "Isometric and dynamic core stabilization exercises — front plank, side plank, anti-rotation pallof press, dead bug, and bird dog progressions. Develops the ability to maintain neutral spine under load, resist rotation, and transfer force between upper and lower extremities. Core stability is the foundation of all athletic movement. Safe for all PHV stages. Include in every warm-up and strength session.",
     "properties": {"intensity": "low-moderate", "load_type": "isometric", "phv_safe": True}},

    {"entity_type": "exercise", "name": "glute_bridge_variations", "display_name": "Glute Bridge Variations",
     "description": "Hip extension exercises targeting glute activation — double-leg bridge, single-leg bridge, hip thrust progressions, and banded variations. Addresses glute inhibition (gluteal amnesia), a common finding in athletes with hip flexor tightness from prolonged sitting. Glute strength protects the knee (controls valgus) and lower back (reduces lumbar extension stress). Safe for all PHV stages.",
     "properties": {"intensity": "low-moderate", "load_type": "bodyweight_to_loaded", "phv_safe": True}},

    {"entity_type": "exercise", "name": "hip_mobility_complex", "display_name": "Hip Mobility Complex",
     "description": "Comprehensive hip mobility routine — 90/90 transitions, hip CARs (controlled articular rotations), pigeon stretch, frog stretch, and hip flexor lunge stretches. Addresses the hip mobility deficit that develops during mid-PHV as rapid bone growth outpaces soft tissue lengthening. Essential for football (kicking), athletics (sprinting), and padel/tennis (lateral movement). Include 5-10 minutes pre-training.",
     "properties": {"intensity": "low", "load_type": "mobility", "phv_safe": True}},

    {"entity_type": "exercise", "name": "ankle_mobility_work", "display_name": "Ankle Mobility & Proprioception Work",
     "description": "Ankle dorsiflexion mobility and proprioceptive stability training — banded ankle mobilizations, calf stretching (gastrocnemius and soleus), single-leg balance progressions, and BOSU/wobble board work. Limited ankle dorsiflexion is a risk factor for ACL injury, patellar tendinopathy, and Achilles problems. Proprioceptive training reduces ankle sprain recurrence by 40-50%. Daily inclusion recommended.",
     "properties": {"intensity": "low", "load_type": "mobility_stability", "phv_safe": True, "evidence_grade": "A"}},

    {"entity_type": "exercise", "name": "shoulder_prehab_routine", "display_name": "Shoulder Prehab Routine",
     "description": "Shoulder injury prevention program — external rotation strengthening with bands, scapular stability exercises (I-Y-T raises, wall slides, serratus punches), and rotator cuff activation. Essential for all overhead athletes (tennis, padel, basketball). External-to-internal rotation strength ratio should be 66-75% for shoulder health. Perform before every overhead training session. 10-15 minutes, 2-3 sets of 10-15 reps.",
     "properties": {"intensity": "low-moderate", "load_type": "prehab", "phv_safe": True, "evidence_grade": "A"}},

    # =========================================================================
    # PROTOCOLS (~15)
    # =========================================================================

    {"entity_type": "protocol", "name": "dynamic_warmup", "display_name": "Dynamic Warm-Up Protocol",
     "description": "Structured progressive warm-up: 5 minutes light jogging, 5 minutes dynamic stretching (leg swings, arm circles, hip openers), 5 minutes sport-specific activation (progressive sprints, agility patterns, technical touches). Increases core temperature by 1-2 degrees Celsius, activates neuromuscular pathways, and reduces injury risk by 30-50%. Static stretching is excluded; research shows it impairs power output acutely.",
     "properties": {"duration_min": 15, "evidence_grade": "A"}},

    {"entity_type": "protocol", "name": "sport_specific_cooldown", "display_name": "Sport-Specific Cool-Down Protocol",
     "description": "Post-training cool-down routine: 5 minutes of gradually decreasing intensity exercise, 5 minutes of sport-specific static stretching (holding 20-30 seconds per stretch), 5 minutes of breathing and parasympathetic activation. Facilitates the transition from sympathetic (fight-or-flight) to parasympathetic (rest-and-digest) nervous system dominance. Promotes recovery hormone release.",
     "properties": {"duration_min": 15, "evidence_grade": "B+"}},

    {"entity_type": "protocol", "name": "periodization_mesocycle", "display_name": "Mesocycle Periodization Plan",
     "description": "Structured 4-6 week mesocycle block — each mesocycle targets a specific physical quality: accumulation (volume), transmutation (intensity), or realization (competition readiness). Week-to-week progressive overload of 5-10% followed by a deload week. For youth athletes, mesocycles should include multi-quality training (not pure isolation blocks) to support broad development during growth-sensitive periods.",
     "properties": {"duration_weeks": "4-6", "evidence_grade": "A"}},

    {"entity_type": "protocol", "name": "tapering_protocol", "display_name": "Competition Tapering Protocol",
     "description": "Pre-competition taper strategy — reduce training volume by 40-60% while maintaining or slightly increasing intensity over 7-14 days before major competition. Maintains neuromuscular sharpness while allowing physiological supercompensation. Performance improvement of 2-3% is typical. For youth athletes, taper duration is shorter (5-7 days) as recovery capacity is faster. Maintain sport-specific practice frequency.",
     "properties": {"volume_reduction": "40-60%", "duration_days": "7-14", "performance_gain": "2-3%", "evidence_grade": "A"}},

    {"entity_type": "protocol", "name": "altitude_training_adaptation", "display_name": "Altitude Training Adaptation Protocol",
     "description": "Altitude or simulated altitude exposure for enhanced erythropoiesis — live high (2000-2500m), train low (<1300m) is the gold standard. Minimum 3-4 weeks exposure for meaningful red blood cell mass increase. EPO response peaks at 24-48 hours of altitude exposure. Only applicable to U19+ athletes with established aerobic base. Younger athletes should focus on foundational development rather than marginal physiological gains.",
     "properties": {"altitude_m": "2000-2500", "duration_weeks": "3-4", "evidence_grade": "A"}},

    {"entity_type": "protocol", "name": "mental_performance_routine", "display_name": "Mental Performance Routine",
     "description": "Structured pre-performance mental preparation — combines breathing regulation (4-7-8 pattern or box breathing), positive self-talk scripts, focus cue words, and body-scan relaxation. Develops consistent pre-competition activation state. Begin training at U13 with simple breathing and self-talk, progressing to comprehensive routines by U17. Include process-focused goals (effort, technique) rather than outcome goals (winning).",
     "properties": {"evidence_grade": "A", "start_age": "U13"}},

    {"entity_type": "protocol", "name": "pre_competition_visualization", "display_name": "Pre-Competition Visualization Protocol",
     "description": "Mental imagery and visualization training — systematic practice of seeing and feeling successful performance in the mind before competition. PETTLEP model: Physical, Environment, Task, Timing, Learning, Emotion, Perspective. Include all senses (visual, kinesthetic, auditory). Practice 10-15 minutes, 3-4x/week for skill development, and 5-10 minutes pre-competition. Effectiveness increases with training age.",
     "properties": {"duration_min": "10-15", "frequency": "3-4x/week", "evidence_grade": "A"}},

    {"entity_type": "protocol", "name": "youth_long_term_development", "display_name": "Youth Long-Term Athlete Development (LTAD) Protocol",
     "description": "Structured long-term athlete development framework — Active Start (0-6), FUNdamentals (6-9), Learn to Train (9-12), Train to Train (12-15), Train to Compete (15-18), Train to Win (18+). Early specialization (before age 12) increases burnout and overuse injury risk. Sampling multiple sports develops broader motor patterns and intrinsic motivation. Deliberate play should exceed deliberate practice until U15.",
     "properties": {"stages": 6, "evidence_grade": "A"}},

    {"entity_type": "protocol", "name": "fundamental_movement_screen", "display_name": "Fundamental Movement Screen (FMS) Protocol",
     "description": "Standardized movement quality assessment — tests deep squat, hurdle step, in-line lunge, shoulder mobility, active straight leg raise, trunk stability push-up, and rotary stability. Identifies movement asymmetries and limitations that predict injury risk. Score below 14/21 indicates elevated injury risk. Use to guide individualized corrective exercise programs. Re-screen every 8-12 weeks to track improvement.",
     "properties": {"max_score": 21, "risk_threshold": 14, "rescreen_weeks": "8-12", "evidence_grade": "B+"}},

    {"entity_type": "protocol", "name": "graded_return_to_sport", "display_name": "Graded Return-to-Sport Protocol",
     "description": "Evidence-based graduated return following injury — Stage 1: pain-free ROM and daily activities, Stage 2: light aerobic exercise (walking, swimming), Stage 3: sport-specific drills (no contact), Stage 4: full training with contact, Stage 5: return to competition. Each stage minimum 24-48 hours, with regression to previous stage if symptoms increase. Objective criteria (strength tests, functional tests) must be met before progression.",
     "properties": {"stages": 5, "min_hours_per_stage": 24, "evidence_grade": "A"}},

    {"entity_type": "protocol", "name": "heat_acclimatization", "display_name": "Heat Acclimatization Protocol",
     "description": "Progressive heat exposure over 10-14 days — begin with 50% of normal training volume and intensity in heat, increasing by 10% daily. Physiological adaptations include decreased core temperature, increased sweat rate, expanded plasma volume, and lower heart rate during exercise in heat. Youth athletes are more vulnerable to heat illness due to higher surface-area-to-mass ratio and lower sweat rates. Hydration monitoring is essential.",
     "properties": {"duration_days": "10-14", "evidence_grade": "A"}},

    {"entity_type": "protocol", "name": "injury_prevention_program", "display_name": "Injury Prevention Program (FIFA 11+/KNEE/KIPP)",
     "description": "Structured neuromuscular warm-up program replacing the traditional warm-up — FIFA 11+ reduces injuries by 30-50% in football. Components: running exercises, strength (planks, single-leg balance, squats, hamstring curls), and plyometrics (jumping, cutting). Takes 20 minutes, performed 2-3x/week. Adaptations exist for all sports. Compliance is the critical success factor — programs only work if done consistently.",
     "properties": {"duration_min": 20, "frequency": "2-3x/week", "injury_reduction": "30-50%", "evidence_grade": "A"}},

    {"entity_type": "protocol", "name": "athlete_monitoring_protocol", "display_name": "Athlete Monitoring Protocol",
     "description": "Systematic daily and weekly athlete monitoring — daily wellness questionnaire (sleep quality, fatigue, soreness, stress, mood on 1-5 scale), weekly training load tracking (sRPE x duration), monthly performance testing (sport-specific benchmarks). Calculate ACWR weekly. Flag athletes who exceed ACWR 1.5, report consecutive poor wellness scores, or show performance decline >10%. Enables proactive rather than reactive load management.",
     "properties": {"evidence_grade": "A"}},

    {"entity_type": "protocol", "name": "strength_phase_protocol", "display_name": "Maximal Strength Phase Protocol",
     "description": "Structured maximal strength development block (3-6 weeks) — post-PHV athletes only (U17+). Loading parameters: 85-95% 1RM, 1-5 reps, 3-5 sets, 3-5 minutes rest between sets, 2-3 sessions/week. Compound movements only (squat, deadlift, bench press, pull-up). Progressive overload via load increase (2.5-5% per week). Requires established movement competency and minimum 6 months of general strength training background.",
     "properties": {"age_minimum": "U17", "load_pct": "85-95%", "reps": "1-5", "duration_weeks": "3-6", "evidence_grade": "A"}},

    {"entity_type": "protocol", "name": "power_phase_protocol", "display_name": "Power Development Phase Protocol",
     "description": "Explosive power development block (3-4 weeks) — follows a maximal strength phase. Loading: 30-70% 1RM moved with maximal intent (velocity-based if available), 1-5 reps, 3-5 sets, 3-5 minutes rest. Exercises: Olympic lift derivatives, jump squats, medicine ball throws, plyometrics. For U15-U17, use bodyweight and light implements only. Power development requires a strength foundation (squat >1.5x BW ideally).",
     "properties": {"load_pct": "30-70%", "reps": "1-5", "prerequisite": "strength_base", "duration_weeks": "3-4", "evidence_grade": "A"}},

    # =========================================================================
    # CONCEPTS — Sports Science (~15)
    # =========================================================================

    {"entity_type": "concept", "name": "ltad_model", "display_name": "Long-Term Athlete Development (LTAD) Model",
     "description": "Framework for youth sport development based on biological maturation stages rather than chronological age. Key principle: the right training at the right time. Early diversification (pre-U12) produces more resilient, adaptable athletes than early specialization. Windows of trainability for speed, strength, flexibility, and endurance align with growth and maturation stages. Foundational model for all Tomo youth coaching decisions.",
     "properties": {"evidence_grade": "A"}},

    {"entity_type": "concept", "name": "relative_age_effect", "display_name": "Relative Age Effect (RAE)",
     "description": "Selection bias in youth sport where athletes born earlier in the selection year are overrepresented at higher levels — up to 2x in some sports at U13-U15. A January-born U13 may have 11 months more physical maturation than a December-born peer. Creates false talent identification based on early physical maturity rather than skill potential. Bio-banding (grouping by maturation stage) addresses this bias.",
     "properties": {"evidence_grade": "A"}},

    {"entity_type": "concept", "name": "growth_mindset", "display_name": "Growth Mindset in Sport",
     "description": "Carol Dweck's mindset theory applied to athletic development — athletes with a growth mindset view ability as developable through effort, persist through setbacks, and embrace challenges. Fixed-mindset athletes avoid difficulty and interpret failure as permanent limitation. Coaching language matters: praise effort and process, not talent. Growth mindset correlates with greater resilience, longer sport participation, and higher achievement in youth athletes.",
     "properties": {"evidence_grade": "A"}},

    {"entity_type": "concept", "name": "deliberate_practice", "display_name": "Deliberate Practice",
     "description": "Structured, purposeful practice with specific improvement goals, immediate feedback, and repetition at the edge of current ability. Distinct from play (fun-focused) and drills (repetition without feedback). Research suggests 10 years or 10,000 hours of deliberate practice for expertise, though this oversimplifies. In youth sport, deliberate play (unstructured, athlete-led) should exceed deliberate practice until U15 to maintain motivation.",
     "properties": {"evidence_grade": "B+"}},

    {"entity_type": "concept", "name": "dual_task_training", "display_name": "Dual-Task Training",
     "description": "Performing cognitive and motor tasks simultaneously — develops the ability to maintain technical execution while processing game information. Examples: dribbling while solving math problems, passing while scanning for numbers held up by coaches. Transfers directly to match performance where athletes must execute skills under cognitive pressure (reading opponents, communicating, making decisions). More effective than blocked single-task practice.",
     "properties": {"evidence_grade": "B+"}},

    {"entity_type": "concept", "name": "rate_of_force_development", "display_name": "Rate of Force Development (RFD)",
     "description": "The speed at which force can be produced — often more important than maximal force in sport because ground contact times in sprinting (80-100ms) and cutting (150-250ms) are shorter than the time needed to reach peak force (300ms+). Plyometric training, ballistic lifts, and reactive agility drills develop RFD. Trainable from U13 with low-impact plyometrics. The primary differentiator between good and elite athletes.",
     "properties": {"evidence_grade": "A"}},

    {"entity_type": "concept", "name": "eccentric_training_principle", "display_name": "Eccentric Training Principle",
     "description": "Training modality emphasizing the lengthening (eccentric) phase of muscle contraction — muscles can produce 20-40% more force eccentrically than concentrically. Eccentric overload develops injury-resilient tissue, particularly at long muscle lengths where strains occur. Nordic hamstring curls and single-leg Romanian deadlifts are archetypal eccentric exercises. Essential for hamstring, groin, and Achilles injury prevention programs.",
     "properties": {"evidence_grade": "A"}},

    {"entity_type": "concept", "name": "neuromuscular_control", "display_name": "Neuromuscular Control",
     "description": "The unconscious trained response of muscles to stabilize joints during dynamic movement — encompasses proprioception, balance, postural control, and reactive joint stability. Deficits in neuromuscular control are the primary modifiable risk factor for ACL injury. Trainable through balance exercises, perturbation training, plyometrics, and sport-specific agility. Programs like FIFA 11+ target neuromuscular control specifically.",
     "properties": {"evidence_grade": "A"}},

    {"entity_type": "concept", "name": "periodization_theory", "display_name": "Periodization Theory (Matveyev & Beyond)",
     "description": "The systematic planning of training variation over time to maximize adaptation and minimize overtraining. Classical linear periodization (Matveyev) progresses from high volume/low intensity to low volume/high intensity. Undulating (daily/weekly variation) and block periodization (concentrated loading) offer alternatives. For youth athletes, flexible non-linear approaches accommodate unpredictable growth, academic demands, and multi-sport schedules.",
     "properties": {"evidence_grade": "A"}},

    {"entity_type": "concept", "name": "supercompensation", "display_name": "Supercompensation Cycle",
     "description": "The physiological principle underlying all training adaptation — training provides a stimulus that temporarily reduces fitness (fatigue), followed by recovery that returns fitness to baseline, then supercompensation that elevates fitness above the pre-training level. Optimal training timing loads the next session during the supercompensation window. Too early = accumulating fatigue. Too late = detraining. Recovery duration varies by training type and athlete.",
     "properties": {"evidence_grade": "A"}},

    {"entity_type": "concept", "name": "overreaching_vs_overtraining", "display_name": "Overreaching vs. Overtraining",
     "description": "Critical distinction in load management — functional overreaching (1-2 weeks of intensified training) is a deliberate strategy that yields supercompensation after recovery. Non-functional overreaching (weeks to months of excessive load) impairs performance with recovery requiring weeks. Overtraining syndrome (months of maladaptation) may require months of rest and medical intervention. Monitoring wellness, HRV, and performance prevents the transition from functional to non-functional overreaching.",
     "properties": {"evidence_grade": "A"}},

    {"entity_type": "concept", "name": "training_monotony", "display_name": "Training Monotony & Strain",
     "description": "Training monotony = weekly mean load / standard deviation of daily load. High monotony (>2.0) means every session is similar, reducing adaptive stimulus and increasing illness risk. Training strain = weekly load x monotony. High strain with high monotony is the most dangerous combination for overtraining and illness. Vary session type, intensity, and duration throughout the week to keep monotony below 2.0.",
     "properties": {"threshold": 2.0, "evidence_grade": "A"}},

    {"entity_type": "concept", "name": "glycogen_replenishment", "display_name": "Glycogen Replenishment",
     "description": "Post-exercise muscle glycogen restoration — the rate-limiting factor for recovery between training sessions and matches. Full replenishment requires 24-48 hours with adequate carbohydrate intake (6-10 g/kg/day for high-volume athletes). The 30-minute post-exercise window has the highest glycogen synthase activity (consume 1-1.2 g/kg carbohydrate). Incomplete glycogen restoration before the next session leads to accumulated fatigue and impaired performance.",
     "properties": {"intake_g_per_kg": "6-10", "window_min": 30, "evidence_grade": "A"}},

    {"entity_type": "concept", "name": "protein_synthesis_window", "display_name": "Muscle Protein Synthesis Window",
     "description": "Elevated muscle protein synthesis (MPS) rate after resistance exercise — peaks at 24 hours and remains elevated for 24-48 hours post-training. Protein intake of 0.3-0.5 g/kg per meal (20-40g for most youth athletes) maximizes the MPS response. Distribute protein intake across 4-5 meals/day for optimal 24-hour MPS. Leucine content is the primary trigger; 2-3g leucine per meal is the threshold. Dairy, eggs, and meat are the highest quality protein sources.",
     "properties": {"protein_per_meal_g": "20-40", "leucine_threshold_g": "2-3", "evidence_grade": "A"}},

    {"entity_type": "concept", "name": "bone_mineral_density", "display_name": "Bone Mineral Density in Youth",
     "description": "Bone mass accrual during adolescence — 90% of peak bone mass is achieved by age 18. Weight-bearing and impact activities during PHV maximize bone mineral density for life. The adolescent years represent a unique and irreversible window for bone health investment. Inadequate calcium (1300mg/day for adolescents), vitamin D, and energy intake impair bone development. Athletes with RED-S are at highest risk for stress fractures and long-term bone health compromise.",
     "properties": {"peak_by_age": 18, "calcium_mg_per_day": 1300, "evidence_grade": "A"}},

    # =========================================================================
    # BODY REGIONS (~5 new — wrist already exists in base)
    # NOTE: hamstring is listed as existing in project docs but is NOT in the
    # base seed file, so we add it here to ensure the entity exists.
    # =========================================================================

    {"entity_type": "body_region", "name": "hamstring", "display_name": "Hamstring",
     "description": "Hamstring muscle group — biceps femoris (long and short heads), semimembranosus, and semitendinosus. The most commonly injured muscle group in sprinting and kicking sports. Hamstring strains account for 12-17% of all injuries in football. Eccentric strength at long muscle lengths is the primary modifiable risk factor. The biceps femoris long head is most vulnerable during the late swing phase of sprinting.",
     "properties": {"common_injuries": ["hamstring_strain", "proximal_tendinopathy", "muscle_contusion"]}},

    {"entity_type": "body_region", "name": "elbow", "display_name": "Elbow",
     "description": "Elbow joint complex — medial epicondyle (golfer's elbow) and lateral epicondyle (tennis elbow) are common overuse injury sites in racket sports. Little League elbow (medial apophysitis) is the youth-specific condition caused by repetitive valgus stress. Ulnar collateral ligament stress increases with overhead throwing volume. Forearm strengthening and grip modification are primary prevention strategies.",
     "properties": {"common_injuries": ["lateral_epicondylalgia", "medial_apophysitis", "ucl_stress"]}},

    {"entity_type": "body_region", "name": "core_trunk", "display_name": "Core / Trunk",
     "description": "Core musculature and trunk — the primary force transfer zone between upper and lower body. Includes rectus abdominis, obliques, transversus abdominis, erector spinae, multifidus, and diaphragm. Core stability deficits correlate with lower extremity injury risk (ACL, ankle, hamstring). Athletes with weak core control compensate with excessive lumbar extension, increasing spondylolysis risk. Core training should emphasize anti-movement (resisting rotation, extension, flexion).",
     "properties": {"common_injuries": ["spondylolysis", "lumbar_strain", "oblique_strain"]}},

    {"entity_type": "body_region", "name": "calf", "display_name": "Calf (Gastrocnemius/Soleus)",
     "description": "Calf muscle group — gastrocnemius (fast-twitch, crosses knee and ankle) and soleus (slow-twitch, ankle only). Primary propulsive muscles for sprinting, jumping, and change of direction. Calf strains are increasingly common in youth sport, particularly in athletes with rapid growth (tight Achilles complex). Achilles tendinopathy and Sever's disease (calcaneal apophysitis) are the key youth-specific conditions. Eccentric calf raises are the gold-standard prevention and treatment.",
     "properties": {"common_injuries": ["calf_strain", "achilles_tendinopathy", "severs_disease"]}},

    {"entity_type": "body_region", "name": "neck", "display_name": "Neck (Cervical Spine)",
     "description": "Cervical spine and surrounding musculature — critical for concussion risk management. Stronger neck muscles reduce concussion risk by attenuating head acceleration during impacts. Neck strengthening programs (isometric holds, manual resistance, band exercises) are recommended for all contact and collision sport athletes. Youth athletes have disproportionately large heads relative to neck strength, increasing vulnerability. Include neck strengthening 2-3x/week.",
     "properties": {"common_injuries": ["whiplash", "stinger", "concussion_related"]}},
]


# ==============================================================================
# RELATIONSHIP DEFINITIONS (~300 new relationships)
# ==============================================================================

RELATIONSHIPS: list[dict] = [

    # =========================================================================
    # INJURY CONDITIONS — Triggers, Body Region, Recommendations
    # =========================================================================

    # -- ACL Injury --
    {"source": "acl_injury", "target": "knee", "type": "AFFECTS", "weight": 1.0,
     "properties": {"mechanism": "ACL is the primary stabilizing ligament of the knee joint"}},
    {"source": "acl_injury", "target": "injured", "type": "TRIGGERS", "weight": 1.0,
     "properties": {"mechanism": "ACL tear requires immediate cessation of sport participation"}},
    {"source": "graded_return_to_sport", "target": "acl_injury", "type": "RECOMMENDED_FOR", "weight": 1.0,
     "properties": {"evidence_grade": "A", "note": "9-12 month return-to-sport protocol with criteria-based progression"}},
    {"source": "injury_prevention_program", "target": "acl_injury", "type": "RECOMMENDED_FOR", "weight": 1.0,
     "properties": {"evidence_grade": "A", "note": "FIFA 11+ reduces ACL incidence by 50-70%"}},
    {"source": "neuromuscular_control", "target": "acl_injury", "type": "TREATS", "weight": 0.9,
     "properties": {"mechanism": "Neuromuscular training is the primary modifiable risk reducer for ACL injury"}},
    {"source": "ankle_mobility_work", "target": "acl_injury", "type": "RECOMMENDED_FOR", "weight": 0.7,
     "properties": {"mechanism": "Limited ankle dorsiflexion increases knee valgus and ACL load during cutting"}},

    # -- Hamstring Strain --
    {"source": "hamstring_strain", "target": "hamstring", "type": "AFFECTS", "weight": 1.0,
     "properties": {"mechanism": "Direct injury to hamstring muscle group"}},
    {"source": "nordic_hamstring_curl", "target": "hamstring_strain", "type": "RECOMMENDED_FOR", "weight": 1.0,
     "properties": {"evidence_grade": "A", "note": "Reduces hamstring injury incidence by 51% (meta-analysis)"}},
    {"source": "hamstring_strain", "target": "maximal_sprint", "type": "CONTRAINDICATED_FOR", "weight": 1.0,
     "properties": {"reason": "Maximal sprint is the primary mechanism for Type I hamstring strain"}},
    {"source": "single_leg_romanian_deadlift", "target": "hamstring_strain", "type": "RECOMMENDED_FOR", "weight": 0.8,
     "properties": {"mechanism": "Develops eccentric hamstring strength at long muscle lengths"}},

    # -- Ankle Sprain --
    {"source": "ankle_sprain", "target": "ankle", "type": "AFFECTS", "weight": 1.0,
     "properties": {"mechanism": "Lateral ligament damage from inversion mechanism"}},
    {"source": "ankle_mobility_work", "target": "ankle_sprain", "type": "RECOMMENDED_FOR", "weight": 1.0,
     "properties": {"evidence_grade": "A", "note": "Proprioceptive training reduces recurrence by 40-50%"}},
    {"source": "ankle_sprain", "target": "injured", "type": "TRIGGERS", "weight": 0.7,
     "properties": {"mechanism": "Severe sprains require immobilization and rehabilitation"}},

    # -- Shoulder Impingement --
    {"source": "shoulder_impingement", "target": "shoulder", "type": "AFFECTS", "weight": 1.0,
     "properties": {"mechanism": "Subacromial compression of rotator cuff tendons"}},
    {"source": "shoulder_prehab_routine", "target": "shoulder_impingement", "type": "RECOMMENDED_FOR", "weight": 1.0,
     "properties": {"evidence_grade": "A", "note": "External rotation and scapular stability reduce impingement risk"}},
    {"source": "shoulder_impingement", "target": "serve_practice", "type": "CONTRAINDICATED_FOR", "weight": 0.9,
     "properties": {"reason": "High-volume overhead serving exacerbates impingement"}},
    {"source": "shoulder_impingement", "target": "vibora_shot", "type": "CONTRAINDICATED_FOR", "weight": 0.9,
     "properties": {"reason": "Aggressive overhead padel shot stresses impinged shoulder"}},

    # -- Tennis Elbow --
    {"source": "tennis_elbow", "target": "elbow", "type": "AFFECTS", "weight": 1.0,
     "properties": {"mechanism": "Degenerative tendinopathy of common extensor origin"}},
    {"source": "tennis_elbow", "target": "vibora_shot", "type": "CONTRAINDICATED_FOR", "weight": 0.8,
     "properties": {"reason": "Pronation snap and grip demands exacerbate extensor tendinopathy"}},
    {"source": "shoulder_prehab_routine", "target": "tennis_elbow", "type": "RECOMMENDED_FOR", "weight": 0.6,
     "properties": {"note": "Includes forearm and grip strengthening components"}},

    # -- Osgood-Schlatter --
    {"source": "osgood_schlatter", "target": "knee", "type": "AFFECTS", "weight": 1.0,
     "properties": {"mechanism": "Traction apophysitis of the tibial tuberosity"}},
    {"source": "mid_phv", "target": "osgood_schlatter", "type": "TRIGGERS", "weight": 0.9,
     "properties": {"mechanism": "Rapid growth increases traction stress on unfused apophysis"}},
    {"source": "osgood_schlatter", "target": "depth_jumps", "type": "CONTRAINDICATED_FOR", "weight": 1.0,
     "properties": {"reason": "High-impact plyometrics increase traction force on tibial tuberosity"}},
    {"source": "isometric_holds", "target": "osgood_schlatter", "type": "RECOMMENDED_FOR", "weight": 0.8,
     "properties": {"note": "Pain-free isometric quadriceps work maintains strength during healing"}},

    # -- Sever's Disease --
    {"source": "severs_disease", "target": "ankle", "type": "AFFECTS", "weight": 1.0,
     "properties": {"mechanism": "Calcaneal apophysitis at Achilles insertion"}},
    {"source": "severs_disease", "target": "calf", "type": "AFFECTS", "weight": 0.8,
     "properties": {"mechanism": "Tight calf muscles increase traction on calcaneal apophysis"}},
    {"source": "mid_phv", "target": "severs_disease", "type": "TRIGGERS", "weight": 0.9,
     "properties": {"mechanism": "Rapid bone growth outpaces calf muscle-tendon lengthening"}},
    {"source": "flexibility_stretching", "target": "severs_disease", "type": "RECOMMENDED_FOR", "weight": 0.8,
     "properties": {"note": "Calf stretching reduces traction stress on calcaneal apophysis"}},

    # -- Groin Strain --
    {"source": "groin_strain", "target": "hip", "type": "AFFECTS", "weight": 1.0,
     "properties": {"mechanism": "Adductor muscle group originates from pubic bone"}},
    {"source": "copenhagen_adduction", "target": "groin_strain", "type": "RECOMMENDED_FOR", "weight": 1.0,
     "properties": {"evidence_grade": "A", "note": "Reduces groin injury risk by 41% in football players"}},

    # -- Shin Splints --
    {"source": "shin_splints", "target": "calf", "type": "AFFECTS", "weight": 0.8,
     "properties": {"mechanism": "Periosteal inflammation along posteromedial tibial border"}},
    {"source": "shin_splints", "target": "injured", "type": "TRIGGERS", "weight": 0.5,
     "properties": {"mechanism": "Can progress to stress fracture if untreated"}},

    # -- Concussion --
    {"source": "concussion", "target": "neck", "type": "AFFECTS", "weight": 0.9,
     "properties": {"mechanism": "Head acceleration transmitted through cervical spine"}},
    {"source": "graded_return_to_sport", "target": "concussion", "type": "RECOMMENDED_FOR", "weight": 1.0,
     "properties": {"evidence_grade": "A", "note": "Mandatory graded return with minimum 24h at each stage"}},
    {"source": "concussion", "target": "hiit", "type": "CONTRAINDICATED_FOR", "weight": 1.0,
     "properties": {"reason": "No high-intensity exercise until fully symptom-free and medically cleared"}},
    {"source": "concussion", "target": "maximal_sprint", "type": "CONTRAINDICATED_FOR", "weight": 1.0,
     "properties": {"reason": "Maximal exertion contraindicated during concussion recovery"}},

    # -- Iron Deficiency --
    {"source": "iron_deficiency", "target": "red_readiness", "type": "TRIGGERS", "weight": 0.7,
     "properties": {"mechanism": "Impaired oxygen transport and reduced exercise capacity cause fatigue"}},
    {"source": "nutrition_timing", "target": "iron_deficiency", "type": "RECOMMENDED_FOR", "weight": 0.7,
     "properties": {"note": "Nutritional strategies for iron-rich food timing and absorption optimization"}},

    # -- Dehydration --
    {"source": "dehydration_state", "target": "red_readiness", "type": "TRIGGERS", "weight": 0.8,
     "properties": {"mechanism": "2%+ body mass loss impairs performance 10-20% and elevates core temp"}},
    {"source": "hydration_protocol", "target": "dehydration_state", "type": "RECOMMENDED_FOR", "weight": 1.0,
     "properties": {"evidence_grade": "A"}},
    {"source": "heat_acclimatization", "target": "dehydration_state", "type": "RECOMMENDED_FOR", "weight": 0.8,
     "properties": {"note": "Heat acclimatization increases sweat rate and plasma volume"}},

    # -- RED-S --
    {"source": "relative_energy_deficiency_syndrome", "target": "growth_plate", "type": "AFFECTS", "weight": 0.9,
     "properties": {"mechanism": "Insufficient energy impairs bone mineralization during growth"}},
    {"source": "relative_energy_deficiency_syndrome", "target": "iron_deficiency", "type": "TRIGGERS", "weight": 0.7,
     "properties": {"mechanism": "Low energy availability compromises micronutrient status"}},
    {"source": "relative_energy_deficiency_syndrome", "target": "overtraining", "type": "TRIGGERS", "weight": 0.8,
     "properties": {"mechanism": "Energy deficit prevents recovery from training stress"}},
    {"source": "nutrition_timing", "target": "relative_energy_deficiency_syndrome", "type": "RECOMMENDED_FOR", "weight": 0.9,
     "properties": {"evidence_grade": "A"}},

    # -- Competition Anxiety --
    {"source": "mental_performance_routine", "target": "competition_anxiety", "type": "RECOMMENDED_FOR", "weight": 1.0,
     "properties": {"evidence_grade": "A"}},
    {"source": "pre_competition_visualization", "target": "competition_anxiety", "type": "RECOMMENDED_FOR", "weight": 0.9,
     "properties": {"evidence_grade": "A"}},
    {"source": "competition_anxiety", "target": "match_day", "type": "TRIGGERS", "weight": 0.6,
     "properties": {"mechanism": "Competition day activates pre-competitive anxiety state"}},

    # -- Athlete Burnout --
    {"source": "athlete_burnout", "target": "overtraining", "type": "TRIGGERS", "weight": 0.8,
     "properties": {"mechanism": "Chronic exhaustion from burnout leads to overtraining syndrome"}},
    {"source": "athlete_burnout", "target": "red_readiness", "type": "TRIGGERS", "weight": 0.7,
     "properties": {"mechanism": "Emotional exhaustion manifests as poor wellness scores"}},
    {"source": "youth_long_term_development", "target": "athlete_burnout", "type": "RECOMMENDED_FOR", "weight": 0.9,
     "properties": {"note": "Multi-sport participation and LTAD framework prevents early burnout"}},

    # =========================================================================
    # FOOTBALL EXERCISES — Sport & Condition Relationships
    # =========================================================================

    {"source": "rondo_possession", "target": "football", "type": "BELONGS_TO", "weight": 1.0},
    {"source": "small_sided_game", "target": "football", "type": "BELONGS_TO", "weight": 1.0},
    {"source": "crossing_drill", "target": "football", "type": "BELONGS_TO", "weight": 1.0},
    {"source": "shooting_practice", "target": "football", "type": "BELONGS_TO", "weight": 1.0},
    {"source": "defensive_shape_drill", "target": "football", "type": "BELONGS_TO", "weight": 1.0},
    {"source": "positional_play_drill", "target": "football", "type": "BELONGS_TO", "weight": 1.0},
    {"source": "set_piece_practice", "target": "football", "type": "BELONGS_TO", "weight": 1.0},
    {"source": "goalkeeping_drill", "target": "football", "type": "BELONGS_TO", "weight": 1.0},
    {"source": "pressing_drill", "target": "football", "type": "BELONGS_TO", "weight": 1.0},
    {"source": "tactical_periodization_session", "target": "football", "type": "BELONGS_TO", "weight": 1.0},

    # Football match-day relationships
    {"source": "rondo_possession", "target": "match_day", "type": "RECOMMENDED_FOR", "weight": 0.7,
     "properties": {"note": "Low-intensity technical warm-up suitable for pre-match activation"}},
    {"source": "small_sided_game", "target": "match_plus_1", "type": "CONTRAINDICATED_FOR", "weight": 0.8,
     "properties": {"reason": "Too high intensity for recovery day"}},
    {"source": "pressing_drill", "target": "match_plus_1", "type": "CONTRAINDICATED_FOR", "weight": 0.9,
     "properties": {"reason": "High-intensity pressing inappropriate for post-match recovery"}},
    {"source": "set_piece_practice", "target": "match_day", "type": "RECOMMENDED_FOR", "weight": 0.8,
     "properties": {"note": "Low-intensity rehearsal suitable for match-day preparation"}},

    # Football readiness relationships
    {"source": "small_sided_game", "target": "red_readiness", "type": "CONTRAINDICATED_FOR", "weight": 0.9,
     "properties": {"reason": "High HR demands inappropriate when recovery is compromised"}},
    {"source": "pressing_drill", "target": "red_readiness", "type": "CONTRAINDICATED_FOR", "weight": 0.9,
     "properties": {"reason": "High anaerobic demand with compromised recovery state"}},
    {"source": "positional_play_drill", "target": "red_readiness", "type": "RECOMMENDED_FOR", "weight": 0.6,
     "properties": {"note": "Low physical but high cognitive — suitable for modified RED sessions"}},

    # =========================================================================
    # BASKETBALL EXERCISES — Sport Relationships
    # =========================================================================

    {"source": "layup_drill", "target": "basketball", "type": "BELONGS_TO", "weight": 1.0},
    {"source": "free_throw_practice", "target": "basketball", "type": "BELONGS_TO", "weight": 1.0},
    {"source": "defensive_slides", "target": "basketball", "type": "BELONGS_TO", "weight": 1.0},
    {"source": "pick_and_roll_drill", "target": "basketball", "type": "BELONGS_TO", "weight": 1.0},
    {"source": "three_point_shooting", "target": "basketball", "type": "BELONGS_TO", "weight": 1.0},
    {"source": "fast_break_drill", "target": "basketball", "type": "BELONGS_TO", "weight": 1.0},
    {"source": "rebounding_drill", "target": "basketball", "type": "BELONGS_TO", "weight": 1.0},
    {"source": "ball_handling_drill", "target": "basketball", "type": "BELONGS_TO", "weight": 1.0},

    # Basketball readiness & condition relationships
    {"source": "fast_break_drill", "target": "red_readiness", "type": "CONTRAINDICATED_FOR", "weight": 0.9,
     "properties": {"reason": "High-intensity full-court running with compromised recovery"}},
    {"source": "fast_break_drill", "target": "match_plus_1", "type": "CONTRAINDICATED_FOR", "weight": 0.8,
     "properties": {"reason": "Excessive running load for post-match recovery period"}},
    {"source": "ball_handling_drill", "target": "red_readiness", "type": "RECOMMENDED_FOR", "weight": 0.6,
     "properties": {"note": "Low physical load, high skill development — good for modified sessions"}},
    {"source": "free_throw_practice", "target": "match_day", "type": "RECOMMENDED_FOR", "weight": 0.7,
     "properties": {"note": "Pre-game shooting routine for activation and confidence"}},
    {"source": "defensive_slides", "target": "groin_strain", "type": "CONTRAINDICATED_FOR", "weight": 0.8,
     "properties": {"reason": "High adductor eccentric load exacerbates groin injury"}},
    {"source": "copenhagen_adduction", "target": "defensive_slides", "type": "PREREQUISITE_FOR", "weight": 0.7,
     "properties": {"note": "Adductor prehab should precede high-volume defensive slide work"}},

    # =========================================================================
    # PADEL EXERCISES — Sport Relationships
    # =========================================================================

    {"source": "bandeja_shot", "target": "padel", "type": "BELONGS_TO", "weight": 1.0},
    {"source": "vibora_shot", "target": "padel", "type": "BELONGS_TO", "weight": 1.0},
    {"source": "wall_rebound_drill", "target": "padel", "type": "BELONGS_TO", "weight": 1.0},
    {"source": "service_drill_padel", "target": "padel", "type": "BELONGS_TO", "weight": 1.0},
    {"source": "net_volley_drill", "target": "padel", "type": "BELONGS_TO", "weight": 1.0},
    {"source": "lob_defense_drill", "target": "padel", "type": "BELONGS_TO", "weight": 1.0},
    {"source": "footwork_split_step", "target": "padel", "type": "BELONGS_TO", "weight": 1.0},
    {"source": "doubles_positioning_drill", "target": "padel", "type": "BELONGS_TO", "weight": 1.0},

    # Padel cross-sport (split-step also for tennis)
    {"source": "footwork_split_step", "target": "tennis", "type": "BELONGS_TO", "weight": 0.9},

    # Padel condition relationships
    {"source": "bandeja_shot", "target": "shoulder_impingement", "type": "CONTRAINDICATED_FOR", "weight": 0.7,
     "properties": {"reason": "Overhead mechanics may aggravate impinged shoulder — reduce volume"}},
    {"source": "vibora_shot", "target": "tennis_elbow", "type": "CONTRAINDICATED_FOR", "weight": 0.8,
     "properties": {"reason": "Pronation snap and grip force exacerbate lateral epicondylalgia"}},
    {"source": "wall_rebound_drill", "target": "red_readiness", "type": "RECOMMENDED_FOR", "weight": 0.6,
     "properties": {"note": "Low physical intensity — cognitive training suitable for modified sessions"}},
    {"source": "bandeja_shot", "target": "vibora_shot", "type": "PREREQUISITE_FOR", "weight": 0.8,
     "properties": {"note": "Bandeja technique must be mastered before progressing to vibora"}},

    # =========================================================================
    # TENNIS EXERCISES — Sport Relationships
    # =========================================================================

    {"source": "serve_practice", "target": "tennis", "type": "BELONGS_TO", "weight": 1.0},
    {"source": "baseline_rally_drill", "target": "tennis", "type": "BELONGS_TO", "weight": 1.0},
    {"source": "volley_drill_tennis", "target": "tennis", "type": "BELONGS_TO", "weight": 1.0},
    {"source": "return_of_serve_drill", "target": "tennis", "type": "BELONGS_TO", "weight": 1.0},
    {"source": "slice_backhand_drill", "target": "tennis", "type": "BELONGS_TO", "weight": 1.0},
    {"source": "approach_shot_drill", "target": "tennis", "type": "BELONGS_TO", "weight": 1.0},
    {"source": "overhead_smash_drill", "target": "tennis", "type": "BELONGS_TO", "weight": 1.0},
    {"source": "movement_recovery_drill", "target": "tennis", "type": "BELONGS_TO", "weight": 1.0},

    # Tennis condition relationships
    {"source": "serve_practice", "target": "shoulder_impingement", "type": "CONTRAINDICATED_FOR", "weight": 0.9,
     "properties": {"reason": "High-volume overhead serving exacerbates subacromial impingement"}},
    {"source": "overhead_smash_drill", "target": "shoulder_impingement", "type": "CONTRAINDICATED_FOR", "weight": 0.9,
     "properties": {"reason": "Overhead impact with impinged shoulder risks further damage"}},
    {"source": "shoulder_prehab_routine", "target": "serve_practice", "type": "PREREQUISITE_FOR", "weight": 0.8,
     "properties": {"note": "Shoulder prehab required before high-volume serve sessions"}},
    {"source": "slice_backhand_drill", "target": "volley_drill_tennis", "type": "PREREQUISITE_FOR", "weight": 0.6,
     "properties": {"note": "Slice technique is foundation for volley mechanics"}},
    {"source": "baseline_rally_drill", "target": "red_readiness", "type": "CONTRAINDICATED_FOR", "weight": 0.7,
     "properties": {"reason": "Sustained rally intensity inappropriate when recovery is compromised"}},
    {"source": "movement_recovery_drill", "target": "match_plus_1", "type": "CONTRAINDICATED_FOR", "weight": 0.8,
     "properties": {"reason": "High-intensity movement drill inappropriate for post-match recovery"}},

    # =========================================================================
    # ATHLETICS EXERCISES — Sport Relationships
    # =========================================================================

    {"source": "block_start_drill", "target": "athletics", "type": "BELONGS_TO", "weight": 1.0},
    {"source": "hurdle_technique_drill", "target": "athletics", "type": "BELONGS_TO", "weight": 1.0},
    {"source": "throwing_technique", "target": "athletics", "type": "BELONGS_TO", "weight": 1.0},
    {"source": "jump_technique_drill", "target": "athletics", "type": "BELONGS_TO", "weight": 1.0},
    {"source": "endurance_tempo_session", "target": "athletics", "type": "BELONGS_TO", "weight": 1.0},
    {"source": "speed_development_session", "target": "athletics", "type": "BELONGS_TO", "weight": 1.0},
    {"source": "coordination_circuit", "target": "athletics", "type": "BELONGS_TO", "weight": 1.0},
    {"source": "event_specific_conditioning", "target": "athletics", "type": "BELONGS_TO", "weight": 1.0},

    # Athletics condition relationships
    {"source": "block_start_drill", "target": "red_readiness", "type": "CONTRAINDICATED_FOR", "weight": 1.0,
     "properties": {"reason": "Maximal CNS demand with compromised recovery state"}},
    {"source": "speed_development_session", "target": "red_readiness", "type": "CONTRAINDICATED_FOR", "weight": 1.0,
     "properties": {"reason": "Near-maximal sprinting requires GREEN readiness"}},
    {"source": "speed_development_session", "target": "critical_acwr", "type": "CONTRAINDICATED_FOR", "weight": 1.0,
     "properties": {"reason": "Maximal sprint volume in ACWR danger zone"}},
    {"source": "block_start_drill", "target": "hamstring_strain", "type": "CONTRAINDICATED_FOR", "weight": 1.0,
     "properties": {"reason": "Explosive hip extension at maximal effort = high hamstring strain risk"}},
    {"source": "coordination_circuit", "target": "red_readiness", "type": "RECOMMENDED_FOR", "weight": 0.6,
     "properties": {"note": "Low-intensity coordination work suitable for modified recovery sessions"}},
    {"source": "throwing_technique", "target": "spine", "type": "AFFECTS", "weight": 0.8,
     "properties": {"mechanism": "Rotational forces in throwing stress vertebral structures"}},
    {"source": "throwing_technique", "target": "shoulder", "type": "AFFECTS", "weight": 0.8,
     "properties": {"mechanism": "Overhead and rotational throwing loads shoulder complex"}},
    {"source": "jump_technique_drill", "target": "mid_phv", "type": "CONTRAINDICATED_FOR", "weight": 0.8,
     "properties": {"reason": "Impact forces 8-12x BW at takeoff stress immature growth plates"}},
    {"source": "jump_technique_drill", "target": "osgood_schlatter", "type": "CONTRAINDICATED_FOR", "weight": 0.9,
     "properties": {"reason": "Explosive takeoff increases traction on tibial tuberosity"}},
    {"source": "endurance_tempo_session", "target": "match_plus_1", "type": "CONTRAINDICATED_FOR", "weight": 0.6,
     "properties": {"reason": "Volume running on recovery day delays glycogen replenishment"}},

    # =========================================================================
    # GENERAL / PREHAB EXERCISES — Injury Prevention Chains
    # =========================================================================

    # Nordic hamstring curl — injury prevention relationships
    {"source": "nordic_hamstring_curl", "target": "football", "type": "BELONGS_TO", "weight": 0.9,
     "properties": {"note": "Essential component of football injury prevention programs"}},
    {"source": "nordic_hamstring_curl", "target": "athletics", "type": "BELONGS_TO", "weight": 0.9,
     "properties": {"note": "Critical for all sprinting event athletes"}},
    {"source": "nordic_hamstring_curl", "target": "basketball", "type": "BELONGS_TO", "weight": 0.7},
    {"source": "nordic_hamstring_curl", "target": "tennis", "type": "BELONGS_TO", "weight": 0.6},

    # Copenhagen adduction — sport relationships
    {"source": "copenhagen_adduction", "target": "football", "type": "BELONGS_TO", "weight": 1.0,
     "properties": {"note": "Groin injuries account for 10-18% of football injuries"}},
    {"source": "copenhagen_adduction", "target": "basketball", "type": "BELONGS_TO", "weight": 0.7},
    {"source": "copenhagen_adduction", "target": "tennis", "type": "BELONGS_TO", "weight": 0.6},

    # Single-leg RDL
    {"source": "single_leg_romanian_deadlift", "target": "heavy_deadlift", "type": "SAFE_ALTERNATIVE_TO", "weight": 0.8,
     "properties": {"context": "Unilateral hip hinge with lighter load — safe for mid-PHV"}},

    # Plank variations — universal
    {"source": "plank_variations", "target": "football", "type": "BELONGS_TO", "weight": 0.7},
    {"source": "plank_variations", "target": "basketball", "type": "BELONGS_TO", "weight": 0.7},
    {"source": "plank_variations", "target": "tennis", "type": "BELONGS_TO", "weight": 0.7},
    {"source": "plank_variations", "target": "padel", "type": "BELONGS_TO", "weight": 0.7},
    {"source": "plank_variations", "target": "athletics", "type": "BELONGS_TO", "weight": 0.7},

    # Glute bridge — universal
    {"source": "glute_bridge_variations", "target": "barbell_squat", "type": "SAFE_ALTERNATIVE_TO", "weight": 0.6,
     "properties": {"context": "Hip extension without axial spinal loading"}},

    # Hip mobility — PHV and sport relationships
    {"source": "hip_mobility_complex", "target": "hip", "type": "TREATS", "weight": 0.7,
     "properties": {"mechanism": "Addresses hip flexor tightness from rapid growth and prolonged sitting"}},
    {"source": "hip_mobility_complex", "target": "mid_phv", "type": "RECOMMENDED_FOR", "weight": 0.8,
     "properties": {"note": "Essential during PHV when bone growth outpaces soft tissue"}},

    # Ankle mobility — injury prevention
    {"source": "ankle_mobility_work", "target": "ankle", "type": "TREATS", "weight": 0.7,
     "properties": {"mechanism": "Restores dorsiflexion ROM and develops proprioceptive stability"}},

    # Shoulder prehab — sport relationships
    {"source": "shoulder_prehab_routine", "target": "tennis", "type": "BELONGS_TO", "weight": 0.9,
     "properties": {"note": "Essential for all overhead tennis athletes"}},
    {"source": "shoulder_prehab_routine", "target": "padel", "type": "BELONGS_TO", "weight": 0.9,
     "properties": {"note": "Overhead shots (bandeja, vibora, smash) stress shoulder"}},
    {"source": "shoulder_prehab_routine", "target": "basketball", "type": "BELONGS_TO", "weight": 0.7,
     "properties": {"note": "Shooting and passing load the shoulder complex"}},

    # =========================================================================
    # PROTOCOL — Age Band Applicability
    # =========================================================================

    {"source": "dynamic_warmup", "target": "u13", "type": "APPLICABLE_TO", "weight": 1.0},
    {"source": "dynamic_warmup", "target": "u15", "type": "APPLICABLE_TO", "weight": 1.0},
    {"source": "dynamic_warmup", "target": "u17", "type": "APPLICABLE_TO", "weight": 1.0},
    {"source": "dynamic_warmup", "target": "u19", "type": "APPLICABLE_TO", "weight": 1.0},
    {"source": "dynamic_warmup", "target": "adult", "type": "APPLICABLE_TO", "weight": 1.0},

    {"source": "sport_specific_cooldown", "target": "u13", "type": "APPLICABLE_TO", "weight": 1.0},
    {"source": "sport_specific_cooldown", "target": "u15", "type": "APPLICABLE_TO", "weight": 1.0},
    {"source": "sport_specific_cooldown", "target": "u17", "type": "APPLICABLE_TO", "weight": 1.0},
    {"source": "sport_specific_cooldown", "target": "u19", "type": "APPLICABLE_TO", "weight": 1.0},
    {"source": "sport_specific_cooldown", "target": "adult", "type": "APPLICABLE_TO", "weight": 1.0},

    {"source": "injury_prevention_program", "target": "u13", "type": "APPLICABLE_TO", "weight": 0.8},
    {"source": "injury_prevention_program", "target": "u15", "type": "APPLICABLE_TO", "weight": 1.0},
    {"source": "injury_prevention_program", "target": "u17", "type": "APPLICABLE_TO", "weight": 1.0},
    {"source": "injury_prevention_program", "target": "u19", "type": "APPLICABLE_TO", "weight": 1.0},
    {"source": "injury_prevention_program", "target": "adult", "type": "APPLICABLE_TO", "weight": 1.0},

    {"source": "youth_long_term_development", "target": "u13", "type": "APPLICABLE_TO", "weight": 1.0},
    {"source": "youth_long_term_development", "target": "u15", "type": "APPLICABLE_TO", "weight": 1.0},
    {"source": "youth_long_term_development", "target": "u17", "type": "APPLICABLE_TO", "weight": 0.9},
    {"source": "youth_long_term_development", "target": "u19", "type": "APPLICABLE_TO", "weight": 0.7},

    {"source": "mental_performance_routine", "target": "u13", "type": "APPLICABLE_TO", "weight": 0.6},
    {"source": "mental_performance_routine", "target": "u15", "type": "APPLICABLE_TO", "weight": 0.8},
    {"source": "mental_performance_routine", "target": "u17", "type": "APPLICABLE_TO", "weight": 1.0},
    {"source": "mental_performance_routine", "target": "u19", "type": "APPLICABLE_TO", "weight": 1.0},
    {"source": "mental_performance_routine", "target": "adult", "type": "APPLICABLE_TO", "weight": 1.0},

    {"source": "pre_competition_visualization", "target": "u15", "type": "APPLICABLE_TO", "weight": 0.7},
    {"source": "pre_competition_visualization", "target": "u17", "type": "APPLICABLE_TO", "weight": 0.9},
    {"source": "pre_competition_visualization", "target": "u19", "type": "APPLICABLE_TO", "weight": 1.0},
    {"source": "pre_competition_visualization", "target": "adult", "type": "APPLICABLE_TO", "weight": 1.0},

    {"source": "fundamental_movement_screen", "target": "u13", "type": "APPLICABLE_TO", "weight": 0.8},
    {"source": "fundamental_movement_screen", "target": "u15", "type": "APPLICABLE_TO", "weight": 1.0},
    {"source": "fundamental_movement_screen", "target": "u17", "type": "APPLICABLE_TO", "weight": 1.0},
    {"source": "fundamental_movement_screen", "target": "u19", "type": "APPLICABLE_TO", "weight": 0.9},
    {"source": "fundamental_movement_screen", "target": "adult", "type": "APPLICABLE_TO", "weight": 0.8},

    {"source": "strength_phase_protocol", "target": "u17", "type": "APPLICABLE_TO", "weight": 0.8},
    {"source": "strength_phase_protocol", "target": "u19", "type": "APPLICABLE_TO", "weight": 1.0},
    {"source": "strength_phase_protocol", "target": "adult", "type": "APPLICABLE_TO", "weight": 1.0},

    {"source": "power_phase_protocol", "target": "u15", "type": "APPLICABLE_TO", "weight": 0.5,
     "properties": {"note": "Bodyweight and light implements only for U15"}},
    {"source": "power_phase_protocol", "target": "u17", "type": "APPLICABLE_TO", "weight": 0.8},
    {"source": "power_phase_protocol", "target": "u19", "type": "APPLICABLE_TO", "weight": 1.0},
    {"source": "power_phase_protocol", "target": "adult", "type": "APPLICABLE_TO", "weight": 1.0},

    {"source": "tapering_protocol", "target": "u17", "type": "APPLICABLE_TO", "weight": 0.8},
    {"source": "tapering_protocol", "target": "u19", "type": "APPLICABLE_TO", "weight": 1.0},
    {"source": "tapering_protocol", "target": "adult", "type": "APPLICABLE_TO", "weight": 1.0},

    {"source": "altitude_training_adaptation", "target": "u19", "type": "APPLICABLE_TO", "weight": 0.7},
    {"source": "altitude_training_adaptation", "target": "adult", "type": "APPLICABLE_TO", "weight": 1.0},

    {"source": "heat_acclimatization", "target": "u15", "type": "APPLICABLE_TO", "weight": 0.7},
    {"source": "heat_acclimatization", "target": "u17", "type": "APPLICABLE_TO", "weight": 0.9},
    {"source": "heat_acclimatization", "target": "u19", "type": "APPLICABLE_TO", "weight": 1.0},
    {"source": "heat_acclimatization", "target": "adult", "type": "APPLICABLE_TO", "weight": 1.0},

    {"source": "periodization_mesocycle", "target": "u15", "type": "APPLICABLE_TO", "weight": 0.6},
    {"source": "periodization_mesocycle", "target": "u17", "type": "APPLICABLE_TO", "weight": 0.9},
    {"source": "periodization_mesocycle", "target": "u19", "type": "APPLICABLE_TO", "weight": 1.0},
    {"source": "periodization_mesocycle", "target": "adult", "type": "APPLICABLE_TO", "weight": 1.0},

    {"source": "athlete_monitoring_protocol", "target": "u13", "type": "APPLICABLE_TO", "weight": 0.7},
    {"source": "athlete_monitoring_protocol", "target": "u15", "type": "APPLICABLE_TO", "weight": 0.9},
    {"source": "athlete_monitoring_protocol", "target": "u17", "type": "APPLICABLE_TO", "weight": 1.0},
    {"source": "athlete_monitoring_protocol", "target": "u19", "type": "APPLICABLE_TO", "weight": 1.0},
    {"source": "athlete_monitoring_protocol", "target": "adult", "type": "APPLICABLE_TO", "weight": 1.0},

    {"source": "graded_return_to_sport", "target": "u13", "type": "APPLICABLE_TO", "weight": 1.0},
    {"source": "graded_return_to_sport", "target": "u15", "type": "APPLICABLE_TO", "weight": 1.0},
    {"source": "graded_return_to_sport", "target": "u17", "type": "APPLICABLE_TO", "weight": 1.0},
    {"source": "graded_return_to_sport", "target": "u19", "type": "APPLICABLE_TO", "weight": 1.0},
    {"source": "graded_return_to_sport", "target": "adult", "type": "APPLICABLE_TO", "weight": 1.0},

    # =========================================================================
    # PROTOCOL — Condition Recommendations
    # =========================================================================

    {"source": "dynamic_warmup", "target": "green_readiness", "type": "RECOMMENDED_FOR", "weight": 0.8,
     "properties": {"note": "Standard warm-up for all GREEN readiness training sessions"}},
    {"source": "dynamic_warmup", "target": "match_day", "type": "RECOMMENDED_FOR", "weight": 0.9,
     "properties": {"note": "Pre-match activation warm-up"}},
    {"source": "sport_specific_cooldown", "target": "match_plus_1", "type": "RECOMMENDED_FOR", "weight": 0.7,
     "properties": {"note": "Gentle cool-down supports parasympathetic recovery"}},

    {"source": "tapering_protocol", "target": "match_day", "type": "RECOMMENDED_FOR", "weight": 0.8,
     "properties": {"note": "Taper training load in the week leading to major competition"}},

    {"source": "strength_phase_protocol", "target": "mid_phv", "type": "CONTRAINDICATED_FOR", "weight": 1.0,
     "properties": {"reason": "Heavy axial loading (85-95% 1RM) on immature growth plates"}},
    {"source": "strength_phase_protocol", "target": "green_readiness", "type": "RECOMMENDED_FOR", "weight": 0.8,
     "properties": {"note": "Maximal strength work requires full recovery state"}},

    {"source": "power_phase_protocol", "target": "mid_phv", "type": "CONTRAINDICATED_FOR", "weight": 0.9,
     "properties": {"reason": "Explosive loaded exercises contraindicated with open growth plates"}},

    {"source": "injury_prevention_program", "target": "green_readiness", "type": "RECOMMENDED_FOR", "weight": 0.7,
     "properties": {"note": "Include as warm-up replacement 2-3x/week"}},
    {"source": "injury_prevention_program", "target": "amber_readiness", "type": "RECOMMENDED_FOR", "weight": 0.7,
     "properties": {"note": "Low-intensity prevention work suitable for AMBER days"}},

    {"source": "athlete_monitoring_protocol", "target": "high_acwr", "type": "RECOMMENDED_FOR", "weight": 0.9,
     "properties": {"note": "Intensify monitoring when ACWR enters elevated zone"}},
    {"source": "athlete_monitoring_protocol", "target": "overtraining", "type": "RECOMMENDED_FOR", "weight": 1.0,
     "properties": {"note": "Daily monitoring essential for detecting overtraining early"}},

    {"source": "mental_performance_routine", "target": "match_day", "type": "RECOMMENDED_FOR", "weight": 0.8,
     "properties": {"note": "Pre-competition mental preparation for optimal activation state"}},
    {"source": "pre_competition_visualization", "target": "match_day", "type": "RECOMMENDED_FOR", "weight": 0.8,
     "properties": {"note": "Competition day visualization for performance priming"}},

    {"source": "graded_return_to_sport", "target": "returning_from_injury", "type": "RECOMMENDED_FOR", "weight": 1.0,
     "properties": {"evidence_grade": "A"}},

    {"source": "heat_acclimatization", "target": "green_readiness", "type": "RECOMMENDED_FOR", "weight": 0.6,
     "properties": {"note": "Requires GREEN readiness to tolerate added heat stress"}},

    # =========================================================================
    # PROTOCOL — Prerequisite Chains
    # =========================================================================

    {"source": "strength_phase_protocol", "target": "power_phase_protocol", "type": "PREREQUISITE_FOR", "weight": 0.9,
     "properties": {"note": "Strength base (squat 1.5x BW) needed before power development"}},
    {"source": "fundamental_movement_screen", "target": "strength_phase_protocol", "type": "PREREQUISITE_FOR", "weight": 0.8,
     "properties": {"note": "Movement quality must be assessed before heavy loading"}},
    {"source": "dynamic_warmup", "target": "speed_development_session", "type": "PREREQUISITE_FOR", "weight": 0.9,
     "properties": {"note": "Full dynamic warm-up mandatory before maximal speed work"}},
    {"source": "dynamic_warmup", "target": "small_sided_game", "type": "PREREQUISITE_FOR", "weight": 0.8,
     "properties": {"note": "Warm-up before high-intensity game activities"}},
    {"source": "shoulder_prehab_routine", "target": "overhead_smash_drill", "type": "PREREQUISITE_FOR", "weight": 0.8,
     "properties": {"note": "Shoulder activation before high-volume overhead work"}},

    # =========================================================================
    # CONCEPT — Evidence & Hierarchy Relationships
    # =========================================================================

    # LTAD model connections
    {"source": "ltad_model", "target": "youth_long_term_development", "type": "EVIDENCE_SUPPORTS", "weight": 1.0,
     "properties": {"mechanism": "LTAD provides the scientific basis for youth development protocols"}},
    {"source": "ltad_model", "target": "speed_window", "type": "PART_OF", "weight": 0.8,
     "properties": {"note": "Speed window is a key trainability concept within LTAD"}},
    {"source": "ltad_model", "target": "strength_window", "type": "PART_OF", "weight": 0.8,
     "properties": {"note": "Strength window is a key trainability concept within LTAD"}},

    # Relative age effect
    {"source": "relative_age_effect", "target": "talent_identification", "type": "AFFECTS", "weight": 0.9,
     "properties": {"mechanism": "RAE biases talent identification toward early maturers"}},
    {"source": "relative_age_effect", "target": "u13", "type": "APPLICABLE_TO", "weight": 1.0,
     "properties": {"note": "RAE is most pronounced at U13 age band"}},
    {"source": "relative_age_effect", "target": "u15", "type": "APPLICABLE_TO", "weight": 0.9},

    # Growth mindset
    {"source": "growth_mindset", "target": "self_determination_theory", "type": "PART_OF", "weight": 0.7,
     "properties": {"note": "Growth mindset aligns with competence need of SDT"}},
    {"source": "growth_mindset", "target": "athlete_burnout", "type": "TREATS", "weight": 0.6,
     "properties": {"mechanism": "Growth mindset buffers against burnout by reframing setbacks"}},

    # Deliberate practice
    {"source": "deliberate_practice", "target": "talent_identification", "type": "AFFECTS", "weight": 0.7,
     "properties": {"mechanism": "Deliberate practice hours correlate with expertise development"}},
    {"source": "deliberate_practice", "target": "ltad_model", "type": "PART_OF", "weight": 0.6},

    # Rate of force development
    {"source": "rate_of_force_development", "target": "power_phase_protocol", "type": "EVIDENCE_SUPPORTS", "weight": 0.9,
     "properties": {"mechanism": "RFD is the primary adaptation target of power training"}},
    {"source": "rate_of_force_development", "target": "plyometrics_low", "type": "EVIDENCE_SUPPORTS", "weight": 0.8,
     "properties": {"mechanism": "Low-impact plyometrics develop RFD safely in youth"}},

    # Eccentric training
    {"source": "eccentric_training_principle", "target": "nordic_hamstring_curl", "type": "EVIDENCE_SUPPORTS", "weight": 1.0},
    {"source": "eccentric_training_principle", "target": "copenhagen_adduction", "type": "EVIDENCE_SUPPORTS", "weight": 0.9},
    {"source": "eccentric_training_principle", "target": "single_leg_romanian_deadlift", "type": "EVIDENCE_SUPPORTS", "weight": 0.8},

    # Neuromuscular control
    {"source": "neuromuscular_control", "target": "injury_prevention_program", "type": "EVIDENCE_SUPPORTS", "weight": 1.0,
     "properties": {"mechanism": "FIFA 11+ targets neuromuscular control to reduce injury"}},
    {"source": "neuromuscular_control", "target": "ankle_mobility_work", "type": "EVIDENCE_SUPPORTS", "weight": 0.8,
     "properties": {"mechanism": "Proprioceptive training improves neuromuscular ankle control"}},

    # Periodization theory
    {"source": "periodization_theory", "target": "periodization_mesocycle", "type": "EVIDENCE_SUPPORTS", "weight": 1.0},
    {"source": "periodization_theory", "target": "tapering_protocol", "type": "EVIDENCE_SUPPORTS", "weight": 0.9},
    {"source": "periodization_theory", "target": "periodization", "type": "PART_OF", "weight": 1.0,
     "properties": {"note": "Theory underlies the practical application of periodization"}},

    # Supercompensation
    {"source": "supercompensation", "target": "progressive_overload", "type": "EVIDENCE_SUPPORTS", "weight": 1.0,
     "properties": {"mechanism": "Supercompensation cycle is the basis for progressive overload timing"}},
    {"source": "supercompensation", "target": "deload_week", "type": "EVIDENCE_SUPPORTS", "weight": 0.9,
     "properties": {"mechanism": "Deload allows completion of supercompensation cycle"}},
    {"source": "supercompensation", "target": "periodization", "type": "PART_OF", "weight": 0.9},

    # Overreaching vs overtraining
    {"source": "overreaching_vs_overtraining", "target": "overtraining", "type": "AFFECTS", "weight": 0.9,
     "properties": {"mechanism": "Non-functional overreaching progresses to overtraining without intervention"}},
    {"source": "overreaching_vs_overtraining", "target": "athlete_monitoring_protocol", "type": "EVIDENCE_SUPPORTS", "weight": 0.9,
     "properties": {"mechanism": "Monitoring differentiates functional from non-functional overreaching"}},

    # Training monotony
    {"source": "training_monotony", "target": "overtraining", "type": "TRIGGERS", "weight": 0.7,
     "properties": {"mechanism": "High monotony (>2.0) increases illness and overtraining risk"}},
    {"source": "training_monotony", "target": "periodization", "type": "PART_OF", "weight": 0.7},
    {"source": "training_monotony", "target": "acwr", "type": "PART_OF", "weight": 0.6,
     "properties": {"note": "Monotony and strain calculations complement ACWR monitoring"}},

    # Glycogen replenishment
    {"source": "glycogen_replenishment", "target": "nutrition_timing", "type": "EVIDENCE_SUPPORTS", "weight": 1.0,
     "properties": {"mechanism": "Post-exercise glycogen window is the basis for nutrient timing"}},
    {"source": "glycogen_replenishment", "target": "post_match_recovery", "type": "EVIDENCE_SUPPORTS", "weight": 0.9,
     "properties": {"mechanism": "Glycogen restoration is rate-limiting for inter-match recovery"}},

    # Protein synthesis
    {"source": "protein_synthesis_window", "target": "nutrition_timing", "type": "EVIDENCE_SUPPORTS", "weight": 0.9,
     "properties": {"mechanism": "MPS response timing informs protein intake recommendations"}},
    {"source": "protein_synthesis_window", "target": "strength_phase_protocol", "type": "EVIDENCE_SUPPORTS", "weight": 0.8,
     "properties": {"mechanism": "Protein intake optimizes hypertrophy adaptations from strength training"}},

    # Bone mineral density
    {"source": "bone_mineral_density", "target": "growth_plate", "type": "AFFECTS", "weight": 0.9,
     "properties": {"mechanism": "Bone density accrual peaks during adolescent growth period"}},
    {"source": "bone_mineral_density", "target": "relative_energy_deficiency_syndrome", "type": "AFFECTS", "weight": 0.9,
     "properties": {"mechanism": "RED-S impairs bone mineralization during irreversible growth window"}},
    {"source": "bone_mineral_density", "target": "u13", "type": "APPLICABLE_TO", "weight": 0.8},
    {"source": "bone_mineral_density", "target": "u15", "type": "APPLICABLE_TO", "weight": 1.0},
    {"source": "bone_mineral_density", "target": "u17", "type": "APPLICABLE_TO", "weight": 0.9},

    # Dual-task training
    {"source": "dual_task_training", "target": "rondo_possession", "type": "EVIDENCE_SUPPORTS", "weight": 0.7,
     "properties": {"mechanism": "Rondos are a form of dual-task training (technical + cognitive)"}},
    {"source": "dual_task_training", "target": "small_sided_game", "type": "EVIDENCE_SUPPORTS", "weight": 0.8,
     "properties": {"mechanism": "SSGs naturally combine physical, technical, and cognitive demands"}},

    # =========================================================================
    # PHV-SAFE ALTERNATIVES — New Exercises
    # =========================================================================

    {"source": "single_leg_romanian_deadlift", "target": "mid_phv", "type": "RECOMMENDED_FOR", "weight": 0.8,
     "properties": {"note": "Bodyweight SLRDL safe for mid-PHV — develops posterior chain without axial load"}},
    {"source": "plank_variations", "target": "mid_phv", "type": "RECOMMENDED_FOR", "weight": 0.9,
     "properties": {"note": "Isometric core work safe and essential during growth spurt"}},
    {"source": "glute_bridge_variations", "target": "mid_phv", "type": "RECOMMENDED_FOR", "weight": 0.8,
     "properties": {"note": "Hip extension without spinal loading — safe for all PHV stages"}},
    {"source": "hip_mobility_complex", "target": "mid_phv", "type": "RECOMMENDED_FOR", "weight": 0.9,
     "properties": {"note": "Critical during PHV when muscle tightness increases"}},
    {"source": "coordination_circuit", "target": "mid_phv", "type": "RECOMMENDED_FOR", "weight": 0.8,
     "properties": {"note": "Coordination work supports motor control during rapid growth"}},

    # =========================================================================
    # BODY REGION — Condition & Exercise Relationships
    # =========================================================================

    {"source": "tennis_elbow", "target": "elbow", "type": "AFFECTS", "weight": 1.0,
     "properties": {"mechanism": "Lateral epicondyle tendinopathy"}},
    {"source": "shoulder_impingement", "target": "shoulder", "type": "AFFECTS", "weight": 1.0,
     "properties": {"mechanism": "Subacromial space compression"}},
    {"source": "groin_strain", "target": "hip", "type": "AFFECTS", "weight": 0.9,
     "properties": {"mechanism": "Adductor origin at pubic bone"}},
    {"source": "plank_variations", "target": "core_trunk", "type": "AFFECTS", "weight": 0.8,
     "properties": {"mechanism": "Primary training stimulus for core musculature"}},
    {"source": "severs_disease", "target": "calf", "type": "AFFECTS", "weight": 0.9,
     "properties": {"mechanism": "Tight calf complex increases calcaneal traction"}},
    {"source": "concussion", "target": "neck", "type": "AFFECTS", "weight": 0.8,
     "properties": {"mechanism": "Neck strength attenuates head acceleration on impact"}},

    # =========================================================================
    # CROSS-SPORT EXERCISE SHARING
    # =========================================================================

    # Agility/footwork drills shared across sports
    {"source": "footwork_split_step", "target": "basketball", "type": "BELONGS_TO", "weight": 0.6,
     "properties": {"note": "Split-step applies to defensive basketball positioning"}},

    # Prehab exercises shared across sports
    {"source": "ankle_mobility_work", "target": "football", "type": "BELONGS_TO", "weight": 0.8},
    {"source": "ankle_mobility_work", "target": "basketball", "type": "BELONGS_TO", "weight": 0.9},
    {"source": "ankle_mobility_work", "target": "tennis", "type": "BELONGS_TO", "weight": 0.7},
    {"source": "ankle_mobility_work", "target": "padel", "type": "BELONGS_TO", "weight": 0.7},
    {"source": "ankle_mobility_work", "target": "athletics", "type": "BELONGS_TO", "weight": 0.7},

    {"source": "hip_mobility_complex", "target": "football", "type": "BELONGS_TO", "weight": 0.9},
    {"source": "hip_mobility_complex", "target": "athletics", "type": "BELONGS_TO", "weight": 0.8},
    {"source": "hip_mobility_complex", "target": "basketball", "type": "BELONGS_TO", "weight": 0.7},
    {"source": "hip_mobility_complex", "target": "tennis", "type": "BELONGS_TO", "weight": 0.7},
    {"source": "hip_mobility_complex", "target": "padel", "type": "BELONGS_TO", "weight": 0.7},
]


# ==============================================================================
# SEEDING LOGIC
# ==============================================================================

async def seed():
    """Main expansion seeding function."""
    t0 = time.time()

    # Initialize DB pool
    await init_db_pool()

    logger.info(f"Expansion: seeding {len(ENTITIES)} entities and {len(RELATIONSHIPS)} relationships...")

    # Step 1: Embed all entity descriptions
    descriptions = [e["description"] for e in ENTITIES]
    logger.info(f"Embedding {len(descriptions)} entity descriptions via Voyage AI...")

    # Batch embed with rate limiting
    embeddings = await embed_documents(descriptions)
    logger.info(f"Embedded {len(embeddings)} descriptions")

    # Step 2: Attach embeddings to entities
    for i, ent in enumerate(ENTITIES):
        ent["embedding"] = embeddings[i]

    # Step 3: Bulk upsert entities (will merge with base seed entities already present)
    name_to_id = await bulk_upsert_entities(ENTITIES)
    logger.info(f"Upserted {len(name_to_id)} entities")

    # Step 4: Build relationship records with resolved entity IDs
    # NOTE: Relationships may reference entities from the BASE seed script.
    # bulk_upsert_entities returns IDs for newly upserted entities, but we also
    # need IDs for base entities (e.g. football, mid_phv, red_readiness).
    # The graph_store.bulk_upsert_entities should return all entities it processed.
    # For relationships referencing base entities, we need to look them up.

    rel_records = []
    skipped = 0
    missing_entities: set[str] = set()

    for rel in RELATIONSHIPS:
        source_id = name_to_id.get(rel["source"])
        target_id = name_to_id.get(rel["target"])
        if not source_id:
            missing_entities.add(rel["source"])
        if not target_id:
            missing_entities.add(rel["target"])
        if not source_id or not target_id:
            skipped += 1
            continue
        rel_records.append({
            "source_entity_id": source_id,
            "target_entity_id": target_id,
            "relation_type": rel["type"],
            "properties": rel.get("properties", {}),
            "weight": rel.get("weight", 1.0),
        })

    if missing_entities:
        logger.warning(
            f"Some relationships reference base-seed entities not in this batch. "
            f"Attempting to resolve {len(missing_entities)} missing entities from DB..."
        )
        # Resolve missing entity IDs from existing DB records
        from app.db.supabase import get_pool
        pool = get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT id, name FROM knowledge_entities WHERE name = ANY($1::text[])",
                list(missing_entities),
            )
            for row in rows:
                name_to_id[row["name"]] = str(row["id"])
            resolved = {row["name"] for row in rows}
            still_missing = missing_entities - resolved
            if still_missing:
                logger.warning(f"Could not resolve entities (run base seed first?): {still_missing}")

        # Retry relationship building with resolved IDs
        rel_records = []
        skipped = 0
        for rel in RELATIONSHIPS:
            source_id = name_to_id.get(rel["source"])
            target_id = name_to_id.get(rel["target"])
            if not source_id or not target_id:
                logger.warning(f"Skipping relationship: {rel['source']} -> {rel['target']} (entity not found)")
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
    logger.info(
        f"Knowledge graph expansion seeded in {elapsed:.1f}s: "
        f"{len(ENTITIES)} new entities, {count} relationships "
        f"({skipped} skipped)"
    )


if __name__ == "__main__":
    asyncio.run(seed())
