"""
Tomo AI Service — Settings Agent Tools (25 tools: 10 read + 15 write)
Goals, injury, nutrition, sleep, profile, notifications, wearable, preferences.

Factory function creates tools bound to a specific user_id + PlayerContext.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

from langchain_core.tools import tool

from app.models.context import PlayerContext

logger = logging.getLogger("tomo-ai.tools.settings")


def _safe_float(v, default=None):
    if v is None:
        return default
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def make_settings_tools(user_id: str, context: PlayerContext) -> list:
    """Create settings agent tools bound to a specific user context."""

    # ── READ TOOLS (10) ───────────────────────────────────────────────

    @tool
    async def get_goals() -> dict:
        """Get the athlete's current goals — active, completed, and upcoming deadlines."""
        from app.db.supabase import get_pool
        pool = get_pool()

        async with pool.connection() as conn:
            result = await conn.execute(
                """SELECT id, title, description, category, target_value, current_value,
                          unit, deadline::text, status, created_at::date::text
                   FROM athlete_goals
                   WHERE user_id = %s AND status IN ('active', 'in_progress')
                   ORDER BY deadline ASC NULLS LAST""",
                (user_id,),
            )
            rows = await result.fetchall()

        goals = [
            {
                "id": row[0], "title": row[1], "description": row[2],
                "category": row[3], "target": _safe_float(row[4]),
                "current": _safe_float(row[5]), "unit": row[6],
                "deadline": row[7], "status": row[8], "created": row[9],
                "progress_pct": round((_safe_float(row[5], 0) / _safe_float(row[4], 1)) * 100, 1) if row[4] else None,
            }
            for row in rows
        ]

        return {"goals": goals, "total": len(goals)}

    @tool
    async def get_injury_status() -> dict:
        """Get the athlete's current injury status — active injuries, severity, affected areas, return timeline."""
        from app.db.supabase import get_pool
        pool = get_pool()

        async with pool.connection() as conn:
            result = await conn.execute(
                """SELECT id, body_area, severity, description, onset_date::text,
                          expected_return_date::text, status, notes
                   FROM athlete_injuries
                   WHERE user_id = %s AND status = 'active'
                   ORDER BY severity DESC""",
                (user_id,),
            )
            rows = await result.fetchall()

        injuries = [
            {
                "id": row[0], "body_area": row[1], "severity": row[2],
                "description": row[3], "onset_date": row[4],
                "expected_return": row[5], "status": row[6], "notes": row[7],
            }
            for row in rows
        ]

        return {
            "injuries": injuries,
            "total_active": len(injuries),
            "has_severe": any(i["severity"] >= 3 for i in injuries if i["severity"]),
        }

    @tool
    async def get_nutrition_log(days: int = 7) -> dict:
        """Get nutrition log history for the last N days."""
        from app.db.supabase import get_pool
        pool = get_pool()
        since = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")

        async with pool.connection() as conn:
            result = await conn.execute(
                """SELECT meal_type, description, calories, protein_g, carbs_g, fat_g,
                          logged_at::date::text, logged_at::time::text
                   FROM athlete_nutrition_log
                   WHERE user_id = %s AND logged_at >= %s::date
                   ORDER BY logged_at DESC""",
                (user_id, since),
            )
            rows = await result.fetchall()

        meals = [
            {
                "meal_type": row[0], "description": row[1],
                "calories": _safe_float(row[2]), "protein_g": _safe_float(row[3]),
                "carbs_g": _safe_float(row[4]), "fat_g": _safe_float(row[5]),
                "date": row[6], "time": row[7],
            }
            for row in rows
        ]

        return {"days": days, "meals": meals, "total": len(meals)}

    @tool
    async def get_sleep_log(days: int = 7) -> dict:
        """Get sleep log history for the last N days — duration, quality, bedtime, wake time."""
        from app.db.supabase import get_pool
        pool = get_pool()
        since = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")

        async with pool.connection() as conn:
            result = await conn.execute(
                """SELECT metric_type, value, date::text, source
                   FROM health_data
                   WHERE user_id = %s AND metric_type IN ('sleep_hours', 'sleep_quality', 'sleep_score')
                     AND date >= %s
                   ORDER BY date DESC""",
                (user_id, since),
            )
            rows = await result.fetchall()

        sleep_data = [
            {"metric": row[0], "value": _safe_float(row[1]), "date": row[2], "source": row[3]}
            for row in rows
        ]

        return {"days": days, "data": sleep_data, "total": len(sleep_data)}

    @tool
    async def get_profile() -> dict:
        """Get the athlete's profile — name, sport, position, age band, height, weight, gender, DOB."""
        return {
            "name": context.name,
            "sport": context.sport,
            "position": context.position,
            "age_band": context.age_band,
            "role": context.role,
            "gender": context.gender,
            "height_cm": context.height_cm,
            "weight_kg": context.weight_kg,
        }

    @tool
    async def get_notification_preferences() -> dict:
        """Get the athlete's notification preferences — which notifications are enabled/disabled."""
        from app.db.supabase import get_pool
        pool = get_pool()

        async with pool.connection() as conn:
            result = await conn.execute(
                """SELECT category, is_enabled, push_enabled, quiet_hours_start::text,
                          quiet_hours_end::text
                   FROM athlete_notification_preferences
                   WHERE user_id = %s""",
                (user_id,),
            )
            rows = await result.fetchall()

        prefs = [
            {
                "category": row[0], "enabled": bool(row[1]),
                "push": bool(row[2]), "quiet_start": row[3], "quiet_end": row[4],
            }
            for row in rows
        ]

        return {"preferences": prefs}

    @tool
    async def get_schedule_rules() -> dict:
        """Get the athlete's schedule rules and preferences — school hours, training windows, buffer times, active scenario."""
        prefs = context.schedule_preferences
        return {
            "school_days": prefs.school_days,
            "school_hours": f"{prefs.school_start}-{prefs.school_end}",
            "day_bounds": f"{prefs.day_bounds_start}-{prefs.day_bounds_end}",
            "gym_days": prefs.gym_days,
            "gym_time": f"{prefs.gym_start} ({prefs.gym_duration_min}min)",
            "club_days": prefs.club_days,
            "club_time": prefs.club_start,
            "study_days": prefs.study_days,
            "study_time": f"{prefs.study_start} ({prefs.study_duration_min}min)",
            "buffers": {
                "default": prefs.buffer_default_min,
                "post_match": prefs.buffer_post_match_min,
                "post_hard": prefs.buffer_post_high_intensity_min,
            },
            "league_active": prefs.league_is_active,
            "exam_period": prefs.exam_period_active,
            "active_scenario": context.active_scenario,
        }

    @tool
    async def get_wearable_status() -> dict:
        """Get the athlete's connected wearable device status — Whoop, Garmin, Apple Watch sync status."""
        from app.db.supabase import get_pool
        pool = get_pool()

        async with pool.connection() as conn:
            result = await conn.execute(
                """SELECT provider, status, last_sync_at::text, token_expires_at::text
                   FROM wearable_connections
                   WHERE user_id = %s""",
                (user_id,),
            )
            rows = await result.fetchall()

        connections = [
            {
                "provider": row[0], "status": row[1],
                "last_sync": row[2], "expires": row[3],
            }
            for row in rows
        ]

        return {"connections": connections, "total": len(connections)}

    @tool
    async def get_drill_library(category: str = "", sport: str = "") -> dict:
        """Browse the drill library. Filter by category (speed, strength, agility, technical, recovery) and/or sport."""
        from app.db.supabase import get_pool
        pool = get_pool()

        target_sport = sport or (context.sport or "football").lower()

        query = """SELECT id, name, category, equipment, duration_seconds, intensity,
                          description, primary_attribute, sport
                   FROM drills
                   WHERE (sport = %s OR sport = 'all') AND is_active = true"""
        params: list = [target_sport]

        if category:
            query += " AND category ILIKE %s"
            params.append(f"%{category}%")

        query += " ORDER BY category, name LIMIT 20"

        async with pool.connection() as conn:
            result = await conn.execute(query, params)
            rows = await result.fetchall()

        drills = [
            {
                "id": row[0], "name": row[1], "category": row[2],
                "equipment": row[3], "duration_min": max(1, (row[4] or 300) // 60),
                "intensity": row[5], "description": row[6],
                "primary_attribute": row[7], "sport": row[8],
            }
            for row in rows
        ]

        return {"sport": target_sport, "filter": category or "all", "drills": drills, "total": len(drills)}

    # ── WRITE TOOLS (15) ──────────────────────────────────────────────

    @tool
    async def set_goal(
        title: str,
        category: str = "performance",
        target_value: float = 0,
        unit: str = "",
        deadline: str = "",
        description: str = "",
    ) -> dict:
        """Set a new goal. Categories: performance, fitness, academic, personal, nutrition, recovery. This is a WRITE action."""
        from app.agents.tools.bridge import bridge_post
        return await bridge_post(
            "/api/v1/goals",
            {
                "title": title, "category": category,
                "target_value": target_value, "unit": unit,
                "deadline": deadline, "description": description,
            },
            user_id=user_id,
        )

    @tool
    async def complete_goal(goal_id: str) -> dict:
        """Mark a goal as completed. This is a WRITE action."""
        from app.agents.tools.bridge import bridge_put
        return await bridge_put(f"/api/v1/goals/{goal_id}", {"status": "completed"}, user_id=user_id)

    @tool
    async def delete_goal(goal_id: str) -> dict:
        """Delete a goal. This is a WRITE action."""
        from app.agents.tools.bridge import bridge_delete
        return await bridge_delete(f"/api/v1/goals/{goal_id}", user_id=user_id)

    @tool
    async def log_injury(
        body_area: str,
        severity: int = 1,
        description: str = "",
        notes: str = "",
    ) -> dict:
        """Log an injury. Body areas: ankle, knee, hamstring, quad, shoulder, back, wrist, etc. Severity: 1=Soreness (train normally), 2=Pain (affects training), 3=Cannot train. This is a WRITE action."""
        from app.agents.tools.bridge import bridge_post
        return await bridge_post(
            "/api/v1/injuries",
            {"body_area": body_area, "severity": severity, "description": description, "notes": notes},
            user_id=user_id,
        )

    @tool
    async def clear_injury(injury_id: str) -> dict:
        """Mark an injury as recovered/cleared. This is a WRITE action."""
        from app.agents.tools.bridge import bridge_put
        return await bridge_put(f"/api/v1/injuries/{injury_id}", {"status": "recovered"}, user_id=user_id)

    @tool
    async def log_nutrition(
        meal_type: str = "snack",
        description: str = "",
        calories: int = 0,
        protein_g: int = 0,
        carbs_g: int = 0,
        fat_g: int = 0,
    ) -> dict:
        """Log a meal/snack. Meal types: breakfast, lunch, dinner, snack, pre_workout, post_workout. This is a WRITE action."""
        from app.agents.tools.bridge import bridge_post
        return await bridge_post(
            "/api/v1/nutrition",
            {
                "meal_type": meal_type, "description": description,
                "calories": calories, "protein_g": protein_g,
                "carbs_g": carbs_g, "fat_g": fat_g,
            },
            user_id=user_id,
        )

    @tool
    async def log_sleep(
        hours: float = 7.0,
        quality: int = 3,
        bedtime: str = "",
        wake_time: str = "",
    ) -> dict:
        """Manually log sleep data. Quality: 1-5 scale. Times in HH:MM format. Use when wearable not available. This is a WRITE action."""
        from app.agents.tools.bridge import bridge_post
        return await bridge_post(
            "/api/v1/sleep",
            {"hours": hours, "quality": quality, "bedtime": bedtime, "wake_time": wake_time},
            user_id=user_id,
        )

    @tool
    async def update_profile(
        height_cm: float = 0,
        weight_kg: float = 0,
        position: str = "",
    ) -> dict:
        """Update profile measurements — height, weight, or position. Only provide fields to change. This is a WRITE action."""
        from app.agents.tools.bridge import bridge_put

        body: dict = {}
        if height_cm > 0:
            body["height_cm"] = height_cm
        if weight_kg > 0:
            body["weight_kg"] = weight_kg
        if position:
            body["position"] = position

        return await bridge_put("/api/v1/profile", body, user_id=user_id)

    @tool
    async def update_notification_preferences(
        category: str,
        enabled: bool = True,
        push_enabled: bool = True,
    ) -> dict:
        """Update notification preferences for a category. Categories: critical, training, coaching, academic, triangle, cv, system. This is a WRITE action."""
        from app.agents.tools.bridge import bridge_put
        return await bridge_put(
            "/api/v1/notifications/preferences",
            {"category": category, "is_enabled": enabled, "push_enabled": push_enabled},
            user_id=user_id,
        )

    @tool
    async def update_schedule_rules(
        school_start: str = "",
        school_end: str = "",
        gym_days: str = "",
        club_days: str = "",
        study_days: str = "",
        day_bounds_start: str = "",
        day_bounds_end: str = "",
    ) -> dict:
        """Update schedule rules. Times in HH:MM format. Days as comma-separated numbers (1=Mon, 7=Sun). This is a WRITE action."""
        from app.agents.tools.bridge import bridge_put

        body: dict = {}
        if school_start:
            body["school_start"] = school_start
        if school_end:
            body["school_end"] = school_end
        if gym_days:
            body["gym_days"] = [int(d.strip()) for d in gym_days.split(",")]
        if club_days:
            body["club_days"] = [int(d.strip()) for d in club_days.split(",")]
        if study_days:
            body["study_days"] = [int(d.strip()) for d in study_days.split(",")]
        if day_bounds_start:
            body["day_bounds_start"] = day_bounds_start
        if day_bounds_end:
            body["day_bounds_end"] = day_bounds_end

        return await bridge_put("/api/v1/schedule/rules", body, user_id=user_id)

    @tool
    async def toggle_league_mode(active: bool = True) -> dict:
        """Toggle league active mode on/off. Affects training prioritization and periodization. This is a WRITE action."""
        from app.agents.tools.bridge import bridge_put
        return await bridge_put(
            "/api/v1/schedule/rules",
            {"league_is_active": active},
            user_id=user_id,
        )

    @tool
    async def toggle_exam_period(
        active: bool = True,
        subjects: str = "",
        start_date: str = "",
    ) -> dict:
        """Toggle exam period mode. Reduces training volume, prioritizes study windows. This is a WRITE action."""
        from app.agents.tools.bridge import bridge_put

        body: dict = {"exam_period_active": active}
        if subjects:
            body["exam_subjects"] = [s.strip() for s in subjects.split(",")]
        if start_date:
            body["exam_start_date"] = start_date

        return await bridge_put("/api/v1/schedule/rules", body, user_id=user_id)

    @tool
    async def navigate_to(target_tab: str) -> dict:
        """Navigate the athlete to a specific app tab. Tabs: Timeline, Output, Mastery, OwnIt, Chat. Use when the athlete needs to see a specific screen."""
        valid_tabs = {"Timeline", "Output", "Mastery", "OwnIt", "Chat"}
        if target_tab not in valid_tabs:
            return {"error": f"Invalid tab: {target_tab}. Valid: {', '.join(valid_tabs)}"}
        return {"navigate_to": target_tab, "action": "navigate"}

    @tool
    async def sync_wearable(provider: str = "whoop") -> dict:
        """Trigger a wearable data sync. Providers: whoop, garmin, apple_watch. This is a WRITE action."""
        from app.agents.tools.bridge import bridge_post
        return await bridge_post(
            "/api/v1/wearables/sync",
            {"provider": provider},
            user_id=user_id,
        )

    return [
        # Read (10)
        get_goals,
        get_injury_status,
        get_nutrition_log,
        get_sleep_log,
        get_profile,
        get_notification_preferences,
        get_schedule_rules,
        get_wearable_status,
        get_drill_library,
        navigate_to,
        # Write (15)
        set_goal,
        complete_goal,
        delete_goal,
        log_injury,
        clear_injury,
        log_nutrition,
        log_sleep,
        update_profile,
        update_notification_preferences,
        update_schedule_rules,
        toggle_league_mode,
        toggle_exam_period,
        sync_wearable,
    ]
