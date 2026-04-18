/**
 * Triangle Input Registry — weights + retrieval pure function tests.
 *
 * Covers:
 *   - HALF_LIFE_DAYS table is immutable and sane
 *   - ageDays / isActive / effectiveWeight math
 *   - rankTriangleInputs: domain filter, event-scope filter, T3 gate,
 *     recency sort, top-N cap, UNKNOWN tier fallback
 *
 * Run: `npx tsx backend/services/triangle/__tests__/weights_retrieval.test.ts`
 */

import {
  HALF_LIFE_DAYS,
  ageDays,
  isActive,
  effectiveWeight,
  type TriangleInput,
} from "../weights";
import {
  rankTriangleInputs,
  type WeightRow,
  type VisibilityPrefRow,
} from "../retrieval";

let passed = 0, failed = 0;
const failures: string[] = [];
function test(name: string, fn: () => void): void {
  try { fn(); passed++; } catch (e) {
    failed++;
    failures.push(`${name} — ${e instanceof Error ? e.message : String(e)}`);
  }
}
function eq<T>(a: T, b: T, ctx?: string): void {
  if (a !== b) throw new Error(`${ctx ? ctx + ": " : ""}expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function near(a: number, b: number, tol = 1e-6, ctx?: string): void {
  if (Math.abs(a - b) > tol) throw new Error(`${ctx ? ctx + ": " : ""}expected ~${b}, got ${a}`);
}

const NOW = new Date("2026-04-18T12:00:00Z");

function mkInput(overrides: Partial<TriangleInput> = {}): TriangleInput {
  return {
    id: "i1",
    athlete_id: "athlete1",
    author_id: "coach1",
    author_role: "coach",
    domain: "training",
    input_type: "standing_instruction",
    body: "In-season taper; keep intensity <80%.",
    event_scope_id: null,
    effective_from: NOW.toISOString(),
    effective_until: null,
    retracted_at: null,
    created_at: NOW.toISOString(),
    ...overrides,
  };
}

// ── HALF_LIFE_DAYS table ─────────────────────────────────────────────

test("HALF_LIFE_DAYS has entries for all input_types", () => {
  const keys = Object.keys(HALF_LIFE_DAYS).sort();
  eq(keys.join(","), "constraint,goal,observation,preference,standing_instruction");
});

test("observation decays fastest (14d)", () => eq(HALF_LIFE_DAYS.observation, 14));
test("standing_instruction decays slowest (180d)", () => eq(HALF_LIFE_DAYS.standing_instruction, 180));

// ── isActive ─────────────────────────────────────────────────────────

test("isActive true for just-created non-retracted input", () => {
  eq(isActive(mkInput(), NOW), true);
});

test("isActive false when retracted", () => {
  eq(isActive(mkInput({ retracted_at: NOW.toISOString() }), NOW), false);
});

test("isActive false when effective_from in the future", () => {
  const future = new Date(NOW.getTime() + 86_400_000).toISOString();
  eq(isActive(mkInput({ effective_from: future }), NOW), false);
});

test("isActive false when effective_until passed", () => {
  const past = new Date(NOW.getTime() - 86_400_000).toISOString();
  eq(isActive(mkInput({ effective_until: past }), NOW), false);
});

// ── effectiveWeight ──────────────────────────────────────────────────

test("fresh input returns close to base weight", () => {
  const w = effectiveWeight(mkInput(), 1.0, NOW);
  near(w, 1.0, 1e-3);
});

test("standing_instruction at 180 days (one half-life) → 0.5 × base", () => {
  const created = new Date(NOW.getTime() - 180 * 86_400_000).toISOString();
  const w = effectiveWeight(mkInput({ created_at: created }), 1.0, NOW);
  near(w, 0.5, 1e-3);
});

test("observation at 14 days (one half-life for obs) → 0.5 × base", () => {
  const created = new Date(NOW.getTime() - 14 * 86_400_000).toISOString();
  const w = effectiveWeight(mkInput({ input_type: "observation", created_at: created }), 1.0, NOW);
  near(w, 0.5, 1e-3);
});

test("retracted input → 0 regardless of base", () => {
  const w = effectiveWeight(mkInput({ retracted_at: NOW.toISOString() }), 1.0, NOW);
  eq(w, 0);
});

test("base weight 0 → 0", () => {
  const w = effectiveWeight(mkInput(), 0, NOW);
  eq(w, 0);
});

// ── ageDays ──────────────────────────────────────────────────────────

test("ageDays for just-created is 0", () => near(ageDays(mkInput(), NOW), 0));

test("ageDays clamps to 0 for future created_at", () => {
  const future = new Date(NOW.getTime() + 86_400_000).toISOString();
  near(ageDays(mkInput({ created_at: future }), NOW), 0);
});

// ── rankTriangleInputs ──────────────────────────────────────────────

const WEIGHTS: WeightRow[] = [
  { age_tier: "T2", domain: "training",  author_role: "coach",  base_weight: 1.00, requires_t3_preference: false },
  { age_tier: "T2", domain: "training",  author_role: "parent", base_weight: 0.90, requires_t3_preference: false },
  { age_tier: "T2", domain: "academic",  author_role: "coach",  base_weight: 0.50, requires_t3_preference: false },
  { age_tier: "T2", domain: "academic",  author_role: "parent", base_weight: 1.00, requires_t3_preference: false },
  { age_tier: "T2", domain: "wellbeing", author_role: "coach",  base_weight: 0.80, requires_t3_preference: false },
  { age_tier: "T2", domain: "safety",    author_role: "coach",  base_weight: 1.00, requires_t3_preference: false },
  { age_tier: "T2", domain: "logistics", author_role: "coach",  base_weight: 0.80, requires_t3_preference: false },
  { age_tier: "T3", domain: "training",  author_role: "coach",  base_weight: 1.00, requires_t3_preference: false },
  { age_tier: "T3", domain: "training",  author_role: "parent", base_weight: 0.50, requires_t3_preference: true  },
  { age_tier: "T3", domain: "safety",    author_role: "parent", base_weight: 1.00, requires_t3_preference: false },
];

test("rank: domain filter drops out-of-scope inputs", () => {
  const inputs = [
    mkInput({ id: "a", domain: "training" }),
    mkInput({ id: "b", domain: "academic", author_role: "parent" }),
  ];
  const r = rankTriangleInputs(inputs, WEIGHTS, [], "athlete1", "T2", {
    domains: ["training"],
    now: NOW,
  });
  eq(r.length, 1);
  eq(r[0].id, "a");
});

test("rank: event-scope filter keeps matching + standing, drops other events", () => {
  const inputs = [
    mkInput({ id: "standing", event_scope_id: null }),
    mkInput({ id: "match_event", event_scope_id: "event-123" }),
    mkInput({ id: "other_event", event_scope_id: "event-999" }),
  ];
  const r = rankTriangleInputs(inputs, WEIGHTS, [], "athlete1", "T2", {
    eventId: "event-123",
    now: NOW,
  });
  const ids = r.map((x) => x.id).sort();
  eq(ids.join(","), "match_event,standing");
});

test("rank: event-scoped input ranks above equally-weighted standing input", () => {
  const inputs = [
    mkInput({ id: "standing", event_scope_id: null }),
    mkInput({ id: "scoped", event_scope_id: "event-123" }),
  ];
  const r = rankTriangleInputs(inputs, WEIGHTS, [], "athlete1", "T2", {
    eventId: "event-123",
    now: NOW,
  });
  eq(r[0].id, "scoped");
});

test("rank: T3 parent training input dropped without opt-in", () => {
  const inputs = [mkInput({ author_role: "parent", domain: "training" })];
  const r = rankTriangleInputs(inputs, WEIGHTS, [], "athlete1", "T3", { now: NOW });
  eq(r.length, 0);
});

test("rank: T3 parent training input included WITH opt-in", () => {
  const inputs = [mkInput({ author_role: "parent", domain: "training" })];
  const prefs: VisibilityPrefRow[] = [
    { player_id: "athlete1", guardian_id: "coach1", domain: "training", visible: true },
  ];
  const r = rankTriangleInputs(inputs, WEIGHTS, prefs, "athlete1", "T3", { now: NOW });
  eq(r.length, 1);
});

test("rank: T3 parent safety input always included (no opt-in required)", () => {
  const inputs = [mkInput({ author_role: "parent", domain: "safety" })];
  const r = rankTriangleInputs(inputs, WEIGHTS, [], "athlete1", "T3", { now: NOW });
  eq(r.length, 1);
});

test("rank: UNKNOWN tier falls back to T2 weights", () => {
  const inputs = [mkInput({ domain: "training" })];
  const r = rankTriangleInputs(inputs, WEIGHTS, [], "athlete1", "UNKNOWN", { now: NOW });
  eq(r.length, 1);
  near(r[0].baseWeight, 1.00, 1e-3);
});

test("rank: top-N cap", () => {
  const inputs: TriangleInput[] = [];
  for (let i = 0; i < 20; i++) {
    inputs.push(mkInput({ id: `n${i}`, domain: "training" }));
  }
  const r = rankTriangleInputs(inputs, WEIGHTS, [], "athlete1", "T2", {
    topN: 5, now: NOW,
  });
  eq(r.length, 5);
});

test("rank: retracted input excluded", () => {
  const inputs = [
    mkInput({ id: "active" }),
    mkInput({ id: "retracted", retracted_at: NOW.toISOString() }),
  ];
  const r = rankTriangleInputs(inputs, WEIGHTS, [], "athlete1", "T2", { now: NOW });
  eq(r.length, 1);
  eq(r[0].id, "active");
});

test("rank: newer input decays less → ranks higher", () => {
  const oneMonthAgo = new Date(NOW.getTime() - 30 * 86_400_000).toISOString();
  const inputs = [
    mkInput({ id: "old", created_at: oneMonthAgo }),
    mkInput({ id: "new" }),
  ];
  const r = rankTriangleInputs(inputs, WEIGHTS, [], "athlete1", "T2", { now: NOW });
  eq(r[0].id, "new");
});

test("rank: missing weight row → input dropped (no silent default)", () => {
  const inputs = [mkInput({ domain: "training" })];
  // WEIGHTS has no 'T2/training/system' row (system isn't an author role).
  const r = rankTriangleInputs(
    inputs,
    // Intentionally strip all rows for T2/training.
    WEIGHTS.filter((w) => !(w.age_tier === "T2" && w.domain === "training")),
    [],
    "athlete1",
    "T2",
    { now: NOW }
  );
  eq(r.length, 0);
});

// ── Report ──────────────────────────────────────────────────────────
console.log(`\nweights + retrieval: ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log("  " + f);
  process.exit(1);
}
