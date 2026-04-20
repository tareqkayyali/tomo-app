/**
 * Inline dry-run preview for a newly saved PD protocol.
 *
 * Purpose: close the wiring loop at save time. Instead of trusting that the
 * protocol reaches athletes "eventually", the save handler synthesizes a
 * representative set of athlete states matching the protocol's scope
 * pre-filters, runs the full PDIL evaluator, and reports which of the test
 * athletes the new protocol actually fired for.
 *
 * This catches two classes of authoring mistakes that would otherwise ship
 * silently: (1) a condition field/operator pair that never matches reality,
 * and (2) scope filters that exclude the athletes the PD intended to cover.
 *
 * Timeout: 800ms hard cap. On timeout we return { skipped: true } and the
 * save succeeds. Dry-run failure is never a save blocker.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { evaluatePDProtocols } from "./evaluatePDProtocols";
import { readSnapshot } from "@/services/events/snapshot/snapshotReader";
import { logger } from "@/lib/logger";

const DRYRUN_TIMEOUT_MS = 800;
const DEFAULT_SAMPLE_SIZE = 3;

export interface ProtocolScopeFilters {
  sport_filter: string[] | null;
  phv_filter: string[] | null;
  age_band_filter: string[] | null;
  position_filter: string[] | null;
}

export interface DryRunResult {
  skipped: boolean;
  reason?: string;
  athletes_tested: number;
  athletes_fired: number;
  results: Array<{
    athlete_id: string;
    fired: boolean;
    sport: string | null;
    position: string | null;
    phv_stage: string | null;
  }>;
}

/**
 * Run the PDIL evaluator against N athletes whose snapshots match the
 * protocol's scope filters, and report which of them fired the target
 * protocol.
 */
export async function runInlineDryRunPreview(
  protocolId: string,
  scope: ProtocolScopeFilters,
  sampleSize: number = DEFAULT_SAMPLE_SIZE,
): Promise<DryRunResult> {
  const empty: DryRunResult = {
    skipped: true,
    reason: "no-sample",
    athletes_tested: 0,
    athletes_fired: 0,
    results: [],
  };

  try {
    return await Promise.race([
      dryRunImpl(protocolId, scope, sampleSize),
      timeoutFallback(),
    ]);
  } catch (err) {
    logger.warn("[PDIL/DryRun] Dry-run failed (non-blocking)", {
      protocol_id: protocolId,
      error: (err as Error).message,
    });
    return { ...empty, reason: "error" };
  }
}

function timeoutFallback(): Promise<DryRunResult> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        skipped: true,
        reason: "timeout",
        athletes_tested: 0,
        athletes_fired: 0,
        results: [],
      });
    }, DRYRUN_TIMEOUT_MS);
  });
}

async function dryRunImpl(
  protocolId: string,
  scope: ProtocolScopeFilters,
  sampleSize: number,
): Promise<DryRunResult> {
  const athleteIds = await sampleAthletesMatchingScope(scope, sampleSize);
  if (athleteIds.length === 0) {
    return {
      skipped: true,
      reason: "no-athletes-in-scope",
      athletes_tested: 0,
      athletes_fired: 0,
      results: [],
    };
  }

  const db = supabaseAdmin();
  const today = new Date().toISOString().split("T")[0];
  const loadFrom = new Date();
  loadFrom.setDate(loadFrom.getDate() - 28);
  const forward = new Date();
  forward.setDate(forward.getDate() + 14);

  const results: DryRunResult["results"] = [];

  for (const athleteId of athleteIds) {
    const snapshot = await readSnapshot(athleteId, "ATHLETE");
    if (!snapshot) continue;

    const [todayEvents, upcomingEvents, dailyLoad, todayVitals] = await Promise.all([
      db
        .from("calendar_events")
        .select("*")
        .eq("athlete_id", athleteId)
        .gte("start_at", `${today}T00:00:00`)
        .lte("start_at", `${today}T23:59:59`),
      db
        .from("calendar_events")
        .select("*")
        .eq("athlete_id", athleteId)
        .gte("start_at", `${today}T00:00:00`)
        .lte("start_at", forward.toISOString()),
      db
        .from("athlete_daily_load")
        .select("*")
        .eq("athlete_id", athleteId)
        .gte("load_date", loadFrom.toISOString().split("T")[0]),
      (db as any)
        .from("athlete_daily_vitals")
        .select("*")
        .eq("athlete_id", athleteId)
        .eq("vitals_date", today)
        .maybeSingle(),
    ]);

    const pdContext = await evaluatePDProtocols({
      snapshot: snapshot as Record<string, unknown>,
      todayVitals: todayVitals.data ?? null,
      upcomingEvents: [
        ...((todayEvents.data ?? []) as any[]),
        ...((upcomingEvents.data ?? []) as any[]),
      ],
      recentDailyLoad: (dailyLoad.data ?? []) as any[],
      trigger: "test",
    });

    const fired = pdContext.activeProtocols.some(
      (p) => p.protocol_id === protocolId,
    );

    const snap = snapshot as Record<string, unknown>;
    results.push({
      athlete_id: athleteId,
      fired,
      sport: (snap.sport as string | null) ?? null,
      position: (snap.position as string | null) ?? null,
      phv_stage: (snap.phv_stage as string | null) ?? null,
    });
  }

  return {
    skipped: false,
    athletes_tested: results.length,
    athletes_fired: results.filter((r) => r.fired).length,
    results,
  };
}

async function sampleAthletesMatchingScope(
  scope: ProtocolScopeFilters,
  limit: number,
): Promise<string[]> {
  const db = supabaseAdmin() as any;
  let q = db
    .from("athlete_snapshots")
    .select("athlete_id, sport, phv_stage, age_band, position, updated_at")
    .order("updated_at", { ascending: false })
    .limit(limit * 4); // over-sample then filter client-side

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

  const { data, error } = await q;
  if (error || !data) return [];

  return (data as Array<{ athlete_id: string }>)
    .slice(0, limit)
    .map((r) => r.athlete_id);
}
