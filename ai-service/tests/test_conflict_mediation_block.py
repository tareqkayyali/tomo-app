"""
Tests for the Conflict Mediation prompt-block renderer + session seed
fetcher (P3.3, 2026-04-18).

render_conflict_mediation_block is a pure function — tested exhaustively
for the shape + fail-closed behaviour. fetch_session_seed_context is
tested via mocked bridge_get.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from app.agents.triangle_inputs import (
    fetch_session_seed_context,
    render_conflict_mediation_block,
)


def _seed(**overrides):
    base = {
        "kind": "conflict_mediation",
        "event": {
            "id": "event-123",
            "title": "Thursday sprint block",
            "start_time": "2026-04-23T17:00:00Z",
        },
        "annotations": [
            {"author_role": "coach", "body": "push hard — championship Monday"},
            {"author_role": "parent", "body": "she has a huge exam Friday, please ease off"},
        ],
        "conflict": {
            "axis": "load",
            "rationale": "coach(push) vs parent(rest) on training/academic",
            "authors": ["coach1", "parent1"],
            "roles": ["coach", "parent"],
            "domains": ["training", "academic"],
        },
        "safety_snapshot": {
            "phv_stage": "mid_phv",
            "acwr": 1.42,
            "readiness_rag": "amber",
        },
        "snapshot_snapshot_at": "2026-04-18T09:00:00Z",
    }
    base.update(overrides)
    return base


# ── render_conflict_mediation_block ──────────────────────────────────

class TestRender:
    def test_happy_path_contains_expected_sections(self):
        block = render_conflict_mediation_block(_seed())
        assert "CONFLICT MEDIATION MODE" in block
        assert "COACH SAID:" in block
        assert "PARENT SAID:" in block
        assert "push hard" in block
        assert "ease off" in block
        assert "PINNED SAFETY SIGNALS:" in block
        assert "ACWR=1.42" in block
        assert "growth stage=mid_phv" in block
        assert "readiness=amber" in block

    def test_explicit_safety_gate_directive(self):
        # Required behaviour: mediation must NEVER override deterministic
        # safety gates. The prompt must say so plainly.
        block = render_conflict_mediation_block(_seed())
        assert "absolute" in block.lower()
        # And the model must be told to drop safety-blocked options.
        assert "drop it from" in block.lower() or "off the menu" in block.lower() or "drop it" in block.lower()

    def test_event_title_surfaced(self):
        block = render_conflict_mediation_block(_seed())
        assert "Thursday sprint block" in block

    def test_conflict_axis_surfaced(self):
        block = render_conflict_mediation_block(_seed())
        assert "load" in block.lower()
        # Rationale present so admin debugging works off the transcript
        assert "push" in block.lower() and "rest" in block.lower()

    def test_pinned_snapshot_timestamp_present(self):
        block = render_conflict_mediation_block(_seed())
        assert "2026-04-18T09:00:00Z" in block

    def test_body_truncation(self):
        long = "a" * 400
        seed = _seed(annotations=[
            {"author_role": "coach", "body": long},
        ])
        block = render_conflict_mediation_block(seed)
        assert "…" in block
        # Truncated body should not have the full 400-char run
        assert block.count("a") < 400

    def test_newlines_normalised_in_body(self):
        seed = _seed(annotations=[
            {"author_role": "coach", "body": "line1\nline2\nline3"},
        ])
        block = render_conflict_mediation_block(seed)
        # All three lines on the same output line
        matching = [l for l in block.splitlines() if "line1" in l]
        assert len(matching) == 1
        assert "line2" in matching[0] and "line3" in matching[0]

    def test_missing_optional_fields_graceful(self):
        seed = {
            "kind": "conflict_mediation",
            "annotations": [],
            "conflict": {},
        }
        block = render_conflict_mediation_block(seed)
        # Still renders the header + safety directive, no crash.
        assert "CONFLICT MEDIATION MODE" in block

    def test_other_roles_rendered_separately(self):
        seed = _seed(annotations=[
            {"author_role": "system", "body": "parent overrode coach"},
        ])
        block = render_conflict_mediation_block(seed)
        assert "OTHER CONTEXT:" in block
        assert "system" in block

    def test_empty_bodies_skipped(self):
        seed = _seed(annotations=[
            {"author_role": "coach", "body": "   "},
            {"author_role": "coach", "body": ""},
            {"author_role": "parent", "body": "skip Thursday"},
        ])
        block = render_conflict_mediation_block(seed)
        # No empty bullet for coach — only parent should be listed
        assert "COACH SAID:" not in block
        assert "PARENT SAID:" in block


class TestRenderFailClosed:
    def test_none_seed_returns_empty(self):
        assert render_conflict_mediation_block(None) == ""

    def test_wrong_kind_returns_empty(self):
        assert render_conflict_mediation_block({"kind": "event"}) == ""
        assert render_conflict_mediation_block({"kind": "program"}) == ""

    def test_missing_kind_returns_empty(self):
        assert render_conflict_mediation_block({"event": {}}) == ""

    def test_non_dict_returns_empty(self):
        assert render_conflict_mediation_block("not a dict") == ""  # type: ignore[arg-type]
        assert render_conflict_mediation_block(123) == ""  # type: ignore[arg-type]
        assert render_conflict_mediation_block([]) == ""  # type: ignore[arg-type]

    def test_malformed_annotations_list_survives(self):
        seed = _seed(annotations=["not a dict", 42, {"author_role": "coach", "body": "ok"}])
        block = render_conflict_mediation_block(seed)
        assert "ok" in block


# ── fetch_session_seed_context ───────────────────────────────────────

@pytest.mark.asyncio
class TestFetchSeed:
    async def test_success_unwraps_session_wrapper(self):
        mock_bridge = AsyncMock(return_value={
            "session": {
                "id": "s1",
                "seed_kind": "conflict_mediation",
                "seed_context": {
                    "kind": "conflict_mediation",
                    "event": {"id": "e1"},
                },
            },
        })
        with patch("app.agents.triangle_inputs.bridge_get", mock_bridge):
            got = await fetch_session_seed_context("s1")
        assert got is not None
        assert got["kind"] == "conflict_mediation"
        assert got["event"]["id"] == "e1"

    async def test_flat_shape_supported(self):
        mock_bridge = AsyncMock(return_value={
            "seed_kind": "conflict_mediation",
            "seed_context": {"kind": "conflict_mediation", "event": {"id": "e1"}},
        })
        with patch("app.agents.triangle_inputs.bridge_get", mock_bridge):
            got = await fetch_session_seed_context("s1")
        assert got is not None
        assert got["kind"] == "conflict_mediation"

    async def test_missing_session_id_returns_none(self):
        got = await fetch_session_seed_context("")
        assert got is None

    async def test_bridge_error_returns_none(self):
        mock_bridge = AsyncMock(return_value={"error": "TS backend returned 500"})
        with patch("app.agents.triangle_inputs.bridge_get", mock_bridge):
            got = await fetch_session_seed_context("s1")
        assert got is None

    async def test_non_dict_response_returns_none(self):
        mock_bridge = AsyncMock(return_value="oops")
        with patch("app.agents.triangle_inputs.bridge_get", mock_bridge):
            got = await fetch_session_seed_context("s1")
        assert got is None

    async def test_no_seed_kind_returns_none(self):
        mock_bridge = AsyncMock(return_value={"session": {"id": "s1"}})
        with patch("app.agents.triangle_inputs.bridge_get", mock_bridge):
            got = await fetch_session_seed_context("s1")
        assert got is None

    async def test_exception_caught_returns_none(self):
        mock_bridge = AsyncMock(side_effect=RuntimeError("boom"))
        with patch("app.agents.triangle_inputs.bridge_get", mock_bridge):
            got = await fetch_session_seed_context("s1")
        assert got is None

    async def test_injects_kind_when_missing_from_context(self):
        mock_bridge = AsyncMock(return_value={
            "session": {
                "id": "s1",
                "seed_kind": "conflict_mediation",
                "seed_context": {"event": {"id": "e1"}},  # no 'kind' inside
            },
        })
        with patch("app.agents.triangle_inputs.bridge_get", mock_bridge):
            got = await fetch_session_seed_context("s1")
        assert got is not None
        assert got["kind"] == "conflict_mediation"
