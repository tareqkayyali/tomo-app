/**
 * Pure-function smoke tests for the dry-run scope filter + winner pick.
 * Mirrors what the API route does without spinning up Next.
 */

import { matchesScope, sortByPriority, type ResolvedDirective } from "@/services/instructions/resolver";

function rd(overrides: Partial<ResolvedDirective>): ResolvedDirective {
  return {
    id: overrides.id ?? "x",
    document_id: null,
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
    status: overrides.status ?? "published",
    schema_version: 1,
    updated_at: overrides.updated_at ?? "2026-04-01T00:00:00Z",
  };
}

describe("dry-run scope + winner", () => {
  test("U15-scoped identity wins over global identity for a U15 striker", () => {
    const global = rd({ id: "global", priority: 100 });
    const u15 = rd({ id: "u15", priority: 50, age_scope: ["U15"] });
    const directives = [global, u15];

    const matches = directives.filter((d) =>
      matchesScope(d, { audience: "athlete", age_band: "U15", position: "striker" }),
    );
    expect(matches.map((m) => m.id).sort()).toEqual(["global", "u15"]);

    const sorted = sortByPriority(matches.filter((d) => d.directive_type === "identity"));
    expect(sorted[0].id).toBe("u15");
  });

  test("coach scope does not pick up athlete-scoped tone", () => {
    const tone = rd({ id: "athlete-tone", directive_type: "tone", audience: "athlete" });
    const matches = [tone].filter((d) => matchesScope(d, { audience: "coach" }));
    expect(matches).toEqual([]);
  });

  test("audience='all' matches any audience", () => {
    const all = rd({ id: "all", audience: "all" });
    expect(matchesScope(all, { audience: "athlete" })).toBe(true);
    expect(matchesScope(all, { audience: "coach" })).toBe(true);
    expect(matchesScope(all, { audience: "parent" })).toBe(true);
  });

  test("position-scoped rule does not match an athlete with a different position", () => {
    const strikersOnly = rd({ position_scope: ["striker"] });
    expect(
      matchesScope(strikersOnly, { audience: "athlete", position: "defender" }),
    ).toBe(false);
    expect(
      matchesScope(strikersOnly, { audience: "athlete", position: "striker" }),
    ).toBe(true);
  });

  test("empty scope arrays are wildcards", () => {
    const wildcard = rd({});
    expect(
      matchesScope(wildcard, {
        audience: "athlete",
        sport: "padel",
        age_band: "U13",
        position: "anything",
      }),
    ).toBe(true);
  });

  test("recency tiebreak when priorities tie", () => {
    const older = rd({ id: "old", priority: 50, updated_at: "2026-01-01T00:00:00Z" });
    const newer = rd({ id: "new", priority: 50, updated_at: "2026-04-01T00:00:00Z" });
    const sorted = sortByPriority([older, newer]);
    expect(sorted[0].id).toBe("new");
  });
});
