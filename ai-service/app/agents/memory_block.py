"""
Memory block renderer for Tomo AI chat system prompts.

Pure function. No I/O. Input is the pre-formatted memory string produced by
context_assembly_node (which calls MemoryContext.format_for_prompt()).

The wrapper exists so:
  - prompt_builder doesn't depend on the MemoryContext dataclass directly
  - the section header is consistent with other Block 2 blocks
  - empty memory degrades gracefully (returns empty string, prompt builder filters)
"""

from __future__ import annotations

from typing import Optional

MEMORY_HEADER = "=== MEMORY (what we already know about this athlete) ==="


def build_memory_block(memory_text: Optional[str]) -> str:
    """
    Render cross-session memory as a system prompt block.

    Args:
        memory_text: Pre-formatted memory string from MemoryContext.format_for_prompt().
                     None or empty when memory is unavailable (Zep down, no longitudinal data).

    Returns:
        Formatted prompt block, or empty string when memory is unavailable.
    """
    if not memory_text:
        return ""
    cleaned = memory_text.strip()
    if not cleaned:
        return ""
    return f"{MEMORY_HEADER}\n{cleaned}"
