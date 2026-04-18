/**
 * contextTags — helpers for deriving finite-taxonomy tags from runtime state.
 *
 * Two entry points:
 *   deriveContextTagsFromContext(ctx) — pure derivation from PlayerContext.
 *     Called once per response at the orchestrator chokepoint; results are
 *     MERGED with whatever tags the builder emitted so the resolver sees
 *     the full picture.
 *
 *   mergeContextTags(...lists) — de-dupe + preserve order merger.
 *
 * If you want to add a new derived tag:
 *   1. Add the string to backend/lib/chatPills/tagTaxonomy.ts.
 *   2. Extend the function below with a guard that emits it.
 *   3. Reference it in library entries via the CMS.
 *
 * This helper NEVER reads the network or the DB — all derivations come
 * from the already-built PlayerContext. Safe to call from hot paths.
 */

import type { PlayerContext } from "./contextBuilder";
import type { ContextTag } from "@/lib/chatPills/tagTaxonomy";

const STALE_CHECKIN_HOURS = 24;
const EXAM_SOON_DAYS = 7;
const ACWR_HIGH = 1.3;
const ACWR_LOW = 0.8;
const DUAL_LOAD_HIGH = 65;

function daysUntil(dateStr: string, fromDate: string): number {
  const from = new Date(`${fromDate}T00:00:00`).getTime();
  const to = new Date(dateStr).getTime();
  return Math.ceil((to - from) / 86_400_000);
}

function hoursSince(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return Number.isFinite(ms) ? ms / 3_600_000 : null;
}

export function deriveContextTagsFromContext(ctx: PlayerContext): ContextTag[] {
  const tags: ContextTag[] = [];

  // ── Readiness ─────────────────────────────────────────────────────
  const readiness = (ctx.readinessScore ?? "").toLowerCase();
  if (readiness === "green") tags.push("readiness:green");
  else if (readiness === "yellow") tags.push("readiness:yellow");
  else if (readiness === "red") tags.push("readiness:red");

  // needs_checkin: no checkin today
  if (ctx.checkinDate !== ctx.todayDate) tags.push("needs_checkin");

  // stale_checkin: last checkin > 24h old (per snapshot timestamp)
  const snap = ctx.snapshotEnrichment;
  const hoursSinceCheckin = hoursSince(snap?.lastCheckinAt ?? null);
  if (hoursSinceCheckin !== null && hoursSinceCheckin >= STALE_CHECKIN_HOURS) {
    tags.push("stale_checkin");
  }

  // ── Schedule ──────────────────────────────────────────────────────
  const today = ctx.todayEvents ?? [];
  if (today.some((e) => e.event_type === "match" || e.event_type === "competition")) {
    tags.push("match_today");
  }
  if (today.some((e) => e.event_type === "exam")) tags.push("exam_today");
  if (today.some((e) => e.event_type === "training" || e.event_type === "gym")) {
    tags.push("training_today");
  }
  if (today.length === 0) tags.push("rest_day");

  if (
    ctx.upcomingExams?.some((e) => {
      if (!e.start_at) return false;
      const d = daysUntil(e.start_at, ctx.todayDate);
      return d >= 0 && d <= EXAM_SOON_DAYS;
    })
  ) {
    tags.push("exam_soon");
  }

  const weekEvents = ctx.upcomingEvents ?? [];
  if (weekEvents.length === 0) tags.push("empty_week");

  // ── Load ──────────────────────────────────────────────────────────
  if (typeof snap?.acwr === "number") {
    if (snap.acwr >= ACWR_HIGH) tags.push("acwr_high", "high_load");
    else if (snap.acwr < ACWR_LOW) tags.push("acwr_low", "low_load");
  }
  if (typeof snap?.dualLoadIndex === "number" && snap.dualLoadIndex >= DUAL_LOAD_HIGH) {
    tags.push("dual_load_high");
  }

  // ── Benchmarks ────────────────────────────────────────────────────
  const bench = ctx.benchmarkProfile;
  if (bench) {
    tags.push("has_benchmarks");
    if ((bench.gapAttributes?.length ?? 0) > 0) tags.push("benchmark_weak");
    if ((bench.strengthAttributes?.length ?? 0) > 0) tags.push("benchmark_strong");
  } else {
    tags.push("metric_missing");
  }

  // ── Lifecycle ─────────────────────────────────────────────────────
  if ((snap?.sessionsTotal ?? 0) === 0 && (ctx.currentStreak ?? 0) === 0) {
    tags.push("new_user");
  } else {
    tags.push("returning_user");
  }
  if (ctx.currentStreak >= 7) tags.push("streak_milestone");
  if (hoursSinceCheckin !== null && hoursSinceCheckin >= 20 && hoursSinceCheckin < 28) {
    tags.push("streak_risk");
  }

  // ── Domain: CV, injury ────────────────────────────────────────────
  const cv = snap?.cvCompleteness;
  if (typeof cv === "number" && cv < 0.8) tags.push("cv_incomplete");
  if (snap?.injuryRiskFlag === "RED") tags.push("injury");

  return tags;
}

/**
 * Merge tag lists, de-dupe, preserve first-seen order.
 * Used to combine builder-emitted tags with context-derived tags.
 */
export function mergeContextTags(
  ...lists: Array<ReadonlyArray<string> | undefined | null>
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    if (!list) continue;
    for (const tag of list) {
      if (!tag) continue;
      if (seen.has(tag)) continue;
      seen.add(tag);
      out.push(tag);
    }
  }
  return out;
}
