/**
 * Reproduces the user's reported 2026-04-16 calendar and prints exactly
 * what the scheduling engine returns for each candidate session duration.
 *
 * Calendar (from mobile Timeline screenshot 2026-04-15 22:53):
 *   06:00 - 07:10  Speed Session        (training, MODERATE)
 *   08:00 - 15:00  School Hours         (auto_block)
 *   16:00 - 17:30  Math Study           (study)
 *   18:00 - 18:48  Endurance Session    (training, MODERATE)
 *   22:00 - 23:59  Sleep                (other)
 *
 * User asked: "Build for me a sprint session tomorrow at 5 pm"
 * Chat card showed:       Morning 7AM / Late morning 10AM / Afternoon 3PM
 *                         / Early evening 5PM / Evening 7PM
 * Every one of those overlaps the real schedule. Root cause: the
 * scheduling engine returned 0 slots and the flow fell back to a
 * static option list.
 *
 * This script calls findAvailableSlots + suggestBestTimes with the
 * DEFAULT_CONFIG + simulated school-hours override, at three durations
 * (60 / 75 / 45 min), and prints the resulting slots so we can verify
 * the fix works against the REAL data before shipping.
 *
 * Run: npx tsx backend/scripts/debug/test-suggest-slots-thursday.ts
 */

import {
  DEFAULT_CONFIG,
  findAvailableSlots,
  suggestBestTimes,
  getBlockedRanges,
  minutesToTime,
  format12h,
  type ScheduleEvent,
  type SchedulingConfig,
} from "../../services/schedulingEngine";

const events: ScheduleEvent[] = [
  { id: "1", name: "Speed Session",     startTime: "06:00", endTime: "07:10", type: "training", intensity: "MODERATE" },
  { id: "2", name: "School Hours",      startTime: "08:00", endTime: "15:00", type: "auto_block", intensity: null },
  { id: "3", name: "Math Study",        startTime: "16:00", endTime: "17:30", type: "study", intensity: null },
  { id: "4", name: "Endurance Session", startTime: "18:00", endTime: "18:48", type: "training", intensity: "MODERATE" },
  { id: "5", name: "Sleep",             startTime: "22:00", endTime: "23:59", type: "other", intensity: null },
];

const baseConfig: SchedulingConfig = {
  ...DEFAULT_CONFIG,
  respectSchoolHours: true,
  schoolSchedule: {
    days: [1, 2, 3, 4, 5],
    startTime: "08:00",
    endTime: "15:00",
  },
};

function fmt(min: number): string {
  return format12h(minutesToTime(min));
}

function dumpBlocked(config: SchedulingConfig) {
  console.log("\n  Blocked ranges (merged):");
  const blocked = getBlockedRanges(events, config, 4 /* Thursday */);
  for (const b of blocked) {
    console.log(`    ${fmt(b.startMin)} - ${fmt(b.endMin)}`);
  }
}

function runScenario(label: string, durationMin: number, config: SchedulingConfig) {
  console.log(`\n=== ${label} (duration ${durationMin}min, gap ${config.gapMinutes}min) ===`);
  dumpBlocked(config);
  const all = findAvailableSlots(events, durationMin, config, 4);
  console.log(`\n  findAvailableSlots returned ${all.length} raw slot(s):`);
  for (const s of all) {
    console.log(`    ${fmt(s.startMin)} - ${fmt(s.endMin)}   score=${s.score}   ${s.reason}`);
  }
  const top = suggestBestTimes("training", durationMin, events, null, config, 4, 6);
  console.log(`\n  suggestBestTimes top 6 (training):`);
  if (top.length === 0) {
    console.log("    (none)");
  } else {
    for (const s of top) {
      console.log(`    ${fmt(s.startMin)} - ${fmt(s.endMin)}   score=${s.score}`);
    }
  }
}

console.log("Thursday 2026-04-16 suggest-slots diagnostic");
console.log("============================================");
console.log("Calendar:");
for (const e of events) {
  console.log(`  ${e.startTime} - ${e.endTime}  ${e.name}  [${e.type}${e.intensity ? ' / ' + e.intensity : ''}]`);
}

// PROD_CONFIG mirrors migration 047 seed exactly:
//   gap=30, afterHighIntensity=90, afterMatch=240, beforeMatch=120
const prodConfig: SchedulingConfig = {
  ...baseConfig,
  gapMinutes: 30,
  ruleOverrides: {
    gapAfterHighIntensity: 90,
    gapAfterMatch: 240,
    gapBeforeMatch: 120,
    maxSessionsPerDay: 3,
    noHardOnExamDay: true,
    intensityCapOnExamDays: "LIGHT",
  },
};

runScenario("PROD CMS, 75 min (OLD default)", 75, prodConfig);
runScenario("PROD CMS, 60 min (NEW default)", 60, prodConfig);
runScenario("PROD CMS, 45 min (retry fallback)", 45, prodConfig);
runScenario("DEFAULT_CONFIG, 60 min (no postHigh)", 60, baseConfig);

// Simulate tighter CMS gap (15 min) in case prod is stricter
runScenario("CMS-lite (gap 45), 60 min", 60, { ...baseConfig, gapMinutes: 45 });
runScenario("CMS-lite (gap 45) + postHigh=60, 60 min", 60, {
  ...baseConfig,
  gapMinutes: 45,
  ruleOverrides: { gapAfterHighIntensity: 60 },
});
runScenario("Aggressive CMS (gap 60) + postHigh=90, 60 min", 60, {
  ...baseConfig,
  gapMinutes: 60,
  ruleOverrides: { gapAfterHighIntensity: 90 },
});
