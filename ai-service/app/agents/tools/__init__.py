"""
Tomo AI Service — Tool Registry
Maps agent types to their tool factory functions.

v1 (10 agents): output, timeline, mastery, settings, planning,
                testing_benchmark, recovery, dual_load, cv_identity, training_program
v2 (4 agents):  performance, planning, identity, settings

Controlled by AGENT_VERSION env var (default: "v2").
v1 agent names are aliased to v2 agents for backward compatibility.

Usage:
    tools = get_tools_for_agent("performance", user_id, context)
    # Returns list of LangChain @tool instances bound to the user
"""

from __future__ import annotations

import os
from typing import Any

from app.models.context import PlayerContext

# v1 factories (individual agents)
from app.agents.tools.output_tools import make_output_tools
from app.agents.tools.timeline_tools import make_timeline_tools
from app.agents.tools.mastery_tools import make_mastery_tools
from app.agents.tools.settings_tools import make_settings_tools
from app.agents.tools.planning_tools import make_planning_tools
from app.agents.tools.testing_benchmark_tools import make_testing_benchmark_tools
from app.agents.tools.recovery_tools import make_recovery_tools
from app.agents.tools.dual_load_tools import make_dual_load_tools
from app.agents.tools.cv_identity_tools import make_cv_identity_tools
from app.agents.tools.training_program_tools import make_training_program_tools

# v2 consolidated factories (4 agents)
from app.agents.tools.performance_tools import make_performance_tools
from app.agents.tools.planning_tools_v2 import make_planning_tools_v2
from app.agents.tools.identity_tools import make_identity_tools

_AGENT_VERSION = os.environ.get("AGENT_VERSION", "v2")

# v1: 10 agents (backward compat)
TOOL_FACTORIES_V1: dict[str, Any] = {
    "output": make_output_tools,
    "timeline": make_timeline_tools,
    "mastery": make_mastery_tools,
    "settings": make_settings_tools,
    "planning": make_planning_tools,
    "testing_benchmark": make_testing_benchmark_tools,
    "recovery": make_recovery_tools,
    "dual_load": make_dual_load_tools,
    "cv_identity": make_cv_identity_tools,
    "training_program": make_training_program_tools,
}

# v2: 4 agents + aliases from v1 names
TOOL_FACTORIES_V2: dict[str, Any] = {
    # The 4 canonical v2 agents
    "performance": make_performance_tools,
    "planning": make_planning_tools_v2,
    "identity": make_identity_tools,
    "settings": make_settings_tools,
    # Aliases: v1 agent names → v2 agents (backward compat for existing code)
    "output": make_performance_tools,
    "testing_benchmark": make_performance_tools,
    "recovery": make_performance_tools,
    "training_program": make_performance_tools,
    "timeline": make_planning_tools_v2,
    "dual_load": make_planning_tools_v2,
    "mastery": make_identity_tools,
    "cv_identity": make_identity_tools,
}

# Active factory map
TOOL_FACTORIES = TOOL_FACTORIES_V2 if _AGENT_VERSION == "v2" else TOOL_FACTORIES_V1


def get_tools_for_agent(
    agent_type: str,
    user_id: str,
    context: PlayerContext,
    secondary_agents: list[str] | None = None,
) -> list:
    """
    Get all tools for a given agent type, bound to a specific user context.

    If secondary_agents are specified, their tools are merged in (for multi-agent routing).
    Primary agent's tools come first, secondary agent tools appended.
    """
    factory = TOOL_FACTORIES.get(agent_type, TOOL_FACTORIES["output"])
    tools = factory(user_id, context)

    # Merge secondary agent tools if the router assigned multiple agents
    if secondary_agents:
        for sec_agent in secondary_agents:
            if sec_agent != agent_type and sec_agent in TOOL_FACTORIES:
                sec_tools = TOOL_FACTORIES[sec_agent](user_id, context)
                tools.extend(sec_tools)

    return tools


def get_all_tool_names() -> dict[str, list[str]]:
    """
    Get tool names by agent type (for debugging/docs).
    Note: Returns placeholder names since factory functions need user context.
    """
    return {
        "output": [
            "get_readiness_detail", "get_vitals_trend", "get_checkin_history",
            "get_dual_load_score", "log_check_in",
            "get_training_session", "get_drill_detail",
            "get_training_program_recommendations", "calculate_phv_stage",
            "get_my_programs", "get_program_by_id",
            "rate_drill", "get_today_training_for_journal",
            "get_pending_post_journal", "save_journal_pre", "save_journal_post",
        ],
        "timeline": [
            "get_today_events", "get_week_schedule", "create_event",
            "update_event", "delete_event", "detect_load_collision",
        ],
        "mastery": [
            "get_achievement_history", "get_cv_summary",
            "get_consistency_score", "list_career_history",
            "add_career_entry", "update_career_entry",
        ],
        "settings": [
            "get_goals", "get_injury_status", "get_nutrition_log",
            "get_sleep_log", "get_profile", "get_notification_preferences",
            "get_schedule_rules", "get_wearable_status", "get_drill_library",
            "navigate_to", "set_goal", "complete_goal", "delete_goal",
            "log_injury", "clear_injury", "log_nutrition", "log_sleep",
            "update_profile", "update_notification_preferences",
            "update_schedule_rules", "toggle_league_mode", "toggle_exam_period",
            "sync_wearable",
        ],
        "planning": [
            "get_planning_context", "get_mode_options", "propose_mode_change",
            "get_current_plan", "get_protocol_details",
        ],
        "testing_benchmark": [
            "get_test_results", "get_test_catalog", "get_benchmark_comparison",
            "log_test_result", "get_test_trajectory",
            "create_test_session", "get_combine_readiness_score", "generate_test_report",
        ],
        "recovery": [
            "get_recovery_status", "get_deload_recommendation", "trigger_deload_week",
            "log_recovery_session", "get_tissue_loading_history", "flag_injury_concern",
        ],
        "dual_load": [
            "get_dual_load_dashboard", "get_cognitive_readiness_windows",
            "get_exam_collision_forecast", "set_academic_priority_period",
            "generate_integrated_weekly_plan", "set_academic_stress_level",
        ],
        "cv_identity": [
            "get_5_layer_identity", "get_coachability_index", "get_development_velocity",
            "set_recruitment_visibility", "generate_cv_export", "add_verified_achievement",
        ],
        "training_program": [
            "get_phv_appropriate_programs", "get_periodization_context",
            "get_position_program_recommendations", "get_training_block_history",
            "create_training_block", "update_block_phase", "override_session_load",
        ],
    }
