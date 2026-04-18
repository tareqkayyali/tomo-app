/**
 * parentMode — pure function tests (P4.2, 2026-04-18).
 *
 * Run: `npx tsx mobile/src/utils/__tests__/parentMode.test.ts`
 * (from repo root, adjust path or cd first per repo convention).
 */

import { parentModeForTier, capabilitiesForMode } from '../parentMode';

let passed = 0, failed = 0;
const failures: string[] = [];
function test(name: string, fn: () => void): void {
  try { fn(); passed++; } catch (e) {
    failed++;
    failures.push(`${name} — ${e instanceof Error ? e.message : String(e)}`);
  }
}
function eq<T>(a: T, b: T, ctx?: string): void {
  if (a !== b) throw new Error(`${ctx ? ctx + ': ' : ''}expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

// ── parentModeForTier ────────────────────────────────────────────────

test('T1 → guardian', () => eq(parentModeForTier('T1'), 'guardian'));
test('T2 → guardian', () => eq(parentModeForTier('T2'), 'guardian'));
test('T3 → supporter', () => eq(parentModeForTier('T3'), 'supporter'));
test('UNKNOWN → guardian (Apple 5.1.4 conservative)', () =>
  eq(parentModeForTier('UNKNOWN'), 'guardian'));
test('undefined → guardian (no tier info → fail-safe)', () =>
  eq(parentModeForTier(undefined), 'guardian'));

// ── capabilitiesForMode ──────────────────────────────────────────────

test('guardian can approve, compose, urgent-flag, add exams + study', () => {
  const c = capabilitiesForMode('guardian');
  eq(c.canApprovePrograms, true);
  eq(c.canComposeAnnotations, true);
  eq(c.canUrgentFlag, true);
  eq(c.canAddExams, true);
  eq(c.canAddStudyBlocks, true);
  eq(c.showProtectStudyWidget, true);
  eq(c.showWeeklyDigest, false);
});

test('supporter cannot approve, cannot compose, cannot urgent, no exams/study', () => {
  const c = capabilitiesForMode('supporter');
  eq(c.canApprovePrograms, false);
  eq(c.canComposeAnnotations, false);
  eq(c.canUrgentFlag, false);
  eq(c.canAddExams, false);
  eq(c.canAddStudyBlocks, false);
  eq(c.showProtectStudyWidget, false);
  eq(c.showWeeklyDigest, true);
});

// ── Invariants (guards on policy drift) ──────────────────────────────

test('guardian → supporter flip: urgent implies compose implies approve is false for supporter', () => {
  const c = capabilitiesForMode('supporter');
  if (c.canUrgentFlag && !c.canComposeAnnotations) {
    throw new Error('inconsistent: urgent without compose');
  }
  if (c.canApprovePrograms && !c.canComposeAnnotations) {
    throw new Error('inconsistent: approve without compose');
  }
});

test('guardian never shows weekly digest (that is supporter surface)', () => {
  eq(capabilitiesForMode('guardian').showWeeklyDigest, false);
});

test('supporter never shows protect-study widget (guardian surface)', () => {
  eq(capabilitiesForMode('supporter').showProtectStudyWidget, false);
});

// ── Report ──────────────────────────────────────────────────────────
console.log(`\nparentMode: ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log('\nFailures:');
  for (const f of failures) console.log('  ' + f);
  process.exit(1);
}
