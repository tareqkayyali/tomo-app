"""
Tests for the scheduling_capsule pattern.

Covers:
  1. Extraction helpers (date, focus, intensity, time)
  2. Registry routing (build_session / plan_training -> scheduling_capsule)
  3. Integration: parallel pre-fetch with mocked bridge_get
  4. Feature flag: disabled -> falls through to multi_step
  5. Card assembly shape contract
"""

import asyncio
import json
import pytest
from unittest.mock import AsyncMock, patch, MagicMock


# ── 1. Extraction helpers ──────────────────────────────────────────

class TestExtractDate:
    """_extract_date parses natural-language date references."""

    def _extract(self, msg: str, today: str = "2026-04-15") -> str | None:
        from app.flow.patterns.scheduling_capsule import _extract_date
        state = {"messages": [MagicMock()]}
        # Mock get_msg_type / get_msg_content so _get_user_message returns msg
        with patch("app.flow.patterns.scheduling_capsule._get_user_message", return_value=msg):
            return _extract_date(state, today)

    def test_today(self):
        assert self._extract("build me a session today") == "2026-04-15"

    def test_tomorrow(self):
        assert self._extract("session tomorrow") == "2026-04-16"

    def test_tmrw(self):
        assert self._extract("sprint tmrw") == "2026-04-16"

    def test_day_after_tomorrow(self):
        assert self._extract("day after tomorrow") == "2026-04-17"

    def test_in_3_days(self):
        assert self._extract("in 3 days") == "2026-04-18"

    def test_next_week(self):
        assert self._extract("next week session") == "2026-04-22"

    def test_weekday_name(self):
        # 2026-04-15 is a Wednesday; "friday" should be 2026-04-17
        assert self._extract("friday session") == "2026-04-17"

    def test_no_date(self):
        assert self._extract("build me a session") is None


class TestExtractFocus:
    """_extract_focus maps synonyms to canonical focus IDs."""

    def _extract(self, msg: str) -> str | None:
        from app.flow.patterns.scheduling_capsule import _extract_focus
        return _extract_focus(msg)

    def test_sprint(self):
        assert self._extract("sprint session tomorrow") == "speed"

    def test_gym(self):
        assert self._extract("gym session") == "strength"

    def test_technical(self):
        assert self._extract("technical drills") == "technical"

    def test_recovery(self):
        assert self._extract("recovery session") == "recovery"

    def test_none(self):
        assert self._extract("build me a session") is None


class TestInferIntensity:
    """_infer_intensity defaults based on message keywords or focus."""

    def _infer(self, msg: str, focus: str | None = None) -> str:
        from app.flow.patterns.scheduling_capsule import _infer_intensity
        return _infer_intensity(msg, focus)

    def test_hard_keyword(self):
        assert self._infer("hard session tomorrow") == "HARD"

    def test_light_keyword(self):
        assert self._infer("easy recovery") == "LIGHT"

    def test_moderate_keyword(self):
        assert self._infer("tempo run") == "MODERATE"

    def test_focus_strength(self):
        assert self._infer("session tomorrow", "strength") == "HARD"

    def test_focus_recovery(self):
        assert self._infer("session tomorrow", "recovery") == "LIGHT"

    def test_default(self):
        assert self._infer("session tomorrow", None) == "MODERATE"


# ── 2. Registry routing ────────────────────────────────────────────

class TestRegistryRouting:
    """build_session and plan_training route to scheduling_capsule pattern."""

    def test_build_session_pattern(self):
        from app.flow.registry import get_flow_config
        config = get_flow_config("build_session")
        assert config is not None
        assert config.pattern == "scheduling_capsule"
        assert config.steps is not None  # fallback steps preserved

    def test_plan_training_pattern(self):
        from app.flow.registry import get_flow_config
        config = get_flow_config("plan_training")
        assert config is not None
        assert config.pattern == "scheduling_capsule"


# ── 3. Integration: parallel pre-fetch ─────────────────────────────

