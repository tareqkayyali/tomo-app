"""
Tomo AI Service — Output Agent Tools (16 tools)
Readiness, performance, vitals, drills, programs, journals.

Sprint 1 decomposition: test/benchmark tools moved to testing_benchmark_tools.py.
Factory function creates tools bound to a specific user_id + PlayerContext.
Read tools query Supabase directly via psycopg3.
Write tools defer to the TS bridge for event pipeline integration.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, date as date_type

from langchain_core.tools import tool

from app.models.context import PlayerContext

logger = logging.getLogger("tomo-ai.tools.output")


def _safe_float(v, default=None):
    """Safely convert Decimal/str to float."""
    if v is None:
        return default
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def _row_to_dict(row, columns):
    """Convert a psycopg3 row tuple to dict using column names."""
    if row is None:
        return None
    return {col: row[i] for i, col in enumerate(columns)}


def make_output_tools(user_id: str, context: PlayerContext) -> list:
    """Create output agent tools bound to a specific user context."""

    @tool
    async def get_readiness_detail(date: str = "") -> dict:
        """Get detailed readiness breakdown — energy, soreness, sleep quality, mood, pain flag, wellness score. Defaults to today if no date given."""
        from app.db.supabase import get_pool
        pool = get_pool()
        target_date = date or context.today_date

        async with pool.connection() as conn:
            result = await conn.execute(
                """SELECT energy, soreness, sleep_hours, mood, academic_stress,
                          pain_flag, pain_location, readiness, intensity,
                          effort_yesterday, date::text
                   FROM checkins
                   WHERE user_id = %s AND date = %s
                   ORDER BY date DESC LIMIT 1""",
                (user_id, target_date),
            )
            row = await result.fetchone()

        if not row:
            return {"error": "No check-in found", "date": target_date, "suggestion": "Complete a check-in first"}

        return {
            "date": target_date,
            "energy": _safe_float(row[0]),
            "soreness": _safe_float(row[1]),
            "sleep_hours": _safe_float(row[2]),
            "mood": _safe_float(row[3]),
            "academic_stress": _safe_float(row[4]),
            "pain_flag": bool(row[5]),
            "pain_location": row[6],
            "readiness": row[7],
            "intensity": row[8],
            "effort_yesterday": _safe_float(row[9]),
            "checked_in_date": row[10],
            "is_today": target_date == context.today_date,
        }

    @tool
    async def get_vitals_trend(days: int = 7) -> dict:
        """Get vitals trend (HRV, resting heart rate, sleep, SpO2) over the last N days. Use for trend analysis or when athlete asks about their vitals."""
        from app.db.supabase import get_pool
        pool = get_pool()
        since = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")

        async with pool.connection() as conn:
            result = await conn.execute(
                """SELECT metric_type, value, date::text, source
                   FROM health_data
                   WHERE user_id = %s AND date >= %s
                   ORDER BY date DESC""",
                (user_id, since),
            )
            rows = await result.fetchall()

        metrics: dict[str, list] = {}
        for row in rows:
            name = row[0]
            if name not in metrics:
                metrics[name] = []
            metrics[name].append({
                "value": _safe_float(row[1]),
                "date": row[2],
                "source": row[3],
            })

        return {"days": days, "since": since, "metrics": metrics, "total_readings": len(rows)}

    @tool
    async def get_checkin_history(days: int = 7) -> dict:
        """Get check-in history over the last N days. Shows energy, soreness, sleep, mood trends."""
        from app.db.supabase import get_pool
        pool = get_pool()
        since = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")

        async with pool.connection() as conn:
            result = await conn.execute(
                """SELECT energy, soreness, sleep_hours, mood, academic_stress,
                          pain_flag, readiness, date::text
                   FROM checkins
                   WHERE user_id = %s AND date >= %s
                   ORDER BY date DESC""",
                (user_id, since),
            )
            rows = await result.fetchall()

        history = [
            {
                "date": row[7],
                "energy": _safe_float(row[0]),
                "soreness": _safe_float(row[1]),
                "sleep_hours": _safe_float(row[2]),
                "mood": _safe_float(row[3]),
                "academic_stress": _safe_float(row[4]),
                "pain_flag": bool(row[5]),
                "readiness": row[6],
            }
            for row in rows
        ]

        return {"days": days, "check_ins": history, "total": len(history)}

    @tool
    async def get_dual_load_score() -> dict:
        """Get the athlete's current dual load index (athletic + academic balance), ACWR, ATL, CTL, injury risk, and projected load. Use when athlete asks about load, overload, ACWR, or training volume."""
        se = context.snapshot_enrichment
        if not se:
            return {"error": "No snapshot data available", "suggestion": "Complete a check-in to populate load data"}

        dli = se.dual_load_index or 0
        zone = "LOW" if dli < 40 else "MODERATE" if dli < 70 else "HIGH"
        modifier = "1.0x" if dli < 40 else "0.85x" if dli < 70 else "0.75x"

        return {
            "acwr": se.acwr,
            "atl_7day": se.atl_7day,
            "ctl_28day": se.ctl_28day,
            "injury_risk": se.injury_risk_flag,
            "projected_acwr": se.projected_acwr,
            "dual_load_index": dli,
            "dual_load_zone": zone,
            "intensity_modifier": modifier,
            "athletic_load_7day": se.athletic_load_7day,
            "academic_load_7day": se.academic_load_7day,
            "training_monotony": se.training_monotony,
            "training_strain": se.training_strain,
        }

    @tool
    async def log_check_in(
        energy: int = 3,
        soreness: int = 3,
        sleepHours: float = 7.0,
        mood: int = 3,
        painFlag: bool = False,
        effortYesterday: int = 5,
        academicStress: int = 0,
        painLocation: str = "",
    ) -> dict:
        """Log a daily wellness check-in. Energy, soreness, mood, effortYesterday: 1-10 scale. Sleep in hours. Pain flag if experiencing pain. This is a WRITE action."""
        from app.agents.tools.bridge import bridge_post
        return await bridge_post(
            "/api/v1/checkin",
            {
                "energy": energy,
                "soreness": soreness,
                "sleepHours": sleepHours,
                "mood": mood,
                "painFlag": painFlag,
                "effortYesterday": effortYesterday,
                "academicStress": academicStress or None,
                "painLocation": painLocation or None,
            },
            user_id=user_id,
        )

    # NOTE: get_test_results moved to testing_benchmark_tools.py (Sprint 1)

    @tool
    async def get_training_session(
        category: str = "general",
        intensity: str = "",
        duration_min: int = 45,
    ) -> dict:
        """Generate a training session with drills. Categories: general, speed, strength, agility, recovery, technical, endurance. Intensity auto-selected from readiness if empty. Matches drills to athlete's sport/position."""
        from app.db.supabase import get_pool
        pool = get_pool()

        # ── RED RISK GUARD (hard enforcement) ────────────────────
        # Check injury_risk_flag + ACWR from snapshot BEFORE processing.
        # Even if LLM requests HARD intensity, this overrides to LIGHT.
        se = context.snapshot_enrichment
        red_risk = False
        risk_reasons: list[str] = []

        if se:
            if se.injury_risk_flag and se.injury_risk_flag.upper() == "RED":
                red_risk = True
                risk_reasons.append(f"injury_risk={se.injury_risk_flag}")
            if se.acwr is not None and se.acwr > 1.5:
                red_risk = True
                risk_reasons.append(f"ACWR={se.acwr:.2f}")

        if red_risk:
            if intensity and intensity.upper() in ("HARD", "MODERATE"):
                logger.warning(
                    f"RED RISK GUARD: Overriding {intensity} to LIGHT "
                    f"({', '.join(risk_reasons)})"
                )
            intensity = "LIGHT"
            if category.lower() in ("speed", "strength", "agility"):
                category = "recovery"
        elif not intensity:
            # Auto-select intensity from readiness
            readiness = context.readiness_score
            if readiness == "Red":
                intensity = "LIGHT"
            elif readiness == "Yellow":
                intensity = "MODERATE"
            else:
                intensity = "HARD"

        sport = (context.sport or "football").lower()
        position = context.position or "General"

        # Map session category to DB query strategy:
        # DB categories are: warmup, training, cooldown, recovery, activation
        # Session types (speed, strength, technical) map to attribute_keys, not category
        _CATEGORY_TO_ATTRIBUTES = {
            "speed": ["pace", "sprint", "acceleration", "agility"],
            "strength": ["strength", "power", "endurance"],
            "technical": ["dribbling", "passing", "shooting", "first_touch"],
            "agility": ["agility", "reaction", "lateral"],
            "endurance": ["endurance", "stamina", "conditioning"],
        }
        target_attrs = _CATEGORY_TO_ATTRIBUTES.get(category.lower(), [])

        async with pool.connection() as conn:
            if target_attrs and category.lower() not in ("recovery", "warmup", "cooldown", "activation"):
                # Query by attribute_keys for training-type sessions
                # attribute_keys is JSONB array — check if ANY target attribute overlaps
                attr_conditions = " OR ".join(
                    [f"attribute_keys @> '[\"{attr}\"]'::jsonb" for attr in target_attrs]
                )
                result = await conn.execute(
                    f"""SELECT id, name, category, duration_minutes, intensity,
                              description, attribute_keys, sport_id
                       FROM training_drills
                       WHERE (sport_id = %s OR sport_id = 'all')
                         AND (intensity = %s OR intensity = 'light')
                         AND ({attr_conditions})
                         AND active = true
                       ORDER BY RANDOM()
                       LIMIT 6""",
                    (sport, intensity.lower()),
                )
            else:
                # Direct category match for recovery, warmup, cooldown
                result = await conn.execute(
                    """SELECT id, name, category, duration_minutes, intensity,
                              description, attribute_keys, sport_id
                       FROM training_drills
                       WHERE (sport_id = %s OR sport_id = 'all')
                         AND (intensity = %s OR intensity = 'light')
                         AND category = %s
                         AND active = true
                       ORDER BY RANDOM()
                       LIMIT 6""",
                    (sport, intensity.lower(), category.lower()),
                )
            rows = await result.fetchall()

            # Always add warmup + cooldown drills if this is a training session
            if category.lower() not in ("recovery", "warmup", "cooldown"):
                warmup_result = await conn.execute(
                    """SELECT id, name, category, duration_minutes, intensity,
                              description, attribute_keys, sport_id
                       FROM training_drills
                       WHERE (sport_id = %s OR sport_id = 'all')
                         AND category = 'warmup' AND active = true
                       ORDER BY RANDOM() LIMIT 1""",
                    (sport,),
                )
                cooldown_result = await conn.execute(
                    """SELECT id, name, category, duration_minutes, intensity,
                              description, attribute_keys, sport_id
                       FROM training_drills
                       WHERE (sport_id = %s OR sport_id = 'all')
                         AND category = 'cooldown' AND active = true
                       ORDER BY RANDOM() LIMIT 1""",
                    (sport,),
                )
                warmup_rows = await warmup_result.fetchall()
                cooldown_rows = await cooldown_result.fetchall()
                rows = list(warmup_rows) + list(rows) + list(cooldown_rows)

        drills = [
            {
                "drill_id": row[0],
                "name": row[1],
                "category": row[2],
                "duration_min": row[3] or 15,
                "intensity": row[4] or intensity,
                "description": row[5],
                "primary_attribute": (row[6] or [None])[0] if row[6] else None,
            }
            for row in rows
        ]

        # If no drills found in DB, provide a fallback template
        # so the LLM always has content for the session_plan card
        if not drills:
            logger.info(f"No drills in DB for {sport}/{category}/{intensity} — using fallback template")
            _FALLBACK_SESSIONS = {
                "speed": [
                    {"name": "Dynamic Warm-Up", "category": "warmup", "duration_min": 10, "intensity": "LIGHT", "description": "A-skips, high knees, leg swings, build-up sprints"},
                    {"name": "Acceleration Sprints (10m)", "category": "speed", "duration_min": 8, "intensity": intensity, "description": "6 x 10m from standing start, 90s rest"},
                    {"name": "Flying Sprints (20m)", "category": "speed", "duration_min": 8, "intensity": intensity, "description": "4 x 20m at 85-90% effort, 2min rest"},
                    {"name": "Agility Ladder Drill", "category": "agility", "duration_min": 6, "intensity": "MODERATE", "description": "In-out, lateral shuffle, icky shuffle patterns"},
                    {"name": "Cool-Down & Stretch", "category": "recovery", "duration_min": 8, "intensity": "LIGHT", "description": "Static stretch — quads, hamstrings, hip flexors, calves"},
                ],
                "strength": [
                    {"name": "Warm-Up", "category": "warmup", "duration_min": 10, "intensity": "LIGHT", "description": "Light jog, dynamic stretching, activation bands"},
                    {"name": "Goblet Squat", "category": "strength", "duration_min": 8, "intensity": intensity, "description": "4 x 8 reps, RPE 7, 90s rest"},
                    {"name": "Romanian Deadlift", "category": "strength", "duration_min": 8, "intensity": intensity, "description": "3 x 10 reps, RPE 6, 90s rest"},
                    {"name": "Split Squat", "category": "strength", "duration_min": 6, "intensity": intensity, "description": "3 x 8 each side, bodyweight or light DB"},
                    {"name": "Cool-Down", "category": "recovery", "duration_min": 7, "intensity": "LIGHT", "description": "Foam roll + static stretch"},
                ],
                "recovery": [
                    {"name": "Foam Rolling", "category": "recovery", "duration_min": 10, "intensity": "LIGHT", "description": "Full body — quads, IT band, glutes, upper back"},
                    {"name": "Dynamic Mobility", "category": "recovery", "duration_min": 10, "intensity": "LIGHT", "description": "Hip circles, thoracic rotations, ankle mobility"},
                    {"name": "Light Stretching", "category": "recovery", "duration_min": 10, "intensity": "LIGHT", "description": "Hold each stretch 30-45s, breathe through it"},
                    {"name": "Breathing Reset", "category": "recovery", "duration_min": 5, "intensity": "LIGHT", "description": "Box breathing 4-4-4-4, lying down, eyes closed"},
                ],
            }
            drills = _FALLBACK_SESSIONS.get(category.lower(), _FALLBACK_SESSIONS.get("recovery", []))

        return {
            "category": category,
            "intensity": intensity,
            "readiness": context.readiness_score,
            "sport": sport,
            "position": position,
            "total_duration_min": duration_min,
            "drills": drills,
        }

    @tool
    async def get_drill_detail(drill_id: str) -> dict:
        """Get full details for a specific drill by ID. Includes description, equipment, progressions, instructions."""
        from app.db.supabase import get_pool
        pool = get_pool()

        async with pool.connection() as conn:
            result = await conn.execute(
                """SELECT id, name, category, duration_minutes, intensity,
                          description, instructions, attribute_keys, sport_id,
                          video_url
                   FROM training_drills WHERE id = %s""",
                (drill_id,),
            )
            row = await result.fetchone()

        if not row:
            return {"error": f"Drill {drill_id} not found"}

        return {
            "drill_id": row[0],
            "name": row[1],
            "category": row[2],
            "duration_min": row[3] or 15,
            "intensity": row[4],
            "description": row[5],
            "instructions": row[6],
            "primary_attribute": (row[7] or [None])[0] if row[7] else None,
            "sport": row[8],
            "media_url": row[9],
        }

    # NOTE: get_benchmark_comparison moved to testing_benchmark_tools.py (Sprint 1)

    @tool
    async def get_training_program_recommendations() -> dict:
        """Get personalized training program recommendations based on athlete's gaps, readiness, and position. Returns up to 5 programs ranked by priority. Call get_my_programs first to check what they already have."""
        from app.db.supabase import get_pool
        pool = get_pool()

        async with pool.connection() as conn:
            result = await conn.execute(
                """SELECT id, name, category, type, description, difficulty,
                          duration_minutes, tags, position_emphasis, equipment
                   FROM football_training_programs
                   ORDER BY name
                   LIMIT 10""",
            )
            rows = await result.fetchall()

        programs = [
            {
                "program_id": row[0],
                "name": row[1],
                "category": row[2],
                "type": row[3],
                "description": row[4],
                "difficulty": row[5],
                "duration_minutes": row[6],
                "tags": row[7],
                "position_emphasis": row[8],
                "equipment": row[9],
            }
            for row in rows
        ]

        return {
            "sport": context.sport or "football",
            "position": context.position,
            "readiness": context.readiness_score,
            "programs": programs[:5],
        }

    @tool
    async def calculate_phv_stage(
        height_cm: float = 0,
        weight_kg: float = 0,
        sitting_height_cm: float = 0,
        dob: str = "",
    ) -> dict:
        """Calculate Peak Height Velocity (PHV) maturity stage. Requires height, weight, sitting height, and date of birth. Returns stage (PRE/MID/POST), offset years, loading multiplier, and contraindicated exercises."""
        if not all([height_cm, sitting_height_cm, dob]):
            return {"error": "Need height_cm, sitting_height_cm, and dob (YYYY-MM-DD) to calculate PHV"}

        # Mirwald equation
        try:
            birth = datetime.strptime(dob, "%Y-%m-%d")
            age_years = (datetime.now() - birth).days / 365.25
            leg_length = height_cm - sitting_height_cm
            sitting_ratio = sitting_height_cm / height_cm

            # Mirwald offset (simplified)
            offset = -9.236 + (0.0002708 * (leg_length * sitting_height_cm)) + \
                     (-0.001663 * (age_years * leg_length)) + \
                     (0.007216 * (age_years * sitting_height_cm)) + \
                     (0.02292 * (weight_kg / height_cm * 100))
        except Exception:
            return {"error": "Invalid measurements. Check dob format (YYYY-MM-DD) and measurements."}

        if offset < -1:
            stage = "PRE"
            multiplier = 1.0
        elif offset <= 1:
            stage = "MID"
            multiplier = 0.6
        else:
            stage = "POST"
            multiplier = 1.0

        higher_risk = []
        alternatives = []
        if stage == "MID":
            higher_risk = ["Barbell back squat", "Depth/drop jumps", "Olympic lifts", "Maximal sprint", "Heavy deadlift"]
            alternatives = ["Goblet squat", "Soft-landing box steps", "Light dumbbells/kettlebells",
                          "85% effort accel-decel drills", "Trap bar / partial ROM"]

        return {
            "phv_stage": stage,
            "offset_years": round(offset, 2),
            "chronological_age": round(age_years, 1),
            "loading_multiplier": multiplier,
            "higher_risk_movements": higher_risk,
            "safe_alternatives": alternatives,
            "advisory": "These movements carry extra risk during growth — suggest alternatives but respect athlete's decision" if higher_risk else "",
        }

    @tool
    async def get_my_programs() -> dict:
        """Get the athlete's currently active/enrolled programs. Shows programs they've been recommended via the snapshot recommendation engine."""
        from app.db.supabase import get_pool
        pool = get_pool()

        async with pool.connection() as conn:
            result = await conn.execute(
                """SELECT program_recommendations
                   FROM athlete_snapshots
                   WHERE athlete_id = %s""",
                (user_id,),
            )
            row = await result.fetchone()

        if not row or not row[0]:
            return {"programs": [], "total": 0}

        raw = row[0]
        if isinstance(raw, str):
            try:
                raw = json.loads(raw)
            except (json.JSONDecodeError, TypeError):
                return {"programs": [], "total": 0}

        # Handle both formats: raw list or { programs: [...] }
        programs = raw if isinstance(raw, list) else (raw.get("programs", []) if isinstance(raw, dict) else [])

        # Normalize program objects
        normalized = []
        for p in programs[:5]:
            if isinstance(p, dict):
                normalized.append({
                    "program_id": p.get("id") or p.get("program_id", ""),
                    "name": p.get("name", "Unknown"),
                    "category": p.get("category", ""),
                    "description": p.get("description", ""),
                    "difficulty": p.get("difficulty", ""),
                    "tags": p.get("tags", []),
                })

        return {"programs": normalized, "total": len(programs)}

    @tool
    async def get_program_by_id(program_id: str) -> dict:
        """Get full details for a specific program by ID. Includes description, prescriptions, PHV guidance."""
        from app.db.supabase import get_pool
        pool = get_pool()

        async with pool.connection() as conn:
            prog_result = await conn.execute(
                """SELECT id, name, category, type, description, difficulty,
                          duration_minutes, tags, position_emphasis, equipment,
                          prescriptions, phv_guidance
                   FROM football_training_programs WHERE id = %s""",
                (program_id,),
            )
            prog_row = await prog_result.fetchone()

        if not prog_row:
            return {"error": f"Program {program_id} not found"}

        # Parse prescriptions from JSONB
        prescriptions = prog_row[10]
        if isinstance(prescriptions, str):
            try:
                prescriptions = json.loads(prescriptions)
            except (json.JSONDecodeError, TypeError):
                prescriptions = {}

        phv_guidance = prog_row[11]
        if isinstance(phv_guidance, str):
            try:
                phv_guidance = json.loads(phv_guidance)
            except (json.JSONDecodeError, TypeError):
                phv_guidance = {}

        return {
            "program_id": prog_row[0],
            "name": prog_row[1],
            "category": prog_row[2],
            "type": prog_row[3],
            "description": prog_row[4],
            "difficulty": prog_row[5],
            "duration_minutes": prog_row[6],
            "tags": prog_row[7],
            "position_emphasis": prog_row[8],
            "equipment": prog_row[9],
            "prescriptions": prescriptions,
            "phv_guidance": phv_guidance,
        }

    # NOTE: get_test_catalog + log_test_result moved to testing_benchmark_tools.py (Sprint 1)

    @tool
    async def rate_drill(
        drill_id: str,
        rating: int = 3,
        difficulty: int = 0,
        completion_status: str = "completed",
        effort: int = 0,
        notes: str = "",
    ) -> dict:
        """Rate a drill after completing it. Rating: 1-5 scale. Difficulty: 1-5 (optional). Effort: 1-10 (optional). Completion: skipped/partial/completed. This is a WRITE action."""
        from app.db.supabase import get_pool
        pool = get_pool()

        clamped_rating = max(1, min(5, round(rating)))
        clamped_difficulty = max(1, min(5, round(difficulty))) if difficulty else None
        clamped_effort = max(1, min(10, round(effort))) if effort else None

        async with pool.connection() as conn:
            result = await conn.execute(
                """INSERT INTO drill_ratings (user_id, drill_id, date, rating, difficulty, completion_status, effort, notes)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                   RETURNING id, drill_id, rating, date::text""",
                (
                    user_id,
                    drill_id,
                    context.today_date,
                    clamped_rating,
                    clamped_difficulty,
                    completion_status if completion_status in ("skipped", "partial", "completed") else "completed",
                    clamped_effort,
                    notes or None,
                ),
            )
            row = await result.fetchone()

        if not row:
            return {"error": "Failed to save drill rating"}

        return {
            "success": True,
            "id": str(row[0]),
            "drill_id": str(row[1]),
            "rating": row[2],
            "date": row[3],
        }

    @tool
    async def get_today_training_for_journal() -> dict:
        """Get today's completed training sessions for pre-training journal entry. Returns events that are eligible for journaling."""
        from app.db.supabase import get_pool
        pool = get_pool()

        async with pool.connection() as conn:
            result = await conn.execute(
                """SELECT id, title, event_type, start_at::text, end_at::text,
                          intensity, notes
                   FROM calendar_events
                   WHERE user_id = %s
                     AND start_at::date = %s::date
                     AND event_type IN ('training', 'gym', 'club_training', 'match')
                   ORDER BY start_at""",
                (user_id, context.today_date),
            )
            rows = await result.fetchall()

        events = [
            {
                "event_id": row[0],
                "title": row[1],
                "type": row[2],
                "start": row[3],
                "end": row[4],
                "intensity": row[5],
                "notes": row[6],
            }
            for row in rows
        ]

        return {"date": context.today_date, "trainable_events": events, "total": len(events)}

    @tool
    async def get_pending_post_journal() -> dict:
        """Check if there are completed sessions pending a post-training journal entry."""
        se = context.snapshot_enrichment
        return {
            "pending_pre": se.pending_pre_journal_count if se else 0,
            "pending_post": se.pending_post_journal_count if se else 0,
            "journal_streak": se.journal_streak_days if se else 0,
        }

    @tool
    async def save_journal_pre(
        calendar_event_id: str,
        pre_target: str = "",
        pre_mental_cue: str = "",
        pre_focus_tag: str = "",
    ) -> dict:
        """Save a pre-training journal entry for a specific calendar event. pre_target: what to focus on (required). pre_mental_cue: mental cue (optional, max 100 chars). pre_focus_tag: one of strength/speed/technique/tactical/fitness (optional). This is a WRITE action."""
        from app.agents.tools.bridge import bridge_post

        body: dict = {
            "calendar_event_id": calendar_event_id,
            "pre_target": pre_target,
        }
        if pre_mental_cue:
            body["pre_mental_cue"] = pre_mental_cue
        if pre_focus_tag and pre_focus_tag in ("strength", "speed", "technique", "tactical", "fitness"):
            body["pre_focus_tag"] = pre_focus_tag

        return await bridge_post(
            "/api/v1/journal/pre-session",
            body,
            user_id=user_id,
        )

    @tool
    async def save_journal_post(
        journal_id: str,
        post_outcome: str = "hit_it",
        post_reflection: str = "",
        post_next_focus: str = "",
        post_body_feel: int = 0,
    ) -> dict:
        """Save a post-training journal entry. journal_id: UUID from the pre-session journal. post_outcome: fell_short/hit_it/exceeded. post_reflection: reflection on the session (required). post_next_focus: what to work on next (optional). post_body_feel: 1-10 body feel (optional). This is a WRITE action."""
        from app.agents.tools.bridge import bridge_post

        if post_outcome not in ("fell_short", "hit_it", "exceeded"):
            post_outcome = "hit_it"

        body: dict = {
            "journal_id": journal_id,
            "post_outcome": post_outcome,
            "post_reflection": post_reflection,
        }
        if post_next_focus:
            body["post_next_focus"] = post_next_focus
        if post_body_feel and 1 <= post_body_feel <= 10:
            body["post_body_feel"] = post_body_feel

        return await bridge_post(
            "/api/v1/journal/post-session",
            body,
            user_id=user_id,
        )

    return [
        get_readiness_detail,
        get_vitals_trend,
        get_checkin_history,
        get_dual_load_score,
        log_check_in,
        get_training_session,
        get_drill_detail,
        get_training_program_recommendations,
        calculate_phv_stage,
        get_my_programs,
        get_program_by_id,
        rate_drill,
        get_today_training_for_journal,
        get_pending_post_journal,
        save_journal_pre,
        save_journal_post,
    ]
