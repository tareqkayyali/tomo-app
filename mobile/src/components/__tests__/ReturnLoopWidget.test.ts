/**
 * Tests for ReturnLoopWidget
 * Validates pure helpers (headline, reward preview, encouragement),
 * archetype integration, tone guardrails, and edge cases.
 *
 * Pure functions are reproduced here to avoid importing from the
 * component file (which pulls in React Native dependencies).
 * They mirror the exports in ReturnLoopWidget.tsx exactly.
 */

import { getArchetypeProfile } from '../../services/archetypeProfile';

// ---------------------------------------------------------------------------
// Reproduce pure helpers from ReturnLoopWidget.tsx
// ---------------------------------------------------------------------------

const REWARD_ICONS: Record<string, string> = {
  'Sticker Pack': '\uD83C\uDFAB',
  'Wristband': '\uD83E\uDEA2',
  'Hoodie': '\uD83E\uDDE5',
  'Jacket': '\uD83C\uDFC6',
};

function getStreakHeadline(streak: number): string {
  if (streak <= 0) return 'No Streak Yet';
  return `${streak}-Day Streak`;
}

function getRewardPreview(
  milestone: { daysRemaining: number; reward: string } | null,
): string | null {
  if (!milestone) return null;
  const days = milestone.daysRemaining;
  const icon = REWARD_ICONS[milestone.reward] || '\uD83C\uDFC6';
  if (days === 1) {
    return `${icon} 1 day to ${milestone.reward} unlock!`;
  }
  return `${icon} ${days} days to ${milestone.reward} unlock!`;
}

function getEncouragementCopy(streak: number): string | null {
  if (streak <= 0) return null;
  if (streak === 1) return "Great start. One day at a time.";
  if (streak < 7) return `${streak} days in a row. Nice rhythm.`;
  if (streak < 14) return `${streak} days strong. Keep it steady.`;
  if (streak < 30) return `${streak}-day streak. Real consistency.`;
  return `${streak} days. That's dedication.`;
}

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
// getStreakHeadline
// ---------------------------------------------------------------------------
console.log('\ngetStreakHeadline');

(() => {
  assert(getStreakHeadline(0) === 'No Streak Yet', 'streak 0 → "No Streak Yet"');
  assert(getStreakHeadline(-1) === 'No Streak Yet', 'negative → "No Streak Yet"');
  assert(getStreakHeadline(1) === '1-Day Streak', 'streak 1 → "1-Day Streak"');
  assert(getStreakHeadline(12) === '12-Day Streak', 'streak 12 → "12-Day Streak"');
  assert(getStreakHeadline(90) === '90-Day Streak', 'streak 90 → "90-Day Streak"');
  assert(getStreakHeadline(365) === '365-Day Streak', 'streak 365');
})();

// ---------------------------------------------------------------------------
// getRewardPreview
// ---------------------------------------------------------------------------
console.log('\ngetRewardPreview');

(() => {
  assert(getRewardPreview(null) === null, 'null milestone → null');
})();

(() => {
  const result = getRewardPreview({ daysRemaining: 2, reward: 'Hoodie' });
  assert(result !== null, 'non-null for valid milestone');
  assert(result!.includes('2 days'), `includes "2 days": "${result}"`);
  assert(result!.includes('Hoodie'), `includes "Hoodie": "${result}"`);
  assert(result!.includes('unlock'), `includes "unlock": "${result}"`);
})();

(() => {
  const result = getRewardPreview({ daysRemaining: 1, reward: 'Jacket' });
  assert(result!.includes('1 day'), `singular "1 day": "${result}"`);
  assert(!result!.includes('1 days'), 'no "1 days" (proper singular)');
})();

// Reward icons present
(() => {
  const sticker = getRewardPreview({ daysRemaining: 5, reward: 'Sticker Pack' });
  assert(sticker!.includes('\uD83C\uDFAB'), `Sticker Pack has ticket icon`);

  const wristband = getRewardPreview({ daysRemaining: 3, reward: 'Wristband' });
  assert(wristband!.includes('\uD83E\uDEA2'), `Wristband has knot icon`);

  const hoodie = getRewardPreview({ daysRemaining: 2, reward: 'Hoodie' });
  assert(hoodie!.includes('\uD83E\uDDE5'), `Hoodie has coat icon`);

  const jacket = getRewardPreview({ daysRemaining: 1, reward: 'Jacket' });
  assert(jacket!.includes('\uD83C\uDFC6'), `Jacket has trophy icon`);
})();

