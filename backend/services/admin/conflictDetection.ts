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

export interface Collision {
  /** Stable group identifier — useful for stable React keys / dedup. */
  group_key: string;
  directive_type: MethodologyDirective["directive_type"];
  audience: MethodologyDirective["audience"];
  /** Plain-English summary of the shared scope, e.g. "U15 strikers" / "Everyone". */
  scope_summary: string;
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
  return JSON.stringify({
    type: d.directive_type,
    audience: d.audience,
    sport: [...d.sport_scope].sort(),
    age: [...d.age_scope].sort(),
    phv: [...d.phv_scope].sort(),
    position: [...d.position_scope].sort(),
    mode: [...d.mode_scope].sort(),
  });
}

/**
 * Group directives that would collide at runtime (same type + same scope)
 * and return one Collision per group with 2+ members.
 */
export function detectCollisions(directives: MethodologyDirective[]): Collision[] {
  const groups = new Map<string, MethodologyDirective[]>();
  for (const d of directives) {
    const key = groupKeyOf(d);
    const arr = groups.get(key);
    if (arr) arr.push(d);
    else groups.set(key, [d]);
  }

  const collisions: Collision[] = [];
  for (const [group_key, members] of groups) {
    if (members.length < 2) continue;
    const sorted = sortByPriority(members);
    const [winner, ...shadowed] = sorted;
    collisions.push({
      group_key,
      directive_type: winner.directive_type,
      audience: winner.audience,
      scope_summary: describeScope(winner),
      winner,
      shadowed,
    });
  }

  return collisions;
}

/**
 * If `target` is currently shadowed by another directive in `all`, return
 * the collision it belongs to. Otherwise null. Used by the per-directive
 * banner on the edit page.
 */
export function isShadowed(
  target: MethodologyDirective,
  all: MethodologyDirective[],
): Collision | null {
  const key = groupKeyOf(target);
  const peers = all.filter((d) => groupKeyOf(d) === key);
  if (peers.length < 2) return null;
  const sorted = sortByPriority(peers);
  if (sorted[0].id === target.id) return null;
  const [winner, ...shadowed] = sorted;
  return {
    group_key: key,
    directive_type: winner.directive_type,
    audience: winner.audience,
    scope_summary: describeScope(winner),
    winner,
    shadowed,
  };
}
