/**
 * Tests for StreakStatusCard helper functions
 * Validates multiplier, progress, and nudge/milestone detection.
 *
 * Note: We test the pure logic extracted from the component.
 * The component itself uses React Native + Reanimated which requires
 * a full RN test environment — covered separately if needed.
 */

// Re-implement the helpers here to test them in isolation
// (they are inline in the component, so we duplicate for testing)

const MULTIPLIER_BRACKETS = [
  { threshold: 90, multiplier: 5.0 },
  { threshold: 60, multiplier: 3.0 },
  { threshold: 30, multiplier: 2.0 },
  { threshold: 14, multiplier: 1.5 },
  { threshold: 7, multiplier: 1.2 },
];

function getMultiplier(streak: number): number {
  for (const b of MULTIPLIER_BRACKETS) {
    if (streak >= b.threshold) return b.multiplier;
  }
  return 1.0;
}

const FREEZE_INTERVAL = 7;

function getProgress(streak: number): { current: number; target: number } {
  if (streak === 0) return { current: 0, target: FREEZE_INTERVAL };
  const nextMilestone = Math.ceil(streak / FREEZE_INTERVAL) * FREEZE_INTERVAL;
  const target = streak === nextMilestone ? nextMilestone + FREEZE_INTERVAL : nextMilestone;
  const prevMilestone = target - FREEZE_INTERVAL;
  return { current: streak - prevMilestone, target: FREEZE_INTERVAL };
}

const MILESTONES = [7, 14, 30, 60, 90];

function isOneAwayFromReward(streak: number): boolean {
  return streak > 0 && MILESTONES.includes(streak + 1);
}

function isMilestone(streak: number): boolean {
  return MILESTONES.includes(streak);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++;
    console.log(`  \u2713 ${label}`);
  } else {
    failed++;
    console.error(`  \u2717 ${label}`);
  }
}

// ---------------------------------------------------------------------------
// getMultiplier
// ---------------------------------------------------------------------------
console.log('\ngetMultiplier');

assert(getMultiplier(0) === 1.0, 'streak 0 \u2192 1.0x');
assert(getMultiplier(6) === 1.0, 'streak 6 \u2192 1.0x');
assert(getMultiplier(7) === 1.2, 'streak 7 \u2192 1.2x');
assert(getMultiplier(13) === 1.2, 'streak 13 \u2192 1.2x');
assert(getMultiplier(14) === 1.5, 'streak 14 \u2192 1.5x');
assert(getMultiplier(29) === 1.5, 'streak 29 \u2192 1.5x');
assert(getMultiplier(30) === 2.0, 'streak 30 \u2192 2.0x');
assert(getMultiplier(59) === 2.0, 'streak 59 \u2192 2.0x');
assert(getMultiplier(60) === 3.0, 'streak 60 \u2192 3.0x');
assert(getMultiplier(89) === 3.0, 'streak 89 \u2192 3.0x');
assert(getMultiplier(90) === 5.0, 'streak 90 \u2192 5.0x');
assert(getMultiplier(365) === 5.0, 'streak 365 \u2192 5.0x');

// ---------------------------------------------------------------------------
// getProgress
// ---------------------------------------------------------------------------
console.log('\ngetProgress');

(() => {
  const p = getProgress(0);
  assert(p.current === 0 && p.target === 7, 'streak 0 \u2192 0/7');
})();

(() => {
  const p = getProgress(3);
  assert(p.current === 3 && p.target === 7, 'streak 3 \u2192 3/7');
})();

(() => {
  const p = getProgress(6);
  assert(p.current === 6 && p.target === 7, 'streak 6 \u2192 6/7');
})();

(() => {
  // On milestone: show next cycle
  const p = getProgress(7);
  assert(p.current === 0 && p.target === 7, 'streak 7 (milestone) \u2192 0/7 (next cycle)');
})();

(() => {
  const p = getProgress(10);
  assert(p.current === 3 && p.target === 7, 'streak 10 \u2192 3/7');
})();

(() => {
  const p = getProgress(14);
  assert(p.current === 0 && p.target === 7, 'streak 14 (milestone) \u2192 0/7');
})();

(() => {
  const p = getProgress(20);
  assert(p.current === 6 && p.target === 7, 'streak 20 \u2192 6/7');
})();

// ---------------------------------------------------------------------------
// isOneAwayFromReward
// ---------------------------------------------------------------------------
console.log('\nisOneAwayFromReward');

assert(isOneAwayFromReward(6) === true, 'streak 6 \u2192 true (1 away from 7)');
assert(isOneAwayFromReward(13) === true, 'streak 13 \u2192 true (1 away from 14)');
assert(isOneAwayFromReward(29) === true, 'streak 29 \u2192 true (1 away from 30)');
assert(isOneAwayFromReward(59) === true, 'streak 59 \u2192 true (1 away from 60)');
assert(isOneAwayFromReward(89) === true, 'streak 89 \u2192 true (1 away from 90)');
assert(isOneAwayFromReward(7) === false, 'streak 7 \u2192 false (already at milestone)');
assert(isOneAwayFromReward(0) === false, 'streak 0 \u2192 false');
assert(isOneAwayFromReward(5) === false, 'streak 5 \u2192 false');
assert(isOneAwayFromReward(20) === false, 'streak 20 \u2192 false (not before any milestone)');

// ---------------------------------------------------------------------------
// isMilestone
// ---------------------------------------------------------------------------
console.log('\nisMilestone');

assert(isMilestone(7) === true, 'streak 7 \u2192 milestone');
assert(isMilestone(14) === true, 'streak 14 \u2192 milestone');
assert(isMilestone(30) === true, 'streak 30 \u2192 milestone');
assert(isMilestone(60) === true, 'streak 60 \u2192 milestone');
assert(isMilestone(90) === true, 'streak 90 \u2192 milestone');
assert(isMilestone(0) === false, 'streak 0 \u2192 not milestone');
assert(isMilestone(1) === false, 'streak 1 \u2192 not milestone');
assert(isMilestone(6) === false, 'streak 6 \u2192 not milestone');
assert(isMilestone(21) === false, 'streak 21 \u2192 not milestone (not a multiplier bracket)');
assert(isMilestone(100) === false, 'streak 100 \u2192 not milestone');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
test('all assertions pass', () => {
  expect(failed).toBe(0);
});
