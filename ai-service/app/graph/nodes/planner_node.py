"""
Tomo AI Service — Conversation Planner Node (v2)

Tracks multi-step workflows across turns. Sits between the classifier and
agent_dispatch in the LangGraph pipeline.

When the Sonnet classifier detects a multi-agent request (e.g., "build me a
speed session for tomorrow" = Performance + Planning), the planner creates
a structured workflow with ordered steps. Agent dispatch iterates these steps
sequentially, passing results between them via context_carry.

For single-agent requests, the planner is a pass-through (no overhead).

Phase 1: Pass-through only — logs planner decisions but does not create plans.
Phase 3: Full activation — creates and tracks multi-step workflows.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from pydantic import BaseModel, Field

from app.models.state import TomoChatState

logger = logging.getLogger("tomo-ai.planner")


# ── Models ────────────────────────────────────────────────────────────

class WorkflowStep(BaseModel):
    """A single step in a multi-agent workflow."""
    agent: str                          # performance | planning | identity | settings
    action: str                         # Human-readable description of what to do
    status: str = "pending"             # pending | in_progress | completed | failed
    result_key: str                     # Key to store result in context_carry
    depends_on: list[str] = Field(default_factory=list)  # result_keys this step needs


class ConversationPlan(BaseModel):
    """Lightweight state machine for multi-turn workflows."""
    plan_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    workflow_type: Optional[str] = None  # "build_and_schedule", "injury_assessment", etc.
    steps: list[WorkflowStep] = Field(default_factory=list)
    current_step_index: int = 0
    context_carry: dict[str, Any] = Field(default_factory=dict)
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# ── Workflow Templates ────────────────────────────────────────────────

WORKFLOW_TEMPLATES: dict[str, list[dict]] = {
    "build_and_schedule": [
        {
            "agent": "performance",
            "action": "Build the training session with drills, sets, reps, warm-up, and cooldown",
            "result_key": "session_drills",
            "depends_on": [],
        },
        {
            "agent": "planning",
            "action": "Create calendar event with the session drills and suggest time slots",
            "result_key": "calendar_event",
            "depends_on": ["session_drills"],
        },
    ],
    "injury_and_adjust": [
        {
            "agent": "settings",
            "action": "Log the injury details (body part, severity, notes)",
            "result_key": "injury_log",
            "depends_on": [],
        },
        {
            "agent": "planning",
            "action": "Adjust this week's schedule based on the injury",
            "result_key": "schedule_adjustment",
            "depends_on": ["injury_log"],
        },
    ],
    "test_and_analyze": [
        {
            "agent": "performance",
            "action": "Log the test result",
            "result_key": "test_result",
            "depends_on": [],
        },
        {
            "agent": "performance",
            "action": "Show trajectory and benchmark comparison",
            "result_key": "analysis",
            "depends_on": ["test_result"],
        },
    ],
}


def _detect_workflow_type(
    agent: str,
    intent: str,
    second_agent: Optional[str],
) -> Optional[str]:
    """Detect which workflow template to use based on classifier output."""
    if not second_agent:
        return None

    # Performance + Planning → build and schedule
    if agent == "performance" and second_agent == "planning":
        if intent in ("build_session", "session_modification"):
            return "build_and_schedule"

    # Settings + Planning → injury and adjust
    if agent == "settings" and second_agent == "planning":
        if intent in ("log_injury", "injury_assessment"):
            return "injury_and_adjust"

    # Performance + Performance (single agent, multi-step)
    if agent == "performance" and second_agent == "performance":
        if intent in ("log_test",):
            return "test_and_analyze"

    return None


def _create_plan_from_template(workflow_type: str) -> Optional[ConversationPlan]:
    """Create a ConversationPlan from a workflow template."""
    template = WORKFLOW_TEMPLATES.get(workflow_type)
    if not template:
        return None

    steps = [WorkflowStep(**step_data) for step_data in template]
    return ConversationPlan(
        workflow_type=workflow_type,
        steps=steps,
    )


# ── LangGraph Node ────────────────────────────────────────────────────

async def planner_node(state: TomoChatState) -> dict:
    """
    Conversation Planner node.

    Phase 1 (current): Pass-through with logging.
    Phase 3 (future): Creates and tracks multi-step workflow plans.

    Reads:
        - state.selected_agent: Primary agent from classifier
        - state._secondary_agents: Secondary agents if multi-agent
        - state.intent_id: Classified intent

    Writes (Phase 3):
        - state._conversation_plan: Active plan for agent_dispatch to iterate
        - state._workflow_steps: Ordered list of (agent, action) tuples
    """
    agent = state.get("selected_agent", "performance")
    intent = state.get("intent_id", "unknown")
    secondary = state.get("_secondary_agents", [])
    second_agent = secondary[0] if secondary else None

    # Detect if this needs a multi-step workflow
    workflow_type = _detect_workflow_type(agent, intent, second_agent)

    if workflow_type:
        plan = _create_plan_from_template(workflow_type)
        if plan:
            logger.info(
                f"[PLANNER] Multi-step workflow: {workflow_type} "
                f"({len(plan.steps)} steps: {[s.agent for s in plan.steps]})"
            )
            return {
                "_conversation_plan": plan.model_dump(),
                "_workflow_steps": [(s.agent, s.action) for s in plan.steps],
            }

    # Single-agent request — pass-through
    logger.debug(f"[PLANNER] Single-agent: {agent}/{intent}")
    return {}
