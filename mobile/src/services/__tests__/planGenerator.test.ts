/**
 * Tests for generatePlan
 * Validates safety rules, sport coverage, archetype tuning,
 * input validation, and output shape.
 */

import { generatePlan, type DailyPlan, type PlanSport } from '../planGenerator';

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
// Return shape
// ---------------------------------------------------------------------------
console.log('\nReturn shape');

(() => {
  const plan = generatePlan('GREEN', 'football', 'phoenix');
  assert(Array.isArray(plan.warmup), 'warmup is array');
  assert(Array.isArray(plan.mainSet), 'mainSet is array');
  assert(Array.isArray(plan.cooldown), 'cooldown is array');
  assert(typeof plan.disclaimer === 'string', 'disclaimer is string');
  assert(plan.disclaimer.length > 0, 'disclaimer is non-empty');
})();

// ---------------------------------------------------------------------------
// Disclaimer always present
// ---------------------------------------------------------------------------
console.log('\nDisclaimer');

(() => {
  const cases: Array<[string, string, string | null]> = [
    ['GREEN', 'football', 'phoenix'],
    ['YELLOW', 'tennis', null],
    ['RED', 'basketball', 'blade'],
  ];
  let allHave = true;
  for (const [r, s, a] of cases) {
    const plan = generatePlan(r, s, a);
    if (!plan.disclaimer.includes('not medical advice')) {
      console.error(`    Missing disclaimer for ${r}/${s}/${a}`);
      allHave = false;
    }
  }
  assert(allHave, 'all plans include "not medical advice" disclaimer');
})();

(() => {
  const plan = generatePlan('GREEN', 'football', 'phoenix');
  assert(
    plan.disclaimer.includes('Listen to your body'),
    'disclaimer includes "Listen to your body"',
  );
})();

// ---------------------------------------------------------------------------
// SAFETY: RED → mainSet always empty
// ---------------------------------------------------------------------------
console.log('\nSAFETY: RED readiness');

(() => {
  const sports: PlanSport[] = ['football', 'basketball', 'tennis', 'padel'];
  const archetypes = ['phoenix', 'titan', 'blade', 'surge', null];
  let allEmpty = true;

  for (const sport of sports) {
    for (const arch of archetypes) {
      const plan = generatePlan('RED', sport, arch);
      if (plan.mainSet.length !== 0) {
        console.error(`    RED + ${sport} + ${arch}: mainSet not empty`);
        allEmpty = false;
      }
    }
  }

  assert(allEmpty, 'RED mainSet is ALWAYS empty (20 combos tested)');
})();

(() => {
  const plan = generatePlan('RED', 'football', 'phoenix');
  assert(plan.warmup.length > 0, 'RED still has warmup (gentle)');
  assert(plan.cooldown.length > 0, 'RED still has cooldown (recovery)');
})();

// ---------------------------------------------------------------------------
// YELLOW → light/technical drills (non-empty mainSet)
// ---------------------------------------------------------------------------
console.log('\nYELLOW readiness');

(() => {
  const sports: PlanSport[] = ['football', 'basketball', 'tennis', 'padel'];
  let allNonEmpty = true;

  for (const sport of sports) {
    const plan = generatePlan('YELLOW', sport, null);
    if (plan.mainSet.length === 0) {
      console.error(`    YELLOW + ${sport}: mainSet empty`);
      allNonEmpty = false;
    }
  }

  assert(allNonEmpty, 'YELLOW mainSet is non-empty for all sports');
})();

// ---------------------------------------------------------------------------
// GREEN → full plan
// ---------------------------------------------------------------------------
console.log('\nGREEN readiness');

(() => {
  const sports: PlanSport[] = ['football', 'basketball', 'tennis', 'padel'];
  let allFull = true;

  for (const sport of sports) {
    const plan = generatePlan('GREEN', sport, null);
    if (plan.warmup.length < 2) {
      console.error(`    GREEN + ${sport}: warmup too short`);
      allFull = false;
    }
    if (plan.mainSet.length < 3) {
      console.error(`    GREEN + ${sport}: mainSet too short`);
      allFull = false;
    }
    if (plan.cooldown.length < 2) {
      console.error(`    GREEN + ${sport}: cooldown too short`);
      allFull = false;
    }
  }

  assert(allFull, 'GREEN plans have >= 2 warmup, >= 3 mainSet, >= 2 cooldown');
})();

