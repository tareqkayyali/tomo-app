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
                """SELECT energy, soreness, sleep_hours, sleep_quality, mood,
                          pain_flag, notes, wellness_score, academic_stress,
                          created_at::text
                   FROM wellness_checkins
                   WHERE user_id = %s AND created_at::date = %s::date
                   ORDER BY created_at DESC LIMIT 1""",
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
            "sleep_quality": _safe_float(row[3]),
            "mood": _safe_float(row[4]),
            "pain_flag": bool(row[5]),
            "notes": row[6],
            "wellness_score": _safe_float(row[7]),
            "academic_stress": _safe_float(row[8]),
            "checked_in_at": row[9],
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
                """SELECT metric_name, value, recorded_at::date::text, source
                   FROM health_data
                   WHERE user_id = %s AND recorded_at >= %s::date
                   ORDER BY recorded_at DESC""",
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
                """SELECT energy, soreness, sleep_hours, mood, wellness_score,
                          pain_flag, created_at::date::text
                   FROM wellness_checkins
                   WHERE user_id = %s AND created_at >= %s::date
                   ORDER BY created_at DESC""",
                (user_id, since),
            )
            rows = await result.fetchall()

        history = [
            {
                "date": row[6],
                "energy": _safe_float(row[0]),
                "soreness": _safe_float(row[1]),
                "sleep_hours": _safe_float(row[2]),
                "mood": _safe_float(row[3]),
                "wellness_score": _safe_float(row[4]),
                "pain_flag": bool(row[5]),
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
            query = """SELECT test_type, score, unit, percentile, recorded_at::date::text, id
                       FROM phone_test_results
                       WHERE user_id = %s AND test_type = %s AND recorded_at >= %s::date
                       UNION ALL
                       SELECT test_type, score, unit, percentile, recorded_at::date::text, id::text
                       FROM football_test_results
                       WHERE user_id = %s AND test_type = %s AND recorded_at >= %s::date
                       ORDER BY 5 DESC"""
            params = (user_id, test_type, since, user_id, test_type, since)
        else:
            query = """SELECT test_type, score, unit, percentile, recorded_at::date::text, id
                       FROM phone_test_results
                       WHERE user_id = %s AND recorded_at >= %s::date
                       UNION ALL
                       SELECT test_type, score, unit, percentile, recorded_at::date::text, id::text
                       FROM football_test_results
                       WHERE user_id = %s AND recorded_at >= %s::date
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
                """SELECT id, name, category, equipment, duration_seconds, intensity,
                          description, primary_attribute, sport
                   FROM drills
                   WHERE (sport = %s OR sport = 'all')
                     AND (intensity = %s OR intensity = 'ANY')
                     AND category ILIKE %s
                   ORDER BY RANDOM()
                   LIMIT 8""",
                (sport, intensity, f"%{category}%"),
            )
            rows = await result.fetchall()

        drills = [
            {
                "drill_id": row[0],
                "name": row[1],
                "category": row[2],
                "equipment": row[3],
                "duration_min": max(1, (row[4] or 300) // 60),
                "intensity": row[5] or intensity,
                "description": row[6],
                "primary_attribute": row[7],
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
                """SELECT id, name, category, equipment, duration_seconds, intensity,
                          description, instructions, primary_attribute, sport,
                          progressions, media_url
                   FROM drills WHERE id = %s""",
                (drill_id,),
            )
            row = await result.fetchone()

        if not row:
            return {"error": f"Drill {drill_id} not found"}

        return {
            "drill_id": row[0],
            "name": row[1],
            "category": row[2],
            "equipment": row[3],
            "duration_min": max(1, (row[4] or 300) // 60),
            "intensity": row[5],
            "description": row[6],
            "instructions": row[7],
            "primary_attribute": row[8],
            "sport": row[9],
            "progressions": row[10],
            "media_url": row[11],
        }

    @tool
    async def get_benchmark_comparison(metric: str = "", age_band: str = "") -> dict:
        """Get benchmark/percentile comparison for the athlete's test results against normative data. Use when athlete mentions peers, age group, comparison, or percentile. Metric examples: sprint_10m, cmj, yoyo_ir1, agility_ttest."""
        from app.db.supabase import get_pool
        pool = get_pool()

        target_age = age_band or context.age_band or "U19"
        target_position = context.position or "ALL"

        # Get athlete's latest scores
        async with pool.connection() as conn:
            if metric:
                test_result = await conn.execute(
                    """SELECT test_type, score, unit, recorded_at::date::text
                       FROM phone_test_results
                       WHERE user_id = %s AND test_type = %s
                       ORDER BY recorded_at DESC LIMIT 1""",
                    (user_id, metric),
                )
            else:
                test_result = await conn.execute(
                    """SELECT DISTINCT ON (test_type) test_type, score, unit, recorded_at::date::text
                       FROM phone_test_results
                       WHERE user_id = %s
                       ORDER BY test_type, recorded_at DESC""",
                    (user_id,),
                )
            test_rows = await test_result.fetchall()

            # Get normative data
            norm_result = await conn.execute(
                """SELECT metric_key, age_band, position, p25, p50, p75, p90, unit
                   FROM sport_normative_data
                   WHERE age_band = %s AND (position = %s OR position = 'ALL')""",
                (target_age, target_position),
            )
            norm_rows = await norm_result.fetchall()

        norms = {}
        for row in norm_rows:
            norms[row[0]] = {
                "p25": _safe_float(row[3]),
                "p50": _safe_float(row[4]),
                "p75": _safe_float(row[5]),
                "p90": _safe_float(row[6]),
                "unit": row[7],
            }

        comparisons = []
        for row in test_rows:
            test_type = row[0]
            score = _safe_float(row[1])
            norm = norms.get(test_type, {})
            percentile = None
            if norm and score:
                if score >= (norm.get("p90") or 999):
                    percentile = 90
                elif score >= (norm.get("p75") or 999):
                    percentile = 75
                elif score >= (norm.get("p50") or 999):
                    percentile = 50
                elif score >= (norm.get("p25") or 999):
                    percentile = 25
                else:
                    percentile = 10

            comparisons.append({
                "test_type": test_type,
                "score": score,
                "unit": row[2],
                "date": row[3],
                "percentile": percentile,
                "normative": norm,
            })

        return {
            "age_band": target_age,
            "position": target_position,
            "comparisons": comparisons,
        }

    @tool
    async def get_training_program_recommendations() -> dict:
        """Get personalized training program recommendations based on athlete's gaps, readiness, and position. Returns up to 5 programs ranked by priority. Call get_my_programs first to check what they already have."""
        from app.db.supabase import get_pool
        pool = get_pool()
        sport = (context.sport or "football").lower()

        async with pool.connection() as conn:
            result = await conn.execute(
                """SELECT id, name, category, description, sport, position,
                          weekly_frequency, duration_weeks, difficulty,
                          primary_attribute, equipment_needed
                   FROM programs
                   WHERE (sport = %s OR sport = 'all')
                     AND is_active = true
                   ORDER BY priority ASC
                   LIMIT 10""",
                (sport,),
            )
            rows = await result.fetchall()

        programs = [
            {
                "program_id": row[0],
                "name": row[1],
                "category": row[2],
                "description": row[3],
                "sport": row[4],
                "position": row[5],
                "weekly_frequency": row[6],
                "duration_weeks": row[7],
                "difficulty": row[8],
                "primary_attribute": row[9],
                "equipment": row[10],
            }
            for row in rows
        ]

        return {
            "sport": sport,
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
        """Get the athlete's currently active/enrolled programs. Shows programs they've self-assigned or been assigned."""
        from app.db.supabase import get_pool
        pool = get_pool()

        async with pool.connection() as conn:
            result = await conn.execute(
                """SELECT p.id, p.name, p.category, p.description, p.weekly_frequency,
                          p.duration_weeks, p.difficulty, pp.started_at::date::text,
                          pp.progress_pct, pp.status
                   FROM player_programs pp
                   JOIN programs p ON p.id = pp.program_id
                   WHERE pp.user_id = %s AND pp.status IN ('active', 'in_progress')
                   ORDER BY pp.started_at DESC""",
                (user_id,),
            )
            rows = await result.fetchall()

        programs = [
            {
                "program_id": row[0],
                "name": row[1],
                "category": row[2],
                "description": row[3],
                "weekly_frequency": row[4],
                "duration_weeks": row[5],
                "difficulty": row[6],
                "started_at": row[7],
                "progress_pct": _safe_float(row[8], 0),
                "status": row[9],
            }
            for row in rows
        ]

        return {"programs": programs, "total": len(programs)}

    @tool
    async def get_program_by_id(program_id: str) -> dict:
        """Get full details for a specific program by ID. Includes drills, schedule, progressions."""
        from app.db.supabase import get_pool
        pool = get_pool()

        async with pool.connection() as conn:
            prog_result = await conn.execute(
                """SELECT id, name, category, description, sport, position,
                          weekly_frequency, duration_weeks, difficulty,
                          primary_attribute, equipment_needed
                   FROM programs WHERE id = %s""",
                (program_id,),
            )
            prog_row = await prog_result.fetchone()

            drills_result = await conn.execute(
                """SELECT d.id, d.name, d.category, d.duration_seconds, d.intensity,
                          pd.sets, pd.reps, pd.order_index
                   FROM program_drills pd
                   JOIN drills d ON d.id = pd.drill_id
                   WHERE pd.program_id = %s
                   ORDER BY pd.order_index""",
                (program_id,),
            )
            drill_rows = await drills_result.fetchall()

        if not prog_row:
            return {"error": f"Program {program_id} not found"}

        drills = [
            {
                "drill_id": row[0],
                "name": row[1],
                "category": row[2],
                "duration_min": max(1, (row[3] or 300) // 60),
                "intensity": row[4],
                "sets": row[5],
                "reps": row[6],
                "order": row[7],
            }
            for row in drill_rows
        ]

        return {
            "program_id": prog_row[0],
            "name": prog_row[1],
            "category": prog_row[2],
            "description": prog_row[3],
            "sport": prog_row[4],
            "position": prog_row[5],
            "weekly_frequency": prog_row[6],
            "duration_weeks": prog_row[7],
            "difficulty": prog_row[8],
            "primary_attribute": prog_row[9],
            "equipment": prog_row[10],
            "drills": drills,
        }

    @tool
    async def get_test_catalog() -> dict:
        """Get the full test catalog — all available test types the athlete can log. Includes phone tests and sport-specific tests."""
        from app.db.supabase import get_pool
        pool = get_pool()

        async with pool.connection() as conn:
            result = await conn.execute(
                """SELECT id, test_name, test_key, category, unit, description,
                          instructions, sport, equipment_needed
                   FROM sport_test_definitions
                   WHERE is_active = true
                   ORDER BY category, test_name""",
            )
            rows = await result.fetchall()

        tests = [
            {
                "id": row[0],
                "name": row[1],
                "key": row[2],
                "category": row[3],
                "unit": row[4],
                "description": row[5],
                "instructions": row[6],
                "sport": row[7],
                "equipment": row[8],
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
                """SELECT id, title, event_type, start_time::text, end_time::text,
                          intensity, notes, linked_program_id
                   FROM calendar_events
                   WHERE user_id = %s
                     AND date = %s::date
                     AND event_type IN ('training', 'gym', 'club_training', 'match')
                     AND is_deleted = false
                   ORDER BY start_time""",
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
                "program_id": row[7],
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
