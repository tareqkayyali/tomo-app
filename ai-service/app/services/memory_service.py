"""
Tomo AI Service — 4-Tier Memory Service
Orchestrates the memory hierarchy for the coaching chat pipeline.

4-Tier Memory Architecture:
  1. Working Memory  — Current conversation state (LangGraph state.messages)
  2. Episodic Memory — Per-session history + summaries (Zep sessions)
  3. Semantic Memory — Cross-session facts + entities (Zep fact extraction)
  4. Procedural Memory — Athlete Intelligence Brief (AIB, Phase 2)

Fetch flow (context_assembly_node):
  - Parallel: fetch Zep facts + recent session summaries + DB longitudinal memory
  - Merge into structured prompt block
  - Graceful degradation if Zep unavailable

Save flow (persist_node):
  - After response: save conversation turn to Zep session
  - After 5+ turns: trigger Haiku memory extraction + DB longitudinal update
  - All non-blocking (failures don't affect response)
"""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field
from typing import Any, Optional

from app.config import get_settings
from app.services.zep_client import (
    ZepClient,
    ZepFact,
    ZepMessage,
    ZepMemoryResult,
    get_zep_client,
)

logger = logging.getLogger("tomo-ai.memory")


# ── Data models ───────────────────────────────────────────────────────

@dataclass
class AthleteMemory:
    """
    Structured athlete memory matching the TS longitudinalMemory.ts interface.
    Stored as JSONB in athlete_longitudinal_memory.memory_json.
    """
    current_goals: list[str] = field(default_factory=list)
    unresolved_concerns: list[str] = field(default_factory=list)
    injury_history: list[str] = field(default_factory=list)
    behavioral_patterns: list[str] = field(default_factory=list)
    coaching_preferences: list[str] = field(default_factory=list)
    last_topics: list[str] = field(default_factory=list)
    key_milestones: list[str] = field(default_factory=list)

    @classmethod
    def from_json(cls, data: dict[str, Any]) -> AthleteMemory:
        return cls(
            current_goals=data.get("currentGoals", data.get("current_goals", [])),
            unresolved_concerns=data.get("unresolvedConcerns", data.get("unresolved_concerns", [])),
            injury_history=data.get("injuryHistory", data.get("injury_history", [])),
            behavioral_patterns=data.get("behavioralPatterns", data.get("behavioral_patterns", [])),
            coaching_preferences=data.get("coachingPreferences", data.get("coaching_preferences", [])),
            last_topics=data.get("lastTopics", data.get("last_topics", [])),
            key_milestones=data.get("keyMilestones", data.get("key_milestones", [])),
        )


@dataclass
class MemoryContext:
    """Full memory context assembled for prompt injection."""
    zep_facts: list[ZepFact] = field(default_factory=list)
    session_summaries: list[str] = field(default_factory=list)
    longitudinal: Optional[AthleteMemory] = None
    total_sessions: int = 0
    memory_available: bool = False

    def format_for_prompt(self) -> str:
        """Format memory context as a prompt block for system prompt injection."""
        if not self.memory_available:
            return ""

        parts: list[str] = []

        # Zep facts (semantic memory — cross-session)
        if self.zep_facts:
            facts_text = "\n".join(f"  - {f.fact}" for f in self.zep_facts[:10])
            parts.append(f"=== ATHLETE MEMORY (cross-session facts) ===\n{facts_text}")

        # Recent session summaries (episodic memory)
        if self.session_summaries:
            summaries = "\n".join(
                f"  - Session {i+1}: {s}" for i, s in enumerate(self.session_summaries[:3])
            )
            parts.append(f"=== RECENT SESSIONS ===\n{summaries}")

        # Longitudinal memory (from DB)
        if self.longitudinal:
            mem = self.longitudinal
            sections: list[str] = []
            if mem.current_goals:
                sections.append(f"  Goals: {', '.join(mem.current_goals[:5])}")
            if mem.unresolved_concerns:
                sections.append(f"  Concerns: {', '.join(mem.unresolved_concerns[:5])}")
            if mem.injury_history:
                sections.append(f"  Injury history: {', '.join(mem.injury_history[:3])}")
            if mem.coaching_preferences:
                sections.append(f"  Coaching preferences: {', '.join(mem.coaching_preferences[:3])}")
            if mem.key_milestones:
                sections.append(f"  Milestones: {', '.join(mem.key_milestones[:3])}")
            if sections:
                parts.append(f"=== ATHLETE PROFILE MEMORY ===\n" + "\n".join(sections))

        if not parts:
            return ""

        return "\n\n".join(parts)


# ── Fetch (context_assembly) ─────────────────────────────────────────

