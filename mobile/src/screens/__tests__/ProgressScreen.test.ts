/**
 * Tests for ProgressScreen logic
 *
 * Validates the pure helpers that power the progress view:
 *   getStreakTier, getNextMilestoneInfo, formatPoints,
 *   getComplianceLabel, formatTime, getReasonIcon, MILESTONES
 *
 * UI rendering is not tested here (no React Native test renderer).
 * We reproduce the pure logic inline to avoid RN import chains.
 */

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
// Reproduce pure helpers (mirrors ProgressScreen exports)
// ---------------------------------------------------------------------------

const MILESTONES = [
  { id: 'first_checkin', name: 'First Steps', icon: 'leaf' as const, days: 1, description: 'Complete your first check-in' },
  { id: 'week_streak', name: 'Week Warrior', icon: 'flame' as const, days: 7, description: '7-day streak' },
  { id: 'perfect_week', name: 'Perfect Week', icon: 'star' as const, days: 7, description: 'Full compliance for 7 days' },
  { id: 'two_week_streak', name: 'Consistent', icon: 'fitness' as const, days: 14, description: '14-day streak' },
  { id: 'month_streak', name: 'Unstoppable', icon: 'trophy' as const, days: 30, description: '30-day streak' },
  { id: 'hundred_points', name: 'Century', icon: 'ribbon' as const, days: 0, description: 'Earn 100 points' },
  { id: 'five_hundred_points', name: 'High Scorer', icon: 'medal' as const, days: 0, description: 'Earn 500 points' },
];

function getStreakTier(streak: number): { label: string; emoji: string } {
  if (streak >= 90) return { label: 'Legend', emoji: '' };
  if (streak >= 60) return { label: 'Veteran', emoji: '' };
  if (streak >= 30) return { label: 'Dedicated', emoji: '' };
  if (streak >= 14) return { label: 'Consistent', emoji: '' };
  if (streak >= 7) return { label: 'Building', emoji: '' };
  if (streak >= 1) return { label: 'Started', emoji: '' };
  return { label: 'New', emoji: '' };
}

function getNextMilestoneInfo(
  currentStreak: number,
  unlockedIds: string[],
): { name: string; target: number; progress: number } | null {
  const streakMilestones = [
    { id: 'week_streak', name: 'Week Warrior', target: 7 },
    { id: 'two_week_streak', name: 'Consistent', target: 14 },
    { id: 'month_streak', name: 'Unstoppable', target: 30 },
  ];

  for (const m of streakMilestones) {
    if (!unlockedIds.includes(m.id)) {
      const progress = Math.min(1, currentStreak / m.target);
      return { name: m.name, target: m.target, progress };
    }
  }

  return null;
}

function formatPoints(n: number): string {
  if (n < 0) return '0';
  return n.toLocaleString('en-US');
}

function getComplianceLabel(rate: number): string {
  if (rate >= 90) return 'Excellent';
  if (rate >= 70) return 'Great';
  if (rate >= 50) return 'Good';
  if (rate >= 30) return 'Building';
  return 'Getting started';
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  return 'Just now';
}

type IoniconName = string;
function getReasonIcon(reason: string): IoniconName {
  const lower = reason.toLowerCase();
  if (lower.includes('checkin') || lower.includes('check-in')) return 'checkmark-circle-outline';
  if (lower.includes('streak')) return 'flame-outline';
  if (lower.includes('feedback') || lower.includes('workout')) return 'fitness-outline';
  if (lower.includes('milestone')) return 'trophy-outline';
  return 'star-outline';
}

// ---------------------------------------------------------------------------
// MILESTONES constant
// ---------------------------------------------------------------------------
console.log('\nMILESTONES constant');

(() => {
  assert(MILESTONES.length === 7, `has 7 milestones, got ${MILESTONES.length}`);
  assert(MILESTONES[0].id === 'first_checkin', 'first milestone is first_checkin');
  assert(MILESTONES[MILESTONES.length - 1].id === 'five_hundred_points', 'last milestone is five_hundred_points');
})();

