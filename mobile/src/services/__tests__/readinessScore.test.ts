/**
 * Tests for getReadinessScore
 * Validates safety rules, scoring math, and band alignment.
 * Mirrors backend readinessCalculator.test.js coverage.
 */

import { getReadinessScore, getReadinessMessage, getComplianceOutcome, type CheckinInput, type ComplianceInput } from '../readinessScore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const base: CheckinInput = {
  energy: 8,
  soreness: 2,
  sleepHours: 8,
  mood: 7,
  effort: 4,
  pain: false,
};

function checkin(overrides: Partial<CheckinInput>): CheckinInput {
  return { ...base, ...overrides };
}

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

// ---------------------------------------------------------------------------
// RED conditions (safety-critical)
// ---------------------------------------------------------------------------
console.log('\nRED conditions');

(() => {
  const r = getReadinessScore(checkin({ pain: true }));
  assert(r.level === 'RED', 'pain: true → RED');
  assert(r.score === 0, 'pain: true → score 0');
})();

(() => {
  const r = getReadinessScore(checkin({ pain: true, energy: 10, soreness: 1, sleepHours: 10 }));
  assert(r.level === 'RED', 'pain overrides perfect stats');
  assert(r.score === 0, 'pain overrides perfect stats → score 0');
})();

(() => {
  const r = getReadinessScore(checkin({ energy: 2, soreness: 7 }));
  assert(r.level === 'RED', 'energy<=2 AND soreness>=7 → RED');
  assert(r.score <= 33, 'RED score capped at 33');
})();

(() => {
  const r = getReadinessScore(checkin({ energy: 1, soreness: 10 }));
  assert(r.level === 'RED', 'energy=1 soreness=10 → RED');
})();

(() => {
  const r = getReadinessScore(checkin({ sleepHours: 4, energy: 8, soreness: 1 }));
  assert(r.level === 'RED', 'sleep<5 → RED');
  assert(r.score <= 33, 'sleep<5 RED score ≤ 33');
})();

(() => {
  const r = getReadinessScore(checkin({ sleepHours: 4.9 }));
  assert(r.level === 'RED', 'sleep=4.9 → RED');
})();

// ---------------------------------------------------------------------------
// YELLOW conditions
// ---------------------------------------------------------------------------
console.log('\nYELLOW conditions');

(() => {
  const r = getReadinessScore(checkin({ energy: 5, soreness: 2, sleepHours: 8 }));
  assert(r.level === 'YELLOW', 'energy<=5 → YELLOW');
  assert(r.score >= 1 && r.score <= 66, 'YELLOW score in 1–66 band');
})();

(() => {
  const r = getReadinessScore(checkin({ energy: 6, soreness: 7, sleepHours: 8 }));
  assert(r.level === 'YELLOW', 'soreness>=7 (energy>2) → YELLOW');
})();

(() => {
  const r = getReadinessScore(checkin({ energy: 8, soreness: 1, sleepHours: 5 }));
  assert(r.level === 'YELLOW', 'sleep=5 → YELLOW (not RED)');
})();

(() => {
  // energy=3, soreness=7 — NOT red because energy > 2
  const r = getReadinessScore(checkin({ energy: 3, soreness: 7, sleepHours: 8 }));
  assert(r.level === 'YELLOW', 'energy=3 soreness=7 → YELLOW not RED');
})();

(() => {
  // energy=2, soreness=6 — NOT red because soreness < 7
  const r = getReadinessScore(checkin({ energy: 2, soreness: 6, sleepHours: 8 }));
  assert(r.level === 'YELLOW', 'energy=2 soreness=6 → YELLOW not RED');
})();

// ---------------------------------------------------------------------------
// GREEN conditions
// ---------------------------------------------------------------------------
console.log('\nGREEN conditions');

(() => {
  const r = getReadinessScore(checkin({ energy: 8, soreness: 1, sleepHours: 8 }));
  assert(r.level === 'GREEN', 'good stats → GREEN');
  assert(r.score >= 34, 'GREEN score ≥ 34');
})();

