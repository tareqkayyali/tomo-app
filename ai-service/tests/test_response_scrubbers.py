"""
Tests for the deterministic post-generation scrubbers in format_response.py.

These exist as a safety net behind the system prompt: even if the LLM ignores
the "no internal taxonomy" rule, these scrubbers catch the leak before the
response reaches the athlete.

Covers:
  - _translate_percentile_codes: P1/P50/P99 -> plain peer bands
  - _translate_layer_scores:     "Physical 64/100" -> "your physical conditioning is..."
  - _pulse_post_process body scrubs (CCRS, percentile codes, layer scores)
  - _pulse_post_process stat_grid drops (4-layer score chips, CCRS chips)
"""

from __future__ import annotations

import pytest

from app.graph.nodes.format_response import (
    _percentile_band,
    _pulse_post_process,
    _translate_layer_scores,
    _translate_percentile_codes,
)


# ── _percentile_band ──────────────────────────────────────────────────────────

@pytest.mark.parametrize(
    "p,expected_substring",
    [
        (99, "elite"),
        (95, "elite"),
        (90, "top quarter"),
        (75, "top quarter"),
        (60, "above peer"),
        (50, "above peer"),
        (30, "around peer"),
        (15, "below peer"),
        (1, "well below"),
    ],
)
def test_percentile_band(p, expected_substring):
    assert expected_substring in _percentile_band(p)


# ── _translate_percentile_codes ───────────────────────────────────────────────

def test_translate_p1_to_p50_phrase():
    out = _translate_percentile_codes("moves you from P1 to P50+")
    assert "P1" not in out
    assert "P50" not in out
    assert "well below peer average" in out
    assert "above peer average or higher" in out


def test_translate_p99_inline_value():
    out = _translate_percentile_codes("4.0s — P99")
    assert "P99" not in out
    assert "elite for your age" in out


def test_translate_p50_in_parens():
    out = _translate_percentile_codes("1.75s (P50)")
    assert "P50" not in out
    assert "above peer average" in out


def test_translate_does_not_touch_non_percentile_p_words():
    """Words like 'PR', 'PB', or 'pH' must not match — only \\bP\\d codes."""
    out = _translate_percentile_codes("New PR set last week, pH was fine")
    assert out == "New PR set last week, pH was fine"


def test_translate_handles_empty_string():
    assert _translate_percentile_codes("") == ""
    assert _translate_percentile_codes(None) is None


# ── _translate_layer_scores ───────────────────────────────────────────────────

def test_translate_physical_score():
    out = _translate_layer_scores("Your Physical: 64/100")
    assert "64/100" not in out
    assert "physical conditioning" in out
    assert "tracking well" in out


def test_translate_zero_layer_reads_as_unmeasured():
    """A layer at 0/100 must NEVER read as 'failure' — it means we haven't
    measured it yet, so the language must reflect that."""
    out = _translate_layer_scores("Technical Layer 0/100, Tactical 0/100")
    assert "0/100" not in out
    assert "haven't measured" in out


def test_translate_high_score_reads_as_strength():
    out = _translate_layer_scores("mental layer is 85/100")
    assert "85/100" not in out
    assert "real strength" in out


def test_translate_does_not_touch_non_layer_scores():
    out = _translate_layer_scores("Score on the test: 80/100")
    assert "80/100" in out  # unchanged — not a layer name


# ── _pulse_post_process: stat_grid drops ──────────────────────────────────────

def _post(structured: dict) -> dict:
    """Run the scrubber and return the post-processed structure."""
    return _pulse_post_process(structured, state=None)


def test_drops_physical_layer_score_chip():
    """The flagship Phase 2 leak: PHYSICAL LAYER 64/100 chip must vanish."""
    out = _post({
        "headline": "Test",
        "body": "Body text.",
        "cards": [{
            "type": "stat_grid",
            "items": [
                {"label": "PHYSICAL LAYER", "value": "64/100"},
                {"label": "TECHNICAL L", "value": "0/100"},
                {"label": "TACTICAL LA", "value": "0/100"},
                {"label": "MENTAL LAYE", "value": "0/100"},
            ],
        }],
        "chips": [],
    })
    items = out["cards"][0]["items"]
    # All 4 layer chips must be dropped — they leak internal taxonomy
    assert len(items) == 0


def test_drops_layer_chip_even_when_label_lowercase():
    out = _post({
        "headline": "X", "body": "y",
        "cards": [{
            "type": "stat_grid",
            "items": [
                {"label": "Physical", "value": "72/100"},
                {"label": "Mental", "value": "55/100"},
                {"label": "Vertical Jump", "value": "37.8 cm"},  # legitimate, keep
            ],
        }],
        "chips": [],
    })
    items = out["cards"][0]["items"]
    assert len(items) == 1
    assert items[0]["label"] == "Vertical Jump"


def test_drops_ccrs_chip():
    out = _post({
        "headline": "X", "body": "y",
        "cards": [{
            "type": "stat_grid",
            "items": [
                {"label": "CCRS", "value": "72"},
                {"label": "Sprint Time", "value": "4.2s"},
            ],
        }],
        "chips": [],
    })
    items = out["cards"][0]["items"]
    assert len(items) == 1
    assert items[0]["label"] == "Sprint Time"


def test_translates_percentile_in_chip_value():
    """Stat values like '4.0s — P99' must translate inline."""
    out = _post({
        "headline": "X", "body": "y",
        "cards": [{
            "type": "stat_grid",
            "items": [
                {"label": "T-Test Agility", "value": "4.0s — P99"},
                {"label": "10m Sprint", "value": "2.1s — P1"},
            ],
        }],
        "chips": [],
    })
    items = out["cards"][0]["items"]
    assert len(items) == 2
    assert "P99" not in items[0]["value"]
    assert "elite" in items[0]["value"]
    assert "P1" not in items[1]["value"]
    assert "well below" in items[1]["value"]


# ── _pulse_post_process: body scrubs ──────────────────────────────────────────

def test_body_scrubs_ccrs():
    out = _post({
        "headline": "X",
        "body": "Your CCRS is 72 today. CCRS trending up.",
        "cards": [],
        "chips": [],
    })
    assert "CCRS" not in out["body"]
    assert "readiness" in out["body"].lower()


def test_body_scrubs_percentile_codes():
    out = _post({
        "headline": "X",
        "body": "This work moves you from P1 to P50+.",
        "cards": [],
        "chips": [],
    })
    assert "P1" not in out["body"]
    assert "P50" not in out["body"]
    assert "well below peer average" in out["body"]


def test_body_scrubs_layer_scores():
    out = _post({
        "headline": "X",
        "body": "Physical: 64/100, Technical Layer 0/100.",
        "cards": [],
        "chips": [],
    })
    assert "64/100" not in out["body"]
    assert "0/100" not in out["body"]
    assert "physical conditioning" in out["body"]


def test_body_acwr_still_scrubbed_unchanged_behavior():
    """Existing ACWR scrub must still work — regression guard."""
    out = _post({
        "headline": "X",
        "body": "Your ACWR is 1.8 — that's high.",
        "cards": [],
        "chips": [],
    })
    assert "ACWR" not in out["body"]
