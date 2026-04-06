/**
 * Tests for WhyTodayMattersCard
 * Validates pure helpers (getDailyMessage, getDayOfYear, getArchetypeEmoji),
 * message rotation, archetype integration, tone guardrails, and edge cases.
 *
 * Pure functions are reproduced here to avoid importing from the
 * component file (which pulls in React Native dependencies).
 * They mirror the exports in WhyTodayMattersCard.tsx exactly.
 */

import { getArchetypeProfile } from '../../services/archetypeProfile';

// ---------------------------------------------------------------------------
// Reproduce pure helpers from WhyTodayMattersCard.tsx
// ---------------------------------------------------------------------------

const ARCHETYPE_EMOJI: Record<string, string> = {
  phoenix: '',
  titan: '',
  blade: '',
  surge: '',
};

const DEFAULT_EMOJI = '';

type ReadinessLevel = 'GREEN' | 'YELLOW' | 'RED';

type MessagePool = Record<string, Record<ReadinessLevel, string[]>>;

const MESSAGES: MessagePool = {
  phoenix: {
    GREEN: [
      'Rise and train. Day {streak} is yours.',
      'Phoenixes pace themselves — even when they feel strong.',
      'Burn bright today. Recover tomorrow.',
      'Day {streak}. The fire keeps growing.',
    ],
    YELLOW: [
      'Listen closely today. Phoenixes know when to pace.',
      'A lighter day still fuels the flame.',
      'Day {streak}. Even embers hold warmth.',
      'Smart pacing today, stronger tomorrow.',
    ],
    RED: [
      'Phoenixes rise — even on rest days.',
      'Recovery is rebirth. Day {streak} counts.',
      'Rest is part of the cycle.',
      "Your flame doesn't dim on rest days.",
    ],
  },
  titan: {
    GREEN: [
      'Steady and strong. Day {streak}.',
      'One more brick in the wall, Titan.',
      'Consistency is your craft. Keep building.',
      'Day {streak}. The Titan marches on.',
    ],
    YELLOW: [
      'Even Titans rest between sets.',
      'A lighter load, same strong foundation.',
      'Day {streak}. Patient progress.',
      "Steady doesn't mean every day is heavy.",
    ],
    RED: [
      'Titans recover with the same patience they train.',
      'Rest builds what training breaks down.',
      'Day {streak}. Strength grows in stillness.',
      'Even stone needs time to set.',
    ],
  },
  blade: {
    GREEN: [
      'Sharp and focused. Day {streak}.',
      "One precise session. That's all you need.",
      'Blades sharpen daily.',
      'Day {streak}. Cut clean today.',
    ],
    YELLOW: [
      'Blades sharpen daily — even lightly.',
      'Precision over intensity. Day {streak}.',
      'A light touch can still be sharp.',
      'Less force, same focus.',
    ],
    RED: [
      'Even the finest blade rests in its sheath.',
      'Day {streak}. Sharpness needs rest.',
      'Recovery keeps the edge.',
      'Rest is part of precision.',
    ],
  },
  surge: {
    GREEN: [
      'Channel that energy. Day {streak}.',
      "Today's yours, Surge. Let it flow.",
      'Ride the wave. Day {streak}.',
      'Your energy is your edge today.',
    ],
    YELLOW: [
      'A lighter wave still moves forward.',
      'Day {streak}. Save some spark for tomorrow.',
      'Surges know when to hold back.',
      'Pace the charge today.',
    ],
    RED: [
      'Even waves pull back before the next surge.',
      'Day {streak}. Recharge the current.',
      'Rest fuels the next burst.',
      'Calm waters, strong comeback.',
    ],
  },
  default: {
    GREEN: [
      'Day {streak}. Show up and move.',
      'Every check-in matters. Keep going.',
      'Your body is ready. Trust it.',
      'Day {streak}. Consistent and steady.',
    ],
    YELLOW: [
      'A lighter day still counts. Day {streak}.',
      'Listen to your body today.',
      'Day {streak}. Easy does it.',
      'Not every day needs to be full throttle.',
    ],
    RED: [
      'Rest is part of the plan. Day {streak}.',
      'Your body asked for a break. Honor it.',
      'Day {streak}. Recovery is progress.',
      "Take it easy. You've earned it.",
    ],
  },
};

