"""
Tomo AI Service — Intent Registry
Single source of truth for all 43+ intent definitions.
Python equivalent of TypeScript intentRegistry.ts.

Each intent has:
  - id: unique identifier
  - capsule_type: capsule card type (or None for AI-handled)
  - agent_type: which agent handles it
  - description: for Haiku classifier prompt
  - examples: sample user messages
  - tool_name: for quick-action capsules
  - tool_input: default tool params
  - context_boosts: conditions that increase classification confidence
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class IntentDefinition:
    """Single intent definition."""
    id: str
    capsule_type: Optional[str]
    agent_type: str  # timeline | output | mastery | settings | planning | testing_benchmark | recovery | dual_load | cv_identity | training_program
    description: str
    examples: list[str] = field(default_factory=list)
    required_params: list[str] = field(default_factory=list)
    context_boosts: list[str] = field(default_factory=list)
    tool_name: Optional[str] = None
    tool_input: Optional[dict] = None


# ── Full Intent Registry ─────────────────────────────────────────────

INTENT_REGISTRY: list[IntentDefinition] = [
    # ── Greeting (warm coaching response, no tools needed) ──
    IntentDefinition(
        id="greeting",
        capsule_type=None,
        agent_type="output",
        description="Greeting or casual hello — respond warmly as a coach, no data needed",
        examples=["hey tomo", "hi", "hello", "good morning", "what's up"],
    ),

    # ── Smalltalk (social reciprocity + mood statements, no tools needed) ──
    IntentDefinition(
        id="smalltalk",
        capsule_type=None,
        agent_type="output",
        description=(
            "Social / emotional statement WITHOUT an action verb -- mood reports, "
            "reciprocal bids ('what about you?'), 'feeling tired', 'bored'. "
            "Respond warmly with open-ended invitation, NEVER a menu. "
            "NOT check_in (check_in is only explicit wellness logging)."
        ),
        examples=[
            "feeling great buddy, what about you?",
            "im good", "not bad", "tired today",
            "bored", "meh", "pretty good",
            "how are you", "and you?", "what about you",
        ],
    ),

    # ── Test & Check-in ──
    IntentDefinition(
        id="log_test",
        capsule_type="test_log_capsule",
        agent_type="testing_benchmark",
        description="Log a physical test result (sprint, jump, agility, etc.)",
        examples=["log a test", "record my sprint", "add my CMJ score"],
        required_params=["testType"],
    ),
    IntentDefinition(
        id="check_in",
        capsule_type="checkin_capsule",
        agent_type="output",
        description="Daily wellness/readiness check-in",
        examples=["check in", "log my mood", "how am I feeling today"],
    ),

    # ── Navigation ──
    IntentDefinition(
        id="navigate",
        capsule_type="navigation_capsule",
        agent_type="output",
        description="Navigate to a specific app tab/screen",
        examples=["go to timeline", "go to output", "show mastery"],
        required_params=["targetTab"],
    ),

    # ── Programs ──
    IntentDefinition(
        id="show_programs",
        capsule_type="program_action_capsule",
        agent_type="output",
        description="Show or list all available training programs (NOT specific program by name)",
        examples=["my programs", "what programs do you recommend", "show training programs"],
    ),
    IntentDefinition(
        id="manage_programs",
        capsule_type="program_interact_capsule",
        agent_type="output",
        description="Interact with a specific program (assign, unassign, schedule)",
        examples=["start speed program", "unassign program", "schedule my program"],
    ),

    # ── Session Building (multi-step flow) ──
    IntentDefinition(
        id="build_session",
        capsule_type=None,
        agent_type="output",
        description=(
            "Build/schedule a specific training session with drills and a slot. "
            "REQUIRES both an explicit build verb (build, create, make, schedule, "
            "add, design) AND the noun 'session' / 'workout' / concrete slot. "
            "Generic 'plan my training', 'plan my week', 'plan my recovery' DO NOT "
            "belong here — they are open coaching questions answered by the "
            "planning agent, not a single-session capsule."
        ),
        examples=[
            "build me a session", "build a gym session",
            "build me a training session", "schedule a session for Thursday",
            "create a speed session", "add a gym session tomorrow",
            "design a finishing session", "make a recovery session for Friday",
            "gym tomorrow at 5pm", "session this evening at 6",
            "workout tomorrow morning at 7",
        ],
    ),

    # ── Calendar Events ──
    IntentDefinition(
        id="create_event",
        capsule_type="event_edit_capsule",
        agent_type="timeline",
        description="Create a simple calendar event with specific time (NOT session building with drills)",
        examples=["add event", "add gym at 5pm", "schedule training tomorrow at 6"],
    ),
    IntentDefinition(
        id="update_event",
        capsule_type="event_edit_capsule",
        agent_type="timeline",
        description="Modify an existing calendar event",
        examples=["move my training", "change the time", "reschedule"],
        context_boosts=["currentTopic:scheduling"],
    ),
    IntentDefinition(
        id="delete_event",
        capsule_type="event_edit_capsule",
        agent_type="timeline",
        description="Delete an existing calendar event",
        examples=["delete my training", "cancel the session", "remove event"],
    ),

    # ── CV / Profile ──
    IntentDefinition(
        id="edit_cv",
        capsule_type="cv_edit_capsule",
        agent_type="mastery",
        description="Edit athletic CV entries",
        examples=["add to my CV", "update my achievements"],
    ),
    IntentDefinition(
        id="edit_club",
        capsule_type="club_edit_capsule",
        agent_type="mastery",
        description="Edit club/team information",
        examples=["update my club", "change my team"],
    ),

    # ── Schedule Rules ──
    IntentDefinition(
        id="schedule_rules",
        capsule_type="schedule_rules_capsule",
        agent_type="timeline",
        description="Edit scheduling rules and preferences",
        examples=["edit my rules", "change schedule settings"],
    ),

    # ── Training & Study Plans ──
    IntentDefinition(
        id="plan_training",
        capsule_type=None,
        agent_type="planning",
        description=(
            "Open-coaching conversation about training planning (weekly/block "
            "structure, recovery timing, periodization philosophy). Never "
            "rendered as a scheduling capsule — the response is text from the "
            "planning agent. Prefer build_session when the athlete asks for a "
            "single specific session with a slot."
        ),
        examples=[
            "plan my training",
            "plan my training week",
            "plan my training for tomorrow",
            "plan my recovery week",
            "how should I plan my training",
            "what's the best training plan for exam period",
        ],
    ),
    IntentDefinition(
        id="plan_study",
        capsule_type="study_schedule_capsule",
        agent_type="timeline",
        description="Generate a study schedule for exams",
        examples=["plan my study", "study schedule for exams"],
    ),
    IntentDefinition(
        id="plan_regular_study",
        capsule_type="regular_study_capsule",
        agent_type="timeline",
        description="Generate regular weekly study blocks",
        examples=["plan my regular study", "set up study routine"],
    ),

    # ── Exams ──
    IntentDefinition(
        id="add_exam",
        capsule_type="exam_capsule",
        agent_type="timeline",
        description="Add an exam to the calendar",
        examples=["add an exam", "I have a math exam"],
    ),
    IntentDefinition(
        id="exam_schedule",
        capsule_type="event_edit_capsule",
        agent_type="timeline",
        description="View or manage exam schedule",
        examples=["my exam schedule", "when are my exams"],
        context_boosts=["currentTopic:scheduling"],
    ),

    # ── Subjects & Categories ──
    IntentDefinition(
        id="manage_subjects",
        capsule_type="subject_capsule",
        agent_type="timeline",
        description="Manage academic subjects",
        examples=["add a subject", "my subjects"],
    ),
    IntentDefinition(
        id="training_categories",
        capsule_type="training_category_capsule",
        agent_type="timeline",
        description="Manage training categories (gym, club, etc.)",
        examples=["my training categories", "edit categories"],
    ),

    # ── Conflicts ──
    IntentDefinition(
        id="check_conflicts",
        capsule_type="conflict_resolution_capsule",
        agent_type="timeline",
        description="Check for scheduling conflicts",
        examples=["check conflicts", "any clashes this week"],
    ),

    # ── PHV / Growth ──
    IntentDefinition(
        id="phv_query",
        capsule_type=None,
        agent_type="output",
        description="Questions about growth/maturity stage",
        examples=["what is my PHV", "am I still growing"],
        context_boosts=["lastActionContext:phv_calculate"],
    ),
    IntentDefinition(
        id="phv_calculate",
        capsule_type="phv_calculator_capsule",
        agent_type="output",
        description="Calculate PHV/maturity stage",
        examples=["calculate my PHV", "check my growth stage"],
    ),

    # ── Strengths & Benchmarks (routed to testing_benchmark agent) ──
    IntentDefinition(
        id="strengths_gaps",
        capsule_type="strengths_gaps_capsule",
        agent_type="testing_benchmark",
        description="Analyze strengths and performance gaps",
        examples=["what are my strengths", "my weaknesses", "gap analysis"],
    ),
    IntentDefinition(
        id="benchmark_comparison",
        capsule_type=None,
        agent_type="testing_benchmark",
        description="Compare performance to age-group benchmarks",
        examples=["how do I compare", "my percentile", "benchmark comparison"],
    ),

    # ── Leaderboard ──
    IntentDefinition(
        id="leaderboard",
        capsule_type="leaderboard_capsule",
        agent_type="mastery",
        description="View gamification leaderboard (NOT performance comparison)",
        examples=["show leaderboard", "my ranking"],
        required_params=["boardType"],
    ),

    # ── Ghost Suggestions ──
    IntentDefinition(
        id="ghost_suggestions",
        capsule_type="ghost_suggestion_capsule",
        agent_type="timeline",
        description="Get AI-suggested schedule additions",
        examples=["suggest sessions", "fill my schedule"],
    ),

    # ── Bulk Edit ──
    IntentDefinition(
        id="bulk_edit_events",
        capsule_type="bulk_timeline_edit_capsule",
        agent_type="timeline",
        description="Bulk edit/delete multiple calendar events",
        examples=["clear my week", "delete all training this week"],
    ),

    # ── Day Lock ──
    IntentDefinition(
        id="day_lock",
        capsule_type="day_lock_capsule",
        agent_type="timeline",
        description="Lock/unlock a day in the schedule",
        examples=["lock tomorrow", "unlock Monday"],
        required_params=["date"],
    ),

    # ── Wearable ──
    IntentDefinition(
        id="whoop_sync",
        capsule_type="whoop_sync_capsule",
        agent_type="output",
        description="Sync Whoop wearable data",
        examples=["sync my whoop", "pull wearable data"],
    ),

    # ── Sport-Specific ──
    IntentDefinition(
        id="padel_shots",
        capsule_type="padel_shot_capsule",
        agent_type="output",
        description="Log padel-specific shot data",
        examples=["log padel shots", "my padel stats"],
    ),
    IntentDefinition(
        id="blazepods",
        capsule_type="blazepods_capsule",
        agent_type="output",
        description="Log BlazePods reaction training data",
        examples=["log blazepods", "reaction test"],
    ),

    # ── Notifications ──
    IntentDefinition(
        id="notification_settings",
        capsule_type="notification_settings_capsule",
        agent_type="output",
        description="Manage notification preferences",
        examples=["notification settings", "turn off notifications"],
    ),

    # ── Recommendations ──
    IntentDefinition(
        id="recommendations",
        capsule_type=None,
        agent_type="output",
        description="View active recommendations",
        examples=["my recommendations", "what should I do"],
    ),

    # ── Timeline Capabilities ──
    IntentDefinition(
        id="timeline_capabilities",
        capsule_type=None,
        agent_type="timeline",
        description="Ask what timeline/schedule features are available",
        examples=["what can you do with my schedule"],
    ),

    # ── Drill Rating ──
    IntentDefinition(
        id="drill_rating",
        capsule_type="drill_rating_capsule",
        agent_type="output",
        description="Rate a drill/exercise",
        examples=["rate this drill", "how was the exercise"],
        context_boosts=["currentTopic:drill"],
    ),

    # ── Quick Actions (tool-based, $0 cost) ──
    IntentDefinition(
        id="qa_readiness",
        capsule_type="quick_action",
        agent_type="output",
        description="Check readiness/wellness score (NOT recovery recs)",
        examples=["what's my readiness", "how am I feeling", "my wellness"],
        tool_name="get_readiness_detail",
    ),
    IntentDefinition(
        id="qa_streak",
        capsule_type="quick_action",
        agent_type="mastery",
        description="Check consistency streak",
        examples=["my streak", "how many days in a row"],
        tool_name="get_consistency_score",
    ),
    IntentDefinition(
        id="qa_load",
        capsule_type="quick_action",
        agent_type="output",
        description="Check training load / ACWR / dual load",
        examples=["my load", "what's my ACWR", "training load"],
        tool_name="get_dual_load_score",
    ),
    IntentDefinition(
        id="qa_today_schedule",
        capsule_type="quick_action",
        agent_type="timeline",
        description="Check today's schedule",
        examples=["today's schedule", "what's on today", "my events today"],
        tool_name="get_today_events",
    ),
    IntentDefinition(
        id="qa_week_schedule",
        capsule_type="quick_action",
        agent_type="timeline",
        description="Check this week's schedule",
        examples=["this week's schedule", "my week", "what's this week"],
        tool_name="get_week_schedule",
    ),
    IntentDefinition(
        id="qa_test_history",
        capsule_type="quick_action",
        agent_type="testing_benchmark",
        description="View test history / recent scores",
        examples=["my tests", "test history", "recent scores"],
        tool_name="get_test_results",
    ),

    # ── Journal ──
    IntentDefinition(
        id="journal_pre",
        capsule_type="training_journal_pre_capsule",
        agent_type="output",
        description="Pre-training journal/reflection",
        examples=["journal", "pre-training reflection"],
        tool_name="get_today_training_for_journal",
    ),
    IntentDefinition(
        id="journal_post",
        capsule_type="training_journal_post_capsule",
        agent_type="output",
        description="Post-training journal/reflection",
        examples=["post-training journal", "reflect on training"],
        tool_name="get_pending_post_journal",
    ),

    # ── Cross-Feature Commands ──
    IntentDefinition(
        id="injury_mode",
        capsule_type=None,
        agent_type="settings",
        description="Activate injury mode (modified training)",
        examples=["I'm injured", "injury mode"],
    ),
    IntentDefinition(
        id="load_reduce",
        capsule_type=None,
        agent_type="output",
        description="Request to reduce training load",
        examples=["reduce my load", "lower intensity"],
    ),
    IntentDefinition(
        id="load_advice_request",
        capsule_type=None,
        agent_type="output",
        description="Athlete asking for advice on training load, ACWR analysis, overtraining concerns, or deload recommendations",
        examples=[
            "advice on my load",
            "how is my load looking",
            "am I overtraining",
            "should I reduce my load",
            "is my load too high",
            "load management advice",
            "deload advice",
            "what should I do about my load",
        ],
    ),
    IntentDefinition(
        id="exam_setup",
        capsule_type=None,
        agent_type="timeline",
        description="Set up exam period mode",
        examples=["exam mode", "I have exams coming up"],
    ),
    IntentDefinition(
        id="full_reset",
        capsule_type=None,
        agent_type="timeline",
        description="Reset/clear entire schedule",
        examples=["full reset", "clear everything"],
    ),
    IntentDefinition(
        id="today_briefing",
        capsule_type=None,
        agent_type="output",
        description="Get daily briefing/overview",
        examples=["daily briefing", "morning brief", "what's my day"],
    ),

    # ── Settings & Profile ──
    IntentDefinition(id="set_goal", capsule_type=None, agent_type="settings",
                     description="Set a personal performance goal",
                     examples=["set a goal", "I want to improve my sprint"]),
    IntentDefinition(id="view_goals", capsule_type=None, agent_type="settings",
                     description="View current goals",
                     examples=["my goals", "show goals"]),
    IntentDefinition(id="update_goal", capsule_type=None, agent_type="settings",
                     description="Update goal progress",
                     examples=["update my goal", "I achieved my goal"]),
    IntentDefinition(id="log_injury", capsule_type=None, agent_type="settings",
                     description="Log an injury",
                     examples=["log injury", "I hurt my ankle"]),
    IntentDefinition(id="injury_status", capsule_type=None, agent_type="settings",
                     description="Check injury status",
                     examples=["injury status", "how's my injury"]),
    IntentDefinition(id="log_nutrition", capsule_type=None, agent_type="settings",
                     description="Log a meal/nutrition",
                     examples=["log food", "log a meal"]),
    IntentDefinition(id="view_nutrition", capsule_type=None, agent_type="settings",
                     description="View nutrition log",
                     examples=["my nutrition", "what did I eat"]),
    IntentDefinition(id="log_sleep", capsule_type=None, agent_type="settings",
                     description="Log sleep manually",
                     examples=["log sleep", "I slept 7 hours"]),
    IntentDefinition(id="update_profile", capsule_type=None, agent_type="settings",
                     description="Update profile information",
                     examples=["update my height", "change my weight"]),
    IntentDefinition(id="view_profile", capsule_type=None, agent_type="settings",
                     description="View profile",
                     examples=["my profile", "show my info"]),
    IntentDefinition(id="app_settings", capsule_type=None, agent_type="settings",
                     description="App settings (units, preferences)",
                     examples=["app settings", "change to imperial"]),
    IntentDefinition(id="notification_config", capsule_type=None, agent_type="settings",
                     description="Configure notifications",
                     examples=["notification settings", "turn off push"]),
    IntentDefinition(id="view_notifications", capsule_type=None, agent_type="settings",
                     description="View notifications",
                     examples=["show my notifications", "any alerts"]),
    IntentDefinition(id="clear_notifications", capsule_type=None, agent_type="settings",
                     description="Mark notifications as read",
                     examples=["mark all as read", "clear notifications"]),
    IntentDefinition(id="wearable_status", capsule_type=None, agent_type="settings",
                     description="Check wearable connection status",
                     examples=["is my whoop connected", "wearable status"]),
    IntentDefinition(id="connect_wearable", capsule_type=None, agent_type="settings",
                     description="Connect a wearable device",
                     examples=["connect whoop", "pair wearable"]),
    IntentDefinition(id="view_sleep_data", capsule_type=None, agent_type="settings",
                     description="View sleep data from wearable",
                     examples=["my sleep data", "sleep stats"]),
    IntentDefinition(id="view_journal_history", capsule_type=None, agent_type="settings",
                     description="View past journal entries",
                     examples=["journal history", "past reflections"]),
    IntentDefinition(id="browse_drills", capsule_type=None, agent_type="settings",
                     description="Browse drill library",
                     examples=["browse drills", "drill library"]),
    IntentDefinition(id="view_test_history", capsule_type=None, agent_type="settings",
                     description="View detailed test history",
                     examples=["test history", "all my tests"]),
    IntentDefinition(id="submit_feedback", capsule_type=None, agent_type="settings",
                     description="Submit app feedback",
                     examples=["submit feedback", "report a bug"]),
    IntentDefinition(id="refresh_recommendations", capsule_type=None, agent_type="settings",
                     description="Refresh AI recommendations",
                     examples=["refresh recommendations", "update my recs"]),

    # ── Testing & Benchmark Agent (Sprint 1) ──
    IntentDefinition(
        id="combine_readiness",
        capsule_type=None,
        agent_type="testing_benchmark",
        description="Get combine readiness composite score across all tested metrics",
        examples=["combine readiness", "how ready am I for combine", "overall test profile"],
    ),
    IntentDefinition(
        id="test_report",
        capsule_type=None,
        agent_type="testing_benchmark",
        description="Generate a scout-ready test report or test summary",
        examples=["generate test report", "scout report", "test summary"],
    ),
    IntentDefinition(
        id="test_trajectory",
        capsule_type=None,
        agent_type="testing_benchmark",
        description="View test score trajectory and improvement trend over time",
        examples=["my sprint progress", "how has my CMJ improved", "test trajectory"],
    ),
    IntentDefinition(
        id="schedule_test_session",
        capsule_type=None,
        agent_type="testing_benchmark",
        description="Schedule a test battery session on the calendar",
        examples=["schedule a test session", "plan a test battery", "book testing day"],
    ),

    # ── Recovery Agent (Sprint 1) ──
    IntentDefinition(
        id="recovery_status",
        capsule_type=None,
        agent_type="recovery",
        description="Check current recovery status and whether athlete should train",
        examples=["how's my recovery", "should I train today", "am I recovered"],
    ),
    IntentDefinition(
        id="deload_recommendation",
        capsule_type=None,
        agent_type="recovery",
        description="Get deload week recommendation based on load and readiness trends",
        examples=["do I need a deload", "should I take a break", "am I overtraining"],
    ),
    IntentDefinition(
        id="trigger_deload",
        capsule_type=None,
        agent_type="recovery",
        description="Start a deload week — reduce training load on calendar",
        examples=["start a deload week", "trigger deload", "give me a recovery week"],
    ),
    IntentDefinition(
        id="log_recovery",
        capsule_type=None,
        agent_type="recovery",
        description="Log a recovery session (foam rolling, stretching, ice bath, etc.)",
        examples=["log foam rolling", "did stretching today", "log ice bath session"],
    ),
    IntentDefinition(
        id="tissue_loading",
        capsule_type=None,
        agent_type="recovery",
        description="View tissue loading history — daily volume and overuse patterns",
        examples=["tissue loading history", "how much have I been training", "training volume"],
    ),
    IntentDefinition(
        id="flag_injury",
        capsule_type=None,
        agent_type="recovery",
        description="Flag an injury concern — log body part, severity, and optionally notify coach",
        examples=["my knee hurts", "flag an injury", "I have pain in my hamstring"],
        context_boosts=["pain_flag", "severity >= 2"],
    ),

    # ── Dual-Load Agent (Sprint 2) ──
    IntentDefinition(
        id="dual_load_dashboard",
        capsule_type=None,
        agent_type="dual_load",
        description="View dual-load dashboard — athletic vs academic balance, stress index",
        examples=["dual load", "my balance", "academic vs training load"],
    ),
    IntentDefinition(
        id="cognitive_windows",
        capsule_type=None,
        agent_type="dual_load",
        description="Get optimal study windows based on today's training schedule",
        examples=["when should I study", "cognitive readiness", "best time to study today"],
    ),
    IntentDefinition(
        id="exam_collision",
        capsule_type=None,
        agent_type="dual_load",
        description="Forecast exam-training collisions and recommend adjustments",
        examples=["exam collision check", "do I have training on exam day", "exam conflict"],
    ),
    IntentDefinition(
        id="academic_priority",
        capsule_type=None,
        agent_type="dual_load",
        description="Activate exam/academic priority mode — cap training intensity",
        examples=["activate exam mode", "academic priority", "study mode on"],
    ),
    IntentDefinition(
        id="build_week_plan",
        capsule_type="week_plan_preview_capsule",
        agent_type="timeline",
        description="Walk through a 5-step week planner that schedules training and study sessions together — collects training mix per category, study subjects, then previews + lets the athlete edit before confirming.",
        examples=[
            "plan my week",
            "build my week",
            "set up my week",
            "week planner",
            "build me a complete week plan",
            "plan my week with exams",
            "balanced weekly plan",
            "integrated training and study plan",
            "plan next week",
            "build next week's plan",
        ],
    ),
    IntentDefinition(
        id="academic_stress",
        capsule_type=None,
        agent_type="dual_load",
        description="Log current academic stress level (1-10)",
        examples=["academic stress is high", "school stress 8", "stressed about exams"],
    ),

    # ── CV & Identity Agent (Sprint 3) ──
    IntentDefinition(
        id="five_layer_identity",
        capsule_type=None,
        agent_type="cv_identity",
        description="View 5-layer performance identity (Physical, Technical, Tactical, Mental, Social)",
        examples=["my identity", "5 layer profile", "performance identity"],
    ),
    IntentDefinition(
        id="coachability_index",
        capsule_type=None,
        agent_type="cv_identity",
        description="View coachability index — composite from responsiveness, PBs, consistency, adherence",
        examples=["my coachability", "coachability score", "how coachable am I"],
    ),
    IntentDefinition(
        id="development_velocity",
        capsule_type=None,
        agent_type="cv_identity",
        description="View development velocity — rate of improvement across tested metrics",
        examples=["development velocity", "how fast am I improving", "improvement rate"],
    ),
    IntentDefinition(
        id="recruitment_visibility",
        capsule_type=None,
        agent_type="cv_identity",
        description="Toggle recruitment visibility for talent database",
        examples=["make my profile visible", "recruitment visibility", "scouts can see me"],
    ),
    IntentDefinition(
        id="cv_export",
        capsule_type=None,
        agent_type="cv_identity",
        description="Generate a CV export or scout-ready profile document",
        examples=["export my CV", "generate scout report", "download my profile"],
    ),
    IntentDefinition(
        id="verified_achievement",
        capsule_type=None,
        agent_type="cv_identity",
        description="Add a verified achievement to profile (performance, academic, leadership)",
        examples=["add achievement", "I won the tournament", "add my award"],
    ),

    # ── Training Program Agent (Sprint 4) ──
    IntentDefinition(
        id="phv_programs",
        capsule_type=None,
        agent_type="training_program",
        description="Get PHV-safe training programs filtered for growth phase safety",
        examples=["safe programs for my age", "PHV appropriate training", "growth safe programs"],
    ),
    IntentDefinition(
        id="periodization",
        capsule_type=None,
        agent_type="training_program",
        description="View current periodization context — active block, phase, week",
        examples=["what phase am I in", "periodization", "current training block"],
    ),
    IntentDefinition(
        id="position_programs",
        capsule_type=None,
        agent_type="training_program",
        description="Get position-specific program recommendations",
        examples=["programs for a striker", "midfielder training", "position specific programs"],
    ),
    IntentDefinition(
        id="block_history",
        capsule_type=None,
        agent_type="training_program",
        description="View training block history — past and current blocks with phases",
        examples=["training block history", "past blocks", "my periodization history"],
    ),
    IntentDefinition(
        id="create_block",
        capsule_type=None,
        agent_type="training_program",
        description="Create a new periodized training block",
        examples=["create a training block", "start a 4 week block", "build a periodization plan"],
    ),
    IntentDefinition(
        id="update_phase",
        capsule_type=None,
        agent_type="training_program",
        description="Transition a training block to a new phase",
        examples=["move to competition phase", "transition block phase", "change to specific prep"],
    ),
    IntentDefinition(
        id="load_override",
        capsule_type=None,
        agent_type="training_program",
        description="Override load/intensity for a specific training session",
        examples=["override today's load", "reduce session intensity", "adjust today's training"],
    ),
]


# ── Lookup helpers ────────────────────────────────────────────────────

INTENT_BY_ID: dict[str, IntentDefinition] = {i.id: i for i in INTENT_REGISTRY}


def build_classifier_intent_list() -> str:
    """
    Build the intent list text for the Haiku classifier prompt.
    Returns all intents (except agent_fallthrough) formatted for classification.
    """
    lines = []
    for intent in INTENT_REGISTRY:
        examples_str = "; ".join(intent.examples[:3]) if intent.examples else ""
        lines.append(f"- {intent.id}: {intent.description} (e.g., {examples_str})")
    lines.append("- agent_fallthrough: Complex query requiring full AI conversation")
    return "\n".join(lines)


# ── Capsule Action Definitions ────────────────────────────────────────

CAPSULE_DIRECT_ACTIONS: set[str] = {
    "log_test_result", "log_check_in", "rate_drill", "interact_program",
    "confirm_ghost_suggestion", "dismiss_ghost_suggestion", "lock_day", "unlock_day",
    "sync_whoop", "generate_regular_study_plan",
    "add_career_entry", "update_career_entry", "update_profile_batch",
    "update_goal_progress", "complete_goal", "update_injury_status", "log_nutrition",
    "log_sleep_manual", "update_notification_pref", "mark_notifications_read",
    "update_app_setting", "submit_feedback", "refresh_recommendations",
}

CAPSULE_GATED_ACTIONS: set[str] = {
    "delete_test_result", "edit_test_result", "schedule_program", "create_event",
    "update_event", "delete_event", "bulk_delete_events", "update_schedule_rules",
    "generate_training_plan", "add_exam", "generate_study_plan",
}

WRITE_ACTIONS: set[str] = {
    "create_event", "update_event", "delete_event", "log_check_in", "log_test_result",
    "update_schedule_rules", "generate_training_plan", "add_exam", "generate_study_plan",
    "generate_regular_study_plan", "add_career_entry", "update_career_entry",
    "update_profile_field", "set_goal", "log_injury", "update_cv_visibility",
    "propose_mode_change",
    # Sprint 1 — Recovery & Testing
    "trigger_deload_week", "log_recovery_session", "flag_injury_concern",
    "create_test_session",
    # Sprint 2 — Dual-Load
    "set_academic_priority_period", "set_academic_stress_level",
    # Sprint 3 — CV & Identity
    "set_recruitment_visibility", "generate_cv_export", "add_verified_achievement",
    # Sprint 4 — Training Program
    "create_training_block", "update_block_phase", "override_session_load",
}
