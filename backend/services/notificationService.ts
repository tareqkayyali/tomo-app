/**
 * Notification Service
 * Handles creation, listing, read-state management, push notifications,
 * and bulk drill assignment notifications for user notifications.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { NotificationType } from "@/types";
import type { Json } from "@/types/database";

// NOTE: player_push_tokens + extended notification columns not yet in generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const notifDb = () => supabaseAdmin() as any;

// Expo Push Notification API
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// ── Create ──────────────────────────────────────────────────────────

export async function createNotification(data: {
  userId: string;
  type: NotificationType | string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  actionLabel?: string;
  actionData?: Record<string, unknown>;
  sourceId?: string;
  sourceType?: string;
  expiresAt?: string;
}) {
  const db = notifDb();

  const { data: notification, error } = await db
    .from("notifications")
    .insert({
      user_id: data.userId,
      type: data.type,
      title: data.title,
      body: data.body || null,
      data: (data.data || {}) as unknown as Json,
      read: false,
      is_acted: false,
      action_label: data.actionLabel ?? null,
      action_data: (data.actionData || {}) as unknown as Json,
      source_id: data.sourceId ?? null,
      source_type: data.sourceType ?? null,
      expires_at: data.expiresAt ?? null,
    })
    .select()
    .single();

  if (error)
    throw new Error(`Failed to create notification: ${error.message}`);
  return notification;
}

// ── List ────────────────────────────────────────────────────────────

export async function listNotifications(userId: string, limit = 50) {
  const db = notifDb();

  const { data, error } = await db
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error)
    throw new Error(`Failed to list notifications: ${error.message}`);
  return data || [];
}

// ── Mark as Read ────────────────────────────────────────────────────

export async function markAsRead(notificationId: string, userId: string) {
  const db = notifDb();

  const { data, error } = await db
    .from("notifications")
    .update({ read: true })
    .eq("id", notificationId)
    .eq("user_id", userId)
    .select()
    .single();

  if (error || !data) {
    throw new Error("Notification not found or does not belong to this user");
  }

  return data;
}

// ── Mark All as Read ────────────────────────────────────────────────

export async function markAllAsRead(userId: string) {
  const db = notifDb();

  const { error } = await db
    .from("notifications")
    .update({ read: true })
    .eq("user_id", userId)
    .eq("read", false);

  if (error)
    throw new Error(`Failed to mark all as read: ${error.message}`);
}

// ── Mark as Acted ───────────────────────────────────────────────────

export async function markNotificationActed(
  notificationId: string,
  userId: string
) {
  const db = notifDb();

  await db
    .from("notifications")
    .update({ read: true, is_acted: true })
    .eq("id", notificationId)
    .eq("user_id", userId);
}

// ── Unread Count ────────────────────────────────────────────────────

export async function getUnreadCount(userId: string): Promise<number> {
  const db = notifDb();

  const { count, error } = await db
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("read", false);

  if (error)
    throw new Error(`Failed to get unread count: ${error.message}`);
  return count || 0;
}

// ── Send Expo Push Notification ─────────────────────────────────────
// Fire-and-forget — never block the API response on push delivery

export async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  data: Record<string, any> = {}
): Promise<void> {
  try {
    const db = notifDb();

    // Get player's push token
    const { data: tokenRow } = await db
      .from("player_push_tokens")
      .select("expo_push_token")
      .eq("user_id", userId)
      .maybeSingle();

    if (!tokenRow?.expo_push_token) return; // No token registered

    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: tokenRow.expo_push_token,
        title,
        body,
        data,
        sound: "default",
        badge: 1,
        priority: "high",
        channelId: "tomo-drills",
      }),
    });

    if (!response.ok) {
      console.warn("[push] Expo API returned non-OK for user:", userId);
    }
  } catch (err) {
    // Never throw — push is best-effort
    console.error("[push] Failed to send push notification:", err);
  }
}

// ── Bulk Notify Players For Published Programme ─────────────────────

export async function notifyPlayersOfDrillAssignment(payload: {
  programmeId: string;
  programmeName: string;
  coachId: string;
  coachName: string;
  playerDrillMap: Record<
    string,
    {
      drills: Array<{
        drillId: string;
        drillName: string;
        drillCategory: string;
        sets: number;
        reps: string;
        intensity: string;
        restSeconds: number;
        rpeTarget: number;
        durationMin?: number;
        coachNotes?: string;
        isMandatory: boolean;
        scheduledDate: string;
        dayOfWeek: number;
      }>;
    }
  >;
}): Promise<void> {
  // Routed through the new notification engine (athlete_notifications +
  // pushDelivery) so drill assignments respect fatigue, quiet hours,
  // daily cap, min interval, and render consistently in the Center.
  // Legacy `notifications` table is no longer written.
  const { createNotification } = await import("./notifications/notificationEngine");

  const jobs: Array<Promise<unknown>> = [];

  for (const [playerId, { drills }] of Object.entries(payload.playerDrillMap)) {
    if (drills.length === 0) continue;

    const datesSorted = [...new Set(drills.map((d) => d.scheduledDate))].sort();
    const firstDate = datesSorted[0];
    const dateStr = firstDate ? formatDateShort(firstDate) : "";
    const mandatoryCount = drills.filter((d) => d.isMandatory).length;

    const mandatoryClause =
      mandatoryCount > 0 ? `${mandatoryCount} mandatory \u00B7 ` : "";
    const drillPlural = drills.length > 1 ? "s" : "";

    jobs.push(
      createNotification({
        athleteId: playerId,
        type: "COACH_DRILL_ASSIGNED",
        vars: {
          coach_name: payload.coachName,
          drill_count: drills.length,
          drill_plural: drillPlural,
          mandatory_count: mandatoryCount,
          mandatory_clause: mandatoryClause,
          first_date: dateStr,
          programme_id: payload.programmeId,
          programme_name: payload.programmeName,
        },
        sourceRef: { type: "programme", id: payload.programmeId },
      }),
    );
  }

  const results = await Promise.allSettled(jobs);
  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed > 0) {
    console.warn(`[notif] drill-assignment: ${failed}/${jobs.length} failed`);
  }
}

// ── Save Push Token ─────────────────────────────────────────────────

export async function savePushToken(
  userId: string,
  expoPushToken: string,
  platform: string
): Promise<void> {
  const db = notifDb();

  const { error } = await db.from("player_push_tokens").upsert(
    {
      user_id: userId,
      expo_push_token: expoPushToken,
      platform,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) {
    console.error(`[savePushToken] Failed to save push token for user ${userId}:`, error.message);
    throw error;
  }
  console.log(`[savePushToken] Saved push token for user ${userId}, platform=${platform}`);
}

// ── Helpers ─────────────────────────────────────────────────────────

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
