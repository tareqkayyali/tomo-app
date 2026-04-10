"""
Tomo AI Service — 5-Way Agent Router
Python equivalent of routeToAgents() from TypeScript orchestrator.ts.

Routes user messages to one or more specialized agents:
  - timeline: scheduling, calendar, events, exams, study plans
  - output: readiness, performance, drills, programs, benchmarks
  - mastery: progress, CV, achievements, streaks, milestones
  - settings: goals, injury, nutrition, sleep, profile, notifications
  - planning: plan generation, mode switching, protocols

Includes tiebreaker rules when multiple agents match.
"""

from __future__ import annotations

import logging
import re
from typing import Optional

logger = logging.getLogger("tomo-ai.router")


AgentType = str  # timeline | output | mastery | settings | planning


# ── Keyword signal patterns ──────────────────────────────────────────

OUTPUT_PATTERNS = [
    re.compile(r"\breadiness\b", re.I),
    re.compile(r"\btired\b", re.I),
    re.compile(r"\benergy\b", re.I),
    re.compile(r"\bsleep\b", re.I),
    re.compile(r"\brecovery\b", re.I),
    re.compile(r"\bvitals?\b", re.I),
    re.compile(r"\bcheck.?in\b", re.I),
    re.compile(r"\bscore\b", re.I),
    re.compile(r"\bmetric\b", re.I),
    re.compile(r"\bcompare\b", re.I),
    re.compile(r"\bbenchmark\b", re.I),
    re.compile(r"\bpercentile\b", re.I),
    re.compile(r"\btest result\b", re.I),
    re.compile(r"\bweakness\b", re.I),
    re.compile(r"\bgap\b", re.I),
    re.compile(r"\bstrength\b", re.I),
    re.compile(r"\bdrill\b", re.I),
    re.compile(r"\bexercise\b", re.I),
    re.compile(r"\bworkout\b", re.I),
    re.compile(r"\bprogram\b", re.I),
    re.compile(r"\bload\b", re.I),
    re.compile(r"\bacwr\b", re.I),
]

TIMELINE_PATTERNS = [
    re.compile(r"\bschedule\b", re.I),
    re.compile(r"\bcalendar\b", re.I),
    re.compile(r"\bevent\b", re.I),
    re.compile(r"\bexam\b", re.I),
    re.compile(r"\bstudy\b", re.I),
    re.compile(r"\bsession\b", re.I),
    re.compile(r"\btraining\b", re.I),
    re.compile(r"\bmatch\b", re.I),
    re.compile(r"\breschedule\b", re.I),
    re.compile(r"\bedit\b", re.I),
    re.compile(r"\bmove\b", re.I),
    re.compile(r"\bwhen\b", re.I),
    re.compile(r"\bplan\b", re.I),
    re.compile(r"\block\b", re.I),
]

MASTERY_PATTERNS = [
    re.compile(r"\bprogress\b", re.I),
    re.compile(r"\bimprove\b", re.I),
    re.compile(r"\bcv\b", re.I),
    re.compile(r"\bprofile\b", re.I),
    re.compile(r"\bachievement\b", re.I),
    re.compile(r"\bmilestone\b", re.I),
    re.compile(r"\brecruit\b", re.I),
    re.compile(r"\bscout\b", re.I),
    re.compile(r"\btrajectory\b", re.I),
    re.compile(r"\bhistory\b", re.I),
    re.compile(r"\bpr\b", re.I),
    re.compile(r"\bstreak\b", re.I),
]

SETTINGS_PATTERNS = [
    re.compile(r"\bgoal\b", re.I),
    re.compile(r"\binjur", re.I),
    re.compile(r"\bpain\b", re.I),
    re.compile(r"\bhurt\b", re.I),
    re.compile(r"\bsore\b", re.I),
    re.compile(r"\bnutrition\b", re.I),
    re.compile(r"\bfood\b", re.I),
    re.compile(r"\bmeal\b", re.I),
    re.compile(r"\bunits\b", re.I),
    re.compile(r"\bimperial\b", re.I),
    re.compile(r"\bmetric\b", re.I),
    re.compile(r"\bwearable\b", re.I),
    re.compile(r"\bwhoop\b", re.I),
    re.compile(r"\bfeedback\b", re.I),
    re.compile(r"\bdrill library\b", re.I),
    re.compile(r"\bjournal\b", re.I),
]

PLANNING_PATTERNS = [
    re.compile(r"\bplan\s+(?:my\s+)?training\b", re.I),
    re.compile(r"\btraining\s+plan\b", re.I),
    re.compile(r"\bplan\s+(?:my\s+)?study\b", re.I),
    re.compile(r"\bplan\s+(?:my\s+)?week\b", re.I),
    re.compile(r"\bplan\s+(?:my\s+)?(?:training\s+)?week\b", re.I),
    re.compile(r"\bchange\s+mode\b", re.I),
    re.compile(r"\bswitch\s+(?:to\s+)?(?:study|rest|league|balanced)\b", re.I),
    re.compile(r"\bprotocol\b", re.I),
    re.compile(r"\bscheduling\s+rule\b", re.I),
    re.compile(r"\bmode\s+(?:change|switch|options?)\b", re.I),
]


