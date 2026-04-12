"""
Tomo AI Service — Conversation History Loader
Loads previous conversation turns from chat_messages table
and applies token budgeting for context window management.

Matches TypeScript loadSessionHistory() token budget (12K tokens).
Keeps last 6 messages verbatim, compresses older messages deterministically.
"""

from __future__ import annotations

import logging
from typing import Optional

from langchain_core.messages import BaseMessage, HumanMessage, AIMessage

logger = logging.getLogger("tomo-ai.conversation_history")

# Match TypeScript sessionService.ts token budget
TOKEN_BUDGET = 12000
CHARS_PER_TOKEN = 4
CHAR_BUDGET = TOKEN_BUDGET * CHARS_PER_TOKEN  # 48000 chars

MAX_HISTORY_ROWS = 50  # Safety cap on DB query
KEEP_RECENT = 6        # Last 3 user-assistant pairs kept verbatim


async def load_conversation_history(
    session_id: str,
    user_id: str,
) -> list[BaseMessage]:
    """
    Load conversation history from chat_messages for the given session.

    Returns a list of LangChain BaseMessage objects (HumanMessage/AIMessage)
    ordered chronologically, with token budgeting applied.

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

        # Convert DB rows to LangChain messages
        all_msgs: list[BaseMessage] = []
        for role, content in rows:
            if not content or not content.strip():
                continue
            if role == "user":
                all_msgs.append(HumanMessage(content=content))
            elif role == "assistant":
                all_msgs.append(AIMessage(content=content))
            # Skip 'system' role messages

        if not all_msgs:
            return []

        # Apply token budget
        messages = _apply_token_budget(all_msgs)

        logger.info(
            f"Loaded {len(messages)} history messages "
            f"(from {len(rows)} DB rows, session={session_id[:8]}...)"
        )
        return messages

    except Exception as e:
        logger.warning(f"History load failed (continuing without): {e}")
        return []


def _apply_token_budget(messages: list[BaseMessage]) -> list[BaseMessage]:
    """
    Apply 12K token budget to conversation history.

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
        return messages

    recent = messages[-KEEP_RECENT:]
    older = messages[:-KEEP_RECENT]

    recent_chars = sum(len(m.content) for m in recent)
    remaining_budget = CHAR_BUDGET - recent_chars

    if remaining_budget <= 0 or not older:
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
    """
    user_questions: list[str] = []
    actions: list[str] = []

    for msg in messages:
        content = msg.content[:500]  # Sample first 500 chars per message

        if hasattr(msg, "type") and msg.type == "human":
            # Keep first line of user messages as topic indicators
            first_line = content.split("\n")[0].strip()
            if first_line and len(first_line) < 200:
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
        topics = "; ".join(user_questions[:8])
        parts.append(f"User asked about: {topics}")
    if actions:
        action_summary = "; ".join(actions[:5])
        parts.append(f"Actions completed: {action_summary}")

    summary = "\n".join(parts)
    return summary[:char_budget] if summary else ""
