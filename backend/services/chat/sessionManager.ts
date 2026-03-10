/**
 * Session Manager — Chat session boundaries
 *
 * A "session" = a continuous block of conversation.
 * New session starts when >30 min inactivity since last message.
 */

import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

function generateSessionId(): string {
  return `sess_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

interface SessionResult {
  sessionId: string;
  isNewSession: boolean;
  previousSessionId: string | null;
}

/**
 * Determine if the current message starts a new session.
 */
export async function resolveSession(userId: string): Promise<SessionResult> {
  const db = supabaseAdmin();

  const { data: lastMessage } = await db
    .from("chat_messages")
    .select("created_at, metadata")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  // No previous messages — first session ever
  if (!lastMessage) {
    return {
      sessionId: generateSessionId(),
      isNewSession: true,
      previousSessionId: null,
    };
  }

  const lastTimestamp = new Date(lastMessage.created_at).getTime();
  const now = Date.now();
  const gap = now - lastTimestamp;

  const metadata = lastMessage.metadata as Record<string, unknown> | null;
  const previousSessionId = (metadata?.sessionId as string) || null;

  if (gap > SESSION_TIMEOUT_MS) {
    return {
      sessionId: generateSessionId(),
      isNewSession: true,
      previousSessionId,
    };
  }

  return {
    sessionId: previousSessionId || generateSessionId(),
    isNewSession: false,
    previousSessionId: null,
  };
}

/**
 * Get all messages for the current session.
 */
export async function getSessionMessages(
  userId: string,
  sessionId: string
): Promise<{ role: string; content: string }[]> {
  const db = supabaseAdmin();

  const { data: messages } = await db
    .from("chat_messages")
    .select("role, content, metadata")
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  return (messages || []).map((m) => ({
    role: m.role,
    content: m.content,
  }));
}