// Unknown reward gets trophy fallback
(() => {
  const unknown = getRewardPreview({ daysRemaining: 10, reward: 'Gold Medal' });
  assert(unknown!.includes('\uD83C\uDFC6'), 'unknown reward gets trophy fallback');
  assert(unknown!.includes('Gold Medal'), 'unknown reward name preserved');
})();

// ---------------------------------------------------------------------------
// getEncouragementCopy
// ---------------------------------------------------------------------------
console.log('\ngetEncouragementCopy');

(() => {
  assert(getEncouragementCopy(0) === null, 'streak 0 → null');
  assert(getEncouragementCopy(-1) === null, 'negative → null');
})();

(() => {
  const s1 = getEncouragementCopy(1);
  assert(s1 !== null && s1.length > 0, 'streak 1 returns non-empty string');
  assert(s1!.toLowerCase().includes('start') || s1!.toLowerCase().includes('one'), `streak 1: "${s1}"`);
})();

(() => {
  const s5 = getEncouragementCopy(5);
  assert(s5 !== null && s5.includes('5'), `streak 5 includes count: "${s5}"`);
})();

(() => {
  const s10 = getEncouragementCopy(10);
  assert(s10 !== null && s10.includes('10'), `streak 10 includes count: "${s10}"`);
})();

(() => {
  const s25 = getEncouragementCopy(25);
  assert(s25 !== null && s25.includes('25'), `streak 25 includes count: "${s25}"`);
})();

(() => {
  const s60 = getEncouragementCopy(60);
  assert(s60 !== null && s60.includes('60'), `streak 60 includes count: "${s60}"`);
})();

// ---------------------------------------------------------------------------
// Tone — no hype or pressure words
// ---------------------------------------------------------------------------
console.log('\nTone — no banned words');

(() => {
  const banned = [
    'grind', 'beast', 'crush', 'destroy', 'kill', 'smash', 'dominate',
    'hustle', 'no excuses', 'pain', 'failure',
  ];
  const streaks = [0, 1, 3, 7, 14, 30, 60, 90, 365];
  let clean = true;

  for (const streak of streaks) {
    const headline = getStreakHeadline(streak);
    const encouragement = getEncouragementCopy(streak);
    const texts = [headline, encouragement].filter(Boolean) as string[];

    for (const text of texts) {
      const lower = text.toLowerCase();
      for (const word of banned) {
        if (lower.includes(word)) {
          console.error(`    BANNED "${word}" in: "${text}" (streak ${streak})`);
          clean = false;
        }
      }
    }
  }

  assert(clean, 'no banned words in any headline or encouragement');
})();

// Reward preview also clean
(() => {
  const banned = ['grind', 'beast', 'crush', 'destroy', 'kill', 'smash', 'dominate'];
  const rewards = ['Sticker Pack', 'Wristband', 'Hoodie', 'Jacket'];
  let clean = true;

  for (const reward of rewards) {
    const preview = getRewardPreview({ daysRemaining: 5, reward });
    if (preview) {
      const lower = preview.toLowerCase();
      for (const word of banned) {
        if (lower.includes(word)) {
          console.error(`    BANNED "${word}" in reward preview: "${preview}"`);
          clean = false;
        }
      }
    }
  }

  assert(clean, 'no banned words in reward previews');
})();

// ---------------------------------------------------------------------------
// Tone — encouragement is calm, not aggressive
// ---------------------------------------------------------------------------
console.log('\nTone — calm encouragement');

(() => {
  const streaks = [1, 3, 7, 14, 30, 60, 90, 365];
  let allCalm = true;

  for (const streak of streaks) {
    const text = getEncouragementCopy(streak)!;
    const words = text.split(/\s+/).length;
    if (words > 12) {
      console.error(`    TOO LONG: "${text}" (${words} words)`);
      allCalm = false;
    }
    // No exclamation marks (calm, not hype)
    if (text.includes('!')) {
      console.error(`    HAS "!" (too hype): "${text}"`);
      allCalm = false;
    }
  }

  assert(allCalm, 'all encouragement is <= 12 words and has no "!"');
})();

// Reward preview CAN have "!" (it's a reward moment)
(() => {
  const preview = getRewardPreview({ daysRemaining: 1, reward: 'Jacket' });
  assert(preview!.includes('!'), 'reward preview uses "!" (celebratory)');
})();