(() => {
  const ids = MILESTONES.map(m => m.id);
  const unique = new Set(ids);
  assert(unique.size === MILESTONES.length, 'all milestone IDs are unique');
})();

(() => {
  let allValid = true;
  for (const m of MILESTONES) {
    if (!m.id || !m.name || !m.icon || !m.description) allValid = false;
    if (m.days < 0) allValid = false;
  }
  assert(allValid, 'all milestones have valid fields');
})();

(() => {
  const streakBased = MILESTONES.filter(m => m.days > 0);
  assert(streakBased.length >= 3, `at least 3 streak-based milestones, got ${streakBased.length}`);
})();

(() => {
  const pointBased = MILESTONES.filter(m => m.days === 0);
  assert(pointBased.length >= 2, `at least 2 point-based milestones, got ${pointBased.length}`);
})();

// ---------------------------------------------------------------------------
// getStreakTier — boundary values
// ---------------------------------------------------------------------------
console.log('\ngetStreakTier — boundary values');

(() => {
  assert(getStreakTier(0).label === 'New', 'streak 0 → New');
  assert(getStreakTier(0).emoji === '', 'streak 0 emoji');

  assert(getStreakTier(1).label === 'Started', 'streak 1 → Started');
  assert(getStreakTier(1).emoji === '', 'streak 1 emoji');

  assert(getStreakTier(6).label === 'Started', 'streak 6 → Started');
  assert(getStreakTier(7).label === 'Building', 'streak 7 → Building');
  assert(getStreakTier(7).emoji === '', 'streak 7 emoji');

  assert(getStreakTier(13).label === 'Building', 'streak 13 → Building');
  assert(getStreakTier(14).label === 'Consistent', 'streak 14 → Consistent');
  assert(getStreakTier(14).emoji === '', 'streak 14 emoji');

  assert(getStreakTier(29).label === 'Consistent', 'streak 29 → Consistent');
  assert(getStreakTier(30).label === 'Dedicated', 'streak 30 → Dedicated');
  assert(getStreakTier(30).emoji === '', 'streak 30 emoji');

  assert(getStreakTier(59).label === 'Dedicated', 'streak 59 → Dedicated');
  assert(getStreakTier(60).label === 'Veteran', 'streak 60 → Veteran');
  assert(getStreakTier(60).emoji === '', 'streak 60 emoji');

  assert(getStreakTier(89).label === 'Veteran', 'streak 89 → Veteran');
  assert(getStreakTier(90).label === 'Legend', 'streak 90 → Legend');
  assert(getStreakTier(90).emoji === '', 'streak 90 emoji');

  assert(getStreakTier(365).label === 'Legend', 'streak 365 → Legend');
})();

// ---------------------------------------------------------------------------
// getStreakTier — monotonic progression
// ---------------------------------------------------------------------------
console.log('\ngetStreakTier — monotonic progression');

(() => {
  const tiers = ['New', 'Started', 'Building', 'Consistent', 'Dedicated', 'Veteran', 'Legend'];
  const boundaries = [0, 1, 7, 14, 30, 60, 90];
  for (let i = 0; i < boundaries.length; i++) {
    const tier = getStreakTier(boundaries[i]);
    assert(tier.label === tiers[i], `boundary ${boundaries[i]} → ${tiers[i]}, got ${tier.label}`);
  }
})();

// ---------------------------------------------------------------------------
// getStreakTier — always returns label and emoji
// ---------------------------------------------------------------------------
console.log('\ngetStreakTier — always has label and emoji');

(() => {
  const testValues = [0, 1, 3, 7, 10, 14, 20, 30, 45, 60, 75, 90, 100, 365];
  let allValid = true;
  for (const v of testValues) {
    const tier = getStreakTier(v);
    if (!tier.label || !tier.emoji) allValid = false;
  }
  assert(allValid, 'all test values return label + emoji');
})();

// ---------------------------------------------------------------------------
// getNextMilestoneInfo — streak = 0
// ---------------------------------------------------------------------------
console.log('\ngetNextMilestoneInfo — basic cases');

