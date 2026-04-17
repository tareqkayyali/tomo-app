/**
 * Week Plan Compliance Computer
 *
 * For a committed plan row, match each `calendar_event_ids[]` against
 * the actual event state: completed? moved? deleted? Compute:
 *   - compliance_rate = completed / total
 *   - outcome: completedSessions, skippedSessions, loadAchievedAu, avgReadiness
 *
 * Pure data-in / data-out function — the cron route does the I/O and writes back.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { estimateLoad } from "@/services/events/computations/loadEstimator";

export interface ComplianceOutcome {
  completedSessions: number;
  skippedSessions: number;
  missingSessions: number;          // events deleted entirely
  loadAchievedAu: number;
  loadPredictedAu: number;
  avgReadiness: number | null;
  perCategoryRate: Record<string, number>; // category id → compliance 0..1
}

export interface ComplianceResult {
  weekPlanId: string;
  userId: string;
  weekStart: string;
  complianceRate: number;            // 0.00–1.00
  outcome: ComplianceOutcome;
}

/**
 * Compute compliance for a single week plan row.
 *
 * @param args.weekPlanId  plan id (UUID)
 * @param args.userId      athlete user id
 * @param args.weekStart   Monday of the week (YYYY-MM-DD)
 * @param args.calendarEventIds  event ids created at commit time
 * @param args.planItems   the persisted plan items (category, intensity, duration)
 */
export async function computeCompliance(args: {
  weekPlanId: string;
  userId: string;
  weekStart: string;
  calendarEventIds: string[];
  planItems: Array<{
    category?: string;
    eventType?: string;
    intensity?: string;
    durationMin?: number;
    predictedLoadAu?: number;
    date?: string;
    title?: string;
  }>;
}): Promise<ComplianceResult> {
  const db = supabaseAdmin();

  const ids = Array.isArray(args.calendarEventIds) ? args.calendarEventIds : [];
  const total = ids.length || args.planItems.length;

  if (total === 0) {
    return {
      weekPlanId: args.weekPlanId,
      userId: args.userId,
      weekStart: args.weekStart,
      complianceRate: 0,
      outcome: {
        completedSessions: 0,
        skippedSessions: 0,
        missingSessions: 0,
        loadAchievedAu: 0,
        loadPredictedAu: 0,
        avgReadiness: null,
        perCategoryRate: {},
      },
    };
  }

  // Pull live event state so we can see which were completed / moved / deleted.
  // If an id is missing from the result, the event was deleted (counted as missing).
  const { data: events } = ids.length > 0
    ? await db
        .from("calendar_events")
        .select("id, event_type, intensity, start_at, end_at, completed")
        .in("id", ids)
    : { data: [] as any[] };

  const foundById = new Map<string, any>();
  for (const ev of events ?? []) foundById.set(String(ev.id), ev);

  // Pull the athlete's readiness rows during the week window — for avg readiness.
  // We care about the scalar score averaged across the 7 days.
  const endDate = new Date(args.weekStart);
  endDate.setUTCDate(endDate.getUTCDate() + 6);
  const endISO = endDate.toISOString().slice(0, 10);

  const { data: readiness } = await db
    .from("checkins")
    .select("readiness_score, created_at")
    .eq("user_id", args.userId)
    .gte("created_at", `${args.weekStart}T00:00:00Z`)
    .lte("created_at", `${endISO}T23:59:59Z`);

  const readinessScores = (readiness ?? [])
    .map((r: any) => Number(r.readiness_score))
    .filter((n: number) => Number.isFinite(n));
  const avgReadiness = readinessScores.length > 0
    ? Math.round((readinessScores.reduce((a: number, b: number) => a + b, 0) / readinessScores.length) * 10) / 10
    : null;

  // Walk plan items and classify each against the event state.
  let completedSessions = 0;
  let skippedSessions = 0;
  let missingSessions = 0;
  let loadAchievedAu = 0;
  let loadPredictedAu = 0;
  const perCategoryHits: Record<string, { total: number; completed: number }> = {};

  const pairedLen = Math.min(args.planItems.length, ids.length || args.planItems.length);

  for (let i = 0; i < pairedLen; i++) {
    const plan = args.planItems[i] || {};
    const eventId = ids[i];
    const event = eventId ? foundById.get(String(eventId)) : null;
    const category = String(plan.category ?? plan.eventType ?? "other");

    perCategoryHits[category] ??= { total: 0, completed: 0 };
    perCategoryHits[category].total++;

    const predicted = typeof plan.predictedLoadAu === "number"
      ? plan.predictedLoadAu
      : (() => {
          const est = estimateLoad({
            event_type: String(plan.eventType ?? "training"),
            intensity: plan.eventType === "study" ? null : String(plan.intensity ?? "MODERATE"),
            duration_min: Number(plan.durationMin ?? 0),
          });
          return est.training_load_au + est.academic_load_au;
        })();
    loadPredictedAu += predicted;

    if (!event) {
      // Event was deleted after the plan was created.
      missingSessions++;
      continue;
    }
    if (event.completed) {
      completedSessions++;
      perCategoryHits[category].completed++;
      loadAchievedAu += predicted;
    } else {
      skippedSessions++;
    }
  }

  const perCategoryRate: Record<string, number> = {};
  for (const [cat, counts] of Object.entries(perCategoryHits)) {
    perCategoryRate[cat] = counts.total > 0
      ? Math.round((counts.completed / counts.total) * 100) / 100
      : 0;
  }

  const complianceRate = total > 0
    ? Math.round((completedSessions / total) * 100) / 100
    : 0;

  return {
    weekPlanId: args.weekPlanId,
    userId: args.userId,
    weekStart: args.weekStart,
    complianceRate,
    outcome: {
      completedSessions,
      skippedSessions,
      missingSessions,
      loadAchievedAu: Math.round(loadAchievedAu),
      loadPredictedAu: Math.round(loadPredictedAu),
      avgReadiness,
      perCategoryRate,
    },
  };
}