// ---------------------------------------------------------------------------
// GREEN mainSet longer than YELLOW mainSet
// ---------------------------------------------------------------------------
console.log('\nGREEN > YELLOW intensity');

(() => {
  const sports: PlanSport[] = ['football', 'basketball', 'tennis', 'padel'];
  let allMore = true;

  for (const sport of sports) {
    const green = generatePlan('GREEN', sport, null);
    const yellow = generatePlan('YELLOW', sport, null);
    if (green.mainSet.length <= yellow.mainSet.length) {
      console.error(`    ${sport}: GREEN (${green.mainSet.length}) <= YELLOW (${yellow.mainSet.length})`);
      allMore = false;
    }
  }

  assert(allMore, 'GREEN always has more mainSet exercises than YELLOW');
})();

// ---------------------------------------------------------------------------
// Sport-specific exercises — football
// ---------------------------------------------------------------------------
console.log('\nFootball exercises');

(() => {
  const plan = generatePlan('GREEN', 'football', null);
  const all = [...plan.warmup, ...plan.mainSet, ...plan.cooldown].join(' ').toLowerCase();
  assert(all.includes('ball'), 'football GREEN mentions ball');
  assert(all.includes('pass'), 'football GREEN mentions passing');
})();

(() => {
  const plan = generatePlan('YELLOW', 'football', null);
  const all = plan.mainSet.join(' ').toLowerCase();
  assert(all.includes('low-speed') || all.includes('light') || all.includes('stationary'),
    'football YELLOW exercises are low-intensity');
})();

// ---------------------------------------------------------------------------
// Sport-specific exercises — basketball
// ---------------------------------------------------------------------------
console.log('\nBasketball exercises');

(() => {
  const plan = generatePlan('GREEN', 'basketball', null);
  const all = [...plan.warmup, ...plan.mainSet, ...plan.cooldown].join(' ').toLowerCase();
  assert(all.includes('shoot') || all.includes('shot'), 'basketball GREEN mentions shooting');
  assert(all.includes('layup') || all.includes('sprint'), 'basketball GREEN mentions layup or sprint');
})();

// ---------------------------------------------------------------------------
// Sport-specific exercises — tennis
// ---------------------------------------------------------------------------
console.log('\nTennis exercises');

(() => {
  const plan = generatePlan('GREEN', 'tennis', null);
  const all = [...plan.warmup, ...plan.mainSet, ...plan.cooldown].join(' ').toLowerCase();
  assert(all.includes('serve'), 'tennis GREEN mentions serve');
  assert(all.includes('rally') || all.includes('groundstroke'), 'tennis GREEN mentions rally or groundstroke');
})();

// ---------------------------------------------------------------------------
// Sport-specific exercises — padel
// ---------------------------------------------------------------------------
console.log('\nPadel exercises');

(() => {
  const plan = generatePlan('GREEN', 'padel', null);
  const all = [...plan.warmup, ...plan.mainSet, ...plan.cooldown].join(' ').toLowerCase();
  assert(all.includes('volley') || all.includes('wall'), 'padel GREEN mentions volley or wall');
  assert(all.includes('bandeja') || all.includes('serve'), 'padel GREEN mentions bandeja or serve');
})();

(() => {
  const plan = generatePlan('YELLOW', 'padel', null);
  const all = plan.mainSet.join(' ').toLowerCase();
  assert(all.includes('control') || all.includes('placement'), 'padel YELLOW is control-focused');
})();

// ---------------------------------------------------------------------------
// Archetype tuning — adds exercise to mainSet
// ---------------------------------------------------------------------------
console.log('\nArchetype tuning');

(() => {
  const base = generatePlan('GREEN', 'football', null);
  const phoenix = generatePlan('GREEN', 'football', 'phoenix');
  assert(
    phoenix.mainSet.length > base.mainSet.length,
    `phoenix adds exercise: ${base.mainSet.length} → ${phoenix.mainSet.length}`,
  );
})();

(() => {
  const base = generatePlan('GREEN', 'basketball', null);
  const titan = generatePlan('GREEN', 'basketball', 'titan');
  assert(
    titan.mainSet.length > base.mainSet.length,
    `titan adds exercise: ${base.mainSet.length} → ${titan.mainSet.length}`,
  );
})();