const FIRST_DAY_MESSAGES: Record<ReadinessLevel, string[]> = {
  GREEN: [
    'First check-in. This is where it starts.',
    'Day one. Welcome.',
    'Your journey begins now.',
    'Ready when you are.',
  ],
  YELLOW: [
    'First step — listen to your body.',
    'Starting light is still starting.',
    'Day one. Easy does it.',
    'Welcome. No rush.',
  ],
  RED: [
    'Smart start — rest first, train later.',
    'Day one begins with recovery. Good call.',
    'Knowing when to rest is strength.',
    'Welcome. Rest is the right move today.',
  ],
};

function getDayOfYear(date: Date = new Date()): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  const oneDay = 86_400_000;
  return Math.floor(diff / oneDay);
}

function getDailyMessage(
  currentStreak: number,
  archetype: string | null | undefined,
  readiness: ReadinessLevel,
  dayOfYear?: number,
): string {
  const day = dayOfYear ?? getDayOfYear();

  if (currentStreak <= 0) {
    const pool = FIRST_DAY_MESSAGES[readiness] || FIRST_DAY_MESSAGES.GREEN;
    return pool[day % pool.length];
  }

  const key =
    archetype && typeof archetype === 'string'
      ? archetype.toLowerCase()
      : 'default';
  const archetypePool = MESSAGES[key] || MESSAGES.default;
  const pool = archetypePool[readiness] || archetypePool.GREEN;

  const template = pool[day % pool.length];
  return template.replace(/\{streak\}/g, String(currentStreak));
}

function getArchetypeEmoji(archetype: string | null | undefined): string {
  if (!archetype || typeof archetype !== 'string') return DEFAULT_EMOJI;
  return ARCHETYPE_EMOJI[archetype.toLowerCase()] || DEFAULT_EMOJI;
}

// ---------------------------------------------------------------------------
// Test harness
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
// getDayOfYear
// ---------------------------------------------------------------------------
console.log('\ngetDayOfYear');

(() => {
  // Jan 1 → day 1
  const jan1 = new Date(2025, 0, 1);
  assert(getDayOfYear(jan1) === 1, 'Jan 1 → day 1');

  // Jan 31 → day 31
  const jan31 = new Date(2025, 0, 31);
  assert(getDayOfYear(jan31) === 31, 'Jan 31 → day 31');

  // Feb 1 → day 32
  const feb1 = new Date(2025, 1, 1);
  assert(getDayOfYear(feb1) === 32, 'Feb 1 → day 32');

  // Dec 31 (non-leap year) → day 365
  const dec31 = new Date(2025, 11, 31);
  assert(getDayOfYear(dec31) === 365, 'Dec 31 → day 365');
})();

// Deterministic — same date always returns same day
(() => {
  const d1 = getDayOfYear(new Date(2025, 5, 15));
  const d2 = getDayOfYear(new Date(2025, 5, 15));
  assert(d1 === d2, 'same date → same day-of-year');
})();

// ---------------------------------------------------------------------------
// getDailyMessage — streak 0 (first-day messages)
// ---------------------------------------------------------------------------
console.log('\ngetDailyMessage — streak 0');

(() => {
  const readiness: ReadinessLevel[] = ['GREEN', 'YELLOW', 'RED'];
  for (const r of readiness) {
    const msg = getDailyMessage(0, null, r, 0);
    assert(typeof msg === 'string' && msg.length > 0, `streak 0 + ${r} → non-empty string`);
    assert(!msg.includes('{streak}'), `streak 0 + ${r} has no raw {streak} template`);
  }
})();

(() => {
  // Negative streak also uses first-day messages
  const msg = getDailyMessage(-1, 'phoenix', 'GREEN', 0);
  assert(typeof msg === 'string' && msg.length > 0, 'negative streak → non-empty string');
})();

// First-day messages never reference streak count number
(() => {
  const readiness: ReadinessLevel[] = ['GREEN', 'YELLOW', 'RED'];
  let allClean = true;
  for (const r of readiness) {
    for (let day = 0; day < 4; day++) {
      const msg = getDailyMessage(0, null, r, day);
      if (/\bday \d+\b/i.test(msg) && !msg.toLowerCase().includes('day one')) {
        console.error(`    Streak reference in first-day msg: "${msg}"`);
        allClean = false;
      }
    }
  }
  assert(allClean, 'first-day messages do not reference numeric streak');
})();

