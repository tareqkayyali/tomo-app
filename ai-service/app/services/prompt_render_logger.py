"""
Prompt render logger — fire-and-forget sink for the prompt_render_log table.

Captures the assembled system prompt (Block 1 static + Block 2 dynamic blocks)
for every AI-routed chat turn. Source for the Phase 4 CMS "See What the Coach Saw"
inspector and for offline eval / regression analysis.

Non-blocking: failures log at debug level and never raise. Chat response path
is never delayed by this logger.
"""

from __future__ import annotations

import json
import logging
from typing import Optional

logger = logging.getLogger("tomo-ai.prompt_render_log")


async def log_prompt_render(
    *,
    request_id: str,
    athlete_id: str,
    session_id: str,
    turn_index: int,
    agent_type: str,
    intent_id: Optional[str],
    blocks: dict[str, str],
    static_tokens: int,
    dynamic_tokens: int,
    total_tokens: int,
    memory_facts_count: Optional[int],
    memory_available: bool,
    validation_warnings: list[str],
) -> None:
    """
    Insert one row into prompt_render_log. Idempotent on request_id.

    Args:
        request_id: UUID, also used as conflict key.
        athlete_id, session_id: athlete + session context.
        turn_index: 0-based turn position within the session.
        agent_type: which agent built this prompt (output, performance, etc.).
        intent_id: classified intent (greeting, qa_readiness, ...).
        blocks: mapping of section_name -> rendered_text. Empty sections OK.
        static_tokens, dynamic_tokens, total_tokens: from validate_safety_sections.
        memory_facts_count: number of Zep facts injected (None when memory unavailable).
        memory_available: whether MEMORY block was rendered.
        validation_warnings: soft warnings returned by the validator.

    Returns:
        None. All errors swallowed at debug level.
    """
    try:
        from app.db.supabase import get_pool

        pool = get_pool()
        if not pool:
            logger.debug("prompt_render_log skipped: no DB pool")
            return

        # Strip blocks down to non-empty entries to keep JSONB compact.
        compact_blocks = {k: v for k, v in blocks.items() if v}

        async with pool.connection() as conn:
            await conn.execute(
                """
                INSERT INTO prompt_render_log (
                    request_id, athlete_id, session_id, turn_index,
                    agent_type, intent_id, blocks,
                    static_tokens, dynamic_tokens, total_tokens,
                    memory_facts_count, memory_available, validation_warnings
                )
                VALUES (
                    %s, %s, %s, %s,
                    %s, %s, %s::jsonb,
                    %s, %s, %s,
                    %s, %s, %s
                )
                ON CONFLICT (request_id) DO NOTHING
                """,
                (
                    request_id, athlete_id, session_id, turn_index,
                    agent_type, intent_id, json.dumps(compact_blocks),
                    static_tokens, dynamic_tokens, total_tokens,
                    memory_facts_count, memory_available, validation_warnings,
                ),
            )

    except Exception as e:
        # Never raise — chat response must never depend on telemetry success.
        logger.debug("prompt_render_log write failed (non-blocking): %s", e)


def split_dynamic_block_for_logging(dynamic_block: str) -> dict[str, str]:
    """
    Split the assembled dynamic_block into named sections for the CMS inspector.

    The dynamic_block is the "\\n\\n".join of ordered Block 2 sections. Section
    boundaries are identified by their header markers — see prompt_builder block
    builders for the canonical headers.

    Returns a dict {section_name: section_text}. Sections not present in the
    block are simply absent from the dict.
    """
    if not dynamic_block:
        return {}

    # Headers each builder emits. Matched as substrings; first match wins.
    # Source of truth: prompt_builder.py block builders, verified 2026-04-26.
    HEADER_TO_SECTION = (
        ("READINESS (internal reference", "ccrs"),
        ("CRITICAL: These numbers are for YOUR decision", "ccrs_directive"),
        ("=== ATHLETE INTELLIGENCE BRIEF", "aib"),
        ("=== MEMORY (what we already know", "memory"),
        ("SPORT CONTEXT:", "sport_context"),
        ("PLAYER CONTEXT:", "player_context"),
        ("PHV AWARENESS", "phv"),
        ("DUAL-LOAD CONTEXT", "dual_load"),
        ("=== TRIANGLE INPUTS", "triangle_inputs"),
        ("<triangle_inputs", "triangle_inputs"),
        ("COMMUNICATION PROFILE", "tone"),
        ("SNAPSHOT DATA:", "snapshot"),
        ("TEMPORAL CONTEXT:", "temporal"),
        ("DATE MAPPING", "date_mapping"),
        ("DATE RULES:", "date_rules"),
        ("SCHEDULE RULES", "schedule_rules"),
        ("ACTIVE RECOMMENDATIONS", "recs"),
        ("WHOOP STATUS", "wearable"),
        ("WEARABLE STATUS", "wearable"),
        ("<safety_gate_policy>", "safety_gate_policy"),
        ("=== SAFETY GATE POLICY", "safety_gate_policy"),
        ("SIGNAL CONFLICT", "signal_conflict"),
        ("=== CONFLICT MEDIATION", "conflict_mediation"),
        ("CURRENT INTENT:", "intent_guidance"),
        ("CONVERSATION CONTEXT:", "conversation_context"),
        ("PRIOR AGENT HANDOFF", "prior_agent_handoff"),
        ("MULTI-STEP WORKFLOW", "workflow"),
        ("SCHEDULING THREAD ANCHOR", "scheduling_anchor"),
    )

    chunks = [c.strip() for c in dynamic_block.split("\n\n") if c.strip()]
    out: dict[str, str] = {}
    for chunk in chunks:
        matched = False
        for header_marker, section_name in HEADER_TO_SECTION:
            if header_marker in chunk:
                # Concatenate when same section appears twice (rare).
                if section_name in out:
                    out[section_name] = out[section_name] + "\n\n" + chunk
                else:
                    out[section_name] = chunk
                matched = True
                break
        if not matched:
            # Unrecognised chunks land in "_other" — useful when builders add new headers.
            out.setdefault("_other", "")
            out["_other"] = (out["_other"] + "\n\n" + chunk).strip()

    return out
