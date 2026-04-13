"""
Tomo AI Service — 3-Layer Intent Classifier
Python equivalent of TypeScript intentClassifier.ts.

Layer 1: Exact match (0 latency, $0 cost) — 150+ chip action patterns
Layer 2: Haiku AI classifier (~$0.0001, 200ms) — 43 intents with context boosts
Layer 3: Fallthrough to full AI orchestrator

Flow: message → normalize → exact match? → Haiku classify? → fallthrough
"""

from __future__ import annotations

import logging
import re
import time
import json
from dataclasses import dataclass, field
from typing import Optional

from app.agents.intent_registry import (
    INTENT_BY_ID,
    IntentDefinition,
    build_classifier_intent_list,
)
from app.models.context import PlayerContext

logger = logging.getLogger("tomo-ai.classifier")


# ── Types ────────────────────────────────────────────────────────────

@dataclass
class ClassificationResult:
    """Result of intent classification."""
    intent_id: str
    capsule_type: Optional[str]
    agent_type: str  # timeline | output | mastery | settings | planning
    confidence: float
    extracted_params: dict = field(default_factory=dict)
    classification_layer: str = "exact_match"  # exact_match | haiku | fallthrough
    latency_ms: float = 0.0


@dataclass
class ConversationState:
    """Conversation state for context-aware classification."""
    current_topic: Optional[str] = None
    last_action: Optional[str] = None
    referenced_dates: list[str] = field(default_factory=list)
    referenced_events: list[str] = field(default_factory=list)
    session_drills: dict[str, str] = field(default_factory=dict)
    entity_graph: dict[str, str] = field(default_factory=dict)


# ── Layer 1: Exact Match ─────────────────────────────────────────────

def _normalize(s: str) -> str:
    """Normalize input for exact matching."""
    return re.sub(r"\s+", " ", re.sub(r"\?+$", "", s.lower().strip()))


# Fallthrough prefix patterns — force these to Layer 3 (full AI)
FALLTHROUGH_PATTERNS: list[re.Pattern] = [
    # Follow-up detection
    re.compile(r"^tell me more"),
    re.compile(r"^explain"),
    re.compile(r"^how do i"),
    re.compile(r"^why did you"),
    re.compile(r"^what do you mean"),
    re.compile(r"^can you elaborate"),
    # Conversational continuations
    re.compile(r"^okay"),
    re.compile(r"^no,"),
    re.compile(r"^yes,"),
    re.compile(r"^what about"),
    re.compile(r"^but "),
    re.compile(r"^and "),
    re.compile(r"^also "),
    # Injury/pain context → full AI
    re.compile(r"\bpain\b"),
    re.compile(r"\binjured\b"),
    re.compile(r"\binjury\b"),
    re.compile(r"\bhurt\b"),
    # Program specifics → full AI
    re.compile(r"drills for my .+ program"),
    re.compile(r"specific program"),
    # Recommendation references → full AI
    re.compile(r"my readiness says"),
    re.compile(r"\".*recommendation.*\""),
]

# Exact match map — populated at module load
_EXACT_MATCH_MAP: dict[str, dict] = {}


