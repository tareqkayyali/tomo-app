"""
Notification Escalator — Python → TS bridge for chat safety events.

When the safety gate blocks a training-intent message because the athlete
reported pain, injury, or is in RED readiness, this module fires a
notification through the TS event pipeline:

    Python safety_gate  →  bridge_post("/api/v1/events/ingest", ...)
      →  TS emitEvent (INJURY_FLAG / WELLNESS_CHECKIN)
        →  eventProcessor / processDataEvent
          →  notificationEngine.createNotification
            →  pushDelivery (category=critical, bypasses quiet hours)

Fire-and-forget: the chat response is NEVER blocked by this path.
Fails silently — if the bridge is unreachable the chat flow still works.

Subtle-defaults rule: only genuinely critical rules (pain, red_block)
escalate to a push. Load/yellow-readiness blocks stay in-chat only —
the athlete already sees the block message, no need to push about it.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Optional

from app.agents.tools.bridge import bridge_post

logger = logging.getLogger("tomo-ai.notification_escalator")

# Only these safety-gate rules produce an athlete notification.
# `load` and `yellow_block` are advisory — in-chat block message is enough.
_ESCALATING_RULES = {"pain", "red_block"}


async def _escalate(athlete_id: str, rule: str, block_message: str, intent_id: Optional[str]) -> None:
    """Actual escalation body — runs in a detached task."""
    try:
        if rule == "pain":
            # Uses the existing INJURY_FLAG → handleInjuryFlagNotif → INJURY_RISK_FLAG
            # template path. category=critical, P1, bypasses quiet hours.
            await bridge_post(
                "/api/v1/events/ingest",
                {
                    "athlete_id": athlete_id,
                    "event_type": "INJURY_FLAG",
                    "occurred_at": _now_iso(),
                    "source": "AI_CHAT",
                    "payload": {
                        "location": "body",
                        "source_intent": intent_id or "chat",
                        "detected_by": "ai_safety_gate",
                        "excerpt": block_message[:140],
                    },
                },
                user_id=athlete_id,
            )
        elif rule == "red_block":
            # RED readiness already triggers WELLNESS_CRITICAL via the normal
            # wellness-checkin path. Here we just nudge via a soft event so
            # the athlete gets a coaching follow-up if they hadn't checked in
            # today. We use TRIANGLE_FLAG (triangle alignment change) because
            # it's lightweight; a dedicated type can be added later.
            await bridge_post(
                "/api/v1/events/ingest",
                {
                    "athlete_id": athlete_id,
                    "event_type": "TRIANGLE_FLAG",
                    "occurred_at": _now_iso(),
                    "source": "AI_CHAT",
                    "payload": {
                        "reason": "red_readiness_blocked_training_request",
                        "source_intent": intent_id or "chat",
                        "excerpt": block_message[:140],
                    },
                },
                user_id=athlete_id,
            )
        logger.info(
            f"notification_escalator: escalated rule={rule} athlete={athlete_id[:8]}..."
        )
    except Exception as e:
        # Never let escalation failures affect the user's chat experience
        logger.warning(f"notification_escalator: failed rule={rule}: {e}")


def escalate_safety_block(
    athlete_id: Optional[str],
    rule: str,
    block_message: str,
    intent_id: Optional[str] = None,
) -> None:
    """Fire-and-forget escalation. Returns immediately.

    Called from the chat flow right after a blocking safety verdict.
    Does NOT await — chat response must not be delayed by network I/O.
    """
    if not athlete_id or rule not in _ESCALATING_RULES:
        return
    try:
        asyncio.create_task(_escalate(athlete_id, rule, block_message, intent_id))
    except RuntimeError:
        # No running loop (e.g. called from sync context) — skip silently.
        logger.debug("notification_escalator: no running loop, skipping")


def _now_iso() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()