class TestParallelPreFetch:
    """_fetch_days_parallel calls bridge_get for each date in parallel."""

    def _make_slot_response(self, date: str) -> dict:
        return {
            "existingEvents": [
                {
                    "name": "School",
                    "startTime": "8:00 AM",
                    "endTime": "3:00 PM",
                    "type": "school",
                }
            ],
            "slots": [
                {
                    "startTime24": "16:00",
                    "endTime24": "17:00",
                    "start": "4:00 PM",
                    "end": "5:00 PM",
                    "score": 85,
                },
                {
                    "startTime24": "18:00",
                    "endTime24": "19:00",
                    "start": "6:00 PM",
                    "end": "7:00 PM",
                    "score": 72,
                },
            ],
        }

    @pytest.mark.asyncio
    async def test_fetches_all_dates(self):
        """Pre-fetch should call bridge_get once per date."""
        from app.flow.patterns.scheduling_capsule import _fetch_days_parallel

        mock_bridge = AsyncMock(side_effect=lambda *a, **kw: self._make_slot_response(""))

        with patch("app.agents.tools.bridge.bridge_get", mock_bridge):
            days = await _fetch_days_parallel(
                user_id="test-user",
                dates=["2026-04-15", "2026-04-16", "2026-04-17"],
                timezone="UTC",
                today="2026-04-15",
            )

        assert len(days) == 3
        assert mock_bridge.call_count == 3

    @pytest.mark.asyncio
    async def test_day_structure(self):
        """Each day in the result has the required fields."""
        from app.flow.patterns.scheduling_capsule import _fetch_days_parallel

        mock_bridge = AsyncMock(return_value=self._make_slot_response(""))

        with patch("app.agents.tools.bridge.bridge_get", mock_bridge):
            days = await _fetch_days_parallel(
                user_id="test-user",
                dates=["2026-04-15"],
                timezone="UTC",
                today="2026-04-15",
            )

        assert len(days) == 1
        day = days[0]
        assert day["date"] == "2026-04-15"
        assert day["label"] == "Today"
        assert "existingEvents" in day
        assert "availableSlots" in day
        assert len(day["existingEvents"]) == 1
        assert len(day["availableSlots"]) == 2

    @pytest.mark.asyncio
    async def test_graceful_degradation(self):
        """If bridge_get fails for one date, that date is skipped, others succeed."""
        from app.flow.patterns.scheduling_capsule import _fetch_days_parallel

        call_count = 0

        async def side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 2:
                raise ConnectionError("Network error")
            return self._make_slot_response("")

        mock_bridge = AsyncMock(side_effect=side_effect)

        with patch("app.agents.tools.bridge.bridge_get", mock_bridge):
            days = await _fetch_days_parallel(
                user_id="test-user",
                dates=["2026-04-15", "2026-04-16", "2026-04-17"],
                timezone="UTC",
                today="2026-04-15",
            )

        # 2 out of 3 succeed (the one that raised is gracefully handled)
        assert len(days) >= 2
        assert mock_bridge.call_count == 3


# ── 4. Full execute_scheduling_capsule card shape ──────────────────

