"""
Tomo AI Service — Testing & Benchmark Agent Tools (8 tools)

Extracted from Output + Mastery agents (Sprint 1 decomposition).
Handles all test logging, results history, benchmark percentiles,
test catalog, trajectory analysis, and new tools for combine readiness
and scout reports.

Moved from Output:  get_test_results, get_test_catalog, get_benchmark_comparison, log_test_result
Moved from Mastery: get_test_trajectory
New:                 create_test_session, get_combine_readiness_score, generate_test_report
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta

from langchain_core.tools import tool

from app.models.context import PlayerContext

logger = logging.getLogger("tomo-ai.tools.testing_benchmark")


def _safe_float(v, default=None):
    """Safely convert Decimal/str to float."""
    if v is None:
        return default
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def make_testing_benchmark_tools(user_id: str, context: PlayerContext) -> list:
    """Create testing & benchmark agent tools bound to a specific user context."""

    # ── Moved from Output ──────────────────────────────────────────────

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
    async def get_benchmark_comparison(metric: str = "", age_band: str = "") -> dict:
        """Get benchmark/percentile comparison for the athlete's test results against normative data. Use when athlete mentions peers, age group, comparison, or percentile. Metric examples: sprint_10m, cmj, yoyo_ir1, agility_ttest."""
        from app.db.supabase import get_pool
        pool = get_pool()

        target_age = age_band or context.age_band or "U19"
        target_position = context.position or "ALL"

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
    async def log_test_result(
        test_type: str,
        score: float,
        raw_data: dict | None = None,
    ) -> dict:
        """Log a new test result via phone test pipeline. test_type examples: sprint_10m, cmj, yoyo_ir1, agility_ttest, vertical_jump. Score in appropriate units. This is a WRITE action."""
        from app.agents.tools.bridge import bridge_post
        return await bridge_post(
            "/api/v1/phone-tests/session",
            {
                "testType": test_type,
                "score": score,
                "rawData": raw_data or {},
            },
            user_id=user_id,
        )

    # ── Moved from Mastery ─────────────────────────────────────────────

    @tool
    async def get_test_trajectory(test_type: str, months: int = 6) -> dict:
        """Get test score trajectory over time for a specific test type. Shows improvement trend, best/worst, average. Use when athlete asks about progress on a specific metric."""
        from app.db.supabase import get_pool
        pool = get_pool()
        since = (datetime.now() - timedelta(days=months * 30)).strftime("%Y-%m-%d")

        async with pool.connection() as conn:
            result = await conn.execute(
                """SELECT score, date::text
                   FROM phone_test_sessions
                   WHERE user_id = %s AND test_type = %s AND date >= %s
                   UNION ALL
                   SELECT primary_value AS score, date::text
                   FROM football_test_results
                   WHERE user_id = %s AND test_type = %s AND date >= %s
                   ORDER BY 2 ASC""",
                (user_id, test_type, since, user_id, test_type, since),
            )
            rows = await result.fetchall()

        if not rows:
            return {"error": f"No {test_type} results found in the last {months} months"}

        scores = [_safe_float(row[0], 0) for row in rows]
        dates = [row[1] for row in rows]

        best = max(scores)
        worst = min(scores)
        avg = sum(scores) / len(scores)
        latest = scores[-1]
        earliest = scores[0]
        improvement_pct = ((latest - earliest) / earliest * 100) if earliest != 0 else 0

        data_points = [
            {"date": row[1], "score": _safe_float(row[0])}
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

    # ── New tools ──────────────────────────────────────────────────────

    @tool
    async def create_test_session(
        test_types: str,
        scheduled_date: str = "",
        start_time: str = "09:00",
        notes: str = "",
    ) -> dict:
        """Schedule a test battery session on the calendar. test_types: comma-separated list of test keys (e.g. 'sprint_10m,cmj,yoyo_ir1'). Creates a calendar event. start_time in HH:MM format. This is a WRITE action."""
        from app.agents.tools.bridge import bridge_post

        tests = [t.strip() for t in test_types.split(",") if t.strip()]
        if not tests:
            return {"error": "Provide at least one test type"}

        target_date = scheduled_date or context.today_date
        event_name = f"Test Session: {', '.join(tests[:3])}"
        if len(tests) > 3:
            event_name += f" +{len(tests) - 3} more"

        # Compute endTime from number of tests (15 min each, minimum 30 min)
        duration_min = max(30, len(tests) * 15)
        h, m = int(start_time.split(":")[0]), int(start_time.split(":")[1])
        total_min = h * 60 + m + duration_min
        end_h, end_m = divmod(min(total_min, 23 * 60 + 59), 60)
        end_time = f"{end_h:02d}:{end_m:02d}"

        return await bridge_post(
            "/api/v1/calendar/events",
            {
                "name": event_name,
                "type": "other",
                "date": target_date,
                "startTime": start_time,
                "endTime": end_time,
                "intensity": "MODERATE",
                "notes": notes or f"Tests: {', '.join(tests)}",
            },
            user_id=user_id,
        )

    @tool
    async def get_combine_readiness_score() -> dict:
        """Get a composite combine readiness score — shows how prepared the athlete is across all tested metrics. Aggregates latest percentiles, identifies untested areas, and flags weak points. Use when athlete asks about combine readiness or overall test profile."""
        from app.db.supabase import get_pool
        pool = get_pool()

        # Get latest benchmark for each metric
        async with pool.connection() as conn:
            result = await conn.execute(
                """SELECT DISTINCT ON (metric_key) metric_key, metric_label,
                          percentile, zone, tested_at::text
                   FROM player_benchmark_snapshots
                   WHERE user_id = %s
                   ORDER BY metric_key, tested_at DESC""",
                (user_id,),
            )
            bench_rows = await result.fetchall()

            # Get sport test definitions for completeness check
            catalog_result = await conn.execute(
                """SELECT test_id, name FROM sport_test_definitions
                   WHERE sport_id IN (%s, 'all')
                   ORDER BY sort_order""",
                (context.sport or "football",),
            )
            catalog_rows = await catalog_result.fetchall()

        tested_metrics = {}
        percentiles = []
        strengths = []
        weaknesses = []

        for row in bench_rows:
            metric_key = row[0]
            pct = int(row[2]) if row[2] is not None else None
            tested_metrics[metric_key] = {
                "label": row[1],
                "percentile": pct,
                "zone": row[3],
                "last_tested": row[4],
            }
            if pct is not None:
                percentiles.append(pct)
                if pct >= 70:
                    strengths.append(row[1])
                elif pct <= 30:
                    weaknesses.append(row[1])

        # Completeness: check which sport tests haven't been done
        available_tests = {row[0]: row[1] for row in catalog_rows}
        untested = [
            name for key, name in available_tests.items()
            if key not in tested_metrics
        ]

        composite = round(sum(percentiles) / len(percentiles)) if percentiles else 0
        completeness = round(len(tested_metrics) / max(len(available_tests), 1) * 100)

        return {
            "composite_score": composite,
            "completeness_pct": completeness,
            "metrics_tested": len(tested_metrics),
            "metrics_available": len(available_tests),
            "strengths": strengths[:5],
            "weaknesses": weaknesses[:5],
            "untested": untested[:5],
            "metrics": tested_metrics,
            "sport": context.sport,
            "position": context.position,
        }

    @tool
    async def generate_test_report(format: str = "summary") -> dict:
        """Generate a scout-ready test report. Aggregates all test data, percentiles, trajectory, strengths/gaps. Format: 'summary' (quick overview) or 'full' (detailed report). Use when athlete asks for a test report or scout report."""
        from app.db.supabase import get_pool
        pool = get_pool()

        async with pool.connection() as conn:
            # Latest benchmarks
            bench_result = await conn.execute(
                """SELECT DISTINCT ON (metric_key) metric_key, metric_label, value,
                          percentile, zone, age_band_used, position_used, tested_at::text
                   FROM player_benchmark_snapshots
                   WHERE user_id = %s
                   ORDER BY metric_key, tested_at DESC""",
                (user_id,),
            )
            benchmarks = await bench_result.fetchall()

            # Recent tests (last 90 days)
            tests_result = await conn.execute(
                """SELECT test_type, score, date::text
                   FROM phone_test_sessions
                   WHERE user_id = %s AND date >= (NOW() - INTERVAL '90 days')
                   UNION ALL
                   SELECT test_type, primary_value AS score, date::text
                   FROM football_test_results
                   WHERE user_id = %s AND date >= (NOW() - INTERVAL '90 days')
                   ORDER BY 3 DESC""",
                (user_id, user_id),
            )
            recent_tests = await tests_result.fetchall()

        benchmark_data = []
        percentiles = []
        for row in benchmarks:
            pct = int(row[3]) if row[3] is not None else None
            benchmark_data.append({
                "metric": row[0],
                "label": row[1],
                "value": _safe_float(row[2]),
                "percentile": pct,
                "zone": row[4],
                "age_band": row[5],
                "position": row[6],
                "date": row[7],
            })
            if pct is not None:
                percentiles.append(pct)

        overall_pct = round(sum(percentiles) / len(percentiles)) if percentiles else 0
        top_metrics = sorted(benchmark_data, key=lambda x: x.get("percentile") or 0, reverse=True)[:3]
        gap_metrics = sorted(benchmark_data, key=lambda x: x.get("percentile") or 100)[:3]

        test_activity = [
            {"test_type": row[0], "score": _safe_float(row[1]), "date": row[2]}
            for row in recent_tests[:20]
        ]

        return {
            "athlete": context.name,
            "sport": context.sport,
            "position": context.position,
            "age_band": context.age_band,
            "report_date": context.today_date,
            "format": format,
            "overall_percentile": overall_pct,
            "metrics_tested": len(benchmark_data),
            "top_strengths": top_metrics,
            "development_areas": gap_metrics,
            "all_benchmarks": benchmark_data if format == "full" else [],
            "recent_activity": test_activity[:10] if format == "full" else test_activity[:3],
            "tests_last_90_days": len(recent_tests),
        }

    return [
        get_test_results,
        get_test_catalog,
        get_benchmark_comparison,
        log_test_result,
        get_test_trajectory,
        create_test_session,
        get_combine_readiness_score,
        generate_test_report,
    ]
