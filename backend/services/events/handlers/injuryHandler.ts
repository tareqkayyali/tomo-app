/**
 * Injury Handler — processes INJURY_FLAG and INJURY_CLEARED events.
 *
 * Updates injury_risk_flag on the athlete snapshot.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import type { AthleteEvent } from '../types';

/**
 * Handle INJURY_FLAG / INJURY_CLEARED events.
 * - INJURY_FLAG → sets injury_risk_flag = 'RED'
 * - INJURY_CLEARED → sets injury_risk_flag = 'GREEN'
 */
export async function handleInjuryEvent(event: AthleteEvent): Promise<void> {
  const db = supabaseAdmin();

  const flag = event.event_type === 'INJURY_FLAG' ? 'RED' : 'GREEN';
  const payload = event.payload as Record<string, unknown>;

  // Base update: injury flag
  const update: Record<string, unknown> = {
    athlete_id: event.athlete_id,
    injury_risk_flag: flag,
    snapshot_at: new Date().toISOString(),
  };

  // ── Snapshot 360: Injury detail enrichment ──

  // Count active injuries from recent INJURY_FLAG events without a matching INJURY_CLEARED
  const { data: injuryEvents } = await db
    .from('athlete_events')
    .select('event_type, payload, occurred_at')
    .eq('athlete_id', event.athlete_id)
    .in('event_type', ['INJURY_FLAG', 'INJURY_CLEARED'])
    .order('occurred_at', { ascending: false })
    .limit(50);

  if (injuryEvents && injuryEvents.length > 0) {
    // Track active injuries by location
    const activeLocations = new Set<string>();
    const clearedLocations = new Set<string>();
    let mostRecentInjuryDate: Date | null = null;

    for (const ie of injuryEvents) {
      const loc = (ie.payload as any)?.pain_location ?? (ie.payload as any)?.location ?? 'unknown';
      if (ie.event_type === 'INJURY_CLEARED') {
        clearedLocations.add(loc);
      } else if (ie.event_type === 'INJURY_FLAG' && !clearedLocations.has(loc)) {
        activeLocations.add(loc);
        if (!mostRecentInjuryDate) {
          mostRecentInjuryDate = new Date(ie.occurred_at);
        }
      }
    }

    update.active_injury_count = activeLocations.size;
    update.injury_locations = activeLocations.size > 0
      ? JSON.stringify(Array.from(activeLocations))
      : '[]'; // Empty array for confirmed zero injuries, not null

    if (mostRecentInjuryDate) {
      update.days_since_injury = Math.floor(
        (Date.now() - mostRecentInjuryDate.getTime()) / 86400000
      );
    }
  } else {
    // No injury history
    update.active_injury_count = 0;
    update.injury_locations = '[]';
  }

  await (db as any)
    .from('athlete_snapshots')
    .upsert(update, { onConflict: 'athlete_id' });
}
