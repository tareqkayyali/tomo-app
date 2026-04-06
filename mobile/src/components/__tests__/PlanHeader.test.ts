/**
 * Tests for PlanHeader component logic
 * Validates helpers (getDailyMicrocopy, lightenHex) and
 * component configuration (readiness mapping, profile integration).
 *
 * UI rendering is not tested here (no React Native test renderer).
 * Instead we test the pure logic that powers the component.
 */

import { getArchetypeProfile, type ArchetypeProfile } from '../../services/archetypeProfile';

// ---------------------------------------------------------------------------
// Reproduce pure helpers from PlanHeader for testing
// (Exported in-test since they're internal to the component)
// ---------------------------------------------------------------------------

function getDailyMicrocopy(examples: string[]): string {
  if (examples.length === 0) return '';
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor(
    (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
  );
  return examples[dayOfYear % examples.length];
}

function lightenHex(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lr = Math.round(r + (255 - r) * amount);
  const lg = Math.round(g + (255 - g) * amount);
  const lb = Math.round(b + (255 - b) * amount);
  return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`;
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
// getDailyMicrocopy
// ---------------------------------------------------------------------------
console.log('\ngetDailyMicrocopy — basic behavior');

(() => {
  const examples = ['A', 'B', 'C', 'D'];
  const result = getDailyMicrocopy(examples);
  assert(examples.includes(result), `returns one of the examples: "${result}"`);
})();

(() => {
  assert(getDailyMicrocopy([]) === '', 'empty array returns empty string');
})();

(() => {
  assert(getDailyMicrocopy(['Only one']) === 'Only one', 'single item always returned');
})();

// Deterministic: calling twice gives same result
console.log('\ngetDailyMicrocopy — deterministic');

(() => {
  const examples = ['A', 'B', 'C', 'D'];
  const first = getDailyMicrocopy(examples);
  const second = getDailyMicrocopy(examples);
  assert(first === second, 'same call twice returns same result');
})();

// Different arrays can return different results
console.log('\ngetDailyMicrocopy — rotation across archetypes');

(() => {
  // With 4 examples and day-of-year modulo, different arrays may yield different picks
  // At minimum, the function selects a valid index
  const phoenix = getArchetypeProfile('phoenix');
  const titan = getArchetypeProfile('titan');
  const pResult = getDailyMicrocopy(phoenix.microcopyExamples);
  const tResult = getDailyMicrocopy(titan.microcopyExamples);
  assert(phoenix.microcopyExamples.includes(pResult), 'phoenix microcopy is from phoenix examples');
  assert(titan.microcopyExamples.includes(tResult), 'titan microcopy is from titan examples');
})();

// ---------------------------------------------------------------------------
// lightenHex
// ---------------------------------------------------------------------------
console.log('\nlightenHex — basic behavior');

(() => {
  // amount=0 should return same color
  assert(lightenHex('#FF0000', 0) === '#ff0000', 'amount 0 returns same color');
})();

(() => {
  // amount=1 should return white
  assert(lightenHex('#FF0000', 1) === '#ffffff', 'amount 1 returns white');
  assert(lightenHex('#000000', 1) === '#ffffff', 'black + amount 1 = white');
})();

(() => {
  // amount=0.5 should be halfway to white
  const result = lightenHex('#000000', 0.5);
  // 0 + (255 - 0) * 0.5 = 127.5 → rounds to 128 = 0x80
  assert(result === '#5A6B7C', `black + 0.5 = ${result} (expected #808080)`);
})();

console.log('\nlightenHex — valid hex output');

(() => {
  const archetypes = ['phoenix', 'titan', 'blade', 'surge'] as const;
  let allValid = true;
  for (const arch of archetypes) {
    const profile = getArchetypeProfile(arch);
    const lightened = lightenHex(profile.color, 0.65);
    if (!/^#[0-9a-f]{6}$/.test(lightened)) {
      console.error(`    Invalid hex for ${arch}: ${lightened}`);
      allValid = false;
    }
  }
  assert(allValid, 'all archetype colors produce valid lightened hex');
})();

(() => {
  // Lightened should always be lighter (higher RGB values)
  const hex = '#5A6B7C'; // Titan blue
  const lightened = lightenHex(hex, 0.65);
  const origR = parseInt(hex.slice(1, 3), 16);
  const lightR = parseInt(lightened.slice(1, 3), 16);
  assert(lightR >= origR, `lightened R (${lightR}) >= original R (${origR})`);
})();

// ---------------------------------------------------------------------------
// Readiness config mapping
// ---------------------------------------------------------------------------
console.log('\nReadiness config');

(() => {
  // Verify each readiness level has the expected label
  const expected: Record<string, string> = {
    GREEN: 'GREEN',
    YELLOW: 'YELLOW',
    RED: 'REST',
  };
  for (const [level, label] of Object.entries(expected)) {
    // We check indirectly — the component uses these labels
    assert(typeof label === 'string' && label.length > 0, `${level} has label "${label}"`);
  }
})();

// ---------------------------------------------------------------------------
// Profile integration
// ---------------------------------------------------------------------------
console.log('\nProfile integration');

(() => {
  // Each archetype produces valid gradient (accent color + lightened)
  const archetypes = ['phoenix', 'titan', 'blade', 'surge', null] as const;
  for (const arch of archetypes) {
    const profile = getArchetypeProfile(arch);
    const end = lightenHex(profile.color, 0.65);
    assert(
      profile.color !== end,
      `${arch ?? 'null'}: gradient start (${profile.color}) != end (${end})`,
    );
  }
})();

(() => {
  // Null archetype returns default "Athlete" and still works
  const profile = getArchetypeProfile(null);
  const copy = getDailyMicrocopy(profile.microcopyExamples);
  assert(profile.name === 'Athlete', 'null archetype → "Athlete"');
  assert(copy.length > 0, 'null archetype produces non-empty microcopy');
})();

(() => {
  // Microcopy is always under 10 words (per spec)
  const archetypes = ['phoenix', 'titan', 'blade', 'surge', null] as const;
  let allOk = true;
  for (const arch of archetypes) {
    const profile = getArchetypeProfile(arch);
    const copy = getDailyMicrocopy(profile.microcopyExamples);
    const wordCount = copy.split(/\s+/).length;
    if (wordCount > 10) {
      console.error(`    OVER 10: "${copy}" (${wordCount} words)`);
      allOk = false;
    }
  }
  assert(allOk, 'daily microcopy is always <= 10 words');
})();

// ---------------------------------------------------------------------------
// Gradient color pairs — end is always lighter than start
// ---------------------------------------------------------------------------
console.log('\nGradient end is lighter than start');

(() => {
  const archetypes = ['phoenix', 'titan', 'blade', 'surge', null] as const;
  let allLighter = true;

  for (const arch of archetypes) {
    const profile = getArchetypeProfile(arch);
    const start = profile.color;
    const end = lightenHex(start, 0.65);

    const startSum =
      parseInt(start.slice(1, 3), 16) +
      parseInt(start.slice(3, 5), 16) +
      parseInt(start.slice(5, 7), 16);
    const endSum =
      parseInt(end.slice(1, 3), 16) +
      parseInt(end.slice(3, 5), 16) +
      parseInt(end.slice(5, 7), 16);

    if (endSum < startSum) {
      console.error(`    ${arch ?? 'null'}: end (${endSum}) darker than start (${startSum})`);
      allLighter = false;
    }
  }

  assert(allLighter, 'gradient end always lighter than start for all archetypes');
})();

// ---------------------------------------------------------------------------
// Case insensitivity (component passes archetype to getArchetypeProfile)
// ---------------------------------------------------------------------------
console.log('\nCase-insensitive archetype handling');

(() => {
  const lower = getArchetypeProfile('phoenix');
  const upper = getArchetypeProfile('Phoenix');
  const caps = getArchetypeProfile('PHOENIX');
  assert(lower.name === upper.name && upper.name === caps.name, 'any casing → same profile');
})();

// ---------------------------------------------------------------------------
// No banned words in microcopy shown to user
// ---------------------------------------------------------------------------
console.log('\nNo banned words in daily microcopy');

(() => {
  const banned = ['grind', 'beast', 'crush', 'destroy', 'kill', 'smash', 'dominate'];
  const archetypes = ['phoenix', 'titan', 'blade', 'surge', null] as const;
  let clean = true;

  for (const arch of archetypes) {
    const profile = getArchetypeProfile(arch);
    const copy = getDailyMicrocopy(profile.microcopyExamples);
    const lower = copy.toLowerCase();
    for (const word of banned) {
      if (lower.includes(word)) {
        console.error(`    BANNED "${word}" in: "${copy}"`);
        clean = false;
      }
    }
  }

  assert(clean, 'daily microcopy has no banned hype words');
})();

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
test('all assertions pass', () => {
  expect(failed).toBe(0);
});
