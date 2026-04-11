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
from langsmith import traceable
from langsmith.run_helpers import get_current_run_tree

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


def _build_post_execution_metadata(result: dict) -> tuple[dict, list[str]]:
    """
    Extract post-execution metadata + tags from the graph result state.
    Returns (metadata_dict, tags_list) for LangSmith update_run().
    """
    metadata: dict = {}
    tags: list[str] = []

    # ── Path type ──
    route = result.get("route_decision", "ai")
    write_confirmed = result.get("write_confirmed", False)
    if write_confirmed:
        path_type = "confirmed_write"
    elif route == "capsule":
        path_type = "capsule"
    else:
        path_type = "full_ai"
    metadata["path_type"] = path_type
    tags.append(f"path:{path_type}")

    # ── Agent type ──
    agent = result.get("selected_agent", "unknown")
    metadata["agent_type"] = agent
    tags.append(f"agent:{agent}")

    # ── Classification layer + intent ──
    layer = result.get("classification_layer", "unknown")
    metadata["classification_layer"] = layer
    tags.append(f"layer:{layer}")
    metadata["intent_id"] = result.get("intent_id", "unknown")

    # ── Confidence + bucket ──
    conf = result.get("routing_confidence", 0.0) or 0.0
    metadata["routing_confidence"] = conf
    if conf < 0.65:
        conf_bucket = "low"
    elif conf <= 0.85:
        conf_bucket = "medium"
    else:
        conf_bucket = "high"
    metadata["confidence_bucket"] = conf_bucket
    tags.append(f"confidence:{conf_bucket}")

    # ── Tool count + bucket ──
    tool_calls = result.get("tool_calls", [])
    tool_count = len(tool_calls)
    metadata["tool_count"] = tool_count
    metadata["tool_names"] = [tc.get("name", "") for tc in tool_calls]
    if tool_count == 0:
        tool_bucket = "none"
    elif tool_count <= 2:
        tool_bucket = "light"
    else:
        tool_bucket = "heavy"
    metadata["tool_bucket"] = tool_bucket
    tags.append(f"tools:{tool_bucket}")

    # ── Cost + bucket ──
    cost = result.get("total_cost_usd", 0.0) or 0.0
    metadata["total_cost_usd"] = cost
    if route == "capsule":
        cost_bucket = "free"
    elif cost < 0.001:
        cost_bucket = "cheap"
    elif cost < 0.01:
        cost_bucket = "moderate"
    else:
        cost_bucket = "expensive"
    metadata["cost_bucket"] = cost_bucket
    tags.append(f"cost:{cost_bucket}")

    # ── Tokens ──
    metadata["total_tokens"] = result.get("total_tokens", 0)

    # ── Latency + bucket ──
    latency = result.get("latency_ms", 0.0) or 0.0
    metadata["latency_ms"] = latency
    if latency < 500:
        latency_bucket = "fast"
    elif latency <= 2000:
        latency_bucket = "normal"
    else:
        latency_bucket = "slow"
    metadata["latency_bucket"] = latency_bucket
    tags.append(f"latency:{latency_bucket}")

    # ── Validation ──
    metadata["validation_passed"] = result.get("validation_passed", True)
    flags = result.get("validation_flags", [])
    metadata["validation_flags"] = flags
    metadata["validation_flag_count"] = len(flags)

    # Safety-specific boolean flags for direct filtering
    metadata["phv_gate_fired"] = "phv_safety_violation" in flags
    metadata["crisis_detected"] = "crisis_content_detected" in flags
    metadata["ped_detected"] = "ped_content_detected" in flags
    metadata["medical_warning"] = "medical_diagnosis_warning" in flags

    if metadata["phv_gate_fired"]:
        tags.append("safety:phv")
    if metadata["crisis_detected"]:
        tags.append("safety:crisis")
    if metadata["ped_detected"]:
        tags.append("safety:ped")
    if metadata["medical_warning"]:
        tags.append("safety:medical")
    if not flags:
        tags.append("validation:clean")
    else:
        tags.append("validation:flagged")

    # ── RAG ──
    rag_meta = result.get("rag_metadata") or {}
    metadata["rag_used"] = bool(rag_meta.get("chunk_count", 0))
    metadata["rag_entity_count"] = rag_meta.get("entity_count", 0)
    metadata["rag_chunk_count"] = rag_meta.get("chunk_count", 0)
    metadata["rag_graph_hops"] = rag_meta.get("graph_hops", 0)
    metadata["rag_sub_questions"] = rag_meta.get("sub_questions", 0)
    metadata["rag_cost_usd"] = rag_meta.get("retrieval_cost_usd", 0.0)
    metadata["rag_latency_ms"] = rag_meta.get("latency_ms", 0.0)
    if metadata["rag_used"]:
        tags.append("rag:yes")

    # ── Write actions ──
    has_pending = result.get("pending_write_action") is not None
    metadata["has_pending_write"] = has_pending
    metadata["write_confirmed"] = write_confirmed
    if has_pending:
        tags.append("write:pending")
    if write_confirmed:
        tags.append("write:confirmed")

    # ── Capsule type ──
    capsule = result.get("capsule_type")
    if capsule:
        metadata["capsule_type"] = capsule
        tags.append(f"capsule:{capsule}")

    # ── Player context demographics ──
    player_ctx = result.get("player_context")
    if player_ctx:
        sport = getattr(player_ctx, "sport", None)
        position = getattr(player_ctx, "position", None)
        age_band = getattr(player_ctx, "age_band", None)
        readiness = getattr(player_ctx, "readiness_score", None)

        if sport:
            metadata["sport"] = sport
            tags.append(f"sport:{sport}")
        if position:
            metadata["position"] = position
        if age_band:
            metadata["age_band"] = age_band
            tags.append(f"age:{age_band}")
        if readiness:
            metadata["readiness_score"] = readiness
            tags.append(f"readiness:{readiness}")

        # PHV stage from snapshot enrichment
        snapshot = getattr(player_ctx, "snapshot_enrichment", None)
        if snapshot:
            phv = getattr(snapshot, "phv_stage", None)
            if phv:
                metadata["phv_stage"] = phv
                tags.append(f"phv:{phv}")

    return metadata, tags


@traceable(name="tomo_chat_turn", run_type="chain")
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
    from langchain_core.messages import HumanMessage
    import uuid

    graph = get_supervisor()

    # Build initial state
    input_state: dict = {
        "messages": [HumanMessage(content=message)],
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
    }

    # If this is a confirmation, inject the pending action
    if confirmed_action:
        input_state["pending_write_action"] = confirmed_action
        input_state["write_confirmed"] = True

    # Pre-execution metadata (known before graph runs)
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

        # ── Post-execution: attach rich metadata to LangSmith trace ──
        try:
            rt = get_current_run_tree()
            if rt:
                post_metadata, post_tags = _build_post_execution_metadata(result)
                rt.metadata = {**rt.metadata, **pre_metadata, **post_metadata}
                rt.tags = list(set((rt.tags or []) + post_tags))
                logger.debug(
                    f"LangSmith trace enriched: "
                    f"tags={len(post_tags)} metadata_keys={len(post_metadata)}"
                )
        except Exception as e:
            logger.warning(f"LangSmith trace enrichment failed (non-blocking): {e}")

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
