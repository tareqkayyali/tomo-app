/**
 * Context Engine — makes notifications "smart" by adjusting priority
 * based on readiness state, calendar context, and time-of-day.
 *
 * Called server-side during createNotification() to adjust priority
 * before insert. The client also runs a lightweight contextualSort()
 * for time-of-day feed ordering.
 *
 * Reference: Plan §Context Engine
 */

import { readSnapshot } from '../events/snapshot/snapshotReader';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { NotificationType, NotificationCategory } from './notificationTemplates';
import { getAdminPriorityOverride } from './notificationConfigService';

const db = () => supabaseAdmin() as any;

interface ContextAdjustment {
  priority: number; // adjusted priority (may differ from template default)
  suppress: boolean; // if true, don't create the notification
}

/**
 * Adjust notification priority based on athlete context.
 * Returns adjusted priority and whether to suppress entirely.
 */
export async function adjustPriorityByContext(
  athleteId: string,
  type: NotificationType,
  category: NotificationCategory,
  defaultPriority: number,
): Promise<ContextAdjustment> {
  let priority = defaultPriority;
  let suppress = false;

  // Admin priority override — replaces template default, context adjusts on top
  try {
    const adminOverride = await getAdminPriorityOverride(type);
    if (adminOverride !== null) priority = adminOverride;
  } catch {
    // Config lookup failure should never block notification creation
  }

  try {
    const snapshot = await readSnapshot(athleteId);
    if (!snapshot) return { priority, suppress };

    const readinessRag = (snapshot as any).readiness_rag as string | undefined;
    const acwr = (snapshot as any).acwr as number | undefined;

    // ── Readiness-aware adjustment ──
    if (readinessRag === 'RED') {
      // RED state: boost recovery + sleep, suppress training push
      if (type === 'REST_DAY_REMINDER' || type === 'WELLNESS_CRITICAL' || type === 'SLEEP_QUALITY_DROPPING') {
        priority = Math.min(priority, 1); // boost to P1
      }
      if (type === 'SESSION_STARTING_SOON' || type === 'JOURNAL_PRE_SESSION') {
        // Don't suppress, but lower urgency — athlete should still know
        priority = Math.max(priority, 3);
      }
    }

    // ── Calendar-aware adjustment ──
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const dayStart = `${today}T00:00:00.000Z`;
    const dayEnd = `${today}T23:59:59.999Z`;

    const { data: todayEvents } = await db()
      .from('calendar_events')
      .select('event_type')
      .eq('user_id', athleteId)
      .gte('start_at', dayStart)
      .lte('start_at', dayEnd);

    const eventTypes = (todayEvents ?? []).map((e: any) => e.event_type);
    const isMatchDay = eventTypes.includes('match');
    const isExamDay = eventTypes.includes('exam');

    if (isMatchDay) {
      // Match day: suppress gym-related, boost pre-match prep + sleep
      if (type === 'DUAL_LOAD_SPIKE') suppress = true;
      if (type === 'SESSION_STARTING_SOON' || type === 'JOURNAL_PRE_SESSION') {
        priority = Math.min(priority, 2); // boost to P2
      }
      if (type === 'PRE_MATCH_SLEEP_IMPORTANCE') {
        priority = Math.min(priority, 2); // boost on actual match day eve
      }
    }

    if (isExamDay) {
      // Exam day: boost academic, suppress non-essential training
      if (category === 'academic') {
        priority = Math.min(priority, 1); // boost to P1
      }
      if (type === 'SESSION_STARTING_SOON' || type === 'REST_DAY_REMINDER') {
        priority = Math.max(priority, 3); // lower priority
      }
    }
  } catch {
    // Context engine failures should never block notification creation
  }

  return { priority, suppress };
}

/**
 * Time-of-day awareness — returns a priority boost for notifications
 * based on the current hour. Used client-side for feed ordering.
 *
 * This is a pure function (no DB) exported for mobile use.
 */
export function getTimeOfDayBoost(
  type: NotificationType,
  hour: number,
): number {
  // Morning (06-09): boost checkin/streak
  if (hour >= 6 && hour < 9) {
    if (type === 'STREAK_AT_RISK' || type === 'CHECKIN_STREAK_MILESTONE') return -1;
  }

  // Pre-session window handled by calendar context, not time-of-day

  // Evening (18-22): boost streak risk and sleep reminders
  if (hour >= 18 && hour < 22) {
    if (type === 'STREAK_AT_RISK') return -1;
    if (type === 'BEDTIME_REMINDER' || type === 'PRE_MATCH_SLEEP_IMPORTANCE') return -1;
  }

  return 0; // no boost
}
