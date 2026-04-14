"""
Tomo AI Service -- Capsule Direct Pattern
$0 cost, <10ms latency. No LLM call.

Returns a structured capsule card that the mobile app renders natively.
The mobile already knows how to render checkin_capsule, navigation_capsule,
test_log_capsule, program_action_capsule, drill_rating_capsule, etc.

The capsule card tells the mobile to open the corresponding native UI
(e.g., check-in form, test logger, program browser) rather than showing
a text-based chat response.
"""

from __future__ import annotations

import json
import logging
from typing import Optional

from app.flow.registry import FlowConfig
from app.models.state import TomoChatState

logger = logging.getLogger("tomo-ai.flow.capsule_direct")


def execute_capsule_direct(config: FlowConfig, state: TomoChatState) -> dict:
    """Build a capsule response for the mobile renderer.

    Returns a state update dict with final_response and final_cards set.
    Cost: $0, latency: <1ms.

    The response structure matches what format_response_node produces
    so persist_node can save it identically.
    """
    capsule_type = config.capsule_type
    if not capsule_type:
        logger.error("capsule_direct called without capsule_type")
        return {}  # Fall through to agent pipeline

    # Build the capsule card
    capsule_card = {
        "type": capsule_type,
    }

    # Inject context from player_context when available
    context = state.get("player_context")
    if context:
        capsule_card["context"] = _build_capsule_context(capsule_type, context)

    # Build the structured response
    headline = config.headline or _default_headline(capsule_type)
    chips = config.chips or []

    structured = {
        "headline": headline,
        "body": "",
        "cards": [capsule_card],
        "chips": chips[:2],  # Max 2 chips (Pulse spec)
    }

    logger.info(
        f"Capsule direct: {capsule_type} ($0, <1ms)"
    )

    return {
        "final_response": json.dumps(structured),
        "final_cards": [capsule_card],
        # Mark pattern for telemetry
        "_flow_pattern": "capsule_direct",
        # $0 cost -- no LLM call
        "total_cost_usd": 0.0,
        "total_tokens": 0,
    }


def _build_capsule_context(capsule_type: str, context) -> dict:
    """Extract minimal context the mobile needs for capsule rendering.

    Each capsule type gets only the fields its native UI actually uses.
    Keeps the payload small for fast SSE delivery.
    """
    ctx = {}

    if capsule_type == "checkin_capsule":
        # Mobile check-in form needs to know if already checked in today
        checkin_date = getattr(context, "checkin_date", None)
        today_date = getattr(context, "today_date", None)
        ctx["already_checked_in"] = (
            checkin_date == today_date if checkin_date and today_date else False
        )
        # Include sport for sport-specific check-in questions
        ctx["sport"] = getattr(context, "sport", None)

    elif capsule_type == "navigation_capsule":
        # Navigation capsule: mobile handles tab switching
        ctx["active_tab"] = getattr(context, "active_tab", None)

    elif capsule_type == "test_log_capsule":
        # Test logger needs sport for sport-specific test options
        ctx["sport"] = getattr(context, "sport", None)
        ctx["position"] = getattr(context, "position", None)

    elif capsule_type == "program_action_capsule":
        # Program browser: sport filters
        ctx["sport"] = getattr(context, "sport", None)

    elif capsule_type == "drill_rating_capsule":
        # Drill rating: needs recent drill context
        pass  # Mobile uses its own drill state

    return ctx


def _default_headline(capsule_type: str) -> str:
    """Fallback headline when FlowConfig doesn't specify one."""
    return {
        "checkin_capsule": "Time to check in",
        "navigation_capsule": "",
        "test_log_capsule": "Log a test",
        "program_action_capsule": "Your programs",
        "program_interact_capsule": "Program details",
        "drill_rating_capsule": "Rate this drill",
        "event_edit_capsule": "Edit event",
        "cv_edit_capsule": "Update your CV",
        "club_edit_capsule": "Update your club",
        "schedule_rules_capsule": "Schedule settings",
    }.get(capsule_type, "")