(() => {
  const r = getReadinessScore(checkin({ energy: 10, soreness: 1, sleepHours: 10, mood: 10, effort: 1 }));
  assert(r.level === 'GREEN', 'perfect check-in → GREEN');
  assert(r.score >= 90, `perfect score should be ≥ 90, got ${r.score}`);
})();

(() => {
  const r = getReadinessScore(checkin({ energy: 8, soreness: 1, sleepHours: 6 }));
  assert(r.level === 'GREEN', 'sleep=6 with good energy/soreness → GREEN');
})();

// ---------------------------------------------------------------------------
// Score band alignment (score never contradicts level)
// ---------------------------------------------------------------------------
console.log('\nBand alignment');

(() => {
  // Run many combinations
  const energies = [1, 3, 5, 7, 10];
  const sorenesses = [1, 5, 7, 10];
  const sleeps = [4, 5, 6, 8, 10];
  const moods = [1, 5, 10];
  const efforts = [1, 5, 10];
  let violations = 0;
  let total = 0;

  for (const energy of energies) {
    for (const soreness of sorenesses) {
      for (const sleepHours of sleeps) {
        for (const mood of moods) {
          for (const effort of efforts) {
            for (const pain of [true, false]) {
              total++;
              const r = getReadinessScore({ energy, soreness, sleepHours, mood, effort, pain });

              if (r.level === 'RED' && r.score > 33) violations++;
              if (r.level === 'YELLOW' && (r.score < 1 || r.score > 66)) violations++;
              if (r.level === 'GREEN' && r.score < 34) violations++;
              if (r.score < 0 || r.score > 100) violations++;
            }
          }
        }
      }
    }
  }

  assert(violations === 0, `${total} combos tested, ${violations} band violations`);
})();

// ---------------------------------------------------------------------------
// Score ordering sanity
// ---------------------------------------------------------------------------
console.log('\nScore ordering');

(() => {
  const good = getReadinessScore(checkin({ energy: 9, soreness: 1, sleepHours: 9, mood: 9, effort: 2 }));
  const mid = getReadinessScore(checkin({ energy: 5, soreness: 5, sleepHours: 6, mood: 5, effort: 5 }));
  const bad = getReadinessScore(checkin({ energy: 2, soreness: 8, sleepHours: 4, mood: 2, effort: 9 }));

  assert(good.score > mid.score, `good (${good.score}) > mid (${mid.score})`);
  assert(mid.score > bad.score, `mid (${mid.score}) > bad (${bad.score})`);
})();

// ---------------------------------------------------------------------------
// Return type shape
// ---------------------------------------------------------------------------
console.log('\nReturn shape');

(() => {
  const r = getReadinessScore(base);
  assert(typeof r.score === 'number', 'score is number');
  assert(typeof r.level === 'string', 'level is string');
  assert(['GREEN', 'YELLOW', 'RED'].includes(r.level), 'level is valid ReadinessLevel');
})();

// ---------------------------------------------------------------------------
// getReadinessMessage — exact output
// ---------------------------------------------------------------------------
console.log('\ngetReadinessMessage — exact output per spec');

(() => {
  assert(
    getReadinessMessage('RED', 'phoenix') === 'Recovery is your power, Phoenix.',
    'RED + Phoenix',
  );
  assert(
    getReadinessMessage('YELLOW', 'blade') === 'Stay sharp. Light effort today.',
    'YELLOW + Blade',
  );
  assert(
    getReadinessMessage('GREEN', 'surge') === 'Let it rip, Surge!',
    'GREEN + Surge',
  );
  assert(
    getReadinessMessage('RED', null) === 'Recovery mode today.',
    'RED + null → neutral',
  );
  assert(
    getReadinessMessage('GREEN', 'titan') === 'Push with purpose, Titan.',
    'GREEN + Titan',
  );
})();

// ---------------------------------------------------------------------------
// getReadinessMessage — fallback & edge cases
// ---------------------------------------------------------------------------
console.log('\ngetReadinessMessage — fallback & edge cases');