def _build_exact_match_map() -> dict[str, dict]:
    """Build the exact match map from chip action patterns."""
    m: dict[str, dict] = {}

    def _add(phrases: list[str], intent_id: str, params: Optional[dict] = None):
        for p in phrases:
            m[_normalize(p)] = {"intent_id": intent_id, "params": params or {}}

    # Greetings → route to output agent for warm coaching response ($0 classification)
    _add(["hey tomo", "hi tomo", "hello tomo", "hey", "hi", "hello",
          "good morning", "good afternoon", "good evening", "morning",
          "what's up", "sup", "yo", "heya", "hiya", "howdy",
          "hey coach", "hi coach", "hello coach",
          "what's good", "how's it going"], "greeting")

    # Test log
    _add(["log a test", "record my sprint", "add my cmj score", "log test",
          "record a test", "log my test", "test log"], "log_test")

    # Check-in
    _add(["check in", "log my mood", "daily check in", "checkin",
          "check-in", "wellness check", "how am i feeling"], "check_in")

    # Navigation
    _add(["go to timeline", "open timeline", "show timeline"], "navigate", {"targetTab": "Timeline"})
    _add(["go to output", "open output", "show output", "my vitals", "my metrics"], "navigate", {"targetTab": "Output"})
    _add(["go to mastery", "open mastery", "show mastery"], "navigate", {"targetTab": "Mastery"})
    _add(["go to own it", "open own it", "show own it", "for you"], "navigate", {"targetTab": "OwnIt"})

    # Quick actions
    _add(["what's my readiness", "my readiness", "readiness score",
          "how am i doing", "wellness score"], "qa_readiness")
    _add(["my load", "what's my load", "training load", "acwr",
          "my acwr", "dual load"], "qa_load")
    _add(["today's schedule", "what's on today", "my events today",
          "today's events", "what do i have today",
          "what's my schedule", "my schedule", "my schedule today",
          "schedule for today", "today schedule", "today's plan",
          "what am i doing today", "anything on today",
          "have i got anything today", "what's planned for today",
          "my agenda", "today's agenda", "what's happening today",
          "any sessions today", "any events today",
          "what's lined up today", "what have i got today",
          "plans for today", "am i busy today"], "qa_today_schedule")
    _add(["this week's schedule", "my week", "what's this week",
          "week schedule", "weekly schedule",
          "what's my week looking like", "my weekly plan",
          "what's happening this week", "anything this week",
          "what do i have this week", "this week's plan",
          "this week's events", "my schedule this week",
          "plans this week", "am i busy this week"], "qa_week_schedule")
    _add(["my tests", "test history", "recent scores", "my scores",
          "show my tests"], "qa_test_history")
    _add(["my streak", "current streak", "how many days"], "qa_streak")

    # Programs
    _add(["my programs", "show programs", "what programs do you recommend",
          "training programs", "recommended programs"], "show_programs")

    # Training readiness (routes to output agent for readiness-first check)
    _add(["start training", "i want to start training", "begin training",
          "let's train", "can i train", "am i ready to train",
          "should i train today", "can i train today",
          "am i ready to work out", "start a session",
          "i want to train", "ready to train",
          "i want to begin training", "can i start training",
          "can i start training today", "let's start training",
          "when can i start training", "when can i train",
          "am i good to train", "is it okay to train today",
          "can i work out today"], "qa_readiness")

    # Recovery / rest queries
    _add(["do i need recovery", "should i rest today", "do i need a rest day",
          "should i take a day off", "am i overtraining",
          "do i need to recover", "is today a rest day",
          "should i skip training today", "am i too tired to train",
          "recovery day"], "load_advice_request")

    # Benchmark / comparison queries
    _add(["how is my speed vs my age", "compare my speed",
          "how do i compare to my age group", "am i fast for my age",
          "benchmark my tests", "benchmark all my tests",
          "how do my results compare", "percentile for my tests",
          "am i above average", "where do i rank"], "benchmark_comparison")

    # Events / session building (37.5% fallthrough gap — these MUST exact match)
    _add(["add event", "create event", "new event", "add a session",
          "build a session", "schedule training",
          "build me a session", "build me a gym session",
          "build me a training session", "create a session",
          "create a training session", "plan a session",
          "plan a training session", "schedule a session",
          "schedule a workout", "add a training session",
          "add training to my day", "set up a training session",
          "set up a session", "add a workout",
          "schedule a training session", "add session",
          "new session", "create a workout"], "create_event")
    _add(["add an exam", "new exam", "i have an exam"], "add_exam")

    # Study
    _add(["plan my study", "study schedule", "study plan"], "plan_study")
    _add(["plan my regular study", "regular study", "study routine"], "plan_regular_study")

    # Schedule
    _add(["edit my rules", "schedule rules", "schedule settings",
          "change my schedule rules"], "schedule_rules")
    _add(["check conflicts", "any conflicts", "schedule conflicts",
          "any clashes"], "check_conflicts")

    # Goals/Injury
    _add(["set a goal", "new goal", "i want to improve"], "set_goal")
    _add(["i'm injured", "injury mode"], "injury_mode")

    # Nutrition/Sleep
    _add(["log food", "log a meal", "log nutrition"], "log_nutrition")
    _add(["log sleep", "i slept"], "log_sleep")

    # Profile
    _add(["my profile", "show my profile", "update my height",
          "update my weight"], "update_profile")

    # Notifications
    _add(["show my notifications", "any notifications", "my alerts"], "view_notifications")
    _add(["mark all as read", "clear notifications"], "clear_notifications")

    # Day planning → qa_today_schedule (timeline agent, NOT today_briefing which is output)
    # Critical: pre_router uses classifier's agent_type when conf >= 0.8.
    # Exact match = 1.0, so the router tiebreaker never gets a chance.
    # These MUST map to a timeline-routed intent.
    _add(["plan my day", "plan for my day", "plan for today",
          "plan today", "let's plan my day", "let's plan today",
          "help me plan today", "what should i do today",
          "organize my day", "plan out my day"], "qa_today_schedule")
    # Week planning → qa_week_schedule (already timeline agent)
    _add(["plan my week", "plan for this week", "plan this week",
          "let's plan the week", "let's plan my week",
          "help me plan my week", "organize my week",
          "plan out my week", "plan for the week"], "qa_week_schedule")

    # Cross-feature
    _add(["daily briefing", "morning brief", "what's my day"], "today_briefing")
    _add(["reduce my load", "lower intensity", "less training"], "load_reduce")
    _add(["exam mode", "exams coming up"], "exam_setup")
    _add(["full reset", "clear everything", "reset schedule"], "full_reset")

    # Journal
    _add(["journal", "pre-training journal", "reflect on training",
          "training reflection"], "journal_pre")

    # PHV
    _add(["calculate my phv", "phv calculator", "growth stage"], "phv_calculate")

    # Strengths
    _add(["my strengths", "my weaknesses", "gap analysis",
          "strengths and gaps"], "strengths_gaps")

    # Leaderboard
    _add(["leaderboard", "my ranking", "show leaderboard"], "leaderboard")

    return m


