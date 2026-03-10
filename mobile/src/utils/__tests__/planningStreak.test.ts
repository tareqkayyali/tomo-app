/**
 * Planning Streak Logic Tests
 * Tests for the streak calculation logic used in usePlanningStreak.
 * Reproduced inline since the hook depends on React/AsyncStorage.
 *
 * Run: npx tsx src/utils/__tests__/planningStreak.test.ts
 */

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}`);
  }
}

function assertEq(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

console.log('\n=== Planning Streak Logic Tests ===\n');

// ─── Date Helpers (reproduced) ──────────────────────────────────────────────

/** Format a Date as "YYYY-MM-DD" in local time. */
function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Check if dateB is exactly 1 calendar day after dateA. */
function isConsecutive(dateStrA: string, dateStrB: string): boolean {
  const a = new Date(dateStrA + 'T12:00:00');
  const b = new Date(dateStrB + 'T12:00:00');
  const diffMs = b.getTime() - a.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  return diffDays === 1;
}

// ─── Streak Calculator (reproduces usePlanningStreak.confirmToday logic) ────

interface StreakData {
  currentStreak: number;
  lastConfirmedDate: string | null;
}

/**
 * Given the current streak state and today's date string,
 * compute the new streak value after confirming today.
 * Returns the new streak count.
 */
function computeNewStreak(data: StreakData, today: string, yesterday: string): number {
  if (data.lastConfirmedDate === yesterday) {
    // Consecutive day — extend
    return data.currentStreak + 1;
  } else if (data.lastConfirmedDate === today) {
    // Same day — no change
    return data.currentStreak;
  } else {
    // Gap detected — reset to 1
    return 1;
  }
}

// ─── Tests: isConsecutive helper ────────────────────────────────────────────

console.log('isConsecutive helper:');

assert(
  isConsecutive('2026-02-24', '2026-02-25'),
  '"2026-02-24" and "2026-02-25" → true (consecutive)'
);

assert(
  !isConsecutive('2026-02-23', '2026-02-25'),
  '"2026-02-23" and "2026-02-25" → false (2 day gap)'
);

assert(
  isConsecutive('2026-01-31', '2026-02-01'),
  '"2026-01-31" and "2026-02-01" → true (month boundary)'
);

assert(
  isConsecutive('2025-12-31', '2026-01-01'),
  '"2025-12-31" and "2026-01-01" → true (year boundary)'
);

assert(
  !isConsecutive('2026-02-25', '2026-02-25'),
  '"2026-02-25" and "2026-02-25" → false (same day, not consecutive)'
);

assert(
  !isConsecutive('2026-02-26', '2026-02-25'),
  '"2026-02-26" and "2026-02-25" → false (backwards)'
);

assert(
  isConsecutive('2026-02-28', '2026-03-01'),
  '"2026-02-28" and "2026-03-01" → true (Feb→Mar in non-leap year 2026)'
);

assert(
  isConsecutive('2024-02-28', '2024-02-29'),
  '"2024-02-28" and "2024-02-29" → true (leap year Feb 28→29)'
);

assert(
  isConsecutive('2024-02-29', '2024-03-01'),
  '"2024-02-29" and "2024-03-01" → true (leap year Feb 29→Mar 1)'
);

// ─── Tests: computeNewStreak ────────────────────────────────────────────────

console.log('\nStreak computation — yesterday confirmed:');
(() => {
  const data: StreakData = { currentStreak: 3, lastConfirmedDate: '2026-02-24' };
  const newStreak = computeNewStreak(data, '2026-02-25', '2026-02-24');
  assertEq(newStreak, 4, 'yesterday confirmed (streak 3) → streak increments to 4');
})();

console.log('\nStreak computation — 2 days ago confirmed (gap):');
(() => {
  const data: StreakData = { currentStreak: 5, lastConfirmedDate: '2026-02-23' };
  const newStreak = computeNewStreak(data, '2026-02-25', '2026-02-24');
  assertEq(newStreak, 1, '2 days ago confirmed → streak resets to 1');
})();

console.log('\nStreak computation — same day confirmed again:');
(() => {
  const data: StreakData = { currentStreak: 3, lastConfirmedDate: '2026-02-25' };
  const newStreak = computeNewStreak(data, '2026-02-25', '2026-02-24');
  assertEq(newStreak, 3, 'same day confirmed → no change (still 3)');
})();

console.log('\nStreak computation — first ever confirmation:');
(() => {
  const data: StreakData = { currentStreak: 0, lastConfirmedDate: null };
  const newStreak = computeNewStreak(data, '2026-02-25', '2026-02-24');
  assertEq(newStreak, 1, 'first ever confirmation → streak = 1');
})();

console.log('\nStreak computation — consecutive 5 days:');
(() => {
  // Simulate 5 consecutive confirmations
  let data: StreakData = { currentStreak: 0, lastConfirmedDate: null };

  // Day 1: Feb 21
  data = {
    currentStreak: computeNewStreak(data, '2026-02-21', '2026-02-20'),
    lastConfirmedDate: '2026-02-21',
  };
  assertEq(data.currentStreak, 1, 'day 1 → streak = 1');

  // Day 2: Feb 22
  data = {
    currentStreak: computeNewStreak(data, '2026-02-22', '2026-02-21'),
    lastConfirmedDate: '2026-02-22',
  };
  assertEq(data.currentStreak, 2, 'day 2 → streak = 2');

  // Day 3: Feb 23
  data = {
    currentStreak: computeNewStreak(data, '2026-02-23', '2026-02-22'),
    lastConfirmedDate: '2026-02-23',
  };
  assertEq(data.currentStreak, 3, 'day 3 → streak = 3');

  // Day 4: Feb 24
  data = {
    currentStreak: computeNewStreak(data, '2026-02-24', '2026-02-23'),
    lastConfirmedDate: '2026-02-24',
  };
  assertEq(data.currentStreak, 4, 'day 4 → streak = 4');

  // Day 5: Feb 25
  data = {
    currentStreak: computeNewStreak(data, '2026-02-25', '2026-02-24'),
    lastConfirmedDate: '2026-02-25',
  };
  assertEq(data.currentStreak, 5, 'day 5 → streak = 5');
})();

console.log('\nStreak computation — break then restart:');
(() => {
  // Had a 5-day streak, missed a day, then confirmed again
  let data: StreakData = { currentStreak: 5, lastConfirmedDate: '2026-02-22' };

  // Skipped Feb 23, now confirming Feb 24 — gap detected
  data = {
    currentStreak: computeNewStreak(data, '2026-02-24', '2026-02-23'),
    lastConfirmedDate: '2026-02-24',
  };
  assertEq(data.currentStreak, 1, 'gap → streak resets to 1');

  // Continue next day (Feb 25) — consecutive
  data = {
    currentStreak: computeNewStreak(data, '2026-02-25', '2026-02-24'),
    lastConfirmedDate: '2026-02-25',
  };
  assertEq(data.currentStreak, 2, 'next day after reset → streak = 2');
})();

console.log('\nStreak computation — month boundary consecutive:');
(() => {
  const data: StreakData = { currentStreak: 7, lastConfirmedDate: '2026-01-31' };
  const newStreak = computeNewStreak(data, '2026-02-01', '2026-01-31');
  assertEq(newStreak, 8, 'Jan 31 → Feb 1 is consecutive → streak increments');
})();

console.log('\nStreak computation — year boundary consecutive:');
(() => {
  const data: StreakData = { currentStreak: 10, lastConfirmedDate: '2025-12-31' };
  const newStreak = computeNewStreak(data, '2026-01-01', '2025-12-31');
  assertEq(newStreak, 11, 'Dec 31 → Jan 1 is consecutive → streak increments');
})();

console.log('\nStreak computation — very old lastConfirmedDate:');
(() => {
  const data: StreakData = { currentStreak: 100, lastConfirmedDate: '2025-06-15' };
  const newStreak = computeNewStreak(data, '2026-02-25', '2026-02-24');
  assertEq(newStreak, 1, 'very old date → resets to 1');
})();

console.log('\nStreak computation — duplicate same-day confirmation:');
(() => {
  // Confirm Feb 25, then "confirm" Feb 25 again
  let data: StreakData = { currentStreak: 3, lastConfirmedDate: '2026-02-24' };

  // First confirmation
  data = {
    currentStreak: computeNewStreak(data, '2026-02-25', '2026-02-24'),
    lastConfirmedDate: '2026-02-25',
  };
  assertEq(data.currentStreak, 4, 'first confirmation → 4');

  // Duplicate confirmation same day
  const secondResult = computeNewStreak(data, '2026-02-25', '2026-02-24');
  assertEq(secondResult, 4, 'duplicate same-day → no change, still 4');
})();

// ─── Summary ────────────────────────────────────────────────────────────────

console.log(`\nPlanning Streak Tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('All tests passed!');
}
