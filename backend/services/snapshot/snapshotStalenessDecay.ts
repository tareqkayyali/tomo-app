/**
 * Snapshot Staleness Decay — Daily batch that keeps stale athlete data honest.
 *
 * Runs daily at 05:00 UTC via the cron route. For each athlete whose snapshot
 * hasn't been refreshed by a real event in 20+ hours:
 *
 * 1. Recompute ACWR (sliding window — ATL drops as days pass with no load)
 * 2. Recompute CCRS (FM=0 for very stale biometric, weights cascade to historical)
 * 3. Decay stale readiness_rag (RED→AMBER after 24h, null after 36h)
 * 4. Refresh data_freshness tier
 *
 * This is the safety net that prevents frozen metrics from driving bad
 * recommendations. Without it, an athlete who stops checking in stays RED forever.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { recomputeACWR } from '@/services/events/computations/acwrComputation';
import { computeAndPersistCCRS } from '@/services/ccrs/ccrsAssembler';

/** Stale threshold: athletes with no event activity for 20+ hours */
const STALE_THRESHOLD_HOURS = 20;

/** After 24h without a checkin, RED → AMBER (not enough confidence for RED) */
const RAG_DECAY_TO_AMBER_HOURS = 24;

/** After 36h without a checkin, clear readiness_rag entirely (too stale to trust) */
const RAG_DECAY_TO_NULL_HOURS = 36;

/** Process athletes in batches to control concurrency */
const BATCH_SIZE = 10;

export interface DecayResult {
  processed: number;
  errors: number;
  skipped: number;
  acwr_recomputed: number;
  ccrs_recomputed: number;
  rag_decayed: number;
}

/**
 * Run staleness decay for all athletes with stale snapshots.
 * Called by the cron route at 05:00 UTC daily.
 */
export async function decayStaleSnapshots(): Promise<DecayResult> {
  const db = supabaseAdmin();
  const now = new Date();
  const staleThreshold = new Date(now.getTime() - STALE_THRESHOLD_HOURS * 60 * 60 * 1000);

  const result: DecayResult = {
    processed: 0,
    errors: 0,
    skipped: 0,
    acwr_recomputed: 0,
    ccrs_recomputed: 0,
    rag_decayed: 0,
  };

  // Find athletes whose snapshot hasn't been refreshed by a real event recently
  const { data: staleAthletes, error } = await db
    .from('athlete_snapshots')
    .select('athlete_id, last_checkin_at, readiness_rag, snapshot_at')
    .lt('snapshot_at', staleThreshold.toISOString());

  if (error) {
    console.error('[StalenessDecay] Failed to fetch stale athletes:', error.message);
    return { ...result, errors: 1 };
  }

  if (!staleAthletes || staleAthletes.length === 0) {
    console.log('[StalenessDecay] No stale athletes found');
    return result;
  }

  console.log(`[StalenessDecay] Found ${staleAthletes.length} stale athletes`);

  // Process in batches
  for (let i = 0; i < staleAthletes.length; i += BATCH_SIZE) {
    const batch = staleAthletes.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map(athlete => decaySingleAthlete(db, athlete, now))
    );

    for (const r of batchResults) {
      if (r.status === 'fulfilled') {
        result.processed++;
        if (r.value.acwr_recomputed) result.acwr_recomputed++;
        if (r.value.ccrs_recomputed) result.ccrs_recomputed++;
        if (r.value.rag_decayed) result.rag_decayed++;
      } else {
        result.errors++;
      }
    }
  }

  console.log(
    `[StalenessDecay] Done: ${result.processed} processed, ` +
    `${result.acwr_recomputed} ACWR, ${result.ccrs_recomputed} CCRS, ` +
    `${result.rag_decayed} RAG decayed, ${result.errors} errors`
  );

  return result;
}

// ---------------------------------------------------------------------------
// Per-Athlete Decay
// ---------------------------------------------------------------------------

interface AthleteDecayResult {
  acwr_recomputed: boolean;
  ccrs_recomputed: boolean;
  rag_decayed: boolean;
}

