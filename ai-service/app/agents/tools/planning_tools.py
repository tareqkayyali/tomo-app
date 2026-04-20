"""
Tomo AI Service — Planning Agent Tools (5 tools)
Plan generation, mode switching, protocol inspection.

Factory function creates tools bound to a specific user_id + PlayerContext.
"""

from __future__ import annotations

import logging

from langchain_core.tools import tool

from app.config import get_settings
from app.models.context import PlayerContext

logger = logging.getLogger("tomo-ai.tools.planning")


def _safe_float(v, default=None):
    if v is None:
        return default
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def make_planning_tools(user_id: str, context: PlayerContext) -> list:
    """Create planning agent tools bound to a specific user context."""

    @tool
    async def get_planning_context() -> dict:
        """Get the athlete's current planning context — active mode, applicable protocols, dual load zone, data confidence, exam proximity. Use to understand what planning constraints apply."""
        pc = context.planning_context
        se = context.snapshot_enrichment

        result = {
            "active_mode": pc.active_mode if pc else (se.athlete_mode if se else "balanced"),
            "readiness": context.readiness_score,
            "ccrs_recommendation": se.ccrs_recommendation if se else None,
            "injury_risk": se.injury_risk_flag if se else None,
            "dual_load_zone": se.dual_load_zone if se else None,
            "data_confidence": se.data_confidence_score if se else None,
            "exam_proximity": se.exam_proximity_score if se else None,
            "league_active": context.schedule_preferences.league_is_active,
            "exam_period": context.schedule_preferences.exam_period_active,
            "active_scenario": context.active_scenario,
        }

        if pc:
            result["applicable_protocols"] = pc.applicable_protocols
            result["mode_params"] = pc.mode_params

        return result

    @tool
    async def get_mode_options() -> dict:
        """Get available athlete modes and their descriptions. Returns all 4 modes with their training parameters — use when athlete asks about changing their mode."""
        modes = {
            "balanced": {
                "name": "Balanced",
                "description": "Equal priority between training and academics. Full intensity, up to 2 sessions/day, 5 training days/week.",
                "max_sessions_per_day": 2,
                "training_days_per_week": 5,
                "intensity_cap": "HARD",
                "best_for": "Normal periods with no special constraints",
            },
            "league_active": {
                "name": "League Active",
                "description": "Match preparation priority. Tactical periodization around match days. 2 sessions/day, 5 days/week.",
                "max_sessions_per_day": 2,
                "training_days_per_week": 5,
                "intensity_cap": "HARD",
                "best_for": "When in-season with regular matches",
            },
            "study": {
                "name": "Study Mode",
                "description": "Academics first. Training volume reduced to 1 session/day, 3 days/week. Max intensity: MODERATE.",
                "max_sessions_per_day": 1,
                "training_days_per_week": 3,
                "intensity_cap": "MODERATE",
                "best_for": "Exam periods or heavy academic load",
            },
            "rest_recovery": {
                "name": "Rest & Recovery",
                "description": "Full recovery focus. LIGHT intensity only. 1 session/day, 3 days/week max.",
                "max_sessions_per_day": 1,
                "training_days_per_week": 3,
                "intensity_cap": "LIGHT",
                "best_for": "After injury, illness, or overtraining",
            },
        }

        se = context.snapshot_enrichment
        current = se.athlete_mode if se else "balanced"

        return {"current_mode": current, "available_modes": modes}

    @tool
    async def propose_mode_change(target_mode: str, reason: str = "") -> dict:
        """Propose a mode change for the athlete. Target modes: balanced, league_active, study, rest_recovery. Returns preview of what will change. This is a WRITE action requiring confirmation via interrupt."""
        valid = {"balanced", "league_active", "study", "rest_recovery"}
        if target_mode not in valid:
            return {"error": f"Invalid mode: {target_mode}. Valid: {', '.join(valid)}"}

        se = context.snapshot_enrichment
        current = se.athlete_mode if se else "balanced"

        if target_mode == current:
            return {"info": f"Already in {target_mode} mode", "current_mode": current}

        mode_effects = {
            "balanced": {"sessions_per_day": 2, "days_per_week": 5, "intensity_cap": "HARD"},
            "league_active": {"sessions_per_day": 2, "days_per_week": 5, "intensity_cap": "HARD", "match_priority": True},
            "study": {"sessions_per_day": 1, "days_per_week": 3, "intensity_cap": "MODERATE"},
            "rest_recovery": {"sessions_per_day": 1, "days_per_week": 3, "intensity_cap": "LIGHT"},
        }

        return {
            "action": "mode_change",
            "from_mode": current,
            "to_mode": target_mode,
            "reason": reason,
            "effects": mode_effects.get(target_mode, {}),
            "warning": "This will affect your training schedule immediately" if target_mode in ("study", "rest_recovery") else None,
            "requires_confirmation": True,
        }

    @tool
    async def get_current_plan() -> dict:
        """Get the athlete's current weekly training plan — what's scheduled, load distribution, mode constraints. Use to understand what's already planned before suggesting changes."""
        from app.db.supabase import get_pool
        from datetime import datetime, timedelta
        pool = get_pool()

        today = context.today_date
        end = (datetime.strptime(today, "%Y-%m-%d") + timedelta(days=6)).strftime("%Y-%m-%d")

        async with pool.connection() as conn:
            result = await conn.execute(
                """SELECT start_at::date::text, title, event_type, intensity,
                          start_at::text, end_at::text
                   FROM calendar_events
                   WHERE user_id = %s AND start_at::date >= %s::date
                     AND start_at::date <= %s::date
                   ORDER BY calendar_events.start_at""",
                (user_id, today, end),
            )
            rows = await result.fetchall()

        events = [
            {"date": row[0], "title": row[1], "type": row[2], "intensity": row[3], "start": row[4], "end": row[5]}
            for row in rows
        ]

        se = context.snapshot_enrichment
        payload: dict = {
            "week_start": today,
            "week_end": end,
            "events": events,
            "total_events": len(events),
            "current_mode": se.athlete_mode if se else "balanced",
            "readiness": context.readiness_score,
            "ccrs_recommendation": se.ccrs_recommendation if se else None,
        }
        if get_settings().acwr_ai_enabled:
            payload["acwr"] = se.acwr if se else None
        return payload

    @tool
    async def get_protocol_details(protocol_id: str = "") -> dict:
        """Get details of a specific planning protocol or list all applicable protocols. Protocols are rules that govern training decisions (e.g., post-match recovery, exam taper, red readiness lockdown)."""
        from app.db.supabase import get_pool
        pool = get_pool()

        if protocol_id:
            async with pool.connection() as conn:
                result = await conn.execute(
                    """SELECT protocol_id as id, name, description,
                              evidence_grade as severity, conditions::text as trigger_condition,
                              intensity_cap as action_type, load_multiplier, is_enabled as is_active
                       FROM pd_protocols WHERE protocol_id = %s""",
                    (protocol_id,),
                )
                row = await result.fetchone()

            if not row:
                return {"error": f"Protocol {protocol_id} not found"}

            return {
                "id": str(row[0]), "name": row[1], "description": row[2],
                "severity": row[3], "trigger": row[4],
                "action_type": row[5], "load_multiplier": row[6], "active": bool(row[7]),
            }
        else:
            # List applicable protocols from snapshot
            se = context.snapshot_enrichment
            protocol_ids = se.applicable_protocol_ids if se and se.applicable_protocol_ids else []

            if not protocol_ids:
                return {"protocols": [], "message": "No protocols currently active for this athlete"}

            async with pool.connection() as conn:
                placeholders = ",".join(["%s"] * len(protocol_ids))
                result = await conn.execute(
                    f"""SELECT protocol_id as id, name, description, evidence_grade as severity, is_enabled as is_active
                       FROM pd_protocols WHERE protocol_id IN ({placeholders})""",
                    protocol_ids,
                )
                rows = await result.fetchall()

            protocols = [
                {"id": str(row[0]), "name": row[1], "description": row[2], "severity": row[3], "active": bool(row[4])}
                for row in rows
            ]

            return {"protocols": protocols, "total": len(protocols)}

    return [
        get_planning_context,
        get_mode_options,
        propose_mode_change,
        get_current_plan,
        get_protocol_details,
    ]
