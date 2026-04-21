"""
Tests for app/services/notification_escalator.py.

Verifies the subtle-notification invariant for AI chat escalations:
  - Only `pain` and `red_block` safety-gate rules escalate to a push
  - `load`, `yellow_block`, unknown rules stay silent (in-chat only)
  - Missing athlete_id short-circuits
  - Escalation failures NEVER surface (fire-and-forget)
"""

from __future__ import annotations

import asyncio
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest

from app.services.notification_escalator import (
    _ESCALATING_RULES,
    escalate_safety_block,
)


ATHLETE = "11111111-1111-1111-1111-111111111111"


def _run(coro):
    """Run an async test body on a fresh event loop so create_task works."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


async def _await_tasks():
    """Yield so any fire-and-forget tasks in the current loop complete."""
    # One loop iteration is enough because _escalate awaits exactly one I/O call.
    await asyncio.sleep(0)
    await asyncio.sleep(0)


def test_pain_rule_escalates():
    bridge_mock = AsyncMock(return_value={"ok": True})

    async def body():
        with patch(
            "app.services.notification_escalator.bridge_post", bridge_mock
        ):
            escalate_safety_block(ATHLETE, "pain", "Let's rest today", "build_session")
            await _await_tasks()

    _run(body())

    assert bridge_mock.await_count == 1
    call = bridge_mock.await_args
    # First positional arg is the path
    assert call.args[0] == "/api/v1/events/ingest"
    body_arg = call.args[1]
    assert body_arg["event_type"] == "INJURY_FLAG"
    assert body_arg["athlete_id"] == ATHLETE
    assert body_arg["source"] == "AI_CHAT"


def test_red_block_rule_escalates():
    bridge_mock = AsyncMock(return_value={"ok": True})

    async def body():
        with patch(
            "app.services.notification_escalator.bridge_post", bridge_mock
        ):
            escalate_safety_block(ATHLETE, "red_block", "Try light today", "plan_training")
            await _await_tasks()

    _run(body())

    assert bridge_mock.await_count == 1
    body_arg = bridge_mock.await_args.args[1]
    assert body_arg["event_type"] == "TRIANGLE_FLAG"


@pytest.mark.parametrize("rule", ["load", "yellow_block", "unknown", ""])
def test_non_critical_rules_do_not_escalate(rule):
    bridge_mock = AsyncMock(return_value={"ok": True})

    async def body():
        with patch(
            "app.services.notification_escalator.bridge_post", bridge_mock
        ):
            escalate_safety_block(ATHLETE, rule, "some msg", "build_session")
            await _await_tasks()

    _run(body())

    bridge_mock.assert_not_awaited()


def test_missing_athlete_id_short_circuits():
    bridge_mock = AsyncMock(return_value={"ok": True})

    async def body():
        with patch(
            "app.services.notification_escalator.bridge_post", bridge_mock
        ):
            escalate_safety_block(None, "pain", "msg", "build_session")
            escalate_safety_block("", "pain", "msg", "build_session")
            await _await_tasks()

    _run(body())

    bridge_mock.assert_not_awaited()


def test_bridge_failure_is_swallowed():
    bridge_mock = AsyncMock(side_effect=RuntimeError("bridge down"))

    async def body():
        with patch(
            "app.services.notification_escalator.bridge_post", bridge_mock
        ):
            # Must not raise — the test passing IS the assertion.
            escalate_safety_block(ATHLETE, "pain", "msg", None)
            await _await_tasks()

    _run(body())
    # bridge was called once; the error was caught by _escalate's try/except
    assert bridge_mock.await_count == 1


def test_escalating_rules_set_is_canonical():
    # Regression guard — the set of escalating rules should remain tight.
    # If a future change widens this, the author must update the feedback
    # memory (subtle notifications) so the invariant stays explicit.
    assert _ESCALATING_RULES == {"pain", "red_block"}
