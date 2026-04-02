/**
 * Notification Config Service — admin-level control over notification types.
 *
 * Reads from `notification_type_config` table and merges with code-defined
 * templates. Provides lookup functions used by the notification engine to
 * check if a type is enabled, get priority overrides, and check push status.
 *
 * Critical types (LOAD_WARNING_SPIKE, INJURY_RISK_FLAG, WELLNESS_CRITICAL)
 * can never be disabled — enforced here at the service layer.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  NOTIFICATION_TEMPLATES,
  type NotificationType,
  type NotificationCategory,
} from './notificationTemplates';

// Cast to `any` — notification_type_config table not yet in generated Supabase types.
// Run `npx supabase gen types typescript --local` after migration to remove.
const db = () => supabaseAdmin() as any;

// ─── Critical Types (cannot be disabled) ─────────────────────────────

const CRITICAL_TYPES: Set<string> = new Set([
  'LOAD_WARNING_SPIKE',
  'INJURY_RISK_FLAG',
  'WELLNESS_CRITICAL',
]);

// ─── Types ───────────────────────────────────────────────────────────

export interface NotificationTypeConfig {
  notification_type: string;
  enabled: boolean;
  priority_override: number | null;
  push_enabled: boolean;
  notes: string | null;
  updated_by: string | null;
  updated_at: string | null;
}

export interface MergedTypeConfig {
  type: string;
  category: NotificationCategory;
  default_priority: number;
  priority_override: number | null;
  effective_priority: number;
  enabled: boolean;
  push_enabled: boolean;
  can_dismiss: boolean;
  is_critical: boolean;
  notes: string | null;
  has_override: boolean;
}

// ─── CRUD Functions ──────────────────────────────────────────────────

/**
 * Get all notification type configs merged with code-defined templates.
 * Types without a DB row get default values (enabled, no override, push on).
 */
export async function getAllConfigs(): Promise<MergedTypeConfig[]> {
  const dbClient = db();

  // Load all DB overrides
  const overrides: Record<string, NotificationTypeConfig> = {};
  try {
    const { data } = await dbClient
      .from('notification_type_config')
      .select('*');
    if (data) {
      for (const row of data) {
        overrides[row.notification_type] = row;
      }
    }
  } catch {
    // Table may not exist yet — return code defaults
  }

  // Merge with code-defined templates
  return Object.values(NOTIFICATION_TEMPLATES).map((template) => {
    const override = overrides[template.type];
    const isCritical = CRITICAL_TYPES.has(template.type);
    const enabled = isCritical ? true : (override?.enabled ?? true);
    const priorityOverride = override?.priority_override ?? null;

    return {
      type: template.type,
      category: template.category as NotificationCategory,
      default_priority: template.priority,
      priority_override: priorityOverride,
      effective_priority: priorityOverride ?? template.priority,
      enabled,
      push_enabled: override?.push_enabled ?? true,
      can_dismiss: template.can_dismiss,
      is_critical: isCritical,
      notes: override?.notes ?? null,
      has_override: !!override,
    };
  });
}

/**
 * Check if a notification type is enabled at the admin level.
 * Critical types always return true regardless of DB state.
 */
export async function isTypeEnabled(type: NotificationType): Promise<boolean> {
  if (CRITICAL_TYPES.has(type)) return true;

  try {
    const { data } = await db()
      .from('notification_type_config')
      .select('enabled')
      .eq('notification_type', type)
      .maybeSingle();

    // No row = enabled by default
    if (!data) return true;
    return data.enabled !== false;
  } catch {
    // Table doesn't exist or query failed — default to enabled
    return true;
  }
}

/**
 * Get admin priority override for a type.
 * Returns null if no override exists (use template default).
 */
export async function getAdminPriorityOverride(type: NotificationType): Promise<number | null> {
  try {
    const { data } = await db()
      .from('notification_type_config')
      .select('priority_override')
      .eq('notification_type', type)
      .maybeSingle();

    return data?.priority_override ?? null;
  } catch {
    return null;
  }
}

/**
 * Check if push delivery is enabled for a notification type at the admin level.
 */
export async function isTypePushEnabled(type: NotificationType): Promise<boolean> {
  try {
    const { data } = await db()
      .from('notification_type_config')
      .select('push_enabled')
      .eq('notification_type', type)
      .maybeSingle();

    if (!data) return true;
    return data.push_enabled !== false;
  } catch {
    return true;
  }
}

/**
 * Upsert admin config for a notification type.
 * Rejects disabling critical types.
 */
export async function upsertConfig(
  type: NotificationType,
  updates: {
    enabled?: boolean;
    priority_override?: number | null;
    push_enabled?: boolean;
    notes?: string | null;
  },
  adminId: string,
): Promise<void> {
  // Safety: critical types cannot be disabled
  if (CRITICAL_TYPES.has(type) && updates.enabled === false) {
    throw new Error(`Cannot disable critical notification type: ${type}`);
  }

  // Validate type exists
  if (!NOTIFICATION_TEMPLATES[type]) {
    throw new Error(`Unknown notification type: ${type}`);
  }

  const row: Record<string, unknown> = {
    notification_type: type,
    updated_by: adminId,
    updated_at: new Date().toISOString(),
  };

  if (updates.enabled !== undefined) row.enabled = updates.enabled;
  if (updates.priority_override !== undefined) row.priority_override = updates.priority_override;
  if (updates.push_enabled !== undefined) row.push_enabled = updates.push_enabled;
  if (updates.notes !== undefined) row.notes = updates.notes;

  const { error } = await db()
    .from('notification_type_config')
    .upsert(row, { onConflict: 'notification_type' });

  if (error) {
    console.error(`[notif-config] Upsert failed for ${type}:`, error.message);
    throw new Error(error.message);
  }
}
