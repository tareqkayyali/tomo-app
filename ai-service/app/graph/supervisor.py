"""
Tomo AI Service — LangGraph Supervisor Graph
The main orchestration graph that wires all Phase 1-4 components together.

Graph flow:
  ┌──────────────────────────────────────────────────────────────────┐
  │  START                                                          │
  │    │                                                            │
  │    ▼                                                            │
  │  context_assembly ─── Populates player_context + aib_summary    │
  │    │                                                            │
  │    ▼                                                            │
  │  rag_retrieval ─────── PropertyGraphIndex hybrid search         │
  │    │                                                            │
  │    ▼                                                            │
  │  pre_router ────────── Intent classify + agent route            │
  │    │                                                            │
  │    ├── capsule ──── format_response ──── persist ──── END       │
  │    │                                                            │
  │    ├── confirm ──── execute_confirmed ── validate ──┐           │
  │    │                                                │           │
  │    └── ai ──────── agent_dispatch ──── validate ────┤           │
  │                                                     │           │
  │                                        format_response          │
  │                                              │                  │
  │                                           persist               │
  │                                              │                  │
  │                                             END                 │
  └──────────────────────────────────────────────────────────────────┘

Built on LangGraph StateGraph with TomoChatState.
"""

from __future__ import annotations

import logging
from typing import Literal

from langgraph.graph import StateGraph, END

from app.models.state import TomoChatState
from app.graph.nodes.context_assembly import context_assembly_node
from app.graph.nodes.rag_retrieval import rag_retrieval_node
from app.graph.nodes.pre_router import pre_router_node
from app.graph.nodes.agent_dispatch import agent_dispatch_node, execute_confirmed_action
from app.graph.nodes.validate import validate_node
from app.graph.nodes.format_response import format_response_node
from app.graph.nodes.persist import persist_node

logger = logging.getLogger("tomo-ai.supervisor")


# ── Routing Functions ──────────────────────────────────────────────

def route_after_pre_router(state: TomoChatState) -> Literal["capsule", "confirm", "ai"]:
    """
    Conditional edge after pre_router_node.
    Determines whether to go to capsule fast-path, confirm path, or full AI.
    """
    # Check if this is a write action confirmation
    if state.get("write_confirmed") and state.get("pending_write_action"):
        return "confirm"

    route_decision = state.get("route_decision", "ai")

    if route_decision == "capsule":
        return "capsule"

    return "ai"


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
    graph.add_node("context_assembly", context_assembly_node)
    graph.add_node("rag_retrieval", rag_retrieval_node)
    graph.add_node("pre_router", pre_router_node)
    graph.add_node("agent_dispatch", agent_dispatch_node)
    graph.add_node("execute_confirmed", execute_confirmed_action)
    graph.add_node("validate", validate_node)
    graph.add_node("format_response", format_response_node)
    graph.add_node("persist", persist_node)

    # ── Set entry point ──
    graph.set_entry_point("context_assembly")

    # ── Linear edges ──
    graph.add_edge("context_assembly", "rag_retrieval")
    graph.add_edge("rag_retrieval", "pre_router")

    # ── Conditional edge: pre_router → {capsule | confirm | ai} ──
    graph.add_conditional_edges(
        "pre_router",
        route_after_pre_router,
        {
            "capsule": "format_response",       # Capsule: skip agent, go straight to format
            "confirm": "execute_confirmed",      # Confirmed write: execute the pending action
            "ai": "agent_dispatch",              # Full AI: run agent with tools
        },
    )

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

    # Load conversation history for session continuity (graceful fallback)
    history_messages: list = []
    try:
        from app.graph.conversation_history import load_conversation_history
        history_messages = await load_conversation_history(session_id, user_id)
        if history_messages:
            logger.info(f"Loaded {len(history_messages)} history messages for session {session_id[:8]}...")
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
        # Initialize observability (computed by persist_node for LangSmith)
        "_observability": None,
    }

    # If this is a confirmation, inject the pending action
    if confirmed_action:
        input_state["pending_write_action"] = confirmed_action
        input_state["write_confirmed"] = True

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

        return result
    except Exception as e:
        logger.error(f"Supervisor execution failed: {e}", exc_info=True)
        return {
            "final_response": f'{{"headline":"Something went wrong","body":"I hit an error processing your request. Please try again.","cards":[{{"type":"text_card","body":"Error: {str(e)[:100]}"}}],"chips":[]}}',
            "final_cards": [],
            "total_cost_usd": 0.0,
            "total_tokens": 0,
            "latency_ms": 0.0,
        }