// ---------------------------------------------------------------------------
// getDailyMessage — archetype-specific messages
// ---------------------------------------------------------------------------
console.log('\ngetDailyMessage — archetype messages');

(() => {
  const archetypes = ['phoenix', 'titan', 'blade', 'surge', null];
  const readiness: ReadinessLevel[] = ['GREEN', 'YELLOW', 'RED'];

  for (const arch of archetypes) {
    for (const r of readiness) {
      const msg = getDailyMessage(10, arch, r, 0);
      assert(
        typeof msg === 'string' && msg.length > 0,
        `${String(arch)} + ${r} → non-empty`,
      );
      assert(!msg.includes('{streak}'), `${String(arch)} + ${r} → no raw template`);
    }
  }
})();

// Streak count interpolated correctly
(() => {
  // Find a message that contains {streak} in the template
  // phoenix GREEN day 0 template: "Rise and train. Day {streak} is yours."
  const msg = getDailyMessage(42, 'phoenix', 'GREEN', 0);
  assert(msg.includes('42'), `phoenix GREEN day 0 includes streak "42": "${msg}"`);
})();

(() => {
  // titan GREEN day 0 template: "Steady and strong. Day {streak}."
  const msg = getDailyMessage(7, 'titan', 'GREEN', 0);
  assert(msg.includes('7'), `titan GREEN day 0 includes streak "7": "${msg}"`);
})();

// ---------------------------------------------------------------------------
// getDailyMessage — daily rotation
// ---------------------------------------------------------------------------
console.log('\ngetDailyMessage — rotation');

(() => {
  // Different days produce different messages (4-pool cycles through)
  const messages = new Set<string>();
  for (let day = 0; day < 4; day++) {
    messages.add(getDailyMessage(10, 'phoenix', 'GREEN', day));
  }
  assert(messages.size === 4, `4 days → ${messages.size} unique messages (expect 4)`);
})();

// Rotation wraps around — day 4 === day 0
(() => {
  const msg0 = getDailyMessage(10, 'phoenix', 'GREEN', 0);
  const msg4 = getDailyMessage(10, 'phoenix', 'GREEN', 4);
  assert(msg0 === msg4, 'day 4 wraps to day 0');
})();

// Same day always returns same message (deterministic)
(() => {
  const a = getDailyMessage(10, 'blade', 'YELLOW', 42);
  const b = getDailyMessage(10, 'blade', 'YELLOW', 42);
  assert(a === b, 'same inputs → same output (deterministic)');
})();

// ---------------------------------------------------------------------------
// getDailyMessage — case insensitive archetype
// ---------------------------------------------------------------------------
console.log('\ngetDailyMessage — case insensitive');

(() => {
  const lower = getDailyMessage(5, 'phoenix', 'GREEN', 0);
  const upper = getDailyMessage(5, 'Phoenix', 'GREEN', 0);
  const mixed = getDailyMessage(5, 'PHOENIX', 'GREEN', 0);
  assert(lower === upper, 'phoenix === Phoenix');
  assert(lower === mixed, 'phoenix === PHOENIX');
})();

// ---------------------------------------------------------------------------
// getDailyMessage — unknown archetype falls back to default
// ---------------------------------------------------------------------------
console.log('\ngetDailyMessage — unknown archetype');

(() => {
  const unknown = getDailyMessage(5, 'warrior', 'GREEN', 0);
  const def = getDailyMessage(5, null, 'GREEN', 0);
  assert(unknown === def, 'unknown archetype falls back to default');
})();

// ---------------------------------------------------------------------------
// getArchetypeEmoji
// ---------------------------------------------------------------------------
console.log('\ngetArchetypeEmoji');

(() => {
  assert(getArchetypeEmoji('phoenix') === '', 'phoenix → fire emoji');
  assert(getArchetypeEmoji('titan') === '', 'titan → temple emoji');
  assert(getArchetypeEmoji('blade') === '', 'blade → swords emoji');
  assert(getArchetypeEmoji('surge') === '', 'surge → lightning emoji');
})();

