/**
 * notifyRec — shared helper to emit a notification for a newly-inserted
 * recommendation. Called fire-and-forget by every recommendation computer
 * (readiness, load warning, recovery, development, academic, cv, triangle,
 * motivation, journal-nudge).
 *
 * Subtle-defaults rule: only P1 (NOW) and P2 (Today) fire notifications.
 * P3 (Tomorrow) and P4 (motivation) stay silent in the dashboard.
 *
 * All engine-level throttles still apply (fatigue guard, min_push_interval,
 * daily cap, quiet hours). This helper only decides "should we try at all?"
 */

import type { RecommendationInsert } from "./types";

/**
 * Insert a recommendation and emit a NEW_RECOMMENDATION notification for
 * P1/P2 recs. Returns the inserted row id on success, null otherwise.
 *
 * Every computer uses this instead of inserting directly so no computer
 * can forget to wire notifications.
 */
export async function insertRecommendationWithNotify(
  db: { from: (t: string) => any },
  row: RecommendationInsert,
): Promise<string | null> {
  const { data: inserted, error } = await db
    .from("athlete_recommendations")
    .insert(row)
    .select("id")
    .single();

  if (error || !inserted?.id) {
    return null;
  }

  // Fire notification for P1/P2 only — subtle-defaults rule keeps P3/P4 silent.
  if (row.priority <= 2) {
    // Dynamic import avoids a static circular dep with the notifications engine.
    import("../notifications/notificationEngine")
      .then(({ createNotification }) => {
        createNotification({
          athleteId: row.athlete_id,
          type: "NEW_RECOMMENDATION",
          vars: {
            rec_title: row.title.slice(0, 100),
            rec_body_short: row.body_short.slice(0, 150),
            priority: row.priority,
            rec_type: row.rec_type,
            rec_id: inserted.id,
            expires_at: row.expires_at ?? "",
          },
          sourceRef: { type: "recommendation", id: inserted.id },
          expiresAt: row.expires_at ?? undefined,
        });
      })
      .catch(() => {
        // fire-and-forget — failures here must never block rec creation
      });
  }

  return inserted.id;
}
