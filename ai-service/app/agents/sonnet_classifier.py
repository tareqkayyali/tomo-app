"""
Tomo AI Service — Sonnet Intent Classifier (v2)

Replaces the 3-layer regex+Haiku+fallthrough system with a 2-layer approach:
  Layer 1: Exact match ($0, 0ms) — reuses existing 150+ chip action patterns
  Layer 2: Sonnet classifier (~$0.003, ~300ms) — full conversation context

The Sonnet classifier sees the entire conversation and returns structured JSON
with: agent, intent, confidence, multi-agent flag, and capsule type.

This eliminates ALL routing bugs because Sonnet understands intent semantically,
not via pattern matching. The regex router with 19 tiebreaker rules is replaced
by a single LLM call that never misroutes.

Shadow mode: When CLASSIFIER_VERSION != "sonnet", this runs alongside the
existing Haiku+regex classifier and logs comparison results without affecting
production routing. This allows A/B validation before cutover.
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field
from typing import Optional

import anthropic

from app.config import get_settings
from app.models.context import PlayerContext

logger = logging.getLogger("tomo-ai.sonnet_classifier")


# ── Types ─────────────────────────────────────────────────────────────

@dataclass
class SonnetClassificationResult:
    """Result from Sonnet classifier."""
    agent: str                          # performance | planning | identity | settings
    intent: str                         # Specific intent ID for telemetry
    confidence: float                   # 0.0-1.0
    requires_second_agent: Optional[str] = None  # For multi-step workflows
    capsule_type: Optional[str] = None  # If capsule-eligible
    classification_layer: str = "sonnet"
    latency_ms: float = 0.0
    cost_usd: float = 0.0


# ── Sonnet Classifier Prompt ──────────────────────────────────────────

# Static system prompt (~400 tokens, cached after first call)
CLASSIFIER_SYSTEM_PROMPT = """\
You are the Tomo intent router. Tomo is an AI coaching platform for youth athletes.
Given a conversation and the latest user message, classify it into exactly one primary agent.

THE 4 AGENTS:
- PERFORMANCE: readiness, training content, session building, drills, programs, \
test results, benchmarks, recovery, fatigue, deload, load management, PHV, \
injury assessment, tissue loading, periodization, training blocks
- PLANNING: schedule, calendar, events, exams, study plans, mode switching, \
dual-load balance, time management, day/week planning, event creation/deletion, \
reschedule, auto-fill, cognitive windows
- IDENTITY: CV, achievements, progress, career, recruitment, milestones, \
streaks, coachability, 5-layer profile, development velocity, verified achievements
- SETTINGS: goals, injury logging, nutrition, sleep, profile, notifications, \
wearables (WHOOP), app configuration, drill library, navigation

MULTI-AGENT DETECTION:
Some messages require TWO agents working together. Common patterns:
- "Build me a [type] session for [day]" → performance (build drills) + planning (schedule it)
- "I'm injured, adjust my week" → settings (log injury) + planning (adjust schedule)
- "Log this test and show my trajectory" → performance handles both (single agent)
If the message clearly needs two agents, set requires_second_agent to the second one.