(() => {
  const base = generatePlan('GREEN', 'tennis', null);
  const blade = generatePlan('GREEN', 'tennis', 'blade');
  assert(
    blade.mainSet.length > base.mainSet.length,
    `blade adds exercise: ${base.mainSet.length} → ${blade.mainSet.length}`,
  );
})();

(() => {
  const base = generatePlan('GREEN', 'padel', null);
  const surge = generatePlan('GREEN', 'padel', 'surge');
  assert(
    surge.mainSet.length > base.mainSet.length,
    `surge adds exercise: ${base.mainSet.length} → ${surge.mainSet.length}`,
  );
})();

// ---------------------------------------------------------------------------
// Archetype flavor in exercise text
// ---------------------------------------------------------------------------
console.log('\nArchetype flavor text');

(() => {
  const phoenix = generatePlan('GREEN', 'football', 'phoenix');
  const extra = phoenix.mainSet[phoenix.mainSet.length - 1].toLowerCase();
  assert(extra.includes('pacing') || extra.includes('interval') || extra.includes('tempo'),
    `phoenix exercise mentions pacing/interval: "${extra}"`);
})();

(() => {
  const titan = generatePlan('GREEN', 'basketball', 'titan');
  const extra = titan.mainSet[titan.mainSet.length - 1].toLowerCase();
  assert(extra.includes('extra') || extra.includes('extend') || extra.includes('rep'),
    `titan exercise mentions extra/volume: "${extra}"`);
})();

(() => {
  const blade = generatePlan('GREEN', 'tennis', 'blade');
  const extra = blade.mainSet[blade.mainSet.length - 1].toLowerCase();
  assert(extra.includes('target') || extra.includes('accuracy') || extra.includes('perfect') || extra.includes('precise'),
    `blade exercise mentions precision: "${extra}"`);
})();

(() => {
  const surge = generatePlan('GREEN', 'padel', 'surge');
  const extra = surge.mainSet[surge.mainSet.length - 1].toLowerCase();
  assert(extra.includes('mix') || extra.includes('varied') || extra.includes('creative') || extra.includes('lob'),
    `surge exercise mentions variety: "${extra}"`);
})();

// ---------------------------------------------------------------------------
// Archetype does NOT modify RED
// ---------------------------------------------------------------------------
console.log('\nArchetype does not modify RED');

(() => {
  const archetypes = ['phoenix', 'titan', 'blade', 'surge'];
  let allClean = true;
  for (const arch of archetypes) {
    const plan = generatePlan('RED', 'football', arch);
    if (plan.mainSet.length !== 0) {
      console.error(`    RED + ${arch}: mainSet should be empty`);
      allClean = false;
    }
  }
  assert(allClean, 'archetype overlay never adds exercises on RED');
})();

// ---------------------------------------------------------------------------
// Archetype YELLOW overlay
// ---------------------------------------------------------------------------
console.log('\nArchetype YELLOW overlay');

(() => {
  const base = generatePlan('YELLOW', 'football', null);
  const phoenix = generatePlan('YELLOW', 'football', 'phoenix');
  assert(
    phoenix.mainSet.length > base.mainSet.length,
    `YELLOW phoenix adds exercise: ${base.mainSet.length} → ${phoenix.mainSet.length}`,
  );
})();

// ---------------------------------------------------------------------------
// Null archetype — no extra exercises
// ---------------------------------------------------------------------------
console.log('\nNull archetype');

(() => {
  const plan = generatePlan('GREEN', 'football', null);
  // Should have base exercises only (4 for football GREEN)
  assert(plan.mainSet.length >= 3, 'null archetype still has full base plan');
})();

(() => {
  const plan = generatePlan('GREEN', 'football', undefined as any);
  assert(plan.mainSet.length >= 3, 'undefined archetype still has full base plan');
})();

// ---------------------------------------------------------------------------
// Case insensitivity
// ---------------------------------------------------------------------------
console.log('\nCase insensitivity');

(() => {
  const lower = generatePlan('green', 'football', 'phoenix');
  const upper = generatePlan('GREEN', 'FOOTBALL', 'Phoenix');
  const mixed = generatePlan('Green', 'Football', 'PHOENIX');

  assert(lower.mainSet.length === upper.mainSet.length, 'green == GREEN');
  assert(upper.mainSet.length === mixed.mainSet.length, 'GREEN == Green');
  assert(lower.warmup.length === upper.warmup.length, 'warmup matches across cases');
})();

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------
console.log('\nInput validation');