# Initialize at module load
_EXACT_MATCH_MAP = _build_exact_match_map()


def try_exact_match(message: str) -> Optional[ClassificationResult]:
    """
    Layer 1: Exact match against 150+ chip action patterns.
    Returns immediately if matched. $0 cost, 0 latency.
    """
    normalized = _normalize(message)

    # Check fallthrough patterns first — these skip to Layer 3
    for pattern in FALLTHROUGH_PATTERNS:
        if pattern.search(normalized):
            return None  # Skip to Layer 2/3

    # Exact match lookup
    match = _EXACT_MATCH_MAP.get(normalized)
    if not match:
        return None

    intent_id = match["intent_id"]
    intent_def = INTENT_BY_ID.get(intent_id)
    if not intent_def:
        return None

    return ClassificationResult(
        intent_id=intent_id,
        capsule_type=intent_def.capsule_type,
        agent_type=intent_def.agent_type,
        confidence=1.0,
        extracted_params=match.get("params", {}),
        classification_layer="exact_match",
        latency_ms=0.0,
    )


# ── Layer 2: Haiku Classifier ────────────────────────────────────────

HAIKU_CLASSIFIER_SYSTEM = """You are an intent classifier for an athletic coaching AI.
Classify the user message into ONE of these intents:

{intent_list}

CRITICAL RULES:
1. If user asks about a SPECIFIC program BY NAME → agent_fallthrough (NOT show_programs)
2. If user quotes a recommendation → agent_fallthrough (NOT qa_readiness)
3. If pain/injury context → agent_fallthrough (NOT qa_readiness)
4. show_programs is ONLY for listing ALL programs
5. qa_readiness is ONLY for checking scores/vitals (NOT recovery recs)
6. leaderboard is ONLY for gamification (NOT performance comparison)
7. log_test is ONLY for NEW test logging (NOT viewing/analyzing results)
8. plan_training is DEPRECATED → use agent_fallthrough
9. Follow-up questions about previous agent response → agent_fallthrough
10. "start training", "can I train", "ready to train" → qa_readiness (readiness check FIRST, not schedule)

{context_summary}

Respond with JSON only: {{"intent_id": "...", "confidence": 0.0-1.0, "params": {{}}}}"""