async def fetch_memory_context(user_id: str) -> MemoryContext:
    """
    Fetch full memory context for prompt injection.
    Called during context_assembly_node in parallel with other fetches.
    Gracefully degrades if Zep is unavailable.
    """
    settings = get_settings()
    ctx = MemoryContext()

    # Skip if Zep not configured
    if not settings.zep_api_key:
        logger.debug("Zep not configured — loading DB-only memory")
        ctx.longitudinal = await _load_db_memory(user_id)
        if ctx.longitudinal:
            ctx.memory_available = True
        return ctx

    try:
        # Parallel: Zep facts + DB longitudinal memory
        zep_task = _fetch_zep_memory(user_id)
        db_task = _load_db_memory(user_id)

        zep_result, db_memory = await asyncio.gather(
            zep_task, db_task, return_exceptions=True
        )

        # Process Zep results
        if isinstance(zep_result, tuple) and not isinstance(zep_result, Exception):
            facts, summaries, session_count = zep_result
            ctx.zep_facts = facts
            ctx.session_summaries = summaries
            ctx.total_sessions = session_count

        # Process DB memory
        if isinstance(db_memory, AthleteMemory):
            ctx.longitudinal = db_memory

        ctx.memory_available = bool(ctx.zep_facts or ctx.longitudinal)

    except Exception as e:
        logger.warning(f"Memory fetch failed (non-blocking): {e}")
        # Try DB-only fallback
        try:
            ctx.longitudinal = await _load_db_memory(user_id)
            ctx.memory_available = ctx.longitudinal is not None
        except Exception:
            pass

    return ctx


async def _fetch_zep_memory(
    user_id: str,
) -> tuple[list[ZepFact], list[str], int]:
    """Fetch facts and session summaries from Zep."""
    zep = get_zep_client()

    # Ensure user exists in Zep
    await zep.ensure_user(user_id)

    # Get user sessions
    sessions = await zep.get_user_sessions(user_id, limit=10)
    session_count = len(sessions)

    # Collect facts from recent sessions
    facts = await zep.get_user_facts(user_id, limit=15)

    # Collect session summaries
    summaries: list[str] = []
    for session in sessions[:3]:
        sid = session.get("session_id", "")
        if not sid:
            continue
        memory = await zep.get_memory(sid, lastn=0)
        if memory and memory.summary:
            summaries.append(memory.summary)

    return facts, summaries, session_count


async def _load_db_memory(user_id: str) -> Optional[AthleteMemory]:
    """Load longitudinal memory from the athlete_longitudinal_memory table."""
    try:
        from app.db.supabase import get_pool

        pool = get_pool()
        if not pool:
            return None

        async with pool.connection() as conn:
            row = await conn.execute(
                "SELECT memory_json FROM athlete_longitudinal_memory WHERE athlete_id = %s",
                (user_id,),
            )
            result = await row.fetchone()
            if result and result[0]:
                data = result[0] if isinstance(result[0], dict) else json.loads(result[0])
                return AthleteMemory.from_json(data)
    except Exception as e:
        logger.debug(f"DB memory load failed (non-critical): {e}")
    return None


# ── Save (persist_node) ──────────────────────────────────────────────

_LONGITUDINAL_THRESHOLD = 5   # minimum turns before first extraction
_LONGITUDINAL_INTERVAL  = 5   # re-extract every N turns after threshold


def _should_extract(turn_count: int) -> bool:
    """True when longitudinal extraction should fire for this turn."""
    return turn_count >= _LONGITUDINAL_THRESHOLD and turn_count % _LONGITUDINAL_INTERVAL == 0


async def _fetch_session_history(session_id: str, user_id: str) -> list[dict[str, str]]:
    """Fetch conversation messages for a session from chat_messages."""
    from app.db.supabase import get_pool
    pool = get_pool()
    if not pool:
        return []
    try:
        async with pool.connection() as conn:
            result = await conn.execute(
                """SELECT role, content FROM chat_messages
                   WHERE session_id = %s AND user_id = %s
                   ORDER BY created_at ASC
                   LIMIT 40""",
                (session_id, user_id),
            )
            rows = await result.fetchall()
            return [{"role": row[0], "content": row[1]} for row in rows]
    except Exception as e:
        logger.warning(f"_fetch_session_history failed: {e}")
        return []


async def save_memory_after_turn(
    user_id: str,
    session_id: str,
    user_message: str,
    assistant_response: str,
    agent_type: str = "output",
    turn_count: int = 0,
) -> None:
    """
    Save conversation turn to Zep and trigger longitudinal extraction when due.
    Called from persist_node after DB writes. Non-blocking.
    """
    settings = get_settings()
    extract_now = _should_extract(turn_count)

    if not settings.zep_api_key:
        # No Zep — still run longitudinal extraction from DB history
        if extract_now:
            asyncio.create_task(update_longitudinal_memory(user_id, session_id, turn_count))
        return

    try:
        zep = get_zep_client()
        await zep.ensure_user(user_id)
        await zep.create_session(
            session_id=session_id,
            user_id=user_id,
            metadata={"agent_type": agent_type},
        )
        messages = [
            ZepMessage(role="human", role_type="user", content=user_message),
            ZepMessage(
                role="ai",
                role_type="assistant",
                content=assistant_response,
                metadata={"agent_type": agent_type},
            ),
        ]
        await zep.add_memory(session_id, messages)
        logger.debug(f"Zep memory saved: session={session_id[:8]}... turn={turn_count}")

    except Exception as e:
        logger.warning(f"Zep memory save failed (non-blocking): {e}")

    # Longitudinal extraction fires regardless of Zep success
    if extract_now:
        asyncio.create_task(update_longitudinal_memory(user_id, session_id, turn_count))