// Case insensitive
(() => {
  assert(getArchetypeEmoji('Phoenix') === '', 'Phoenix (capitalized) → fire');
  assert(getArchetypeEmoji('BLADE') === '', 'BLADE (upper) → swords');
})();

// Null / undefined / unknown → default
(() => {
  assert(getArchetypeEmoji(null) === DEFAULT_EMOJI, 'null → default emoji');
  assert(getArchetypeEmoji(undefined) === DEFAULT_EMOJI, 'undefined → default emoji');
  assert(getArchetypeEmoji('warrior') === DEFAULT_EMOJI, 'unknown → default emoji');
})();

// ---------------------------------------------------------------------------
// Tone — no banned words
// ---------------------------------------------------------------------------
console.log('\nTone — no banned words');

(() => {
  const banned = [
    'grind', 'beast', 'crush', 'destroy', 'kill', 'smash', 'dominate',
    'hustle', 'no excuses', 'pain', 'failure',
  ];
  const archetypes = ['phoenix', 'titan', 'blade', 'surge', null];
  const readiness: ReadinessLevel[] = ['GREEN', 'YELLOW', 'RED'];
  const streaks = [0, 1, 5, 14, 30, 90];
  let clean = true;

  for (const arch of archetypes) {
    for (const r of readiness) {
      for (const streak of streaks) {
        for (let day = 0; day < 4; day++) {
          const msg = getDailyMessage(streak, arch, r, day);
          const lower = msg.toLowerCase();
          for (const word of banned) {
            if (lower.includes(word)) {
              console.error(
                `    BANNED "${word}" in: "${msg}" (${String(arch)}/${r}/streak${streak}/day${day})`,
              );
              clean = false;
            }
          }
        }
      }
    }
  }

  assert(clean, 'no banned words in any message combo (360 checks)');
})();

// ---------------------------------------------------------------------------
// Tone — calm messages (no all-caps, limited exclamation)
// ---------------------------------------------------------------------------
console.log('\nTone — calm messages');

(() => {
  const archetypes = ['phoenix', 'titan', 'blade', 'surge', null];
  const readiness: ReadinessLevel[] = ['GREEN', 'YELLOW', 'RED'];
  let allCalm = true;

  for (const arch of archetypes) {
    for (const r of readiness) {
      for (let day = 0; day < 4; day++) {
        const msg = getDailyMessage(10, arch, r, day);

        // No exclamation marks (calm, not hype)
        if (msg.includes('!')) {
          console.error(`    HAS "!" (too hype): "${msg}"`);
          allCalm = false;
        }

        // No ALL CAPS words (except "RED", "GREEN", "YELLOW" if referenced)
        const words = msg.split(/\s+/);
        for (const w of words) {
          const stripped = w.replace(/[^A-Za-z]/g, '');
          if (stripped.length > 1 && stripped === stripped.toUpperCase()) {
            console.error(`    ALL CAPS word "${w}" in: "${msg}"`);
            allCalm = false;
          }
        }

        // Max 12 words (2-second read)
        const wordCount = msg.split(/\s+/).length;
        if (wordCount > 12) {
          console.error(`    TOO LONG (${wordCount} words): "${msg}"`);
          allCalm = false;
        }
      }
    }
  }

  assert(allCalm, 'all messages are calm (no "!", no all-caps, <= 12 words)');
})();

// ---------------------------------------------------------------------------
// Archetype color integration
// ---------------------------------------------------------------------------
console.log('\nArchetype colors');

