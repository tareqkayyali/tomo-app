"""
Tomo AI Service — Monthly Digest Generator (Layer 3)

Runs 1st of month at 03:00 UTC. Reads 4 weeks of ai_issues + applied fixes.
Calls Haiku once (~$0.002) for plain-English narrative. Writes immutable snapshot
to ai_monthly_digest. Idempotent — skips if digest already exists for this month.
"""

from __future__ import annotations

import json
import logging
from datetime import date, timedelta

import anthropic

from app.config import get_settings
from app.db.supabase import get_pool

logger = logging.getLogger("tomo-ai.monthly_digest")


async def run_monthly_digest() -> dict:
    """Generate and store the monthly digest. Idempotent — skips if exists."""
    pool = get_pool()
    if not pool:
        logger.error("No DB pool available for monthly digest")
        return {"error": "no_pool"}

    settings = get_settings()
    today = date.today()
    month_start = today.replace(day=1)

    async with pool.connection() as conn:
        # Idempotency check
        result = await conn.execute(
            "SELECT id FROM ai_monthly_digest WHERE month_start = %s",
            (month_start,),
        )
        existing = await result.fetchone()
        if existing:
            return {"skipped": True, "reason": "digest already exists for this month"}

        # Fetch last 4 weeks of issues with trend data
        four_weeks_ago = month_start - timedelta(weeks=4)
        result = await conn.execute(
            """
            SELECT issue_type, severity, affected_count, trend_data, status, week_start
            FROM ai_issues
            WHERE week_start >= %s
            ORDER BY week_start DESC, affected_count DESC
            """,
            (four_weeks_ago,),
        )
        issue_rows = await result.fetchall()

        # Fetch applied fixes and their impact
        result = await conn.execute(
            """
            SELECT f.title, f.status, f.before_metric, f.after_metric, f.langsmith_metric
            FROM ai_fixes f
            JOIN ai_issues i ON i.id = f.issue_id
            WHERE f.applied_at >= %s
            ORDER BY f.priority ASC
            LIMIT 10
            """,
            (four_weeks_ago,),
        )
        fix_rows = await result.fetchall()

    # Build summaries for Haiku
    col_names_issues = ["issue_type", "severity", "affected_count", "trend_data", "status", "week_start"]
    issues_summary = []
    for row in issue_rows:
        entry = dict(zip(col_names_issues, row))
        # Parse trend_data if needed
        if isinstance(entry.get("trend_data"), str):
            try:
                entry["trend_data"] = json.loads(entry["trend_data"])
            except (json.JSONDecodeError, TypeError):
                entry["trend_data"] = {}
        # Convert date to string for JSON serialization
        if hasattr(entry.get("week_start"), "isoformat"):
            entry["week_start"] = entry["week_start"].isoformat()
        issues_summary.append(entry)

    col_names_fixes = ["title", "status", "before_metric", "after_metric", "langsmith_metric"]
    fixes_summary = [dict(zip(col_names_fixes, row)) for row in fix_rows]

    # Aggregate top issue stats across the month
    issue_totals: dict[str, int] = {}
    for entry in issues_summary:
        t = entry["issue_type"]
        issue_totals[t] = issue_totals.get(t, 0) + entry["affected_count"]
    top_issues = [
        {"issue_type": k, "total_affected": v}
        for k, v in sorted(issue_totals.items(), key=lambda x: -x[1])[:5]
    ]

    # Call Haiku for narrative
    prompt = f"""
You are reviewing one month of AI Chat quality data for Tomo — an AI performance
coaching platform for youth athletes.

Issues detected in the last 4 weeks:
{json.dumps(issues_summary, indent=2, default=str)}

Fixes applied and their measured impact:
{json.dumps(fixes_summary, indent=2, default=str)}

Write a concise monthly digest with three sections:
1. What improved this month (max 3 bullet points)
2. What regressed or needs attention (max 3 bullet points)
3. Top 3 priorities for next month with specific actions

Keep it under 300 words. Be specific — reference issue types and counts.
Output ONLY the narrative text, no JSON, no headings, no markdown.
"""

    try:
        client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        response = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=600,
            messages=[{"role": "user", "content": prompt}],
        )
        narrative = response.content[0].text.strip()
    except Exception as e:
        logger.error(f"Haiku narrative generation failed: {e}")
        narrative = f"Auto-generated digest unavailable. {len(issue_rows)} issues detected, {len(fix_rows)} fixes applied."

    # Compute aggregate stats
    all_costs = [
        entry.get("metadata", {}).get("avg_cost_usd", 0)
        for entry in issues_summary
        if isinstance(entry.get("metadata"), dict)
    ]

    stats = {
        "total_issues": len(issue_rows),
        "total_fixes": len(fix_rows),
        "top_issue_count": issue_totals.get(top_issues[0]["issue_type"], 0) if top_issues else 0,
    }

    # Write immutable snapshot
    async with pool.connection() as conn:
        try:
            await conn.execute(
                """
                INSERT INTO ai_monthly_digest
                  (month_start, narrative, top_issues, top_fixes, stats)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (month_start) DO NOTHING
                """,
                (
                    month_start,
                    narrative,
                    json.dumps(top_issues),
                    json.dumps(fixes_summary[:5], default=str),
                    json.dumps(stats),
                ),
            )
        except Exception as e:
            logger.error(f"Failed to write monthly digest: {e}")
            return {"error": str(e)}

    summary = {
        "month_start": month_start.isoformat(),
        "narrative_len": len(narrative),
        "issues_analyzed": len(issue_rows),
        "fixes_reviewed": len(fix_rows),
    }
    logger.info(f"Monthly digest generated: {summary}")
    return summary
