/**
 * Conflict Detection — Tier 1
 *
 * Detects when two or more directives in the current draft set would
 * compete for the same `byType()` slot at runtime: same directive_type
 * + identical scope arrays. The lowest-priority + most-recent rule wins;
 * everything else is silently shadowed by the resolver today. This module
 * mirrors the resolver's tiebreak (via sortByPriority) so the CMS view
 * agrees with runtime by construction.
 *
 * Scope-intersection (Tier 2) and cross-type contradictions (Tier 3) are
 * deliberately out of scope here.
 */

import { sortByPriority } from "@/services/instructions/resolver";
import type { MethodologyDirective } from "@/services/admin/directiveService";
import type { DirectiveType } from "@/lib/validation/admin/directiveSchemas";

/**
 * Merge semantics — how the runtime actually consumes a directive_type.
 *
 *   winner-only:  resolver picks one (lowest priority + most recent). Two
 *                 rules sharing scope → real conflict; only the winner runs.
 *   keyed-winner: resolver picks one per `payload[key_field]` value. Same
 *                 type + scope + key_field value → conflict; different
 *                 values → coexist.
 *   additive:     resolver iterates and stacks all matches. Two rules
 *                 sharing scope → both run. Never a conflict.
 *
 * Grounded in an audit of the TS + Python resolver consumers (see
 * resolver.ts and ai-service/app/instructions/resolver.py). Default for
 * UNKNOWN types is winner-only — safest UX (it surfaces ambiguity rather
 * than silently merging).
 */
export type MergeClass = "winner-only" | "keyed-winner" | "additive";

export interface MergeSemantics {
  class: MergeClass;
  /** Required when class === 'keyed-winner'. The payload field that distinguishes rules. */
  key_field?: string;
  /** Plain-English line shown to the PD on the conflicts page. */
  note: string;
}

export const MERGE_SEMANTICS: Record<DirectiveType, MergeSemantics> = {
  // ── Additive (all rules apply at runtime) ─────────────────────────────
  escalation: {
    class: "additive",
    note: "Every matching escalation fires independently — all rules apply.",
  },
  dashboard_section: {
    class: "additive",
    note: "Every matching card renders — all rules apply.",
  },
  signal_definition: {
    class: "additive",
    note: "Every matching alert is evaluated — all rules apply.",
  },
  program_rule: {
    class: "additive",
    note: "Every matching program rule applies independently.",
  },

  // ── Keyed-winner (winner per sub-key) ─────────────────────────────────
  routing_intent: {
    class: "keyed-winner",
    key_field: "intent_id",
    note: "One winner per intent. Rules for different intents coexist.",
  },

  // ── Winner-only (one rule wins) ───────────────────────────────────────
  identity: { class: "winner-only", note: "Only one persona applies." },
  response_shape: { class: "winner-only", note: "Only one reply shape applies." },
  rag_policy: { class: "winner-only", note: "Only one RAG policy applies." },
  memory_policy: { class: "winner-only", note: "Only one memory policy applies." },
  routing_classifier: { class: "winner-only", note: "Only one classifier applies." },
  coach_dashboard_policy: {
    class: "winner-only",
    note: "Only one coach dashboard policy applies.",
  },
  parent_report_policy: {
    class: "winner-only",
    note: "Only one parent report policy applies.",
  },
  surface_policy: { class: "winner-only", note: "Only one surface policy per audience applies." },

  // ── Additive at runtime (resolver iterates + merges all matches) ─────
  // Block lists union; numeric caps take MIN; restrictive flags (blocking,
  // conservative) win over permissive. See ai-service/app/instructions/resolver.py.
  tone: {
    class: "additive",
    note: "Every matching tone rule applies — banned phrases, patterns, and acronym scaffolds all stack.",
  },
  recommendation_policy: {
    class: "additive",
    note: "Every matching recommendation policy applies — block / mandatory categories union, the lowest cap wins.",
  },
  guardrail_phv: {
    class: "additive",
    note: "Every matching PHV guardrail applies — block lists union and the most restrictive flags win.",
  },

  // ── UNKNOWN runtime consumer — default winner-only (safest) ───────────
  guardrail_age: { class: "winner-only", note: "Only one rule applies." },
  guardrail_load: { class: "winner-only", note: "Only one rule applies." },
  safety_gate: { class: "winner-only", note: "Only one rule applies." },
  threshold: { class: "winner-only", note: "Only one rule applies." },
  performance_model: { class: "winner-only", note: "Only one rule applies." },
  mode_definition: { class: "winner-only", note: "Only one rule applies." },
  planning_policy: { class: "winner-only", note: "Only one rule applies." },
  scheduling_policy: { class: "winner-only", note: "Only one rule applies." },
  meta_parser: { class: "winner-only", note: "Only one rule applies." },
  meta_conflict: { class: "winner-only", note: "Only one rule applies." },

  // ── Phase 8: Bucketed verticals — additive guidance ──────────────────
  // Each vertical accumulates guidance — multiple sleep rules, nutrition
  // rules, etc. all apply. Conflict detection treats them as informational
  // stacks, not real conflicts.
  sleep_policy: {
    class: "additive",
    note: "Every matching sleep rule applies — recommendations stack.",
  },
  nutrition_policy: {
    class: "additive",
    note: "Every matching nutrition rule applies — block lists union, recommendations stack.",
  },
  wellbeing_policy: {
    class: "additive",
    note: "Every matching mental-health rule applies — triggers and response actions stack.",
  },
  injury_policy: {
    class: "additive",
    note: "Every matching injury rule applies — RTP stages and blocks stack.",
  },
  career_policy: {
    class: "additive",
    note: "Every matching career-guidance rule applies — guidance stacks.",
  },
};

