import {
  detectCollisions,
  isShadowed,
  describeScope,
} from "@/services/admin/conflictDetection";
import type { MethodologyDirective } from "@/services/admin/directiveService";

function dir(overrides: Partial<MethodologyDirective>): MethodologyDirective {
  return {
    id: overrides.id ?? "d-x",
    document_id: null,
    schema_version: 1,
    directive_type: overrides.directive_type ?? "identity",
    audience: overrides.audience ?? "athlete",
    sport_scope: overrides.sport_scope ?? [],
    age_scope: overrides.age_scope ?? [],
    phv_scope: overrides.phv_scope ?? [],
    position_scope: overrides.position_scope ?? [],
    mode_scope: overrides.mode_scope ?? [],
    priority: overrides.priority ?? 100,
    payload: overrides.payload ?? {},
    source_excerpt: overrides.source_excerpt ?? null,
    confidence: null,
    status: overrides.status ?? "approved",
    approved_by: null,
    approved_at: null,
    retired_at: null,
    created_at: "2026-04-01T00:00:00Z",
    updated_at: overrides.updated_at ?? "2026-04-01T00:00:00Z",
    updated_by: null,
    change_reason: null,
    ...overrides,
  } as MethodologyDirective;
}

describe("detectCollisions", () => {
  test("two same-type same-scope rules → 1 shadow collision", () => {
    const a = dir({ id: "a", priority: 100 });
    const b = dir({ id: "b", priority: 50 });
    const out = detectCollisions([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0].resolution).toBe("shadow");
    expect(out[0].winner.id).toBe("b");
    expect(out[0].shadowed.map((s) => s.id)).toEqual(["a"]);
  });

  test("three rules, distinct priorities → winner is lowest priority", () => {
    const a = dir({ id: "a", priority: 200 });
    const b = dir({ id: "b", priority: 50 });
    const c = dir({ id: "c", priority: 100 });
    const out = detectCollisions([a, b, c]);
    expect(out).toHaveLength(1);
    expect(out[0].winner.id).toBe("b");
    expect(out[0].shadowed.map((s) => s.id)).toEqual(["c", "a"]);
  });

  test("same type, different scope → no collisions", () => {
    const a = dir({ id: "a", age_scope: ["U15"] });
    const b = dir({ id: "b", age_scope: ["U17"] });
    expect(detectCollisions([a, b])).toEqual([]);
  });

  test("same type+scope+priority → recency tiebreak (newer wins)", () => {
    const older = dir({ id: "old", priority: 100, updated_at: "2026-01-01T00:00:00Z" });
    const newer = dir({ id: "new", priority: 100, updated_at: "2026-04-01T00:00:00Z" });
    const out = detectCollisions([older, newer]);
    expect(out).toHaveLength(1);
    expect(out[0].winner.id).toBe("new");
  });

  test("empty input → empty output", () => {
    expect(detectCollisions([])).toEqual([]);
  });

  test("both wildcard scope (all empty) is still a collision group", () => {
    const a = dir({ id: "a" });
    const b = dir({ id: "b", priority: 50 });
    const out = detectCollisions([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0].scope_summary).toMatch(/Everyone|All athletes/);
  });

  test("identical scope under different array order is grouped together", () => {
    const a = dir({ id: "a", sport_scope: ["football", "soccer"], priority: 100 });
    const b = dir({ id: "b", sport_scope: ["soccer", "football"], priority: 50 });
    const out = detectCollisions([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0].winner.id).toBe("b");
  });

  test("different audience → not the same group", () => {
    const a = dir({ id: "a", audience: "athlete" });
    const b = dir({ id: "b", audience: "coach" });
    expect(detectCollisions([a, b])).toEqual([]);
  });

  test("additive types stack — resolution is 'stack' not 'shadow'", () => {
    const a = dir({ id: "a", directive_type: "escalation", priority: 100 });
    const b = dir({ id: "b", directive_type: "escalation", priority: 50 });
    const out = detectCollisions([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0].resolution).toBe("stack");
  });

  test("dashboard_section / signal_definition / program_rule all stack", () => {
    for (const t of ["dashboard_section", "signal_definition", "program_rule"] as const) {
      const a = dir({ id: "a", directive_type: t });
      const b = dir({ id: "b", directive_type: t, priority: 50 });
      const out = detectCollisions([a, b]);
      expect(out).toHaveLength(1);
      expect(out[0].resolution).toBe("stack");
    }
  });

  test("routing_intent: same intent_id collides; different intent_id does not", () => {
    const same1 = dir({
      id: "same1",
      directive_type: "routing_intent",
      priority: 100,
      payload: { intent_id: "log_pain" },
    });
    const same2 = dir({
      id: "same2",
      directive_type: "routing_intent",
      priority: 50,
      payload: { intent_id: "log_pain" },
    });
    const different = dir({
      id: "diff",
      directive_type: "routing_intent",
      payload: { intent_id: "log_session" },
    });
    const out = detectCollisions([same1, same2, different]);
    expect(out).toHaveLength(1);
    expect(out[0].resolution).toBe("shadow");
    expect(out[0].winner.id).toBe("same2");
    expect(out[0].shadowed.map((s) => s.id)).toEqual(["same1"]);
  });
});

describe("isShadowed", () => {
  test("returns null when target is the winner", () => {
    const winner = dir({ id: "w", priority: 50 });
    const loser = dir({ id: "l", priority: 100 });
    expect(isShadowed(winner, [winner, loser])).toBeNull();
  });

  test("returns the collision when target is shadowed (winner-only type)", () => {
    const winner = dir({ id: "w", priority: 50 });
    const loser = dir({ id: "l", priority: 100 });
    const c = isShadowed(loser, [winner, loser]);
    expect(c).not.toBeNull();
    expect(c?.winner.id).toBe("w");
    expect(c?.resolution).toBe("shadow");
  });

  test("additive types never shadow — banner stays silent", () => {
    const a = dir({ id: "a", directive_type: "escalation", priority: 50 });
    const b = dir({ id: "b", directive_type: "escalation", priority: 100 });
    expect(isShadowed(b, [a, b])).toBeNull();
  });

  test("returns null when no peers exist", () => {
    const only = dir({ id: "only" });
    expect(isShadowed(only, [only])).toBeNull();
  });
});

describe("describeScope", () => {
  test("all empty → 'Everyone' for audience=all", () => {
    expect(describeScope({ audience: "all", sport_scope: [], age_scope: [], phv_scope: [], position_scope: [], mode_scope: [] })).toBe("Everyone");
  });

  test("known position is friendly-labeled", () => {
    const out = describeScope({
      audience: "athlete",
      sport_scope: [],
      age_scope: ["U15"],
      phv_scope: [],
      position_scope: ["striker"],
      mode_scope: [],
    });
    expect(out).toContain("Strikers");
    expect(out).toContain("U15");
  });
});
