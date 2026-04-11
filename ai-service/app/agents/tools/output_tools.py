"""
Tomo AI Service — Output Agent Tools (22 tools)
Readiness, performance, vitals, drills, programs, benchmarks, journals.

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
        sleep_hours: float = 7.0,
        mood: int = 3,
        pain_flag: bool = False,
        academic_stress: int = 0,
        notes: str = "",
    ) -> dict:
        """Log a daily wellness check-in. Energy, soreness, mood: 1-5 scale. Sleep in hours. Pain flag if experiencing pain. This is a WRITE action."""
        from app.agents.tools.bridge import bridge_post
        return await bridge_post(
            "/api/v1/checkin",
            {
                "energy": energy,
                "soreness": soreness,
                "sleep_hours": sleep_hours,
                "mood": mood,
                "pain_flag": pain_flag,
                "academic_stress": academic_stress,
                "notes": notes,
            },
            user_id=user_id,
        )

    @tool
    async def get_test_results(test_type: str = "", days: int = 90) -> dict:
        """Get test results history. Optionally filter by test_type. Test types: sprint_10m, sprint_30m, cmj, yoyo_ir1, agility_ttest, agility_505, reaction_time, vertical_jump, etc. Leave empty for all tests."""
        from app.db.supabase import get_pool
        pool = get_pool()
        since = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")

        if test_type:
            query = """SELECT test_type, score, NULL::text AS unit, NULL::float AS percentile, date::text, id::text
                       FROM phone_test_sessions
                       WHERE user_id = %s AND test_type = %s AND date >= %s
                       UNION ALL
                       SELECT test_type, primary_value AS score, primary_unit AS unit, percentile, date::text, id::text
                       FROM football_test_results
                       WHERE user_id = %s AND test_type = %s AND date >= %s
                       ORDER BY 5 DESC"""
            params = (user_id, test_type, since, user_id, test_type, since)
        else:
            query = """SELECT test_type, score, NULL::text AS unit, NULL::float AS percentile, date::text, id::text
                       FROM phone_test_sessions
                       WHERE user_id = %s AND date >= %s
                       UNION ALL
                       SELECT test_type, primary_value AS score, primary_unit AS unit, percentile, date::text, id::text
                       FROM football_test_results
                       WHERE user_id = %s AND date >= %s
                       ORDER BY 5 DESC"""
            params = (user_id, since, user_id, since)

        async with pool.connection() as conn:
            result = await conn.execute(query, params)
            rows = await result.fetchall()

        tests = [
            {
                "test_type": row[0],
                "score": _safe_float(row[1]),
                "unit": row[2],
                "percentile": _safe_float(row[3]),
                "date": row[4],
                "id": row[5],
            }
            for row in rows
        ]

        return {"days": days, "filter": test_type or "all", "results": tests, "total": len(tests)}

    @tool
    async def get_training_session(
        category: str = "general",
        intensity: str = "",
        duration_min: int = 45,
    ) -> dict:
        """Generate a training session with drills. Categories: general, speed, strength, agility, recovery, technical, endurance. Intensity auto-selected from readiness if empty. Matches drills to athlete's sport/position."""
        from app.db.supabase import get_pool
        pool = get_pool()

        # Auto-select intensity from readiness
        if not intensity:
            readiness = context.readiness_score
            if readiness == "Red":
                intensity = "LIGHT"
            elif readiness == "Yellow":
                intensity = "MODERATE"
            else:
                intensity = "HARD"

        sport = (context.sport or "football").lower()
        position = context.position or "General"

        async with pool.connection() as conn:
            result = await conn.execute(
                """SELECT id, name, category, duration_minutes, intensity,
                          description, attribute_keys, sport_id
                   FROM training_drills
                   WHERE (sport_id = %s OR sport_id = 'all')
                     AND (intensity = %s OR intensity = 'light')
                     AND category ILIKE %s
                     AND active = true
                   ORDER BY RANDOM()
                   LIMIT 8""",
                (sport, intensity.lower(), f"%{category}%"),
            )
            rows = await result.fetchall()

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

    @tool
    async def get_benchmark_comparison(metric: str = "", age_band: str = "") -> dict:
        """Get benchmark/percentile comparison for the athlete's test results against normative data. Use when athlete mentions peers, age group, comparison, or percentile. Metric examples: sprint_10m, cmj, yoyo_ir1, agility_ttest."""
        from app.db.supabase import get_pool
        pool = get_pool()

        target_age = age_band or context.age_band or "U19"
        target_position = context.position or "ALL"

        # Read pre-computed benchmarks from player_benchmark_snapshots
        # (populated by TS backend whenever tests are logged)
        async with pool.connection() as conn:
            if metric:
                bench_result = await conn.execute(
                    """SELECT DISTINCT ON (metric_key) metric_key, metric_label, value,
                              percentile, zone, age_band_used, position_used,
                              tested_at::text
                       FROM player_benchmark_snapshots
                       WHERE user_id = %s AND metric_key = %s
                       ORDER BY metric_key, tested_at DESC""",
                    (user_id, metric),
                )
            else:
                bench_result = await conn.execute(
                    """SELECT DISTINCT ON (metric_key) metric_key, metric_label, value,
                              percentile, zone, age_band_used, position_used,
                              tested_at::text
                       FROM player_benchmark_snapshots
                       WHERE user_id = %s
                       ORDER BY metric_key, tested_at DESC""",
                    (user_id,),
                )
            bench_rows = await bench_result.fetchall()

        comparisons = []
        for row in bench_rows:
            comparisons.append({
                "test_type": row[0],
                "label": row[1],
                "score": _safe_float(row[2]),
                "percentile": int(row[3]) if row[3] is not None else None,
                "zone": row[4],
                "age_band": row[5],
                "position": row[6],
                "date": row[7],
            })

        return {
            "age_band": target_age,
            "position": target_position,
            "comparisons": comparisons,
            "total": len(comparisons),
        }

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

        blocked = []
        alternatives = []
        if stage == "MID":
            blocked = ["Barbell back squat", "Depth/drop jumps", "Olympic lifts", "Maximal sprint", "Heavy deadlift"]
            alternatives = ["Goblet squat", "Soft-landing box steps", "Light dumbbells/kettlebells",
                          "85% effort accel-decel drills", "Trap bar / partial ROM"]

        return {
            "phv_stage": stage,
            "offset_years": round(offset, 2),
            "chronological_age": round(age_years, 1),
            "loading_multiplier": multiplier,
            "blocked_movements": blocked,
            "safe_alternatives": alternatives,
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

    @tool
    async def get_test_catalog() -> dict:
        """Get the full test catalog — all available test types the athlete can log. Includes phone tests and sport-specific tests."""
        from app.db.supabase import get_pool
        pool = get_pool()

        async with pool.connection() as conn:
            result = await conn.execute(
                """SELECT id, name, test_id, description,
                          primary_metric_name, sport_id, inputs, attribute_keys
                   FROM sport_test_definitions
                   ORDER BY sort_order, name""",
            )
            rows = await result.fetchall()

        tests = [
            {
                "id": row[0],
                "name": row[1],
                "key": row[2],
                "description": row[3],
                "primary_metric": row[4],
                "sport": row[5],
                "inputs": row[6],
                "attributes": row[7],
            }
            for row in rows
        ]

        return {"tests": tests, "total": len(tests)}

    @tool
    async def log_test_result(
        test_type: str,
        score: float,
        unit: str = "",
        notes: str = "",
    ) -> dict:
        """Log a new test result. test_type examples: sprint_10m, cmj, yoyo_ir1, agility_ttest, vertical_jump. Score in appropriate units. This is a WRITE action."""
        from app.agents.tools.bridge import bridge_post
        return await bridge_post(
            "/api/v1/tests",
            {
                "test_type": test_type,
                "score": score,
                "unit": unit,
                "notes": notes,
            },
            user_id=user_id,
        )

    @tool
    async def rate_drill(drill_id: str, rating: int = 3, feedback: str = "") -> dict:
        """Rate a drill after completing it. Rating: 1-5 scale. This is a WRITE action."""
        from app.agents.tools.bridge import bridge_post
        return await bridge_post(
            "/api/v1/drills/rate",
            {"drill_id": drill_id, "rating": rating, "feedback": feedback},
            user_id=user_id,
        )

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
        event_id: str,
        focus: str = "",
        energy_level: int = 3,
        goals: str = "",
    ) -> dict:
        """Save a pre-training journal entry for a specific event. Focus: what to work on. Goals: session targets. This is a WRITE action."""
        from app.agents.tools.bridge import bridge_post
        return await bridge_post(
            "/api/v1/journal/pre",
            {
                "event_id": event_id,
                "focus": focus,
                "energy_level": energy_level,
                "goals": goals,
            },
            user_id=user_id,
        )

    @tool
    async def save_journal_post(
        event_id: str,
        rating: int = 3,
        highlight: str = "",
        improvement: str = "",
        notes: str = "",
    ) -> dict:
        """Save a post-training journal entry for a specific event. Rating: 1-5. Highlight: best moment. Improvement: area to work on. This is a WRITE action."""
        from app.agents.tools.bridge import bridge_post
        return await bridge_post(
            "/api/v1/journal/post",
            {
                "event_id": event_id,
                "rating": rating,
                "highlight": highlight,
                "improvement": improvement,
                "notes": notes,
            },
            user_id=user_id,
        )

    return [
        get_readiness_detail,
        get_vitals_trend,
        get_checkin_history,
        get_dual_load_score,
        log_check_in,
        get_test_results,
        get_training_session,
        get_drill_detail,
        get_benchmark_comparison,
        get_training_program_recommendations,
        calculate_phv_stage,
        get_my_programs,
        get_program_by_id,
        get_test_catalog,
        log_test_result,
        rate_drill,
        get_today_training_for_journal,
        get_pending_post_journal,
        save_journal_pre,
        save_journal_post,
    ]
