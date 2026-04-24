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

import json
import logging
import os
from typing import Optional

from langchain_core.messages import BaseMessage, HumanMessage, AIMessage

from app.utils.message_helpers import get_msg_type, get_msg_content

logger = logging.getLogger("tomo-ai.conversation_history")

# ── Token Budget ──────────────────────────────────────────────────
# Default: 8K tokens for history (was 5K). Compression for older messages
# is deterministic ($0) so the bump only buys us MORE fidelity on recent
# turns, not more cost. Env-var gated so we can tune per-tier without a
# redeploy if latency spikes.
#
# The full context window includes:
#   History:        ~8K tokens (this budget)
#   System prompt:  ~2K tokens (static block cached)
#   Dynamic block:  ~1.5K tokens (player context, safety, RAG, memory)
#   Tool results:   ~3K per tool call (up to 5 iterations)
# Total: ~18-25K per turn -- still well within Haiku's 200K window.
def _int_env(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        val = int(raw)
        return val if val > 0 else default
    except ValueError:
        return default


TOKEN_BUDGET = _int_env("CHAT_TOKEN_BUDGET", 8000)
CHARS_PER_TOKEN = 4
CHAR_BUDGET = TOKEN_BUDGET * CHARS_PER_TOKEN  # 32000 chars at default

MAX_HISTORY_ROWS = _int_env("CHAT_MAX_HISTORY_ROWS", 30)  # Safety cap on DB query
KEEP_RECENT = _int_env("CHAT_KEEP_RECENT", 6)             # Verbatim recent messages (3 user-assistant pairs)

logger.info(
    f"conversation_history config: TOKEN_BUDGET={TOKEN_BUDGET} "
    f"CHAR_BUDGET={CHAR_BUDGET} MAX_HISTORY_ROWS={MAX_HISTORY_ROWS} "
    f"KEEP_RECENT={KEEP_RECENT}"
)


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
                readable = _extract_readable_content(content)
                all_msgs.append(AIMessage(content=readable))
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


def _extract_readable_content(raw_content: str) -> str:
    """
    Convert a structured JSON response into readable text for the LLM.

    The persist node saves the final structured JSON (headline, body, cards, chips)
    as the assistant's message. When loaded as history, the LLM needs natural text
    — not a raw JSON blob — to understand what it said previously.

    Example:
      Input:  '{"headline":"Your week","body":"I'm adding gym...","cards":[...]}'
      Output: "Your week\nI'm adding gym...\n[Week plan: MON School · Gym at 18:00, ...]"
    """
    if not raw_content or not raw_content.strip().startswith("{"):
        return raw_content  # Not JSON — return as-is (plain text response)

    try:
        data = json.loads(raw_content)
        if not isinstance(data, dict) or "headline" not in data:
            return raw_content  # Not a structured response

        parts: list[str] = []

        # Headline + body = the coaching text
        if data.get("headline"):
            parts.append(data["headline"])
        if data.get("body"):
            parts.append(data["body"])

        # Summarize cards so the LLM knows what was shown
        for card in data.get("cards", []):
            card_type = card.get("type", "")

            if card_type == "week_plan":
                days = card.get("days", [])
                day_parts = []
                for day in days:
                    tags = " · ".join(t.get("label", "") for t in day.get("tags", []))
                    time_str = day.get("time", "")
                    note = day.get("note", "")
                    line = f"{day.get('day', '')}: {tags}"
                    if time_str:
                        line += f" at {time_str}"
                    if note:
                        line += f" ({note})"
                    day_parts.append(line)
                parts.append(f"[Showed week plan: {'; '.join(day_parts)}]")

            elif card_type == "confirm_card":
                items = card.get("items", [])
                if items:
                    item_parts = []
                    for it in items:
                        detail = it.get("title", "")
                        if it.get("date"):
                            detail += f" on {it['date']}"
                        if it.get("time"):
                            detail += f" at {it['time']}"
                        item_parts.append(detail)
                    parts.append(f"[Proposed to add: {', '.join(item_parts)}]")

            elif card_type == "stat_grid":
                items = card.get("items", [])
                stats = [f"{it.get('label', '')}: {it.get('value', '')}" for it in items]
                if stats:
                    parts.append(f"[Stats shown: {', '.join(stats)}]")

            elif card_type in ("text_card", "coach_note"):
                text = card.get("body") or card.get("note", "")
                if text and text not in " ".join(parts):
                    parts.append(text)

            elif card_type == "schedule_list":
                items_list = card.get("items", [])
                events = [f"{it.get('time', '')} {it.get('title', '')}" for it in items_list]
                if events:
                    parts.append(f"[Schedule shown: {', '.join(events)}]")

            elif card_type == "session_plan":
                drills = card.get("drills", [])
                drill_names = [d.get("name", d.get("title", "")) for d in drills if isinstance(d, dict)]
                if drill_names:
                    parts.append(f"[Session plan: {', '.join(drill_names[:5])}]")

            elif card_type == "program_recommendation":
                programs = card.get("programs", [])
                prog_names = [p.get("name", "") for p in programs if isinstance(p, dict)]
                if prog_names:
                    parts.append(f"[Programs suggested: {', '.join(prog_names[:3])}]")

            elif card_type == "program_detail":
                pname = card.get("name", "")
                if pname:
                    parts.append(f"[Program detail: {pname}]")

            elif card_type == "benchmark_bar":
                metric = card.get("metric", "")
                percentile = card.get("percentile", "")
                if metric:
                    parts.append(f"[Benchmark: {metric} at {percentile}th percentile]")

            elif card_type == "choice_card":
                options = card.get("options", [])
                opt_labels = [o.get("label", "") for o in options if isinstance(o, dict)]
                if opt_labels:
                    parts.append(f"[Choices offered: {', '.join(opt_labels)}]")

            elif card_type == "drill_card":
                name = card.get("name", card.get("title", ""))
                if name:
                    parts.append(f"[Drill shown: {name}]")

            elif card_type == "zone_stack":
                zones = card.get("zones", [])
                zone_names = [z.get("label", "") for z in zones if isinstance(z, dict)]
                if zone_names:
                    parts.append(f"[Zones: {', '.join(zone_names)}]")

            elif card_type == "stat_row":
                label = card.get("label", "")
                value = card.get("value", "")
                if label:
                    parts.append(f"[{label}: {value}]")

        # Include suggested actions so the LLM knows what follow-ups were offered
        chips = data.get("chips", [])
        if chips:
            labels = [c.get("label", "") for c in chips if c.get("label")]
            if labels:
                parts.append(f"[Suggested follow-ups: {', '.join(labels)}]")

        result = "\n".join(parts)
        if result.strip():
            return result

        # Fallback: generate a type summary from card types instead of returning
        # raw JSON. LLM needs readable text, not JSON blobs — blank context causes
        # empty responses on agent switches.
        card_types = [c.get("type", "unknown") for c in data.get("cards", [])]
        if card_types:
            return f"[Showed {', '.join(card_types)} cards]"
        return "[Previous response — no readable content extracted]"

    except (json.JSONDecodeError, TypeError, KeyError):
        return raw_content  # Parse failed — return raw


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
        content = get_msg_content(msg)[:500]  # Sample first 500 chars per message
        msg_type = get_msg_type(msg)

        if msg_type == "human":
            # Keep first line of user messages as topic indicators
            first_line = content.split("\n")[0].strip()
            if first_line and len(first_line) < 200:
                # Deduplicate similar questions
                topic_key = first_line.lower()[:60]
                if topic_key not in topics_seen:
                    topics_seen.add(topic_key)
                    user_questions.append(first_line)
        elif msg_type == "ai":
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


async def load_last_agent_for_session(
    session_id: str,
    user_id: str,
) -> Optional[str]:
    """
    Load the last agent type used in a session from chat_messages metadata.

    This enables cross-invocation agent continuity: when a user sends a follow-up
    message, the pre_router can check agent lock against the PREVIOUS turn's agent
    instead of always starting fresh.

    Returns: agent type string ("output", "timeline", etc.) or None
    """
    from app.db.supabase import get_pool

    pool = get_pool()
    if not pool:
        return None

    try:
        async with pool.connection() as conn:
            result = await conn.execute(
                """SELECT metadata->>'agent_type' AS agent_type
                   FROM chat_messages
                   WHERE session_id = %s AND user_id = %s AND role = 'assistant'
                     AND metadata IS NOT NULL
                   ORDER BY created_at DESC
                   LIMIT 1""",
                (session_id, user_id),
            )
            row = await result.fetchone()

        if row and row[0]:
            logger.debug(f"Last agent for session {session_id[:8]}: {row[0]}")
            return row[0]
        return None

    except Exception as e:
        logger.debug(f"Last agent lookup failed (non-blocking): {e}")
        return None
