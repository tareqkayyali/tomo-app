"""
Tests for the cross-session memory prompt-block renderer (Phase 1, 2026-04-26).

build_memory_block is a pure function. We test:
  - empty/None inputs degrade to "" (graceful)
  - non-empty input gets the canonical section header
  - whitespace-only input is treated as empty
"""

from __future__ import annotations

from app.agents.memory_block import MEMORY_HEADER, build_memory_block


class TestBuildMemoryBlock:
    def test_none_input_returns_empty(self):
        assert build_memory_block(None) == ""

    def test_empty_string_returns_empty(self):
        assert build_memory_block("") == ""

    def test_whitespace_only_returns_empty(self):
        assert build_memory_block("   \n  \t \n") == ""

    def test_renders_header_for_non_empty_input(self):
        body = "  - Goals: U18 academy trial June 2026"
        result = build_memory_block(body)
        assert result.startswith(MEMORY_HEADER)
        assert "Goals: U18 academy trial June 2026" in result

    def test_strips_surrounding_whitespace(self):
        body = "\n\n  - fact about athlete\n\n"
        result = build_memory_block(body)
        assert MEMORY_HEADER in result
        # Cleaned body shouldn't have leading/trailing newlines on the section
        assert not result.endswith("\n\n")

    def test_preserves_internal_newlines(self):
        body = "  - line one\n  - line two\n  - line three"
        result = build_memory_block(body)
        assert "line one" in result
        assert "line two" in result
        assert "line three" in result

    def test_header_text_is_athlete_facing_safe(self):
        # Architect non-negotiable: PHV string never appears in athlete UI.
        # The memory block sits in system prompt, not athlete UI, but the
        # header should still be free of clinical jargon as a defensive habit.
        assert "PHV" not in MEMORY_HEADER
        assert "ACWR" not in MEMORY_HEADER
        assert "peak height velocity" not in MEMORY_HEADER.lower()
