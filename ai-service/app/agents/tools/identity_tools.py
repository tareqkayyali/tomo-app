"""
Tomo AI Service — Identity Agent Tools (v2 consolidated)

Merges tools from 2 v1 agents into a single Identity agent:
  - mastery (achievements, CV summary, consistency, career history)
  - cv_identity (5-layer identity, coachability, development velocity, recruitment)

Covers the athlete's profile story and development trajectory (~12 tools).
"""

from __future__ import annotations

from app.models.context import PlayerContext
from app.agents.tools.mastery_tools import make_mastery_tools
from app.agents.tools.cv_identity_tools import make_cv_identity_tools


def make_identity_tools(user_id: str, context: PlayerContext) -> list:
    """Create all Identity agent tools by merging 2 v1 agent tool sets."""
    tools = []
    seen_names: set[str] = set()

    for factory in [
        make_mastery_tools,
        make_cv_identity_tools,
    ]:
        for tool in factory(user_id, context):
            if tool.name not in seen_names:
                tools.append(tool)
                seen_names.add(tool.name)

    return tools
