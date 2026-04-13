"""
Tomo AI Service -- Message Helpers
Robust utilities for reading LangGraph message objects.

LangGraph's `add_messages` reducer can produce dict-format messages
where standard `hasattr(m, "type")` checks fail. These helpers handle
BOTH LangChain BaseMessage objects AND dict-format messages uniformly.

MUST be used everywhere in the codebase that iterates state["messages"].
Using raw `hasattr(m, "type")` is a bug -- it silently skips dict messages.
"""

from __future__ import annotations

from typing import Optional


def get_msg_type(m) -> Optional[str]:
    """
    Get message type from any message format.

    Handles:
      - LangChain BaseMessage objects (HumanMessage, AIMessage, etc.)
      - Dict-format messages from LangGraph's add_messages reducer
      - Unknown objects (returns None)

    Returns: "human", "ai", "system", "tool", or None
    """
    # LangChain message objects have a .type property
    msg_type = getattr(m, "type", None)
    if msg_type is not None:
        return msg_type

    # Dict-format messages from add_messages reducer
    if isinstance(m, dict):
        return m.get("type")

    return None


def get_msg_content(m) -> str:
    """
    Get message content as a string from any message format.

    Handles:
      - LangChain BaseMessage objects (.content attribute)
      - Dict-format messages (.get("content"))
      - Multi-block content lists (joins text blocks)
      - Unknown objects (returns "")

    Returns: message content as a string
    """
    # Try .content attribute first (LangChain BaseMessage)
    content = getattr(m, "content", None)

    # Fall back to dict access
    if content is None and isinstance(m, dict):
        content = m.get("content", "")

    if content is None:
        return ""

    # Handle multi-block content (list of dicts with type/text)
    if isinstance(content, list):
        text_parts = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                text_parts.append(block.get("text", ""))
            elif isinstance(block, str):
                text_parts.append(block)
        return "\n".join(text_parts)

    if isinstance(content, str):
        return content

    return str(content)


def find_last_human_message(messages: list) -> str:
    """
    Find the content of the last human message in a message list.
    Handles both LangChain objects and dict-format messages.

    Returns: message content string, or "" if no human message found.
    """
    for msg in reversed(messages):
        if get_msg_type(msg) == "human":
            return get_msg_content(msg)
    return ""


def count_human_messages(messages: list) -> int:
    """
    Count human messages in a message list.
    Handles both LangChain objects and dict-format messages.
    """
    return sum(1 for m in messages if get_msg_type(m) == "human")