(() => {
  assert(
    getReadinessMessage('GREEN', undefined) === "You're ready. Full session today.",
    'undefined archetype → neutral',
  );
  assert(
    getReadinessMessage('YELLOW', '') === 'Light session recommended today.',
    'empty string archetype → neutral',
  );
  assert(
    getReadinessMessage('RED', 'UnknownType') === 'Recovery mode today.',
    'unrecognized archetype → neutral',
  );
})();

// ---------------------------------------------------------------------------
// getReadinessMessage — case insensitivity
// ---------------------------------------------------------------------------
console.log('\ngetReadinessMessage — case insensitivity');

(() => {
  assert(
    getReadinessMessage('GREEN', 'Phoenix') === getReadinessMessage('GREEN', 'phoenix'),
    'Phoenix == phoenix (case-insensitive)',
  );
  assert(
    getReadinessMessage('YELLOW', 'TITAN') === getReadinessMessage('YELLOW', 'titan'),
    'TITAN == titan (case-insensitive)',
  );
  assert(
    getReadinessMessage('RED', 'BLADE') === getReadinessMessage('RED', 'blade'),
    'BLADE == blade (case-insensitive)',
  );
  assert(
    getReadinessMessage('GREEN', 'SURGE') === getReadinessMessage('GREEN', 'surge'),
    'SURGE == surge (case-insensitive)',
  );
})();

// ---------------------------------------------------------------------------
// getReadinessMessage — word count (max 10)
// ---------------------------------------------------------------------------
console.log('\ngetReadinessMessage — word count ≤ 10');

(() => {
  const categories: Array<'GREEN' | 'YELLOW' | 'RED'> = ['GREEN', 'YELLOW', 'RED'];
  const archetypes = ['phoenix', 'titan', 'blade', 'surge', null];
  let allUnder10 = true;

  for (const cat of categories) {
    for (const arch of archetypes) {
      const msg = getReadinessMessage(cat, arch);
      const wordCount = msg.split(/\s+/).length;
      if (wordCount > 10) {
        console.error(`    OVER 10: "${msg}" (${wordCount} words)`);
        allUnder10 = false;
      }
    }
  }

  assert(allUnder10, 'all 15 messages are ≤ 10 words');
})();

// ---------------------------------------------------------------------------
// getReadinessMessage — no banned words
// ---------------------------------------------------------------------------
console.log('\ngetReadinessMessage — no hype/banned words');

(() => {
  const banned = ['grind', 'beast', 'crush', 'destroy', 'kill', 'smash', 'dominate'];
  const categories: Array<'GREEN' | 'YELLOW' | 'RED'> = ['GREEN', 'YELLOW', 'RED'];
  const archetypes = ['phoenix', 'titan', 'blade', 'surge', null];
  let clean = true;

  for (const cat of categories) {
    for (const arch of archetypes) {
      const msg = getReadinessMessage(cat, arch).toLowerCase();
      for (const word of banned) {
        if (msg.includes(word)) {
          console.error(`    BANNED "${word}" found in: "${msg}"`);
          clean = false;
        }
      }
    }
  }

  assert(clean, 'no banned hype words in any message');
})();

// ---------------------------------------------------------------------------
// getReadinessMessage — returns string
// ---------------------------------------------------------------------------
console.log('\ngetReadinessMessage — type checks');

(() => {
  assert(typeof getReadinessMessage('GREEN') === 'string', 'returns string with no archetype');
  assert(typeof getReadinessMessage('RED', 'titan') === 'string', 'returns string with archetype');
  assert(getReadinessMessage('YELLOW', null).length > 0, 'never returns empty string');
})();

// ===========================================================================
// getComplianceOutcome tests
// ===========================================================================

// ---------------------------------------------------------------------------
// RED compliance — safety-critical
// ---------------------------------------------------------------------------
console.log('\ngetComplianceOutcome — RED compliance');

(() => {
  const r = getComplianceOutcome({ readiness: 'RED', intensity: 'REST', daysSinceRest: 0 });
  assert(r.compliant === true, 'RED + REST → compliant');
  assert(r.pointsAwarded === 20, `RED + REST → 20 pts (5 base + 15 bonus), got ${r.pointsAwarded}`);
  assert(r.reason.includes('Rested on RED day'), 'reason mentions RED rest');
})();

