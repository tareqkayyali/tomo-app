// Triangle — weighted input retrieval.
//
// Pure-logic function. Takes pre-fetched inputs + weight matrix + tier
// and returns the top-N inputs ranked by effective weight × event-
// scoped relevance. Caller handles the Supabase fetch; this module
// handles the ranking + domain filtering + T3 opt-in gate.
//
// Event-scoped inputs take priority over standing inputs when the
// caller passes an eventId that matches. Inputs with event_scope_id
// set to a DIFFERENT event are excluded (they were written about a
// different session and shouldn't bleed into unrelated prompts).

import type { AgeTier } from "@/types";
import {
  effectiveWeight,
  type Domain,
  type AuthorRole,
  type TriangleInput,
  type WeightedInput,
} from "./weights";

export interface WeightRow {
  age_tier: string;
  domain: string;
  author_role: string;
  base_weight: number;
  requires_t3_preference: boolean;
}

export interface VisibilityPrefRow {
  player_id: string;
  guardian_id: string;
  domain: string;
  visible: boolean;
}

export interface RetrievalOptions {
  eventId?: string;
  domains?: Domain[];    // filter to a subset of domains
  topN?: number;         // default 12
  now?: Date;
}

const DEFAULT_TOP_N = 12;

// Build a lookup of base weights keyed by (age_tier|domain|author_role).
function buildWeightMap(rows: WeightRow[]): Map<string, WeightRow> {
  const m = new Map<string, WeightRow>();
  for (const r of rows) {
    m.set(`${r.age_tier}|${r.domain}|${r.author_role}`, r);
  }
  return m;
}

function lookupWeight(
  map: Map<string, WeightRow>,
  tier: AgeTier,
  domain: Domain,
  role: AuthorRole
): WeightRow | null {
  const effective = tier === "UNKNOWN" ? "T2" : tier;
  return (
    map.get(`${tier}|${domain}|${role}`) ??
    map.get(`${effective}|${domain}|${role}`) ??
    null
  );
}

// Check the T3 opt-in preference for a (player, guardian, domain) pair.
function t3Visible(
  prefs: VisibilityPrefRow[],
  playerId: string,
  guardianId: string,
  domain: Domain
): boolean {
  for (const p of prefs) {
    if (p.player_id === playerId && p.guardian_id === guardianId && p.domain === domain) {
      return p.visible === true;
    }
  }
  return false;
}

export function rankTriangleInputs(
  inputs: TriangleInput[],
  weights: WeightRow[],
  visibilityPrefs: VisibilityPrefRow[],
  athleteId: string,
  tier: AgeTier,
  opts: RetrievalOptions = {}
): WeightedInput[] {
  const wmap = buildWeightMap(weights);
  const now = opts.now ?? new Date();
  const topN = opts.topN ?? DEFAULT_TOP_N;
  const domainFilter = opts.domains ? new Set(opts.domains) : null;

  const enriched: WeightedInput[] = [];

  for (const input of inputs) {
    // Event-scope filter: if caller specified an event, drop inputs
    // that target a DIFFERENT event. Standing inputs (event_scope_id=null)
    // always apply.
    if (
      opts.eventId &&
      input.event_scope_id !== null &&
      input.event_scope_id !== opts.eventId
    ) {
      continue;
    }

    // Domain filter.
    if (domainFilter && !domainFilter.has(input.domain)) continue;

    // Tier/domain/role weight lookup.
    const wrow = lookupWeight(wmap, tier, input.domain, input.author_role);
    if (!wrow) continue;

    // T3 opt-in gate — when the matrix marks requires_t3_preference
    // for this cell, require a matching preference row. Safety domain
    // is never gated per the seed values (2026-04-18).
    if (wrow.requires_t3_preference) {
      if (!t3Visible(visibilityPrefs, athleteId, input.author_id, input.domain)) {
        continue;
      }
    }

    const baseWeight = wrow.base_weight;
    const eff = effectiveWeight(input, baseWeight, now);
    if (eff <= 0) continue;

    // Event-scoped inputs get a relevance bump so they rank above
    // standing inputs of equal base weight when the caller passes
    // an event id.
    const relevance = opts.eventId && input.event_scope_id === opts.eventId ? 1.25 : 1.0;

    enriched.push({
      ...input,
      baseWeight,
      effectiveWeight: eff * relevance,
    });
  }

  enriched.sort((a, b) => b.effectiveWeight - a.effectiveWeight);
  return enriched.slice(0, topN);
}
