"""
Tomo AI Service -- Flow Registry
Maps intent_id to a deterministic response pattern + config.

Every intent that enters the flow controller is looked up here.
If the intent has no entry, the flow controller falls through to the
existing agent pipeline (rag -> planner -> agent_dispatch).

5 patterns:
  capsule_direct  - $0, instant, mobile renders natively
  data_display    - $0, tool call + card builder + deterministic headline
  multi_step      - ~$0.001/step, code-driven step tracker
  write_action    - pass through to existing agent_dispatch
  open_coaching   - pass through to existing agent_dispatch (full LLM)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass(frozen=True)
class FlowConfig:
    """Immutable config for a single intent's response flow.

    Attributes:
        pattern: Response pattern name. One of:
            capsule_direct, data_display, multi_step, write_action, open_coaching
        capsule_type: For capsule_direct -- which capsule card type to return.
        tool: For data_display -- which tool to call for data.
        card: For data_display -- which card type to render the tool result.
        steps: For multi_step -- ordered list of step definitions.
        headline: Optional static headline (overrides LLM generation).
        chips: Optional static chips for the response.
    """
    pattern: str
    capsule_type: Optional[str] = None
    tool: Optional[str] = None
    card: Optional[str] = None
    steps: Optional[list[dict]] = None
    headline: Optional[str] = None
    chips: Optional[list[dict]] = field(default=None, hash=False)


# ---- Build Session Steps (shared by build_session + plan_training) ---------
#
# Flow order (Apr 15 2026 rearchitecture -- slot-first):
#   1. pick_date     -- auto-skips when target_date extracted from opener
#   2. readiness_gate -- deterministic safety check (RED / ACWR>1.5)
#   3. check_calendar -- fetch target_date's events (silent tool step)
#   4. fork          -- attach drills to existing matching session vs new
#   5. pick_focus    -- auto-skips when focus extracted from opener
#   6. pick_time     -- SLOT FIRST. Auto-skips when the opener stated a
#                       time AND it's clean. If the time conflicts, the
#                       athlete sees "5pm is taken by Endurance Session
#                       -- here are clean slots" BEFORE any drills are
#                       generated. Standardized via
#                       `app.flow.helpers.scheduling.resolve_slot` so
#                       every timeline/scheduling flow reuses the same
#                       conflict-check logic (no per-flow reinvention).
#   7. build_drills  -- session_plan card (RAG-grounded). Only runs once
#                       the slot is locked, so every drill goes to a
#                       confirmed, conflict-free home.
#   8. confirm       -- confirm_card; on accept we execute confirm_tool:
#                       - existing event -> update_event.session_plan merge
#                       - new session    -> create_event + auto-link programs
_BUILD_SESSION_STEPS = [
    {"id": "pick_date", "card": "choice_card"},
    {"id": "readiness_gate", "card": "safety_gate", "check": "readiness_and_load"},
    {"id": "check_calendar", "tool": "get_today_events", "tool_args_from": {"date": "target_date"}},
    {"id": "fork", "card": "choice_card", "condition": "existing_training_sessions"},
    {"id": "pick_focus", "card": "choice_card"},
    {"id": "pick_time", "card": "time_picker"},
    {"id": "build_drills", "card": "session_plan", "tool": "get_training_session", "tool_args_from": {"category": "selected_focus"}},
    {"id": "confirm", "card": "confirm_card", "confirm_tool": "create_event"},
]


# ---- Build Week Plan Steps -------------------------------------------------
#
# 5-step week planner that orchestrates training + study together.
#
#   1. pick_week            — choose which week (This / Next)
#   2. load_suggestions     — silent bridge call: /api/v1/week-plan/suggest
#                             Seeds the pickers with catalog defaults or
#                             compliance-adapted deltas from the prior week.
#   3. pick_training_mix    — capsule: sessions/week + duration + fixed/flex
#                             per category. Defaults come from step 2.
#   4. pick_study_plan      — capsule: per-subject sessions/week + duration.
#   5. build_draft          — silent bridge call: /api/v1/week-plan/draft
#                             Runs weekPlanBuilder against live state.
#   6. review_week_plan     — capsule showing the placed plan with tappable
#                             per-session Edit affordance. Confirm button
#                             fires the confirm_tool.
#   7. confirm_week_plan    — confirm_tool=commit_week_plan → bridge to
#                             /api/v1/week-plan/commit (batch insert +
#                             snapshot + event).
_BUILD_WEEK_PLAN_STEPS = [
    {"id": "pick_week", "card": "choice_card"},
    {"id": "load_suggestions", "tool": "get_week_plan_suggestions"},
    {"id": "pick_training_mix", "card": "training_mix_capsule"},
    {"id": "pick_study_plan", "card": "study_plan_capsule"},
    {"id": "build_draft", "tool": "build_week_plan_draft"},
    # The preview capsule IS the confirm UI — it shows the full plan + total
    # + warnings + "Lock in the week" CTA. Tapping that button runs the
    # commit tool directly (see week_plan_preview_capsule handler below).
    # No separate confirm_card step — that was a redundant "are you sure?".
    {"id": "review_week_plan", "card": "week_plan_preview_capsule"},
]


# ---- Flow Registry ---------------------------------------------------------
# Single source of truth: intent_id -> FlowConfig
# Intents NOT listed here fall through to the existing agent pipeline.

FLOW_REGISTRY: dict[str, FlowConfig] = {

    # ═══════════════════════════════════════════════════════════════════
    # CAPSULE_DIRECT ($0, instant, mobile renders natively)
    # ═══════════════════════════════════════════════════════════════════

    # -- Core actions --
    "check_in": FlowConfig(
        pattern="capsule_direct",
        capsule_type="checkin_capsule",
        headline="Time to check in",
        chips=[{"label": "Quick check-in", "message": "Log my daily check-in"}],
    ),
    "navigate": FlowConfig(
        pattern="capsule_direct",
        capsule_type="navigation_capsule",
    ),
    "log_test": FlowConfig(
        pattern="capsule_direct",
        capsule_type="test_log_capsule",
        headline="Log a test",
        chips=[
            {"label": "Sprint", "message": "Log a sprint test"},
            {"label": "CMJ", "message": "Log a CMJ test"},
        ],
    ),
    "drill_rating": FlowConfig(
        pattern="capsule_direct",
        capsule_type="drill_rating_capsule",
        headline="Rate this drill",
    ),

    # -- Programs --
    "show_programs": FlowConfig(
        pattern="capsule_direct",
        capsule_type="program_action_capsule",
        headline="Your programs",
    ),
    "manage_programs": FlowConfig(
        pattern="capsule_direct",
        capsule_type="program_interact_capsule",
        headline="Program details",
    ),

    # -- CV / Profile --
    "edit_cv": FlowConfig(
        pattern="capsule_direct",
        capsule_type="cv_edit_capsule",
        headline="Update your CV",
    ),
    "edit_club": FlowConfig(
        pattern="capsule_direct",
        capsule_type="club_edit_capsule",
        headline="Update your club",
    ),

    # -- Schedule management --
    "schedule_rules": FlowConfig(
        pattern="capsule_direct",
        capsule_type="schedule_rules_capsule",
        headline="Schedule settings",
    ),
    "check_conflicts": FlowConfig(
        pattern="data_display",
        tool="detect_load_collision",
        capsule_type="conflict_resolution_capsule",
        headline="Schedule check",
    ),
    "ghost_suggestions": FlowConfig(
        pattern="capsule_direct",
        capsule_type="ghost_suggestion_capsule",
        headline="AI schedule suggestions",
    ),
    "bulk_edit_events": FlowConfig(
        pattern="capsule_direct",
        capsule_type="bulk_timeline_edit_capsule",
        headline="Bulk edit",
    ),
    "day_lock": FlowConfig(
        pattern="capsule_direct",
        capsule_type="day_lock_capsule",
    ),

    # -- Study / Exams --
    "plan_study": FlowConfig(
        pattern="study_scheduling_capsule",
        capsule_type="study_scheduling_capsule",
        headline="Plan your study",
    ),
    "plan_regular_study": FlowConfig(
        pattern="study_scheduling_capsule",
        capsule_type="study_scheduling_capsule",
        headline="Set up study routine",
    ),
    "add_exam": FlowConfig(
        pattern="capsule_direct",
        capsule_type="exam_capsule",
        headline="Add an exam",
    ),
    "manage_subjects": FlowConfig(
        pattern="capsule_direct",
        capsule_type="subject_capsule",
        headline="Your subjects",
    ),

    # -- Training categories --
    "training_categories": FlowConfig(
        pattern="capsule_direct",
        capsule_type="training_category_capsule",
        headline="Training categories",
    ),

    # -- PHV / Growth --
    "phv_calculate": FlowConfig(
        pattern="capsule_direct",
        capsule_type="phv_calculator_capsule",
        headline="Growth stage check",
    ),

    # -- Testing / Benchmarks --
    "strengths_gaps": FlowConfig(
        pattern="capsule_direct",
        capsule_type="strengths_gaps_capsule",
        headline="Strengths and gaps",
    ),

    # -- Gamification --
    "leaderboard": FlowConfig(
        pattern="capsule_direct",
        capsule_type="leaderboard_capsule",
        headline="Leaderboard",
    ),

    # -- Wearable / Integrations --
    "whoop_sync": FlowConfig(
        pattern="capsule_direct",
        capsule_type="whoop_sync_capsule",
        headline="Syncing Whoop",
    ),

    # -- Sport-specific --
    "padel_shots": FlowConfig(
        pattern="capsule_direct",
        capsule_type="padel_shot_capsule",
        headline="Padel shot data",
    ),
    "blazepods": FlowConfig(
        pattern="capsule_direct",
        capsule_type="blazepods_capsule",
        headline="Reaction test",
    ),

    # -- Notifications --
    "notification_settings": FlowConfig(
        pattern="capsule_direct",
        capsule_type="notification_settings_capsule",
        headline="Notification settings",
    ),

    # -- Journals --
    "journal_pre": FlowConfig(
        pattern="capsule_direct",
        capsule_type="training_journal_pre_capsule",
        headline="Pre-training journal",
    ),
    "journal_post": FlowConfig(
        pattern="capsule_direct",
        capsule_type="training_journal_post_capsule",
        headline="Post-training journal",
    ),

    # ═══════════════════════════════════════════════════════════════════
    # DATA_DISPLAY ($0 deterministic, tool call + card builder)
    # ═══════════════════════════════════════════════════════════════════

    "qa_readiness": FlowConfig(
        pattern="data_display",
        tool="get_readiness_detail",
        card="stat_grid",
    ),
    "qa_today_schedule": FlowConfig(
        pattern="data_display",
        tool="get_today_events",
        card="schedule_list",
    ),
    "qa_week_schedule": FlowConfig(
        pattern="data_display",
        tool="get_week_schedule",
        card="week_schedule",
    ),
    "qa_streak": FlowConfig(
        pattern="data_display",
        tool="get_consistency_score",
        card="stat_grid",
    ),
    "qa_load": FlowConfig(
        pattern="data_display",
        tool="get_dual_load_score",
        card="stat_grid",
    ),
    "qa_test_history": FlowConfig(
        pattern="data_display",
        tool="get_test_results",
        card="stat_grid",
    ),

    # ═══════════════════════════════════════════════════════════════════
    # SCHEDULING_CAPSULE (interactive card, $0, ~200ms pre-fetch)
    # ═══════════════════════════════════════════════════════════════════
    #
    # Single interactive card replaces the 8-step multi_step flow.
    # Pre-fetches 5 days of calendar data and renders a self-contained
    # scheduling form on mobile. When SCHEDULING_CAPSULE_ENABLED=false
    # (default), the controller falls through to multi_step as before.
    #
    # build_session + plan_training both route here. The controller
    # checks the feature flag at runtime and falls back to multi_step
    # when disabled, so multi_step._BUILD_SESSION_STEPS stays intact
    # as the fallback path.
    "build_session": FlowConfig(pattern="scheduling_capsule", steps=_BUILD_SESSION_STEPS),
    "plan_training": FlowConfig(pattern="scheduling_capsule", steps=_BUILD_SESSION_STEPS),
    "build_week_plan": FlowConfig(pattern="multi_step", steps=_BUILD_WEEK_PLAN_STEPS),

    # ═══════════════════════════════════════════════════════════════════
    # WRITE_ACTION + OPEN_COACHING (fall through to existing agent pipeline)
    # These are registered so the flow controller knows about them,
    # but they return empty dict (pass-through).
    # ═══════════════════════════════════════════════════════════════════

    # Write actions -- explicit agent_dispatch needed for parameter extraction
    "create_event": FlowConfig(pattern="write_action"),
    "update_event": FlowConfig(pattern="write_action"),
    "delete_event": FlowConfig(pattern="write_action"),
    "set_goal": FlowConfig(pattern="write_action"),
    "update_goal": FlowConfig(pattern="write_action"),
    "log_injury": FlowConfig(pattern="write_action"),
    "log_nutrition": FlowConfig(pattern="write_action"),
    "log_sleep": FlowConfig(pattern="write_action"),
    "update_profile": FlowConfig(pattern="write_action"),
    "exam_setup": FlowConfig(pattern="write_action"),
    "full_reset": FlowConfig(pattern="write_action"),
    "trigger_deload": FlowConfig(pattern="write_action"),
    "log_recovery": FlowConfig(pattern="write_action"),
    "flag_injury": FlowConfig(pattern="write_action"),
    "academic_stress": FlowConfig(pattern="write_action"),
    "academic_priority": FlowConfig(pattern="write_action"),
    "recruitment_visibility": FlowConfig(pattern="write_action"),
    "verified_achievement": FlowConfig(pattern="write_action"),
    "create_block": FlowConfig(pattern="write_action"),
    "update_phase": FlowConfig(pattern="write_action"),
    "load_override": FlowConfig(pattern="write_action"),
    "schedule_test_session": FlowConfig(pattern="write_action"),

    # Open coaching -- full LLM creative response needed
    "greeting": FlowConfig(pattern="open_coaching"),
    "smalltalk": FlowConfig(pattern="open_coaching"),
    "phv_query": FlowConfig(pattern="open_coaching"),
    "benchmark_comparison": FlowConfig(pattern="open_coaching"),
    "recommendations": FlowConfig(pattern="open_coaching"),
    "today_briefing": FlowConfig(pattern="open_coaching"),
    "injury_mode": FlowConfig(pattern="open_coaching"),
    "load_reduce": FlowConfig(pattern="open_coaching"),
    "load_advice_request": FlowConfig(pattern="open_coaching"),
    "exam_schedule": FlowConfig(pattern="open_coaching"),
    "recovery_status": FlowConfig(pattern="open_coaching"),
    "deload_recommendation": FlowConfig(pattern="open_coaching"),
    "timeline_capabilities": FlowConfig(pattern="open_coaching"),
    "injury_status": FlowConfig(pattern="open_coaching"),
    "view_goals": FlowConfig(pattern="open_coaching"),
    "view_nutrition": FlowConfig(pattern="open_coaching"),
    "view_profile": FlowConfig(pattern="open_coaching"),
    "app_settings": FlowConfig(pattern="open_coaching"),
    "notification_config": FlowConfig(pattern="open_coaching"),
    "view_notifications": FlowConfig(pattern="open_coaching"),
    "clear_notifications": FlowConfig(pattern="open_coaching"),
    "wearable_status": FlowConfig(pattern="open_coaching"),
    "connect_wearable": FlowConfig(pattern="open_coaching"),
    "view_sleep_data": FlowConfig(pattern="open_coaching"),
    "view_journal_history": FlowConfig(pattern="open_coaching"),
    "browse_drills": FlowConfig(pattern="open_coaching"),
    "view_test_history": FlowConfig(pattern="open_coaching"),
    "submit_feedback": FlowConfig(pattern="open_coaching"),
    "refresh_recommendations": FlowConfig(pattern="open_coaching"),
    "combine_readiness": FlowConfig(pattern="open_coaching"),
    "test_report": FlowConfig(pattern="open_coaching"),
    "test_trajectory": FlowConfig(pattern="open_coaching"),
    "tissue_loading": FlowConfig(pattern="open_coaching"),
    "dual_load_dashboard": FlowConfig(pattern="open_coaching"),
    "cognitive_windows": FlowConfig(pattern="open_coaching"),
    "exam_collision": FlowConfig(pattern="open_coaching"),
    "five_layer_identity": FlowConfig(pattern="open_coaching"),
    "coachability_index": FlowConfig(pattern="open_coaching"),
    "development_velocity": FlowConfig(pattern="open_coaching"),
    "cv_export": FlowConfig(pattern="open_coaching"),
    "phv_programs": FlowConfig(pattern="open_coaching"),
    "periodization": FlowConfig(pattern="open_coaching"),
    "position_programs": FlowConfig(pattern="open_coaching"),
    "block_history": FlowConfig(pattern="open_coaching"),
}


def get_flow_config(intent_id: str) -> Optional[FlowConfig]:
    """Look up the flow config for an intent. Returns None if not registered."""
    return FLOW_REGISTRY.get(intent_id)