async def classify_with_haiku(
    message: str,
    conversation_state: Optional[ConversationState],
    context: PlayerContext,
) -> Optional[ClassificationResult]:
    """
    Layer 2: Haiku AI classifier.
    Cost: ~$0.0001, Latency: ~200ms.
    """
    from langchain_anthropic import ChatAnthropic
    from app.config import get_settings

    t0 = time.monotonic()

    try:
        settings = get_settings()
        intent_list = build_classifier_intent_list()

        # Build context summary
        ctx_parts = []
        if conversation_state:
            if conversation_state.current_topic:
                ctx_parts.append(f"Current topic: {conversation_state.current_topic}")
            if conversation_state.last_action:
                ctx_parts.append(f"Last action: {conversation_state.last_action}")
        ctx_parts.append(f"Active tab: {context.active_tab}")
        context_summary = "Context: " + "; ".join(ctx_parts) if ctx_parts else ""

        system_prompt = HAIKU_CLASSIFIER_SYSTEM.format(
            intent_list=intent_list,
            context_summary=context_summary,
        )

        llm = ChatAnthropic(
            model="claude-haiku-4-5-20251001",
            temperature=0,
            max_tokens=100,
            anthropic_api_key=settings.anthropic_api_key,
        )

        response = await llm.ainvoke([
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": message},
        ])

        raw = response.content
        if isinstance(raw, list):
            raw = "".join(
                block.get("text", str(block)) if isinstance(block, dict) else str(block)
                for block in raw
            )

        # Extract JSON from response
        json_match = re.search(r"\{[\s\S]*\}", raw)
        if not json_match:
            return None

        parsed = json.loads(json_match.group())
        intent_id = parsed.get("intent_id", "agent_fallthrough")
        confidence = float(parsed.get("confidence", 0.0))
        params = parsed.get("params", {})

        # Apply context boosts
        intent_def = INTENT_BY_ID.get(intent_id)
        if intent_def and conversation_state and intent_def.context_boosts:
            for boost_condition in intent_def.context_boosts:
                key, val = boost_condition.split(":", 1)
                if key == "currentTopic" and conversation_state.current_topic == val:
                    confidence = min(1.0, confidence + 0.1)
                elif key == "lastActionContext" and conversation_state.last_action == val:
                    confidence = min(1.0, confidence + 0.1)

        elapsed_ms = (time.monotonic() - t0) * 1000

        if intent_id == "agent_fallthrough" or not intent_def:
            return None  # Fall through to Layer 3

        # Confidence threshold
        if confidence < 0.65:
            logger.info(f"Haiku classified as {intent_id} but confidence {confidence:.2f} < 0.65 → fallthrough")
            return None

        return ClassificationResult(
            intent_id=intent_id,
            capsule_type=intent_def.capsule_type,
            agent_type=intent_def.agent_type,
            confidence=confidence,
            extracted_params=params,
            classification_layer="haiku",
            latency_ms=elapsed_ms,
        )

    except Exception as e:
        logger.warning(f"Haiku classification failed: {e}")
        return None


# ── Main Entry Point ─────────────────────────────────────────────────

async def classify_intent(
    message: str,
    conversation_state: Optional[ConversationState],
    context: PlayerContext,
) -> ClassificationResult:
    """
    3-layer intent classification.

    Layer 1: Exact match ($0, 0ms)
    Layer 2: Haiku AI (~$0.0001, ~200ms)
    Layer 3: Fallthrough to full AI orchestrator

    Returns ClassificationResult with intent_id, agent_type, confidence.
    """
    t0 = time.monotonic()

    # Layer 1: Exact match
    exact = try_exact_match(message)
    if exact:
        exact.latency_ms = (time.monotonic() - t0) * 1000
        logger.info(f"Layer 1 exact match: {exact.intent_id} ({exact.latency_ms:.0f}ms)")
        return exact

    # Layer 2: Haiku classifier
    haiku_result = await classify_with_haiku(message, conversation_state, context)
    if haiku_result:
        logger.info(
            f"Layer 2 Haiku: {haiku_result.intent_id} "
            f"(conf={haiku_result.confidence:.2f}, {haiku_result.latency_ms:.0f}ms)"
        )
        return haiku_result

    # Layer 3: Fallthrough — log for pattern mining
    elapsed = (time.monotonic() - t0) * 1000
    logger.warning(
        f"INTENT FALLTHROUGH: message='{message[:150]}' "
        f"({elapsed:.0f}ms) — add pattern to prevent recurrence"
    )
    return ClassificationResult(
        intent_id="agent_fallthrough",
        capsule_type=None,
        agent_type="output",  # Default agent for fallthrough
        confidence=0.0,
        classification_layer="fallthrough",
        latency_ms=elapsed,
    )
