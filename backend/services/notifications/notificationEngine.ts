/**
 * Notification Engine — core create/update/resolve/expire logic.
 *
 * All notification creation goes through createNotification().
 * Called fire-and-forget from event handlers after writeSnapshot().
 *
 * Reference: Files/tomo_notification_center_p2.md §8
 */

import { supabaseAdmin } from '@/lib/supabase/admin';

// Cast to `any` — notification tables (migration 025) not yet in generated Supabase types.
// Run `npx supabase gen types typescript --local` after migration to remove.
const notifDb = () => supabaseAdmin() as any;
import {
  NOTIFICATION_TEMPLATES,
  interpolate,
  resolveChips,
  resolveAction,
  resolveGroupKey,
  type NotificationType,
  type NotificationCategory,
} from './notificationTemplates';
import { adjustPriorityByContext } from './contextEngine';
import { schedulePush } from './pushDelivery';

// ─── Types ────────────────────────────────────────────────────────────

export interface CreateNotificationInput {
  athleteId: string;
  type: NotificationType;
  vars: Record<string, string | number>;
  sourceRef?: { type: string; id: string };
  expiresAt?: string; // ISO timestamp override
}

interface NotificationRecord {
  id: string;
  athlete_id: string;
  type: string;
  category: string;
  priority: number;
  group_key: string | null;
  title: string;
  body: string;
  chips: unknown;
  primary_action: unknown;
  secondary_action: unknown;
  source_ref_type: string | null;
  source_ref_id: string | null;
  status: string;
  expires_at: string | null;
  created_at: string;
}

// ─── Core Functions ──────────────────────────────────────────────────

/**
 * Create a notification from a template.
 * Handles: template lookup, group-key dedup, fatigue check,
 * DB insert, and returns the notification ID.
 */
export async function createNotification(
  input: CreateNotificationInput,
): Promise<string | null> {
  const { athleteId, type, vars, sourceRef, expiresAt } = input;
  const template = NOTIFICATION_TEMPLATES[type];
  if (!template) {
    console.error(`[notif-engine] Unknown notification type: ${type}`);
    return null;
  }

  const db = notifDb();
  const groupKey = resolveGroupKey(type, athleteId, vars);

  // Grouping: if a live notification with same group_key exists, update it
  if (groupKey) {
    const existing = await getActiveByGroupKey(db, athleteId, groupKey);
    if (existing) {
      await updateGroupedNotification(db, existing, template, vars);
      return existing.id;
    }
  }

  // Fatigue guard: check dismissal pattern
  if (await isFatigued(db, athleteId, type)) {
    return null;
  }

  // Context engine: adjust priority based on readiness, calendar, time-of-day
  const { priority: adjustedPriority, suppress } = await adjustPriorityByContext(
    athleteId, type, template.category, template.priority
  );
  if (suppress) return null;

  // Resolve expiry
  const resolvedExpiry = expiresAt ?? resolveExpiry(template, vars);

  const resolvedTitle = interpolate(template.title, vars);
  const resolvedBody = interpolate(template.body, vars);
  const resolvedPrimaryAction = resolveAction(template.primary_action, vars);

  const { data, error } = await db
    .from('athlete_notifications')
    .insert({
      athlete_id: athleteId,
      type,
      category: template.category,
      priority: adjustedPriority,
      group_key: groupKey,
      title: resolvedTitle,
      body: resolvedBody,
      chips: resolveChips(template.chips, vars),
      primary_action: resolvedPrimaryAction,
      secondary_action: resolveAction(template.secondary_action, vars),
      source_ref_type: sourceRef?.type ?? null,
      source_ref_id: sourceRef?.id ?? null,
      expires_at: resolvedExpiry,
    })
    .select('id')
    .single();

  if (error) {
    // Unique constraint violation on group_key = race condition, safe to ignore
    if (error.code === '23505') return null;
    console.error(`[notif-engine] Insert failed for ${type}:`, error.message);
    return null;
  }

  // Schedule push delivery (fire-and-forget)
  if (data?.id) {
    const deepLink = resolvedPrimaryAction?.deep_link ?? '';
    schedulePush(
      athleteId, data.id, template.category, resolvedTitle, resolvedBody, deepLink
    ).catch((err) => {
      console.error(`[notif-engine] schedulePush threw for notif ${data.id}:`, err);
    });
  }

  return data?.id ?? null;
}

