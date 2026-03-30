/**
 * Expiry Resolver — condition-based notification resolution.
 *
 * Some notifications expire not by TTL but by condition change:
 * - ACWR drops below 1.3 → resolve LOAD_WARNING_SPIKE
 * - Injury flag cleared → resolve INJURY_RISK_FLAG
 * - Wellness avg recovers → resolve WELLNESS_CRITICAL
 * - Dual load drops → resolve DUAL_LOAD_SPIKE
 * - Exam passes → resolve EXAM_APPROACHING
 *
 * Called periodically (pg_cron) or after relevant events.
 *
 * Reference: Files/tomo_notification_center_p1.md §5
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { resolveByType } from './notificationEngine';
import type { NotificationType } from './notificationTemplates';

const db = () => supabaseAdmin() as any;

interface ConditionCheck {
  type: NotificationType;
  check: (snapshot: Record<string, unknown>) => boolean;
}

/**
 * Conditions that, when true, mean the notification should be resolved.
 * Each condition is checked against the athlete's current snapshot.
 */
const RESOLVE_CONDITIONS: ConditionCheck[] = [
  {
    type: 'LOAD_WARNING_SPIKE',
    check: (s) => (s.acwr as number ?? 0) < 1.3,
  },
  {
    type: 'INJURY_RISK_FLAG',
    check: (s) => (s.injury_risk_flag as string) !== 'RED',
  },
  {
    type: 'WELLNESS_CRITICAL',
    check: (s) => (s.wellness_7day_avg as number ?? 5) >= 5,
  },
  {
    type: 'DUAL_LOAD_SPIKE',
    check: (s) => (s.dual_load_index as number ?? 0) < 65,
  },
];

/**
 * Check all condition-based expiry rules for a single athlete.
 * Resolves any notifications where the underlying condition is no longer true.
 *
 * @returns Number of notifications resolved
 */
export async function resolveByConditions(athleteId: string): Promise<number> {
  const dbClient = db();

  // Get current snapshot
  const { data: snapshot } = await dbClient
    .from('athlete_snapshots')
    .select('*')
    .eq('athlete_id', athleteId)
    .single();

  if (!snapshot) return 0;

  let resolved = 0;

  for (const condition of RESOLVE_CONDITIONS) {
    if (condition.check(snapshot)) {
      // Check if there's an active notification of this type
      const { data: active } = await dbClient
        .from('athlete_notifications')
        .select('id')
        .eq('athlete_id', athleteId)
        .eq('type', condition.type)
        .in('status', ['unread', 'read'])
        .limit(1);

      if (active && active.length > 0) {
        const count = await resolveByType(athleteId, condition.type);
        resolved += count;
      }
    }
  }

  return resolved;
}

/**
 * Resolve exam-related notifications for exams that have passed.
 * Called by the hourly expiry cron or after an event.
 */
export async function resolvePassedExams(): Promise<number> {
  const dbClient = db();
  const now = new Date().toISOString();

  // Find EXAM_APPROACHING notifications where the exam date has passed
  const { data: expiredExams } = await dbClient
    .from('athlete_notifications')
    .select('id')
    .eq('type', 'EXAM_APPROACHING')
    .in('status', ['unread', 'read'])
    .lt('expires_at', now);

  if (!expiredExams || expiredExams.length === 0) return 0;

  const { data } = await dbClient
    .from('athlete_notifications')
    .update({
      status: 'expired',
      resolved_at: now,
      updated_at: now,
    })
    .eq('type', 'EXAM_APPROACHING')
    .in('status', ['unread', 'read'])
    .lt('expires_at', now)
    .select('id');

  return data?.length ?? 0;
}

/**
 * Run all condition-based resolution checks for all athletes with active notifications.
 * Called by pg_cron hourly alongside TTL expiry.
 *
 * @returns Total notifications resolved
 */
export async function runConditionExpiryCheck(): Promise<number> {
  const dbClient = db();

  // Get distinct athlete IDs that have active condition-resolvable notifications
  const conditionTypes = RESOLVE_CONDITIONS.map((c) => c.type);

  const { data: athletes } = await dbClient
    .from('athlete_notifications')
    .select('athlete_id')
    .in('type', conditionTypes)
    .in('status', ['unread', 'read']);

  if (!athletes) return 0;

  const uniqueAthletes = [...new Set(athletes.map((a: any) => a.athlete_id))];

  let total = 0;
  for (const athleteId of uniqueAthletes) {
    total += await resolveByConditions(athleteId as string);
  }

  // Also resolve passed exams
  total += await resolvePassedExams();

  return total;
}