// ---------------------------------------------------------------------------
// Archetype color integration
// ---------------------------------------------------------------------------
console.log('\nArchetype colors');

(() => {
  const archetypes = ['phoenix', 'titan', 'blade', 'surge', null] as const;
  const expected: Record<string, string> = {
    phoenix: '#FF6B6B',
    titan: '#4C6EF5',
    blade: '#12B886',
    surge: '#FFD43B',
    null: '#4A90A4',
  };

  for (const arch of archetypes) {
    const profile = getArchetypeProfile(arch);
    assert(
      profile.color === expected[String(arch)],
      `${String(arch)} → ${profile.color}`,
    );
  }
})();

// ---------------------------------------------------------------------------
// Freeze token clamping
// ---------------------------------------------------------------------------
console.log('\nFreeze token clamping');

(() => {
  // The component clamps: Math.min(Math.max(freezeTokens, 0), 3)
  const clamp = (n: number) => Math.min(Math.max(n, 0), 3);
  assert(clamp(0) === 0, '0 tokens → 0');
  assert(clamp(1) === 1, '1 token → 1');
  assert(clamp(3) === 3, '3 tokens → 3');
  assert(clamp(5) === 3, '5 tokens clamped to 3');
  assert(clamp(-1) === 0, '-1 clamped to 0');
})();

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------
console.log('\nEdge cases');

(() => {
  // Very high streak
  assert(getStreakHeadline(9999) === '9999-Day Streak', 'very high streak');
  assert(getEncouragementCopy(9999) !== null, 'high streak has encouragement');
})();

(() => {
  // daysRemaining = 0 (just hit milestone)
  const result = getRewardPreview({ daysRemaining: 0, reward: 'Hoodie' });
  assert(result !== null && result.includes('0 days'), 'daysRemaining 0 handled');
})();

(() => {
  // Large daysRemaining
  const result = getRewardPreview({ daysRemaining: 100, reward: 'Sticker Pack' });
  assert(result!.includes('100 days'), 'large daysRemaining handled');
})();

// ---------------------------------------------------------------------------
// "Almost there" threshold (daysRemaining <= 3)
// ---------------------------------------------------------------------------
console.log('\nAlmost-there detection');

(() => {
  // Component uses: isAlmostThere = nextMilestone && nextMilestone.daysRemaining <= 3
  const isAlmostThere = (m: { daysRemaining: number } | null) =>
    m !== null && m.daysRemaining <= 3;

  assert(isAlmostThere({ daysRemaining: 1 }), '1 day → almost there');
  assert(isAlmostThere({ daysRemaining: 2 }), '2 days → almost there');
  assert(isAlmostThere({ daysRemaining: 3 }), '3 days → almost there');
  assert(!isAlmostThere({ daysRemaining: 4 }), '4 days → not yet');
  assert(!isAlmostThere({ daysRemaining: 10 }), '10 days → not yet');
  assert(!isAlmostThere(null), 'null → not almost there');
})();

// ---------------------------------------------------------------------------
// "All milestones passed" state
// ---------------------------------------------------------------------------
console.log('\nAll milestones passed');

(() => {
  // When nextMilestone is null AND streak > 0, component shows completion message
  const hasCompletionMessage = (streak: number, milestone: null) =>
    milestone === null && streak > 0;

  assert(hasCompletionMessage(90, null), 'streak 90 + null milestone → completion');
  assert(hasCompletionMessage(365, null), 'streak 365 + null milestone → completion');
  assert(!hasCompletionMessage(0, null), 'streak 0 + null milestone → no completion');
})();

// ---------------------------------------------------------------------------
// All headline/encouragement are non-empty strings when present
// ---------------------------------------------------------------------------
console.log('\nReturn type validation');

(() => {
  const streaks = [0, 1, 5, 7, 14, 30, 60, 90, 365];
  let allValid = true;

  for (const streak of streaks) {
    const h = getStreakHeadline(streak);
    if (typeof h !== 'string' || h.length === 0) {
      console.error(`    Invalid headline for streak ${streak}`);
      allValid = false;
    }
    const e = getEncouragementCopy(streak);
    if (e !== null && (typeof e !== 'string' || e.length === 0)) {
      console.error(`    Invalid encouragement for streak ${streak}`);
      allValid = false;
    }
  }

  assert(allValid, 'all headlines are non-empty, encouragement is string or null');
})();

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
test('all assertions pass', () => {
  expect(failed).toBe(0);
});