(() => {
  let threw = false;
  try { generatePlan('PURPLE', 'football', null); } catch { threw = true; }
  assert(threw, 'throws for invalid readiness "PURPLE"');
})();

(() => {
  let threw = false;
  try { generatePlan('GREEN', 'cricket', null); } catch { threw = true; }
  assert(threw, 'throws for invalid sport "cricket"');
})();

(() => {
  let threw = false;
  try { generatePlan('', 'football', null); } catch { threw = true; }
  assert(threw, 'throws for empty readiness');
})();

(() => {
  let threw = false;
  try { generatePlan('GREEN', '', null); } catch { threw = true; }
  assert(threw, 'throws for empty sport');
})();

// ---------------------------------------------------------------------------
// Immutability — modifying returned plan doesn't affect next call
// ---------------------------------------------------------------------------
console.log('\nImmutability');

(() => {
  const plan1 = generatePlan('GREEN', 'football', 'phoenix');
  const len1 = plan1.mainSet.length;
  plan1.mainSet.push('INJECTED');

  const plan2 = generatePlan('GREEN', 'football', 'phoenix');
  assert(plan2.mainSet.length === len1, 'mutation of returned plan does not affect next call');
})();

// ---------------------------------------------------------------------------
// All exercises are non-empty strings
// ---------------------------------------------------------------------------
console.log('\nAll exercises are valid strings');

(() => {
  const sports: PlanSport[] = ['football', 'basketball', 'tennis', 'padel'];
  const readiness: string[] = ['GREEN', 'YELLOW', 'RED'];
  let allValid = true;

  for (const sport of sports) {
    for (const r of readiness) {
      const plan = generatePlan(r, sport, null);
      const all = [...plan.warmup, ...plan.mainSet, ...plan.cooldown];
      for (const ex of all) {
        if (typeof ex !== 'string' || ex.trim().length === 0) {
          console.error(`    Invalid exercise in ${r}/${sport}: "${ex}"`);
          allValid = false;
        }
      }
    }
  }

  assert(allValid, 'every exercise across all 12 combos is a non-empty string');
})();

// ---------------------------------------------------------------------------
// No banned hype words
// ---------------------------------------------------------------------------
console.log('\nNo banned hype words');

(() => {
  const banned = ['grind', 'beast', 'crush', 'destroy', 'kill', 'smash', 'dominate'];
  const sports: PlanSport[] = ['football', 'basketball', 'tennis', 'padel'];
  const readiness: string[] = ['GREEN', 'YELLOW', 'RED'];
  const archetypes = ['phoenix', 'titan', 'blade', 'surge', null];
  let clean = true;

  for (const sport of sports) {
    for (const r of readiness) {
      for (const arch of archetypes) {
        const plan = generatePlan(r, sport, arch);
        const all = [...plan.warmup, ...plan.mainSet, ...plan.cooldown];
        for (const ex of all) {
          const lower = ex.toLowerCase();
          for (const word of banned) {
            if (lower.includes(word)) {
              console.error(`    BANNED "${word}" in: "${ex}" (${r}/${sport}/${arch})`);
              clean = false;
            }
          }
        }
      }
    }
  }

  assert(clean, 'no banned hype words in any exercise (60 combos)');
})();

// ---------------------------------------------------------------------------
// Every sport × readiness combination works
// ---------------------------------------------------------------------------
console.log('\nFull coverage');

(() => {
  const sports: PlanSport[] = ['football', 'basketball', 'tennis', 'padel'];
  const readiness: string[] = ['GREEN', 'YELLOW', 'RED'];
  let allWork = true;

  for (const sport of sports) {
    for (const r of readiness) {
      try {
        const plan = generatePlan(r, sport, null);
        if (!plan.disclaimer) {
          allWork = false;
          console.error(`    Missing disclaimer: ${r}/${sport}`);
        }
      } catch (e) {
        allWork = false;
        console.error(`    Threw for ${r}/${sport}: ${e}`);
      }
    }
  }

  assert(allWork, 'all 12 sport × readiness combos produce valid plans');
})();

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
test('all assertions pass', () => {
  expect(failed).toBe(0);
});
