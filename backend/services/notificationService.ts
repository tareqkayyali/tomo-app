/**
 * Notification Service
 * Handles creation, listing, and read-state management for user notifications.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { NotificationType } from "@/types";
import type { Json } from "@/types/database";

// ── Create ──────────────────────────────────────────────────────────

export async function createNotification(data: {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
}) {
  const db = supabaseAdmin();

  const { data: notification, error } = await db
    .from("notifications")
    .insert({
      user_id: data.userId,
      type: data.type,
      title: data.title,
      body: data.body || null,
      data: (data.data || {}) as unknown as Json,
      read: false,
    })
    .select()
    .single();

  if (error)
    throw new Error(`Failed to create notification: ${error.message}`);
  return notification;
}

// ── List ────────────────────────────────────────────────────────────

export async function listNotifications(userId: string, limit = 50) {
  const db = supabaseAdmin();

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
  const db = supabaseAdmin();

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
  const db = supabaseAdmin();

  const { error } = await db
    .from("notifications")
    .update({ read: true })
    .eq("user_id", userId)
    .eq("read", false);

  if (error)
    throw new Error(`Failed to mark all as read: ${error.message}`);
}

// ── Unread Count ────────────────────────────────────────────────────

export async function getUnreadCount(userId: string): Promise<number> {
  const db = supabaseAdmin();

  const { count, error } = await db
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("read", false);

  if (error)
    throw new Error(`Failed to get unread count: ${error.message}`);
  return count || 0;
}
