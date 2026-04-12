"""
Tomo AI Service — Conversation History Loader
Loads previous conversation turns from chat_messages table
and applies token budgeting for context window management.

Budget: 5K tokens (~20K chars) for history. This is intentionally tight because
the total context also includes: system prompt (~2K tokens), player context
(~1.5K), RAG chunks (~1K), and tool results during agentic loop (~3K per tool).
Keeping history lean = faster responses + lower cost.

Deduplication: TypeScript gateway saves the user message before proxying to
Python. Python's persist_node saves it again. This loader deduplicates
consecutive same-role messages to prevent history inflation.
"""

from __future__ import annotations

import logging
from typing import Optional

from langchain_core.messages import BaseMessage, HumanMessage, AIMessage

logger = logging.getLogger("tomo-ai.conversation_history")

# ── Token Budget ──────────────────────────────────────────────────
# 5K tokens for history (down from 12K). The full context window includes:
#   History: ~5K tokens (this budget)
#   System prompt: ~2K tokens (static block cached)
#   Dynamic block: ~1.5K tokens (player context, safety, RAG, memory)
#   Tool results: ~3K per tool call (up to 5 iterations)
# Total: ~15-20K per turn — well within Haiku's 200K window while keeping latency low.
TOKEN_BUDGET = 5000
CHARS_PER_TOKEN = 4
CHAR_BUDGET = TOKEN_BUDGET * CHARS_PER_TOKEN  # 20000 chars

MAX_HISTORY_ROWS = 30  # Safety cap on DB query (was 50 — 30 is 15 turns max)
KEEP_RECENT = 4        # Last 2 user-assistant pairs kept verbatim


async def load_conversation_history(
    session_id: str,
    user_id: str,
) -> list[BaseMessage]:
    """
    Load conversation history from chat_messages for the given session.

    Returns a list of LangChain BaseMessage objects (HumanMessage/AIMessage)
    ordered chronologically, with deduplication + token budgeting applied.

    Gracefully returns empty list on any failure.
    """
    from app.db.supabase import get_pool

    pool = get_pool()
    if not pool:
        logger.debug("No DB pool available, skipping history load")
        return []

    try:
        async with pool.connection() as conn:
            result = await conn.execute(
                """SELECT role, content
                   FROM chat_messages
                   WHERE session_id = %s AND user_id = %s
                   ORDER BY created_at ASC
                   LIMIT %s""",
                (session_id, user_id, MAX_HISTORY_ROWS),
            )
            rows = await result.fetchall()

        if not rows:
            return []

        # Convert DB rows to LangChain messages WITH deduplication
        # TypeScript gateway + Python persist_node both save user messages,
        # so we deduplicate consecutive same-role messages with identical content.
        all_msgs: list[BaseMessage] = []
        prev_role: str | None = None
        prev_content_hash: int | None = None

        for role, content in rows:
            if not content or not content.strip():
                continue
            # Deduplicate: skip if same role + same content as previous
            content_hash = hash(content.strip()[:500])
            if role == prev_role and content_hash == prev_content_hash:
                continue
            prev_role = role
            prev_content_hash = content_hash

            if role == "user":
                all_msgs.append(HumanMessage(content=content))
            elif role == "assistant":
                all_msgs.append(AIMessage(content=content))
            # Skip 'system' role messages

        if not all_msgs:
            return []

        # Apply token budget
        messages = _apply_token_budget(all_msgs)

        total_chars = sum(len(m.content) for m in messages)
        logger.info(
            f"History: {len(messages)} msgs loaded "
            f"({len(rows)} DB rows, {len(rows) - len(all_msgs)} deduped, "
            f"~{total_chars // CHARS_PER_TOKEN} tokens, session={session_id[:8]}...)"
        )
        return messages

    except Exception as e:
        logger.warning(f"History load failed (continuing without): {e}")
        return []


def _apply_token_budget(messages: list[BaseMessage]) -> list[BaseMessage]:
    """
    Apply 5K token budget to conversation history.

    Strategy:
      - If total fits within budget → return all
      - Otherwise keep last KEEP_RECENT messages verbatim
      - Compress older messages into a deterministic summary (no LLM cost)
    """
    total_chars = sum(len(m.content) for m in messages)

    if total_chars <= CHAR_BUDGET:
        return messages

    # Keep last N messages verbatim
    if len(messages) <= KEEP_RECENT:
        # Even if over budget, at minimum keep the conversation pair
        return messages

    recent = messages[-KEEP_RECENT:]
    older = messages[:-KEEP_RECENT]

    recent_chars = sum(len(m.content) for m in recent)
    remaining_budget = CHAR_BUDGET - recent_chars

    if remaining_budget <= 0 or not older:
        # Recent messages alone exceed budget — still return them for continuity
        return recent

    # Compress older messages into a deterministic summary
    summary = _compress_older_messages(older, remaining_budget)
    if summary:
        return [AIMessage(content=f"[Previous conversation summary]\n{summary}")] + recent
    return recent


def _compress_older_messages(messages: list[BaseMessage], char_budget: int) -> str:
    """
    Deterministic compression of older messages — zero LLM cost.

    Extracts user questions and key actions/confirmations from older turns.
    Keeps the essential context: what was discussed, what was decided.
    """
    user_questions: list[str] = []
    actions: list[str] = []
    topics_seen: set[str] = set()

    for msg in messages:
        content = msg.content[:500]  # Sample first 500 chars per message

        if hasattr(msg, "type") and msg.type == "human":
            # Keep first line of user messages as topic indicators
            first_line = content.split("\n")[0].strip()
            if first_line and len(first_line) < 200:
                # Deduplicate similar questions
                topic_key = first_line.lower()[:60]
                if topic_key not in topics_seen:
                    topics_seen.add(topic_key)
                    user_questions.append(first_line)
        elif hasattr(msg, "type") and msg.type == "ai":
            # Extract action confirmations from assistant messages
            content_lower = content.lower()
            if any(kw in content_lower for kw in ("confirmed", "created", "logged", "updated", "done")):
                first_line = content.split("\n")[0].strip()
                if first_line and len(first_line) < 150:
                    actions.append(first_line)

    parts: list[str] = []
    if user_questions:
        topics = "; ".join(user_questions[:6])  # Cap at 6 topics
        parts.append(f"User asked about: {topics}")
    if actions:
        action_summary = "; ".join(actions[:4])  # Cap at 4 actions
        parts.append(f"Actions completed: {action_summary}")

    summary = "\n".join(parts)
    return summary[:char_budget] if summary else ""
