/**
 * Intent Registry — single source of truth for all chat intent definitions.
 * Adding a new capsule = adding one entry here. No regex needed.
 */

export interface IntentDefinition {
  id: string;
  capsuleType: string | null;
  agentType: "timeline" | "output" | "mastery";
  description: string;
  examples: string[];
  requiredParams?: string[];
  contextBoosts?: string[];
  toolName?: string;
  toolInput?: Record<string, any>;
}

export const INTENT_REGISTRY: IntentDefinition[] = [
  // ── TEST & CHECK-IN ──
  {
    id: "log_test",
    capsuleType: "test_log_capsule",
    agentType: "output",
    description: "Log a physical test result (sprint, jump, agility, strength, etc.)",
    examples: [
      "log a test", "record my sprint", "enter a new test", "save my jump result",
      "add a test", "I did a 10m sprint", "submit my agility score", "take a test",
      "log cmj", "record my beep test score", "I want to add a test",
      "do a test", "take my vertical jump", "submit a test result",
    ],
    requiredParams: ["testType"],
  },
  {
    id: "check_in",
    capsuleType: "checkin_capsule",
    agentType: "output",
    description: "Do a daily readiness/mood/energy check-in",
    examples: [
      "check in", "daily check in", "log how I feel", "morning check",
      "log my readiness", "log my mood", "how do I feel check",
      "readiness check in", "wellness check", "do my check-in",
    ],
  },

  // ── NAVIGATION ──
  {
    id: "navigate",
    capsuleType: "navigation_capsule",
    agentType: "output",
    description: "Navigate/go to a specific app tab or screen",
    examples: [
      "go to timeline", "show me mastery", "open output", "take me to own it",
      "switch to calendar", "navigate to progress", "open my vitals",
      "go to chat", "show me metrics", "take me to for you",
    ],
    requiredParams: ["targetTab"],
  },

  // ── PROGRAMS ──
  {
    id: "show_programs",
    capsuleType: "program_action_capsule",
    agentType: "output",
    description: "View or browse training programs and recommendations",
    examples: [
      "my programs", "show my programs", "training programs", "what programs do I have",
      "recommend programs", "get programs", "program catalog", "suggest programs",
      "find programs", "what programs do you recommend for me",
    ],
  },
  {
    id: "manage_programs",
    capsuleType: "program_interact_capsule",
    agentType: "output",
    description: "Mark programs as done, dismissed, or manage program status",
    examples: [
      "manage my programs", "program done", "dismiss program", "mark done",
      "complete program", "pause program", "my program status",
    ],
  },

  // ── CALENDAR EVENTS ──
  {
    id: "create_event",
    capsuleType: "event_edit_capsule",
    agentType: "timeline",
    description: "Add/create/schedule a training session, match, event, or study block on the calendar",
    examples: [
      "add a training session", "schedule gym tomorrow", "book a match",
      "add event", "create a session", "put training on Thursday",
      "add club training", "schedule a workout", "build a session",
      "add a session for today", "I want to add a training session",
      "build a session for now",
    ],
  },
  {
    id: "delete_event",
    capsuleType: "event_edit_capsule",
    agentType: "timeline",
    description: "Cancel, remove, or delete a calendar event",
    examples: [
      "cancel tonight's session", "remove my training", "delete event",
      "cancel gym", "remove tomorrow's match", "delete my session",
    ],
  },

  // ── CV / PROFILE ──
  {
    id: "edit_cv",
    capsuleType: "cv_edit_capsule",
    agentType: "mastery",
    description: "Edit player profile: name, height, weight, position, DOB, foot, style",
    examples: [
      "edit my profile", "update my cv", "change my height", "edit my weight",
      "update my position", "change my date of birth", "edit cv",
      "update preferred foot", "change playing style", "edit my CV profile",
    ],
  },

  // ── SCHEDULE RULES ──
  {
    id: "schedule_rules",
    capsuleType: "schedule_rules_capsule",
    agentType: "timeline",
    description: "View or edit schedule rules, preferences, school hours, sleep times",
    examples: [
      "my rules", "schedule rules", "edit my rules", "change school hours",
      "change sleep time", "edit schedule", "my preferences",
      "update my schedule settings", "edit my schedule rules",
    ],
  },

  // ── TRAINING PLAN ──
  {
    id: "plan_training",
    capsuleType: "training_schedule_capsule",
    agentType: "timeline",
    description: "Auto-fill or plan training week schedule",
    examples: [
      "plan my training", "fill my week", "auto-fill schedule",
      "schedule my training", "training plan", "plan my week",
      "plan my training week", "give me a training plan",
    ],
  },

  // ── STUDY PLAN ──
  {
    id: "plan_study",
    capsuleType: "study_schedule_capsule",
    agentType: "timeline",
    description: "Plan study schedule around exams, manage study blocks",
    examples: [
      "study plan", "plan my study", "exam plan", "my exams",
      "study schedule", "plan study schedule", "plan my study schedule",
    ],
  },

  // ── EXAMS ──
  {
    id: "add_exam",
    capsuleType: "exam_capsule",
    agentType: "timeline",
    description: "Add a new exam, quiz, or test date",
    examples: [
      "add an exam", "new exam", "schedule exam", "add a quiz",
      "add midterm", "I have an exam", "I want to add a new exam",
    ],
  },
  {
    id: "exam_schedule",
    capsuleType: "event_edit_capsule",
    agentType: "timeline",
    description: "Schedule an exam event on the calendar with date/time",
    examples: [
      "schedule my exam on Monday", "put exam on calendar", "exam next Tuesday",
      "I got exams coming up", "set exam period",
    ],
    contextBoosts: ["currentTopic:scheduling"],
  },

  // ── SUBJECTS & CATEGORIES ──
  {
    id: "manage_subjects",
    capsuleType: "subject_capsule",
    agentType: "timeline",
    description: "Add or edit study subjects",
    examples: [
      "add a subject", "edit subjects", "manage subjects", "my subjects",
      "study subjects", "change my subjects", "manage my study subjects",
    ],
  },
  {
    id: "training_categories",
    capsuleType: "training_category_capsule",
    agentType: "timeline",
    description: "Add or manage training categories (club, gym, etc.)",
    examples: [
      "add training category", "manage categories", "new category",
      "edit training categories", "my training types",
      "add a new training category",
    ],
  },

  // ── CONFLICTS ──
  {
    id: "check_conflicts",
    capsuleType: "conflict_resolution_capsule",
    agentType: "timeline",
    description: "Find and resolve schedule conflicts, clashes, or overlaps",
    examples: [
      "check conflicts", "any conflicts", "schedule conflicts", "find clashes",
      "overlapping events", "double training", "back to back sessions",
      "check for any schedule conflicts",
    ],
  },

  // ── PHV / GROWTH ──
  {
    id: "phv_query",
    capsuleType: null,
    agentType: "output",
    description: "Check/show existing growth stage or maturity data (NOT calculate)",
    examples: [
      "what is my growth stage", "show my maturity", "my PHV",
      "current growth stage", "what's my growth stage", "my maturity offset",
    ],
    contextBoosts: ["lastActionContext:phv_calculate"],
  },
  {
    id: "phv_calculate",
    capsuleType: "phv_calculator_capsule",
    agentType: "output",
    description: "Calculate or recalculate growth stage / PHV measurements",
    examples: [
      "calculate my growth stage", "recalculate PHV", "redo growth assessment",
      "update maturity offset", "new growth calculation", "calculate growth",
      "calculate my growth", "measure my maturity",
    ],
  },

  // ── STRENGTHS & GAPS ──
  {
    id: "strengths_gaps",
    capsuleType: "strengths_gaps_capsule",
    agentType: "output",
    description: "View performance strengths, weaknesses, and gaps profile",
    examples: [
      "my strengths", "my gaps", "my weaknesses", "performance profile",
      "where do I stand", "my best areas", "my worst areas",
      "what am I good at", "what am I weak at",
    ],
  },

  // ── LEADERBOARD ──
  {
    id: "leaderboard",
    capsuleType: "leaderboard_capsule",
    agentType: "mastery",
    description: "View rankings or leaderboard",
    examples: [
      "leaderboard", "rankings", "where do I rank", "top players",
      "how do I rank", "show leaderboard", "streak leaderboard",
      "global leaderboard", "show me the global leaderboard",
      "show me the streak leaderboard",
    ],
    requiredParams: ["boardType"],
  },

  // ── GHOST SUGGESTIONS ──
  {
    id: "ghost_suggestions",
    capsuleType: "ghost_suggestion_capsule",
    agentType: "timeline",
    description: "See smart schedule suggestions based on patterns",
    examples: [
      "suggestions", "ghost suggestions", "smart suggestions",
      "any suggestions", "what do you suggest", "recurring patterns",
      "auto suggest events",
    ],
  },

  // ── BULK EDIT ──
  {
    id: "bulk_edit_events",
    capsuleType: "bulk_timeline_edit_capsule",
    agentType: "timeline",
    description: "Bulk edit, delete, or manage multiple calendar events at once",
    examples: [
      "bulk edit my events", "bulk delete events", "manage my schedule blocks",
      "delete all gym sessions", "remove recurring training", "bulk edit",
      "edit my recurring events", "clean up my schedule", "delete multiple events",
      "remove all my training sessions",
    ],
  },

  // ── DAY LOCK ──
  {
    id: "day_lock",
    capsuleType: "day_lock_capsule",
    agentType: "timeline",
    description: "Lock or freeze a specific calendar day",
    examples: [
      "lock today", "freeze tomorrow", "lock Monday", "unlock today",
      "unfreeze my day", "lock this day",
    ],
    requiredParams: ["date"],
  },

  // ── WEARABLE ──
  {
    id: "whoop_sync",
    capsuleType: "whoop_sync_capsule",
    agentType: "output",
    description: "Sync Whoop wearable data or check connection status",
    examples: [
      "sync whoop", "whoop data", "sync vitals", "sync wearable",
      "update vitals", "sync health data", "connect whoop",
    ],
  },

  // ── SPORT-SPECIFIC ──
  {
    id: "padel_shots",
    capsuleType: "padel_shot_capsule",
    agentType: "output",
    description: "Log padel shot session",
    examples: [
      "log padel", "padel shots", "padel session", "rate my shots",
      "bandeja", "vibora", "log padel session",
    ],
  },
  {
    id: "blazepods",
    capsuleType: "blazepods_capsule",
    agentType: "output",
    description: "Log a BlazePods reaction drill session",
    examples: [
      "blazepods", "blaze pods", "reaction drill", "reaction pod",
      "pod session", "log blazepods",
    ],
  },

  // ── NOTIFICATIONS ──
  {
    id: "notification_settings",
    capsuleType: "notification_settings_capsule",
    agentType: "output",
    description: "View or change notification preferences",
    examples: [
      "notifications", "notification settings", "alert settings",
      "change notifications", "mute notifications", "reminder settings",
    ],
  },

  // ── RECOMMENDATIONS ──
  {
    id: "recommendations",
    capsuleType: null,
    agentType: "output",
    description: "View personalized Dashboard recommendations",
    examples: [
      "my recommendations", "what should I do", "own it tips",
      "for me", "for you recommendations", "what do you recommend",
    ],
  },

  // ── TIMELINE CAPABILITIES ──
  {
    id: "timeline_capabilities",
    capsuleType: null,
    agentType: "timeline",
    description: "Ask what timeline/calendar features and capabilities are available",
    examples: [
      "what can you do with my timeline", "calendar features",
      "help me with my schedule", "manage my calendar",
      "what can I do with my week", "timeline options",
    ],
  },

  // ── DRILL RATING ──
  {
    id: "drill_rating",
    capsuleType: "drill_rating_capsule",
    agentType: "output",
    description: "Rate a completed drill's difficulty",
    examples: [
      "rate drill", "rate my drill", "how hard was that drill",
      "drill difficulty", "rate exercise",
    ],
    contextBoosts: ["currentTopic:drill"],
  },

  // ── QUICK ACTIONS ──
  {
    id: "qa_readiness",
    capsuleType: "quick_action",
    agentType: "output",
    description: "Quick check readiness score, vitals, recovery status",
    examples: [
      "what's my readiness", "how am I", "how do I feel",
      "my readiness", "readiness score",
      "how is my vitals", "my vitals", "vitals looking",
      "how are my vitals looking", "check my vitals",
      "my recovery", "recovery status", "recovery signals",
      "how is my recovery", "am I recovered",
    ],
    toolName: "get_readiness_detail",
    toolInput: {},
  },
  {
    id: "qa_streak",
    capsuleType: "quick_action",
    agentType: "mastery",
    description: "Quick check current streak or consistency score",
    examples: [
      "my streak", "what's my streak", "show streak",
      "streak score", "consistency",
    ],
    toolName: "get_consistency_score",
    toolInput: {},
  },
  {
    id: "qa_load",
    capsuleType: "quick_action",
    agentType: "output",
    description: "Quick check training load / ACWR",
    examples: [
      "my load", "load score", "acwr", "dual load", "training load",
    ],
    toolName: "get_dual_load_score",
    toolInput: {},
  },
  {
    id: "qa_today_schedule",
    capsuleType: "quick_action",
    agentType: "timeline",
    description: "Quick view today's schedule",
    examples: [
      "today's schedule", "what's today", "my schedule today", "today's plan",
    ],
    toolName: "get_today_events",
  },
  {
    id: "qa_week_schedule",
    capsuleType: "quick_action",
    agentType: "timeline",
    description: "Quick view this week's schedule",
    examples: [
      "this week", "week schedule", "my week", "weekly schedule", "what's this week",
      "show my week",
    ],
    toolName: "get_week_schedule",
  },
  {
    id: "qa_test_history",
    capsuleType: "quick_action",
    agentType: "output",
    description: "Quick view test result history",
    examples: [
      "my tests", "test history", "test results", "show tests", "my scores",
    ],
    toolName: "get_test_results",
    toolInput: {},
  },
  // ── Journal ──
  {
    id: "journal_pre",
    capsuleType: "training_journal_pre_capsule",
    agentType: "output",
    description: "Athlete wants to set a target or goal before an upcoming training session",
    examples: [
      "set my training target", "set my target", "set my focus",
      "log my goal for today", "what am I working on today",
      "before training", "set my intention", "pre-training",
    ],
    toolName: "get_today_training_for_journal",
  },
  {
    id: "journal_post",
    capsuleType: "training_journal_post_capsule",
    agentType: "output",
    description: "Athlete wants to reflect on or log how a training session went",
    examples: [
      "log how training went", "reflect on my session", "how did training go",
      "session review", "training reflection", "post-training",
      "how was my session", "what did I learn today",
    ],
    toolName: "get_pending_post_journal",
  },
];

// Build lookup maps for fast access
export const INTENT_BY_ID = new Map(INTENT_REGISTRY.map(i => [i.id, i]));

// Build Haiku classifier prompt from registry (cached at module level)
export function buildClassifierIntentList(): string {
  return INTENT_REGISTRY
    .filter(i => i.id !== "agent_fallthrough")
    .map(i => `${i.id}: ${i.description}`)
    .join("\n");
}
