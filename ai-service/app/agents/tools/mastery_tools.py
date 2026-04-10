"""
Tomo AI Service — Mastery Agent Tools (7 tools)
Progress tracking, CV summary, achievements, test trajectory, career history.

Factory function creates tools bound to a specific user_id + PlayerContext.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

from langchain_core.tools import tool

from app.models.context import PlayerContext

logger = logging.getLogger("tomo-ai.tools.mastery")


def _safe_float(v, default=None):
    if v is None:
        return default
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def make_mastery_tools(user_id: str, context: PlayerContext) -> list:
    """Create mastery agent tools bound to a specific user context."""

    @tool
    async def get_achievement_history(days: int = 90) -> dict:
        """Get the athlete's achievement history — milestones, PRs, streaks, and badges earned. Frame everything as achievement narrative."""
        from app.db.supabase import get_pool
        pool = get_pool()
        since = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")

        async with pool.connection() as conn:
            # Get PRs (personal records) from test results
            pr_result = await conn.execute(
                """SELECT DISTINCT ON (test_type)
                          test_type, score, unit, recorded_at::date::text
                   FROM phone_test_results
                   WHERE user_id = %s AND recorded_at >= %s::date
                   ORDER BY test_type, score DESC""",
                (user_id, since),
            )
            pr_rows = await pr_result.fetchall()

            # Get streak data from snapshot
            streak_result = await conn.execute(
                """SELECT streak_days, sessions_total, training_age_weeks,
                          cv_completeness, coachability_index
                   FROM athlete_snapshots
                   WHERE user_id = %s
                   ORDER BY updated_at DESC LIMIT 1""",
                (user_id,),
            )
            streak_row = await streak_result.fetchone()

        prs = [
            {"test_type": row[0], "best_score": _safe_float(row[1]), "unit": row[2], "date": row[3]}
            for row in pr_rows
        ]

        streak_data = {}
        if streak_row:
            streak_data = {
                "streak_days": streak_row[0] or 0,
                "total_sessions": streak_row[1] or 0,
                "training_age_weeks": streak_row[2] or 0,
                "cv_completeness": _safe_float(streak_row[3], 0),
                "coachability_index": _safe_float(streak_row[4], 0),
            }

        return {
            "days": days,
            "personal_records": prs,
            "streaks": streak_data,
            "sport": context.sport,
            "position": context.position,
        }

    @tool
    async def get_test_trajectory(test_type: str, months: int = 6) -> dict:
        """Get test score trajectory over time for a specific test type. Shows improvement trend, best/worst, average. Use when athlete asks about progress on a specific metric."""
        from app.db.supabase import get_pool
        pool = get_pool()
        since = (datetime.now() - timedelta(days=months * 30)).strftime("%Y-%m-%d")

        async with pool.connection() as conn:
            result = await conn.execute(
                """SELECT score, unit, percentile, recorded_at::date::text
                   FROM phone_test_results
                   WHERE user_id = %s AND test_type = %s AND recorded_at >= %s::date
                   UNION ALL
                   SELECT score, unit, percentile, recorded_at::date::text
                   FROM football_test_results
                   WHERE user_id = %s AND test_type = %s AND recorded_at >= %s::date
                   ORDER BY 4 ASC""",
                (user_id, test_type, since, user_id, test_type, since),
            )
            rows = await result.fetchall()

        if not rows:
            return {"error": f"No {test_type} results found in the last {months} months"}

        scores = [_safe_float(row[0], 0) for row in rows]
        dates = [row[3] for row in rows]

        best = max(scores)
        worst = min(scores)
        avg = sum(scores) / len(scores)
        latest = scores[-1]
        earliest = scores[0]
        improvement_pct = ((latest - earliest) / earliest * 100) if earliest != 0 else 0

        data_points = [
            {"date": row[3], "score": _safe_float(row[0]), "unit": row[1], "percentile": _safe_float(row[2])}
            for row in rows
        ]

        return {
            "test_type": test_type,
            "months": months,
            "data_points": data_points,
            "total_tests": len(rows),
            "best": best,
            "worst": worst,
            "average": round(avg, 2),
            "latest": latest,
            "improvement_pct": round(improvement_pct, 1),
            "trend": "improving" if improvement_pct > 5 else "declining" if improvement_pct < -5 else "stable",
        }

    @tool
    async def get_cv_summary() -> dict:
        """Get the athlete's complete CV summary — profile, career highlights, key metrics, mastery scores, strengths, and development areas. Use for scout-style report or when athlete asks about their profile."""
        se = context.snapshot_enrichment

        cv = {
            "name": context.name,
            "sport": context.sport,
            "position": context.position,
            "age_band": context.age_band,
            "role": context.role,
        }

        if se:
            cv.update({
                "sessions_total": se.sessions_total,
                "training_age_weeks": se.training_age_weeks,
                "streak_days": se.streak_days,
                "cv_completeness": se.cv_completeness,
                "mastery_scores": se.mastery_scores,
                "strength_benchmarks": se.strength_benchmarks,
                "speed_profile": se.speed_profile,
                "coachability_index": se.coachability_index,
                "phv_stage": se.phv_stage,
                "phv_offset": se.phv_offset_years,
                "plan_compliance": se.plan_compliance_7d,
                "checkin_consistency": se.checkin_consistency_7d,
            })

        bp = context.benchmark_profile
        if bp:
            cv.update({
                "overall_percentile": bp.overall_percentile,
                "strengths": bp.strengths,
                "gaps": bp.gaps,
            })

        return cv

    @tool
    async def get_consistency_score() -> dict:
        """Get the athlete's consistency metrics — check-in streak, training compliance, journal completion rate, and engagement scores."""
        se = context.snapshot_enrichment
        if not se:
            return {"error": "No snapshot data available", "suggestion": "Check in to build consistency data"}

        return {
            "streak_days": se.streak_days,
            "checkin_consistency_7d": se.checkin_consistency_7d,
            "plan_compliance_7d": se.plan_compliance_7d,
            "journal_completeness_7d": se.journal_completeness_7d,
            "journal_streak_days": se.journal_streak_days,
            "rec_action_rate_30d": se.rec_action_rate_30d,
            "coachability_index": se.coachability_index,
            "target_achievement_rate_30d": se.target_achievement_rate_30d,
        }

    @tool
    async def list_career_history() -> dict:
        """List the athlete's career history entries — teams, clubs, competitions, awards."""
        from app.db.supabase import get_pool
        pool = get_pool()

        async with pool.connection() as conn:
            result = await conn.execute(
                """SELECT id, entry_type, title, organization, start_date::text,
                          end_date::text, description, achievements
                   FROM athlete_career_history
                   WHERE user_id = %s
                   ORDER BY start_date DESC""",
                (user_id,),
            )
            rows = await result.fetchall()

        entries = [
            {
                "id": row[0],
                "type": row[1],
                "title": row[2],
                "organization": row[3],
                "start_date": row[4],
                "end_date": row[5],
                "description": row[6],
                "achievements": row[7],
            }
            for row in rows
        ]

        return {"entries": entries, "total": len(entries)}

    @tool
    async def add_career_entry(
        entry_type: str,
        title: str,
        organization: str = "",
        start_date: str = "",
        end_date: str = "",
        description: str = "",
    ) -> dict:
        """Add a new career history entry. Types: team, club, competition, award, certification. This is a WRITE action."""
        from app.agents.tools.bridge import bridge_post
        return await bridge_post(
            "/api/v1/career",
            {
                "entry_type": entry_type,
                "title": title,
                "organization": organization,
                "start_date": start_date,
                "end_date": end_date,
                "description": description,
            },
            user_id=user_id,
        )

    @tool
    async def update_career_entry(
        entry_id: str,
        title: str = "",
        organization: str = "",
        description: str = "",
        end_date: str = "",
    ) -> dict:
        """Update an existing career history entry. Only provide fields to change. This is a WRITE action."""
        from app.agents.tools.bridge import bridge_put

        body: dict = {}
        if title:
            body["title"] = title
        if organization:
            body["organization"] = organization
        if description:
            body["description"] = description
        if end_date:
            body["end_date"] = end_date

        return await bridge_put(f"/api/v1/career/{entry_id}", body, user_id=user_id)

    return [
        get_achievement_history,
        get_test_trajectory,
        get_cv_summary,
        get_consistency_score,
        list_career_history,
        add_career_entry,
        update_career_entry,
    ]