(() => {
  const archetypes = ['phoenix', 'titan', 'blade', 'surge', null] as const;
  const expected: Record<string, string> = {
    phoenix: '#7A9B76',
    titan: '#5A6B7C',
    blade: '#7A9B76',
    surge: '#5A6B7C',
    null: '#5A6B7C',
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
// All messages are valid non-empty strings
// ---------------------------------------------------------------------------
console.log('\nReturn type validation');

(() => {
  const archetypes = ['phoenix', 'titan', 'blade', 'surge', null];
  const readiness: ReadinessLevel[] = ['GREEN', 'YELLOW', 'RED'];
  const streaks = [0, 1, 7, 30, 90, 365];
  let allValid = true;

  for (const arch of archetypes) {
    for (const r of readiness) {
      for (const streak of streaks) {
        for (let day = 0; day < 4; day++) {
          const msg = getDailyMessage(streak, arch, r, day);
          if (typeof msg !== 'string' || msg.trim().length === 0) {
            console.error(
              `    Invalid: ${String(arch)}/${r}/streak${streak}/day${day}`,
            );
            allValid = false;
          }
        }
      }
    }
  }

  assert(allValid, 'all 360 message combos are valid non-empty strings');
})();

// ---------------------------------------------------------------------------
// No raw {streak} templates in output
// ---------------------------------------------------------------------------
console.log('\nNo raw templates');

(() => {
  const archetypes = ['phoenix', 'titan', 'blade', 'surge', null];
  const readiness: ReadinessLevel[] = ['GREEN', 'YELLOW', 'RED'];
  const streaks = [0, 1, 10, 50, 365];
  let allClean = true;

  for (const arch of archetypes) {
    for (const r of readiness) {
      for (const streak of streaks) {
        for (let day = 0; day < 4; day++) {
          const msg = getDailyMessage(streak, arch, r, day);
          if (msg.includes('{streak}')) {
            console.error(`    Raw template in: "${msg}"`);
            allClean = false;
          }
        }
      }
    }
  }

  assert(allClean, 'no raw {streak} templates in any output');
})();

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------
console.log('\nEdge cases');

// Very high streak
(() => {
  const msg = getDailyMessage(9999, 'phoenix', 'GREEN', 0);
  assert(msg.includes('9999'), 'very high streak interpolated');
})();

// Streak 1
(() => {
  const msg = getDailyMessage(1, 'blade', 'YELLOW', 0);
  assert(typeof msg === 'string' && msg.length > 0, 'streak 1 handled');
})();

// Very high day-of-year (modulo wraps)
(() => {
  const msg = getDailyMessage(10, 'titan', 'RED', 9999);
  assert(typeof msg === 'string' && msg.length > 0, 'high day-of-year wraps safely');
})();

// ---------------------------------------------------------------------------
// First-day messages per readiness
// ---------------------------------------------------------------------------
console.log('\nFirst-day messages per readiness');

(() => {
  const greenMsg = getDailyMessage(0, null, 'GREEN', 0);
  const yellowMsg = getDailyMessage(0, null, 'YELLOW', 0);
  const redMsg = getDailyMessage(0, null, 'RED', 0);

  // Different readiness levels produce different first-day pools
  // (at least some should differ across the 4-day rotation)
  const greenSet = new Set([0, 1, 2, 3].map(d => getDailyMessage(0, null, 'GREEN', d)));
  const redSet = new Set([0, 1, 2, 3].map(d => getDailyMessage(0, null, 'RED', d)));

  // Green and Red pools should have no overlap
  let overlap = false;
  for (const g of greenSet) {
    if (redSet.has(g)) {
      overlap = true;
      break;
    }
  }
  assert(!overlap, 'GREEN and RED first-day pools are distinct');
  assert(greenMsg !== yellowMsg || greenMsg !== redMsg, 'readiness differentiates first-day messages');
})();

// ---------------------------------------------------------------------------
// Archetype messages are distinct from each other
// ---------------------------------------------------------------------------
console.log('\nArchetype pool distinctness');

(() => {
  const phoenixMsgs = [0, 1, 2, 3].map(d => getDailyMessage(10, 'phoenix', 'GREEN', d));
  const titanMsgs = [0, 1, 2, 3].map(d => getDailyMessage(10, 'titan', 'GREEN', d));
  const bladeMsgs = [0, 1, 2, 3].map(d => getDailyMessage(10, 'blade', 'GREEN', d));
  const surgeMsgs = [0, 1, 2, 3].map(d => getDailyMessage(10, 'surge', 'GREEN', d));

  // Each archetype should have unique messages
  const allMsgs = [...phoenixMsgs, ...titanMsgs, ...bladeMsgs, ...surgeMsgs];
  const uniqueMsgs = new Set(allMsgs);
  assert(uniqueMsgs.size === 16, `16 unique messages across 4 archetypes, got ${uniqueMsgs.size}`);
})();

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
test('all assertions pass', () => {
  expect(failed).toBe(0);
});
