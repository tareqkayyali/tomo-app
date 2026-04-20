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
from app.config import get_settings

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


# ── Conflict Mediation block (P3.3) ──────────────────────────────────
#
# Rendered ONLY for sessions whose seed_kind='conflict_mediation'.
# Injected AFTER the coaching persona and BEFORE output rules so the
# persona layer shapes the voice but mediation intent dominates the
# response structure. Strictly advisory to the LLM — the deterministic
# PHV/ACWR/RED filter still runs post-generation regardless of what
# the coach or parent said.


def render_conflict_mediation_block(seed_context: Optional[dict]) -> str:
    """
    Pure renderer. Takes the seed_context JSONB from chat_sessions and
    produces the mediation prompt section. Returns '' when the seed is
    missing, the wrong kind, or shaped unexpectedly — fail-closed so a
    broken seed never breaks the underlying coaching response.
    """
    if not seed_context or not isinstance(seed_context, dict):
        return ""
    if seed_context.get("kind") != "conflict_mediation":
        return ""

    event = seed_context.get("event") or {}
    conflict = seed_context.get("conflict") or {}
    annotations = seed_context.get("annotations") or []
    safety = seed_context.get("safety_snapshot") or {}
    snap_at = seed_context.get("snapshot_snapshot_at")

    # Collate annotations by author_role for the mediation pitch.
    coach_notes: list[str] = []
    parent_notes: list[str] = []
    other_notes: list[str] = []
    for a in annotations:
        if not isinstance(a, dict):
            continue
        body = (a.get("body") or "").strip().replace("\n", " ")
        if not body:
            continue
        if len(body) > 200:
            body = body[:197] + "…"
        role = a.get("author_role")
        if role == "coach":
            coach_notes.append(body)
        elif role == "parent":
            parent_notes.append(body)
        else:
            other_notes.append(f"[{role}] {body}")

    acwr_enabled = get_settings().acwr_ai_enabled
    physiology_ref = (
        "PHV stage, ACWR, readiness"
        if acwr_enabled
        else "PHV stage, readiness, CCRS recommendation"
    )
    safety_gates = (
        "PHV contraindications, ACWR > 1.5, RED readiness"
        if acwr_enabled
        else "PHV contraindications, CCRS 'blocked' recommendation, RED readiness"
    )
    lines: list[str] = [
        "=== CONFLICT MEDIATION MODE ===",
        "This session was opened from the Ask Tomo pill because the event has a coach",
        "vs parent disagreement. Your job is FACTUAL NARRATIVE, not a verdict:",
        "  - Cite what each adult actually said, verbatim (paraphrase only if long).",
        f"  - Ground your reasoning in the physiology signals below ({physiology_ref})",
        "    and the schedule context of the event.",
        "  - Offer ONE recommended path + two alternatives. Never tell the athlete",
        "    who is 'right'.",
        f"  - Safety gates ({safety_gates}) are",
        "    absolute — if an option is safety-blocked, say so and drop it from",
        "    the menu regardless of what coach or parent wrote.",
        "",
    ]

    # Event header
    title = event.get("title") or "this session"
    start = event.get("start_time") or ""
    axis = conflict.get("axis") or "unknown"
    rationale = conflict.get("rationale") or ""
    lines.append(f"EVENT: {title}" + (f" at {start}" if start else ""))
    lines.append(f"CONFLICT AXIS: {axis}" + (f" — {rationale}" if rationale else ""))

    if coach_notes:
        lines.append("")
        lines.append("COACH SAID:")
        for b in coach_notes:
            lines.append(f"  - \"{b}\"")
    if parent_notes:
        lines.append("")
        lines.append("PARENT SAID:")
        for b in parent_notes:
            lines.append(f"  - \"{b}\"")
    if other_notes:
        lines.append("")
        lines.append("OTHER CONTEXT:")
        for n in other_notes:
            lines.append(f"  - {n}")

    # Pinned safety snapshot — use this, not live snapshot, for the
    # mediation response. Transcript reproducibility.
    if safety:
        phv = safety.get("phv_stage")
        acwr = safety.get("acwr") if acwr_enabled else None
        readiness = safety.get("readiness_rag")
        ccrs_rec = safety.get("ccrs_recommendation")
        bits: list[str] = []
        if phv:
            bits.append(f"growth stage={phv}")
        if acwr is not None:
            bits.append(f"ACWR={acwr:.2f}" if isinstance(acwr, (int, float)) else f"ACWR={acwr}")
        if readiness:
            bits.append(f"readiness={readiness}")
        if ccrs_rec and not acwr_enabled:
            bits.append(f"CCRS={ccrs_rec}")
        if bits:
            lines.append("")
            lines.append("PINNED SAFETY SIGNALS:")
            lines.append("  " + ", ".join(bits))
    if snap_at:
        lines.append(f"(snapshot pinned at {snap_at})")

    return "\n".join(lines)


async def fetch_session_seed_context(session_id: str) -> Optional[dict]:
    """
    Load seed_context + seed_kind for a chat session via the TS backend.
    Returns None when session has no seed (baseline path) or on any
    fetch failure (fail-closed — coaching continues without mediation).
    """
    if not session_id:
        return None
    try:
        result = await bridge_get(
            f"/api/v1/chat/sessions/{session_id}",
            user_id=None,  # service-role path; session endpoint doesn't require user filter
        )
    except Exception as e:
        logger.warning(f"fetch_session_seed_context: bridge_get threw {e!r}")
        return None

    if not isinstance(result, dict) or "error" in result:
        return None
    # Endpoint returns {session: {...}} or {seed_context, seed_kind} —
    # support both shapes defensively.
    session = result.get("session") if isinstance(result.get("session"), dict) else result
    if not isinstance(session, dict):
        return None
    seed_kind = session.get("seed_kind")
    seed_context = session.get("seed_context")
    if not seed_kind or not isinstance(seed_context, dict):
        return None
    # Caller discriminates on seed_context['kind']; ensure it's set.
    if "kind" not in seed_context:
        seed_context = {**seed_context, "kind": seed_kind}
    return seed_context
