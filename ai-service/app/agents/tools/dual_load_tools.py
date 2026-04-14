"""
Tomo AI Service — Dual-Load Agent Tools (6 tools)

Sprint 2 — Tomo's commercial differentiator: athletic + academic load intelligence.
Surfaces dualLoadIndex, cognitive readiness windows, exam-training collision
forecasting, and integrated weekly planning that respects both ACWR gates
and exam proximity simultaneously.

All 6 tools are new.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

from langchain_core.tools import tool

from app.models.context import PlayerContext

logger = logging.getLogger("tomo-ai.tools.dual_load")


def _safe_float(v, default=None):
    if v is None:
        return default
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def make_dual_load_tools(user_id: str, context: PlayerContext) -> list:
    """Create dual-load agent tools bound to a specific user context."""

    @tool
    async def get_dual_load_dashboard() -> dict:
        """Get the full dual-load dashboard — athletic load, academic load, combined index, zone, intensity modifier, exam proximity, and trend. Use when athlete asks about balance, stress, dual load, or academic-training collision."""
        se = context.snapshot_enrichment
        if not se:
            return {"error": "No snapshot data available", "suggestion": "Complete a check-in to populate load data"}

        dli = se.dual_load_index or 0
        zone = "LOW" if dli < 40 else "MODERATE" if dli < 70 else "HIGH"
        modifier = 1.0 if dli < 40 else 0.85 if dli < 70 else 0.75

        pc = context.planning_context
        exam_proximity = pc.exam_proximity_score if pc else None

        return {
            "dual_load_index": dli,
            "zone": zone,
            "intensity_modifier": modifier,
            "athletic_load_7day": se.athletic_load_7day,
            "academic_load_7day": se.academic_load_7day,
            "acwr": se.acwr,
            "ctl_28day": se.ctl_28day,
            "atl_7day": se.atl_7day,
            "exam_proximity_score": exam_proximity,
            "dual_load_zone": pc.dual_load_zone if pc else None,
            "readiness": context.readiness_score,
            "academic_stress": context.readiness_components.academic_stress if context.readiness_components else None,
            "recommendation": (
                "Reduce training volume and prioritize sleep" if dli >= 70
                else "Moderate load — maintain balance between training and study" if dli >= 40
                else "Load balanced — full training intensity available"
            ),
        }

    @tool
    async def get_cognitive_readiness_windows() -> dict:
        """Get today's cognitive readiness windows — optimal study times based on training type and timing. Uses cognitive_windows table to map session type → cognitive state."""
        from app.db.supabase import get_pool
        pool = get_pool()

        async with pool.connection() as conn:
            # Get today's training events
            events_result = await conn.execute(
                """SELECT title, event_type, start_at::text, end_at::text, intensity
                   FROM calendar_events
                   WHERE user_id = %s
                     AND start_at::date = %s::date
                     AND event_type IN ('training', 'match', 'recovery')
                   ORDER BY start_at""",
                (user_id, context.today_date),
            )
            events = await events_result.fetchall()

        # Hardcoded cognitive window definitions (cognitive_windows table does not exist)
        window_map = {
            "post_moderate": {
                "cognitive_state": "Post-Moderate Training",
                "delay_minutes": 30,
                "description": "30-90 min after moderate training is optimal for focused study",
            },
            "post_hard": {
                "cognitive_state": "Post-Hard Training",
                "delay_minutes": 120,
                "description": "2+ hours after high intensity before cognitive work",
            },
            "morning": {
                "cognitive_state": "Morning Window",
                "delay_minutes": 0,
                "description": "8-11 AM is typically peak cognitive performance",
            },
            "post_cardio": {
                "cognitive_state": "Post-Cardio",
                "delay_minutes": 45,
                "description": "45-60 min after cardio session for focused study",
            },
            "post_hiit": {
                "cognitive_state": "Post-HIIT",
                "delay_minutes": 90,
                "description": "90+ min after HIIT/match for cognitive work",
            },
            "post_strength": {
                "cognitive_state": "Post-Strength",
                "delay_minutes": 60,
                "description": "60 min after strength training for focused study",
            },
            "rest_day": {
                "cognitive_state": "Rest Day",
                "delay_minutes": 0,
                "description": "Full cognitive capacity available on rest days",
            },
        }

        # Map event types to cognitive window types
        EVENT_TO_WINDOW = {
            "training": "post_cardio",
            "match": "post_hiit",
            "recovery": "rest_day",
        }

        study_windows = []
        for ev in events:
            title, ev_type, start_at, end_at, intensity = ev
            # Map event type + intensity to cognitive window key
            if intensity and intensity.upper() == "HARD":
                cw_key = "post_hiit"
            elif ev_type in EVENT_TO_WINDOW:
                cw_key = EVENT_TO_WINDOW[ev_type]
            else:
                cw_key = "post_cardio"

            window = window_map.get(cw_key, {})
            delay = window.get("delay_minutes", 60)

            # Calculate optimal study start time
            try:
                end_dt = datetime.fromisoformat(end_at.replace("Z", "+00:00")) if end_at else None
                if end_dt:
                    study_start = end_dt + timedelta(minutes=delay)
                    study_windows.append({
                        "after_session": title,
                        "session_type": ev_type,
                        "intensity": intensity,
                        "session_ends": end_at,
                        "optimal_study_start": study_start.isoformat(),
                        "delay_minutes": delay,
                        "cognitive_state": window.get("cognitive_state", "neutral"),
                        "note": window.get("description", ""),
                    })
            except (ValueError, TypeError):
                pass

        return {
            "date": context.today_date,
            "training_sessions": len(events),
            "study_windows": study_windows,
            "general_advice": (
                "No training today — cognitive readiness is high all day"
                if not events
                else f"{len(study_windows)} study window(s) identified based on today's training"
            ),
        }

    @tool
    async def get_exam_collision_forecast(days: int = 14) -> dict:
        """Forecast exam-training collisions over the next N days. Identifies dates where high training load overlaps with exam proximity, and recommends adjustments."""
        from app.db.supabase import get_pool
        pool = get_pool()
        end_date = (datetime.now() + timedelta(days=days)).strftime("%Y-%m-%d")

        async with pool.connection() as conn:
            # Get exams in window
            exam_result = await conn.execute(
                """SELECT title, start_at::date::text AS exam_date, start_at::text
                   FROM calendar_events
                   WHERE user_id = %s AND event_type = 'exam'
                     AND start_at >= NOW()
                     AND start_at <= %s::timestamp
                   ORDER BY calendar_events.start_at""",
                (user_id, end_date),
            )
            exams = await exam_result.fetchall()

            # Get training events in window
            training_result = await conn.execute(
                """SELECT start_at::date::text AS train_date, event_type, intensity, title
                   FROM calendar_events
                   WHERE user_id = %s
                     AND event_type IN ('training', 'gym', 'club_training', 'match')
                     AND start_at >= NOW()
                     AND start_at <= %s::timestamp
                   ORDER BY calendar_events.start_at""",
                (user_id, end_date),
            )
            trainings = await training_result.fetchall()

        exam_dates = {row[1] for row in exams}
        exam_list = [{"title": row[0], "date": row[1]} for row in exams]

        collisions = []
        for t in trainings:
            t_date, t_type, t_intensity, t_title = t
            if t_date in exam_dates:
                collisions.append({
                    "date": t_date,
                    "training": t_title,
                    "intensity": t_intensity,
                    "exam": next((e["title"] for e in exam_list if e["date"] == t_date), "Exam"),
                    "severity": "critical" if t_intensity in ("HARD", "MODERATE") else "warning",
                    "recommendation": (
                        "Cancel or reschedule training — exam day" if t_intensity == "HARD"
                        else "Reduce to LIGHT intensity — exam day" if t_intensity == "MODERATE"
                        else "Light training OK — but prioritize rest and study"
                    ),
                })

            # Check day before exam too
            from datetime import date as date_cls
            try:
                t_dt = date_cls.fromisoformat(t_date)
                next_day = (t_dt + timedelta(days=1)).isoformat()
                if next_day in exam_dates and t_intensity in ("HARD", "MODERATE"):
                    collisions.append({
                        "date": t_date,
                        "training": t_title,
                        "intensity": t_intensity,
                        "exam": f"Exam tomorrow: {next((e['title'] for e in exam_list if e['date'] == next_day), 'Exam')}",
                        "severity": "warning",
                        "recommendation": f"Reduce to LIGHT — exam tomorrow",
                    })
            except (ValueError, TypeError):
                pass

        return {
            "forecast_days": days,
            "exams": exam_list,
            "training_sessions": len(trainings),
            "collisions": collisions,
            "collision_count": len(collisions),
            "risk_level": "critical" if any(c["severity"] == "critical" for c in collisions) else "warning" if collisions else "clear",
        }

    @tool
    async def set_academic_priority_period(
        start_date: str = "",
        end_date: str = "",
        intensity_cap: str = "MODERATE",
        reason: str = "exam_period",
    ) -> dict:
        """Activate exam/academic priority mode — caps training intensity and suggests study-first scheduling. intensity_cap: LIGHT or MODERATE. This is a WRITE action."""
        from app.agents.tools.bridge import bridge_post

        target_start = start_date or context.today_date

        if not end_date:
            return {"error": "end_date is required for academic priority period"}

        # Map string intensity cap to float modifier the TS route expects
        # The TS route uses intensity_modifier <= 0.75 for LIGHT, else MODERATE
        intensity_modifier = 0.7 if intensity_cap == "LIGHT" else 0.85

        return await bridge_post(
            "/api/v1/dual-load/academic-priority",
            {
                "start_date": target_start,
                "end_date": end_date,
                "intensity_modifier": intensity_modifier,
                "reason": reason,
            },
            user_id=user_id,
        )

    @tool
    async def generate_integrated_weekly_plan(
        balance_ratio: float = 0.5,
        include_study_blocks: bool = True,
    ) -> dict:
        """Generate an integrated weekly plan that balances training and academics. Respects ACWR gates AND exam proximity simultaneously. balance_ratio: 0.0 = all training, 1.0 = all study, 0.5 = balanced. This is a WRITE action."""
        from app.agents.tools.bridge import bridge_post

        se = context.snapshot_enrichment
        acwr = se.acwr if se else None
        dli = se.dual_load_index if se else 0

        # Auto-adjust balance if load is high
        effective_ratio = balance_ratio
        if dli and dli >= 70:
            effective_ratio = max(balance_ratio, 0.7)
        elif dli and dli >= 50:
            effective_ratio = max(balance_ratio, 0.5)

        return await bridge_post(
            "/api/v1/dual-load/integrated-plan",
            {
                "balance_ratio": effective_ratio,
                "include_study_blocks": include_study_blocks,
                "acwr": acwr,
                "dual_load_index": dli,
            },
            user_id=user_id,
        )

    @tool
    async def set_academic_stress_level(
        stress_level: int = 5,
        notes: str = "",
    ) -> dict:
        """Log current academic stress level (1-10 scale). Higher values trigger automatic dual-load adjustments. 7+ activates exam-priority framing in system prompt. This is a WRITE action."""
        from app.agents.tools.bridge import bridge_post

        if stress_level < 1 or stress_level > 10:
            return {"error": "stress_level must be 1-10"}

        return await bridge_post(
            "/api/v1/dual-load/stress",
            {
                "stress_level": stress_level,
                "notes": notes,
            },
            user_id=user_id,
        )

    return [
        get_dual_load_dashboard,
        get_cognitive_readiness_windows,
        get_exam_collision_forecast,
        set_academic_priority_period,
        generate_integrated_weekly_plan,
        set_academic_stress_level,
    ]
