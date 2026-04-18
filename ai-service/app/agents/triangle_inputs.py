"""
Triangle Input Registry — prompt block builder.

Fetches ranked weighted coach/parent inputs from the TS backend and
renders them as a system-prompt section. Injected between Dual-Load
and RAG per the locked injection order (P2.4, 2026-04-18).

Contract (not a safety gate):
  Triangle inputs INFORM the AI's reasoning. They never override the
  deterministic PHV / ACWR / RED safety gates. The block explicitly
  tells the model this; the runtime guarantee comes from the post-
  generation safety filter.

Silent failure policy:
  If the bridge call fails, log a structured warning and return empty
  string. The prompt omits the section — baseline behaviour preserved
  (AI Chat Baseline Protection rule: never regress when a new surface
  breaks).
"""

from __future__ import annotations

import logging
from typing import Optional

from app.agents.tools.bridge import bridge_get

logger = logging.getLogger(__name__)


# Cap how many inputs we render into the prompt. Matches the default
# topN in rankTriangleInputs but kept here too so an admin can tune
# client-side if prompt budget tightens.
MAX_INPUTS_IN_PROMPT = 10


async def fetch_ranked_triangle_inputs(
    athlete_id: str,
    *,
    event_id: Optional[str] = None,
    domain: Optional[str] = None,
    top_n: int = MAX_INPUTS_IN_PROMPT,
) -> list[dict]:
    """
    Calls GET /api/v1/triangle-inputs. Returns the ranked inputs list
    or [] on failure (never raises).
    """
    params: dict[str, str | int] = {"athlete_id": athlete_id, "topN": top_n}
    if event_id:
        params["event_id"] = event_id
    if domain:
        params["domain"] = domain
    try:
        result = await bridge_get("/api/v1/triangle-inputs", params=params, user_id=athlete_id)
    except Exception as e:
        logger.warning(f"triangle_inputs: bridge_get threw {e!r}")
        return []

    if not isinstance(result, dict) or "error" in result:
        logger.warning(
            f"triangle_inputs: bridge returned error: "
            f"{result.get('error') if isinstance(result, dict) else 'non-dict response'}"
        )
        return []

    inputs = result.get("inputs") or []
    if not isinstance(inputs, list):
        logger.warning("triangle_inputs: 'inputs' field is not a list")
        return []
    return inputs


def _fmt_age_days(created_at: str) -> str:
    """Compact '2d ago' / '3w ago' style. Best-effort; returns '' on error."""
    try:
        from datetime import datetime, timezone
        then = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
        delta = datetime.now(timezone.utc) - then
        hours = int(delta.total_seconds() / 3600)
        if hours < 24:
            return f"{hours}h ago" if hours > 0 else "just now"
        days = hours // 24
        if days < 14:
            return f"{days}d ago"
        weeks = days // 7
        return f"{weeks}w ago"
    except Exception:
        return ""


def render_triangle_inputs_block(inputs: list[dict]) -> str:
    """
    Pure: formats the ranked inputs into the system-prompt section.
    Returns empty string when inputs is empty (so the caller can join
    with other blocks without an awkward trailing header).
    """
    if not inputs:
        return ""

    lines: list[str] = [
        "=== TRIANGLE INPUTS (coach/parent context) ===",
        "These are weighted, context-tagged inputs from the athlete's coach and parent.",
        "They inform your reasoning but NEVER override the safety gates above. If a",
        "coach input and a parent input conflict, produce a balanced factual response —",
        "do not take sides. For T1/T2 athletes a parent decision supersedes coach on",
        "training authority; for T3 the athlete's preferences govern parent visibility.",
        "",
    ]

    for inp in inputs:
        role = inp.get("author_role", "?")
        domain = inp.get("domain", "?")
        input_type = inp.get("input_type", "?")
        weight = inp.get("effectiveWeight")
        created_at = inp.get("created_at", "")
        body = (inp.get("body") or "").strip().replace("\n", " ")
        if len(body) > 200:
            body = body[:197] + "…"

        w_str = f"w={weight:.2f}" if isinstance(weight, (int, float)) else ""
        age_str = _fmt_age_days(created_at)
        meta = ", ".join(x for x in [role, domain, input_type, w_str, age_str] if x)
        lines.append(f"[{meta}] \"{body}\"")

    return "\n".join(lines)


async def build_triangle_inputs_block(
    athlete_id: str,
    *,
    event_id: Optional[str] = None,
    domain: Optional[str] = None,
) -> str:
    """
    One-call helper for prompt_builder.build_system_prompt. Fetches +
    renders in a single coroutine. Returns '' on empty/failure so the
    caller can no-op-join.
    """
    if not athlete_id:
        return ""
    inputs = await fetch_ranked_triangle_inputs(
        athlete_id, event_id=event_id, domain=domain
    )
    return render_triangle_inputs_block(inputs)