(() => {
  const r = getComplianceOutcome({ readiness: 'RED', intensity: 'LIGHT', daysSinceRest: 0 });
  assert(r.compliant === false, 'RED + LIGHT → non-compliant');
  assert(r.pointsAwarded === 5, `RED + LIGHT → 5 pts (base only), got ${r.pointsAwarded}`);
})();

(() => {
  const r = getComplianceOutcome({ readiness: 'RED', intensity: 'MODERATE', daysSinceRest: 0 });
  assert(r.compliant === false, 'RED + MODERATE → non-compliant');
})();

(() => {
  const r = getComplianceOutcome({ readiness: 'RED', intensity: 'HARD', daysSinceRest: 0 });
  assert(r.compliant === false, 'RED + HARD → non-compliant');
})();

// ---------------------------------------------------------------------------
// YELLOW compliance
// ---------------------------------------------------------------------------
console.log('\ngetComplianceOutcome — YELLOW compliance');

(() => {
  const r = getComplianceOutcome({ readiness: 'YELLOW', intensity: 'LIGHT', daysSinceRest: 0 });
  assert(r.compliant === true, 'YELLOW + LIGHT → compliant');
  assert(r.pointsAwarded === 10, `YELLOW + LIGHT → 10 pts (5+5), got ${r.pointsAwarded}`);
  assert(r.reason.includes('Followed YELLOW guidance'), 'reason mentions YELLOW guidance');
})();

(() => {
  const r = getComplianceOutcome({ readiness: 'YELLOW', intensity: 'REST', daysSinceRest: 0 });
  assert(r.compliant === true, 'YELLOW + REST → compliant');
  assert(r.pointsAwarded === 10, `YELLOW + REST → 10 pts (5+5), got ${r.pointsAwarded}`);
})();

(() => {
  const r = getComplianceOutcome({ readiness: 'YELLOW', intensity: 'MODERATE', daysSinceRest: 0 });
  assert(r.compliant === true, 'YELLOW + MODERATE → compliant (no bonus)');
  assert(r.pointsAwarded === 5, `YELLOW + MODERATE → 5 pts (base only), got ${r.pointsAwarded}`);
})();

(() => {
  const r = getComplianceOutcome({ readiness: 'YELLOW', intensity: 'HARD', daysSinceRest: 0 });
  assert(r.compliant === true, 'YELLOW + HARD → compliant (no bonus)');
  assert(r.pointsAwarded === 5, `YELLOW + HARD → 5 pts (base only), got ${r.pointsAwarded}`);
})();

// ---------------------------------------------------------------------------
// GREEN compliance
// ---------------------------------------------------------------------------
console.log('\ngetComplianceOutcome — GREEN compliance');

(() => {
  const r = getComplianceOutcome({ readiness: 'GREEN', intensity: 'MODERATE', daysSinceRest: 0 });
  assert(r.compliant === true, 'GREEN + MODERATE → compliant');
  assert(r.pointsAwarded === 10, `GREEN + MODERATE → 10 pts (5+5), got ${r.pointsAwarded}`);
  assert(r.reason.includes('GREEN workout completed'), 'reason mentions GREEN workout');
})();

(() => {
  const r = getComplianceOutcome({ readiness: 'GREEN', intensity: 'HARD', daysSinceRest: 0 });
  assert(r.compliant === true, 'GREEN + HARD → compliant');
  assert(r.pointsAwarded === 10, `GREEN + HARD → 10 pts (5+5), got ${r.pointsAwarded}`);
})();

(() => {
  const r = getComplianceOutcome({ readiness: 'GREEN', intensity: 'LIGHT', daysSinceRest: 0 });
  assert(r.compliant === true, 'GREEN + LIGHT → compliant');
  assert(r.pointsAwarded === 10, `GREEN + LIGHT → 10 pts (5+5), got ${r.pointsAwarded}`);
})();

