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
  const db = notifDb();

  const notifInserts: any[] = [];
  const pushJobs: Promise<void>[] = [];

  for (const [playerId, { drills }] of Object.entries(
    payload.playerDrillMap
  )) {
    if (drills.length === 0) continue;

    // Group drills by date
    const dateGroups: Record<string, typeof drills> = {};
    for (const drill of drills) {
      if (!dateGroups[drill.scheduledDate])
        dateGroups[drill.scheduledDate] = [];
      dateGroups[drill.scheduledDate].push(drill);
    }

    const firstDate = Object.keys(dateGroups).sort()[0];
    const dateStr = firstDate ? formatDateShort(firstDate) : "";
    const mandatoryCount = drills.filter((d) => d.isMandatory).length;

    const title = `${payload.coachName} assigned you ${drills.length} drill${drills.length > 1 ? "s" : ""}`;
    const body =
      mandatoryCount > 0
        ? `${mandatoryCount} mandatory · Starting ${dateStr} · Tap to add to your schedule`
        : `Starting ${dateStr} · Tap to add to your schedule`;

    const notifData = {
      programmeId: payload.programmeId,
      programmeName: payload.programmeName,
      coachName: payload.coachName,
      drillCount: drills.length,
      scheduledDate: firstDate,
      drills,
    };

    notifInserts.push({
      user_id: playerId,
      type: "coach_drill_assigned",
      title,
      body,
      data: notifData,
      read: false,
      is_acted: false,
      action_label: "Add to schedule",
      action_data: {
        programmeId: payload.programmeId,
        drillDates: Object.keys(dateGroups),
      },
      source_id: payload.programmeId,
      source_type: "programme",
      expires_at: null,
    });

    // Queue push notification (fire-and-forget)
    pushJobs.push(
      sendPushNotification(playerId, title, body, {
        programmeId: payload.programmeId,
        type: "coach_drill_assigned",
      })
    );
  }

  // Batch insert all notifications
  if (notifInserts.length > 0) {
    const { error } = await db
      .from("notifications")
      .insert(notifInserts);
    if (error)
      console.error("[notif] Batch insert failed:", error);
  }

  // Fire all push notifications (non-blocking)
  Promise.allSettled(pushJobs).then((results) => {
    const failed = results.filter(
      (r) => r.status === "rejected"
    ).length;
    if (failed > 0)
      console.warn(
        `[push] ${failed}/${pushJobs.length} push notifications failed`
      );
  });
}

// ── Save Push Token ─────────────────────────────────────────────────

export async function savePushToken(
  userId: string,
  expoPushToken: string,
  platform: string
): Promise<void> {
  const db = notifDb();

  await db.from("player_push_tokens").upsert(
    {
      user_id: userId,
      expo_push_token: expoPushToken,
      platform,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
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