async def update_longitudinal_memory(
    user_id: str,
    session_id: str,
    turn_count: int,
) -> None:
    """
    Update DB longitudinal memory from a session's conversation history.

    Fetches chat_messages for the session, calls Haiku to extract structured
    facts (goals, concerns, injuries, preferences, milestones), merges with
    existing DB memory, and upserts.

    Triggered as a background task by save_memory_after_turn() when
    turn_count reaches _LONGITUDINAL_THRESHOLD and every _LONGITUDINAL_INTERVAL
    turns after that. Non-blocking — failures never affect the response.
    """
    conversation_history = await _fetch_session_history(session_id, user_id)
    session_count = turn_count
    if len(conversation_history) < 6:
        return

    try:
        from langchain_anthropic import ChatAnthropic

        settings = get_settings()
        llm = ChatAnthropic(
            model="claude-haiku-4-5-20251001",
            temperature=0.0,
            max_tokens=512,
            api_key=settings.anthropic_api_key,
        )

        # Build conversation text
        conv_text = "\n".join(
            f"{m['role'].upper()}: {m['content'][:200]}"
            for m in conversation_history[-20:]
        )

        extraction_prompt = f"""Analyze this coaching conversation and extract structured memory.
Return ONLY valid JSON with these fields (arrays of short strings):

{{
  "sessionSummary": "one sentence summary",
  "newGoals": ["goal1", "goal2"],
  "newConcerns": ["concern1"],
  "resolvedConcerns": ["resolved1"],
  "injuryUpdates": ["update1"],
  "behavioralPatterns": ["pattern1"],
  "coachingPreferences": ["preference1"],
  "keyMilestones": ["milestone1"],
  "lastTopics": ["topic1", "topic2"]
}}

Conversation:
{conv_text}"""

        response = await llm.ainvoke(extraction_prompt)
        content = response.content if isinstance(response.content, str) else str(response.content)

        # Parse JSON from response
        start = content.find("{")
        end = content.rfind("}") + 1
        if start < 0 or end <= start:
            return
        extracted = json.loads(content[start:end])

        # Load existing memory and merge
        existing = await _load_db_memory(user_id)
        if not existing:
            existing = AthleteMemory()

        # Merge with dedup and cap
        existing.current_goals = _merge_lists(
            existing.current_goals, extracted.get("newGoals", []), max_items=8
        )
        existing.last_topics = extracted.get("lastTopics", existing.last_topics)[:5]
        existing.injury_history = _merge_lists(
            existing.injury_history, extracted.get("injuryUpdates", []), max_items=10
        )
        existing.behavioral_patterns = _merge_lists(
            existing.behavioral_patterns, extracted.get("behavioralPatterns", []), max_items=8
        )
        existing.coaching_preferences = _merge_lists(
            existing.coaching_preferences, extracted.get("coachingPreferences", []), max_items=5
        )
        existing.key_milestones = _merge_lists(
            existing.key_milestones, extracted.get("keyMilestones", []), max_items=10
        )

        # Remove resolved concerns
        resolved = set(c.lower() for c in extracted.get("resolvedConcerns", []))
        existing.unresolved_concerns = [
            c for c in existing.unresolved_concerns if c.lower() not in resolved
        ]
        existing.unresolved_concerns = _merge_lists(
            existing.unresolved_concerns, extracted.get("newConcerns", []), max_items=8
        )

        # Upsert to DB
        memory_json = {
            "currentGoals": existing.current_goals,
            "unresolvedConcerns": existing.unresolved_concerns,
            "injuryHistory": existing.injury_history,
            "behavioralPatterns": existing.behavioral_patterns,
            "coachingPreferences": existing.coaching_preferences,
            "lastTopics": existing.last_topics,
            "keyMilestones": existing.key_milestones,
        }

        from app.db.supabase import get_pool
        pool = get_pool()
        if pool:
            async with pool.connection() as conn:
                await conn.execute(
                    """INSERT INTO athlete_longitudinal_memory
                       (athlete_id, memory_json, session_count, last_session_summary, last_updated)
                       VALUES (%s, %s, %s, %s, NOW())
                       ON CONFLICT (athlete_id) DO UPDATE SET
                         memory_json = EXCLUDED.memory_json,
                         session_count = EXCLUDED.session_count,
                         last_session_summary = EXCLUDED.last_session_summary,
                         last_updated = NOW()""",
                    (
                        user_id,
                        json.dumps(memory_json),
                        session_count + 1,
                        extracted.get("sessionSummary", ""),
                    ),
                )
                logger.info(f"Longitudinal memory updated for {user_id}")

    except Exception as e:
        logger.warning(f"Longitudinal memory update failed (non-blocking): {e}")


def _merge_lists(existing: list[str], new: list[str], max_items: int = 8) -> list[str]:
    """Merge two lists with deduplication and max cap."""
    seen: set[str] = set()
    merged: list[str] = []
    for item in new + existing:
        key = item.lower().strip()
        if key and key not in seen:
            seen.add(key)
            merged.append(item)
    return merged[:max_items]