(() => {
  const r = getComplianceOutcome({ readiness: 'GREEN', intensity: 'REST', daysSinceRest: 0 });
  assert(r.compliant === true, 'GREEN + REST → compliant (no bonus)');
  assert(r.pointsAwarded === 5, `GREEN + REST → 5 pts (base only), got ${r.pointsAwarded}`);
})();

// ---------------------------------------------------------------------------
// Forced rest bonus (daysSinceRest >= 6)
// ---------------------------------------------------------------------------
console.log('\ngetComplianceOutcome — forced rest bonus');

(() => {
  const r = getComplianceOutcome({ readiness: 'GREEN', intensity: 'REST', daysSinceRest: 6 });
  assert(r.pointsAwarded === 15, `GREEN + REST + 6 days → 15 pts (5 base + 10 forced), got ${r.pointsAwarded}`);
  assert(r.reason.includes('Recovery after 6+ training days'), 'reason mentions forced rest');
})();

(() => {
  const r = getComplianceOutcome({ readiness: 'GREEN', intensity: 'REST', daysSinceRest: 10 });
  assert(r.pointsAwarded === 15, `GREEN + REST + 10 days → 15 pts, got ${r.pointsAwarded}`);
})();

(() => {
  // Forced rest does NOT trigger for non-rest intensity
  const r = getComplianceOutcome({ readiness: 'GREEN', intensity: 'MODERATE', daysSinceRest: 6 });
  assert(r.pointsAwarded === 10, `GREEN + MODERATE + 6 days → 10 pts (no forced bonus), got ${r.pointsAwarded}`);
})();

// ---------------------------------------------------------------------------
// Stacking: RED + forced rest
// ---------------------------------------------------------------------------
console.log('\ngetComplianceOutcome — bonus stacking');

(() => {
  const r = getComplianceOutcome({ readiness: 'RED', intensity: 'REST', daysSinceRest: 6 });
  assert(r.compliant === true, 'RED + REST + 6 days → compliant');
  assert(r.pointsAwarded === 30, `RED + REST + forced → 30 pts (5+15+10), got ${r.pointsAwarded}`);
})();

(() => {
  // YELLOW + REST + forced rest = 5 base + 5 yellow + 10 forced = 20
  const r = getComplianceOutcome({ readiness: 'YELLOW', intensity: 'REST', daysSinceRest: 7 });
  assert(r.pointsAwarded === 20, `YELLOW + REST + forced → 20 pts (5+5+10), got ${r.pointsAwarded}`);
})();

// ---------------------------------------------------------------------------
// Return shape
// ---------------------------------------------------------------------------
console.log('\ngetComplianceOutcome — return shape');

(() => {
  const r = getComplianceOutcome({ readiness: 'GREEN', intensity: 'MODERATE', daysSinceRest: 0 });
  assert(typeof r.compliant === 'boolean', 'compliant is boolean');
  assert(typeof r.pointsAwarded === 'number', 'pointsAwarded is number');
  assert(typeof r.reason === 'string', 'reason is string');
  assert(r.reason.length > 0, 'reason is non-empty');
  assert(r.pointsAwarded >= 5, 'minimum points is always base (5)');
})();

// ---------------------------------------------------------------------------
// Every check-in gets base points
// ---------------------------------------------------------------------------
console.log('\ngetComplianceOutcome — base points always awarded');

(() => {
  const intensities: Array<'REST' | 'LIGHT' | 'MODERATE' | 'HARD'> = ['REST', 'LIGHT', 'MODERATE', 'HARD'];
  const levels: Array<'GREEN' | 'YELLOW' | 'RED'> = ['GREEN', 'YELLOW', 'RED'];
  let allHaveBase = true;

  for (const readiness of levels) {
    for (const intensity of intensities) {
      const r = getComplianceOutcome({ readiness, intensity, daysSinceRest: 0 });
      if (r.pointsAwarded < 5) {
        console.error(`  FAIL: ${readiness}+${intensity} gave ${r.pointsAwarded} pts (< 5)`);
        allHaveBase = false;
      }
    }
  }

  assert(allHaveBase, 'all 12 combos award at least 5 base pts');
})();

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
test('all assertions pass', () => {
  expect(failed).toBe(0);
});
