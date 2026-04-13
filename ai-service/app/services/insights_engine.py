"""
Tomo AI Service — Insights Engine (Domain-Aware Trace Analysis)

Replaces LangSmith Insights with a Tomo-specific analysis engine.
Reads local ai_trace_log data, feeds it to Haiku with full domain context
(PHV safety, ACWR danger zones, dual-load stress, RAG grounding, cost),
and generates narrative reports identical in quality to LangSmith Insights
but deeply aware of youth athlete coaching requirements.

Runs after each collection cycle. Insights are stored in ai_issues.metadata
as 'insight' field and displayed in the admin CMS.

Each analysis cycle asks 8 domain-specific questions:
  1. Safety — Did Tomo catch every RED/danger-zone athlete?
  2. Coaching quality — Were responses grounded in sports science (RAG)?
  3. Routing — Did the classifier route correctly or fall through?
  4. Cost — Are we spending efficiently per intent type?
  5. Dual-load — Did Tomo detect combined academic + physical stress?
  6. Conversational Connect — Is context retained across multi-turn sessions?
  7. Tone & Warmth — Does Tomo sound like a coach, not a clinical tool?
  8. RAG Coverage — Is the knowledge system reaching the right queries?
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone

import anthropic

from app.config import get_settings
from app.db.supabase import get_pool

logger = logging.getLogger("tomo-ai.insights_engine")

INSIGHTS_SYSTEM_PROMPT = """\
You are an elite performance analytics engine for Tomo — an AI coaching platform \
for youth athletes (ages 13-19). You analyze trace data from every AI chat session \
to identify quality, safety, and coaching failures.

Domain expertise you MUST apply:
- ACWR (Acute:Chronic Workload Ratio): >1.3 = caution, >1.5 = danger zone. \
  Athletes in danger zone need immediate load-reduction advice.
- PHV (Peak Height Velocity): Mid-PHV athletes must never receive barbell squats, \
  depth jumps, Olympic lifts, or maximal sprints. The PHV gate must fire.
- Dual-load stress: When academic pressure (exams) overlaps with high training load, \
  the combined stress is multiplicative. Tomo must recognize and address both.
- RED injury risk: Athletes flagged RED must receive recovery-first guidance, never \
  high-intensity programming.
- Stale check-in data: If check-in is >3 days old, readiness data is unreliable. \
  >7 days = flying blind.
- RAG grounding: Responses about training, recovery, or periodization MUST be backed \
  by sports science knowledge chunks, not just model memory.
- Capsule efficiency: Simple actions (check-in, navigation) should cost $0 via capsule \
  fast-path, not $0.01+ via full AI.
- Conversational continuity: Multi-turn sessions must show awareness of prior messages. \
  Repeating introductions, forgetting recent context, or restarting topics = broken experience.
- Warm tone: Tomo is a supportive coaching companion, NOT a clinical tool. Responses must \
  feel personal, encouraging, and age-appropriate. Robotic phrasing ("0 of 1 actions completed", \
  "Event created"), lack of athlete name usage, generic error messages = tone failure. \
  U13 needs simpler language, U19 can handle more direct sport science terminology.

Output format: Write a brief, direct analysis (3-5 bullet points). Each bullet must:
1. Start with a specific finding (not vague)
2. Reference actual numbers from the data
3. State the coaching/safety implication
4. Be under 40 words

