/**
 * Protocol-scoped fan-out: refresh affected athletes' program
 * recommendations after a new or updated PD protocol is saved.
 *
 * Strategy (per approved plan):
 *   - Inline fan-out for up to INLINE_CAP athletes (default 50): fires
 *     triggerDeepProgramRefreshAsync for each immediately.
 *   - If the scope is wider than the cap, the first INLINE_CAP athletes
 *     are refreshed inline and the remainder are staggered via setTimeout
 *     with a 50ms gap between each so the Anthropic rate limit is
 *     respected.
 *   - Fire-and-forget — the save handler does not await this.
 *
 * We intentionally do NOT persist a PROTOCOL_UPDATED event or queue row.
 * The protocol cache in services/pdil is cleared after save (via the
 * existing clearProtocolCache call path), and any athlete event that
 * subsequently fires will pick up the new rule. Fan-out here exists only
 * to make the refresh feel instantaneous in the common small-tenant case.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { triggerDeepProgramRefreshAsync } from "@/services/programs/deepProgramRefresh";
import { logger } from "@/lib/logger";
import type { ProtocolScopeFilters } from "./protocolDryRun";

const INLINE_CAP = 50;
const MAX_FAN_OUT_TOTAL = 1000; // hard safety ceiling
const BACKGROUND_GAP_MS = 50;

export interface FanOutResult {
  inline_count: number;
  background_queued: number;
  scope_total: number;
  capped: boolean;
}

/**
 * Fire-and-forget refresh of program recommendations for every athlete
 * within the protocol's scope filters.
 */
export async function triggerAffectedAthletesRefresh(
  scope: ProtocolScopeFilters,
): Promise<FanOutResult> {
  let athleteIds: string[] = [];
  let scopeTotal = 0;
  let capped = false;

  try {
    const { ids, total } = await listAthletesInScope(scope);
    scopeTotal = total;
    if (total > MAX_FAN_OUT_TOTAL) {
      capped = true;
      athleteIds = ids.slice(0, MAX_FAN_OUT_TOTAL);
    } else {
      athleteIds = ids;
    }
  } catch (err) {
    logger.warn("[PDIL/FanOut] Failed to list athletes in scope", {
      error: (err as Error).message,
    });
    return {
      inline_count: 0,
      background_queued: 0,
      scope_total: 0,
      capped: false,
    };
  }

  const inlineAthletes = athleteIds.slice(0, INLINE_CAP);
  const backgroundAthletes = athleteIds.slice(INLINE_CAP);

  // Inline — no delay.
  for (const id of inlineAthletes) {
    try {
      triggerDeepProgramRefreshAsync(id);
    } catch (err) {
      logger.warn("[PDIL/FanOut] Inline refresh trigger failed", {
        athlete_id: id,
        error: (err as Error).message,
      });
    }
  }

  // Background — staggered. setTimeout accumulates immediately and fires
  // independently of the HTTP response lifecycle on the Node runtime.
  backgroundAthletes.forEach((id, idx) => {
    setTimeout(() => {
      try {
        triggerDeepProgramRefreshAsync(id);
      } catch (err) {
        logger.warn("[PDIL/FanOut] Background refresh trigger failed", {
          athlete_id: id,
          error: (err as Error).message,
        });
      }
    }, (idx + 1) * BACKGROUND_GAP_MS);
  });

  logger.info("[PDIL/FanOut] Refresh fan-out dispatched", {
    scope_total: scopeTotal,
    inline: inlineAthletes.length,
    background: backgroundAthletes.length,
    capped,
  });

  return {
    inline_count: inlineAthletes.length,
    background_queued: backgroundAthletes.length,
    scope_total: scopeTotal,
    capped,
  };
}

async function listAthletesInScope(
  scope: ProtocolScopeFilters,
): Promise<{ ids: string[]; total: number }> {
  const db = supabaseAdmin() as any;

  let q = db
    .from("athlete_snapshots")
    .select("athlete_id", { count: "exact" })
    .limit(MAX_FAN_OUT_TOTAL + 1);

  if (scope.sport_filter && scope.sport_filter.length > 0) {
    q = q.in("sport", scope.sport_filter);
  }
  if (scope.phv_filter && scope.phv_filter.length > 0) {
    q = q.in("phv_stage", scope.phv_filter);
  }
  if (scope.age_band_filter && scope.age_band_filter.length > 0) {
    q = q.in("age_band", scope.age_band_filter);
  }
  if (scope.position_filter && scope.position_filter.length > 0) {
    q = q.in("position", scope.position_filter);
  }

  const { data, count, error } = await q;
  if (error || !data) return { ids: [], total: 0 };

  return {
    ids: (data as Array<{ athlete_id: string }>).map((r) => r.athlete_id),
    total: count ?? data.length,
  };
}
