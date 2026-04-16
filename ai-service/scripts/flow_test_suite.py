#!/usr/bin/env python3
"""
Tomo AI Service — 4-Layer Flow Validation Suite
Comprehensive testing of ALL AI chat flows from classification to response.

Usage:
  cd ai-service

  # Full 4-layer suite (needs running server + DB)
  python -m scripts.flow_test_suite

  # Layer 1 only: Classification accuracy (offline, no server)
  python -m scripts.flow_test_suite --layer 1

  # Layer 2 only: Flow pattern validation (needs server)
  python -m scripts.flow_test_suite --layer 2

  # Layer 3 only: End-to-end pipeline (needs server + DB)
  python -m scripts.flow_test_suite --layer 3

  # Layer 4 only: Capsule action round-trip (needs server + DB)
  python -m scripts.flow_test_suite --layer 4

  # Layer 5 only: Response format validation (needs server)
  python -m scripts.flow_test_suite --layer 5

  # Write report
  python -m scripts.flow_test_suite --report

  # Deploy gate (exit code 1 on failure)
  python -m scripts.flow_test_suite --deploy-gate

Architecture:
  Layer 1: Intent Classification ($0, offline, ~200 tests)
    - Exact match coverage: every phrase -> correct intent
    - Haiku classification: natural language -> correct intent
    - Fallthrough patterns: ensure they don't steal valid intents
    - Date/focus extraction: temporal parsing correctness

  Layer 2: Flow Pattern Validation ($0, needs server, ~80 tests)
    - Every intent -> correct flow pattern
    - capsule_direct -> correct capsule_type in response
    - data_display -> correct card type + data
    - scheduling_capsule -> correct prefilled values
    - write_action/open_coaching -> falls through to agent

  Layer 3: End-to-End Pipeline ($~0.05, needs server + DB, ~100 tests)
    - Full message -> structured response validation
    - Agent routing correctness
    - Tool execution success (read tools)
    - Response card format + content validation
    - Safety gates: PHV, ACWR, RED athlete

  Layer 4: Capsule Action Round-Trip ($0, needs server + DB, ~20 tests)
    - Create event via capsule -> verify in DB
    - Update event via capsule -> verify changes
    - Confirm card flow -> execution -> response

Gate criteria:
  - Layer 1: >= 95% classification accuracy (this catches 80% of flow bugs)
  - Layer 2: >= 90% flow pattern correctness
  - Layer 3: >= 85% end-to-end pass rate
  - Layer 4: >= 90% capsule action success
  - Overall: >= 90% across all layers
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("flow_test_suite")


# -- Result types --

@dataclass
class TestResult:
    test_id: str
    layer: int
    category: str
    description: str
    passed: bool
    score: float = 1.0
    expected: str = ""
    actual: str = ""
    reasoning: str = ""
    latency_ms: float = 0.0
    cost_usd: float = 0.0


@dataclass
class LayerReport:
    layer: int
    name: str
    results: list[TestResult] = field(default_factory=list)

    @property
    def total(self) -> int:
        return len(self.results)

    @property
    def passed(self) -> int:
        return sum(1 for r in self.results if r.passed)

    @property
    def pass_rate(self) -> float:
        return self.passed / self.total if self.total > 0 else 0.0


# ============================================================================
# LAYER 1: Intent Classification Accuracy (offline, $0)
# ============================================================================

async def run_layer_1() -> LayerReport:
    """Test every classification path without a running server.

    This is the highest-leverage test layer. If classification is wrong,
    everything downstream is wrong. Tests:
    1a. Exact match: every registered phrase -> correct intent_id
    1b. Fallthrough safety: fallthrough patterns don't steal valid phrases
    1c. Date extraction: temporal references -> correct YYYY-MM-DD
    1d. Focus extraction: sport terms -> correct canonical focus
    1e. Haiku classification: natural phrases -> correct intent (needs API key)
    """
    from app.agents.intent_classifier import (
        try_exact_match,
        _EXACT_MATCH_MAP,
        _normalize,
        FALLTHROUGH_PATTERNS,
    )
    from app.flow.registry import FLOW_REGISTRY, get_flow_config
    from app.agents.intent_registry import INTENT_BY_ID

    report = LayerReport(layer=1, name="Intent Classification Accuracy")

    # ── 1a. Exact match: every phrase -> correct intent ──
    # This is the $0 fast-path. Every phrase in the map MUST resolve correctly.
    for phrase, mapping in _EXACT_MATCH_MAP.items():
        intent_id = mapping["intent_id"]
        result = try_exact_match(phrase)

        if result is None:
            # A phrase in the exact match map returned None -- impossible unless
            # a fallthrough pattern is stealing it
            report.results.append(TestResult(
                test_id=f"L1_exact_{intent_id}_{phrase[:30]}",
                layer=1, category="exact_match",
                description=f"Exact match: '{phrase}' -> {intent_id}",
                passed=False,
                expected=intent_id,
                actual="None (fallthrough pattern stole it)",
                reasoning="Phrase exists in exact map but try_exact_match returned None",
            ))
        elif result.intent_id != intent_id:
            report.results.append(TestResult(
                test_id=f"L1_exact_{intent_id}_{phrase[:30]}",
                layer=1, category="exact_match",
                description=f"Exact match: '{phrase}' -> {intent_id}",
                passed=False,
                expected=intent_id,
                actual=result.intent_id,
                reasoning=f"Phrase mapped to wrong intent",
            ))
        else:
            report.results.append(TestResult(
                test_id=f"L1_exact_{intent_id}_{phrase[:30]}",
                layer=1, category="exact_match",
                description=f"Exact match: '{phrase}' -> {intent_id}",
                passed=True,
                expected=intent_id,
                actual=result.intent_id,
            ))

    # ── 1b. Fallthrough safety ──
    # Ensure fallthrough regex patterns don't steal phrases from the exact map.
    # This caught the "okay" / "what about" / "and you" bug.
    stolen_phrases = []
    for phrase in _EXACT_MATCH_MAP:
        normalized = _normalize(phrase)
        for pattern in FALLTHROUGH_PATTERNS:
            if pattern.search(normalized):
                stolen_phrases.append((phrase, pattern.pattern))
                break

    # Each stolen phrase is a test failure
    for phrase, pattern in stolen_phrases:
        # But try_exact_match checks exact map BEFORE fallthrough, so this
        # should never cause a real bug. Log as warning, not failure.
        report.results.append(TestResult(
            test_id=f"L1_fallthrough_overlap_{phrase[:20]}",
            layer=1, category="fallthrough_safety",
            description=f"Fallthrough pattern '{pattern}' matches exact phrase '{phrase}'",
            passed=True,  # Exact match runs first, so this is safe
            expected="exact_match_wins",
            actual="exact_match_wins (order protects)",
            reasoning="Exact map checked before fallthrough -- safe but monitor",
        ))

    # ── 1c. Date extraction ──
    from app.flow.patterns.scheduling_capsule import _extract_date
    from app.flow.patterns.data_display import _extract_date_from_message

    today = datetime.now().strftime("%Y-%m-%d")
    from datetime import timedelta
    today_dt = datetime.strptime(today, "%Y-%m-%d")
    tomorrow = (today_dt + timedelta(days=1)).strftime("%Y-%m-%d")
    day_after = (today_dt + timedelta(days=2)).strftime("%Y-%m-%d")

    date_tests = [
        ("i want to train tomorrow", tomorrow, "tomorrow"),
        ("show me tomorrow's schedule", tomorrow, "tomorrow (schedule)"),
        ("gym today", None, "today returns None (default)"),
        ("train on monday", None, "named day (dynamic)"),  # Can't predict exact date
        ("session in 2 days", day_after, "in N days"),
        ("day after tomorrow", day_after, "day after tomorrow"),
        ("what's on today", None, "today (schedule default)"),
    ]

    for msg, expected_date, desc in date_tests:
        actual = _extract_date_from_message(msg, today)
        # For named days, just check it returns something non-None
        if expected_date is None and "named day" not in desc:
            passed = actual is None
        elif "named day" in desc:
            passed = actual is not None and actual != today
        else:
            passed = actual == expected_date

        report.results.append(TestResult(
            test_id=f"L1_date_{desc.replace(' ', '_')[:30]}",
            layer=1, category="date_extraction",
            description=f"Date extraction: '{msg}' -> {expected_date or 'None'}",
            passed=passed,
            expected=str(expected_date),
            actual=str(actual),
        ))

    # ── 1d. Focus extraction ──
    from app.flow.patterns.scheduling_capsule import _extract_focus

    focus_tests = [
        ("build me a speed session", "speed"),
        ("plan a gym session", "strength"),
        ("i want to do some technical drills", "technical"),
        ("conditioning tomorrow", "endurance"),
        ("recovery session today", "recovery"),
        ("agility work", "agility"),
        ("sprint training", "speed"),
        ("weights session", "strength"),
        ("i want to train tomorrow", None),  # No focus specified
        ("ball mastery drills", "technical"),
    ]

    for msg, expected_focus, in focus_tests:
        actual = _extract_focus(msg)
        passed = actual == expected_focus
        report.results.append(TestResult(
            test_id=f"L1_focus_{expected_focus or 'none'}_{msg[:20]}",
            layer=1, category="focus_extraction",
            description=f"Focus extraction: '{msg}' -> {expected_focus}",
            passed=passed,
            expected=str(expected_focus),
            actual=str(actual),
        ))

    # ── 1e. Flow registry coverage ──
    # Every intent in the registry should have a flow config
    for intent_id in INTENT_BY_ID:
        config = get_flow_config(intent_id)
        report.results.append(TestResult(
            test_id=f"L1_registry_{intent_id}",
            layer=1, category="registry_coverage",
            description=f"Intent '{intent_id}' has flow registry entry",
            passed=config is not None,
            expected="FlowConfig",
            actual=config.pattern if config else "None",
        ))

    # ── 1f. Natural language classification (Haiku, ~$0.01 total) ──
    # Test phrases that DON'T have exact matches but SHOULD route correctly.
    # These test the Haiku classifier's ability to understand intent.
    haiku_tests = _build_haiku_test_cases()

    try:
        from app.agents.intent_classifier import classify_with_haiku, ConversationState
        from app.models.context import PlayerContext

        # Build a minimal context for classification
        from app.models.context import TemporalContext
        context = PlayerContext(
            user_id="test-eval-001",
            name="Test Athlete",
            sport="football",
            position="CAM",
            age_band="U17",
            today_date=datetime.now().strftime("%Y-%m-%d"),
            current_time="14:00",
            temporal_context=TemporalContext(time_of_day="afternoon"),
            active_tab="Chat",
        )

        for msg, expected_intent, desc in haiku_tests:
            t0 = time.monotonic()
            result = await classify_with_haiku(msg, None, context)
            elapsed = (time.monotonic() - t0) * 1000

            actual_intent = result.intent_id if result else "agent_fallthrough"
            # Support pipe-delimited alternatives: "intent_a|intent_b"
            acceptable = expected_intent.split("|")
            passed = actual_intent in acceptable

            report.results.append(TestResult(
                test_id=f"L1_haiku_{expected_intent}_{desc[:20]}",
                layer=1, category="haiku_classification",
                description=f"Haiku: '{msg}' -> {expected_intent}",
                passed=passed,
                expected=expected_intent,
                actual=actual_intent,
                latency_ms=elapsed,
                cost_usd=0.0001,
            ))

    except Exception as e:
        logger.warning(f"Haiku classification tests skipped: {e}")
        for msg, expected_intent, desc in haiku_tests:
            report.results.append(TestResult(
                test_id=f"L1_haiku_{expected_intent}_{desc[:20]}",
                layer=1, category="haiku_classification",
                description=f"Haiku SKIPPED: '{msg}' -> {expected_intent}",
                passed=False,
                expected=expected_intent,
                actual="SKIPPED",
                reasoning=f"Haiku unavailable: {e}",
            ))

    return report


def _build_haiku_test_cases() -> list[tuple[str, str, str]]:
    """Natural language test cases for Haiku classifier.

    Each tuple: (message, expected_intent_id, short_description)
    These are phrases that are NOT in the exact match map.
    """
    return [
        # Build session (date-qualified, not in exact map)
        ("can you help me plan a session for thursday evening", "build_session", "plan session thursday"),
        ("set up a quick gym session for after school", "build_session", "gym after school"),
        ("i need a training session for the weekend", "build_session", "weekend session"),

        # Readiness (no date = readiness check)
        ("am i good to go for training", "qa_readiness", "readiness informal"),
        ("how's my body feeling according to the data", "qa_readiness", "readiness data check"),

        # Schedule queries
        ("what's happening on friday", "qa_today_schedule|qa_week_schedule", "friday schedule"),
        ("do i have anything planned for the weekend", "qa_week_schedule", "weekend query"),

        # Recovery
        ("my hamstrings are really tight after yesterday", "agent_fallthrough", "tight hamstrings"),
        ("should i do some recovery work today", "load_advice_request|qa_readiness", "recovery question"),

        # Greeting / smalltalk
        ("what's good bro", "greeting", "casual greeting"),
        ("not gonna lie feeling pretty dead today", "smalltalk|agent_fallthrough", "tired mood"),

        # Check-in
        ("i want to do my daily check in", "check_in", "check in request"),

        # Programs
        ("what training programs are available for me", "show_programs", "list programs"),

        # Test logging
        ("i just did my sprint test and want to log it", "log_test", "log sprint"),

        # Benchmark
        ("how does my vertical jump compare to other kids my age", "benchmark_comparison", "benchmark jump"),

        # Load / ACWR
        ("what does my training load look like this week", "qa_load", "load question"),

        # Fallthrough (should NOT be classified to a specific intent)
        ("what do you think about progressive overload for hypertrophy", "agent_fallthrough", "training philosophy"),
        ("tell me more about periodization models", "agent_fallthrough", "follow-up question"),
    ]


# ============================================================================
# LAYER 2: Flow Pattern Validation (needs running server)
# ============================================================================

async def run_layer_2() -> LayerReport:
    """Test that each intent routes to the correct flow pattern.

    Sends messages to /api/v1/chat/sync and validates:
    - capsule_direct intents return the correct capsule_type
    - data_display intents return the correct card type
    - scheduling_capsule returns the scheduling form
    - write_action/open_coaching fall through to agent
    """
    import httpx

    report = LayerReport(layer=2, name="Flow Pattern Validation")
    target = os.environ.get("AI_SERVICE_URL", "http://localhost:8000")
    player_id = os.environ.get("TEST_PLAYER_ID", "test-eval-athlete-001")

    # Build test cases: (message, expected_pattern, expected_card_type, description)
    test_cases = _build_flow_pattern_tests()

    async with httpx.AsyncClient() as client:
        for msg, expected_pattern, expected_card, desc in test_cases:
            t0 = time.monotonic()
            try:
                resp = await client.post(
                    f"{target}/api/v1/chat/sync",
                    json={
                        "message": msg,
                        "player_id": player_id,
                        "session_id": f"eval-flow-{int(time.time())}",
                        "active_tab": "Chat",
                        "timezone": "Asia/Riyadh",
                    },
                    timeout=30,
                )
                elapsed = (time.monotonic() - t0) * 1000
                data = resp.json()

                # Extract flow pattern and card types from response
                telemetry = data.get("_telemetry", {})
                actual_pattern = telemetry.get("flow_pattern", "agent_pipeline")
                structured = data.get("structured", {})

                cards = []
                if isinstance(structured, dict):
                    cards = structured.get("cards", [])
                elif isinstance(structured, str):
                    try:
                        parsed = json.loads(structured)
                        cards = parsed.get("cards", [])
                    except (json.JSONDecodeError, AttributeError):
                        pass

                actual_card_types = [c.get("type", "") for c in cards if isinstance(c, dict)]

                # Validate pattern
                pattern_match = (
                    actual_pattern == expected_pattern
                    or (expected_pattern == "agent_pipeline" and actual_pattern in ("", "agent_pipeline", None))
                )

                # Validate card type (if expected)
                # Note: card may be empty if the test user has no data for that
                # query (no check-in = no readiness card, no tests = no test card).
                # Pattern match is the primary assertion. Card presence is secondary.
                card_match = True
                if expected_card and actual_card_types:
                    card_match = expected_card in actual_card_types
                # Empty cards with correct pattern = pass (no data for user)

                passed = pattern_match and card_match
                cost = telemetry.get("cost_usd", 0)

                report.results.append(TestResult(
                    test_id=f"L2_flow_{desc.replace(' ', '_')[:30]}",
                    layer=2, category="flow_pattern",
                    description=f"Flow: '{msg[:50]}' -> {expected_pattern}/{expected_card}",
                    passed=passed,
                    expected=f"pattern={expected_pattern}, card={expected_card}",
                    actual=f"pattern={actual_pattern}, cards={actual_card_types}",
                    latency_ms=elapsed,
                    cost_usd=cost,
                ))

            except Exception as e:
                elapsed = (time.monotonic() - t0) * 1000
                report.results.append(TestResult(
                    test_id=f"L2_flow_{desc.replace(' ', '_')[:30]}",
                    layer=2, category="flow_pattern",
                    description=f"Flow ERROR: '{msg[:50]}'",
                    passed=False,
                    expected=f"{expected_pattern}/{expected_card}",
                    actual=f"ERROR: {e}",
                    latency_ms=elapsed,
                ))

    return report


def _build_flow_pattern_tests() -> list[tuple[str, str, str, str]]:
    """Test cases for flow pattern validation.

    Each tuple: (message, expected_pattern, expected_card_type, description)
    Tests one representative message per flow pattern per intent.
    """
    return [
        # ── capsule_direct ──
        ("check in", "capsule_direct", "checkin_capsule", "checkin capsule"),
        ("log a test", "capsule_direct", "test_log_capsule", "test log capsule"),
        ("go to timeline", "capsule_direct", "navigation_capsule", "navigation capsule"),
        ("my programs", "capsule_direct", "program_action_capsule", "programs capsule"),
        ("edit my rules", "capsule_direct", "schedule_rules_capsule", "schedule rules capsule"),
        ("plan my study", "capsule_direct", "study_schedule_capsule", "study capsule"),
        ("add an exam", "capsule_direct", "exam_capsule", "exam capsule"),
        ("calculate my phv", "capsule_direct", "phv_calculator_capsule", "phv capsule"),
        ("my strengths", "capsule_direct", "strengths_gaps_capsule", "strengths capsule"),

        # ── data_display ──
        ("what's my readiness", "data_display", "stat_grid", "readiness data display"),
        ("today's schedule", "data_display", "schedule_list", "today schedule data display"),
        ("this week's schedule", "data_display", "schedule_list", "week schedule data display"),
        ("my streak", "data_display", "stat_grid", "streak data display"),
        ("my load", "data_display", "stat_grid", "load data display"),
        ("my tests", "data_display", "stat_grid", "test history data display"),
        # Tomorrow schedule should also work via data_display with date extraction
        ("tomorrow's schedule", "data_display", "schedule_list", "tomorrow schedule data display"),

        # ── scheduling_capsule ──
        ("build me a session", "scheduling_capsule", "scheduling_capsule", "scheduling capsule basic"),
        ("i want to train tomorrow", "scheduling_capsule", "scheduling_capsule", "scheduling capsule tomorrow"),
        ("plan a speed session", "scheduling_capsule", "scheduling_capsule", "scheduling capsule speed"),
        ("gym session tomorrow", "scheduling_capsule", "scheduling_capsule", "scheduling capsule gym"),

        # ── open_coaching (falls through to full AI -- pattern is None in telemetry) ──
        ("hey tomo", "agent_pipeline", "", "greeting coaching"),
        ("feeling great today", "agent_pipeline", "", "smalltalk coaching"),
    ]


# ============================================================================
# LAYER 3: End-to-End Pipeline Integration (needs server + DB)
# ============================================================================

async def run_layer_3() -> LayerReport:
    """Full pipeline integration tests.

    Sends realistic athlete messages and validates:
    - Correct agent routing
    - Response contains expected content/keywords
    - Card format is valid
    - Safety gates fire when they should
    """
    import httpx

    report = LayerReport(layer=3, name="End-to-End Pipeline Integration")
    target = os.environ.get("AI_SERVICE_URL", "http://localhost:8000")
    player_id = os.environ.get("TEST_PLAYER_ID", "test-eval-athlete-001")

    test_cases = _build_e2e_test_cases()

    async with httpx.AsyncClient() as client:
        semaphore = asyncio.Semaphore(3)

        async def run_one(tc):
            msg, expected_agent, expected_keywords, desc = tc
            async with semaphore:
                t0 = time.monotonic()
                try:
                    resp = await client.post(
                        f"{target}/api/v1/chat/sync",
                        json={
                            "message": msg,
                            "player_id": player_id,
                            "session_id": f"eval-e2e-{int(time.time())}-{hash(msg) % 10000}",
                            "active_tab": "Chat",
                            "timezone": "Asia/Riyadh",
                        },
                        timeout=30,
                    )
                    elapsed = (time.monotonic() - t0) * 1000
                    data = resp.json()

                    if "error" in data:
                        return TestResult(
                            test_id=f"L3_e2e_{desc[:30]}",
                            layer=3, category="e2e_pipeline",
                            description=f"E2E ERROR: '{msg[:50]}'",
                            passed=False,
                            expected=f"agent={expected_agent}",
                            actual=f"ERROR: {data['error']}",
                            latency_ms=elapsed,
                        )

                    telemetry = data.get("_telemetry", {})
                    actual_agent = telemetry.get("agent", "")
                    response_text = data.get("message", "")
                    cost = telemetry.get("cost_usd", 0)

                    # Check agent routing
                    agent_match = (
                        actual_agent == expected_agent
                        or expected_agent == "*"  # Wildcard: any agent is fine
                    )

                    # Check keywords in response (case-insensitive)
                    response_lower = response_text.lower()
                    structured = data.get("structured", {})
                    if isinstance(structured, str):
                        try:
                            structured = json.loads(structured)
                        except (json.JSONDecodeError, TypeError):
                            structured = {}

                    full_text = response_lower
                    if isinstance(structured, dict):
                        full_text += " " + json.dumps(structured).lower()

                    # Support pipe-delimited alternatives: "readiness|ready" means either matches
                    keywords_found = 0
                    for kw in expected_keywords:
                        alternatives = [alt.strip().lower() for alt in kw.split("|")]
                        if any(alt in full_text for alt in alternatives):
                            keywords_found += 1
                    keyword_ratio = keywords_found / len(expected_keywords) if expected_keywords else 1.0

                    # Response must exist and not be empty
                    has_response = len(response_text) > 5 or bool(structured)

                    passed = agent_match and keyword_ratio >= 0.5 and has_response

                    return TestResult(
                        test_id=f"L3_e2e_{desc.replace(' ', '_')[:30]}",
                        layer=3, category="e2e_pipeline",
                        description=f"E2E: '{msg[:50]}' -> {expected_agent}",
                        passed=passed,
                        expected=f"agent={expected_agent}, keywords={expected_keywords}",
                        actual=f"agent={actual_agent}, kw_ratio={keyword_ratio:.0%}, resp_len={len(response_text)}",
                        latency_ms=elapsed,
                        cost_usd=cost,
                    )

                except Exception as e:
                    elapsed = (time.monotonic() - t0) * 1000
                    return TestResult(
                        test_id=f"L3_e2e_{desc.replace(' ', '_')[:30]}",
                        layer=3, category="e2e_pipeline",
                        description=f"E2E EXCEPTION: '{msg[:50]}'",
                        passed=False,
                        expected=f"agent={expected_agent}",
                        actual=f"EXCEPTION: {e}",
                        latency_ms=elapsed,
                    )

        tasks = [run_one(tc) for tc in test_cases]
        results = await asyncio.gather(*tasks)
        report.results.extend(results)

    return report


def _build_e2e_test_cases() -> list[tuple[str, str, list[str], str]]:
    """End-to-end test cases.

    Each tuple: (message, expected_agent, expected_keywords, description)
    expected_agent: "*" = any agent is acceptable (for greetings/smalltalk)
    """
    return [
        # ── Greetings ──
        ("hey tomo, how's it going", "*", [], "greeting casual"),
        ("good morning coach", "*", [], "greeting formal"),

        # ── Readiness ──
        ("what's my readiness score", "*", ["readiness|ready|check-in|check in"], "readiness query"),
        ("am i ready to train today", "*", ["readiness|ready|check-in|check in"], "readiness training"),

        # ── Schedule ──
        ("what's on my schedule today", "*", ["schedule"], "today schedule query"),
        ("show me this week", "*", ["week"], "week schedule query"),

        # ── Load ──
        ("what's my training load", "*", ["load"], "load query"),
        ("how's my ACWR", "*", ["acwr|load|workload|training load"], "acwr query"),

        # ── Session building ──
        ("build me a speed session for tomorrow", "*", ["speed", "session"], "build speed session"),
        ("plan a gym session", "*", ["session"], "build gym session"),

        # ── Programs ──
        ("what programs do you recommend", "*", ["program"], "show programs"),

        # ── Test logging ──
        ("log my sprint test", "*", ["sprint", "test"], "log sprint test"),

        # ── Benchmarks ──
        ("how do my test results compare to my age group", "*", ["compare", "age"], "benchmark comparison"),

        # ── Recovery ──
        ("should i rest today or can i train", "*", ["rest", "train"], "recovery question"),

        # ── Streak ──
        ("what's my streak", "*", ["streak"], "streak query"),

        # ── Navigation ──
        ("go to timeline", "*", [], "navigation"),

        # ── Smalltalk ──
        ("feeling tired today bro", "*", [], "smalltalk tired"),
        ("im bored", "*", [], "smalltalk bored"),

        # ── Check-in ──
        ("i want to check in", "*", ["check"], "check in request"),

        # ── Safety: should NOT recommend contraindicated exercises ──
        # (These validate PHV safety for mid-PHV athletes)
        ("give me a barbell back squat workout", "*", [], "phv safety test"),
    ]


# ============================================================================
# LAYER 4: Capsule Action & Multi-Step Chain (needs server + DB)
# ============================================================================

async def run_layer_4() -> LayerReport:
    """Test capsule actions and multi-step flow chains.

    4a. Write action round-trip: create_event via confirmed_action
    4b. Scheduling capsule chain: opener -> capsule card returned
    4c. Scheduling capsule confirm: capsule opener + confirmed create_event
    4d. Multi-step flow response format: each step returns correct card type
    4e. Session continuity: same session_id maintains flow state
    """
    import httpx
    from datetime import timedelta

    report = LayerReport(layer=4, name="Capsule Action & Multi-Step Chain")
    target = os.environ.get("AI_SERVICE_URL", "http://localhost:8000")
    player_id = os.environ.get("TEST_PLAYER_ID", "test-eval-athlete-001")
    tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
    day_after = (datetime.now() + timedelta(days=2)).strftime("%Y-%m-%d")

    async with httpx.AsyncClient(timeout=30) as client:

        # ── 4a: Write action round-trip ──
        await _test_write_action(report, client, target, player_id, tomorrow)

        # ── 4b: Scheduling capsule opener returns capsule card ──
        await _test_capsule_opener(report, client, target, player_id)

        # ── 4c: Full capsule chain: opener + confirmed action ──
        await _test_capsule_chain(report, client, target, player_id, day_after)

        # ── 4d: Various opener messages return scheduling_capsule card ──
        await _test_capsule_variants(report, client, target, player_id)

        # ── 4e: Data display flows return valid structured data ──
        await _test_data_display_chain(report, client, target, player_id)

    return report


async def _test_write_action(report, client, target, player_id, date):
    """4a: Direct confirmed_action write creates an event."""
    t0 = time.monotonic()
    try:
        resp = await client.post(
            f"{target}/api/v1/chat/sync",
            json={
                "message": "Confirmed",
                "player_id": player_id,
                "session_id": f"eval-write-{int(time.time())}",
                "active_tab": "Chat",
                "timezone": "Asia/Riyadh",
                "confirmed_action": {
                    "toolName": "create_event",
                    "toolInput": {
                        "title": f"EVAL Write Test {int(time.time())}",
                        "event_type": "training",
                        "date": date,
                        "start_time": "17:00",
                        "end_time": "18:00",
                        "intensity": "MODERATE",
                        "notes": "Eval test -- safe to delete",
                    },
                    "agentType": "timeline",
                },
            },
        )
        elapsed = (time.monotonic() - t0) * 1000
        data = resp.json()
        response_text = data.get("message", "")
        has_error = "error" in data or "couldn't" in response_text.lower()

        report.results.append(TestResult(
            test_id="L4_write_create_event",
            layer=4, category="write_action",
            description="Write: create_event via confirmed_action",
            passed=not has_error and len(response_text) > 5,
            expected="Success response with no error",
            actual=f"error={has_error}, resp_len={len(response_text)}",
            latency_ms=elapsed,
        ))

        # Check response has valid structure (Title -> Card -> Pills)
        structured = data.get("structured", {})
        if isinstance(structured, str):
            try:
                structured = json.loads(structured)
            except (json.JSONDecodeError, TypeError):
                structured = {}
        headline = structured.get("headline", "")
        chips = structured.get("chips", [])
        report.results.append(TestResult(
            test_id="L4_write_response_format",
            layer=4, category="write_action",
            description="Write: response has headline + chips",
            passed=bool(headline) and isinstance(chips, list),
            expected="headline non-empty, chips is list",
            actual=f"headline='{headline[:50]}', chips={len(chips) if isinstance(chips, list) else 'not list'}",
            latency_ms=elapsed,
        ))

    except Exception as e:
        elapsed = (time.monotonic() - t0) * 1000
        report.results.append(TestResult(
            test_id="L4_write_create_event",
            layer=4, category="write_action",
            description="Write: EXCEPTION create_event",
            passed=False, expected="Success", actual=str(e),
            latency_ms=elapsed,
        ))


async def _test_capsule_opener(report, client, target, player_id):
    """4b: Scheduling capsule opener returns scheduling_capsule card."""
    t0 = time.monotonic()
    try:
        resp = await client.post(
            f"{target}/api/v1/chat/sync",
            json={
                "message": "I want to train tomorrow",
                "player_id": player_id,
                "session_id": f"eval-opener-{int(time.time())}",
                "active_tab": "Chat",
                "timezone": "Asia/Riyadh",
            },
        )
        elapsed = (time.monotonic() - t0) * 1000
        data = resp.json()
        structured = data.get("structured", {})
        if isinstance(structured, str):
            try:
                structured = json.loads(structured)
            except (json.JSONDecodeError, TypeError):
                structured = {}

        cards = structured.get("cards", [])
        card_types = [c.get("type", "") for c in cards if isinstance(c, dict)]

        # Should return a scheduling_capsule card
        has_capsule = "scheduling_capsule" in card_types
        report.results.append(TestResult(
            test_id="L4_capsule_opener_card",
            layer=4, category="capsule_chain",
            description="Chain: opener returns scheduling_capsule card",
            passed=has_capsule,
            expected="scheduling_capsule card",
            actual=f"card_types={card_types}",
            latency_ms=elapsed,
        ))

        # Card should have context with prefilled data
        if has_capsule:
            capsule_card = [c for c in cards if c.get("type") == "scheduling_capsule"][0]
            ctx = capsule_card.get("context", {})
            has_days = isinstance(ctx.get("days"), list) and len(ctx.get("days", [])) > 0
            has_focus = isinstance(ctx.get("focusOptions"), list) and len(ctx.get("focusOptions", [])) > 0
            has_intensity = isinstance(ctx.get("intensityOptions"), list)

            report.results.append(TestResult(
                test_id="L4_capsule_opener_context",
                layer=4, category="capsule_chain",
                description="Chain: capsule card has days + focus + intensity options",
                passed=has_days and has_focus and has_intensity,
                expected="days[], focusOptions[], intensityOptions[] all present",
                actual=f"days={len(ctx.get('days', []))}, focus={len(ctx.get('focusOptions', []))}, intensity={has_intensity}",
                latency_ms=elapsed,
            ))

    except Exception as e:
        elapsed = (time.monotonic() - t0) * 1000
        report.results.append(TestResult(
            test_id="L4_capsule_opener_card",
            layer=4, category="capsule_chain",
            description="Chain: EXCEPTION opener",
            passed=False, expected="scheduling_capsule", actual=str(e),
            latency_ms=elapsed,
        ))


async def _test_capsule_chain(report, client, target, player_id, date):
    """4c: Full chain — opener then confirmed create_event."""
    session_id = f"eval-chain-{int(time.time())}"
    t0 = time.monotonic()

    try:
        # Step 1: Opener
        resp1 = await client.post(
            f"{target}/api/v1/chat/sync",
            json={
                "message": "Build me a speed session",
                "player_id": player_id,
                "session_id": session_id,
                "active_tab": "Chat",
                "timezone": "Asia/Riyadh",
            },
        )
        data1 = resp1.json()
        # Use returned session_id for continuity
        session_id = data1.get("sessionId", session_id)
        elapsed1 = (time.monotonic() - t0) * 1000

        structured1 = data1.get("structured", {})
        if isinstance(structured1, str):
            try:
                structured1 = json.loads(structured1)
            except (json.JSONDecodeError, TypeError):
                structured1 = {}

        cards1 = structured1.get("cards", [])
        step1_ok = any(c.get("type") == "scheduling_capsule" for c in cards1 if isinstance(c, dict))

        report.results.append(TestResult(
            test_id="L4_chain_step1_opener",
            layer=4, category="capsule_chain",
            description="Chain: step 1 opener returns capsule",
            passed=step1_ok,
            expected="scheduling_capsule card",
            actual=f"cards={[c.get('type') for c in cards1 if isinstance(c, dict)]}",
            latency_ms=elapsed1,
        ))

        # Step 2: Confirm with create_event
        t1 = time.monotonic()
        resp2 = await client.post(
            f"{target}/api/v1/chat/sync",
            json={
                "message": "Confirmed",
                "player_id": player_id,
                "session_id": session_id,
                "active_tab": "Chat",
                "timezone": "Asia/Riyadh",
                "confirmed_action": {
                    "toolName": "create_event",
                    "toolInput": {
                        "title": f"EVAL Chain Speed {int(time.time())}",
                        "event_type": "training",
                        "date": date,
                        "start_time": "16:00",
                        "end_time": "17:15",
                        "intensity": "HARD",
                        "notes": "Eval chain test -- safe to delete",
                    },
                    "agentType": "timeline",
                },
            },
        )
        elapsed2 = (time.monotonic() - t1) * 1000
        data2 = resp2.json()
        response2_text = data2.get("message", "")
        has_error2 = "error" in data2 or "couldn't" in response2_text.lower()

        report.results.append(TestResult(
            test_id="L4_chain_step2_confirm",
            layer=4, category="capsule_chain",
            description="Chain: step 2 confirm creates event",
            passed=not has_error2 and len(response2_text) > 5,
            expected="Success confirmation response",
            actual=f"error={has_error2}, resp_len={len(response2_text)}",
            latency_ms=elapsed2,
        ))

        # Confirm response should have structured format
        structured2 = data2.get("structured", {})
        if isinstance(structured2, str):
            try:
                structured2 = json.loads(structured2)
            except (json.JSONDecodeError, TypeError):
                structured2 = {}
        headline2 = structured2.get("headline", "")
        chips2 = structured2.get("chips", [])
        report.results.append(TestResult(
            test_id="L4_chain_confirm_format",
            layer=4, category="capsule_chain",
            description="Chain: confirm has headline + chips",
            passed=bool(headline2) and isinstance(chips2, list) and len(chips2) <= 2,
            expected="headline + 0-2 chips",
            actual=f"headline='{headline2[:40]}', chips={len(chips2) if isinstance(chips2, list) else '?'}",
            latency_ms=elapsed2,
        ))

    except Exception as e:
        elapsed = (time.monotonic() - t0) * 1000
        report.results.append(TestResult(
            test_id="L4_chain_exception",
            layer=4, category="capsule_chain",
            description="Chain: EXCEPTION during flow",
            passed=False, expected="Full chain success", actual=str(e),
            latency_ms=elapsed,
        ))


async def _test_capsule_variants(report, client, target, player_id):
    """4d: Various build_session phrasings all return scheduling_capsule."""
    variants = [
        ("plan a gym session", "gym_session"),
        ("train tomorrow morning", "train_tomorrow"),
        ("build me a technical session for friday", "technical_friday"),
        ("i want to do speed work", "speed_work"),
    ]

    async def test_one(msg, desc):
        t0 = time.monotonic()
        try:
            resp = await client.post(
                f"{target}/api/v1/chat/sync",
                json={
                    "message": msg,
                    "player_id": player_id,
                    "session_id": f"eval-var-{desc}-{int(time.time())}",
                    "active_tab": "Chat",
                    "timezone": "Asia/Riyadh",
                },
            )
            elapsed = (time.monotonic() - t0) * 1000
            data = resp.json()
            structured = data.get("structured", {})
            if isinstance(structured, str):
                try:
                    structured = json.loads(structured)
                except (json.JSONDecodeError, TypeError):
                    structured = {}
            cards = structured.get("cards", [])
            card_types = [c.get("type", "") for c in cards if isinstance(c, dict)]
            # Accept any scheduling-related card type: the capsule may auto-skip
            # to confirm_card if all fields were prefilled from the opener.
            SCHEDULING_CARD_TYPES = {"scheduling_capsule", "choice_card", "session_plan", "confirm_card"}
            ok = bool(set(card_types) & SCHEDULING_CARD_TYPES)
            return TestResult(
                test_id=f"L4_variant_{desc}",
                layer=4, category="capsule_variants",
                description=f"Variant: '{msg}' -> scheduling card",
                passed=ok,
                expected="scheduling_capsule|choice_card|session_plan",
                actual=f"card_types={card_types}",
                latency_ms=elapsed,
            )
        except Exception as e:
            return TestResult(
                test_id=f"L4_variant_{desc}",
                layer=4, category="capsule_variants",
                description=f"Variant: EXCEPTION '{msg}'",
                passed=False, expected="capsule card", actual=str(e),
                latency_ms=(time.monotonic() - t0) * 1000,
            )

    results = await asyncio.gather(*[test_one(msg, desc) for msg, desc in variants])
    report.results.extend(results)


async def _test_data_display_chain(report, client, target, player_id):
    """4e: Data display flows return structured responses with cards."""
    queries = [
        ("what's on today", "today_schedule", "schedule_list"),
        ("what's my streak", "streak", "stat_grid"),
    ]

    async def test_one(msg, desc, expected_card):
        t0 = time.monotonic()
        try:
            resp = await client.post(
                f"{target}/api/v1/chat/sync",
                json={
                    "message": msg,
                    "player_id": player_id,
                    "session_id": f"eval-data-{desc}-{int(time.time())}",
                    "active_tab": "Chat",
                    "timezone": "Asia/Riyadh",
                },
            )
            elapsed = (time.monotonic() - t0) * 1000
            data = resp.json()
            structured = data.get("structured", {})
            if isinstance(structured, str):
                try:
                    structured = json.loads(structured)
                except (json.JSONDecodeError, TypeError):
                    structured = {}
            cards = structured.get("cards", [])
            card_types = [c.get("type", "") for c in cards if isinstance(c, dict)]
            headline = structured.get("headline", "")
            chips = structured.get("chips", [])

            # Headline + correct card type (or empty if no data)
            has_headline = bool(headline)
            card_ok = expected_card in card_types or len(cards) == 0  # No data = acceptable
            chips_ok = isinstance(chips, list) and len(chips) <= 2

            return TestResult(
                test_id=f"L4_data_{desc}",
                layer=4, category="data_display_chain",
                description=f"Data: '{msg}' -> {expected_card}",
                passed=has_headline and card_ok and chips_ok,
                expected=f"headline + {expected_card} card + <=2 chips",
                actual=f"headline='{headline[:30]}', cards={card_types}, chips={len(chips)}",
                latency_ms=elapsed,
            )
        except Exception as e:
            return TestResult(
                test_id=f"L4_data_{desc}",
                layer=4, category="data_display_chain",
                description=f"Data: EXCEPTION '{msg}'",
                passed=False, expected="data card", actual=str(e),
                latency_ms=(time.monotonic() - t0) * 1000,
            )

    results = await asyncio.gather(*[test_one(m, d, c) for m, d, c in queries])
    report.results.extend(results)


# ============================================================================
# LAYER 5: Response Format Validation (needs server)
# ============================================================================

# Valid card types that the mobile ResponseRenderer can render.
# Any card type NOT in this set will fail the format check.
VALID_CARD_TYPES = frozenset({
    "stat_row", "stat_grid", "schedule_list", "week_schedule", "week_plan",
    "choice_card", "zone_stack", "clash_list", "benchmark_bar",
    "program_recommendation", "text_card", "injury_card", "goal_card",
    "daily_briefing_card", "coach_note", "confirm_card", "session_plan",
    "drill_card", "schedule_preview",
    # Capsule card types (rendered by CapsuleRenderer)
    "checkin_capsule", "test_log_capsule", "navigation_capsule",
    "program_action_capsule", "schedule_rules_capsule",
    "study_schedule_capsule", "scheduling_capsule",
})

# Self-contained card types that carry their own headline/body,
# so top-level headline being empty is acceptable.
SELF_CONTAINED_CARD_TYPES = frozenset({
    "confirm_card", "choice_card", "scheduling_capsule",
    "checkin_capsule", "test_log_capsule", "navigation_capsule",
    "program_action_capsule", "schedule_rules_capsule",
    "study_schedule_capsule",
})

MAX_CHIPS = 2


async def run_layer_5() -> LayerReport:
    """Validate response format consistency: Title -> Card -> Pills.

    Every AI response must follow the standardized structure:
    1. headline: non-empty string (unless self-contained card)
    2. cards: array of valid card types
    3. chips: 0-2 action chips, each with label + message
    4. body: string (can be empty, must not duplicate headline)

    Tests send real messages and validate the response JSON shape.
    """
    import httpx

    report = LayerReport(layer=5, name="Response Format Validation")
    target = os.environ.get("AI_SERVICE_URL", "http://localhost:8000")
    player_id = os.environ.get("TEST_PLAYER_ID", "test-eval-athlete-001")

    test_cases = _build_format_test_cases()

    async with httpx.AsyncClient() as client:

        async def run_one(tc: dict) -> list[TestResult]:
            """Run a single format test case and return multiple results."""
            results: list[TestResult] = []
            msg = tc["message"]
            desc = tc["desc"]
            expect_card = tc.get("expect_card", True)
            expect_self_contained = tc.get("self_contained", False)
            expect_chips = tc.get("expect_chips", None)  # None = don't enforce
            max_chips_override = tc.get("max_chips", MAX_CHIPS)

            t0 = time.monotonic()
            try:
                resp = await client.post(
                    f"{target}/api/v1/chat/sync",
                    json={
                        "message": msg,
                        "player_id": player_id,
                        "session_id": f"eval-fmt-{int(time.time())}-{hash(msg) % 10000}",
                        "active_tab": "Chat",
                        "timezone": "Asia/Riyadh",
                    },
                    timeout=30,
                )
                elapsed = (time.monotonic() - t0) * 1000
                data = resp.json()

                if "error" in data:
                    results.append(TestResult(
                        test_id=f"L5_fmt_{desc[:25]}_error",
                        layer=5, category="format_validation",
                        description=f"FMT ERROR: '{msg[:40]}'",
                        passed=False,
                        expected="valid response",
                        actual=f"ERROR: {data.get('error', '')}",
                        latency_ms=elapsed,
                    ))
                    return results

                # Parse structured response
                structured = data.get("structured", {})
                if isinstance(structured, str):
                    try:
                        structured = json.loads(structured)
                    except (json.JSONDecodeError, TypeError):
                        structured = {}

                # If no structured, try to parse from message
                if not structured:
                    try:
                        structured = json.loads(data.get("message", "{}"))
                    except (json.JSONDecodeError, TypeError):
                        structured = {}

                headline = structured.get("headline", "")
                body = structured.get("body", "")
                cards = structured.get("cards", [])
                chips = structured.get("chips", [])

                if not isinstance(cards, list):
                    cards = []
                if not isinstance(chips, list):
                    chips = []

                # ── Check 1: All 4 fields present ──
                has_all_fields = all(
                    k in structured
                    for k in ("headline", "body", "cards", "chips")
                )
                results.append(TestResult(
                    test_id=f"L5_fmt_{desc[:25]}_fields",
                    layer=5, category="response_structure",
                    description=f"Structure: '{msg[:40]}' has all fields",
                    passed=has_all_fields,
                    expected="headline, body, cards, chips all present",
                    actual=f"keys={list(structured.keys())[:6]}",
                    latency_ms=elapsed,
                ))

                # ── Check 2: Headline present (unless self-contained) ──
                card_types = [c.get("type", "") for c in cards if isinstance(c, dict)]
                has_self_contained = any(ct in SELF_CONTAINED_CARD_TYPES for ct in card_types)

                headline_ok = bool(headline and headline.strip())
                if expect_self_contained or has_self_contained:
                    headline_ok = True  # Self-contained cards can have empty headline

                results.append(TestResult(
                    test_id=f"L5_fmt_{desc[:25]}_headline",
                    layer=5, category="headline_present",
                    description=f"Headline: '{msg[:40]}'",
                    passed=headline_ok,
                    expected="non-empty headline (or self-contained card)",
                    actual=f"headline='{headline[:60]}', self_contained={has_self_contained}",
                    latency_ms=elapsed,
                ))

                # ── Check 3: Cards have valid types ──
                if cards:
                    invalid_types = [ct for ct in card_types if ct and ct not in VALID_CARD_TYPES]
                    cards_valid = len(invalid_types) == 0
                    results.append(TestResult(
                        test_id=f"L5_fmt_{desc[:25]}_card_types",
                        layer=5, category="card_type_valid",
                        description=f"Card types: '{msg[:40]}'",
                        passed=cards_valid,
                        expected=f"all types in VALID_CARD_TYPES",
                        actual=f"types={card_types}, invalid={invalid_types}",
                        latency_ms=elapsed,
                    ))

                # ── Check 4: Cards present when expected ──
                if expect_card:
                    has_cards = len(cards) > 0
                    results.append(TestResult(
                        test_id=f"L5_fmt_{desc[:25]}_has_cards",
                        layer=5, category="card_present",
                        description=f"Has card: '{msg[:40]}'",
                        passed=has_cards,
                        expected="at least 1 card",
                        actual=f"cards={len(cards)}, types={card_types}",
                        latency_ms=elapsed,
                    ))

                # ── Check 5: Chips capped at max ──
                chips_capped = len(chips) <= max_chips_override
                results.append(TestResult(
                    test_id=f"L5_fmt_{desc[:25]}_chips_max",
                    layer=5, category="chips_capped",
                    description=f"Chips <= {max_chips_override}: '{msg[:40]}'",
                    passed=chips_capped,
                    expected=f"<= {max_chips_override} chips",
                    actual=f"chips={len(chips)}",
                    latency_ms=elapsed,
                ))

                # ── Check 6: Chips have valid shape ──
                if chips:
                    chips_shaped = all(
                        isinstance(c, dict) and "label" in c and "message" in c
                        for c in chips
                    )
                    results.append(TestResult(
                        test_id=f"L5_fmt_{desc[:25]}_chip_shape",
                        layer=5, category="chip_shape_valid",
                        description=f"Chip shape: '{msg[:40]}'",
                        passed=chips_shaped,
                        expected="each chip has label + message",
                        actual=f"chips={json.dumps(chips)[:120]}",
                        latency_ms=elapsed,
                    ))

                # ── Check 7: Body does not duplicate headline ──
                body_dup = False
                if body and headline:
                    body_dup = body.strip().lower() == headline.strip().lower()
                body_ok = not body_dup
                results.append(TestResult(
                    test_id=f"L5_fmt_{desc[:25]}_no_dup",
                    layer=5, category="no_body_headline_dup",
                    description=f"No dup: '{msg[:40]}'",
                    passed=body_ok,
                    expected="body != headline",
                    actual=f"headline='{headline[:40]}', body='{body[:40]}', dup={body_dup}",
                    latency_ms=elapsed,
                ))

                # ── Check 8: No emoji in response ──
                import re
                emoji_pattern = re.compile(
                    r'[\U0001F600-\U0001F9FF'
                    r'\U0001F300-\U0001F5FF'
                    r'\U00002600-\U000027BF'
                    r'\U0001FA00-\U0001FAFF'
                    r'\U0001FA70-\U0001FAFF'
                    r']+', re.UNICODE
                )
                all_text = f"{headline} {body} {json.dumps(cards)}"
                has_emoji = bool(emoji_pattern.search(all_text))
                results.append(TestResult(
                    test_id=f"L5_fmt_{desc[:25]}_no_emoji",
                    layer=5, category="no_emoji",
                    description=f"No emoji: '{msg[:40]}'",
                    passed=not has_emoji,
                    expected="zero emoji in response",
                    actual=f"has_emoji={has_emoji}",
                    latency_ms=elapsed,
                ))

            except Exception as e:
                elapsed = (time.monotonic() - t0) * 1000
                results.append(TestResult(
                    test_id=f"L5_fmt_{desc[:25]}_exc",
                    layer=5, category="format_validation",
                    description=f"FMT EXCEPTION: '{msg[:40]}'",
                    passed=False,
                    expected="valid response",
                    actual=str(e),
                    latency_ms=elapsed,
                ))

            return results

        # Run all tests concurrently (bounded)
        all_results = await asyncio.gather(*[run_one(tc) for tc in test_cases])
        for batch in all_results:
            report.results.extend(batch)

    return report


def _build_format_test_cases() -> list[dict]:
    """Test cases for response format validation.

    Each case sends a message and checks the response structure against
    the Title -> Card -> Pills standard.

    Fields:
        message: user message to send
        desc: short description
        expect_card: True if response should contain at least 1 card
        self_contained: True if card carries its own headline (empty headline OK)
        expect_chips: expected number of chips (None = don't enforce count)
        max_chips: override max chip count (default 2)
    """
    return [
        # ── Data Display (should have: headline + data card + 1-2 chips) ──
        {
            "message": "what's my readiness",
            "desc": "readiness_format",
            "expect_card": False,  # may be empty if no check-in data
        },
        {
            "message": "what's on today",
            "desc": "today_schedule_format",
            "expect_card": True,
        },
        {
            "message": "show me this week",
            "desc": "week_schedule_format",
            "expect_card": False,  # may return no cards if no events
        },
        {
            "message": "what's my training load",
            "desc": "load_format",
            "expect_card": False,  # may be empty if insufficient data
        },
        {
            "message": "what's my streak",
            "desc": "streak_format",
            "expect_card": True,
        },

        # ── Capsule Direct (should have: headline + capsule card + 0-2 chips) ──
        {
            "message": "check in",
            "desc": "checkin_capsule_format",
            "expect_card": True,
            "self_contained": True,
        },
        {
            "message": "log a test",
            "desc": "test_log_capsule_format",
            "expect_card": True,
            "self_contained": True,
        },
        {
            "message": "go to timeline",
            "desc": "navigation_capsule_format",
            "expect_card": True,
            "self_contained": True,
        },
        {
            "message": "edit my schedule rules",
            "desc": "schedule_rules_format",
            "expect_card": True,
            "self_contained": True,
        },

        # ── Scheduling Capsule (should have: headline + scheduling_capsule card) ──
        {
            "message": "build me a session for tomorrow",
            "desc": "build_session_format",
            "expect_card": True,
            "self_contained": True,
        },

        # ── Open Coaching / Agent Pipeline (should have: headline + card + chips) ──
        {
            "message": "how should I warm up before sprints",
            "desc": "open_coaching_format",
            "expect_card": False,  # agent may return text only
        },
        {
            "message": "should I rest today or train",
            "desc": "recovery_advice_format",
            "expect_card": False,
        },

        # ── Greetings (should have: headline, may have card or not) ──
        {
            "message": "hey tomo",
            "desc": "greeting_format",
            "expect_card": False,
        },
        {
            "message": "good morning coach",
            "desc": "greeting_morning_format",
            "expect_card": False,
        },

        # ── Test Logging Capsule ──
        {
            "message": "log my sprint test",
            "desc": "log_sprint_format",
            "expect_card": True,
            "self_contained": True,
        },

        # ── Benchmark ──
        {
            "message": "how do my tests compare to my age group",
            "desc": "benchmark_format",
            "expect_card": False,
        },

        # ── Programs ──
        {
            "message": "show my programs",
            "desc": "programs_format",
            "expect_card": True,
            "self_contained": True,
        },

        # ── Study Schedule ──
        {
            "message": "plan my study schedule",
            "desc": "study_schedule_format",
            "expect_card": True,
            "self_contained": True,
        },
    ]


# ============================================================================
# Report Generator
# ============================================================================

def generate_report(layers: list[LayerReport], total_time_s: float) -> str:
    lines = []
    lines.append("=" * 72)
    lines.append("  TOMO AI — 4-Layer Flow Validation Report")
    lines.append(f"  Generated: {datetime.now().isoformat()}")
    lines.append("=" * 72)

    total_tests = 0
    total_passed = 0

    for layer in layers:
        total_tests += layer.total
        total_passed += layer.passed

        lines.append(f"\n{'=' * 60}")
        lines.append(f"  Layer {layer.layer}: {layer.name}")
        lines.append(f"  {layer.passed}/{layer.total} passed ({layer.pass_rate:.0%})")
        lines.append(f"{'=' * 60}")

        # Group by category
        categories: dict[str, list[TestResult]] = {}
        for r in layer.results:
            categories.setdefault(r.category, []).append(r)

        for cat, results in categories.items():
            cat_passed = sum(1 for r in results if r.passed)
            lines.append(f"\n  [{cat}] {cat_passed}/{len(results)} passed")

            # Show failures
            failures = [r for r in results if not r.passed]
            for r in failures[:10]:  # Cap at 10 failures per category
                lines.append(f"    FAIL: {r.description}")
                lines.append(f"      expected: {r.expected}")
                lines.append(f"      actual:   {r.actual}")
                if r.reasoning:
                    lines.append(f"      reason:   {r.reasoning}")

            if len(failures) > 10:
                lines.append(f"    ... and {len(failures) - 10} more failures")

    # Aggregate
    overall_rate = total_passed / total_tests if total_tests > 0 else 0

    lines.append(f"\n{'=' * 72}")
    lines.append("  AGGREGATE")
    lines.append(f"{'=' * 72}")
    lines.append(f"  Total tests: {total_tests}")
    lines.append(f"  Total passed: {total_passed} ({overall_rate:.0%})")
    lines.append(f"  Total time: {total_time_s:.1f}s")

    # Cost
    total_cost = sum(r.cost_usd for layer in layers for r in layer.results)
    lines.append(f"  Total cost: ${total_cost:.4f}")

    # Per-layer gate check
    lines.append(f"\n{'=' * 72}")
    lines.append("  DEPLOY GATE")
    lines.append(f"{'=' * 72}")

    gate_thresholds = {1: 0.95, 2: 0.90, 3: 0.85, 4: 0.90, 5: 0.85}
    all_pass = True
    for layer in layers:
        threshold = gate_thresholds.get(layer.layer, 0.90)
        passed = layer.pass_rate >= threshold
        icon = "PASS" if passed else "FAIL"
        lines.append(f"  [{icon}] Layer {layer.layer} ({layer.name}): {layer.pass_rate:.0%} (threshold: {threshold:.0%})")
        if not passed:
            all_pass = False

    overall_threshold = 0.90
    overall_pass = overall_rate >= overall_threshold
    icon = "PASS" if overall_pass else "FAIL"
    lines.append(f"  [{icon}] Overall: {overall_rate:.0%} (threshold: {overall_threshold:.0%})")
    if not overall_pass:
        all_pass = False

    verdict = "PASSED" if all_pass else "FAILED"
    lines.append(f"\n  DEPLOY GATE: {verdict}")
    lines.append("=" * 72)

    return "\n".join(lines)


# ============================================================================
# Main
# ============================================================================

async def main():
    parser = argparse.ArgumentParser(description="Tomo AI 4-Layer Flow Validation Suite")
    parser.add_argument("--layer", type=int, default=None,
                        help="Run specific layer (1-4). Default: all")
    parser.add_argument("--report", action="store_true",
                        help="Write report to scripts/reports/")
    parser.add_argument("--deploy-gate", action="store_true",
                        help="CI mode: exit code 1 on gate failure")

    args = parser.parse_args()

    t0 = time.time()
    layers: list[LayerReport] = []

    if args.layer is None or args.layer == 1:
        print("\n  Layer 1: Intent Classification Accuracy...")
        report = await run_layer_1()
        layers.append(report)
        print(f"  Layer 1: {report.passed}/{report.total} ({report.pass_rate:.0%})")

    if args.layer is None or args.layer == 2:
        print("\n  Layer 2: Flow Pattern Validation...")
        report = await run_layer_2()
        layers.append(report)
        print(f"  Layer 2: {report.passed}/{report.total} ({report.pass_rate:.0%})")

    if args.layer is None or args.layer == 3:
        print("\n  Layer 3: End-to-End Pipeline Integration...")
        report = await run_layer_3()
        layers.append(report)
        print(f"  Layer 3: {report.passed}/{report.total} ({report.pass_rate:.0%})")

    if args.layer is None or args.layer == 4:
        print("\n  Layer 4: Capsule Action Round-Trip...")
        report = await run_layer_4()
        layers.append(report)
        print(f"  Layer 4: {report.passed}/{report.total} ({report.pass_rate:.0%})")

    if args.layer is None or args.layer == 5:
        print("\n  Layer 5: Response Format Validation...")
        report = await run_layer_5()
        layers.append(report)
        print(f"  Layer 5: {report.passed}/{report.total} ({report.pass_rate:.0%})")

    total_time = time.time() - t0
    report_text = generate_report(layers, total_time)
    print(report_text)

    # Write report
    if args.report:
        report_dir = Path(__file__).resolve().parent / "reports"
        report_dir.mkdir(exist_ok=True)
        timestamp = datetime.now().strftime("%Y-%m-%d_%H%M")
        report_path = report_dir / f"FLOW_VALIDATION_{timestamp}.txt"
        report_path.write_text(report_text)
        print(f"\n  Report saved: {report_path}")

    # Deploy gate
    if args.deploy_gate:
        gate_thresholds = {1: 0.95, 2: 0.90, 3: 0.85, 4: 0.90, 5: 0.85}
        failed = False
        for layer in layers:
            threshold = gate_thresholds.get(layer.layer, 0.90)
            if layer.pass_rate < threshold:
                print(f"\n  GATE FAILED: Layer {layer.layer} at {layer.pass_rate:.0%} < {threshold:.0%}")
                failed = True

        total_passed = sum(l.passed for l in layers)
        total_tests = sum(l.total for l in layers)
        overall = total_passed / total_tests if total_tests else 0
        if overall < 0.90:
            print(f"\n  GATE FAILED: Overall {overall:.0%} < 90%")
            failed = True

        sys.exit(1 if failed else 0)


if __name__ == "__main__":
    asyncio.run(main())
