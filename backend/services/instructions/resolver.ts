/**
 * Methodology Resolver — TS side (Phase 7).
 *
 * The backend equivalent of `ai-service/app/instructions/resolver.py`.
 * Loads the live methodology snapshot once with a 60s TTL cache, exposes
 * scope-filtered, typed accessors for each directive type the runtime
 * cares about: dashboard_section, signal_definition, program_rule.
 *
 * Hard-cutover semantics: when an injection point is migrated in Phase 7
 * the legacy DB read is *deleted*. The snapshot — populated by the Phase
 * 7.0a one-shot migration — is the only source. If a required directive
 * is missing, accessors return an empty list rather than fall back to
 * legacy data.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";

// ── Types ────────────────────────────────────────────────────────────────

export type Audience = "athlete" | "coach" | "parent" | "all";

export interface ResolvedDirective {
  id: string;
  document_id: string | null;
  directive_type: string;
  audience: Audience;
  sport_scope: string[];
  age_scope: string[];
  phv_scope: string[];
  position_scope: string[];
  mode_scope: string[];
  priority: number;
  payload: Record<string, unknown>;
  source_excerpt: string | null;
  status: string;
  schema_version: number;
  updated_at: string | null;
}

export interface ResolveScope {
  audience?: Audience;
  sport?: string | null;
  age_band?: string | null;
  phv_stage?: string | null;
  position?: string | null;
  mode?: string | null;
}

// ── Cache ────────────────────────────────────────────────────────────────

interface CachedSnapshot {
  directives: ResolvedDirective[];
  loadedAt: number;
  label: string;
  id: string;
}

const TTL_MS = 60_000;
let _cached: CachedSnapshot | null = null;

/** Drop the cache. Used by tests + after a publish. */
export function invalidateInstructionsCache(): void {
  _cached = null;
}

async function loadSnapshot(force = false): Promise<CachedSnapshot> {
  const now = Date.now();
  if (!force && _cached && now - _cached.loadedAt < TTL_MS) {
    return _cached;
  }

  const db = supabaseAdmin();
  const { data, error } = await (db as any)
    .from("methodology_publish_snapshots")
    .select("id, label, directives, directive_count")
    .eq("is_live", true)
    .maybeSingle();

  if (error) {
    console.error("[instructions.resolver] DB read failed:", error.message);
    if (_cached) {
      console.warn("[instructions.resolver] Using stale cache after DB error");
      return _cached;
    }
    return { directives: [], loadedAt: now, label: "(empty)", id: "" };
  }

  if (!data) {
    if (!_cached) {
      console.warn(
        "[instructions.resolver] No live methodology snapshot in DB. " +
          "Returning empty directive set. Publish your first snapshot via /admin/pd/instructions/snapshots.",
      );
    }
    _cached = { directives: [], loadedAt: now, label: "(none)", id: "" };
    return _cached;
  }

  const raw = (data.directives ?? []) as any[];
  const directives: ResolvedDirective[] = raw.map((d) => ({
    id: String(d.id ?? ""),
    document_id: d.document_id ?? null,
    directive_type: String(d.directive_type),
    audience: (d.audience as Audience) ?? "all",
    sport_scope: Array.isArray(d.sport_scope) ? d.sport_scope : [],
    age_scope: Array.isArray(d.age_scope) ? d.age_scope : [],
    phv_scope: Array.isArray(d.phv_scope) ? d.phv_scope : [],
    position_scope: Array.isArray(d.position_scope) ? d.position_scope : [],
    mode_scope: Array.isArray(d.mode_scope) ? d.mode_scope : [],
    priority: typeof d.priority === "number" ? d.priority : 100,
    payload: (d.payload ?? {}) as Record<string, unknown>,
    source_excerpt: d.source_excerpt ?? null,
    status: String(d.status ?? "published"),
    schema_version: typeof d.schema_version === "number" ? d.schema_version : 1,
    updated_at: d.updated_at ?? null,
  }));

  _cached = { directives, loadedAt: now, label: data.label, id: data.id };
  return _cached;
}

// ── Scope filter ─────────────────────────────────────────────────────────

/**
 * Does this directive apply to the given scope?
 * Empty scope arrays on the directive = wildcard (matches everything).
 *
 * Exported so the conflict-detection engine and the dry-run preview agree
 * with the runtime by construction.
 */
export function matchesScope(d: ResolvedDirective, scope: ResolveScope): boolean {
  const audience = scope.audience ?? "athlete";
  if (d.audience !== "all" && d.audience !== audience) return false;
  if (d.sport_scope.length > 0 && scope.sport && !d.sport_scope.includes(scope.sport)) return false;
  if (d.age_scope.length > 0 && scope.age_band && !d.age_scope.includes(scope.age_band)) return false;
  if (d.phv_scope.length > 0 && scope.phv_stage && !d.phv_scope.includes(scope.phv_stage)) return false;
  if (d.position_scope.length > 0 && scope.position && !d.position_scope.includes(scope.position))
    return false;
  if (d.mode_scope.length > 0 && scope.mode && !d.mode_scope.includes(scope.mode)) return false;
  return true;
}

/**
 * Sort directives by priority (ascending; lowest = winner) with a recency
 * tiebreak (newer updated_at wins). The single source of truth for who
 * "wins" a byType slot — runtime resolver and conflict detection share this.
 */
export function sortByPriority<T extends Pick<ResolvedDirective, "priority" | "updated_at">>(
  items: T[],
): T[] {
  return [...items].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    const ta = a.updated_at ? Date.parse(a.updated_at) : 0;
    const tb = b.updated_at ? Date.parse(b.updated_at) : 0;
    return tb - ta;
  });
}

// ── Public accessors ─────────────────────────────────────────────────────

export interface ResolvedSet {
  /** Snapshot label so consumers can log provenance. */
  snapshotLabel: string;
  snapshotId: string;
  /** All directives that matched scope (any type). */
  matches: ResolvedDirective[];
  /** Filtered subset by directive_type, in priority order (lowest = first). */
  byType(type: string): ResolvedDirective[];
}

/**
 * Resolve the live methodology snapshot for a given athlete/audience scope.
 * Returns a set with typed accessors. Cached for 60s.
 */
export async function resolveInstructions(
  scope: ResolveScope = {},
): Promise<ResolvedSet> {
  const snap = await loadSnapshot();
  const matches = snap.directives.filter((d) => matchesScope(d, scope));

  return {
    snapshotLabel: snap.label,
    snapshotId: snap.id,
    matches,
    byType(type: string) {
      return sortByPriority(matches.filter((d) => d.directive_type === type));
    },
  };
}