async function decaySingleAthlete(
  db: any,
  athlete: { athlete_id: string; last_checkin_at: string | null; readiness_rag: string | null; snapshot_at: string },
  now: Date
): Promise<AthleteDecayResult> {
  const athleteId = athlete.athlete_id;
  const result: AthleteDecayResult = {
    acwr_recomputed: false,
    ccrs_recomputed: false,
    rag_decayed: false,
  };

  // 1. Recompute ACWR via sliding window
  //    As days pass with no new sessions, ATL (7-day) drops faster than CTL (28-day),
  //    naturally bringing ACWR down. This prevents stale ACWR from staying high.
  try {
    await recomputeACWR(athleteId);
    result.acwr_recomputed = true;
  } catch (err) {
    console.warn(`[StalenessDecay] ACWR recompute failed for ${athleteId}:`, err);
  }

  // 2. Decay stale readiness_rag
  //    If the last check-in was long ago, readiness confidence is too low to trust
  const snapshotUpdate: Record<string, unknown> = {
    athlete_id: athleteId,
    snapshot_at: now.toISOString(),
  };

  if (athlete.last_checkin_at) {
    const hoursSinceCheckin = (now.getTime() - new Date(athlete.last_checkin_at).getTime()) / (60 * 60 * 1000);

    if (hoursSinceCheckin >= RAG_DECAY_TO_NULL_HOURS) {
      // Too stale — clear readiness entirely
      snapshotUpdate.readiness_rag = null;
      snapshotUpdate.readiness_score = null;
      result.rag_decayed = true;
    } else if (hoursSinceCheckin >= RAG_DECAY_TO_AMBER_HOURS && athlete.readiness_rag === 'RED') {
      // RED with 24+ hours stale → downgrade to AMBER (not confident enough for RED)
      snapshotUpdate.readiness_rag = 'AMBER';
      result.rag_decayed = true;
    }
  } else {
    // No checkin ever recorded — clear any inherited readiness
    if (athlete.readiness_rag != null) {
      snapshotUpdate.readiness_rag = null;
      snapshotUpdate.readiness_score = null;
      result.rag_decayed = true;
    }
  }

  // 3. Refresh data_freshness tier from latest activity
  const dataFreshness = await computeDataFreshness(db, athleteId, now);
  snapshotUpdate.data_freshness = dataFreshness;

  // Write RAG decay + freshness update
  if (Object.keys(snapshotUpdate).length > 2) {
    await db
      .from('athlete_snapshots')
      .upsert(snapshotUpdate, { onConflict: 'athlete_id' });
  }

  // 4. Recompute CCRS with current (stale) data
  //    The freshness multiplier in the formula will be 0 for very stale biometric data,
  //    cascading weight to historical prior. This is exactly the desired behavior.
  try {
    await computeAndPersistCCRS(athleteId);
    result.ccrs_recomputed = true;
  } catch (err) {
    console.warn(`[StalenessDecay] CCRS recompute failed for ${athleteId}:`, err);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Data Freshness
// ---------------------------------------------------------------------------

/**
 * Compute data freshness tier from the most recent activity across all sources.
 * Same logic as snapshotWriter's enrichCrossCuttingFields, but standalone.
 */
async function computeDataFreshness(
  db: any,
  athleteId: string,
  now: Date
): Promise<'FRESH' | 'AGING' | 'STALE' | 'UNKNOWN'> {
  const [wearableRes, checkinRes, sessionRes] = await Promise.all([
    db
      .from('athlete_daily_vitals')
      .select('date')
      .eq('athlete_id', athleteId)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle(),

    db
      .from('athlete_events')
      .select('occurred_at')
      .eq('athlete_id', athleteId)
      .eq('event_type', 'WELLNESS_CHECKIN')
      .order('occurred_at', { ascending: false })
      .limit(1)
      .maybeSingle(),

    db
      .from('athlete_events')
      .select('occurred_at')
      .eq('athlete_id', athleteId)
      .eq('event_type', 'SESSION_LOG')
      .order('occurred_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const timestamps = [
    wearableRes.data?.date ? new Date(wearableRes.data.date) : null,
    checkinRes.data?.occurred_at ? new Date(checkinRes.data.occurred_at) : null,
    sessionRes.data?.occurred_at ? new Date(sessionRes.data.occurred_at) : null,
  ].filter(Boolean) as Date[];

  if (timestamps.length === 0) return 'UNKNOWN';

  const mostRecent = Math.max(...timestamps.map(t => t.getTime()));
  const hoursSince = (now.getTime() - mostRecent) / (60 * 60 * 1000);

  if (hoursSince <= 12) return 'FRESH';
  if (hoursSince <= 36) return 'AGING';
  if (hoursSince <= 96) return 'STALE';
  return 'UNKNOWN';
}
