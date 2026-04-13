"""
Tomo AI Service — Recovery Agent Tools (6 tools)

New agent created in Sprint 1. Handles recovery status assessment,
deload recommendations, recovery session logging, tissue loading
history, and injury concern escalation.

All 6 tools are new — none extracted from existing agents.
Recovery agent enforces PHV safety and RED risk gates.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

from langchain_core.tools import tool

from app.models.context import PlayerContext

logger = logging.getLogger("tomo-ai.tools.recovery")


def _safe_float(v, default=None):
    """Safely convert Decimal/str to float."""
    if v is None:
        return default
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def make_recovery_tools(user_id: str, context: PlayerContext) -> list:
    """Create recovery agent tools bound to a specific user context."""

    @tool
    async def get_recovery_status() -> dict:
        """Get current recovery status — readiness, ACWR, injury risk, load trends, sleep quality, soreness trend. Use when athlete asks about recovery, soreness, tiredness, or whether they should train."""
        se = context.snapshot_enrichment
        if not se:
            return {"error": "No snapshot data available", "suggestion": "Complete a check-in to populate recovery data"}

        # Determine recovery recommendation
        acwr = se.acwr or 0
        injury_risk = (se.injury_risk_flag or "GREEN").upper()
        readiness = context.readiness_score or "Green"

        if injury_risk == "RED" or acwr > 1.5:
            recommendation = "BLOCKED"
            advice = "Full recovery day recommended. Your body needs rest before the next session."
        elif readiness == "Red" or acwr > 1.3:
            recommendation = "RECOVERY_ONLY"
            advice = "Light recovery work only — foam rolling, stretching, gentle mobility."
        elif readiness == "Yellow" or acwr > 1.2:
            recommendation = "REDUCED"
            advice = "You can train but keep intensity LIGHT to MODERATE. Focus on technique over volume."
        else:
            recommendation = "FULL_LOAD"
            advice = "Recovery looks good. You're cleared for full training intensity."

        return {
            "readiness": readiness,
            "acwr": acwr,
            "injury_risk_flag": injury_risk,
            "atl_7day": se.atl_7day,
            "ctl_28day": se.ctl_28day,
            "recovery_score": se.recovery_score,
            "sleep_quality": se.sleep_quality,
            "hrv_today": se.hrv_today,
            "hrv_baseline": se.hrv_baseline,
            "hrv_7day_trend": se.hrv_7day_trend,
            "soreness_trend": se.wellness_trend,
            "dual_load_index": se.dual_load_index,
            "recommendation": recommendation,
            "advice": advice,
        }

    @tool
    async def get_deload_recommendation() -> dict:
        """Analyze whether the athlete needs a deload week. Considers ACWR trend, monotony, strain, injury risk, and readiness history. Use when athlete mentions fatigue, overtraining, or asks if they need a break."""
        from app.db.supabase import get_pool
        pool = get_pool()

        se = context.snapshot_enrichment

        # Get 14-day check-in trend for readiness pattern
        async with pool.connection() as conn:
            result = await conn.execute(
                """SELECT readiness, energy, soreness, date::text
                   FROM checkins
                   WHERE user_id = %s AND date >= (NOW() - INTERVAL '14 days')
                   ORDER BY date DESC""",
                (user_id,),
            )
            rows = await result.fetchall()

        checkin_trend = [
            {
                "date": row[3],
                "readiness": row[0],
                "energy": _safe_float(row[1]),
                "soreness": _safe_float(row[2]),
            }
            for row in rows
        ]

        # Count RED/Yellow days in last 14
        red_days = sum(1 for c in checkin_trend if c["readiness"] == "Red")
        yellow_days = sum(1 for c in checkin_trend if c["readiness"] == "Yellow")

        acwr = se.acwr if se else None
        monotony = se.training_monotony if se else None
        strain = se.training_strain if se else None
        injury_risk = (se.injury_risk_flag or "GREEN").upper() if se else "UNKNOWN"

        # Deload decision logic
        needs_deload = False
        urgency = "low"
        reasons: list[str] = []

        if acwr is not None and acwr > 1.5:
            needs_deload = True
            urgency = "critical"
            reasons.append(f"ACWR critically high ({acwr:.2f})")
        elif acwr is not None and acwr > 1.3:
            needs_deload = True
            urgency = "high"
            reasons.append(f"ACWR elevated ({acwr:.2f})")

        if injury_risk == "RED":
            needs_deload = True
            urgency = "critical"
            reasons.append("Injury risk flag is RED")

        if red_days >= 3:
            needs_deload = True
            if urgency != "critical":
                urgency = "high"
            reasons.append(f"{red_days} RED readiness days in last 14")

        if monotony is not None and monotony > 2.0:
            if not needs_deload:
                needs_deload = True
                urgency = "moderate"
            reasons.append(f"Training monotony high ({monotony:.1f})")

        if strain is not None and strain > 1500:
            if not needs_deload:
                needs_deload = True
                urgency = "moderate"
            reasons.append(f"Training strain elevated ({strain:.0f})")

        if yellow_days >= 5 and not needs_deload:
            needs_deload = True
            urgency = "moderate"
            reasons.append(f"{yellow_days} YELLOW days in last 14")

        # Build recommendation
        if needs_deload:
            if urgency == "critical":
                plan = "3-day complete rest, then 4 days LIGHT intensity only. No testing. Focus on sleep and nutrition."
            elif urgency == "high":
                plan = "5-day deload: reduce volume by 40%, intensity cap MODERATE. Include 2 full rest days."
            else:
                plan = "5-day deload: reduce volume by 25%, keep intensity MODERATE max. Add extra mobility/recovery sessions."
        else:
            plan = "No deload needed right now. Continue current training with normal load management."

        return {
            "needs_deload": needs_deload,
            "urgency": urgency,
            "reasons": reasons,
            "plan": plan,
            "acwr": acwr,
            "monotony": monotony,
            "strain": strain,
            "injury_risk": injury_risk,
            "red_days_14": red_days,
            "yellow_days_14": yellow_days,
            "checkin_trend": checkin_trend[:7],
        }

    @tool
    async def trigger_deload_week(
        start_date: str = "",
        intensity_cap: str = "LIGHT",
        duration_days: int = 5,
    ) -> dict:
        """Trigger a deload week — reduces training load on the calendar. Creates recovery-focused events and caps intensity. This is a WRITE action."""
        from app.agents.tools.bridge import bridge_post

        target_start = start_date or context.today_date

        return await bridge_post(
            "/api/v1/recovery/deload",
            {
                "start_date": target_start,
                "duration_days": duration_days,
                "intensity_cap": intensity_cap,
            },
            user_id=user_id,
        )

    @tool
    async def log_recovery_session(
        session_type: str = "general",
        duration_min: int = 30,
        notes: str = "",
    ) -> dict:
        """Log a recovery session. session_type: foam_rolling, stretching, ice_bath, massage, yoga, general. This is a WRITE action."""
        from app.agents.tools.bridge import bridge_post

        return await bridge_post(
            "/api/v1/calendar/events",
            {
                "title": f"Recovery: {session_type.replace('_', ' ').title()}",
                "event_type": "recovery",
                "start_date": context.today_date,
                "duration_minutes": duration_min,
                "intensity": "LIGHT",
                "notes": notes,
                "metadata": {"recovery_type": session_type},
            },
            user_id=user_id,
        )

    @tool
    async def get_tissue_loading_history(days: int = 14) -> dict:
        """Get tissue loading history — daily training volume, intensity, body areas stressed. Helps identify overuse patterns and inform recovery decisions."""
        from app.db.supabase import get_pool
        pool = get_pool()
        since = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")

        async with pool.connection() as conn:
            # Daily load from athlete_daily_load
            load_result = await conn.execute(
                """SELECT load_date::text, training_load_au, session_count,
                          academic_load_au
                   FROM athlete_daily_load
                   WHERE athlete_id = %s AND load_date >= %s
                   ORDER BY load_date DESC""",
                (user_id, since),
            )
            load_rows = await load_result.fetchall()

            # Session details from calendar
            session_result = await conn.execute(
                """SELECT start_at::date::text AS session_date,
                          event_type, intensity, title,
                          estimated_load_au
                   FROM calendar_events
                   WHERE user_id = %s
                     AND start_at >= %s::timestamp
                     AND event_type IN ('training', 'gym', 'club_training', 'match', 'recovery')
                   ORDER BY start_at DESC""",
                (user_id, since),
            )
            session_rows = await session_result.fetchall()

        daily_loads = [
            {
                "date": row[0],
                "training_au": _safe_float(row[1], 0),
                "sessions": row[2] or 0,
                "academic_au": _safe_float(row[3], 0),
            }
            for row in load_rows
        ]

        sessions = [
            {
                "date": row[0],
                "type": row[1],
                "intensity": row[2],
                "title": row[3],
                "load_au": _safe_float(row[4], 0),
            }
            for row in session_rows
        ]

        # Compute summary stats
        total_au = sum(d["training_au"] for d in daily_loads)
        avg_daily = round(total_au / max(len(daily_loads), 1), 1)
        high_days = sum(1 for d in daily_loads if d["training_au"] > 80)
        rest_days = sum(1 for d in daily_loads if d["training_au"] == 0)

        return {
            "days": days,
            "daily_loads": daily_loads,
            "sessions": sessions[:20],
            "summary": {
                "total_load_au": round(total_au, 1),
                "avg_daily_au": avg_daily,
                "high_load_days": high_days,
                "rest_days": rest_days,
                "total_sessions": len(sessions),
            },
        }

    @tool
    async def flag_injury_concern(
        body_part: str,
        severity: int = 2,
        description: str = "",
    ) -> dict:
        """Flag an injury concern. Logs it to the athlete's profile and optionally notifies the coach via Triangle. severity: 1=Soreness, 2=Pain affecting training, 3=Cannot train. This is a WRITE action."""
        from app.agents.tools.bridge import bridge_post

        if severity >= 3:
            logger.warning(f"Severity 3 injury flagged for {user_id}: {body_part}")

        return await bridge_post(
            "/api/v1/injuries",
            {
                "body_part": body_part,
                "severity": severity,
                "description": description,
                "notify_coach": severity >= 2,
            },
            user_id=user_id,
        )

    return [
        get_recovery_status,
        get_deload_recommendation,
        trigger_deload_week,
        log_recovery_session,
        get_tissue_loading_history,
        flag_injury_concern,
    ]