export type ResolutionMode = "shadow" | "stack";

export interface Collision {
  /** Stable group identifier — useful for stable React keys / dedup. */
  group_key: string;
  directive_type: MethodologyDirective["directive_type"];
  audience: MethodologyDirective["audience"];
  /** Plain-English summary of the shared scope, e.g. "U15 strikers" / "Everyone". */
  scope_summary: string;
  /**
   * 'shadow' = real conflict (winner-only or keyed-winner same key) — only
   *            the winner runs, the rest are silently dropped.
   * 'stack'  = informational (additive types) — all rules apply at runtime.
   */
  resolution: ResolutionMode;
  /** Per-type runtime note — explain what 'stack' means or why this shadows. */
  note: string;
  winner: MethodologyDirective;
  shadowed: MethodologyDirective[];
}

const POSITION_LABELS: Record<string, string> = {
  st: "Strikers",
  cf: "Strikers",
  striker: "Strikers",
  forward: "Forwards",
  winger: "Wingers",
  cm: "Central midfielders",
  cdm: "Defensive midfielders",
  cam: "Attacking midfielders",
  midfielder: "Midfielders",
  cb: "Centre-backs",
  defender: "Defenders",
  fb: "Full-backs",
  fullback: "Full-backs",
  gk: "Goalkeepers",
  goalkeeper: "Goalkeepers",
  pg: "Point guards",
  sg: "Shooting guards",
  sf: "Small forwards",
  pf: "Power forwards",
  c: "Centers",
};

const MODE_LABELS: Record<string, string> = {
  build: "Build phase",
  taper: "Taper phase",
  recovery: "Recovery phase",
  pre_match: "Pre-match",
  post_match: "Post-match",
  in_season: "In-season",
  off_season: "Off-season",
  competition: "Competition phase",
};

const PHV_LABELS: Record<string, string> = {
  pre_phv: "pre-growth-spurt",
  mid_phv: "mid-growth-spurt",
  post_phv: "post-growth-spurt",
  unknown: "growth stage unknown",
};

const AUDIENCE_PHRASE: Record<MethodologyDirective["audience"], string> = {
  athlete: "athletes",
  coach: "coaches",
  parent: "parents",
  all: "everyone",
};