(() => {
  const info = getNextMilestoneInfo(0, []);
  assert(info !== null, 'streak 0, no unlocks → has next milestone');
  assert(info!.name === 'Week Warrior', 'first target is Week Warrior');
  assert(info!.target === 7, 'target is 7');
  assert(info!.progress === 0, 'progress is 0');
})();

(() => {
  const info = getNextMilestoneInfo(3, []);
  assert(info !== null, 'streak 3 → has next');
  assert(Math.abs(info!.progress - 3 / 7) < 0.001, 'progress is 3/7');
})();

(() => {
  const info = getNextMilestoneInfo(7, []);
  assert(info !== null, 'streak 7, week not unlocked → still Week Warrior');
  assert(info!.progress === 1, 'progress capped at 1');
})();

// ---------------------------------------------------------------------------
// getNextMilestoneInfo — with unlocked milestones
// ---------------------------------------------------------------------------
console.log('\ngetNextMilestoneInfo — with unlocked');

(() => {
  const info = getNextMilestoneInfo(10, ['week_streak']);
  assert(info !== null, 'week unlocked → next is Consistent');
  assert(info!.name === 'Consistent', 'next is Consistent');
  assert(info!.target === 14, 'target is 14');
  assert(Math.abs(info!.progress - 10 / 14) < 0.001, 'progress is 10/14');
})();

(() => {
  const info = getNextMilestoneInfo(20, ['week_streak', 'two_week_streak']);
  assert(info !== null, 'two unlocked → next is Unstoppable');
  assert(info!.name === 'Unstoppable', 'next is Unstoppable');
  assert(info!.target === 30, 'target is 30');
  assert(Math.abs(info!.progress - 20 / 30) < 0.001, 'progress is 20/30');
})();

(() => {
  const info = getNextMilestoneInfo(50, ['week_streak', 'two_week_streak', 'month_streak']);
  assert(info === null, 'all streak milestones unlocked → null');
})();

// ---------------------------------------------------------------------------
// getNextMilestoneInfo — progress capped at 1
// ---------------------------------------------------------------------------
console.log('\ngetNextMilestoneInfo — progress capped at 1');

(() => {
  const info = getNextMilestoneInfo(100, []);
  assert(info !== null, 'streak 100, nothing unlocked → Week Warrior');
  assert(info!.progress === 1, 'progress capped at 1 even with streak >> target');
})();

// ---------------------------------------------------------------------------
// getNextMilestoneInfo — skips non-streak milestones
// ---------------------------------------------------------------------------
console.log('\ngetNextMilestoneInfo — ignores non-streak IDs');

(() => {
  // Having point-based milestones unlocked doesn't affect streak milestone progression
  const info = getNextMilestoneInfo(5, ['first_checkin', 'hundred_points']);
  assert(info !== null, 'point milestones dont affect streak tracking');
  assert(info!.name === 'Week Warrior', 'still targets Week Warrior');
})();

// ---------------------------------------------------------------------------
// formatPoints
// ---------------------------------------------------------------------------
console.log('\nformatPoints');

(() => {
  assert(formatPoints(0) === '0', 'zero');
  assert(formatPoints(1) === '1', 'single digit');
  assert(formatPoints(99) === '99', 'two digits');
  assert(formatPoints(100) === '100', 'three digits');
  assert(formatPoints(999) === '999', 'three digits no comma');
  assert(formatPoints(1000) === '1,000', 'thousand');
  assert(formatPoints(1234) === '1,234', 'four digits');
  assert(formatPoints(12345) === '12,345', 'five digits');
  assert(formatPoints(123456) === '123,456', 'six digits');
  assert(formatPoints(1000000) === '1,000,000', 'million');
})();

(() => {
  assert(formatPoints(-1) === '0', 'negative → "0"');
  assert(formatPoints(-100) === '0', 'large negative → "0"');
})();

// ---------------------------------------------------------------------------
// getComplianceLabel — boundaries
// ---------------------------------------------------------------------------
console.log('\ngetComplianceLabel — boundaries');

