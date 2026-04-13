"""
Tomo AI Service — Planning Agent Tools (v2 consolidated)

Merges tools from 3 v1 agents into a single Planning agent:
  - timeline (calendar CRUD, schedule viewing, load collision)
  - planning (mode switching, protocols, planning context)
  - dual_load (academic-athletic balance, cognitive windows, exam collision)

Covers everything about the athlete's time and schedule (~22 tools).
"""

from __future__ import annotations

from app.models.context import PlayerContext
from app.agents.tools.timeline_tools import make_timeline_tools
from app.agents.tools.planning_tools import make_planning_tools
from app.agents.tools.dual_load_tools import make_dual_load_tools


def make_planning_tools_v2(user_id: str, context: PlayerContext) -> list:
    """Create all Planning agent tools by merging 3 v1 agent tool sets."""
    tools = []
    seen_names: set[str] = set()

    for factory in [
        make_timeline_tools,
        make_planning_tools,
        make_dual_load_tools,
    ]:
        for tool in factory(user_id, context):
            if tool.name not in seen_names:
                tools.append(tool)
                seen_names.add(tool.name)

    return tools