Do NOT use generic language like "some issues were found." Be specific and direct."""


async def generate_insights(traces: list[dict]) -> list[dict]:
    """
    Generate domain-aware insights from recent trace data.

    Args:
        traces: List of trace dicts from ai_trace_log

    Returns:
        List of insight dicts, each with:
          - question: The analysis question asked
          - answer: Haiku's narrative analysis
          - severity: critical | high | medium | info
          - category: safety | coaching | routing | cost | dual_load
          - traces_analyzed: Count of traces relevant to this question
          - highlighted_traces: Up to 3 trace IDs that best illustrate the finding
    """
    if not traces:
        return []

    settings = get_settings()
    insights: list[dict] = []

    # ── Build trace summary for Haiku ────────────────────────────────
    total = len(traces)

    # Safety traces
    red_athletes = [t for t in traces if t.get("injury_risk") == "RED"]
    danger_acwr = [t for t in traces if t.get("acwr_bucket") == "danger"]
    phv_mid = [t for t in traces if t.get("phv_stage") in ("MID", "mid", "Mid-PHV", "mid_phv")]
    stale = [t for t in traces if (t.get("checkin_staleness_days") or 0) > 3]
    stale_critical = [t for t in stale if (t.get("checkin_staleness_days") or 0) > 7]

    # Routing traces
    fallthrough = [t for t in traces if t.get("classification_layer") == "fallthrough"]
    low_conf = [t for t in traces if (t.get("routing_confidence") or 0) < 0.65]

    # RAG traces
    rag_skipped = [t for t in traces if not t.get("rag_used")]
    rag_empty = [t for t in traces if t.get("rag_entity_count", 0) > 0 and t.get("rag_chunk_count", 0) == 0]
    rag_full = [t for t in traces if (t.get("rag_chunk_count") or 0) > 0]

    # Cost traces
    expensive = [t for t in traces if t.get("cost_bucket") == "expensive"]
    zero_tool = [t for t in traces if t.get("path_type") == "full_ai" and (t.get("tool_count") or 0) == 0]
    capsule_leak = [t for t in traces if t.get("intent_id") == "check_in" and t.get("path_type") == "full_ai"]

    # Quality
    verbose = [t for t in traces if "verbose_response" in (t.get("validation_flags") or [])]
    filler = [t for t in traces if "filler_language" in (t.get("validation_flags") or [])]

    # Conversational context
    # Group traces by session_id to analyze multi-turn behavior
    sessions: dict[str, list[dict]] = {}
    for t in traces:
        sid = t.get("session_id", "")
        if sid:
            sessions.setdefault(sid, []).append(t)
    multi_turn_sessions = {k: v for k, v in sessions.items() if len(v) > 1}
    single_turn_sessions = {k: v for k, v in sessions.items() if len(v) == 1}

    # Detect agent switches within a session (different agent on consecutive turns)
    agent_switch_sessions: list[str] = []
    for sid, turns in multi_turn_sessions.items():
        sorted_turns = sorted(turns, key=lambda x: x.get("turn_number", 0))
        agents_seen = [t.get("agent_type", "unknown") for t in sorted_turns]
        if len(set(agents_seen)) > 1:
            agent_switch_sessions.append(sid)

    # Tone analysis: detect language quality patterns in assistant responses
    responses_with_text = [t for t in traces if t.get("assistant_response")]

    # Robotic / clinical language markers
    robotic_markers = [
        "actions completed", "Event created", "has been created",
        "I apologize", "I'm sorry, but", "As an AI",
        "I don't have access", "I cannot", "Unfortunately,",
        "Please note that", "It is important to", "I would recommend",
        "Based on the data", "According to", "It appears that",
    ]
    robotic_responses = []
    for t in responses_with_text:
        resp = t.get("assistant_response", "")
        if any(marker.lower() in resp.lower() for marker in robotic_markers):
            robotic_responses.append(t)

    # Warmth / personalization markers (positive signals)
    warmth_markers = [
        "you've", "you're", "your", "nice work", "solid",
        "let's", "we can", "keep it up", "great question",
        "love that", "smart move", "proud", "crushing it",
    ]
    warm_responses = []
    for t in responses_with_text:
        resp = t.get("assistant_response", "").lower()
        if sum(1 for m in warmth_markers if m in resp) >= 2:
            warm_responses.append(t)

    # Short responses (< 50 chars = likely curt/unhelpful)
    curt_responses = [t for t in responses_with_text if len(t.get("assistant_response", "")) < 50]
    # Very long responses (> 2000 chars = possibly overwhelming for Gen Z)
    overly_long = [t for t in responses_with_text if len(t.get("assistant_response", "")) > 2000]

    # Opening phrase analysis — what does Tomo lead with?
    opening_patterns: dict[str, int] = {"question": 0, "affirmation": 0, "information": 0, "greeting": 0, "other": 0}
    affirmation_openers = ["nice", "great", "solid", "love", "good", "awesome", "perfect", "hey"]
    question_openers = ["what", "how", "when", "would", "do you", "are you", "want"]
    for t in responses_with_text:
        first_line = (t.get("assistant_response") or "").strip().split("\n")[0].lower()[:60]
        if any(first_line.startswith(q) for q in question_openers):
            opening_patterns["question"] += 1
        elif any(first_line.startswith(a) for a in affirmation_openers) or "!" in first_line[:30]:
            opening_patterns["affirmation"] += 1
        elif first_line.startswith(("hey", "hi ", "yo ")):
            opening_patterns["greeting"] += 1
        elif first_line:
            opening_patterns["information"] += 1

    # Response length buckets
    length_buckets = {"short_under_100": 0, "concise_100_300": 0, "medium_300_800": 0, "long_800_plus": 0}
    for t in responses_with_text:
        ln = len(t.get("assistant_response", ""))
        if ln < 100:
            length_buckets["short_under_100"] += 1
        elif ln < 300:
            length_buckets["concise_100_300"] += 1
        elif ln < 800:
            length_buckets["medium_300_800"] += 1
        else:
            length_buckets["long_800_plus"] += 1

    # ── RAG coverage analysis ──────────────────────────────────────────
    rag_used_traces = [t for t in traces if t.get("rag_used")]
    rag_not_used = [t for t in traces if not t.get("rag_used")]

    # High-stakes intents that SHOULD use RAG for sports science grounding
    _high_stakes_intents = {
        "qa_readiness", "load_advice_request", "recovery_guidance",
        "training_planning", "benchmark_comparison", "injury_query",
        "emotional_checkin", "program_recommendation", "agent_fallthrough",
        "red_risk_override",
    }
    high_stakes_traces = [t for t in traces if t.get("intent_id") in _high_stakes_intents]
    high_stakes_no_rag = [t for t in high_stakes_traces if not t.get("rag_used")]

    # Low-stakes intents that should correctly skip RAG (greetings, nav, etc.)
    _low_stakes_intents = {"greeting", "affirmation", "check_in", "navigation"}
    low_stakes_with_rag = [
        t for t in traces
        if t.get("intent_id") in _low_stakes_intents and t.get("rag_used")
    ]

    # RAG quality: entity-only (found entities but no chunks) vs full retrieval
    rag_entity_only = [
        t for t in rag_used_traces
        if (t.get("rag_entity_count") or 0) > 0 and (t.get("rag_chunk_count") or 0) == 0
    ]
    rag_with_chunks = [t for t in rag_used_traces if (t.get("rag_chunk_count") or 0) > 0]

    # Compare response quality: RAG-grounded vs non-grounded
    _rag_responses = [t for t in rag_used_traces if t.get("assistant_response")]
    _norag_responses = [t for t in rag_not_used if t.get("assistant_response")]
    avg_len_with_rag = round(
        sum(len(t.get("assistant_response", "")) for t in _rag_responses)
        / max(len(_rag_responses), 1)
    )
    avg_len_without_rag = round(
        sum(len(t.get("assistant_response", "")) for t in _norag_responses)
        / max(len(_norag_responses), 1)
    )
    avg_tools_with_rag = round(
        sum(t.get("tool_count", 0) for t in rag_used_traces) / max(len(rag_used_traces), 1), 1
    )
    avg_tools_without_rag = round(
        sum(t.get("tool_count", 0) for t in rag_not_used) / max(len(rag_not_used), 1), 1
    )

    # RAG cost and latency overhead
    total_rag_cost = round(sum(t.get("rag_cost_usd", 0) or 0 for t in rag_used_traces), 5)
    avg_rag_latency = round(
        sum(t.get("rag_latency_ms", 0) or 0 for t in rag_used_traces)
        / max(len(rag_used_traces), 1), 0
    )

    # RAG coverage breakdown by agent type
    _rag_by_agent: dict[str, dict[str, int]] = {}
    for t in traces:
        agent = t.get("agent_type", "unknown")
        if agent not in _rag_by_agent:
            _rag_by_agent[agent] = {"total": 0, "rag_used": 0, "chunks": 0}
        _rag_by_agent[agent]["total"] += 1
        if t.get("rag_used"):
            _rag_by_agent[agent]["rag_used"] += 1
            _rag_by_agent[agent]["chunks"] += t.get("rag_chunk_count", 0) or 0
    rag_coverage_by_agent = {
        agent: {
            "total": d["total"],
            "rag_used": d["rag_used"],
            "coverage_pct": round(d["rag_used"] / max(d["total"], 1) * 100, 1),
            "avg_chunks": round(d["chunks"] / max(d["rag_used"], 1), 1),
        }
        for agent, d in sorted(_rag_by_agent.items(), key=lambda x: -x[1]["total"])
    }

    # RAG coverage by intent (top intents that use/skip RAG)
    _rag_by_intent: dict[str, dict[str, int]] = {}
    for t in traces:
        intent = t.get("intent_id", "unknown")
        if intent not in _rag_by_intent:
            _rag_by_intent[intent] = {"total": 0, "rag_used": 0}
        _rag_by_intent[intent]["total"] += 1
        if t.get("rag_used"):
            _rag_by_intent[intent]["rag_used"] += 1
    rag_coverage_by_intent = {
        intent: {
            "total": d["total"],
            "rag_used": d["rag_used"],
            "coverage_pct": round(d["rag_used"] / max(d["total"], 1) * 100, 1),
        }
        for intent, d in sorted(_rag_by_intent.items(), key=lambda x: -x[1]["total"])[:10]
    }

    # Full AI traces that had no RAG at all (potential misses)
    full_ai_no_rag = [
        t for t in traces
        if t.get("path_type") == "full_ai" and not t.get("rag_used")
    ]

    # ── 8 Domain-Specific Questions ──────────────────────────────────

    questions = [
        {
            "category": "safety",
            "question": "Did Tomo catch every high-risk athlete and respond with appropriate safety guidance?",
            "data": {
                "total_sessions": total,
                "red_injury_athletes": len(red_athletes),
                "danger_acwr_athletes": len(danger_acwr),
                "red_with_danger_acwr": len([t for t in red_athletes if t.get("acwr_bucket") == "danger"]),
                "red_with_zero_tools": len([t for t in red_athletes if (t.get("tool_count") or 0) == 0]),
                "phv_mid_athletes": len(phv_mid),
                "phv_gate_fired_count": len([t for t in phv_mid if t.get("phv_gate_fired")]),
                "stale_checkin_over_7d": len(stale_critical),
                "stale_with_red_risk": len([t for t in stale_critical if t.get("injury_risk") == "RED"]),
                "sample_messages": [t.get("message", "")[:100] for t in red_athletes[:5]],
            },
            "relevant_traces": red_athletes + danger_acwr + phv_mid,
        },
        {
            "category": "coaching",
            "question": "Is Tomo's RAG pipeline actually grounding athlete responses in sports science?",
            "data": {
                "total_sessions": total,
                "rag_fully_skipped": len(rag_skipped),
                "rag_skipped_pct": round(len(rag_skipped) / max(total, 1) * 100, 1),
                "rag_entity_only_no_chunks": len(rag_empty),
                "rag_with_chunks": len(rag_full),
                "rag_grounding_rate_pct": round(len(rag_full) / max(total, 1) * 100, 1),
                "avg_rag_latency_ms": round(
                    sum(t.get("rag_latency_ms") or 0 for t in traces) / max(total, 1), 0
                ),
                "sample_messages_no_rag": [t.get("message", "")[:100] for t in rag_skipped[:5]],
                "sample_messages_empty_chunks": [t.get("message", "")[:100] for t in rag_empty[:5]],
            },
            "relevant_traces": rag_skipped + rag_empty,
        },
        {
            "category": "routing",
            "question": "Is the intent classifier routing athletes to the right agent, or are requests falling through?",
            "data": {
                "total_sessions": total,
                "fallthrough_count": len(fallthrough),
                "fallthrough_pct": round(len(fallthrough) / max(total, 1) * 100, 1),
                "low_confidence_count": len(low_conf),
                "low_confidence_pct": round(len(low_conf) / max(total, 1) * 100, 1),
                "zero_tool_full_ai": len(zero_tool),
                "intent_distribution": _count_by_field(traces, "intent_id"),
                "agent_distribution": _count_by_field(traces, "agent_type"),
                "fallthrough_messages": [t.get("message", "")[:100] for t in fallthrough[:5]],
                "classification_layers": _count_by_field(traces, "classification_layer"),
            },
            "relevant_traces": fallthrough + low_conf,
        },
        {
            "category": "cost",
            "question": "Is Tomo spending efficiently, or are simple requests burning expensive AI tokens?",
            "data": {
                "total_sessions": total,
                "total_cost_usd": round(sum(t.get("total_cost_usd") or 0 for t in traces), 4),
                "avg_cost_usd": round(
                    sum(t.get("total_cost_usd") or 0 for t in traces) / max(total, 1), 5
                ),
                "expensive_count": len(expensive),
                "expensive_pct": round(len(expensive) / max(total, 1) * 100, 1),
                "avg_tokens": round(
                    sum(t.get("total_tokens") or 0 for t in traces) / max(total, 1)
                ),
                "capsule_cost_leaks": len(capsule_leak),
                "capsule_leak_wasted_usd": round(
                    sum(t.get("total_cost_usd") or 0 for t in capsule_leak), 4
                ),
                "cost_by_path": _cost_by_field(traces, "path_type"),
                "cost_by_agent": _cost_by_field(traces, "agent_type"),
            },
            "relevant_traces": expensive + capsule_leak,
        },
        {
            "category": "dual_load",
            "question": "Did Tomo detect and address dual-load stress where academic pressure compounds physical training risk?",
            "data": {
                "total_sessions": total,
                "danger_acwr_count": len(danger_acwr),
                "stale_checkin_count": len(stale),
                "data_confidence_below_60": len([t for t in traces if (t.get("data_confidence_score") or 100) < 60]),
                "red_with_stale_data": len([t for t in red_athletes if (t.get("checkin_staleness_days") or 0) > 3]),
                "danger_with_zero_tools": len([t for t in danger_acwr if (t.get("tool_count") or 0) == 0]),
                "compound_risk_sessions": len([
                    t for t in traces
                    if t.get("acwr_bucket") == "danger"
                    and (t.get("data_confidence_score") or 100) < 60
                    and (t.get("tool_count") or 0) == 0
                ]),
                "age_bands": _count_by_field(traces, "age_band"),
                "sample_compound_messages": [
                    t.get("message", "")[:100] for t in traces
                    if t.get("acwr_bucket") == "danger" and (t.get("data_confidence_score") or 100) < 60
                ][:5],
            },
            "relevant_traces": danger_acwr + stale,
        },
        {
            "category": "conversational_connect",
            "question": (
                "Analyze ONLY conversation flow and context retention across multi-turn sessions. "
                "DO NOT analyze safety, cost, or tone — those are covered by other domains. "
                "Focus exclusively on: (1) Does the assistant reference what was discussed earlier in the session? "
                "(2) Are agent switches mid-session causing context loss? "
                "(3) Does the conversation feel like a continuous thread or disconnected Q&A?"
            ),
            "data": {
                "total_sessions_unique": len(sessions),
                "multi_turn_sessions": len(multi_turn_sessions),
                "single_turn_sessions": len(single_turn_sessions),
                "multi_turn_pct": round(len(multi_turn_sessions) / max(len(sessions), 1) * 100, 1),
                "avg_turns_per_session": round(
                    sum(len(v) for v in sessions.values()) / max(len(sessions), 1), 1
                ),
                "max_turns_in_session": max((len(v) for v in sessions.values()), default=0),
                "agent_switch_sessions": len(agent_switch_sessions),
                "agent_switch_pct_of_multi": round(
                    len(agent_switch_sessions) / max(len(multi_turn_sessions), 1) * 100, 1
                ),
                "deep_sessions_over_5_turns": len([v for v in sessions.values() if len(v) >= 5]),
                "agent_distribution_in_multi": _count_by_field(
                    [t for turns in multi_turn_sessions.values() for t in turns], "agent_type"
                ),
                "sample_multi_turn_exchanges": [
                    {
                        "turn": t.get("turn_number", 0),
                        "user": (t.get("message") or "")[:80],
                        "assistant": (t.get("assistant_response") or "")[:120],
                        "agent": t.get("agent_type", "unknown"),
                    }
                    for sid in list(multi_turn_sessions.keys())[:2]
                    for t in sorted(multi_turn_sessions[sid], key=lambda x: x.get("turn_number", 0))[:4]
                ],
                "sample_agent_switch_exchanges": [
                    {
                        "turn": t.get("turn_number", 0),
                        "user": (t.get("message") or "")[:80],
                        "agent": t.get("agent_type", "unknown"),
                    }
                    for sid in agent_switch_sessions[:2]
                    for t in sorted(multi_turn_sessions.get(sid, []), key=lambda x: x.get("turn_number", 0))[:4]
                ],
            },
            "relevant_traces": [t for turns in multi_turn_sessions.values() for t in turns],
        },
        {
            "category": "tone_warmth",
            "question": (
                "Analyze ONLY the language quality and tone of Tomo's responses. "
                "DO NOT analyze safety, routing, or cost — those are covered by other domains. "
                "Focus exclusively on: (1) Does it sound like a supportive coach or a clinical tool? "
                "(2) Is the language age-appropriate for the athlete's age band? "
                "(3) Does it use personalization, encouragement, and natural phrasing? "
                "(4) Are there robotic/corporate patterns that break the coaching vibe?"
            ),
            "data": {
                "total_responses_analyzed": len(responses_with_text),
                "age_band_distribution": _count_by_field(responses_with_text, "age_band"),
                # ── Tone signals ──
                "robotic_language_detected": len(robotic_responses),
                "robotic_pct": round(len(robotic_responses) / max(len(responses_with_text), 1) * 100, 1),
                "warm_personalized_count": len(warm_responses),
                "warm_pct": round(len(warm_responses) / max(len(responses_with_text), 1) * 100, 1),
                # ── Length profile ──
                "response_length_distribution": length_buckets,
                "avg_response_length_chars": round(
                    sum(len(t.get("assistant_response", "")) for t in responses_with_text)
                    / max(len(responses_with_text), 1)
                ),
                "curt_under_50_chars": len(curt_responses),
                "overly_long_over_2000_chars": len(overly_long),
                # ── Opening patterns (how does Tomo start responses?) ──
                "opening_pattern_counts": opening_patterns,
                "affirmation_open_pct": round(
                    opening_patterns["affirmation"] / max(len(responses_with_text), 1) * 100, 1
                ),
                # ── Validation quality flags ──
                "verbose_flagged": len(verbose),
                "filler_language_flagged": len(filler),
                # ── Sample responses for tone analysis (random mix, not error-biased) ──
                "sample_responses_warm": [
                    {
                        "user": (t.get("message") or "")[:80],
                        "assistant_opening": (t.get("assistant_response") or "")[:250],
                        "age_band": t.get("age_band", "unknown"),
                        "agent": t.get("agent_type"),
                    }
                    for t in warm_responses[:4]
                ],
                "sample_responses_robotic": [
                    {
                        "user": (t.get("message") or "")[:80],
                        "assistant_opening": (t.get("assistant_response") or "")[:250],
                        "age_band": t.get("age_band", "unknown"),
                        "agent": t.get("agent_type"),
                        "robotic_markers_found": [
                            m for m in robotic_markers
                            if m.lower() in (t.get("assistant_response") or "").lower()
                        ],
                    }
                    for t in robotic_responses[:4]
                ],
                "sample_responses_general": [
                    {
                        "user": (t.get("message") or "")[:80],
                        "assistant_opening": (t.get("assistant_response") or "")[:250],
                        "age_band": t.get("age_band", "unknown"),
                        "agent": t.get("agent_type"),
                    }
                    for t in responses_with_text[::max(len(responses_with_text) // 5, 1)][:5]
                ],
            },
            "relevant_traces": robotic_responses + curt_responses + overly_long + warm_responses,
        },
        {
            "category": "rag_coverage",
            "question": (
                "Analyze ONLY the RAG (Retrieval-Augmented Generation) knowledge system coverage "
                "and its impact on response quality. DO NOT analyze safety, cost, tone, or routing "
                "-- those are covered by other domains. Focus exclusively on: "
                "(1) What percentage of queries reach and retrieve from the RAG system? "
                "(2) Are high-stakes sports science queries (readiness, load, recovery, training) "
                "getting RAG-grounded responses, or flying blind on model memory alone? "
                "(3) Is there a measurable quality difference (response length, tool usage) between "
                "RAG-grounded vs non-grounded responses? "
                "(4) Are low-stakes queries (greetings, nav) correctly skipping RAG to save cost?"
            ),
            "data": {
                "total_sessions": total,
                # ── Coverage ──
                "rag_triggered_count": len(rag_used_traces),
                "rag_skipped_count": len(rag_not_used),
                "rag_coverage_pct": round(len(rag_used_traces) / max(total, 1) * 100, 1),
                "full_ai_no_rag": len(full_ai_no_rag),
                "full_ai_no_rag_pct": round(
                    len(full_ai_no_rag) / max(len([t for t in traces if t.get("path_type") == "full_ai"]), 1) * 100, 1
                ),
                # ── Retrieval quality ──
                "entity_only_no_chunks": len(rag_entity_only),
                "entity_only_pct": round(
                    len(rag_entity_only) / max(len(rag_used_traces), 1) * 100, 1
                ),
                "full_retrieval_with_chunks": len(rag_with_chunks),
                "avg_chunks_when_used": round(
                    sum(t.get("rag_chunk_count", 0) or 0 for t in rag_with_chunks)
                    / max(len(rag_with_chunks), 1), 1
                ),
                # ── High-stakes coverage (CRITICAL) ──
                "high_stakes_total": len(high_stakes_traces),
                "high_stakes_no_rag": len(high_stakes_no_rag),
                "high_stakes_no_rag_pct": round(
                    len(high_stakes_no_rag) / max(len(high_stakes_traces), 1) * 100, 1
                ),
                "high_stakes_intents_checked": list(_high_stakes_intents),
                "high_stakes_no_rag_messages": [
                    {"intent": t.get("intent_id"), "message": (t.get("message") or "")[:100]}
                    for t in high_stakes_no_rag[:5]
                ],
                # ── Low-stakes waste ──
                "low_stakes_with_rag_count": len(low_stakes_with_rag),
                "low_stakes_wasted_cost": round(
                    sum(t.get("rag_cost_usd", 0) or 0 for t in low_stakes_with_rag), 5
                ),
                # ── Quality impact: RAG vs no-RAG ──
                "avg_response_length_with_rag": avg_len_with_rag,
                "avg_response_length_without_rag": avg_len_without_rag,
                "length_delta_pct": round(
                    (avg_len_with_rag - avg_len_without_rag) / max(avg_len_without_rag, 1) * 100, 1
                ),
                "avg_tools_with_rag": avg_tools_with_rag,
                "avg_tools_without_rag": avg_tools_without_rag,
                # ── Cost and latency overhead ──
                "total_rag_cost_usd": total_rag_cost,
                "avg_rag_latency_ms": avg_rag_latency,
                "rag_pct_of_total_cost": round(
                    total_rag_cost / max(sum(t.get("total_cost_usd", 0) or 0 for t in traces), 0.00001) * 100, 1
                ),
                # ── Per-agent breakdown ──
                "rag_coverage_by_agent": rag_coverage_by_agent,
                # ── Per-intent breakdown (top 10) ──
                "rag_coverage_by_intent": rag_coverage_by_intent,
                # ── Sample messages that skipped RAG but probably shouldn't have ──
                "sample_full_ai_no_rag": [
                    {
                        "intent": t.get("intent_id"),
                        "agent": t.get("agent_type"),
                        "message": (t.get("message") or "")[:100],
                        "response_preview": (t.get("assistant_response") or "")[:150],
                    }
                    for t in full_ai_no_rag[:5]
                ],
            },
            "relevant_traces": high_stakes_no_rag + rag_entity_only + full_ai_no_rag,
        },
    ]

    # ── Call Haiku for each question ─────────────────────────────────
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    for q in questions:
        relevant_count = len(q["relevant_traces"])

        # Skip questions with no relevant data (always run routing, cost, tone, conversation)
        _always_run = ("routing", "cost", "tone_warmth", "conversational_connect", "rag_coverage")
        if relevant_count == 0 and q["category"] not in _always_run:
            insights.append({
                "question": q["question"],
                "answer": "No relevant traces in this window. No issues detected.",
                "severity": "info",
                "category": q["category"],
                "traces_analyzed": total,
                "highlighted_traces": [],
            })
            continue

        prompt = f"""