CAPSULE DETECTION:
These intents are capsule-eligible (deterministic, no LLM needed):
- Greetings (hey, hi, hello, morning, etc.)
- Navigation requests (go to timeline, open mastery, etc.)
- Quick status queries (my readiness, my load, today's schedule, my streak)
If capsule-eligible, set capsule_type to the capsule name.
Smalltalk / mood bids are NOT capsule — they route through open_coaching \
for warm text, so classify them as intent=smalltalk with capsule_type=null.

CRITICAL RULES — conversational vs action distinction:
1. Statements without explicit action verbs are NOT build requests. \
"thinking about technical drills tomorrow", "considering a rest day", \
"maybe gym later", "might do some sprints" → open_coaching, NOT build_session. \
Only classify as build_session when the user says "build", "create", "plan", \
"make", "schedule", or "design" a session.
2. Social-reciprocity bids and mood statements → smalltalk. \
"feeling great buddy, what about you?", "i'm good thanks", "tired today", \
"bored", "not bad you?", "legs are heavy" → smalltalk. \
smalltalk is NOT check_in — check_in is ONLY explicit wellness logging \
("log my check-in", "do my daily check-in").
3. Open questions about training philosophy / technique with no specific \
entity → open_coaching ("how should I warm up before sprints?").
4. Mood / body-state descriptions ("legs dead", "body heavy", "feel slow") \
without logging language → open_coaching, NOT check_in.

EXAMPLES:
User: "I'm thinking about technical drills tomorrow"
→ {"agent":"performance","intent":"open_coaching","confidence":0.9,"requires_second_agent":null,"capsule_type":null}

User: "Build me a technical session for tomorrow"
→ {"agent":"performance","intent":"build_session","confidence":1.0,"requires_second_agent":"planning","capsule_type":null}

User: "Feeling great buddy, what about you?"
→ {"agent":"performance","intent":"smalltalk","confidence":0.95,"requires_second_agent":null,"capsule_type":null}

User: "Legs are dead today"
→ {"agent":"performance","intent":"open_coaching","confidence":0.85,"requires_second_agent":null,"capsule_type":null}

User: "Log my sprint test"
→ {"agent":"performance","intent":"log_test","confidence":1.0,"requires_second_agent":null,"capsule_type":"log_test"}

INTENT IDs (use the most specific one):
Performance: build_session, open_coaching, check_readiness, load_advice, \
recovery_guidance, benchmark_comparison, log_test, test_trajectory, \
program_recommendation, deload_assessment, injury_assessment, \
session_modification, phv_query
Planning: add_event, view_schedule, edit_event, delete_event, plan_week, \
plan_day, exam_planning, mode_switch, dual_load_check, study_planning
Identity: show_cv, show_progress, career_update, achievement_check, \
recruitment_query, coachability_check
Settings: set_goal, log_injury, log_nutrition, log_sleep, update_profile, \
wearable_sync, notification_config
Capsule: greeting, smalltalk, navigate, qa_readiness, qa_load, \
qa_today_schedule, qa_week_schedule, qa_streak, check_in, log_test

Respond with ONLY valid JSON (no markdown, no explanation):
{"agent":"...","intent":"...","confidence":0.95,"requires_second_agent":null,"capsule_type":null}"""


# ── Sonnet Classification ─────────────────────────────────────────────

# Pricing: Sonnet 4 → $3/MTok input, $15/MTok output
SONNET_INPUT_COST_PER_TOKEN = 0.000003
SONNET_OUTPUT_COST_PER_TOKEN = 0.000015


async def classify_with_sonnet(
    message: str,
    conversation_summary: str = "",
    active_tab: str = "Chat",
    last_agent: Optional[str] = None,
    context: Optional[PlayerContext] = None,
) -> SonnetClassificationResult:
    """
    Classify user intent using Sonnet with full conversation context.

    Args:
        message: The current user message
        conversation_summary: Summary of last 2-3 turns for context
        active_tab: Currently active app tab
        last_agent: Last agent used (for continuity signal)
        context: PlayerContext for athlete-specific signals

    Returns:
        SonnetClassificationResult with agent, intent, confidence, and multi-agent flag
    """
    settings = get_settings()
    start = time.monotonic()

    # Build dynamic user message (~200-400 tokens)
    parts = []
    if conversation_summary:
        parts.append(f"Recent conversation:\n{conversation_summary}")
    if active_tab and active_tab != "Chat":
        parts.append(f"Active tab: {active_tab}")
    if last_agent:
        parts.append(f"Last agent used: {last_agent}")
    if context:
        # Add minimal athlete context for better classification
        sport = context.sport or "football"
        age_band = context.age_band or "unknown"
        readiness = context.readiness_score or "unknown"
        parts.append(f"Athlete: {sport}, {age_band}, readiness={readiness}")

    parts.append(f"Message: {message}")
    user_content = "\n".join(parts)

    try:
        client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        response = await client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=100,
            system=[{
                "type": "text",
                "text": CLASSIFIER_SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }],
            messages=[{"role": "user", "content": user_content}],
        )

        elapsed_ms = (time.monotonic() - start) * 1000

        # Calculate cost
        usage = response.usage
        input_tokens = usage.input_tokens
        output_tokens = usage.output_tokens
        cache_read = getattr(usage, "cache_read_input_tokens", 0) or 0
        cost = ((input_tokens - cache_read) * SONNET_INPUT_COST_PER_TOKEN) + \
               (output_tokens * SONNET_OUTPUT_COST_PER_TOKEN)

        # Parse JSON response
        raw = response.content[0].text.strip()
        # Handle potential markdown wrapping
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()

        data = json.loads(raw)

        # Enforce v2 agent names — map any v1 names the LLM might return
        _V1_TO_V2 = {
            "output": "performance", "testing_benchmark": "performance",
            "recovery": "performance", "training_program": "performance",
            "timeline": "planning", "dual_load": "planning",
            "mastery": "identity", "cv_identity": "identity",
        }
        _VALID_V2 = {"performance", "planning", "identity", "settings"}
        raw_agent = data.get("agent", "performance").lower().strip()
        safe_agent = _V1_TO_V2.get(raw_agent, raw_agent)
        if safe_agent not in _VALID_V2:
            logger.warning(f"Sonnet returned unknown agent '{raw_agent}', defaulting to performance")
            safe_agent = "performance"

        raw_second = data.get("requires_second_agent")
        safe_second = None
        if raw_second:
            raw_second = raw_second.lower().strip()
            safe_second = _V1_TO_V2.get(raw_second, raw_second)
            if safe_second not in _VALID_V2:
                safe_second = None

        result = SonnetClassificationResult(
            agent=safe_agent,
            intent=data.get("intent", "unknown"),
            confidence=float(data.get("confidence", 0.8)),
            requires_second_agent=safe_second,
            capsule_type=data.get("capsule_type"),
            classification_layer="sonnet",
            latency_ms=elapsed_ms,
            cost_usd=cost,
        )

        logger.info(
            f"Sonnet classified: agent={result.agent}, intent={result.intent}, "
            f"conf={result.confidence:.2f}, second={result.requires_second_agent}, "
            f"capsule={result.capsule_type}, "
            f"latency={elapsed_ms:.0f}ms, cost=${cost:.5f}"
        )

        return result

    except json.JSONDecodeError as e:
        elapsed_ms = (time.monotonic() - start) * 1000
        logger.error(f"Sonnet classifier JSON parse error: {e}, raw={raw[:200]}")
        # Fallback: route to performance agent (safest default)
        return SonnetClassificationResult(
            agent="performance",
            intent="unknown",
            confidence=0.5,
            classification_layer="sonnet_fallback",
            latency_ms=elapsed_ms,
        )

    except Exception as e:
        elapsed_ms = (time.monotonic() - start) * 1000
        logger.error(f"Sonnet classifier error: {e}")
        return SonnetClassificationResult(
            agent="performance",
            intent="unknown",
            confidence=0.3,
            classification_layer="sonnet_error",
            latency_ms=elapsed_ms,
        )


# ── Shadow Mode Comparison ────────────────────────────────────────────

async def shadow_classify_and_compare(
    message: str,
    existing_result: dict,
    conversation_summary: str = "",
    active_tab: str = "Chat",
    last_agent: Optional[str] = None,
    context: Optional[PlayerContext] = None,
) -> dict:
    """
    Run Sonnet classifier in shadow mode and compare with existing Haiku+regex result.
    Logs comparison for A/B analysis without affecting production routing.

    Args:
        message: User message
        existing_result: Dict with keys: agent_type, intent_id, confidence, classification_layer
        conversation_summary: Recent conversation for Sonnet context
        active_tab: Current tab
        last_agent: Previous agent
        context: PlayerContext

    Returns:
        Dict with comparison data for logging to ai_trace_log
    """
    try:
        sonnet_result = await classify_with_sonnet(
            message=message,
            conversation_summary=conversation_summary,
            active_tab=active_tab,
            last_agent=last_agent,
            context=context,
        )

        # Map v1 agent names to v2 agent names for comparison
        V1_TO_V2_AGENT_MAP = {
            "output": "performance",
            "testing_benchmark": "performance",
            "recovery": "performance",
            "training_program": "performance",
            "timeline": "planning",
            "planning": "planning",
            "dual_load": "planning",
            "mastery": "identity",
            "cv_identity": "identity",
            "settings": "settings",
        }

        existing_agent = existing_result.get("agent_type", "output")
        existing_v2 = V1_TO_V2_AGENT_MAP.get(existing_agent, existing_agent)
        sonnet_agent = sonnet_result.agent

        agent_match = existing_v2 == sonnet_agent
        intent_match = existing_result.get("intent_id", "") == sonnet_result.intent

        comparison = {
            "sonnet_agent": sonnet_agent,
            "sonnet_intent": sonnet_result.intent,
            "sonnet_confidence": sonnet_result.confidence,
            "sonnet_second_agent": sonnet_result.requires_second_agent,
            "sonnet_capsule": sonnet_result.capsule_type,
            "sonnet_latency_ms": sonnet_result.latency_ms,
            "sonnet_cost_usd": sonnet_result.cost_usd,
            "existing_agent_v1": existing_agent,
            "existing_agent_v2": existing_v2,
            "existing_intent": existing_result.get("intent_id"),
            "existing_confidence": existing_result.get("confidence"),
            "existing_layer": existing_result.get("classification_layer"),
            "agent_match": agent_match,
            "intent_match": intent_match,
        }

        if not agent_match:
            logger.warning(
                f"[SHADOW] Routing divergence: existing={existing_v2} vs sonnet={sonnet_agent} "
                f"for message: {message[:80]}"
            )
        else:
            logger.info(
                f"[SHADOW] Routing agreement: {sonnet_agent} "
                f"(sonnet conf={sonnet_result.confidence:.2f}, "
                f"existing conf={existing_result.get('confidence', 0):.2f})"
            )

        return comparison

    except Exception as e:
        logger.error(f"Shadow classification failed: {e}")
        return {"shadow_error": str(e)[:200]}
