/**
 * approvalResolver — pure function tests.
 *
 * Covers the scenario matrix: {T1, T2, T3} × {coach-first, parent-first,
 * concurrent} × {supersede rule variants} × {accept, decline, edit}.
 * Exhaustive branch coverage on the resolve() state machine.
 *
 * Run: `npx tsx backend/services/triangle/__tests__/approvalResolver.test.ts`
 */

import {
  resolveApproval,
  defaultSupersedeRuleForTier,
  type ChainEntry,
  type ApprovalRequestMeta,
} from "../approvalResolver";

let passed = 0, failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
  } catch (err) {
    failed++;
    const msg = err instanceof Error ? err.message : String(err);
    failures.push(`${name} — ${msg}`);
  }
}

function eq<T>(a: T, b: T, ctx?: string): void {
  const as = JSON.stringify(a);
  const bs = JSON.stringify(b);
  if (as !== bs) throw new Error(`${ctx ? ctx + ": " : ""}expected ${bs}, got ${as}`);
}

const COACH_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const PARENT_ID = "pppppppp-pppp-pppp-pppp-pppppppppppp";
const ATHLETE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function coach(decision: ChainEntry["decision"], at: string): ChainEntry {
  return { role: "coach", user_id: COACH_ID, decision, at };
}
function parent(decision: ChainEntry["decision"], at: string): ChainEntry {
  return { role: "parent", user_id: PARENT_ID, decision, at };
}
function athlete(decision: ChainEntry["decision"], at: string): ChainEntry {
  return { role: "athlete", user_id: ATHLETE_ID, decision, at };
}

// ── defaultSupersedeRuleForTier ───────────────────────────────────────

test("T1 → parent_supersedes_coach default", () =>
  eq(defaultSupersedeRuleForTier("T1"), "parent_supersedes_coach"));

test("T2 → parent_supersedes_coach default", () =>
  eq(defaultSupersedeRuleForTier("T2"), "parent_supersedes_coach"));

test("T3 → first_decision default", () =>
  eq(defaultSupersedeRuleForTier("T3"), "first_decision"));

test("UNKNOWN → parent_supersedes_coach default (Apple 5.1.4 conservative)", () =>
  eq(defaultSupersedeRuleForTier("UNKNOWN"), "parent_supersedes_coach"));

// ── parent_supersedes_coach (T1/T2) ──────────────────────────────────

const T1_META: ApprovalRequestMeta = {
  ageTier: "T1",
  requiredApproverRole: "parent",
  supersedeRule: "parent_supersedes_coach",
};

test("T1 coach-first accept → still pending (awaiting parent)", () => {
  const r = resolveApproval(T1_META, [coach("accept", "2026-04-18T09:00Z")]);
  eq(r.status, "pending");
});

test("T1 parent-first accept → accepted", () => {
  const r = resolveApproval(T1_META, [parent("accept", "2026-04-18T09:00Z")]);
  eq(r.status, "accepted");
  eq(r.resolvedByRole, "parent");
});

test("T1 parent-first decline → declined", () => {
  const r = resolveApproval(T1_META, [parent("decline", "2026-04-18T09:00Z")]);
  eq(r.status, "declined");
  eq(r.resolvedByRole, "parent");
});

test("T1 coach-accept then parent-decline → declined (parent overrides)", () => {
  const r = resolveApproval(T1_META, [
    coach("accept", "2026-04-18T09:00Z"),
    parent("decline", "2026-04-18T09:05Z"),
  ]);
  eq(r.status, "declined");
  eq(r.resolvedByRole, "parent");
  if (!r.rationale.includes("overrides")) throw new Error("rationale should mention override");
});

test("T1 coach-decline then parent-accept → accepted (parent overrides)", () => {
  const r = resolveApproval(T1_META, [
    coach("decline", "2026-04-18T09:00Z"),
    parent("accept", "2026-04-18T09:05Z"),
  ]);
  eq(r.status, "accepted");
  eq(r.resolvedByRole, "parent");
});

test("T1 parent-first accept then coach-decline → accepted (parent final)", () => {
  const r = resolveApproval(T1_META, [
    parent("accept", "2026-04-18T09:00Z"),
    coach("decline", "2026-04-18T09:05Z"),
  ]);
  eq(r.status, "accepted");
  eq(r.resolvedByRole, "parent");
});

test("T1 parent-edit → edited status", () => {
  const r = resolveApproval(T1_META, [parent("edit", "2026-04-18T09:00Z")]);
  eq(r.status, "edited");
  eq(r.resolvedByRole, "parent");
});

