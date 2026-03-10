/**
 * Tool Definitions for Claude AI Coach
 * Defines the tools Claude can use to read athlete data and take actions.
 */

export const TOOL_DEFINITIONS = [
  // ─── Data Lookup Tools ──────────────────────────────────────────────────────
  {
    name: "get_athlete_profile",
    description:
      "Get the full athlete profile including name, age, sport, archetype, streak, goals, gamification, and training preferences.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: "get_recent_checkins",
    description:
      "Get recent daily check-ins with energy, soreness, sleep hours, readiness, pain flag, mood, and effort. Returns most recent first.",
    input_schema: {
      type: "object" as const,
      properties: {
        days: {
          type: "number",
          description:
            "Number of recent check-ins to retrieve (default 7, max 30)",
        },
      },
      required: [] as string[],
    },
  },
  {
    name: "get_today_plan",
    description:
      "Get today's training plan including intensity, workout type, exercises, duration, readiness level, and status.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: "get_calendar_events",
    description:
      "Get calendar events for a specific date or date range. Returns event name, type, time, and intensity.",
    input_schema: {
      type: "object" as const,
      properties: {
        date: { type: "string", description: "Single date in YYYY-MM-DD format" },
        startDate: { type: "string", description: "Range start date YYYY-MM-DD" },
        endDate: { type: "string", description: "Range end date YYYY-MM-DD" },
      },
      required: [] as string[],
    },
  },
  {
    name: "get_sleep_history",
    description:
      "Get recent sleep logs including hours, quality, and source.",
    input_schema: {
      type: "object" as const,
      properties: {
        days: {
          type: "number",
          description: "Number of days to look back (default 7, max 30)",
        },
      },
      required: [] as string[],
    },
  },
  {
    name: "get_test_results",
    description:
      "Get phone test or BlazePod drill session history.",
    input_schema: {
      type: "object" as const,
      properties: {
        type: {
          type: "string",
          enum: ["phone", "blazepod"],
          description: "Test type to query",
        },
        limit: {
          type: "number",
          description: "Max results to return (default 10)",
        },
      },
      required: ["type"] as string[],
    },
  },
  // ─── Action Tools ───────────────────────────────────────────────────────────
  {
    name: "create_calendar_event",
    description:
      "Schedule a new event on the athlete's calendar. Confirm details with the athlete before creating.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Event name" },
        type: {
          type: "string",
          enum: ["training", "match", "recovery", "study", "exam", "other"],
          description: "Event type",
        },
        date: { type: "string", description: "Date in YYYY-MM-DD format" },
        startTime: { type: "string", description: "Start time HH:MM (24h)" },
        endTime: { type: "string", description: "End time HH:MM (24h)" },
        notes: { type: "string", description: "Additional notes" },
      },
      required: ["name", "date"] as string[],
    },
  },
  {
    name: "search_knowledge_base",
    description:
      "Search the Tomo coaching knowledge base for verified sports science, recovery methods, training drills, nutrition guidance, or sport-specific techniques.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Natural language search query",
        },
      },
      required: ["query"] as string[],
    },
  },
  {
    name: "get_padel_progress",
    description:
      "Get the athlete's padel-specific progress data including DNA card and shot mastery ratings.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [] as string[],
    },
  },
];
