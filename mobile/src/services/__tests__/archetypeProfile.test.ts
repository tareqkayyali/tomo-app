/**
 * Tests for getArchetypeProfile
 * Validates return shape, colors, tones, defaults, and edge cases.
 */

import { getArchetypeProfile, type ArchetypeProfile } from '../archetypeProfile';

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
// Return shape — every profile has required fields
// ---------------------------------------------------------------------------
console.log('\nReturn shape');

(() => {
  const p = getArchetypeProfile('phoenix');
  assert(typeof p.name === 'string' && p.name.length > 0, 'name is non-empty string');
  assert(typeof p.tone === 'string' && p.tone.length > 0, 'tone is non-empty string');
  assert(/^#[0-9A-Fa-f]{6}$/.test(p.color), 'color is valid hex');
  assert(Array.isArray(p.microcopyExamples), 'microcopyExamples is array');
  assert(p.microcopyExamples.length >= 3, 'at least 3 microcopy examples');
  assert(p.microcopyExamples.every((m: string) => typeof m === 'string' && m.length > 0), 'all examples are non-empty strings');
})();

// ---------------------------------------------------------------------------
// Phoenix
// ---------------------------------------------------------------------------
console.log('\nPhoenix profile');

(() => {
  const p = getArchetypeProfile('phoenix');
  assert(p.name === 'The Phoenix', `name = "${p.name}"`);
  assert(p.color === '#FF6B6B', `color = ${p.color}`);
  assert(p.tone.toLowerCase().includes('renewal') || p.tone.toLowerCase().includes('pacing'), `tone mentions renewal or pacing: "${p.tone}"`);
})();

// ---------------------------------------------------------------------------
// Titan
// ---------------------------------------------------------------------------
console.log('\nTitan profile');

(() => {
  const p = getArchetypeProfile('titan');
  assert(p.name === 'The Titan', `name = "${p.name}"`);
  assert(p.color === '#4C6EF5', `color = ${p.color}`);
  assert(p.tone.toLowerCase().includes('patient') || p.tone.toLowerCase().includes('solid'), `tone mentions patient or solid: "${p.tone}"`);
})();

// ---------------------------------------------------------------------------
// Blade
// ---------------------------------------------------------------------------
console.log('\nBlade profile');

(() => {
  const p = getArchetypeProfile('blade');
  assert(p.name === 'The Blade', `name = "${p.name}"`);
  assert(p.color === '#12B886', `color = ${p.color}`);
  assert(p.tone.toLowerCase().includes('precise') || p.tone.toLowerCase().includes('sharp'), `tone mentions precise or sharp: "${p.tone}"`);
})();

// ---------------------------------------------------------------------------
// Surge
// ---------------------------------------------------------------------------
console.log('\nSurge profile');

(() => {
  const p = getArchetypeProfile('surge');
  assert(p.name === 'The Surge', `name = "${p.name}"`);
  assert(p.color === '#FFD43B', `color = ${p.color}`);
  assert(p.tone.toLowerCase().includes('dynamic') || p.tone.toLowerCase().includes('explosive'), `tone mentions dynamic or explosive: "${p.tone}"`);
})();

// ---------------------------------------------------------------------------
// Default profile — null / undefined / empty / unrecognized
// ---------------------------------------------------------------------------
console.log('\nDefault profile (unassigned)');

(() => {
  const d = getArchetypeProfile(null);
  assert(d.name === 'Athlete', `null → name = "${d.name}"`);
  assert(/^#[0-9A-Fa-f]{6}$/.test(d.color), 'null → valid hex color');
  assert(d.microcopyExamples.length >= 3, 'null → has microcopy');
})();

(() => {
  const d = getArchetypeProfile(undefined);
  assert(d.name === 'Athlete', `undefined → name = "${d.name}"`);
})();

(() => {
  const d = getArchetypeProfile('');
  assert(d.name === 'Athlete', `empty string → name = "${d.name}"`);
})();

(() => {
  const d = getArchetypeProfile('unknown_archetype');
  assert(d.name === 'Athlete', `unrecognized → name = "${d.name}"`);
})();

(() => {
  // No argument at all
  const d = getArchetypeProfile();
  assert(d.name === 'Athlete', `no arg → name = "${d.name}"`);
})();

// ---------------------------------------------------------------------------
// Case insensitivity
// ---------------------------------------------------------------------------
console.log('\nCase insensitivity');

(() => {
  const lower = getArchetypeProfile('phoenix');
  const upper = getArchetypeProfile('PHOENIX');
  const mixed = getArchetypeProfile('Phoenix');
  assert(lower.name === upper.name, 'phoenix == PHOENIX');
  assert(lower.name === mixed.name, 'phoenix == Phoenix');
  assert(lower.color === upper.color, 'colors match regardless of case');
})();

(() => {
  assert(getArchetypeProfile('TITAN').name === 'The Titan', 'TITAN → The Titan');
  assert(getArchetypeProfile('Blade').name === 'The Blade', 'Blade → The Blade');
  assert(getArchetypeProfile('SURGE').name === 'The Surge', 'SURGE → The Surge');
})();

// ---------------------------------------------------------------------------
// Each archetype has unique color
// ---------------------------------------------------------------------------
console.log('\nUnique colors');

(() => {
  const archetypes = ['phoenix', 'titan', 'blade', 'surge'] as const;
  const colors = archetypes.map((a) => getArchetypeProfile(a).color);
  const unique = new Set(colors);
  assert(unique.size === 4, `4 unique colors: ${colors.join(', ')}`);
})();

// ---------------------------------------------------------------------------
// Each archetype has unique name
// ---------------------------------------------------------------------------
console.log('\nUnique names');

(() => {
  const archetypes = ['phoenix', 'titan', 'blade', 'surge'] as const;
  const names = archetypes.map((a) => getArchetypeProfile(a).name);
  const unique = new Set(names);
  assert(unique.size === 4, `4 unique names: ${names.join(', ')}`);
})();

// ---------------------------------------------------------------------------
// Default color differs from all archetype colors
// ---------------------------------------------------------------------------
console.log('\nDefault color distinct');

(() => {
  const defaultColor = getArchetypeProfile(null).color;
  const archetypes = ['phoenix', 'titan', 'blade', 'surge'] as const;
  const archetypeColors = archetypes.map((a) => getArchetypeProfile(a).color);
  assert(!archetypeColors.includes(defaultColor), `default "${defaultColor}" not in archetype colors`);
})();

// ---------------------------------------------------------------------------
// Microcopy — no hype/banned words
// ---------------------------------------------------------------------------
console.log('\nMicrocopy — no banned words');

(() => {
  const banned = ['grind', 'beast', 'crush', 'destroy', 'kill', 'smash', 'dominate'];
  const archetypes = ['phoenix', 'titan', 'blade', 'surge', null] as const;
  let clean = true;

  for (const arch of archetypes) {
    const p = getArchetypeProfile(arch);
    for (const line of p.microcopyExamples) {
      const lower = line.toLowerCase();
      for (const word of banned) {
        if (lower.includes(word)) {
          console.error(`    BANNED "${word}" in: "${line}"`);
          clean = false;
        }
      }
    }
  }

  assert(clean, 'no banned hype words in any microcopy');
})();

// ---------------------------------------------------------------------------
// Microcopy — max 12 words per line
// ---------------------------------------------------------------------------
console.log('\nMicrocopy — word count <= 12');

(() => {
  const archetypes = ['phoenix', 'titan', 'blade', 'surge', null] as const;
  let allOk = true;

  for (const arch of archetypes) {
    const p = getArchetypeProfile(arch);
    for (const line of p.microcopyExamples) {
      const words = line.split(/\s+/).length;
      if (words > 12) {
        console.error(`    OVER 12: "${line}" (${words} words)`);
        allOk = false;
      }
    }
  }

  assert(allOk, 'all microcopy lines are <= 12 words');
})();

// ---------------------------------------------------------------------------
// Immutability — modifying returned object doesn't affect next call
// ---------------------------------------------------------------------------
console.log('\nImmutability');

(() => {
  const p1 = getArchetypeProfile('phoenix');
  (p1 as any).name = 'MODIFIED';
  const p2 = getArchetypeProfile('phoenix');
  assert(p2.name === 'The Phoenix', 'mutation of returned object does not affect source');
})();

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
test('all assertions pass', () => {
  expect(failed).toBe(0);
});
