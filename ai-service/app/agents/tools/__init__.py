"""
Tomo AI Service — Tool Registry
Maps agent types to their tool factory functions.

Usage:
    tools = get_tools_for_agent("output", user_id, context)
    # Returns list of LangChain @tool instances bound to the user
"""

from __future__ import annotations

from typing import Any

from app.models.context import PlayerContext

from app.agents.tools.output_tools import make_output_tools
from app.agents.tools.timeline_tools import make_timeline_tools
from app.agents.tools.mastery_tools import make_mastery_tools
from app.agents.tools.settings_tools import make_settings_tools
from app.agents.tools.planning_tools import make_planning_tools


TOOL_FACTORIES: dict[str, Any] = {
    "output": make_output_tools,
    "timeline": make_timeline_tools,
    "mastery": make_mastery_tools,
    "settings": make_settings_tools,
    "planning": make_planning_tools,
}


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
            "get_dual_load_score", "log_check_in", "get_test_results",
            "get_training_session", "get_drill_detail", "get_benchmark_comparison",
            "get_training_program_recommendations", "calculate_phv_stage",
            "get_my_programs", "get_program_by_id", "get_test_catalog",
            "log_test_result", "rate_drill", "get_today_training_for_journal",
            "get_pending_post_journal", "save_journal_pre", "save_journal_post",
        ],
        "timeline": [
            "get_today_events", "get_week_schedule", "create_event",
            "update_event", "delete_event", "detect_load_collision",
        ],
        "mastery": [
            "get_achievement_history", "get_test_trajectory", "get_cv_summary",
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
    }