class TestExecuteSchedulingCapsule:
    """End-to-end test of the capsule builder."""

    def _make_state(self, msg: str = "Build me a sprint session tomorrow at 5pm"):
        human_msg = MagicMock()
        return {
            "messages": [human_msg],
            "player_context": MagicMock(
                timezone="Europe/London",
                today_date="2026-04-15",
                sport="football",
                snapshot_enrichment=MagicMock(readiness_rag="GREEN"),
            ),
            "user_id": "test-user",
            "session_id": "test-session",
            "intent_id": "build_session",
        }

    @pytest.mark.asyncio
    async def test_card_shape(self):
        """Capsule result has the correct structure for mobile rendering."""
        from app.flow.patterns.scheduling_capsule import execute_scheduling_capsule
        from app.flow.registry import get_flow_config

        config = get_flow_config("build_session")
        state = self._make_state()

        mock_bridge = AsyncMock(return_value={
            "existingEvents": [],
            "slots": [
                {"startTime24": "17:00", "endTime24": "18:00", "start": "5:00 PM", "end": "6:00 PM", "score": 90},
            ],
        })

        with patch("app.agents.tools.bridge.bridge_get", mock_bridge), \
             patch("app.flow.patterns.scheduling_capsule._get_user_message",
                   return_value="Build me a sprint session tomorrow at 5pm"):
            result = await execute_scheduling_capsule(config, state)

        # Verify top-level keys
        assert result["_flow_pattern"] == "scheduling_capsule"
        assert result["route_decision"] == "flow_handled"
        assert result["total_cost_usd"] == 0.0

        # Verify card
        cards = result["final_cards"]
        assert len(cards) == 1
        card = cards[0]
        assert card["type"] == "scheduling_capsule"

        ctx = card["context"]
        assert ctx["prefilledFocus"] == "speed"  # "sprint" -> "speed"
        assert ctx["prefilledDate"] == "2026-04-16"  # "tomorrow"
        assert ctx["prefilledTime"] == "17:00"  # "at 5pm"
        assert ctx["prefilledIntensity"] == "HARD"  # speed -> HARD
        assert ctx["prefilledTitle"] == "Speed Session"
        assert ctx["sport"] == "football"
        assert ctx["readinessLevel"] == "GREEN"
        assert len(ctx["days"]) == 5
        assert len(ctx["focusOptions"]) == 6
        assert len(ctx["intensityOptions"]) == 3

        # Verify JSON-encoded final_response
        structured = json.loads(result["final_response"])
        assert "headline" in structured
        assert "cards" in structured
        assert structured["chips"] == []

    @pytest.mark.asyncio
    async def test_no_prefilled_values(self):
        """When opener has no hints, prefilled fields are None/default."""
        from app.flow.patterns.scheduling_capsule import execute_scheduling_capsule
        from app.flow.registry import get_flow_config

        config = get_flow_config("build_session")
        state = self._make_state("build me a session")

        mock_bridge = AsyncMock(return_value={
            "existingEvents": [],
            "slots": [],
        })

        with patch("app.agents.tools.bridge.bridge_get", mock_bridge), \
             patch("app.flow.patterns.scheduling_capsule._get_user_message",
                   return_value="build me a session"):
            result = await execute_scheduling_capsule(config, state)

        ctx = result["final_cards"][0]["context"]
        assert ctx["prefilledFocus"] is None
        assert ctx["prefilledDate"] is None
        assert ctx["prefilledTime"] is None
        assert ctx["prefilledIntensity"] == "MODERATE"
        assert ctx["prefilledTitle"] == "Training Session"


# ── 5. Feature flag test ───────────────────────────────────────────

class TestFeatureFlag:
    """is_scheduling_capsule_enabled() controls routing in controller."""

    def test_flag_defaults_false_when_unset(self):
        """Default is false when env var is not set."""
        import os
        from app.flow.patterns.scheduling_capsule import is_scheduling_capsule_enabled
        old = os.environ.pop("SCHEDULING_CAPSULE_ENABLED", None)
        try:
            assert is_scheduling_capsule_enabled() is False
        finally:
            if old is not None:
                os.environ["SCHEDULING_CAPSULE_ENABLED"] = old

    def test_flag_reads_env_at_runtime(self):
        """Flag reads os.environ on every call, not cached at import."""
        import os
        from app.flow.patterns.scheduling_capsule import is_scheduling_capsule_enabled
        old = os.environ.get("SCHEDULING_CAPSULE_ENABLED")
        try:
            os.environ["SCHEDULING_CAPSULE_ENABLED"] = "true"
            assert is_scheduling_capsule_enabled() is True
            os.environ["SCHEDULING_CAPSULE_ENABLED"] = "false"
            assert is_scheduling_capsule_enabled() is False
        finally:
            if old is None:
                os.environ.pop("SCHEDULING_CAPSULE_ENABLED", None)
            else:
                os.environ["SCHEDULING_CAPSULE_ENABLED"] = old


# ── 6. Day label helpers ───────────────────────────────────────────

class TestDayLabels:
    """_day_label produces human-friendly labels."""

    def test_today(self):
        from app.flow.patterns.scheduling_capsule import _day_label
        assert _day_label("2026-04-15", "2026-04-15") == "Today"

    def test_tomorrow(self):
        from app.flow.patterns.scheduling_capsule import _day_label
        assert _day_label("2026-04-16", "2026-04-15") == "Tomorrow"

    def test_weekday(self):
        from app.flow.patterns.scheduling_capsule import _day_label
        # 2026-04-17 is a Friday
        assert _day_label("2026-04-17", "2026-04-15") == "Friday"
