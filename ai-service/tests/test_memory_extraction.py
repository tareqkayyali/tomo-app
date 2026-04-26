"""
Tests for Phase 3 longitudinal memory extraction wiring.

Covers:
- _should_extract() trigger logic
- save_memory_after_turn() fires background task at threshold
- update_longitudinal_memory() skips when history is too short
- update_longitudinal_memory() skips when pool is unavailable
- DB-only path (no Zep) still triggers extraction
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.memory_service import (
    _LONGITUDINAL_INTERVAL,
    _LONGITUDINAL_THRESHOLD,
    _should_extract,
    save_memory_after_turn,
    update_longitudinal_memory,
)


# ── Unit: _should_extract ──────────────────────────────────────────────────────

def test_should_extract_false_below_threshold():
    for tc in range(1, _LONGITUDINAL_THRESHOLD):
        assert not _should_extract(tc), f"should not extract at turn {tc}"


def test_should_extract_true_at_threshold():
    assert _should_extract(_LONGITUDINAL_THRESHOLD)


def test_should_extract_false_between_interval():
    # Turns between threshold and next interval should not extract
    for offset in range(1, _LONGITUDINAL_INTERVAL):
        tc = _LONGITUDINAL_THRESHOLD + offset
        assert not _should_extract(tc), f"should not extract at turn {tc}"


def test_should_extract_true_at_interval_multiples():
    # Fires at threshold, then every INTERVAL turns
    fire_points = [_LONGITUDINAL_THRESHOLD + _LONGITUDINAL_INTERVAL * i for i in range(4)]
    for tc in fire_points:
        assert _should_extract(tc), f"should extract at turn {tc}"


def test_should_extract_false_at_zero():
    assert not _should_extract(0)


# ── Unit: update_longitudinal_memory — early returns ──────────────────────────

@pytest.mark.asyncio
async def test_update_skips_when_history_too_short():
    """Fewer than 6 messages → return without calling Haiku."""
    with patch(
        "app.services.memory_service._fetch_session_history",
        new=AsyncMock(return_value=[{"role": "user", "content": "hi"}]),
    ), patch("langchain_anthropic.ChatAnthropic") as mock_llm:
        await update_longitudinal_memory("user-1", "session-1", 5)
        mock_llm.assert_not_called()


@pytest.mark.asyncio
async def test_update_skips_when_pool_unavailable():
    """No DB pool → _fetch_session_history returns [] → no extraction."""
    with patch(
        "app.services.memory_service._fetch_session_history",
        new=AsyncMock(return_value=[]),
    ), patch("langchain_anthropic.ChatAnthropic") as mock_llm:
        await update_longitudinal_memory("user-1", "session-1", 5)
        mock_llm.assert_not_called()


# ── Unit: update_longitudinal_memory — extraction path ───────────────────────

def _make_history(n_turns: int) -> list[dict]:
    history = []
    for i in range(n_turns):
        history.append({"role": "user", "content": f"User message {i}"})
        history.append({"role": "assistant", "content": f"Assistant response {i}"})
    return history


@pytest.mark.asyncio
async def test_update_calls_haiku_when_history_sufficient():
    """6+ messages → Haiku extraction is called."""
    history = _make_history(4)  # 8 messages

    mock_response = MagicMock()
    mock_response.content = '{"sessionSummary": "test session", "newGoals": [], "newConcerns": [], "resolvedConcerns": [], "injuryUpdates": [], "behavioralPatterns": [], "coachingPreferences": [], "keyMilestones": [], "lastTopics": ["strength"]}'

    mock_llm_instance = AsyncMock()
    mock_llm_instance.ainvoke = AsyncMock(return_value=mock_response)

    with (
        patch("app.services.memory_service._fetch_session_history", new=AsyncMock(return_value=history)),
        patch("app.services.memory_service._load_db_memory", new=AsyncMock(return_value=None)),
        patch("app.db.supabase.get_pool", return_value=None),
        patch("langchain_anthropic.ChatAnthropic", return_value=mock_llm_instance),
        patch("app.services.memory_service.get_settings") as mock_settings,
    ):
        mock_settings.return_value.anthropic_api_key = "test-key"
        await update_longitudinal_memory("user-1", "session-1", 5)
        mock_llm_instance.ainvoke.assert_called_once()


@pytest.mark.asyncio
async def test_update_does_not_raise_on_haiku_failure():
    """Haiku failure → warning logged, no exception propagated."""
    history = _make_history(4)

    mock_llm_instance = AsyncMock()
    mock_llm_instance.ainvoke = AsyncMock(side_effect=Exception("API error"))

    with (
        patch("app.services.memory_service._fetch_session_history", new=AsyncMock(return_value=history)),
        patch("langchain_anthropic.ChatAnthropic", return_value=mock_llm_instance),
        patch("app.services.memory_service.get_settings") as mock_settings,
    ):
        mock_settings.return_value.anthropic_api_key = "test-key"
        # Must not raise
        await update_longitudinal_memory("user-1", "session-1", 5)


# ── Unit: save_memory_after_turn — extraction trigger ────────────────────────

@pytest.mark.asyncio
async def test_save_fires_extraction_at_threshold():
    """save_memory_after_turn with turn_count==threshold creates background task."""
    with (
        patch("app.services.memory_service.get_settings") as mock_settings,
        patch("app.services.memory_service.asyncio") as mock_asyncio,
        patch("app.services.memory_service.get_zep_client") as mock_zep_factory,
    ):
        mock_settings.return_value.zep_api_key = "zep-key"
        mock_zep = AsyncMock()
        mock_zep_factory.return_value = mock_zep

        await save_memory_after_turn(
            user_id="user-1",
            session_id="session-1",
            user_message="hello",
            assistant_response="hi back",
            turn_count=_LONGITUDINAL_THRESHOLD,
        )

        mock_asyncio.create_task.assert_called_once()


@pytest.mark.asyncio
async def test_save_does_not_fire_extraction_below_threshold():
    with (
        patch("app.services.memory_service.get_settings") as mock_settings,
        patch("app.services.memory_service.asyncio") as mock_asyncio,
        patch("app.services.memory_service.get_zep_client") as mock_zep_factory,
    ):
        mock_settings.return_value.zep_api_key = "zep-key"
        mock_zep = AsyncMock()
        mock_zep_factory.return_value = mock_zep

        await save_memory_after_turn(
            user_id="user-1",
            session_id="session-1",
            user_message="hello",
            assistant_response="hi",
            turn_count=_LONGITUDINAL_THRESHOLD - 1,
        )

        mock_asyncio.create_task.assert_not_called()


@pytest.mark.asyncio
async def test_save_db_only_path_fires_extraction_at_threshold():
    """No Zep configured → extraction still fires via create_task."""
    with (
        patch("app.services.memory_service.get_settings") as mock_settings,
        patch("app.services.memory_service.asyncio") as mock_asyncio,
    ):
        mock_settings.return_value.zep_api_key = ""

        await save_memory_after_turn(
            user_id="user-1",
            session_id="session-1",
            user_message="hello",
            assistant_response="hi",
            turn_count=_LONGITUDINAL_THRESHOLD,
        )

        mock_asyncio.create_task.assert_called_once()


@pytest.mark.asyncio
async def test_save_db_only_path_no_task_below_threshold():
    """No Zep + turn below threshold → no extraction task created."""
    with (
        patch("app.services.memory_service.get_settings") as mock_settings,
        patch("app.services.memory_service.asyncio") as mock_asyncio,
    ):
        mock_settings.return_value.zep_api_key = ""

        await save_memory_after_turn(
            user_id="user-1",
            session_id="session-1",
            user_message="hello",
            assistant_response="hi",
            turn_count=3,
        )

        mock_asyncio.create_task.assert_not_called()


@pytest.mark.asyncio
async def test_save_zep_failure_still_fires_extraction():
    """Zep add_memory fails → extraction task still fires (independent)."""
    with (
        patch("app.services.memory_service.get_settings") as mock_settings,
        patch("app.services.memory_service.asyncio") as mock_asyncio,
        patch("app.services.memory_service.get_zep_client") as mock_zep_factory,
    ):
        mock_settings.return_value.zep_api_key = "zep-key"
        mock_zep = AsyncMock()
        mock_zep.add_memory = AsyncMock(side_effect=Exception("Zep down"))
        mock_zep_factory.return_value = mock_zep

        await save_memory_after_turn(
            user_id="user-1",
            session_id="session-1",
            user_message="hello",
            assistant_response="hi",
            turn_count=_LONGITUDINAL_THRESHOLD,
        )

        # Extraction still fires even though Zep failed
        mock_asyncio.create_task.assert_called_once()
