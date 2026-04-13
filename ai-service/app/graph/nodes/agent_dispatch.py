"""
Tomo AI Service — Agent Dispatch Node
Custom agentic tool-calling loop using Haiku 4.5.

This is the core execution engine:
1. Creates tools for the selected agent type
2. Builds the 2-block system prompt (static cached + dynamic per-request)
3. Runs an agentic loop: LLM → tool calls → execute → feed back → repeat
4. Detects write actions → halts and returns PendingWriteAction for confirmation
5. Tracks telemetry (cost, tokens, latency) across iterations

Max 5 iterations per request to prevent runaway loops.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import (
    AIMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)

from app.config import get_settings
from app.models.state import TomoChatState
from app.agents.tools import get_tools_for_agent
from app.agents.tools.bridge import is_write_action, is_capsule_direct
from app.agents.prompt_builder import build_system_prompt
from app.agents.greeting_handler import detect_greeting_tier

logger = logging.getLogger("tomo-ai.agent_dispatch")

MAX_ITERATIONS = 5
MAX_TOOL_RESULT_CHARS = 3000  # Truncate tool results to prevent context bloat

# Haiku 4.5 pricing: $0.80/MTok input, $4.00/MTok output
HAIKU_INPUT_COST_PER_TOKEN = 0.0000008
HAIKU_OUTPUT_COST_PER_TOKEN = 0.000004


async def agent_dispatch_node(state: TomoChatState) -> dict:
    """
    Execute the selected agent's agentic tool-calling loop.

    Flow:
      1. Get tools for selected agent
      2. Build 2-block system prompt
      3. Create Haiku LLM with tools bound
      4. Loop: LLM call → check for tool calls → execute → repeat
      5. On write action: interrupt and return pending action
      6. On completion: return agent response + telemetry

    Returns state update dict.
    """
    t0 = time.monotonic()
    settings = get_settings()

    agent_type = state.get("selected_agent", "output")
    user_id = state["user_id"]
    context = state.get("player_context")
    aib_summary = state.get("aib_summary")
    secondary_agents = state.get("_secondary_agents", [])

    if not context:
        return {
            "agent_response": "I need your profile data to help you. Please try again.",
            "tool_calls": [],
            "total_cost_usd": 0.0,
            "total_tokens": 0,
        }

    # 1. Get tools for this agent + user (all tools available — no restrictions)
    tools = get_tools_for_agent(agent_type, user_id, context, secondary_agents)
    tool_map = {t.name: t for t in tools}

    # 2. Build 2-block system prompt
    static_block, dynamic_block = build_system_prompt(
        agent_type=agent_type,
        context=context,
        aib_summary=aib_summary,
        secondary_agents=secondary_agents if secondary_agents else None,
    )

    # 2b. Inject classified intent so LLM knows what type of message this is
    intent_id = state.get("intent_id", "unknown")

    # For greetings: detect energy tier and inject vibe-matched guidance
    if intent_id == "greeting":
        user_msg = ""
        for msg in reversed(state.get("messages", [])):
            if hasattr(msg, "type") and msg.type == "human":
                user_msg = msg.content if isinstance(msg.content, str) else str(msg.content)
                break
        tier = detect_greeting_tier(user_msg, context)
        intent_guidance = _build_greeting_guidance(tier)
        logger.info(f"Greeting energy tier: {tier} for '{user_msg[:40]}'")
    else:
        INTENT_GUIDANCE = {
            "qa_readiness": (
                "CURRENT INTENT: READINESS QUESTION\n"
                "The athlete wants to know how ready they are. Lead with how they're doing in "
                "plain language, then show the data card."
            ),
            "load_advice_request": (
                "CURRENT INTENT: LOAD ADVICE\n"
                "The athlete is asking about their training load. Be honest about where they're at."
            ),
            "emotional_checkin": (
                "CURRENT INTENT: EMOTIONAL CHECK-IN\n"
                "The athlete is sharing how they feel. Acknowledge FIRST. No training advice "
                "until they ask for it. Use VALIDATE mode."
            ),
        }
        intent_guidance = INTENT_GUIDANCE.get(intent_id, f"CURRENT INTENT: {intent_id}")

    dynamic_block = f"{intent_guidance}\n\n{dynamic_block}"

    # 2c. Inject RAG context from PropertyGraphIndex (Phase 5)
    rag_context = state.get("rag_context", "")
    if rag_context:
        dynamic_block += f"\n\n{rag_context}"
        logger.info(f"RAG context injected: {len(rag_context)} chars")

    # 2c. Inject memory context from 4-tier memory (Zep CE)
    memory_context = state.get("memory_context", "")
    if memory_context:
        dynamic_block += f"\n\n{memory_context}"
        logger.info(f"Memory context injected: {len(memory_context)} chars")

    # 3. Create LLM with tools bound
    api_key = settings.anthropic_api_key
    if not api_key:
        import os
        api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    logger.info(f"Agent dispatch: key_len={len(api_key)} agent={agent_type} tools={len(tools)}")

    llm = ChatAnthropic(
        model="claude-haiku-4-5-20251001",
        temperature=0.3,
        max_tokens=4096,
        api_key=api_key,
    )
    llm_with_tools = llm.bind_tools(tools)

    # 4. Build message list
    # System prompt as two content blocks (first block cached)
    system_msg = SystemMessage(
        content=[
            {"type": "text", "text": static_block, "cache_control": {"type": "ephemeral"}},
            {"type": "text", "text": dynamic_block},
        ]
    )

    # Conversation messages from state (already token-budgeted by conversation_history.py)
    conversation_msgs = list(state.get("messages", []))

    # Safety: if conversation messages are still over 20K chars (~5K tokens),
    # trim to last 4 messages to keep LLM input lean. This catches edge cases
    # where the history loader's budget wasn't aggressive enough.
    conv_chars = sum(
        len(m.content) if isinstance(m.content, str) else len(str(m.content))
        for m in conversation_msgs
    )
    if conv_chars > 20000 and len(conversation_msgs) > 4:
        trimmed_count = len(conversation_msgs) - 4
        conversation_msgs = conversation_msgs[-4:]
        logger.warning(
            f"Agent dispatch: trimmed {trimmed_count} messages "
            f"({conv_chars} chars → ~{sum(len(m.content) if isinstance(m.content, str) else 0 for m in conversation_msgs)} chars)"
        )

    all_messages = [system_msg] + conversation_msgs

    # 5. Agentic loop
    total_cost = state.get("total_cost_usd", 0.0)
    total_tokens = state.get("total_tokens", 0)
    tool_calls_log: list[dict[str, Any]] = []
    response = None

    for iteration in range(MAX_ITERATIONS):
        try:
            response = await llm_with_tools.ainvoke(all_messages)
        except Exception as e:
            logger.error(f"Agent LLM call failed (iter {iteration}): {e}", exc_info=True)
            return {
                "agent_response": f"Sorry, I had trouble processing that. Error: {str(e)[:100]}",
                "tool_calls": tool_calls_log,
                "total_cost_usd": total_cost,
                "total_tokens": total_tokens,
                "latency_ms": (time.monotonic() - t0) * 1000,
            }

        all_messages.append(response)

        # Track telemetry
        usage = response.response_metadata.get("usage", {})
        input_tokens = usage.get("input_tokens", 0)
        output_tokens = usage.get("output_tokens", 0)
        cache_read = usage.get("cache_read_input_tokens", 0)
        total_tokens += input_tokens + output_tokens
        # Cache reads are free, only charge non-cached input
        total_cost += ((input_tokens - cache_read) * HAIKU_INPUT_COST_PER_TOKEN) + \
                      (output_tokens * HAIKU_OUTPUT_COST_PER_TOKEN)

        logger.info(
            f"Agent iter {iteration}: "
            f"in={input_tokens} out={output_tokens} cache_read={cache_read} "
            f"tool_calls={len(response.tool_calls) if response.tool_calls else 0}"
        )

        # No tool calls → done
        if not response.tool_calls:
            break

        # Check for write actions
        write_calls = [tc for tc in response.tool_calls if is_write_action(tc["name"])]
        read_calls = [tc for tc in response.tool_calls if not is_write_action(tc["name"])]

        if write_calls:
            # Build pending write action for confirmation
            pending_actions = []
            for wc in write_calls:
                pending_actions.append({
                    "toolName": wc["name"],
                    "toolInput": wc["args"],
                    "agentType": agent_type,
                    "toolCallId": wc["id"],
                })

            # Build preview text with event details (shown in confirm handler)
            preview_parts = []
            for pa in pending_actions:
                inp = pa.get("toolInput", {})
                title = inp.get("title", "")
                if title:
                    detail = title
                    date = inp.get("date", "")
                    start_time = inp.get("start_time", "")
                    if date:
                        detail += f" on {date}"
                    if start_time:
                        detail += f" at {start_time}"
                    preview_parts.append(detail)
                else:
                    name = pa["toolName"].replace("_", " ").title()
                    preview_parts.append(name)

            pending = {
                "actions": pending_actions,
                "preview": "\n".join(preview_parts),
                "primary_action": pending_actions[0],
            }

            # Extract any text response before the tool calls
            agent_text = ""
            if isinstance(response.content, str):
                agent_text = response.content
            elif isinstance(response.content, list):
                text_blocks = [b.get("text", "") for b in response.content if isinstance(b, dict) and b.get("type") == "text"]
                agent_text = "\n".join(text_blocks)

            elapsed = (time.monotonic() - t0) * 1000
            logger.info(f"Agent write action detected: {[wc['name'] for wc in write_calls]} ({elapsed:.0f}ms)")

            return {
                "pending_write_action": pending,
                "agent_response": agent_text,
                "tool_calls": tool_calls_log,
                "total_cost_usd": total_cost,
                "total_tokens": total_tokens,
                "latency_ms": elapsed,
            }

        # Execute read tools in parallel
        for tc in response.tool_calls:
            tool_fn = tool_map.get(tc["name"])
            if not tool_fn:
                tool_msg = ToolMessage(
                    content=json.dumps({"error": f"Unknown tool: {tc['name']}"}),
                    tool_call_id=tc["id"],
                )
                all_messages.append(tool_msg)
                continue

            try:
                result = await tool_fn.ainvoke(tc["args"])
                # Ensure result is JSON-serializable string
                if isinstance(result, dict):
                    result_str = json.dumps(result, default=str)
                elif isinstance(result, str):
                    result_str = result
                else:
                    result_str = json.dumps({"result": str(result)}, default=str)
            except Exception as e:
                logger.warning(f"Tool {tc['name']} failed: {e}", exc_info=True)
                result_str = json.dumps({"error": str(e)[:200]})

            # Truncate oversized tool results to prevent context bloat
            if len(result_str) > MAX_TOOL_RESULT_CHARS:
                original_len = len(result_str)
                result_str = result_str[:MAX_TOOL_RESULT_CHARS] + \
                    f"\n... [truncated, {original_len} chars total]"

            tool_msg = ToolMessage(content=result_str, tool_call_id=tc["id"])
            all_messages.append(tool_msg)

            tool_calls_log.append({
                "name": tc["name"],
                "input": tc["args"],
                "result_preview": result_str[:200],
                "iteration": iteration,
            })

    # Extract final response
    agent_response = ""
    if response:
        if isinstance(response.content, str):
            agent_response = response.content
        elif isinstance(response.content, list):
            text_blocks = [
                b.get("text", "") for b in response.content
                if isinstance(b, dict) and b.get("type") == "text"
            ]
            agent_response = "\n".join(text_blocks)

    elapsed = (time.monotonic() - t0) * 1000
    logger.info(
        f"Agent dispatch complete: agent={agent_type} "
        f"tools={len(tool_calls_log)} cost=${total_cost:.6f} "
        f"tokens={total_tokens} latency={elapsed:.0f}ms"
    )

    return {
        "agent_response": agent_response,
        "tool_calls": tool_calls_log,
        "total_cost_usd": total_cost,
        "total_tokens": total_tokens,
        "latency_ms": elapsed,
        "messages": all_messages,
    }


async def execute_confirmed_action(state: TomoChatState) -> dict:
    """
    Execute a previously confirmed write action.
    Called when user confirms a pending action from a previous turn.
    """
    pending = state.get("pending_write_action")
    if not pending:
        return {"agent_response": "No pending action to confirm."}

    user_id = state["user_id"]
    context = state.get("player_context")
    agent_type = state.get("selected_agent", "output")

    if not context:
        return {"agent_response": "Context not available. Please try again."}

    # Get tools
    tools = get_tools_for_agent(agent_type, user_id, context)
    tool_map = {t.name: t for t in tools}

    results = []
    actions = pending.get("actions", [pending.get("primary_action", pending)])

    for action in actions:
        tool_name = action.get("toolName", "")
        tool_input = action.get("toolInput", {})
        tool_fn = tool_map.get(tool_name)

        if not tool_fn:
            results.append({"tool": tool_name, "error": f"Tool not found: {tool_name}"})
            continue

        try:
            result = await tool_fn.ainvoke(tool_input)
            # Check if bridge returned an error (e.g. 404, validation failure)
            if isinstance(result, dict) and "error" in result:
                results.append({"tool": tool_name, "error": result["error"], "detail": result.get("detail", ""), "success": False})
            else:
                results.append({"tool": tool_name, "result": result, "success": True})
        except Exception as e:
            results.append({"tool": tool_name, "error": str(e), "success": False})

    # Determine refresh targets based on which tools were executed
    refresh_targets = set()
    for action in actions:
        name = action.get("toolName", "")
        if "event" in name or "schedule" in name:
            refresh_targets.add("calendar")
        if "check_in" in name or "readiness" in name:
            refresh_targets.add("readiness")
            refresh_targets.add("recommendations")
        if "program" in name:
            refresh_targets.add("programs")
        if "test" in name or "journal" in name or "check_in" in name:
            refresh_targets.add("metrics")
        # Every write action should refresh notifications
        refresh_targets.add("notifications")

    return {
        "agent_response": json.dumps({"confirmed_results": results}),
        "pending_write_action": None,
        "write_confirmed": True,
        "tool_calls": [{"name": a.get("toolName"), "input": a.get("toolInput"), "confirmed": True} for a in actions],
        "_refresh_targets": list(refresh_targets),
    }


# ── Greeting energy-tier guidance for LLM ────────────────────────────

def _build_greeting_guidance(tier: str) -> str:
    """
    Build LLM guidance for greeting responses based on detected energy tier.
    The LLM uses these as inspiration — NOT literal scripts.
    """
    TIER_GUIDANCE = {
        "high_energy": (
            "CURRENT INTENT: GREETING (HIGH ENERGY — the athlete is hyped)\n"
            "Match their energy. Be excited WITH them. Keep it short and action-oriented.\n"
            "Vibe examples (use as inspiration, don't copy literally):\n"
            '- "Aye, there you are. Let\'s get into it."\n'
            '- "That energy — let\'s put it to work."\n'
            '- "Yes. Today\'s the day. What are we doing?"\n'
            '- "Okay okay I see you. Let\'s build something today."'
        ),
        "neutral": (
            "CURRENT INTENT: GREETING (CASUAL — relaxed, normal energy)\n"
            "Be warm and easy. Ask how they're doing or what's on their mind.\n"
            "Vibe examples (use as inspiration, don't copy literally):\n"
            '- "Hey — good to see you. How you feeling today?"\n'
            '- "Yo. What are we working with today?"\n'
            '- "Hey. What\'s the plan — training, or just checking in?"\n'
            '- "Sup. You training today or just vibing?"'
        ),
        "low_energy": (
            "CURRENT INTENT: GREETING (QUIET — low energy, short message)\n"
            "Mirror their calm. Be gentle, check in on how they're actually doing.\n"
            "Vibe examples (use as inspiration, don't copy literally):\n"
            '- "Hey. You good?"\n'
            '- "Hi. How are you actually doing?"\n'
            '- "Hey. Tired one or just getting started?"\n'
            '- "What\'s up. Talk to me — what kind of day has it been?"'
        ),
        "late_night": (
            "CURRENT INTENT: GREETING (LATE NIGHT — it's past 10pm)\n"
            "Acknowledge the late hour. Be chill, slightly concerned but not parental.\n"
            "Vibe examples (use as inspiration, don't copy literally):\n"
            '- "Still up? What\'s on your mind."\n'
            '- "Late one. Everything alright?"\n'
            '- "Hey night owl. Training or just thinking?"'
        ),
        "early_morning": (
            "CURRENT INTENT: GREETING (EARLY MORNING — before 7am)\n"
            "Acknowledge the early start. Respect the commitment.\n"
            "Vibe examples (use as inspiration, don't copy literally):\n"
            '- "Early start. Respect. What are we doing today?"\n'
            '- "Morning. How\'d you sleep?"\n'
            '- "Up early — good sign. What\'s the plan?"'
        ),
        "returning": (
            "CURRENT INTENT: GREETING (RETURNING — 5+ days since last session)\n"
            "Welcome them back warmly. No guilt about the gap. Zero judgment.\n"
            "Vibe examples (use as inspiration, don't copy literally):\n"
            '- "Hey — been a minute. Good to have you back."\n'
            '- "There you are. No stress about the gap — what are we doing?"\n'
            '- "Back. Good. Let\'s not make a thing of it — what do you need?"\n'
            '- "Welcome back. How you feeling after the break?"'
        ),
        "post_match": (
            "CURRENT INTENT: GREETING (POST-MATCH — match day or recently played)\n"
            "Ask about the match/game. Show genuine interest in how it went.\n"
            "Vibe examples (use as inspiration, don't copy literally):\n"
            '- "Heard you played recently — how\'d it go?"\n'
            '- "Post-match day. How\'s the body feeling?"\n'
            '- "Big day recently. Recovery mode or you feeling okay?"'
        ),
    }

    base = TIER_GUIDANCE.get(tier, TIER_GUIDANCE["neutral"])

    return (
        f"{base}\n\n"
        "GREETING RULES:\n"
        "- NO data cards, NO stat_grids, NO benchmarks, NO tools. Just talk.\n"
        "- NEVER open with the athlete's name — 'Hey James!' feels like a CRM, not a friend.\n"
        "- ALWAYS end with an open question or action invitation — never a dead-end statement.\n"
        "- Keep it to 1-3 sentences max. Short, warm, real.\n"
        "- Use their context (time, readiness, recent activity) to make it personal if relevant,\n"
        "  but don't force it — sometimes 'Hey, you good?' is perfect.\n"
        "- This is the start of a CONVERSATION — your response should invite them to keep talking."
    )
