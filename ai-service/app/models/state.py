"""
Tomo AI Service — LangGraph State Definition
TomoChatState is the central TypedDict flowing through all graph nodes.

This is the single source of truth for what data moves through the
LangGraph supervisor → agent subgraph → validate → persist pipeline.
"""

from __future__ import annotations

from typing import Optional, Any
from typing_extensions import TypedDict

from langgraph.graph import MessagesState

from app.models.context import PlayerContext
from app.models.tenant import TenantContext


class TomoChatState(MessagesState):
    """
    LangGraph state for the Tomo coaching chat pipeline.

    Extends MessagesState (which provides `messages: list[BaseMessage]`)
    with Tomo-specific fields for context, routing, and output.

    Flow:
      1. context_assembly_node → populates player_context, aib_summary
      2. pre_router_node → populates route_decision (capsule vs AI)
      3. router_node → populates selected_agent
      4. agent subgraph → populates agent_response, tool_calls
      5. validate_node → populates validation_result
      6. persist_node → saves to DB, populates final_response
    """

    # ── Request metadata ──
    user_id: str
    session_id: str
    active_tab: str
    timezone: str
    request_id: str  # For LangSmith trace correlation

    # ── Context (populated by context_assembly_node) ──
    player_context: Optional[PlayerContext]
    aib_summary: Optional[str]  # Pre-synthesized AIB text (Haiku-generated)
    memory_context: Optional[str]  # Formatted 4-tier memory block for prompt injection

    # ── Routing (populated by router nodes) ──
    route_decision: Optional[str]  # "capsule" | "ai"
    capsule_type: Optional[str]  # If capsule, which type
    selected_agent: Optional[str]  # "output" | "timeline" | "mastery" | "settings" | "planning"
    routing_confidence: Optional[float]  # 0.0 - 1.0

    # ── Agent execution ──
    agent_response: Optional[str]  # Raw agent text output
    tool_calls: list[dict[str, Any]]  # Tools invoked during agent execution
    card_type: Optional[str]  # Structured output card type (stat_grid, session_plan, etc.)
    card_data: Optional[dict[str, Any]]  # Structured card payload

    # ── Validation ──
    validation_passed: bool
    validation_flags: list[str]  # ["phv_safety", "guardrail_triggered", etc.]

    # ── Output ──
    final_response: Optional[str]  # Formatted response text
    final_cards: list[dict[str, Any]]  # Structured cards for mobile rendering

    # ── Telemetry ──
    total_cost_usd: float
    total_tokens: int
    latency_ms: float

    # ── RAG (populated by rag_retrieval_node) ──
    rag_context: Optional[str]  # Formatted knowledge graph text for prompt injection
    rag_metadata: Optional[dict[str, Any]]  # Entity/chunk counts, sub-questions, cost

    # ── Multi-Tenant (populated by context_assembly_node) ──
    tenant_context: Optional[TenantContext]

    # ── Write actions (for interrupt/resume) ──
    pending_write_action: Optional[dict[str, Any]]
    write_confirmed: bool
