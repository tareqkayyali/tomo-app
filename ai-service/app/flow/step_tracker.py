"""
Tomo AI Service -- Multi-Step Flow State Tracker
Persists flow state to conversation_plans table for cross-turn continuity.

Each multi-step flow (e.g., build_session) creates a FlowState that tracks:
  - Which step we're on
  - Data collected from previous steps (context_carry)
  - The original intent and config

FlowState has a 60-minute TTL (matches conversation_plans table default).
"""

from __future__ import annotations

import json
import logging
import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Any, Optional

logger = logging.getLogger("tomo-ai.flow.step_tracker")


@dataclass
class StepDefinition:
    """A single step in a multi-step flow."""
    id: str
    # What this step does (one of):
    tool: Optional[str] = None          # Tool to call (e.g., "get_today_events")
    card: Optional[str] = None          # Card to present (e.g., "choice_card")
    # Step config:
    condition: Optional[str] = None     # Fork condition (e.g., "existing_training_sessions")
    options_key: Optional[str] = None   # Key in context_carry for dynamic options
    static_options: Optional[list[dict]] = None  # Static choice options
    confirm_tool: Optional[str] = None  # Write tool for confirm step
    tool_args_from: Optional[dict[str, str]] = None  # Map tool args from context_carry keys
    check: Optional[str] = None         # Deterministic safety/condition check name (e.g. "readiness_and_load")


@dataclass
class FlowState:
    """Persistent state for a multi-step flow across conversation turns."""
    flow_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    intent_id: str = ""
    workflow_type: str = "multi_step"
    steps: list[dict] = field(default_factory=list)  # Serialized StepDefinitions
    current_step_index: int = 0
    context_carry: dict[str, Any] = field(default_factory=dict)
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    @property
    def current_step(self) -> Optional[StepDefinition]:
        """Get the current step definition."""
        if self.current_step_index >= len(self.steps):
            return None
        step_dict = self.steps[self.current_step_index]
        return StepDefinition(**step_dict)

    @property
    def is_complete(self) -> bool:
        return self.current_step_index >= len(self.steps)

    def advance(self):
        """Move to the next step."""
        self.current_step_index += 1
        self.updated_at = datetime.now(timezone.utc).isoformat()

    def store(self, key: str, value: Any):
        """Store data in context_carry for downstream steps."""
        self.context_carry[key] = value
        self.updated_at = datetime.now(timezone.utc).isoformat()

    def get(self, key: str, default: Any = None) -> Any:
        """Retrieve data from context_carry."""
        return self.context_carry.get(key, default)

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> FlowState:
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})


async def save_flow_state(session_id: str, user_id: str, state: FlowState) -> None:
    """Persist FlowState to conversation_plans table."""
    try:
        from app.db.supabase import get_pool
        pool = get_pool()

        plan_data = json.dumps({
            "flow_state": state.to_dict(),
            "type": "flow_controller",
        })

        async with pool.connection() as conn:
            await conn.execute(
                """INSERT INTO conversation_plans (id, session_id, user_id, plan_data, updated_at)
                   VALUES (%s, %s, %s, %s::jsonb, NOW())
                   ON CONFLICT (id) DO UPDATE SET
                     plan_data = EXCLUDED.plan_data,
                     updated_at = NOW()""",
                (state.flow_id, session_id, user_id, plan_data),
            )

        logger.info(
            f"FlowState saved: flow={state.flow_id[:8]}... "
            f"step={state.current_step_index}/{len(state.steps)}"
        )
    except Exception as e:
        logger.error(f"Failed to save FlowState: {e}", exc_info=True)


async def load_active_flow(session_id: str, user_id: str) -> Optional[FlowState]:
    """Load active (non-expired) FlowState for this session.

    Returns None if no active flow exists or if it's expired.
    """
    try:
        from app.db.supabase import get_pool
        pool = get_pool()

        async with pool.connection() as conn:
            result = await conn.execute(
                """SELECT plan_data
                   FROM conversation_plans
                   WHERE session_id = %s
                     AND user_id = %s
                     AND expires_at > NOW()
                   ORDER BY updated_at DESC
                   LIMIT 1""",
                (session_id, user_id),
            )
            row = await result.fetchone()

        if not row:
            return None

        plan_data = row[0] if isinstance(row[0], dict) else json.loads(row[0])

        # Only load flow_controller plans (not planner_node plans)
        if plan_data.get("type") != "flow_controller":
            return None

        flow_dict = plan_data.get("flow_state")
        if not flow_dict:
            return None

        flow = FlowState.from_dict(flow_dict)

        # Don't return completed flows
        if flow.is_complete:
            return None

        logger.info(
            f"FlowState loaded: flow={flow.flow_id[:8]}... "
            f"step={flow.current_step_index}/{len(flow.steps)} "
            f"intent={flow.intent_id}"
        )
        return flow

    except Exception as e:
        logger.warning(f"Failed to load FlowState: {e}")
        return None


async def clear_flow_state(session_id: str, user_id: str) -> None:
    """Clear active flow state (e.g., on cancel or completion)."""
    try:
        from app.db.supabase import get_pool
        pool = get_pool()

        async with pool.connection() as conn:
            await conn.execute(
                """DELETE FROM conversation_plans
                   WHERE session_id = %s AND user_id = %s
                   AND plan_data->>'type' = 'flow_controller'""",
                (session_id, user_id),
            )
        logger.info(f"FlowState cleared for session {session_id[:8]}...")
    except Exception as e:
        logger.warning(f"Failed to clear FlowState: {e}")
