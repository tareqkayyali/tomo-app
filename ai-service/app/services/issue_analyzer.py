"""
Tomo AI Service — Issue Analyzer (AI-Powered Fix Generation)

Reads open ai_issues without fixes, generates specific fix recommendations
using Haiku, writes to ai_fixes. Called after each collection cycle.

Confidence default: 0.60 — these are suggestions, not auto-apply.
Priority 1 (safety) fixes require human verification before apply.
"""

from __future__ import annotations

import json
import logging

import anthropic

from app.config import get_settings
from app.db.supabase import get_pool

logger = logging.getLogger("tomo-ai.issue_analyzer")

# Maps issue_type → (fix_type, file_path, priority)
ISSUE_CONFIG: dict[str, tuple[str, str, int]] = {
    "routing_miss": (
        "intent_registry",
        "ai-service/app/agents/intent_registry.py",
        2,
    ),
    "verbose_response": (
        "prompt_builder",
        "ai-service/app/agents/prompt_builder.py",
        3,
    ),
    "zero_tool_response": (
        "agent_dispatch",
        "ai-service/app/graph/nodes/agent_dispatch.py",
        2,
    ),
    "stale_checkin_high_risk": (
        "validate_node",
        "ai-service/app/graph/nodes/validate.py",
        1,
    ),
    "cost_spike": (
        "intent_registry",
        "ai-service/app/agents/intent_registry.py",
        2,
    ),
    "latency_spike": (
        "context_assembly",
        "ai-service/app/graph/nodes/context_assembly.py",
        2,
    ),
    "danger_zone_no_escalation": (
        "validate_node",
        "ai-service/app/graph/nodes/validate.py",
        1,
    ),
    "rag_empty_chunks": (
        "rag_knowledge",
        "ai-service/app/graph/nodes/rag_retrieval.py",
        2,
    ),
    "capsule_cost_leak": (
        "intent_registry",
        "ai-service/app/agents/intent_registry.py",
        2,
    ),
}

SYSTEM_PROMPT = """You are a senior AI engineer on Tomo — an AI performance coaching \
platform for youth athletes built on LangGraph + FastAPI + Claude.

You review LangSmith observability data and generate specific, actionable fix \
recommendations. Each fix should be copy-paste ready.

Output ONLY valid JSON matching the schema requested. No markdown fences, no commentary."""


async def generate_fix(issue: dict) -> dict | None:
    """
    Generate a fix recommendation for a single issue using Haiku.
    Returns fix dict or None if issue type is unknown.
    """
    config = ISSUE_CONFIG.get(issue["issue_type"])
    if not config:
        logger.warning(f"No fix config for issue type: {issue['issue_type']}")
        return None

    fix_type, file_path, priority = config
    settings = get_settings()

    prompt = f"""
Issue: {issue['issue_type']} | Severity: {issue['severity']}
Affected runs: {issue['affected_count']}
Summary: {issue['pattern_summary']}
Stats: {json.dumps(issue.get('metadata', {}), indent=2)}
Trend: {json.dumps(issue.get('trend_data', {}), indent=2)}
File to fix: {file_path}

Generate a fix as JSON:
{{
  "title": "max 8 words describing the fix",
  "description": "2 sentences: what is broken and why",
  "code_change": "exact code block to add or change (Python or TypeScript)",
  "expected_impact": "specific measurable outcome",
  "langsmith_metric": "which metadata field proves the fix worked"
}}
"""

    try:
        client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        response = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=800,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )

        text = response.content[0].text.strip()
        # Strip markdown fences if Haiku wraps them
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        if text.endswith("```"):
            text = text[:-3]

        fix_data = json.loads(text.strip())
        return {
            "fix_type": fix_type,
            "file_path": file_path,
            "priority": priority,
            "title": fix_data.get("title", ""),
            "description": fix_data.get("description", ""),
            "code_change": fix_data.get("code_change", ""),
            "expected_impact": fix_data.get("expected_impact", ""),
            "langsmith_metric": fix_data.get("langsmith_metric", ""),
            "confidence": 0.60,
        }

    except json.JSONDecodeError as e:
        logger.warning(f"Haiku returned invalid JSON for {issue['issue_type']}: {e}")
        return None
    except Exception as e:
        logger.error(f"Fix generation failed for {issue['issue_type']}: {e}")
        return None


async def analyze_open_issues() -> int:
    """
    Find open issues without fixes, generate recommendations.
    Returns count of fixes generated.
    """
    pool = get_pool()
    if not pool:
        logger.error("No DB pool available for issue analysis")
        return 0

    fixes_generated = 0

    # Fetch open issues that have no fix yet (priority order)
    async with pool.connection() as conn:
        result = await conn.execute(
            """
            SELECT i.id, i.week_start, i.issue_type, i.severity,
                   i.affected_count, i.pattern_summary, i.metadata, i.trend_data
            FROM ai_issues i
            LEFT JOIN ai_fixes f ON f.issue_id = i.id
            WHERE i.status = 'open' AND f.id IS NULL
            ORDER BY
              CASE i.severity
                WHEN 'critical' THEN 1 WHEN 'high' THEN 2
                WHEN 'medium'   THEN 3 ELSE 4 END
            LIMIT 10
            """,
        )
        rows = await result.fetchall()

    if not rows:
        logger.info("No open issues without fixes — nothing to analyze")
        return 0

    # Column mapping from fetchall (returns tuples)
    col_names = ["id", "week_start", "issue_type", "severity",
                 "affected_count", "pattern_summary", "metadata", "trend_data"]

    for row in rows:
        issue = dict(zip(col_names, row))

        # Parse JSONB fields if they come back as strings
        for json_field in ("metadata", "trend_data"):
            if isinstance(issue.get(json_field), str):
                try:
                    issue[json_field] = json.loads(issue[json_field])
                except (json.JSONDecodeError, TypeError):
                    issue[json_field] = {}

        fix = await generate_fix(issue)
        if not fix:
            continue

        try:
            async with pool.connection() as conn:
                await conn.execute(
                    """
                    INSERT INTO ai_fixes
                      (issue_id, priority, fix_type, title, description,
                       file_path, code_change, expected_impact,
                       langsmith_metric, confidence)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        issue["id"],
                        fix["priority"],
                        fix["fix_type"],
                        fix["title"],
                        fix["description"],
                        fix["file_path"],
                        fix["code_change"],
                        fix["expected_impact"],
                        fix["langsmith_metric"],
                        fix["confidence"],
                    ),
                )
                # Update issue status to fix_generated
                await conn.execute(
                    "UPDATE ai_issues SET status = 'fix_generated' WHERE id = %s",
                    (issue["id"],),
                )
            fixes_generated += 1
            logger.info(f"Fix generated for {issue['issue_type']}: {fix['title']}")
        except Exception as e:
            logger.error(f"Failed to save fix for {issue['issue_type']}: {e}")

    return fixes_generated
