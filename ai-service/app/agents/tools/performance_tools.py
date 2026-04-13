"""
Tomo AI Service — Performance Agent Tools (v2 consolidated)

Merges tools from 4 v1 agents into a single Performance agent:
  - output (readiness, vitals, check-in, drills, programs, journals)
  - testing_benchmark (test results, benchmarks, percentiles, combine)
  - recovery (recovery status, deload, tissue loading, injury concern)
  - training_program (periodization, training blocks, PHV programs)

This is the largest agent (~35 tools) covering everything about the
athlete's physical state and training content.

No tools are rewritten — existing factory functions are called and merged.
"""

from __future__ import annotations

from app.models.context import PlayerContext
from app.agents.tools.output_tools import make_output_tools
from app.agents.tools.testing_benchmark_tools import make_testing_benchmark_tools
from app.agents.tools.recovery_tools import make_recovery_tools
from app.agents.tools.training_program_tools import make_training_program_tools


def make_performance_tools(user_id: str, context: PlayerContext) -> list:
    """Create all Performance agent tools by merging 4 v1 agent tool sets."""
    tools = []
    seen_names: set[str] = set()

    # Merge in priority order (output first, then specializations)
    for factory in [
        make_output_tools,
        make_testing_benchmark_tools,
        make_recovery_tools,
        make_training_program_tools,
    ]:
        for tool in factory(user_id, context):
            # Deduplicate by tool name (in case of overlap)
            if tool.name not in seen_names:
                tools.append(tool)
                seen_names.add(tool.name)

    return tools
