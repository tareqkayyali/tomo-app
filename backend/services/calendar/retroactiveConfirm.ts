/**
 * ════════════════════════════════════════════════════════════════════════════
 * Retroactive Check-in Confirmation
 * ════════════════════════════════════════════════════════════════════════════
 *
 * When an athlete submits a check-in on day T, we inspect yesterday's
 * (day T-1) still-scheduled physical events and apply the thresholds
 * from load_attribution_v1.completion_triggers.checkin_effort_yesterday:
 *
 *   effort_yesterday ≥ confirm_threshold  → mark each completed
 *                                            (source='checkin',
 *                                             confidence from config)
 *   effort_yesterday ≤ skip_threshold     → mark each skipped
 *   between thresholds (ambiguous)        → no-op; notification will
 *                                            nudge the athlete later
 *
 * For each confirmed event we also emit SESSION_LOG with the resolved
 * intensity + duration so ATL/CTL/ACWR reflect the load immediately,
 * not on the next day's bridge sweep.
 *
 * Idempotent-safe: only acts on rows where status='scheduled'. Re-running
 * after a manual tap or wearable match is a no-op.
 *
 * Pure helper (`classifyCheckinEffort`) exposed alongside the side-effect
 * function so unit tests can cover the threshold logic without DB mocks.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { emitEventSafe } from '@/services/events/eventEmitter';
import { EVENT_TYPES, SOURCE_TYPES } from '@/services/events/constants';
import {
  getIntensityCatalog,
  type IntensityCatalog,
} from '@/services/events/intensityCatalogConfig';
import {
  getLoadAttributionConfig,
  type LoadAttributionConfig,
} from '@/services/events/loadAttributionConfig';
import { estimateLoad } from '@/services/events/computations/loadEstimator';
import {
  resolveEffectiveIntensity,
  resolveEffectiveDuration,
  type CalendarIntensity,
} from './resolveCompletion';

const PHYSICAL_EVENT_TYPES = new Set<string>(['training', 'match', 'recovery']);

export type CheckinEffortAction = 'confirm' | 'skip' | 'none';

/**
 * Pure threshold classifier. Given yesterday's self-reported effort and
 * the load-attribution config, return what the retroactive step should
 * do. Exported for unit tests.
 */
export function classifyCheckinEffort(
  effortYesterday: number | null | undefined,
  config: LoadAttributionConfig,
): CheckinEffortAction {
  const trig = config.completion_triggers.checkin_effort_yesterday;
  if (!trig.enabled) return 'none';
  if (typeof effortYesterday !== 'number' || !Number.isFinite(effortYesterday)) {
    return 'none';
  }
  if (effortYesterday >= trig.confirm_threshold) return 'confirm';
  if (effortYesterday <= trig.skip_threshold) return 'skip';
  return 'none';
}

/**
 * Yesterday-in-athlete's-timezone — approximated here as UTC yesterday.
 * We read the time window from yesterday 00:00:00Z to today 00:00:00Z.
 * Timezone precision is not critical for this retro-confirm path; worst
 * case an event on the boundary gets missed by a few hours and the push
 * notification still nudges it later.
 */
function yesterdayBoundsUtc(now: Date = new Date()): { start: string; end: string } {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(end);
  start.setDate(end.getDate() - 1);
  return {
    start: start.toISOString(),
    end:   end.toISOString(),
  };
}

export interface RetroConfirmResult {
  action:          CheckinEffortAction;
  candidateCount:  number;
  confirmedCount:  number;
  skippedCount:    number;
  confidence:      number | null;
}

/**
 * Main side-effect function. Call from wellnessHandler AFTER the
 * check-in row is persisted and WELLNESS_CHECKIN is emitted so the
 * effort_yesterday value is committed.
 *
 * Fail-open: any DB/emission error logs a warning and returns early —
 * the athlete's check-in submit always succeeds even if retro-confirm
 * hits a transient failure.
 */