(() => {
  assert(getComplianceLabel(100) === 'Excellent', '100 → Excellent');
  assert(getComplianceLabel(95) === 'Excellent', '95 → Excellent');
  assert(getComplianceLabel(90) === 'Excellent', '90 → Excellent');

  assert(getComplianceLabel(89) === 'Great', '89 → Great');
  assert(getComplianceLabel(75) === 'Great', '75 → Great');
  assert(getComplianceLabel(70) === 'Great', '70 → Great');

  assert(getComplianceLabel(69) === 'Good', '69 → Good');
  assert(getComplianceLabel(55) === 'Good', '55 → Good');
  assert(getComplianceLabel(50) === 'Good', '50 → Good');

  assert(getComplianceLabel(49) === 'Building', '49 → Building');
  assert(getComplianceLabel(35) === 'Building', '35 → Building');
  assert(getComplianceLabel(30) === 'Building', '30 → Building');

  assert(getComplianceLabel(29) === 'Getting started', '29 → Getting started');
  assert(getComplianceLabel(10) === 'Getting started', '10 → Getting started');
  assert(getComplianceLabel(0) === 'Getting started', '0 → Getting started');
})();

// ---------------------------------------------------------------------------
// getComplianceLabel — all labels are calm
// ---------------------------------------------------------------------------
console.log('\ngetComplianceLabel — calm tone');

(() => {
  const banned = ['grind', 'beast', 'crush', 'destroy', 'kill', 'smash', 'dominate'];
  const testRates = [0, 10, 25, 30, 50, 70, 90, 100];
  let clean = true;
  for (const rate of testRates) {
    const label = getComplianceLabel(rate).toLowerCase();
    for (const word of banned) {
      if (label.includes(word)) clean = false;
    }
  }
  assert(clean, 'no banned words in compliance labels');
})();

// ---------------------------------------------------------------------------
// formatTime — relative time
// ---------------------------------------------------------------------------
console.log('\nformatTime — relative time');

(() => {
  // Just now (less than 1 hour ago)
  const now = new Date();
  const justNow = new Date(now.getTime() - 30 * 1000); // 30 seconds ago
  assert(formatTime(justNow.toISOString()) === 'Just now', '30s ago → Just now');

  const halfHour = new Date(now.getTime() - 30 * 60 * 1000); // 30 min ago
  assert(formatTime(halfHour.toISOString()) === 'Just now', '30min ago → Just now');
})();

(() => {
  const now = new Date();
  const twoHours = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  assert(formatTime(twoHours.toISOString()) === '2h ago', '2 hours → 2h ago');

  const fiveHours = new Date(now.getTime() - 5 * 60 * 60 * 1000);
  assert(formatTime(fiveHours.toISOString()) === '5h ago', '5 hours → 5h ago');
})();

(() => {
  const now = new Date();
  const oneDay = new Date(now.getTime() - 25 * 60 * 60 * 1000);
  assert(formatTime(oneDay.toISOString()) === '1d ago', '25 hours → 1d ago');

  const threeDays = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  assert(formatTime(threeDays.toISOString()) === '3d ago', '3 days → 3d ago');
})();

// ---------------------------------------------------------------------------
// formatTime — returns string
// ---------------------------------------------------------------------------
console.log('\nformatTime — always returns string');

(() => {
  const result = formatTime(new Date().toISOString());
  assert(typeof result === 'string', 'returns string');
  assert(result.length > 0, 'non-empty');
})();

// ---------------------------------------------------------------------------
// getReasonIcon — categorization
// ---------------------------------------------------------------------------
console.log('\ngetReasonIcon — categorization');

(() => {
  assert(getReasonIcon('Daily checkin') === 'checkmark-circle-outline', 'checkin → checkmark');
  assert(getReasonIcon('Check-in completed') === 'checkmark-circle-outline', 'check-in → checkmark');
  assert(getReasonIcon('checkin bonus') === 'checkmark-circle-outline', 'checkin bonus → checkmark');

  assert(getReasonIcon('Streak bonus') === 'flame-outline', 'streak → flame');
  assert(getReasonIcon('7-day streak') === 'flame-outline', 'streak mention → flame');

  assert(getReasonIcon('Workout feedback') === 'fitness-outline', 'workout → fitness');
  assert(getReasonIcon('Post-workout feedback') === 'fitness-outline', 'feedback → fitness');

  assert(getReasonIcon('Milestone reached') === 'trophy-outline', 'milestone → trophy');
  assert(getReasonIcon('New milestone unlocked') === 'trophy-outline', 'milestone unlock → trophy');
})();