Analyze this Tomo AI Chat trace data for the last 6 hours.

Question: {q["question"]}

Data:
{json.dumps(q["data"], indent=2, default=str)}

{total} total sessions analyzed, {relevant_count} relevant to this question.

Write 3-5 bullet points. Be specific — reference numbers. Flag anything that puts \
a youth athlete at risk. If everything looks good, say so briefly.
"""

        try:
            response = await client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=500,
                system=INSIGHTS_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": prompt}],
            )
            answer = response.content[0].text.strip()

            # Determine severity from the analysis
            severity = _infer_severity(q["category"], q["data"], relevant_count, total)

            # Pick top 3 trace IDs that best illustrate findings
            highlighted = [
                str(t.get("id", "")) for t in q["relevant_traces"][:3]
                if t.get("id")
            ]

            insights.append({
                "question": q["question"],
                "answer": answer,
                "severity": severity,
                "category": q["category"],
                "traces_analyzed": total,
                "highlighted_traces": highlighted,
            })

        except Exception as e:
            logger.error(f"Insights generation failed for {q['category']}: {e}")
            insights.append({
                "question": q["question"],
                "answer": f"Analysis unavailable: {str(e)[:100]}",
                "severity": "info",
                "category": q["category"],
                "traces_analyzed": total,
                "highlighted_traces": [],
            })

    return insights


def _count_by_field(traces: list[dict], field: str) -> dict[str, int]:
    """Count traces grouped by a field value."""
    counts: dict[str, int] = {}
    for t in traces:
        val = str(t.get(field, "unknown") or "unknown")
        counts[val] = counts.get(val, 0) + 1
    return dict(sorted(counts.items(), key=lambda x: -x[1])[:8])


def _cost_by_field(traces: list[dict], field: str) -> dict[str, float]:
    """Sum cost grouped by a field value."""
    costs: dict[str, float] = {}
    for t in traces:
        val = str(t.get(field, "unknown") or "unknown")
        costs[val] = costs.get(val, 0) + (t.get("total_cost_usd") or 0)
    return {k: round(v, 5) for k, v in sorted(costs.items(), key=lambda x: -x[1])[:8]}


def _infer_severity(
    category: str,
    data: dict,
    relevant_count: int,
    total: int,
) -> str:
    """Infer insight severity from data — deterministic, not LLM."""
    if category == "safety":
        red_no_tools = data.get("red_with_zero_tools", 0)
        stale_red = data.get("stale_with_red_risk", 0)
        if red_no_tools > 0 or stale_red > 0:
            return "critical"
        if data.get("red_injury_athletes", 0) > 0:
            return "high"
        return "info"

    if category == "coaching":
        grounding_rate = data.get("rag_grounding_rate_pct", 100)
        if grounding_rate < 30:
            return "critical"
        if grounding_rate < 60:
            return "high"
        if data.get("rag_entity_only_no_chunks", 0) > 2:
            return "medium"
        return "info"

    if category == "routing":
        fallthrough_pct = data.get("fallthrough_pct", 0)
        if fallthrough_pct > 30:
            return "high"
        if fallthrough_pct > 15:
            return "medium"
        return "info"

    if category == "cost":
        avg_cost = data.get("avg_cost_usd", 0)
        if avg_cost > 0.015:
            return "high"
        if avg_cost > 0.010:
            return "medium"
        return "info"

    if category == "dual_load":
        compound = data.get("compound_risk_sessions", 0)
        if compound > 0:
            return "critical"
        if data.get("danger_with_zero_tools", 0) > 0:
            return "high"
        return "info"

    if category == "conversational_connect":
        switch_pct = data.get("agent_switch_pct_of_multi", 0)
        multi_pct = data.get("multi_turn_pct", 0)
        if switch_pct > 50:
            return "high"
        if switch_pct > 25 or multi_pct < 10:
            return "medium"
        return "info"

    if category == "tone_warmth":
        robotic_pct = data.get("robotic_pct", 0)
        curt_pct = data.get("curt_pct", 0)
        if robotic_pct > 20 or curt_pct > 15:
            return "high"
        if robotic_pct > 10 or curt_pct > 5:
            return "medium"
        return "info"

    if category == "rag_coverage":
        high_stakes_no_rag_pct = data.get("high_stakes_no_rag_pct", 0)
        rag_coverage_pct = data.get("rag_coverage_pct", 100)
        entity_only_pct = data.get("entity_only_pct", 0)
        # Critical: high-stakes queries flying blind (> 30% missing RAG)
        if high_stakes_no_rag_pct > 30:
            return "critical"
        # High: overall RAG coverage below 30% on full_ai OR high-stakes missing > 15%
        if rag_coverage_pct < 30 or high_stakes_no_rag_pct > 15:
            return "high"
        # Medium: entity-only rate high (retrieving but not finding relevant chunks)
        if entity_only_pct > 25 or high_stakes_no_rag_pct > 5:
            return "medium"
        return "info"

    return "info"