/**
 * Resolve (expire) all active notifications matching a source reference.
 * Used when the underlying condition is resolved (e.g., journal completed).
 */
export async function resolveBySourceRef(
  sourceRefType: string,
  sourceRefId: string,
): Promise<number> {
  const db = notifDb();
  const { data, error } = await db
    .from('athlete_notifications')
    .update({
      status: 'expired',
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .in('status', ['unread', 'read'])
    .eq('source_ref_type', sourceRefType)
    .eq('source_ref_id', sourceRefId)
    .select('id');

  if (error) {
    console.error(`[notif-engine] resolveBySourceRef failed:`, error.message);
    return 0;
  }
  return data?.length ?? 0;
}

/**
 * Resolve all active notifications of a given type for an athlete.
 * Used when a state-based condition resolves (e.g., ACWR drops below 1.3).
 */
export async function resolveByType(
  athleteId: string,
  type: NotificationType,
): Promise<number> {
  const db = notifDb();
  const { data, error } = await db
    .from('athlete_notifications')
    .update({
      status: 'expired',
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .in('status', ['unread', 'read'])
    .eq('athlete_id', athleteId)
    .eq('type', type)
    .select('id');

  if (error) {
    console.error(`[notif-engine] resolveByType failed:`, error.message);
    return 0;
  }
  return data?.length ?? 0;
}

/**
 * Mark a notification as read.
 */
export async function markRead(notificationId: string): Promise<boolean> {
  const db = notifDb();
  const { error } = await db
    .from('athlete_notifications')
    .update({
      status: 'read',
      read_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', notificationId)
    .eq('status', 'unread');

  return !error;
}

/**
 * Mark a notification as acted upon.
 */
export async function markActed(notificationId: string): Promise<boolean> {
  const db = notifDb();
  const { error } = await db
    .from('athlete_notifications')
    .update({
      status: 'acted',
      acted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', notificationId)
    .in('status', ['unread', 'read']);

  return !error;
}

/**
 * Dismiss a notification and log it for fatigue guard.
 */
export async function dismiss(
  notificationId: string,
  athleteId: string,
  notificationType: string,
): Promise<boolean> {
  const db = notifDb();

  // Update status
  const { error: updateError } = await db
    .from('athlete_notifications')
    .update({
      status: 'dismissed',
      dismissed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', notificationId)
    .in('status', ['unread', 'read']);

  if (updateError) return false;

  // Log dismissal for fatigue guard
  await db.from('notification_dismissal_log').insert({
    athlete_id: athleteId,
    notification_type: notificationType,
  });

  return true;
}

/**
 * Mark all unread notifications as read for an athlete.
 * Optionally filter by category.
 */
export async function markAllRead(
  athleteId: string,
  category?: NotificationCategory,
): Promise<number> {
  const db = notifDb();
  let query = db
    .from('athlete_notifications')
    .update({
      status: 'read',
      read_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('athlete_id', athleteId)
    .eq('status', 'unread');

  if (category) {
    query = query.eq('category', category);
  }

  const { data, error } = await query.select('id');
  if (error) {
    console.error('[notif-engine] markAllRead failed:', error.message);
    return 0;
  }
  return data?.length ?? 0;
}

/**
 * Mark all notifications whose expires_at has passed as 'expired'.
 * Must run every cron cycle — this is the only thing that cleans up stale notifications
 * and unblocks dedup so new ones can be created for the same group keys.
 *
 * @returns Number of notifications expired
 */
export async function expireByTTL(): Promise<number> {
  const db = notifDb();
  const now = new Date();
  const nowISO = now.toISOString();
  let total = 0;

  // 1. Expire notifications whose explicit expires_at has passed
  const { data: expiredData, error } = await db
    .from('athlete_notifications')
    .update({
      status: 'expired',
      resolved_at: nowISO,
      updated_at: nowISO,
    })
    .in('status', ['unread', 'read'])
    .not('expires_at', 'is', null)
    .lt('expires_at', nowISO)
    .select('id');

  if (error) {
    console.error('[notif-engine] expireByTTL failed:', error.message);
  } else {
    total += expiredData?.length ?? 0;
  }

  // 2. Expire time-sensitive types past their max age (catches legacy rows with wrong/null expires_at)
  const TIME_SENSITIVE = [
    { type: 'BEDTIME_REMINDER', maxAgeMs: 60 * 60 * 1000 },
    { type: 'PRE_MATCH_SLEEP_IMPORTANCE', maxAgeMs: 60 * 60 * 1000 },
    { type: 'SESSION_STARTING_SOON', maxAgeMs: 40 * 60 * 1000 },
    { type: 'CHECKIN_REMINDER', maxAgeMs: 90 * 60 * 1000 },
    // Condition-based critical types: max 48h regardless of expires_at
    // If the condition cleared, runConditionExpiryCheck resolves sooner.
    // If the condition is still active, a fresh notification fires on the next event.
    { type: 'LOAD_WARNING_SPIKE', maxAgeMs: 48 * 60 * 60 * 1000 },
    { type: 'INJURY_RISK_FLAG', maxAgeMs: 48 * 60 * 60 * 1000 },
    { type: 'WELLNESS_CRITICAL', maxAgeMs: 48 * 60 * 60 * 1000 },
    { type: 'DUAL_LOAD_SPIKE', maxAgeMs: 48 * 60 * 60 * 1000 },
  ];

  for (const { type, maxAgeMs } of TIME_SENSITIVE) {
    const cutoff = new Date(now.getTime() - maxAgeMs).toISOString();
    const { data: tsData } = await db
      .from('athlete_notifications')
      .update({ status: 'expired', resolved_at: nowISO, updated_at: nowISO })
      .in('status', ['unread', 'read'])
      .eq('type', type)
      .lt('created_at', cutoff)
      .select('id');
    total += tsData?.length ?? 0;
  }

  return total;
}

/**
 * Get notifications for an athlete with optional filters.
 */
export async function getNotifications(
  athleteId: string,
  options: {
    status?: string;
    category?: string;
    limit?: number;
    offset?: number;
  } = {},
): Promise<{
  notifications: NotificationRecord[];
  unread_count: number;
  by_category: Record<string, number>;
  by_category_total: Record<string, number>;
}> {
  const db = notifDb();
  const { status, category, limit = 30, offset = 0 } = options;

  // Fetch notifications — exclude expired status AND expired by time (before expireByTTL runs)
  const nowISO = new Date().toISOString();
  let query = db
    .from('athlete_notifications')
    .select('*')
    .eq('athlete_id', athleteId)
    .not('status', 'eq', 'expired')
    .or(`expires_at.is.null,expires_at.gt.${nowISO}`)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq('status', status);
  if (category) query = query.eq('category', category);

  const { data: notifications, error } = await query;

  if (error) {
    console.error('[notif-engine] getNotifications failed:', error.message);
    return { notifications: [], unread_count: 0, by_category: {}, by_category_total: {} };
  }

  // Fetch counts by category (both unread and total active)
  // Exclude time-expired rows the same way the main query does
  const [{ data: unreadData }, { data: totalData }] = await Promise.all([
    db.from('athlete_notifications').select('category').eq('athlete_id', athleteId).eq('status', 'unread')
      .or(`expires_at.is.null,expires_at.gt.${nowISO}`),
    db.from('athlete_notifications').select('category').eq('athlete_id', athleteId).in('status', ['unread', 'read', 'acted'])
      .or(`expires_at.is.null,expires_at.gt.${nowISO}`),
  ]);

  const by_category: Record<string, number> = {};
  let unread_count = 0;
  if (unreadData) {
    for (const row of unreadData) {
      by_category[row.category] = (by_category[row.category] ?? 0) + 1;
      unread_count++;
    }
  }

  // Total active notifications per category (for filter tab counts)
  const by_category_total: Record<string, number> = {};
  if (totalData) {
    for (const row of totalData) {
      by_category_total[row.category] = (by_category_total[row.category] ?? 0) + 1;
    }
  }

  return {
    notifications: (notifications ?? []) as NotificationRecord[],
    unread_count,
    by_category,
    by_category_total,
  };
}

/**
 * Get unread count summary for an athlete.
 */
export async function getUnreadCount(
  athleteId: string,
): Promise<{ total: number; by_category: Record<string, number> }> {
  const db = notifDb();
  const { data } = await db
    .from('athlete_notifications')
    .select('category')
    .eq('athlete_id', athleteId)
    .eq('status', 'unread');

  const by_category: Record<string, number> = {};
  let total = 0;
  if (data) {
    for (const row of data) {
      by_category[row.category] = (by_category[row.category] ?? 0) + 1;
      total++;
    }
  }

  return { total, by_category };
}

// ─── Internal Helpers ────────────────────────────────────────────────

async function getActiveByGroupKey(
  db: any,
  athleteId: string,
  groupKey: string,
): Promise<NotificationRecord | null> {
  const { data } = await db
    .from('athlete_notifications')
    .select('*')
    .eq('athlete_id', athleteId)
    .eq('group_key', groupKey)
    .in('status', ['unread', 'read'])
    .single();

  return (data as NotificationRecord) ?? null;
}

async function updateGroupedNotification(
  db: any,
  existing: NotificationRecord,
  template: (typeof NOTIFICATION_TEMPLATES)[NotificationType],
  vars: Record<string, string | number>,
): Promise<void> {
  const behavior = template.group_update_behavior ?? 'replace_body';

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  switch (behavior) {
    case 'replace_body':
      updates.title = interpolate(template.title, vars);
      updates.body = interpolate(template.body, vars);
      updates.chips = resolveChips(template.chips, vars);
      break;
    case 'increment_count': {
      // Extract current count from chips or default to 1
      const currentChips = (existing.chips as Array<{ label: string; style: string }>) ?? [];
      const viewChip = currentChips.find((c) => c.label.includes('view'));
      const currentCount = viewChip
        ? parseInt(viewChip.label.match(/\d+/)?.[0] ?? '1', 10)
        : 1;
      const newCount = currentCount + 1;
      updates.chips = resolveChips(template.chips, { ...vars, N: newCount });
      updates.body = interpolate(template.body, { ...vars, N: newCount });
      break;
    }
    case 'extend_expiry': {
      const newExpiry = resolveExpiry(template, vars);
      if (newExpiry) updates.expires_at = newExpiry;
      break;
    }
  }

  await db
    .from('athlete_notifications')
    .update(updates)
    .eq('id', existing.id);
}

/**
 * Fatigue guard: returns true if this notification type is fatigued
 * for the athlete (3+ dismissals in 7 days without acting).
 *
 * Critical types are exempt from fatigue.
 */
async function isFatigued(
  db: any,
  athleteId: string,
  type: NotificationType,
): Promise<boolean> {
  const template = NOTIFICATION_TEMPLATES[type];
  if (template.category === 'critical') return false;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { count } = await db
    .from('notification_dismissal_log')
    .select('id', { count: 'exact', head: true })
    .eq('athlete_id', athleteId)
    .eq('notification_type', type)
    .gte('dismissed_at', sevenDaysAgo);

  // 5+ dismissals = fully fatigued (no push or in-app for 14 days)
  if ((count ?? 0) >= 5) return true;

  return false;
}

function resolveExpiry(
  template: (typeof NOTIFICATION_TEMPLATES)[NotificationType],
  vars: Record<string, string | number>,
): string | null {
  const config = template.expiry;

  if (config.ttl_minutes) {
    return new Date(Date.now() + config.ttl_minutes * 60 * 1000).toISOString();
  }

  if (config.ttl_hours) {
    return new Date(Date.now() + config.ttl_hours * 60 * 60 * 1000).toISOString();
  }

  if (config.expires_at_field) {
    switch (config.expires_at_field) {
      case 'session_start_time':
        return vars.session_start_time ? String(vars.session_start_time) : null;
      case 'midnight_same_day': {
        const d = new Date();
        d.setHours(23, 59, 59, 999);
        return d.toISOString();
      }
      default:
        return vars[config.expires_at_field]
          ? String(vars[config.expires_at_field])
          : null;
    }
  }

  if (config.inherits_from && vars.expires_at) {
    return String(vars.expires_at);
  }

  return null;
}