# ── Tiebreaker rules ────────────────────────────────────────────────

TIEBREAKER_RULES: list[tuple[re.Pattern, AgentType]] = [
    # Output wins for:
    (re.compile(r"generat.*session|build.*session", re.I), "output"),
    (re.compile(r"readiness|energy|sleep.*score|vitals", re.I), "output"),
    (re.compile(r"load|overload|acwr", re.I), "output"),
    (re.compile(r"drill|exercise|workout", re.I), "output"),
    # Mastery wins for:
    (re.compile(r"trajectory|trend.*over|progress.*over.*time", re.I), "mastery"),
    (re.compile(r"achievement|milestone|pr\b|streak", re.I), "mastery"),
    # Timeline wins for:
    (re.compile(r"schedule.*conflict|clash", re.I), "timeline"),
    (re.compile(r"add.*event|create.*event|delete.*event", re.I), "timeline"),
    # Planning wins for:
    (re.compile(r"plan.*training|training.*plan", re.I), "planning"),
    (re.compile(r"change.*mode|switch.*mode", re.I), "planning"),
]


# ── Tab-to-agent affinity ────────────────────────────────────────────

TAB_AGENT_AFFINITY: dict[str, AgentType] = {
    "Timeline": "timeline",
    "Output": "output",
    "Mastery": "mastery",
    "OwnIt": "output",
    "Chat": "output",
}


# ── Main routing function ────────────────────────────────────────────

def route_to_agents(
    message: str,
    active_tab: str = "Chat",
    last_agent_type: Optional[str] = None,
) -> list[AgentType]:
    """
    Route a user message to one or more agents.
    Returns ordered list of agent types (primary first).

    Routing signals:
      1. Keyword pattern matching
      2. Active tab affinity
      3. Conversation continuity (last agent lock)
      4. Tiebreaker rules for multi-agent conflicts
    """
    candidates: set[AgentType] = set()
    msg_lower = message.lower()

    # Check each agent's keyword patterns
    if any(p.search(msg_lower) for p in OUTPUT_PATTERNS):
        candidates.add("output")
    if any(p.search(msg_lower) for p in TIMELINE_PATTERNS):
        candidates.add("timeline")
    if any(p.search(msg_lower) for p in MASTERY_PATTERNS):
        candidates.add("mastery")
    if any(p.search(msg_lower) for p in SETTINGS_PATTERNS):
        candidates.add("settings")
    if any(p.search(msg_lower) for p in PLANNING_PATTERNS):
        candidates.add("planning")

    # Tab affinity (adds agent if no other signal)
    tab_agent = TAB_AGENT_AFFINITY.get(active_tab, "output")
    if not candidates:
        candidates.add(tab_agent)

    # If single candidate, return it
    if len(candidates) == 1:
        return list(candidates)

    # Multiple candidates — apply tiebreaker rules
    for pattern, winner in TIEBREAKER_RULES:
        if pattern.search(msg_lower) and winner in candidates:
            # Winner goes first, others follow
            others = [a for a in candidates if a != winner]
            return [winner] + others

    # No tiebreaker hit — use tab affinity as primary
    if tab_agent in candidates:
        others = [a for a in candidates if a != tab_agent]
        return [tab_agent] + others

    # Fallback: output first
    if "output" in candidates:
        others = [a for a in candidates if a != "output"]
        return ["output"] + others

    return list(candidates) or ["output"]


def should_keep_agent_lock(
    message: str,
    active_agent: Optional[str],
    conversation_state: Optional[dict],
) -> bool:
    """
    Determine if we should keep the current agent lock for conversation continuity.
    Returns True if the message is a follow-up to the same agent context.
    """
    if not active_agent:
        return False

    msg_lower = message.lower()

    # Topic shift detection — these break the lock
    topic_shift_patterns = [
        re.compile(r"^(actually|instead|wait|never mind|forget that)", re.I),
        re.compile(r"^(let's talk about|switch to|go to)", re.I),
        re.compile(r"^(what about my|show me my|how about)", re.I),
    ]

    for pattern in topic_shift_patterns:
        if pattern.search(msg_lower):
            return False

    # Program queries always re-route (they need output agent)
    if re.search(r"\bprogram\b", msg_lower, re.I):
        return False

    # Short conversational follow-ups keep the lock
    follow_up_patterns = [
        re.compile(r"^(yes|no|ok|sure|thanks|got it|do it|confirm)", re.I),
        re.compile(r"^(what|when|where|how|why)\b", re.I),
        re.compile(r"^(tell me more|explain|go on|continue)", re.I),
    ]

    for pattern in follow_up_patterns:
        if pattern.search(msg_lower):
            return True

    return False