export async function runRetroactiveCheckinConfirm(params: {
  athleteId:       string;
  effortYesterday: number | null | undefined;
  now?:            Date;
}): Promise<RetroConfirmResult> {
  const { athleteId, effortYesterday, now = new Date() } = params;

  const loadAttr = await getLoadAttributionConfig({ athleteId });
  const action = classifyCheckinEffort(effortYesterday, loadAttr);
  if (action === 'none') {
    return {
      action,
      candidateCount:  0,
      confirmedCount:  0,
      skippedCount:    0,
      confidence:      null,
    };
  }

  const db = supabaseAdmin();
  const { start, end } = yesterdayBoundsUtc(now);

  const { data: candidates, error } = await (db as any)
    .from('calendar_events')
    .select('id, user_id, title, event_type, start_at, end_at, intensity, status, metadata')
    .eq('user_id', athleteId)
    .gte('start_at', start)
    .lt('start_at', end)
    .eq('status', 'scheduled')
    .in('event_type', Array.from(PHYSICAL_EVENT_TYPES));

  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[retroactiveConfirm] candidate query failed:', error.message);
    return {
      action,
      candidateCount: 0,
      confirmedCount: 0,
      skippedCount: 0,
      confidence: null,
    };
  }

  const rows = candidates ?? [];
  if (rows.length === 0) {
    return {
      action,
      candidateCount: 0,
      confirmedCount: 0,
      skippedCount: 0,
      confidence: null,
    };
  }

  const trig = loadAttr.completion_triggers.checkin_effort_yesterday;
  let confirmed = 0;
  let skipped = 0;

  if (action === 'skip') {
    const ids = rows.map((r: any) => r.id);
    const { error: updErr } = await (db as any)
      .from('calendar_events')
      .update({
        status:            'skipped',
        completed:         false,
        completed_at:      null,
        completion_source: 'checkin',
        confidence_score:  trig.confidence,
      })
      .in('id', ids);

    if (updErr) {
      // eslint-disable-next-line no-console
      console.warn('[retroactiveConfirm] bulk skip failed:', updErr.message);
    } else {
      skipped = ids.length;
    }
  } else {
    // action === 'confirm'
    const catalog: IntensityCatalog = await getIntensityCatalog({ athleteId });
    const nowIso = now.toISOString();

    for (const row of rows) {
      const effectiveIntensity = resolveEffectiveIntensity({
        catalog,
        rpe: null,
        scheduledIntensity: row.intensity,
      });
      const effectiveDuration = resolveEffectiveDuration({
        reported:       null,
        scheduledStart: row.start_at,
        scheduledEnd:   row.end_at,
      });
      const { training_load_au } = estimateLoad(
        {
          event_type:   row.event_type,
          intensity:    effectiveIntensity,
          duration_min: effectiveDuration,
        },
        catalog,
      );

      const { error: updErr } = await (db as any)
        .from('calendar_events')
        .update({
          status:              'completed',
          completed:           true,
          completed_at:        nowIso,
          completion_source:   'checkin',
          confidence_score:    trig.confidence,
          effective_intensity: effectiveIntensity,
        })
        .eq('id', row.id);

      if (updErr) {
        // eslint-disable-next-line no-console
        console.warn(`[retroactiveConfirm] confirm failed for event ${row.id}:`, updErr.message);
        continue;
      }

      // Emit SESSION_LOG so ATL/CTL reflect real load without waiting for
      // the next daily bridge pass.
      await emitEventSafe({
        athleteId,
        eventType: EVENT_TYPES.SESSION_LOG,
        occurredAt: row.start_at ?? nowIso,
        source: SOURCE_TYPES.MANUAL,
        createdBy: 'checkin-retro-confirm',
        payload: {
          calendar_event_id: row.id,
          title:             row.title,
          event_type:        row.event_type,
          intensity:         effectiveIntensity as CalendarIntensity,
          duration_min:      effectiveDuration,
          training_load_au,
          completion_source: 'checkin',
        },
      });
      confirmed += 1;
    }
  }

  return {
    action,
    candidateCount: rows.length,
    confirmedCount: confirmed,
    skippedCount:   skipped,
    confidence:     trig.confidence,
  };
}
