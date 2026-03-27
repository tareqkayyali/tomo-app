/**
 * Chat Test Scenarios — All conversation test flows grouped by page.
 * Start with a minimal set; expand as needed.
 */

import type { TestScenario } from "./chat-test-types";

// ── TIMELINE SCENARIOS ─────────────────────────────────────
export const timelineScenarios: TestScenario[] = [
  {
    page: "Timeline",
    name: "Command Center",
    turns: [
      {
        message: "help me manage my timeline",
        expectedCardType: "text_card",
        expectChips: true,
        expectChipLabel: "Add an event",
      },
    ],
  },
  {
    page: "Timeline",
    name: "Add Training Event",
    turns: [
      {
        message: "add a training session tomorrow at 5pm",
        expectedCardType: "event_edit_capsule",
      },
    ],
  },
  {
    page: "Timeline",
    name: "Edit Schedule Rules",
    turns: [
      {
        message: "edit my schedule rules",
        expectedCardType: "schedule_rules_capsule",
      },
    ],
  },
  {
    page: "Timeline",
    name: "Plan Training Week",
    turns: [
      {
        message: "plan my training week",
        expectedCardType: "training_schedule_capsule",
      },
    ],
  },
  {
    page: "Timeline",
    name: "Plan Study Schedule",
    turns: [
      {
        message: "plan my study schedule",
        expectedCardType: "study_schedule_capsule",
      },
    ],
  },
  {
    page: "Timeline",
    name: "Check Conflicts",
    turns: [
      {
        message: "check for any schedule conflicts",
        expectedCardTypeOneOf: ["conflict_resolution_capsule", "clash_list"],
      },
    ],
  },
  {
    page: "Timeline",
    name: "Command Center → Chip Follow-up",
    turns: [
      {
        message: "what functions can I do with my timeline?",
        expectedCardType: "text_card",
        expectChips: true,
      },
      {
        message: "", // will be replaced by chip action
        followChipLabel: "Add an event",
        expectedCardType: "event_edit_capsule",
      },
    ],
  },
];

// ── OUTPUT SCENARIOS ─────────────────────────────────────
export const outputScenarios: TestScenario[] = [
  {
    page: "Output",
    name: "Log Test Capsule",
    turns: [
      {
        message: "log a test",
        expectedCardType: "test_log_capsule",
      },
    ],
  },
  {
    page: "Output",
    name: "Check-in Capsule",
    turns: [
      {
        message: "check in",
        expectedCardType: "checkin_capsule",
      },
    ],
  },
  {
    page: "Output",
    name: "Strengths & Gaps",
    turns: [
      {
        message: "what are my strengths and gaps?",
        expectedCardTypeOneOf: ["strengths_gaps_capsule", "stat_row", "stat_grid", "text_card", "benchmark_bar"],
      },
    ],
  },
  {
    page: "Output",
    name: "My Programs",
    turns: [
      {
        message: "my programs",
        expectedCardTypeOneOf: ["program_action_capsule", "text_card"],
      },
    ],
  },
  {
    page: "Output",
    name: "PHV Calculator",
    turns: [
      {
        message: "calculate my growth stage",
        expectedCardType: "phv_calculator_capsule",
      },
    ],
  },
  {
    page: "Output",
    name: "Padel Shot Logger",
    turns: [
      {
        message: "log padel session",
        expectedCardType: "padel_shot_capsule",
      },
    ],
  },
  {
    page: "Output",
    name: "BlazePods Logger",
    turns: [
      {
        message: "log blazepods session",
        expectedCardType: "blazepods_capsule",
      },
    ],
  },
  {
    page: "Output",
    name: "Notification Settings",
    turns: [
      {
        message: "notification settings",
        expectedCardType: "notification_settings_capsule",
      },
    ],
  },
  {
    page: "Output",
    name: "Log Test Full Flow",
    turns: [
      {
        message: "I want to log a new sprint test",
        expectedCardType: "test_log_capsule",
      },
      {
        message: "Log 2.1s for 10m sprint",
        capsuleAction: {
          type: "test_log_capsule",
          toolName: "log_test_result",
          toolInput: {
            testType: "10m-sprint",
            score: 2.1,
            unit: "s",
            date: new Date().toISOString().split("T")[0],
          },
          agentType: "output",
        },
        expectRefreshTargets: true,
      },
    ],
  },
];

// ── MASTERY SCENARIOS ─────────────────────────────────────
export const masteryScenarios: TestScenario[] = [
  {
    page: "Mastery",
    name: "Leaderboard",
    turns: [
      {
        message: "show me the leaderboard",
        expectedCardType: "leaderboard_capsule",
      },
    ],
  },
  {
    page: "Mastery",
    name: "Edit CV",
    turns: [
      {
        message: "edit my CV profile",
        expectedCardType: "cv_edit_capsule",
      },
    ],
  },
];

// ── CROSS-PAGE SCENARIOS ─────────────────────────────────────
export const crossPageScenarios: TestScenario[] = [
  {
    page: "Cross-Page",
    name: "Navigation",
    turns: [
      {
        message: "go to timeline",
        expectedCardType: "navigation_capsule",
      },
    ],
  },
  {
    page: "Cross-Page",
    name: "Readiness Quick Action",
    turns: [
      {
        message: "what's my readiness?",
        expectedCardTypeOneOf: ["stat_row", "stat_grid", "readiness_card", "text_card"],
      },
    ],
  },
  {
    page: "Cross-Page",
    name: "Streak Quick Action",
    turns: [
      {
        message: "my streak",
        expectedCardTypeOneOf: ["stat_row", "stat_grid", "text_card", "streak_card"],
      },
    ],
  },
];

// ── ALL SCENARIOS ─────────────────────────────────────
export const allScenarios: TestScenario[] = [
  ...timelineScenarios,
  ...outputScenarios,
  ...masteryScenarios,
  ...crossPageScenarios,
];
