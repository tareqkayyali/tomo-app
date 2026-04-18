"""
Tomo AI Service — LangGraph Supervisor Graph
The main orchestration graph that wires all Phase 1-4 components together.

Graph flow:
  ┌──────────────────────────────────────────────────────────────────────┐
  │  START                                                              │
  │    │                                                                │
  │    ▼                                                                │
  │  context_assembly ─── Populates player_context + aib_summary        │
  │    │                                                                │
  │    ▼                                                                │
  │  classifier ────────── Intent classify + agent route                │
  │    │                                                                │
  │    ▼                                                                │
  │  flow_controller ───── Code-driven response routing                 │
  │    │                                                                │
  │    ├── flow_handled ── format_response ── persist ── END  ($0)      │
  │    │                                                                │
  │    ├── confirm ──────── execute_confirmed ── validate ──┐           │
  │    │                                                    │           │
  │    └── ai ──── rag_retrieval ── planner ── agent ───────┤           │
  │                                                         │           │
  │                                           validate ── format        │
  │                                                │                    │
  │                                             persist                 │
  │                                                │                    │
  │                                               END                   │
  └──────────────────────────────────────────────────────────────────────┘

Built on LangGraph StateGraph with TomoChatState.
"""

from __future__ import annotations

import logging
from typing import Literal

from langgraph.graph import StateGraph, END

from app.models.state import TomoChatState
import os

from app.graph.nodes.context_assembly import context_assembly_node
from app.graph.nodes.rag_retrieval import rag_retrieval_node
from app.graph.nodes.pre_router import pre_router_node
from app.graph.nodes.classifier_node import classifier_node
from app.graph.nodes.planner_node import planner_node
from app.graph.nodes.agent_dispatch import agent_dispatch_node, execute_confirmed_action
from app.graph.nodes.validate import validate_node
from app.graph.nodes.format_response import format_response_node
from app.graph.nodes.persist import persist_node
from app.flow.controller import flow_controller_node, route_after_flow_controller

# Feature flag: use v2 classifier node (Sonnet) vs v1 pre_router (Haiku+regex)
_CLASSIFIER_VERSION = os.environ.get("CLASSIFIER_VERSION", "haiku")

logger = logging.getLogger("tomo-ai.supervisor")


# ── Routing Functions ──────────────────────────────────────────────

def route_after_classifier(state: TomoChatState) -> Literal["flow_controller"]:
    """
    After classifier, always go to flow_controller.
    The flow controller decides whether to handle the request directly
    (capsule_direct, data_display) or fall through to the agent pipeline.
    """
    return "flow_controller"


def route_after_validate(state: TomoChatState) -> Literal["format_response"]:
    """After validation, always go to format_response."""
    return "format_response"


# ── Graph Builder ──────────────────────────────────────────────────

def build_supervisor_graph() -> StateGraph:
    """
    Build the LangGraph supervisor graph.

    Returns an UNCOMPILED StateGraph — call .compile() on it to get the
    executable graph, optionally with a checkpointer for session persistence.
    """
    graph = StateGraph(TomoChatState)

    # ── Add nodes ──
    # classifier_node checks CLASSIFIER_VERSION at RUNTIME (not module load)
    # so it always delegates correctly regardless of when the graph was compiled.
    graph.add_node("context_assembly", context_assembly_node)
    graph.add_node("rag_retrieval", rag_retrieval_node)
    graph.add_node("classifier", classifier_node)  # Runtime: sonnet or pre_router
    graph.add_node("flow_controller", flow_controller_node)  # Code-driven response routing
    graph.add_node("planner", planner_node)           # v2: conversation planner
    graph.add_node("agent_dispatch", agent_dispatch_node)
    graph.add_node("execute_confirmed", execute_confirmed_action)
    graph.add_node("validate", validate_node)
    graph.add_node("format_response", format_response_node)
    graph.add_node("persist", persist_node)

    logger.info(f"Supervisor graph: classifier={_CLASSIFIER_VERSION}, agent_version={os.environ.get('AGENT_VERSION', 'v2')}")

    # ── Set entry point ──
    graph.set_entry_point("context_assembly")

    # ── Linear edges ──
    # pre_router runs BEFORE rag_retrieval so intent_id is set for RAG skip logic.
    # Capsule/confirm paths skip RAG entirely (saves ~$0.003 per skip).
    graph.add_edge("context_assembly", "classifier")

    # ── Classifier → Flow Controller (always) ──
    # Flow controller checks FLOW_REGISTRY. If the intent has a registered
    # pattern (capsule_direct, data_display, etc.), it handles the response
    # directly. Otherwise falls through to the existing agent pipeline.
    graph.add_edge("classifier", "flow_controller")

    # ── Conditional edge: flow_controller → {flow_handled | confirm | ai} ──
    graph.add_conditional_edges(
        "flow_controller",
        route_after_flow_controller,
        {
            "flow_handled": "format_response",   # Flow controller built the response, skip agent
            "confirm": "execute_confirmed",      # Confirmed write: skip RAG, execute the pending action
            "ai": "rag_retrieval",              # Full AI: RAG first, then agent dispatch
        },
    )

    # ── RAG → Planner → Agent dispatch ──
    # Planner sits between RAG and agent_dispatch to detect multi-step workflows.
    # Phase 1: pass-through (logs only). Phase 3: creates workflow plans.
    graph.add_edge("rag_retrieval", "planner")
    graph.add_edge("planner", "agent_dispatch")

    # ── Agent dispatch → validate ──
    graph.add_edge("agent_dispatch", "validate")

    # ── Execute confirmed → validate ──
    graph.add_edge("execute_confirmed", "validate")

    # ── Validate → format_response ──
    graph.add_edge("validate", "format_response")

    # ── Format response → persist ──
    graph.add_edge("format_response", "persist")

    # ── Persist → END ──
    graph.add_edge("persist", END)

    return graph


