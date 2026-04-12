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

    # 1. Get tools for this agent + user
    tools = get_tools_for_agent(agent_type, user_id, context, secondary_agents)

    # 1b. Recovery mode — restrict tool set when safety override active
    safety_override = state.get("_safety_override")
    if safety_override and safety_override.get("forced_mode") == "recovery":
        RECOVERY_SAFE_TOOLS = {
            "get_readiness_detail", "get_training_session", "get_my_programs",
            "get_schedule", "get_benchmark_comparison", "get_active_recommendations",
            "navigate_to", "log_test_result", "get_injury_status",
        }
        pre_count = len(tools)
        tools = [t for t in tools if t.name in RECOVERY_SAFE_TOOLS]
        logger.info(f"Recovery mode: restricted {pre_count} → {len(tools)} safe tools")

    tool_map = {t.name: t for t in tools}

    # 2. Build 2-block system prompt
    static_block, dynamic_block = build_system_prompt(
        agent_type=agent_type,
        context=context,
        aib_summary=aib_summary,
        secondary_agents=secondary_agents if secondary_agents else None,
    )

    # 2b. Safety override — hard constraint injection when RED risk active
    safety_override = state.get("_safety_override")
    if safety_override:
        forced_mode = safety_override.get("forced_mode", "recovery")
        reason = safety_override.get("reason", "elevated risk")
        safety_injection = f"""
HARD SAFETY CONSTRAINT (NON-NEGOTIABLE — overrides ALL other instructions):
Reason: {reason}
Mode: {forced_mode.upper()}

YOU MUST:
- Recommend ONLY light intensity, recovery, active rest, mobility, or sleep optimization
- If athlete asks for hard/intense/heavy training, explain why their body needs recovery first
- Use get_training_session with category="recovery" if suggesting any session
- Frame recovery positively: "Let's protect the gains you've made"

YOU MUST NOT:
- Recommend HARD, HIGH, MODERATE, or INTENSE training under any circumstances
- Suggest sprints, heavy lifts, plyometrics, or max-effort work
- Minimize the safety concern ("you'll probably be fine")
"""
        dynamic_block = safety_injection + "\n\n" + dynamic_block
        logger.warning(f"Safety override injected into agent prompt: {reason}")

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

    # Conversation messages from state
    conversation_msgs = list(state.get("messages", []))
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

            # Build preview text for the user
            preview_parts = []
            for pa in pending_actions:
                name = pa["toolName"].replace("_", " ").title()
                preview_parts.append(f"• {name}")

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
            results.append({"tool": tool_name, "result": result, "success": True})
        except Exception as e:
            results.append({"tool": tool_name, "error": str(e), "success": False})

    # Determine refresh targets based on which tools were executed
    refresh_targets = set()
    for action in actions:
        name = action.get("toolName", "")
        if "event" in name or "schedule" in name:
            refresh_targets.add("schedule")
        if "check_in" in name or "readiness" in name:
            refresh_targets.add("readiness")
        if "program" in name:
            refresh_targets.add("programs")
        if "test" in name:
            refresh_targets.add("tests")

    return {
        "agent_response": json.dumps({"confirmed_results": results}),
        "pending_write_action": None,
        "write_confirmed": True,
        "tool_calls": [{"name": a.get("toolName"), "input": a.get("toolInput"), "confirmed": True} for a in actions],
        "_refresh_targets": list(refresh_targets),
    }
