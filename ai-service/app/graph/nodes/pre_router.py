"""
Tomo AI Service — Pre-Router Node
Bridges the 3-layer intent classifier and 5-way agent router into a LangGraph node.

Flow:
  1. Extract user message from state
  2. Run classify_intent() (exact match → Haiku → fallthrough)
  3. Run route_to_agents() for agent selection
  4. Set route_decision (capsule | ai), selected_agent, routing_confidence

If intent is a capsule direct action → short-circuit to capsule_handler.
If intent is fallthrough → route to appropriate agent subgraph.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone as tz
from typing import Optional

from app.models.state import TomoChatState
from app.agents.intent_classifier import (
    classify_intent,
    ClassificationResult,
    ConversationState,
)
from app.agents.intent_registry import CAPSULE_DIRECT_ACTIONS, CAPSULE_GATED_ACTIONS
from app.agents.router import route_to_agents, should_keep_agent_lock

logger = logging.getLogger("tomo-ai.pre_router")


# ── RED Risk Safety Gate ─────────────────────────────────────────────

def _check_red_risk_gate(context) -> Optional[dict]:
    """
    Hard safety gate: detect RED risk conditions that require forced recovery routing.

    Fires BEFORE intent classification so athletes cannot "talk around" safety.
    Does NOT block conversation — forces recovery-constrained mode via the output agent.

    Gates:
      1. injury_risk_flag == RED
      2. ACWR > 1.5 (danger zone)
      3. Stale check-in (>24h) + elevated ACWR (>1.3)
    """
    if not context or not hasattr(context, "snapshot_enrichment"):
        return None

    # Gate 0 (S1 fix): No snapshot data at all — cold start, never checked in
    # Conservative default: force recovery rather than allowing unrestricted access
    if not context.snapshot_enrichment:
        logger.warning("RED RISK GATE: No snapshot_enrichment (cold start). Forcing recovery mode.")
        return {
            "reason": "no_reliable_readiness_data (cold start — no snapshot)",
            "forced_mode": "recovery",
            "checkin_stale": True,
            "hours_since_checkin": None,
            "acwr": None,
            "injury_risk_flag": None,
            "ccrs_recommendation": None,
            "ccrs_score": None,
            "ccrs_confidence": None,
        }

    se = context.snapshot_enrichment
    reasons: list[str] = []

    # Gate 1: Injury risk flag is RED
    if se.injury_risk_flag and se.injury_risk_flag.upper() == "RED":
        reasons.append("injury_risk_flag=RED")

    # Gate 2+3: ACWR-based gates REMOVED (Apr 2026)
    # ACWR excluded from safety enforcement — academic load was inflating
    # ACWR to RED without heavy training. CCRS gates (4+5) are the authority.
    checkin_stale = False
    hours_since_checkin: Optional[float] = None
    if se.last_checkin_at:
        try:
            last_checkin = datetime.fromisoformat(
                se.last_checkin_at.replace("Z", "+00:00")
            )
            hours_since_checkin = (
                datetime.now(tz.utc) - last_checkin
            ).total_seconds() / 3600
            if hours_since_checkin > 24:
                checkin_stale = True
        except Exception:
            pass

    # Gate 4: CCRS recommendation is "blocked" or "recovery"
    ccrs_rec = getattr(se, "ccrs_recommendation", None)
    if ccrs_rec in ("blocked", "recovery"):
        ccrs_score = getattr(se, "ccrs", None)
        reasons.append(f"CCRS={ccrs_score} recommendation={ccrs_rec}")

    # Gate 5: CCRS alert flags include critical flags
    ccrs_flags = getattr(se, "ccrs_alert_flags", []) or []
    critical_flags = [f for f in ccrs_flags if f in ("ACWR_BLOCKED", "HRV_SUPPRESSED", "SLEEP_DEFICIT")]
    if critical_flags and "CCRS" not in " ".join(reasons):
        reasons.append(f"CCRS flags: {', '.join(critical_flags)}")

    # Gate 6 (S1 fix): CCRS absent or low-confidence + stale data = no reliable readiness
    ccrs_confidence = getattr(se, "ccrs_confidence", None)
    data_freshness = getattr(se, "data_freshness", None)
    ccrs_score = getattr(se, "ccrs", None)

    ccrs_untrusted = ccrs_confidence in (None, "low", "estimated") or ccrs_score is None
    data_stale = data_freshness in (None, "STALE", "UNKNOWN") or checkin_stale

    if ccrs_untrusted and data_stale and not reasons:
        reasons.append(
            f"no_reliable_readiness_data (ccrs_confidence={ccrs_confidence}, "
            f"data_freshness={data_freshness}, checkin_stale={checkin_stale})"
        )
        logger.warning(f"RED RISK GATE: CCRS unreliable + stale data → forcing recovery")

    if not reasons:
        return None

    return {
        "reason": "; ".join(reasons),
        "forced_mode": "recovery",
        "checkin_stale": checkin_stale,
        "hours_since_checkin": hours_since_checkin,
        "acwr": se.acwr,
        "injury_risk_flag": se.injury_risk_flag,
        "ccrs_recommendation": ccrs_rec,
        "ccrs_score": getattr(se, "ccrs", None),
        "ccrs_confidence": getattr(se, "ccrs_confidence", None),
    }


# ── Dual-Load Observability ──────────────────────────────────────────

def _check_dual_load_active(context) -> Optional[str]:
    """
    Check if dual academic + physical load is active.
    Observability-only: logs for LangSmith visibility, no routing change.
    """
    if not context:
        return None

    signals: list[str] = []
    se = context.snapshot_enrichment if hasattr(context, "snapshot_enrichment") else None

    if se and se.dual_load_index is not None and se.dual_load_index >= 60:
        signals.append(f"DLI={se.dual_load_index:.0f}")
    if hasattr(context, "upcoming_exams") and context.upcoming_exams:
        signals.append(f"{len(context.upcoming_exams)} exams in 14d")
    if (
        hasattr(context, "readiness_components")
        and context.readiness_components
        and context.readiness_components.academic_stress is not None
        and context.readiness_components.academic_stress >= 4
    ):
        signals.append(
            f"academic_stress={context.readiness_components.academic_stress}/5"
        )

    return "; ".join(signals) if signals else None


async def pre_router_node(state: TomoChatState) -> dict:
    """
    Pre-router node: classifies intent + routes to agent.

    Updates state with:
      - route_decision: "capsule" | "ai"
      - capsule_type: intent capsule type (if capsule)
      - selected_agent: primary agent type
      - routing_confidence: 0.0-1.0
    """
    t0 = time.monotonic()
    context = state.get("player_context")

    if not context:
        logger.error("pre_router_node: no player_context in state")
        return {
            "route_decision": "ai",
            "selected_agent": "output",
            "routing_confidence": 0.0,
            "classification_layer": "error",
            "intent_id": "unknown",
        }

    # ── RED RISK SAFETY GATE (hard enforcement) ──────────────────
    # Fires BEFORE intent classification. If athlete is in RED injury risk,
    # danger-zone ACWR, or has stale data + elevated load, force recovery mode.
    safety_override = _check_red_risk_gate(context)
    if safety_override:
        elapsed = (time.monotonic() - t0) * 1000
        logger.warning(
            f"RED RISK GATE TRIGGERED: {safety_override['reason']} ({elapsed:.0f}ms)"
        )
        return {
            "route_decision": "ai",
            "selected_agent": "output",
            "routing_confidence": 1.0,
            "classification_layer": "safety_gate",
            "intent_id": "red_risk_override",
            "_safety_override": safety_override,
        }

    # ── Dual-load observability ──────────────────────────────────
    dual_load_status = _check_dual_load_active(context)
    if dual_load_status:
        logger.info(f"Dual-load active: {dual_load_status}")

    # Extract user message from state messages
    messages = state.get("messages", [])
    user_message = ""
    for msg in reversed(messages):
        if hasattr(msg, "type") and msg.type == "human":
            user_message = msg.content if isinstance(msg.content, str) else str(msg.content)
            break

    if not user_message:
        return {
            "route_decision": "ai",
            "selected_agent": "output",
            "routing_confidence": 0.0,
            "classification_layer": "error",
            "intent_id": "unknown",
        }

    # Build conversation state from loaded history for classifier context
    conv_state = ConversationState()
    if len(messages) > 1:
        # Extract current_topic from last user message (for follow-up detection)
        for msg in reversed(messages[:-1]):
            if hasattr(msg, "type") and msg.type == "human":
                conv_state.current_topic = msg.content[:200]
                break
        # Extract last_action from last assistant response
        for msg in reversed(messages[:-1]):
            if hasattr(msg, "type") and msg.type == "ai":
                content_lower = msg.content[:300].lower()
                for action_kw in ("created", "logged", "confirmed", "updated", "scheduled"):
                    if action_kw in content_lower:
                        conv_state.last_action = action_kw
                        break
                break

    # Check agent lock (conversation continuity)
    last_agent = state.get("selected_agent")
    if last_agent and should_keep_agent_lock(user_message, last_agent, None):
        elapsed = (time.monotonic() - t0) * 1000
        logger.info(f"Agent lock kept: {last_agent} ({elapsed:.0f}ms)")
        return {
            "route_decision": "ai",
            "selected_agent": last_agent,
            "routing_confidence": 0.85,
            "classification_layer": "agent_lock",
            "intent_id": "agent_lock",
        }

    # Run 3-layer intent classifier
    classification: ClassificationResult = await classify_intent(
        user_message, conv_state, context
    )

    # Determine if this is a capsule action or needs full AI
    #
    # IMPORTANT: Capsule fast-path is DISABLED until format_response supports
    # capsule-specific response generation. Currently, the capsule path skips
    # agent_dispatch which means no agent_response is produced — format_response
    # falls to the empty-response handler ("I'm here to help") which is broken.
    # All intents route through AI for proper tool execution + LLM generation.
    # Capsule routing will be re-enabled when Phase 6 adds deterministic
    # response builders for each capsule type.
    is_capsule = False
    capsule_type = classification.capsule_type  # Preserve for telemetry/future use

    # Run 5-way agent router
    active_tab = state.get("active_tab", "Chat")
    agents = route_to_agents(user_message, active_tab, last_agent)
    primary_agent = agents[0] if agents else "output"
    secondary_agents = agents[1:] if len(agents) > 1 else []

    # Use classifier's agent_type if high confidence, else use router's
    if classification.confidence >= 0.8 and classification.agent_type:
        primary_agent = classification.agent_type

    elapsed = (time.monotonic() - t0) * 1000
    logger.info(
        f"Pre-router: intent={classification.intent_id} "
        f"(layer={classification.classification_layer}, conf={classification.confidence:.2f}) "
        f"→ agent={primary_agent} "
        f"{'CAPSULE' if is_capsule else 'AI'} "
        f"({elapsed:.0f}ms)"
    )

    result = {
        "route_decision": "capsule" if is_capsule else "ai",
        "capsule_type": capsule_type,
        "selected_agent": primary_agent,
        "routing_confidence": classification.confidence,
        "classification_layer": classification.classification_layer,
        "intent_id": classification.intent_id,
    }

    # Store secondary agents for multi-agent tool merging
    if secondary_agents:
        result["_secondary_agents"] = secondary_agents

    return result
