/**
 * Calendar Helpers Tests
 * Run: npx tsx src/utils/__tests__/calendarHelpers.test.ts
 */

import {
  getWeekDays,
  getMonthDays,
  formatDateHeader,
  formatMonthYear,
  formatWeekRange,
  isSameDay,
  addDays,
  getWeekStart,
  toDateStr,
  getReadinessColor,
  getIntensityConfig,
  getEventTypeColor,
  timeToMinutes,
  minutesToY,
} from '../calendarHelpers';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

function assertEq(actual: unknown, expected: unknown, message: string) {
  const pass = actual === expected;
  if (pass) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ─── getWeekDays ────────────────────────────────────────────────────────────

const wednesday = new Date(2026, 1, 25); // Feb 25 2026 = Wednesday
const week = getWeekDays(wednesday);
assertEq(week.length, 7, 'getWeekDays returns 7 days');
assertEq(week[0].dayLabel, 'Mon', 'First day is Monday');
assertEq(week[6].dayLabel, 'Sun', 'Last day is Sunday');
assertEq(week[0].dateStr, '2026-02-23', 'Monday date correct (Feb 23)');
assertEq(week[6].dateStr, '2026-03-01', 'Sunday date correct (Mar 1)');

// Week for a Monday
const monday = new Date(2026, 1, 23);
const weekMon = getWeekDays(monday);
assertEq(weekMon[0].dateStr, '2026-02-23', 'Monday input: first day is same Monday');

// Week for a Sunday
const sunday = new Date(2026, 2, 1);
const weekSun = getWeekDays(sunday);
assertEq(weekSun[6].dateStr, '2026-03-01', 'Sunday input: last day is that Sunday');

// ─── getMonthDays ───────────────────────────────────────────────────────────

const feb2026 = getMonthDays(2026, 1); // month is 0-indexed: 1 = Feb
assertEq(feb2026.length, 42, 'getMonthDays returns 42 cells');

// Feb 2026 starts on Sunday, so grid starts on Monday Jan 26
const firstCell = feb2026[0];
assert(firstCell.dayNumber === 26 || firstCell.dayNumber === 27, 'First cell is late January');
assert(!firstCell.isCurrentMonth, 'First cell is not current month');

// Find Feb 1
const feb1 = feb2026.find(d => d.isCurrentMonth && d.dayNumber === 1);
assert(feb1 !== undefined, 'Feb 1 exists in grid');

// Find Feb 28
const feb28 = feb2026.find(d => d.isCurrentMonth && d.dayNumber === 28);
assert(feb28 !== undefined, 'Feb 28 exists in grid');

// ─── toDateStr ──────────────────────────────────────────────────────────────

assertEq(toDateStr(new Date(2026, 0, 5)), '2026-01-05', 'toDateStr pads single digits');
assertEq(toDateStr(new Date(2026, 11, 31)), '2026-12-31', 'toDateStr Dec 31');

// ─── isSameDay ──────────────────────────────────────────────────────────────

assert(isSameDay(new Date(2026, 1, 22), new Date(2026, 1, 22)), 'Same day returns true');
assert(!isSameDay(new Date(2026, 1, 22), new Date(2026, 1, 23)), 'Different day returns false');
assert(!isSameDay(new Date(2026, 1, 22), new Date(2025, 1, 22)), 'Different year returns false');
// Same day, different times
assert(isSameDay(new Date(2026, 1, 22, 8, 0), new Date(2026, 1, 22, 20, 30)), 'Same day different times');

// ─── addDays ────────────────────────────────────────────────────────────────

const base = new Date(2026, 1, 28);
const plus1 = addDays(base, 1);
assertEq(toDateStr(plus1), '2026-03-01', 'addDays crosses month boundary (Feb 28 + 1 = Mar 1)');

const minus7 = addDays(base, -7);
assertEq(toDateStr(minus7), '2026-02-21', 'addDays negative works');

// ─── getWeekStart ───────────────────────────────────────────────────────────

const ws1 = getWeekStart(new Date(2026, 1, 25)); // Wed
assertEq(toDateStr(ws1), '2026-02-23', 'getWeekStart for Wednesday → Monday');

const ws2 = getWeekStart(new Date(2026, 1, 23)); // Mon
assertEq(toDateStr(ws2), '2026-02-23', 'getWeekStart for Monday → same Monday');

const ws3 = getWeekStart(new Date(2026, 2, 1)); // Sun Mar 1
assertEq(toDateStr(ws3), '2026-02-23', 'getWeekStart for Sunday → previous Monday');

// ─── getReadinessColor ──────────────────────────────────────────────────────

assertEq(getReadinessColor('Green'), '#7A9B76', 'Green readiness color');
assertEq(getReadinessColor('YELLOW'), '#5A6B7C', 'Yellow readiness color (uppercase)');
assertEq(getReadinessColor('red'), '#5A6B7C', 'Red readiness color (lowercase)');
assertEq(getReadinessColor(null), null, 'null returns null');
assertEq(getReadinessColor(undefined), null, 'undefined returns null');
assertEq(getReadinessColor('unknown'), null, 'unknown returns null');

// ─── getIntensityConfig ─────────────────────────────────────────────────────

const rest = getIntensityConfig('REST');
assertEq(rest.label, 'Rest', 'REST intensity label');
assertEq(rest.ringPercent, 0.25, 'REST ring percent');

const hard = getIntensityConfig('HARD');
assertEq(hard.label, 'Hard', 'HARD intensity label');
assertEq(hard.ringPercent, 1.0, 'HARD ring percent');

const light = getIntensityConfig('light');
assertEq(light.label, 'Light', 'light (lowercase) intensity label');

const unknown = getIntensityConfig('UNKNOWN');
assertEq(unknown.label, 'Moderate', 'Unknown defaults to Moderate');

// ─── getEventTypeColor ──────────────────────────────────────────────────────

assertEq(getEventTypeColor('training'), '#7A9B76', 'training event color');
assertEq(getEventTypeColor('match'), '#5A6B7C', 'match event color');
assertEq(getEventTypeColor('recovery'), '#7A9B76', 'recovery event color');
assertEq(getEventTypeColor('study_block'), '#5A6B7C', 'study_block event color');
assertEq(getEventTypeColor('exam'), '#5A6B7C', 'exam event color');
assertEq(getEventTypeColor('other'), '#5A6B7C', 'other event color');
assertEq(getEventTypeColor(undefined), '#5A6B7C', 'undefined defaults to other');
assertEq(getEventTypeColor('garbage'), '#5A6B7C', 'unknown type defaults to other');

// ─── timeToMinutes ──────────────────────────────────────────────────────────

assertEq(timeToMinutes('00:00'), 0, 'midnight = 0 minutes');
assertEq(timeToMinutes('06:00'), 360, '6AM = 360 minutes');
assertEq(timeToMinutes('14:30'), 870, '2:30PM = 870 minutes');
assertEq(timeToMinutes('23:59'), 1439, '11:59PM = 1439 minutes');

// ─── minutesToY ─────────────────────────────────────────────────────────────

// 72px per hour, start at 6AM (360 min)
assertEq(minutesToY(360, 72, 6), 0, '6AM at top = Y 0');
assertEq(minutesToY(420, 72, 6), 72, '7AM = Y 72 (1 hour down)');
assertEq(minutesToY(390, 72, 6), 36, '6:30AM = Y 36 (half hour)');
assertEq(minutesToY(480, 72, 6), 144, '8AM = Y 144');

// ─── Summary ────────────────────────────────────────────────────────────────

console.log(`\nCalendar Helpers Tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('All tests passed!');
}
