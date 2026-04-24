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
import { isTypeEnabled } from './notificationConfigService';

// ─── Types ────────────────────────────────────────────────────────────

export interface CreateNotificationInput {
  athleteId: string;
  type: NotificationType;
  vars: Record<string, string | number>;
  sourceRef?: { type: string; id: string };
  expiresAt?: string; // ISO timestamp override
  // When true, skip the fatigue guard + context-driven priority adjustment.
  // Reserved for truly urgent paths (e.g. coach/parent urgent event
  // annotations per P2.1). Every use is logged and admin-capped to
  // 3 urgent pushes / athlete / sender / day at the API layer.
  bypassFatigue?: boolean;
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
  const { athleteId, type, vars, sourceRef, expiresAt, bypassFatigue } = input;
  const template = NOTIFICATION_TEMPLATES[type];
  if (!template) {
    console.error(`[notif-engine] Unknown notification type: ${type}`);
    return null;
  }

  // Admin global disable check — blocks creation entirely for disabled types
  if (!(await isTypeEnabled(type))) {
    return null;
  }

  const db = notifDb();
  // Urgent paths skip grouping so each urgent note fires its own push
  // (no dedup collapse). Non-urgent paths still dedup by group_key.
  const groupKey = bypassFatigue ? null : resolveGroupKey(type, athleteId, vars);

  // Grouping: if a live notification with same group_key exists, update it
  if (groupKey) {
    const existing = await getActiveByGroupKey(db, athleteId, groupKey);
    if (existing) {
      await updateGroupedNotification(db, existing, template, vars);
      return existing.id;
    }
  }

  // Fatigue guard: check dismissal pattern.
  // Bypass path (bypassFatigue=true) skips this — reserved for urgent
  // annotations etc., rate-limited at the API layer.
  if (!bypassFatigue && await isFatigued(db, athleteId, type)) {
    return null;
  }

  // Context engine: adjust priority based on readiness, calendar, time-of-day.
  // Bypass path keeps the template priority verbatim and ignores
  // suppression so urgent notes reach the athlete even in quiet hours.
  let adjustedPriority = template.priority;
  if (!bypassFatigue) {
    const ctx = await adjustPriorityByContext(
      athleteId, type, template.category, template.priority
    );
    if (ctx.suppress) return null;
    adjustedPriority = ctx.priority;
  }

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

  // Schedule push delivery (fire-and-forget). Templates marked
  // suppress_push=true appear in the Center but never push \u2014 used
  // for positive-confirmation types where a push would be pushy.
  if (data?.id && !template.suppress_push) {
    const deepLink = resolvedPrimaryAction?.deep_link ?? '';
    schedulePush(
      athleteId, data.id, template.category, type, resolvedTitle, resolvedBody, deepLink
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

  // Counts: use explicit (expires_at IS NULL OR expires_at > now) via two queries.
  // A single chained .or(`expires_at.is.null,expires_at.gt.${nowISO}`) after .eq
  // is easy to mis-parse in PostgREST and can diverge from the list + header badge.
  const { unread_count, by_category, by_category_total } = await aggregateActiveNotificationCounts(
    db,
    athleteId,
    nowISO,
  );

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
  const nowISO = new Date().toISOString();
  const { unread_count, by_category } = await aggregateActiveNotificationCounts(db, athleteId, nowISO);
  return { total: unread_count, by_category };
}

// ─── Internal Helpers ────────────────────────────────────────────────

const ACTIVE_LIST_STATUSES = ['unread', 'read', 'acted'] as const;

/**
 * Unread + not past expires_at (matches list visibility). Split queries avoid
 * fragile top-level `.or()` grouping with other filters.
 */
async function aggregateActiveNotificationCounts(
  db: any,
  athleteId: string,
  nowISO: string,
): Promise<{
  unread_count: number;
  by_category: Record<string, number>;
  by_category_total: Record<string, number>;
}> {
  const [unreadNull, unreadFuture, totalNull, totalFuture] = await Promise.all([
    db
      .from('athlete_notifications')
      .select('category')
      .eq('athlete_id', athleteId)
      .eq('status', 'unread')
      .is('expires_at', null),
    db
      .from('athlete_notifications')
      .select('category')
      .eq('athlete_id', athleteId)
      .eq('status', 'unread')
      .gt('expires_at', nowISO),
    db
      .from('athlete_notifications')
      .select('category')
      .eq('athlete_id', athleteId)
      .in('status', ACTIVE_LIST_STATUSES)
      .is('expires_at', null),
    db
      .from('athlete_notifications')
      .select('category')
      .eq('athlete_id', athleteId)
      .in('status', ACTIVE_LIST_STATUSES)
      .gt('expires_at', nowISO),
  ]);

  const unreadRows = [...(unreadNull.data ?? []), ...(unreadFuture.data ?? [])];
  const totalRows = [...(totalNull.data ?? []), ...(totalFuture.data ?? [])];

  const by_category: Record<string, number> = {};
  for (const row of unreadRows) {
    by_category[row.category] = (by_category[row.category] ?? 0) + 1;
  }

  const by_category_total: Record<string, number> = {};
  for (const row of totalRows) {
    by_category_total[row.category] = (by_category_total[row.category] ?? 0) + 1;
  }

  return {
    unread_count: unreadRows.length,
    by_category,
    by_category_total,
  };
}

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
 * for the athlete.
 *
 * Critical types are exempt from fatigue.
 * Subtle-defaults rule: 3 dismissals in 7 days silences a non-critical
 * type (was 5) — Tomo errs on the side of restraint for 13–17yo users.
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

  if ((count ?? 0) >= 3) return true;

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
