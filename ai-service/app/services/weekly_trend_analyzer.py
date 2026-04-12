"""
Tomo AI Service — Weekly Trend Analyzer (Layer 2)

Runs Monday 02:00 UTC. Reads prior week's ai_issues, computes trend
against the week before, writes trend_data back. Never creates new records.

Alert rules:
  - direction == "worsening" AND pct_change > 20% → alert
  - direction == "new" AND severity in ("critical", "high") → alert
  - consecutive_weeks > 4 with same issue → auto-escalate
"""

from __future__ import annotations

import json
import logging
from datetime import date, timedelta

from app.db.supabase import get_pool

logger = logging.getLogger("tomo-ai.weekly_trend")


def _prev_mondays(n: int = 2) -> list[date]:
    """Return the last N Monday dates (most recent first)."""
    today = date.today()
    # Last completed week's Monday
    last_monday = today - timedelta(days=today.weekday() + 7)
    return [last_monday - timedelta(weeks=i) for i in range(n)]


async def run_weekly_trend_analysis() -> dict:
    """
    Compare last completed week vs the week before.
    Write trend_data to each ai_issues record from last week.
    Flag regressions (alert=true) where count increased >20%.
    Returns summary of trends found.
    """
    pool = get_pool()
    if not pool:
        logger.error("No DB pool available for trend analysis")
        return {"error": "no_pool"}

    mondays = _prev_mondays(2)
    last_week = mondays[0]
    prev_week = mondays[1]

    trends_written = 0
    alerts_raised = 0

    async with pool.connection() as conn:
        # Fetch last week's issues
        result = await conn.execute(
            "SELECT id, issue_type, affected_count, severity FROM ai_issues "
            "WHERE week_start = %s",
            (last_week,),
        )
        last_rows = await result.fetchall()

        # Fetch previous week's issues
        result = await conn.execute(
            "SELECT issue_type, affected_count FROM ai_issues "
            "WHERE week_start = %s",
            (prev_week,),
        )
        prev_rows = await result.fetchall()

        # Build lookup: issue_type → affected_count for previous week
        prev_by_type: dict[str, int] = {}
        for row in prev_rows:
            prev_by_type[row[0]] = row[1]

        # Count consecutive weeks each issue_type has appeared (last 8 weeks)
        eight_weeks_ago = last_week - timedelta(weeks=8)
        result = await conn.execute(
            "SELECT issue_type, COUNT(*) as weeks FROM ai_issues "
            "WHERE week_start >= %s GROUP BY issue_type",
            (eight_weeks_ago,),
        )
        consec_rows = await result.fetchall()
        consecutive_by_type: dict[str, int] = {}
        for row in consec_rows:
            consecutive_by_type[row[0]] = row[1]

        for row in last_rows:
            issue_id = row[0]
            issue_type = row[1]
            this_count = row[2]
            severity = row[3]
            prev_count = prev_by_type.get(issue_type, 0)
            consecutive = consecutive_by_type.get(issue_type, 1)

            if prev_count > 0:
                pct_change = round((this_count - prev_count) / prev_count * 100, 1)
                if pct_change < -10:
                    direction = "improving"
                elif pct_change > 10:
                    direction = "worsening"
                else:
                    direction = "stable"
            else:
                pct_change = None
                direction = "new"

            # Alert conditions
            alert = (
                (direction == "worsening" and (pct_change or 0) > 20)
                or (direction == "new" and severity in ("critical", "high"))
            )

            trend_data = {
                "prev_week_count": prev_count,
                "this_week_count": this_count,
                "direction": direction,
                "pct_change": pct_change,
                "consecutive_weeks_present": consecutive,
                "alert": alert,
            }

            # Write trend_data (separate column) and merge into metadata
            try:
                await conn.execute(
                    """
                    UPDATE ai_issues
                    SET trend_data = %s
                    WHERE id = %s
                    """,
                    (json.dumps(trend_data), issue_id),
                )
                trends_written += 1
                if alert:
                    alerts_raised += 1

                # Auto-escalate if chronic (>4 consecutive weeks)
                if consecutive > 4 and severity == "medium":
                    await conn.execute(
                        "UPDATE ai_issues SET severity = 'high' WHERE id = %s",
                        (issue_id,),
                    )
                    logger.warning(
                        f"Auto-escalated {issue_type}: {consecutive} consecutive weeks"
                    )
            except Exception as e:
                logger.error(f"Failed to write trend for {issue_type}: {e}")

    summary = {
        "week_analyzed": last_week.isoformat(),
        "trends_written": trends_written,
        "alerts_raised": alerts_raised,
    }
    logger.info(f"Weekly trend analysis complete: {summary}")
    return summary