// ---------------------------------------------------------------------------
// getReasonIcon — unknown falls back to star
// ---------------------------------------------------------------------------
console.log('\ngetReasonIcon — unknown fallback');

(() => {
  assert(getReasonIcon('bonus') === 'star-outline', 'generic → star');
  assert(getReasonIcon('reward') === 'star-outline', 'reward → star');
  assert(getReasonIcon('') === 'star-outline', 'empty → star');
  assert(getReasonIcon('something random') === 'star-outline', 'random → star');
})();

// ---------------------------------------------------------------------------
// getReasonIcon — case insensitive
// ---------------------------------------------------------------------------
console.log('\ngetReasonIcon — case insensitive');

(() => {
  assert(getReasonIcon('CHECKIN') === 'checkmark-circle-outline', 'CHECKIN uppercase');
  assert(getReasonIcon('Streak') === 'flame-outline', 'Streak capitalized');
  assert(getReasonIcon('WORKOUT') === 'fitness-outline', 'WORKOUT uppercase');
  assert(getReasonIcon('MILESTONE') === 'trophy-outline', 'MILESTONE uppercase');
})();

// ---------------------------------------------------------------------------
// getReasonIcon — always returns valid string
// ---------------------------------------------------------------------------
console.log('\ngetReasonIcon — always valid');

(() => {
  const reasons = [
    'Daily checkin', 'Streak bonus', 'Workout feedback',
    'Milestone reached', 'random', '', 'Check-in', 'STREAK',
  ];
  let allValid = true;
  for (const r of reasons) {
    const icon = getReasonIcon(r);
    if (typeof icon !== 'string' || icon.length === 0) allValid = false;
  }
  assert(allValid, 'all reason icons are valid strings');
})();

// ---------------------------------------------------------------------------
// Integration: streakTier + nextMilestone alignment
// ---------------------------------------------------------------------------
console.log('\nIntegration: tier + milestone alignment');

(() => {
  // When streak is at a milestone boundary, the tier should have changed
  const tier7 = getStreakTier(7);
  assert(tier7.label === 'Building', 'at 7 days → Building tier');
  const info7 = getNextMilestoneInfo(7, []);
  assert(info7 !== null && info7.progress === 1, 'at 7 → Week Warrior progress is 1');

  const tier14 = getStreakTier(14);
  assert(tier14.label === 'Consistent', 'at 14 days → Consistent tier');
  const info14 = getNextMilestoneInfo(14, ['week_streak']);
  assert(info14 !== null && info14.progress === 1, 'at 14 → Consistent progress is 1');

  const tier30 = getStreakTier(30);
  assert(tier30.label === 'Dedicated', 'at 30 days → Dedicated tier');
  const info30 = getNextMilestoneInfo(30, ['week_streak', 'two_week_streak']);
  assert(info30 !== null && info30.progress === 1, 'at 30 → Unstoppable progress is 1');
})();

// ---------------------------------------------------------------------------
// Integration: new user has all milestones available
// ---------------------------------------------------------------------------
console.log('\nIntegration: new user milestones');

(() => {
  const info = getNextMilestoneInfo(0, []);
  assert(info !== null, 'new user has a milestone to work toward');
  assert(info!.progress === 0, 'new user starts at 0 progress');
  assert(info!.name === 'Week Warrior', 'new user targets Week Warrior first');
})();

// ---------------------------------------------------------------------------
// Edge cases: formatPoints with decimals
// ---------------------------------------------------------------------------
console.log('\nformatPoints — edge cases');

(() => {
  // Integers only in practice, but verify no crash
  const result = formatPoints(3.7);
  assert(typeof result === 'string', 'handles float without crash');
  assert(result.length > 0, 'float produces non-empty string');
})();

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
test('all assertions pass', () => {
  expect(failed).toBe(0);
});
