/**
 * Snapshot freshness gate — single authoritative rule for "is this readiness
 * value still valid for today's signal?"
 *
 * Readers of `athlete_snapshots.readiness_score` / `readiness_rag` MUST flow
 * through this helper before using those fields for today's decisions (signal
 * evaluation, AI chat context, dashboard coaching text). The column
 * `readiness_for_date` is written atomically with the readiness fields on
 * every check-in (see snapshotWriter.ts). When it doesn't match today in the
 * athlete's timezone, the cached readiness is treated as absent — never
 * "slightly stale".
 *
 * This replaces the ad-hoc 24h/36h wall-clock decay logic in
 * snapshotStalenessDecay.ts for readiness specifically. That cron still owns
 * ACWR/CCRS batch decay; it no longer needs to clear readiness because the
 * calendar-day gate makes that a read-time concern.
 */

/** The subset of athlete_snapshots fields this helper inspects. */
export interface ReadinessFreshnessInput {
  readiness_score?: number | null;
  readiness_rag?: string | null;
  readiness_for_date?: string | null;
}

/**
 * Today's calendar date in the athlete's timezone, in YYYY-MM-DD form.
 * Uses the same locale/format as boot/route.ts so comparisons match exactly.
 */
export function todayInTz(tz: string | null | undefined, now: Date = new Date()): string {
  const zone = tz && tz.length > 0 ? tz : 'UTC';
  return now.toLocaleDateString('en-CA', { timeZone: zone });
}

/**
 * Returns true when the snapshot's readiness was computed for today in the
 * athlete's timezone. False when missing, missing date, or date < today.
 */
export function isReadinessFresh(
  snapshot: ReadinessFreshnessInput | null | undefined,
  tz: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!snapshot) return false;
  const forDate = snapshot.readiness_for_date;
  if (!forDate) return false;
  return forDate === todayInTz(tz, now);
}

/**
 * Returns the snapshot's readiness values if fresh-for-today, else null.
 * Consumers should prefer this over reading the raw fields so they cannot
 * accidentally use a stale score.
 */
export function getFreshReadiness(
  snapshot: ReadinessFreshnessInput | null | undefined,
  tz: string | null | undefined,
  now: Date = new Date(),
): { score: number | null; rag: string | null } | null {
  if (!isReadinessFresh(snapshot, tz, now)) return null;
  return {
    score: snapshot?.readiness_score ?? null,
    rag: snapshot?.readiness_rag ?? null,
  };
}