# ── Compiled graph singleton ───────────────────────────────────────

_compiled_graph = None


def get_supervisor():
    """
    Get the compiled supervisor graph (singleton).

    The graph is compiled without a checkpointer for now.
    Phase 5 will add PostgresSaver for session persistence.
    """
    global _compiled_graph
    if _compiled_graph is None:
        graph = build_supervisor_graph()
        _compiled_graph = graph.compile()
        logger.info("Supervisor graph compiled successfully")
    return _compiled_graph


async def run_supervisor(
    user_id: str,
    session_id: str,
    message: str,
    active_tab: str = "Chat",
    timezone: str = "UTC",
    confirmed_action: dict = None,
    profile_overrides: dict | None = None,
) -> dict:
    """
    Execute the supervisor graph for a single chat turn.

    Args:
        user_id: Authenticated user ID
        session_id: Chat session ID (for conversation continuity)
        message: User's message text
        active_tab: Currently active app tab
        timezone: User's timezone
        confirmed_action: If set, this is a write action confirmation

    Returns:
        Final state dict with final_response, final_cards, telemetry, etc.
    """
    from langchain_core.messages import HumanMessage, AIMessage
    import uuid

    graph = get_supervisor()

    # ── Cost limit check (v2) ────────────────────────────────────────
    try:
        from app.middleware.cost_tracker import (
            get_user_spend, check_cost_limit, build_cost_limit_response,
        )
        daily_spent, monthly_spent = await get_user_spend(user_id)
        cost_check = check_cost_limit(daily_spent, monthly_spent)
        if not cost_check.allowed:
            logger.warning(
                f"Cost limit hit for {user_id}: daily=${daily_spent:.4f}, "
                f"monthly=${monthly_spent:.4f}, reason={cost_check.reason}"
            )
            return {
                "final_response": build_cost_limit_response(),
                "session_id": session_id,
                "total_cost_usd": 0.0,
                "total_tokens": 0,
                "latency_ms": 0.0,
            }
    except Exception as e:
        logger.debug(f"Cost check skipped: {e}")  # Fail open — never block on cost check errors

    # Load conversation history + last agent for session continuity (graceful fallback)
    history_messages: list = []
    last_session_agent: str | None = None
    try:
        from app.graph.conversation_history import (
            load_conversation_history,
            load_last_agent_for_session,
        )
        history_messages = await load_conversation_history(session_id, user_id)
        last_session_agent = await load_last_agent_for_session(session_id, user_id)
        if history_messages:
            logger.info(
                f"Loaded {len(history_messages)} history messages for session {session_id[:8]}... "
                f"(last_agent={last_session_agent or 'none'})"
            )
    except Exception as e:
        logger.warning(f"History load failed (continuing without): {e}")

    # Build initial state — history + current message
    input_state: dict = {
        "messages": history_messages + [HumanMessage(content=message)],
        "user_id": user_id,
        "session_id": session_id,
        "active_tab": active_tab,
        "timezone": timezone,
        "request_id": str(uuid.uuid4()),
        # Initialize telemetry
        "total_cost_usd": 0.0,
        "total_tokens": 0,
        "latency_ms": 0.0,
        # Initialize validation
        "validation_passed": True,
        "validation_flags": [],
        # Initialize routing classification
        "classification_layer": None,
        "intent_id": None,
        # Seed with last agent from session for cross-invocation agent lock.
        # pre_router checks state.get("selected_agent") for conversation continuity;
        # without this, every invocation starts fresh and agent lock never fires.
        "selected_agent": last_session_agent,
        # Initialize output
        "tool_calls": [],
        "final_cards": [],
        "write_confirmed": False,
        # Initialize RAG
        "rag_context": "",
        "rag_metadata": {},
        # Initialize memory (4-tier: Zep + AIB + longitudinal)
        "memory_context": None,
        # Initialize multi-tenant
        "tenant_context": None,
        # v2: Initialize workflow fields
        "_secondary_agents": [],
        "_workflow_steps": None,
        "_conversation_plan": None,
        "_refresh_targets": [],
        # Initialize flow controller
        "_flow_pattern": None,
        # Initialize observability (computed by persist_node for LangSmith)
        "_observability": None,
    }

    # If this is a confirmation, inject the pending action
    if confirmed_action:
        input_state["pending_write_action"] = confirmed_action
        input_state["write_confirmed"] = True

    # Optional profile overrides (eval harness, pre-profile athletes).
    # Context_assembly applies them only when the DB profile is empty,
    # so real athletes aren't affected.
    if profile_overrides:
        input_state["_profile_overrides"] = profile_overrides

    # Pre-execution metadata attached to the LangSmith trace via config
    # (auto-tracer reads this and includes it on the root run)
    pre_metadata = {
        "user_id": user_id,
        "session_id": session_id,
        "active_tab": active_tab,
        "timezone": timezone,
        "request_id": input_state["request_id"],
        "has_confirmed_action": confirmed_action is not None,
    }

    config = {
        "configurable": {
            "thread_id": session_id,
        },
        "metadata": pre_metadata,
    }

    try:
        result = await graph.ainvoke(input_state, config=config)

        # Fire-and-forget: observability trace runs in background thread
        # NEVER blocks the chat response — analytics must not impact UX
        try:
            import asyncio
            from app.graph.observability import create_observability_trace
            asyncio.create_task(create_observability_trace(
                result=result,
                message=message,
                user_id=user_id,
                session_id=session_id,
                request_id=input_state["request_id"],
            ))
        except Exception as e:
            logger.debug(f"Observability trace skipped: {e}")

        # Persist successful request to Supabase (cross-instance telemetry)
        try:
            import asyncio as _asyncio
            from app.core.debug_logger import log_request as _log_request
            _asyncio.create_task(_log_request(
                user_id=user_id,
                session_id=session_id,
                message=message,
                intent_id=result.get("intent_id", "-"),
                agent=result.get("selected_agent", "-"),
                flow_pattern=result.get("_flow_pattern", "ai"),
                status="ok",
                cost_usd=result.get("total_cost_usd", 0.0),
                latency_ms=result.get("latency_ms", 0.0),
                tokens_used=result.get("total_tokens", 0),
            ))
        except Exception:
            pass

        return result
    except Exception as e:
        import json as _json
        import traceback as _tb
        import sys as _sys

        # Force-print to stderr so Railway sees it regardless of buffering
        error_tb = _tb.format_exc()
        print(f"[SUPERVISOR CRASH] {e}\n{error_tb}", file=_sys.stderr, flush=True)
        _sys.stderr.flush()
        logger.error(f"Supervisor execution failed: {e}", exc_info=True)

        # Persist error to Supabase (cross-instance, survives restarts)
        try:
            import asyncio as _asyncio
            from app.core.debug_logger import log_error as _log_error
            _asyncio.create_task(_log_error(
                error=str(e),
                traceback=error_tb,
                node="supervisor",
                user_id=user_id,
                session_id=session_id,
                request_message=message[:500],
                intent_id=input_state.get("intent_id", "-"),
                severity="error",
            ))
        except Exception:
            pass  # Never let error capture block the response

        error_response = {
            "headline": "Hey -- ran into something",
            "body": "Something tripped up on my end. Mind sending that again?",
            "cards": [],
            "chips": [{"label": "Try again", "message": "Can you try that again?"}],
            # Include traceback in debug field — stripped before mobile rendering
            "_debug_error": str(e),
            "_debug_traceback": error_tb,
        }
        return {
            "final_response": _json.dumps(error_response),
            "final_cards": [],
            "total_cost_usd": 0.0,
            "total_tokens": 0,
            "latency_ms": 0.0,
        }
