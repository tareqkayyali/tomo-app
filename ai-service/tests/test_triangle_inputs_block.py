"""
Tests for app/agents/triangle_inputs.py — the prompt-block renderer
and bridge fetcher wrapper. Pure-function render tests; bridge fetch
is smoke-tested with a mocked bridge_get.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from app.agents.triangle_inputs import (
    MAX_INPUTS_IN_PROMPT,
    _fmt_age_days,
    fetch_ranked_triangle_inputs,
    render_triangle_inputs_block,
)


# ── render_triangle_inputs_block ──────────────────────────────────────

class TestRender:
    def test_empty_inputs_returns_empty_string(self):
        assert render_triangle_inputs_block([]) == ""

    def test_section_header_present(self):
        block = render_triangle_inputs_block([
            {"author_role": "coach", "domain": "training",
             "input_type": "standing_instruction",
             "body": "In-season taper.",
             "effectiveWeight": 0.9, "created_at": "2026-04-18T09:00:00Z"},
        ])
        assert "TRIANGLE INPUTS" in block
        # Must declare advisory-only
        assert "NEVER override the safety gates" in block

    def test_input_line_contains_role_and_weight(self):
        block = render_triangle_inputs_block([
            {"author_role": "coach", "domain": "training",
             "input_type": "standing_instruction",
             "body": "In-season taper.",
             "effectiveWeight": 0.87, "created_at": "2026-04-18T09:00:00Z"},
        ])
        assert "coach" in block
        assert "training" in block
        assert "w=0.87" in block
        assert "In-season taper." in block

    def test_body_truncation_at_200_chars(self):
        long_body = "x" * 400
        block = render_triangle_inputs_block([
            {"author_role": "parent", "domain": "academic",
             "input_type": "constraint", "body": long_body,
             "effectiveWeight": 1.0, "created_at": "2026-04-18T09:00:00Z"},
        ])
        # "…" indicates truncation; line should NOT contain full 400 chars
        assert "…" in block
        # Find the body portion by walking to the x-run
        xs_count = block.count("x")
        assert xs_count < 400

    def test_multiple_inputs_rendered_in_order(self):
        inputs = [
            {"author_role": "coach", "domain": "training",
             "input_type": "standing_instruction", "body": "first",
             "effectiveWeight": 0.9, "created_at": "2026-04-18T09:00:00Z"},
            {"author_role": "parent", "domain": "academic",
             "input_type": "constraint", "body": "second",
             "effectiveWeight": 1.0, "created_at": "2026-04-18T09:00:00Z"},
        ]
        block = render_triangle_inputs_block(inputs)
        assert block.index("first") < block.index("second")

    def test_missing_optional_fields_gracefully(self):
        inputs = [{"body": "just body"}]
        block = render_triangle_inputs_block(inputs)
        assert "just body" in block
        # No crash on missing role/domain/weight

    def test_newlines_in_body_normalised(self):
        inputs = [{
            "author_role": "coach", "domain": "training",
            "input_type": "observation",
            "body": "line1\nline2\nline3",
            "effectiveWeight": 0.5, "created_at": "2026-04-18T09:00:00Z",
        }]
        block = render_triangle_inputs_block(inputs)
        # Body is on a single line
        body_line = [l for l in block.splitlines() if "line1" in l][0]
        assert "line2" in body_line
        assert "line3" in body_line


# ── _fmt_age_days ─────────────────────────────────────────────────────

class TestFmtAge:
    def test_returns_string(self):
        # just-now / hours / days / weeks branches — all must return a
        # non-empty string that won't crash the prompt.
        s = _fmt_age_days("2026-04-18T09:00:00Z")
        assert isinstance(s, str)

    def test_invalid_returns_empty(self):
        # parseable fallback: any non-ISO input should return "" cleanly
        assert _fmt_age_days("not-a-date") == ""


# ── fetch_ranked_triangle_inputs ──────────────────────────────────────

@pytest.mark.asyncio
class TestFetch:
    async def test_success_returns_inputs(self):
        mock_bridge = AsyncMock(return_value={
            "athleteId": "a1",
            "tier": "T2",
            "inputs": [
                {"author_role": "coach", "domain": "training",
                 "input_type": "standing_instruction", "body": "x",
                 "effectiveWeight": 0.9, "created_at": "2026-04-18T09:00:00Z"},
            ],
        })
        with patch("app.agents.triangle_inputs.bridge_get", mock_bridge):
            result = await fetch_ranked_triangle_inputs("a1")
        assert len(result) == 1
        assert result[0]["author_role"] == "coach"

    async def test_error_returns_empty(self):
        mock_bridge = AsyncMock(return_value={"error": "TS backend returned 500"})
        with patch("app.agents.triangle_inputs.bridge_get", mock_bridge):
            result = await fetch_ranked_triangle_inputs("a1")
        assert result == []

    async def test_non_dict_response_returns_empty(self):
        mock_bridge = AsyncMock(return_value="unexpected string")
        with patch("app.agents.triangle_inputs.bridge_get", mock_bridge):
            result = await fetch_ranked_triangle_inputs("a1")
        assert result == []

    async def test_exception_caught_returns_empty(self):
        mock_bridge = AsyncMock(side_effect=RuntimeError("network"))
        with patch("app.agents.triangle_inputs.bridge_get", mock_bridge):
            result = await fetch_ranked_triangle_inputs("a1")
        assert result == []

    async def test_params_passed_through(self):
        mock_bridge = AsyncMock(return_value={"inputs": []})
        with patch("app.agents.triangle_inputs.bridge_get", mock_bridge):
            await fetch_ranked_triangle_inputs(
                "a1", event_id="e9", domain="training", top_n=5
            )
        # Positional arg is the path; kwargs carry params + user_id.
        call = mock_bridge.call_args
        assert call.args[0] == "/api/v1/triangle-inputs"
        assert call.kwargs["params"]["athlete_id"] == "a1"
        assert call.kwargs["params"]["event_id"] == "e9"
        assert call.kwargs["params"]["domain"] == "training"
        assert call.kwargs["params"]["topN"] == 5


# ── Config sanity ─────────────────────────────────────────────────────

def test_max_inputs_in_prompt_is_reasonable():
    # Guard: if someone bumps this to 100 they should know why (prompt
    # budget). 10 is the locked default matching the TS retrieval topN.
    assert 5 <= MAX_INPUTS_IN_PROMPT <= 20
