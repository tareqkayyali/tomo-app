"""
Tomo AI Service -- Code-Driven Flow Controller

Replaces LLM structural decisions with deterministic code paths.
The LLM only generates natural language text; code controls response structure.

5 response patterns:
  - CAPSULE_DIRECT:  $0, instant, no LLM (check_in, navigate, log_test, etc.)
  - DATA_DISPLAY:    tool call + card builder + tiny Haiku text (~$0.0005)
  - MULTI_STEP:      step tracker + per-step rendering (~$0.001/step)
  - WRITE_ACTION:    full LLM for parameter extraction (~$0.003)
  - OPEN_COACHING:   full LLM creative response (~$0.005)

Phase 1: capsule_direct only. Other patterns pass through to existing pipeline.
"""

from app.flow.registry import FlowConfig, FLOW_REGISTRY, get_flow_config
from app.flow.controller import flow_controller_node

__all__ = [
    "FlowConfig",
    "FLOW_REGISTRY",
    "get_flow_config",
    "flow_controller_node",
]
