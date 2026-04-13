"""
Tomo AI Service — CV & Identity Agent Tools (6 tools)

Sprint 3 — extends Mastery with 5-layer performance identity, coachability index,
development velocity, recruitment visibility, CV export, and verified achievements.

Coachability Index (zero-I/O pure formula, CMS-configurable weights):
  coachability = (response_rate × 0.35) + (pb_frequency × 0.25) +
                 (checkin_consistency × 0.25) + (program_adherence × 0.15)
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

from langchain_core.tools import tool

from app.models.context import PlayerContext

logger = logging.getLogger("tomo-ai.tools.cv_identity")


def _safe_float(v, default=None):
    if v is None:
        return default
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def make_cv_identity_tools(user_id: str, context: PlayerContext) -> list:
    """Create CV & Identity agent tools bound to a specific user context."""

    @tool
    async def get_5_layer_identity() -> dict:
        """Get the athlete's 5-layer performance identity — Physical, Technical, Tactical, Mental, Social. Each layer scored 0-100 from test data, mastery pillars, and coaching assessments. Use for holistic athlete profile or development conversations."""
        from app.db.supabase import get_pool
        pool = get_pool()

        async with pool.connection() as conn:
            # Get benchmark data for Physical layer
            bench_result = await conn.execute(
                """SELECT DISTINCT ON (metric_key) metric_key, percentile, zone
                   FROM player_benchmark_snapshots
                   WHERE user_id = %s
                   ORDER BY metric_key, tested_at DESC""",
                (user_id,),
            )
            benchmarks = await bench_result.fetchall()

            # Get checkin consistency (90 days)
            consistency_result = await conn.execute(
                """SELECT COUNT(*) FROM checkins
                   WHERE user_id = %s AND date >= (NOW() - INTERVAL '90 days')""",
                (user_id,),
            )
            consistency_row = await consistency_result.fetchone()

        # Get mastery pillar scores from snapshot enrichment (no separate table)
        se = context.snapshot_enrichment
        pillar_map_raw = se.mastery_scores if se else {}

        # Physical layer: average percentile from benchmarks
        percentiles = [int(r[1]) for r in benchmarks if r[1] is not None]
        physical_score = round(sum(percentiles) / len(percentiles)) if percentiles else 0

        # Map pillar scores to identity layers
        pillar_map = {k: _safe_float(v, 0) for k, v in pillar_map_raw.items()}

        # Build 5 layers
        layers = {
            "physical": {
                "score": physical_score,
                "metrics_count": len(percentiles),
                "description": "Athletic performance — speed, power, endurance, agility",
            },
            "technical": {
                "score": round(pillar_map.get("technical", pillar_map.get("skill", 0))),
                "description": "Sport-specific skill execution and consistency",
            },
            "tactical": {
                "score": round(pillar_map.get("tactical", pillar_map.get("game_sense", 0))),
                "description": "Decision-making, positioning, game understanding",
            },
            "mental": {
                "score": round(pillar_map.get("mental", pillar_map.get("mindset", 0))),
                "description": "Focus, resilience, pressure handling, consistency under stress",
            },
            "social": {
                "score": round(pillar_map.get("social", pillar_map.get("leadership", 0))),
                "description": "Leadership, communication, team contribution, coachability",
            },
        }

        scores = [l["score"] for l in layers.values()]
        composite = round(sum(scores) / len(scores)) if scores else 0

        checkin_count = consistency_row[0] if consistency_row else 0

        return {
            "athlete": context.name,
            "sport": context.sport,
            "position": context.position,
            "age_band": context.age_band,
            "composite_identity_score": composite,
            "layers": layers,
            "checkin_consistency_90d": checkin_count,
            "data_completeness": round(len([s for s in scores if s > 0]) / 5 * 100),
        }

    @tool
    async def get_coachability_index() -> dict:
        """Get the athlete's coachability index — composite score from response rate to new stimulus, PB frequency, check-in consistency, and program adherence. CMS-configurable weights."""
        from app.db.supabase import get_pool
        pool = get_pool()

        async with pool.connection() as conn:
            # PB frequency (90 days) — count of personal bests
            pb_result = await conn.execute(
                """SELECT COUNT(DISTINCT test_type) FROM (
                     SELECT test_type, score,
                            MAX(score) OVER (PARTITION BY test_type ORDER BY date
                                             ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS prev_best
                     FROM phone_test_sessions
                     WHERE user_id = %s AND date >= (NOW() - INTERVAL '90 days')
                   ) sub WHERE score > COALESCE(prev_best, 0)""",
                (user_id,),
            )
            pb_row = await pb_result.fetchone()

            # Check-in consistency (90 days)
            checkin_result = await conn.execute(
                """SELECT COUNT(*) FROM checkins
                   WHERE user_id = %s AND date >= (NOW() - INTERVAL '90 days')""",
                (user_id,),
            )
            checkin_row = await checkin_result.fetchone()

            # Program adherence — completed vs assigned sessions (90 days)
            adherence_result = await conn.execute(
                """SELECT
                     COUNT(*) FILTER (WHERE event_type IN ('training', 'gym', 'club_training')) as total,
                     COUNT(*) FILTER (WHERE event_type IN ('training', 'gym', 'club_training')
                                      AND notes IS NOT NULL) as completed
                   FROM calendar_events
                   WHERE user_id = %s AND start_at >= (NOW() - INTERVAL '90 days')
                     AND start_at <= NOW()""",
                (user_id,),
            )
            adherence_row = await adherence_result.fetchone()

            # Response rate: new drills rated / total drills attempted
            drill_result = await conn.execute(
                """SELECT
                     COUNT(*) as attempted,
                     COUNT(*) FILTER (WHERE rating IS NOT NULL) as rated
                   FROM drill_ratings
                   WHERE user_id = %s AND created_at >= (NOW() - INTERVAL '90 days')""",
                (user_id,),
            )
            drill_row = await drill_result.fetchone()

        pb_count = pb_row[0] if pb_row else 0
        checkin_count = checkin_row[0] if checkin_row else 0
        total_sessions = adherence_row[0] if adherence_row else 0
        completed_sessions = adherence_row[1] if adherence_row else 0
        drills_attempted = drill_row[0] if drill_row else 0
        drills_rated = drill_row[1] if drill_row else 0

        # Normalize to 0-100
        response_rate = round((drills_rated / max(drills_attempted, 1)) * 100)
        pb_frequency = min(100, round(pb_count * 15))  # Each PB worth ~15 points
        checkin_consistency = min(100, round((checkin_count / 90) * 100))
        program_adherence = round((completed_sessions / max(total_sessions, 1)) * 100)

        # CMS-configurable weights (defaults)
        w_response = 0.35
        w_pb = 0.25
        w_checkin = 0.25
        w_adherence = 0.15

        coachability = round(
            response_rate * w_response +
            pb_frequency * w_pb +
            checkin_consistency * w_checkin +
            program_adherence * w_adherence
        )

        return {
            "coachability_index": coachability,
            "components": {
                "response_rate": {"score": response_rate, "weight": w_response, "raw": f"{drills_rated}/{drills_attempted} drills rated"},
                "pb_frequency": {"score": pb_frequency, "weight": w_pb, "raw": f"{pb_count} PBs in 90 days"},
                "checkin_consistency": {"score": checkin_consistency, "weight": w_checkin, "raw": f"{checkin_count}/90 days"},
                "program_adherence": {"score": program_adherence, "weight": w_adherence, "raw": f"{completed_sessions}/{total_sessions} sessions"},
            },
            "interpretation": (
                "Elite coachability — responds well to new challenges and stays consistent" if coachability >= 80
                else "Strong coachability — good consistency with room to grow in responsiveness" if coachability >= 60
                else "Developing coachability — building habits, encourage consistency" if coachability >= 40
                else "Early stage — focus on building check-in habits and program adherence"
            ),
        }

    @tool
    async def get_development_velocity(months: int = 6) -> dict:
        """Get development velocity — rate of improvement across tested metrics over time. Shows which areas are accelerating, plateauing, or declining."""
        from app.db.supabase import get_pool
        pool = get_pool()
        since = (datetime.now() - timedelta(days=months * 30)).strftime("%Y-%m-%d")

        async with pool.connection() as conn:
            result = await conn.execute(
                """SELECT test_type,
                          MIN(date)::text AS first_date, MAX(date)::text AS last_date,
                          MIN(score) AS first_score, MAX(score) AS best_score,
                          (ARRAY_AGG(score ORDER BY date DESC))[1] AS latest_score,
                          (ARRAY_AGG(score ORDER BY date ASC))[1] AS earliest_score,
                          COUNT(*) AS test_count
                   FROM (
                     SELECT test_type, score, date FROM phone_test_sessions
                     WHERE user_id = %s AND date >= %s
                     UNION ALL
                     SELECT test_type, primary_value AS score, date FROM football_test_results
                     WHERE user_id = %s AND date >= %s
                   ) combined
                   GROUP BY test_type
                   HAVING COUNT(*) >= 2
                   ORDER BY test_type""",
                (user_id, since, user_id, since),
            )
            rows = await result.fetchall()

        metrics = []
        improving = 0
        declining = 0
        stable = 0

        for row in rows:
            test_type = row[0]
            earliest = _safe_float(row[6], 0)
            latest = _safe_float(row[5], 0)
            change_pct = ((latest - earliest) / earliest * 100) if earliest != 0 else 0

            trend = "improving" if change_pct > 5 else "declining" if change_pct < -5 else "stable"
            if trend == "improving":
                improving += 1
            elif trend == "declining":
                declining += 1
            else:
                stable += 1

            metrics.append({
                "test_type": test_type,
                "earliest_score": earliest,
                "latest_score": latest,
                "best_score": _safe_float(row[4]),
                "change_pct": round(change_pct, 1),
                "trend": trend,
                "test_count": row[7],
                "period": f"{row[1]} → {row[2]}",
            })

        overall_velocity = round(
            sum(m["change_pct"] for m in metrics) / max(len(metrics), 1), 1
        )

        return {
            "months": months,
            "metrics_tracked": len(metrics),
            "overall_velocity_pct": overall_velocity,
            "improving": improving,
            "stable": stable,
            "declining": declining,
            "metrics": sorted(metrics, key=lambda x: x["change_pct"], reverse=True),
            "sport": context.sport,
            "position": context.position,
        }

    @tool
    async def set_recruitment_visibility(visible: bool = True, notes: str = "") -> dict:
        """Toggle recruitment visibility — controls whether the athlete's profile is visible in the talent database. Only for opted-in athletes. This is a WRITE action."""
        from app.agents.tools.bridge import bridge_post
        return await bridge_post(
            "/api/v1/cv/recruitment-visibility",
            {"visible": visible, "notes": notes},
            user_id=user_id,
        )

    @tool
    async def generate_cv_export(format: str = "summary") -> dict:
        """Generate a CV export — aggregates profile, career history, test results, achievements, and mastery scores into a scout-ready document. Format: 'summary' or 'full'. This is a WRITE action."""
        from app.db.supabase import get_pool
        pool = get_pool()

        async with pool.connection() as conn:
            # Profile
            profile_result = await conn.execute(
                """SELECT name, sport, position, age, gender, height_cm, weight_kg
                   FROM users WHERE id = %s""",
                (user_id,),
            )
            profile = await profile_result.fetchone()

            # Career history
            career_result = await conn.execute(
                """SELECT title, organization, start_date::text, end_date::text, description
                   FROM career_entries
                   WHERE user_id = %s
                   ORDER BY start_date DESC""",
                (user_id,),
            )
            career = await career_result.fetchall()

            # Benchmarks
            bench_result = await conn.execute(
                """SELECT DISTINCT ON (metric_key) metric_key, metric_label, value,
                          percentile, zone, tested_at::text
                   FROM player_benchmark_snapshots
                   WHERE user_id = %s
                   ORDER BY metric_key, tested_at DESC""",
                (user_id,),
            )
            benchmarks = await bench_result.fetchall()

        profile_data = {
            "name": profile[0] if profile else context.name,
            "sport": profile[1] if profile else context.sport,
            "position": profile[2] if profile else context.position,
            "age": profile[3] if profile else None,
            "gender": profile[4] if profile else None,
            "height_cm": profile[5] if profile else None,
            "weight_kg": profile[6] if profile else None,
        } if profile else {"name": context.name, "sport": context.sport}

        career_data = [
            {"title": r[0], "organization": r[1], "start": r[2], "end": r[3], "description": r[4]}
            for r in career
        ]

        benchmark_data = [
            {
                "metric": r[0], "label": r[1], "value": _safe_float(r[2]),
                "percentile": int(r[3]) if r[3] is not None else None,
                "zone": r[4], "date": r[5],
            }
            for r in benchmarks
        ]

        return {
            "export_date": context.today_date,
            "format": format,
            "profile": profile_data,
            "career_history": career_data,
            "benchmarks": benchmark_data if format == "full" else benchmark_data[:5],
            "career_entries": len(career_data),
            "metrics_tested": len(benchmark_data),
        }

    @tool
    async def add_verified_achievement(
        title: str,
        category: str = "performance",
        description: str = "",
        date: str = "",
    ) -> dict:
        """Add a verified achievement to the athlete's profile. Categories: performance, academic, leadership, community. Requires evidence or coach confirmation for verification. This is a WRITE action."""
        from app.agents.tools.bridge import bridge_post

        return await bridge_post(
            "/api/v1/cv/achievements",
            {
                "title": title,
                "category": category,
                "description": description,
                "date": date or context.today_date,
                "verified": False,  # Pending coach verification via Triangle
            },
            user_id=user_id,
        )

    return [
        get_5_layer_identity,
        get_coachability_index,
        get_development_velocity,
        set_recruitment_visibility,
        generate_cv_export,
        add_verified_achievement,
    ]