test("T1 coach-only chain → still pending", () => {
  const r = resolveApproval(T1_META, [
    coach("accept", "2026-04-18T09:00Z"),
    coach("accept", "2026-04-18T10:00Z"),
  ]);
  eq(r.status, "pending");
});

test("T2 same as T1 — parent supersedes coach", () => {
  const r = resolveApproval(
    { ...T1_META, ageTier: "T2" },
    [
      coach("accept", "2026-04-18T09:00Z"),
      parent("decline", "2026-04-18T09:05Z"),
    ]
  );
  eq(r.status, "declined");
  eq(r.resolvedByRole, "parent");
});

// ── first_decision (T3 + explicit) ───────────────────────────────────

const T3_PARENT_META: ApprovalRequestMeta = {
  ageTier: "T3",
  requiredApproverRole: "parent",
  supersedeRule: "first_decision",
};

test("T3 parent accepts → accepted", () => {
  const r = resolveApproval(T3_PARENT_META, [parent("accept", "2026-04-18T09:00Z")]);
  eq(r.status, "accepted");
});

test("T3 coach first, parent required → still pending", () => {
  const r = resolveApproval(T3_PARENT_META, [coach("accept", "2026-04-18T09:00Z")]);
  eq(r.status, "pending");
});

test("T3 first_decision with no requiredApproverRole → first entry resolves", () => {
  const r = resolveApproval(
    { ageTier: "T3", requiredApproverRole: null, supersedeRule: "first_decision" },
    [coach("decline", "2026-04-18T09:00Z"), parent("accept", "2026-04-18T09:05Z")]
  );
  eq(r.status, "declined");
  eq(r.resolvedByRole, "coach");
});

test("T3 first_decision with empty chain → pending", () => {
  const r = resolveApproval(T3_PARENT_META, []);
  eq(r.status, "pending");
});

// ── unanimous ────────────────────────────────────────────────────────

const UNANIMOUS_META: ApprovalRequestMeta = {
  ageTier: "T3",
  requiredApproverRole: null,
  supersedeRule: "unanimous",
  requiredApprovers: ["parent", "coach"],
};

test("unanimous — both accept → accepted", () => {
  const r = resolveApproval(UNANIMOUS_META, [
    coach("accept", "2026-04-18T09:00Z"),
    parent("accept", "2026-04-18T09:05Z"),
  ]);
  eq(r.status, "accepted");
});

test("unanimous — one declines → declined immediately", () => {
  const r = resolveApproval(UNANIMOUS_META, [
    coach("decline", "2026-04-18T09:00Z"),
    // Even if parent later accepts, the early decline already resolved.
    parent("accept", "2026-04-18T09:05Z"),
  ]);
  eq(r.status, "declined");
  eq(r.resolvedByRole, "coach");
});

test("unanimous — waiting on one approver → pending", () => {
  const r = resolveApproval(UNANIMOUS_META, [coach("accept", "2026-04-18T09:00Z")]);
  eq(r.status, "pending");
  if (!r.rationale.includes("parent")) throw new Error("rationale should name missing approver");
});

test("unanimous — empty chain → pending", () => {
  const r = resolveApproval(UNANIMOUS_META, []);
  eq(r.status, "pending");
});

test("unanimous — no required approvers → vacuously accepted", () => {
  const r = resolveApproval(
    { ageTier: "T3", requiredApproverRole: null, supersedeRule: "unanimous", requiredApprovers: [] },
    []
  );
  eq(r.status, "accepted");
});

test("unanimous — edit proposed without decline → edited status", () => {
  const r = resolveApproval(UNANIMOUS_META, [
    coach("accept", "2026-04-18T09:00Z"),
    parent("edit", "2026-04-18T09:05Z"),
  ]);
  eq(r.status, "edited");
});

// ── Chronological edge cases ─────────────────────────────────────────

test("out-of-order decisions still sort chronologically", () => {
  const r = resolveApproval(T1_META, [
    parent("decline", "2026-04-18T09:10Z"),
    coach("accept", "2026-04-18T09:00Z"),
  ]);
  eq(r.status, "declined");
  if (!r.rationale.includes("overrides")) throw new Error("parent after coach should override");
});

test("concurrent decisions (same timestamp) — parent decision still wins for T1", () => {
  // Sort is stable on string compare; identical timestamps preserve
  // insertion order. The parent-supersedes rule doesn't depend on
  // order, so either way parent's decision resolves.
  const ts = "2026-04-18T09:00Z";
  const r = resolveApproval(T1_META, [coach("accept", ts), parent("decline", ts)]);
  eq(r.status, "declined");
  eq(r.resolvedByRole, "parent");
});

// ── Report ──────────────────────────────────────────────────────────
console.log(`\napprovalResolver: ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log("  " + f);
  process.exit(1);
}
