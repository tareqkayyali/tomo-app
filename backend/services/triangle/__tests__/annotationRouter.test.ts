/**
 * annotationRouter — pure function tests.
 *
 * Run: `npx tsx backend/services/triangle/__tests__/annotationRouter.test.ts`
 */

import { routeAnnotation } from "../annotationRouter";
import type {
  AnnotationForRouting,
  RelationshipRef,
  RecipientSpec,
} from "../annotationRouter";

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

function eq<T>(actual: T, expected: T, ctx?: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${ctx ? ctx + ": " : ""}expected ${e}, got ${a}`);
}

function same(actual: RecipientSpec[], expected: RecipientSpec[]): void {
  const key = (r: RecipientSpec) => `${r.user_id}:${r.recipient_role}`;
  const a = actual.map(key).sort();
  const e = expected.map(key).sort();
  eq(a, e, "recipient set");
}

// ── Fixtures ─────────────────────────────────────────────────────────
const ATHLETE = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const COACH   = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const PARENT  = "pppppppp-pppp-pppp-pppp-pppppppppppp";
const OTHER   = "00000000-0000-0000-0000-000000000000";

const REL_COACH: RelationshipRef = { guardian_id: COACH, relationship_type: "coach", status: "accepted" };
const REL_PARENT: RelationshipRef = { guardian_id: PARENT, relationship_type: "parent", status: "accepted" };

function base(overrides: Partial<AnnotationForRouting> = {}): AnnotationForRouting {
  return {
    athlete_id: ATHLETE,
    author_id: COACH,
    author_role: "coach",
    visibility: { athlete: true, coach: true, parent: true },
    ...overrides,
  };
}

// ── Basic routing ────────────────────────────────────────────────────

test("coach-authored → athlete + parent (minus coach author)", () => {
  const r = routeAnnotation(base(), [REL_COACH, REL_PARENT]);
  same(r, [
    { user_id: ATHLETE, recipient_role: "athlete" },
    { user_id: PARENT, recipient_role: "parent" },
  ]);
});

test("parent-authored → athlete + coach (minus parent author)", () => {
  const r = routeAnnotation(
    base({ author_id: PARENT, author_role: "parent" }),
    [REL_COACH, REL_PARENT]
  );
  same(r, [
    { user_id: ATHLETE, recipient_role: "athlete" },
    { user_id: COACH, recipient_role: "coach" },
  ]);
});

test("athlete-authored → coach + parent (minus self)", () => {
  const r = routeAnnotation(
    base({ author_id: ATHLETE, author_role: "athlete" }),
    [REL_COACH, REL_PARENT]
  );
  same(r, [
    { user_id: COACH, recipient_role: "coach" },
    { user_id: PARENT, recipient_role: "parent" },
  ]);
});

test("system-authored with no guardians → athlete only", () => {
  const r = routeAnnotation(
    base({ author_id: "system", author_role: "system" }),
    []
  );
  same(r, [{ user_id: ATHLETE, recipient_role: "athlete" }]);
});

// ── Visibility scoping ───────────────────────────────────────────────

test("visibility.parent=false hides from parent", () => {
  const r = routeAnnotation(
    base({ visibility: { athlete: true, coach: true, parent: false } }),
    [REL_COACH, REL_PARENT]
  );
  same(r, [{ user_id: ATHLETE, recipient_role: "athlete" }]);
});

test("visibility.coach=false hides from coach (parent-authored note)", () => {
  const r = routeAnnotation(
    base({
      author_id: PARENT,
      author_role: "parent",
      visibility: { athlete: true, coach: false, parent: true },
    }),
    [REL_COACH, REL_PARENT]
  );
  same(r, [{ user_id: ATHLETE, recipient_role: "athlete" }]);
});

test("visibility.athlete=false hides from athlete", () => {
  const r = routeAnnotation(
    base({ visibility: { athlete: false, coach: true, parent: true } }),
    [REL_COACH, REL_PARENT]
  );
  same(r, [{ user_id: PARENT, recipient_role: "parent" }]);
});

test("missing visibility key defaults open", () => {
  const r = routeAnnotation(base({ visibility: {} }), [REL_COACH, REL_PARENT]);
  same(r, [
    { user_id: ATHLETE, recipient_role: "athlete" },
    { user_id: PARENT, recipient_role: "parent" },
  ]);
});

// ── Author suppression ───────────────────────────────────────────────

test("author is never a recipient even if accepted guardian", () => {
  // Coach writes the note; coach relationship exists; coach should
  // NOT receive their own echo.
  const r = routeAnnotation(base(), [REL_COACH, REL_PARENT]);
  if (r.some((x) => x.user_id === COACH)) throw new Error("author was echoed");
});

test("athlete as self-author is not a recipient", () => {
  const r = routeAnnotation(
    base({ author_id: ATHLETE, author_role: "athlete" }),
    [REL_COACH, REL_PARENT]
  );
  if (r.some((x) => x.user_id === ATHLETE)) throw new Error("self-echo");
});

// ── Edge cases ───────────────────────────────────────────────────────

test("pending / revoked relationships are ignored", () => {
  const r = routeAnnotation(base(), [
    { guardian_id: COACH, relationship_type: "coach", status: "pending" },
    { guardian_id: PARENT, relationship_type: "parent", status: "revoked" },
  ]);
  same(r, [{ user_id: ATHLETE, recipient_role: "athlete" }]);
});

test("duplicate relationship rows dedupe on guardian_id", () => {
  const r = routeAnnotation(base(), [REL_COACH, REL_PARENT, REL_PARENT]);
  const parents = r.filter((x) => x.recipient_role === "parent");
  eq(parents.length, 1, "parent count");
});

test("unknown relationship_type is skipped", () => {
  const r = routeAnnotation(base(), [
    REL_COACH,
    // Deliberately invalid relationship_type to assert the router
    // skips unknown roles. Cast via unknown since the runtime value
    // violates the narrow union.
    { guardian_id: OTHER, relationship_type: "sibling" as unknown as "coach", status: "accepted" },
  ]);
  const others = r.filter((x) => x.user_id === OTHER);
  eq(others.length, 0, "other count");
});

test("empty relationships → athlete only (when author is not athlete)", () => {
  const r = routeAnnotation(base(), []);
  same(r, [{ user_id: ATHLETE, recipient_role: "athlete" }]);
});

// ── Report ──────────────────────────────────────────────────────────
console.log(`\nannotationRouter: ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log("  " + f);
  process.exit(1);
}