function titleCase(s: string): string {
  return s
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function friendlyPosition(p: string): string {
  return POSITION_LABELS[p.toLowerCase()] ?? titleCase(p);
}

function friendlyMode(m: string): string {
  return MODE_LABELS[m.toLowerCase()] ?? titleCase(m);
}

function friendlyPhv(p: string): string {
  return PHV_LABELS[p.toLowerCase()] ?? p;
}

function joinList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

/** Plain-English summary of a directive's combined scope. */
export function describeScope(d: Pick<
  MethodologyDirective,
  "audience" | "sport_scope" | "age_scope" | "phv_scope" | "position_scope" | "mode_scope"
>): string {
  const parts: string[] = [];

  // Position + age + sport are usually the most identifying.
  if (d.position_scope.length > 0) {
    parts.push(joinList(d.position_scope.map(friendlyPosition)));
  }
  if (d.age_scope.length > 0) {
    parts.push(joinList(d.age_scope));
  }
  if (d.sport_scope.length > 0) {
    parts.push(joinList(d.sport_scope.map(titleCase)));
  }
  if (d.phv_scope.length > 0) {
    parts.push(`(${joinList(d.phv_scope.map(friendlyPhv))})`);
  }
  if (d.mode_scope.length > 0) {
    parts.push(`during ${joinList(d.mode_scope.map(friendlyMode)).toLowerCase()}`);
  }

  if (parts.length === 0) {
    // No scope arrays at all — applies to whoever the audience field names.
    return d.audience === "all" ? "Everyone" : `All ${AUDIENCE_PHRASE[d.audience]}`;
  }

  // Audience prefix only if non-default ("athlete" is the implicit default).
  const audiencePrefix = d.audience === "athlete" || d.audience === "all" ? "" : `${AUDIENCE_PHRASE[d.audience]}: `;
  return `${audiencePrefix}${parts.join(" ")}`.trim();
}

function groupKeyOf(d: MethodologyDirective): string {
  const semantics = MERGE_SEMANTICS[d.directive_type];
  // For keyed-winner types, the sub-key value is part of the group identity.
  const subKey =
    semantics?.class === "keyed-winner" && semantics.key_field
      ? ((d.payload?.[semantics.key_field] as unknown) ?? null)
      : null;
  return JSON.stringify({
    type: d.directive_type,
    audience: d.audience,
    sport: [...d.sport_scope].sort(),
    age: [...d.age_scope].sort(),
    phv: [...d.phv_scope].sort(),
    position: [...d.position_scope].sort(),
    mode: [...d.mode_scope].sort(),
    sub_key: subKey,
  });
}

function buildGroup(
  group_key: string,
  members: MethodologyDirective[],
  resolution: ResolutionMode,
): Collision {
  const sorted = sortByPriority(members);
  const [winner, ...shadowed] = sorted;
  const semantics = MERGE_SEMANTICS[winner.directive_type];
  return {
    group_key,
    directive_type: winner.directive_type,
    audience: winner.audience,
    scope_summary: describeScope(winner),
    resolution,
    note: semantics?.note ?? "Only one rule applies.",
    winner,
    shadowed,
  };
}

/**
 * Group same-type-same-scope directives and classify each group by the
 * runtime's actual merge semantics. Real conflicts (one winner, rest dropped)
 * come back as `resolution: 'shadow'`. Informational stacks (additive types
 * where every rule applies) come back as `resolution: 'stack'`.
 *
 * Single-member groups are not returned (nothing to report).
 */
export function detectCollisions(directives: MethodologyDirective[]): Collision[] {
  const groups = new Map<string, MethodologyDirective[]>();
  for (const d of directives) {
    const key = groupKeyOf(d);
    const arr = groups.get(key);
    if (arr) arr.push(d);
    else groups.set(key, [d]);
  }

  const out: Collision[] = [];
  for (const [group_key, members] of groups) {
    if (members.length < 2) continue;
    const semantics = MERGE_SEMANTICS[members[0].directive_type];
    const resolution: ResolutionMode = semantics?.class === "additive" ? "stack" : "shadow";
    out.push(buildGroup(group_key, members, resolution));
  }

  return out;
}

/**
 * If `target` is currently shadowed by another directive in `all`, return
 * the collision it belongs to. Otherwise null.
 *
 * Additive types never shadow — they stack at runtime, so the banner stays
 * silent for them. (No need to scare the PD when both rules will apply.)
 */
export function isShadowed(
  target: MethodologyDirective,
  all: MethodologyDirective[],
): Collision | null {
  const semantics = MERGE_SEMANTICS[target.directive_type];
  if (semantics?.class === "additive") return null;

  const key = groupKeyOf(target);
  const peers = all.filter((d) => groupKeyOf(d) === key);
  if (peers.length < 2) return null;
  const sorted = sortByPriority(peers);
  if (sorted[0].id === target.id) return null;
  return buildGroup(key, peers, "shadow");
}
