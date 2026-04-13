"""
Tomo AI Service — Training Program Agent Tools (7 tools)

Sprint 4 — periodization, block training, PHV-safe program filtering,
position-specific recommendations, and load override capabilities.

PHV safety: mid-PHV athletes get safe program alternatives pre-filtered.
ACWR > 1.5: tools return warning advisory — player always decides.
All gates are ADVISORY — warn and inform, never block the player.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

from langchain_core.tools import tool

from app.models.context import PlayerContext

logger = logging.getLogger("tomo-ai.tools.training_program")


def _safe_float(v, default=None):
    if v is None:
        return default
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


# PHV contraindicated exercises — deterministic, never bypassed by LLM
PHV_CONTRAINDICATED = {
    "barbell_back_squat", "depth_jump", "drop_jump", "box_jump_max",
    "olympic_lift", "clean_and_jerk", "snatch", "power_clean",
    "maximal_sprint", "heavy_deadlift", "loaded_plyometrics",
    "heavy_overhead_press", "barbell_lunge",
}


def make_training_program_tools(user_id: str, context: PlayerContext) -> list:
    """Create training program agent tools bound to a specific user context."""

    def _is_mid_phv() -> bool:
        """Check if athlete is in mid-PHV (growth phase)."""
        se = context.snapshot_enrichment
        if se and hasattr(se, "phv_stage"):
            return str(getattr(se, "phv_stage", "")).upper() in ("MID", "CIRCA", "MID_PHV", "CIRCA_PHV")
        return False

    def _acwr_warning() -> str | None:
        """Return advisory warning if ACWR is elevated. Never blocks — player decides."""
        se = context.snapshot_enrichment
        if se and se.acwr is not None:
            if se.acwr > 1.5:
                return f"Heads up — your training load is very high right now (ACWR {se.acwr:.2f}). I'd recommend a lighter session or recovery day, but it's your call."
            if se.acwr > 1.3:
                return f"Your training load is elevated (ACWR {se.acwr:.2f}). Consider keeping intensity moderate today."
        return None

    @tool
    async def get_phv_appropriate_programs() -> dict:
        """Get training programs filtered for PHV safety. Mid-PHV athletes only see programs with safe exercises — contraindicated movements are excluded BEFORE results are returned. Never post-filter."""
        from app.db.supabase import get_pool
        pool = get_pool()

        mid_phv = _is_mid_phv()
        sport = (context.sport or "football").lower()

        async with pool.connection() as conn:
            result = await conn.execute(
                """SELECT id, name, category, type, description, difficulty,
                          duration_minutes, tags, position_emphasis, equipment,
                          prescriptions
                   FROM football_training_programs
                   ORDER BY name""",
            )
            rows = await result.fetchall()

        programs = []
        for row in rows:
            program = {
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

            if mid_phv:
                # Check prescriptions for contraindicated exercises
                prescriptions = row[10] or {}
                if isinstance(prescriptions, dict):
                    exercises = prescriptions.get("exercises", [])
                    has_contraindicated = any(
                        ex.get("id", "").lower() in PHV_CONTRAINDICATED or
                        ex.get("name", "").lower().replace(" ", "_") in PHV_CONTRAINDICATED
                        for ex in exercises if isinstance(ex, dict)
                    )
                    if has_contraindicated:
                        program["phv_filtered"] = True
                        program["phv_note"] = "Modified for growth phase — some exercises replaced with safe alternatives"

            programs.append(program)

        return {
            "sport": sport,
            "position": context.position,
            "phv_active": mid_phv,
            "programs": programs[:10],
            "total": len(programs),
        }

    @tool
    async def get_periodization_context() -> dict:
        """Get current periodization context — active training block, phase, week number, load progression. Use when athlete asks about their current training phase or block."""
        from app.db.supabase import get_pool
        pool = get_pool()

        se = context.snapshot_enrichment

        async with pool.connection() as conn:
            # Check for active training blocks
            block_result = await conn.execute(
                """SELECT id, name, phase, week_number, duration_weeks,
                          start_date::text, end_date::text, goals,
                          created_at::text
                   FROM training_blocks
                   WHERE user_id = %s AND status = 'active'
                   ORDER BY created_at DESC LIMIT 1""",
                (user_id,),
            )
            block = await block_result.fetchone()

        if not block:
            return {
                "has_active_block": False,
                "acwr": se.acwr if se else None,
                "suggestion": "No active training block. Ask me to create a periodized training plan.",
            }

        return {
            "has_active_block": True,
            "block_id": block[0],
            "name": block[1],
            "phase": block[2],
            "week_number": block[3],
            "duration_weeks": block[4],
            "start_date": block[5],
            "end_date": block[6],
            "goals": block[7],
            "acwr": se.acwr if se else None,
            "readiness": context.readiness_score,
        }

    @tool
    async def get_position_program_recommendations() -> dict:
        """Get position-specific program recommendations. Matches programs to the athlete's sport, position, gaps, and current load. Includes load advisory when ACWR is elevated."""
        from app.db.supabase import get_pool
        pool = get_pool()

        se = context.snapshot_enrichment
        position = context.position or "General"

        async with pool.connection() as conn:
            # Get programs with position emphasis matching
            result = await conn.execute(
                """SELECT id, name, category, type, description, difficulty,
                          duration_minutes, tags, position_emphasis
                   FROM football_training_programs
                   WHERE %s = ANY(position_emphasis) OR 'ALL' = ANY(position_emphasis)
                   ORDER BY name""",
                (position,),
            )
            rows = await result.fetchall()

            # Get athlete's gaps for prioritization
            gap_result = await conn.execute(
                """SELECT DISTINCT ON (metric_key) metric_key, percentile
                   FROM player_benchmark_snapshots
                   WHERE user_id = %s AND percentile < 40
                   ORDER BY metric_key, tested_at DESC""",
                (user_id,),
            )
            gaps = await gap_result.fetchall()

        gap_attributes = [r[0] for r in gaps]

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
                "addresses_gaps": any(
                    gap in (row[7] or []) for gap in gap_attributes
                ) if row[7] else False,
            }
            for row in rows
        ]

        result = {
            "sport": context.sport,
            "position": position,
            "programs": programs[:8],
            "gap_attributes": gap_attributes[:5],
            "acwr": se.acwr if se else None,
            "readiness": context.readiness_score,
            "phv_active": _is_mid_phv(),
        }
        warning = _acwr_warning()
        if warning:
            result["load_advisory"] = warning
        return result

    @tool
    async def get_training_block_history(months: int = 6) -> dict:
        """Get training block history — past and current periodization blocks with phase progression."""
        from app.db.supabase import get_pool
        pool = get_pool()
        since = (datetime.now() - timedelta(days=months * 30)).strftime("%Y-%m-%d")

        async with pool.connection() as conn:
            result = await conn.execute(
                """SELECT id, name, phase, status, week_number, duration_weeks,
                          start_date::text, end_date::text, created_at::text
                   FROM training_blocks
                   WHERE user_id = %s AND created_at >= %s::timestamp
                   ORDER BY created_at DESC""",
                (user_id, since),
            )
            rows = await result.fetchall()

        blocks = [
            {
                "block_id": row[0],
                "name": row[1],
                "phase": row[2],
                "status": row[3],
                "week_number": row[4],
                "duration_weeks": row[5],
                "start_date": row[6],
                "end_date": row[7],
                "created_at": row[8],
            }
            for row in rows
        ]

        return {
            "months": months,
            "blocks": blocks,
            "total": len(blocks),
            "active_count": sum(1 for b in blocks if b["status"] == "active"),
        }

    @tool
    async def create_training_block(
        name: str,
        phase: str = "general_prep",
        duration_weeks: int = 4,
        start_date: str = "",
        goals: str = "",
    ) -> dict:
        """Create a new periodized training block. Phase: general_prep, specific_prep, competition, transition. Includes load advisory if ACWR is elevated. This is a WRITE action."""
        from app.agents.tools.bridge import bridge_post

        target_start = start_date or context.today_date

        result = await bridge_post(
            "/api/v1/training-program/blocks",
            {
                "name": name,
                "phase": phase,
                "start_date": target_start,
                "duration_weeks": duration_weeks,
                "goals": goals or None,
            },
            user_id=user_id,
        )

        # Append advisory if ACWR is elevated
        warning = _acwr_warning()
        if warning and isinstance(result, dict) and "error" not in result:
            result["load_advisory"] = warning

        return result

    @tool
    async def update_block_phase(
        block_id: str,
        new_phase: str,
    ) -> dict:
        """Transition a training block to a new phase. Phases: general_prep -> specific_prep -> competition -> transition. Must advance forward. This is a WRITE action."""
        from app.agents.tools.bridge import bridge_put

        valid_phases = ["general_prep", "specific_prep", "competition", "transition"]
        if new_phase not in valid_phases:
            return {"error": f"Invalid phase. Use one of: {', '.join(valid_phases)}"}

        return await bridge_put(
            f"/api/v1/training-program/blocks/{block_id}/phase",
            {"new_phase": new_phase},
            user_id=user_id,
        )

    @tool
    async def override_session_load(
        event_id: str,
        intensity: str = "MODERATE",
        load_au: float = 0,
        reason: str = "",
    ) -> dict:
        """Override the load/intensity for a specific training session. intensity: REST, LIGHT, MODERATE, HARD. Use when coach or athlete needs to adjust a planned session based on readiness or recovery. This is a WRITE action."""
        from app.agents.tools.bridge import bridge_put

        valid_intensities = ["REST", "LIGHT", "MODERATE", "HARD"]
        if intensity not in valid_intensities:
            return {"error": f"intensity must be one of: {', '.join(valid_intensities)}"}

        body: dict = {"intensity": intensity, "reason": reason}
        if load_au > 0:
            body["load_au"] = load_au

        return await bridge_put(
            f"/api/v1/calendar/events/{event_id}/load-override",
            body,
            user_id=user_id,
        )

    return [
        get_phv_appropriate_programs,
        get_periodization_context,
        get_position_program_recommendations,
        get_training_block_history,
        create_training_block,
        update_block_phase,
        override_session_load,
    ]
