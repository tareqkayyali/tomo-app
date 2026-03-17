/**
 * Session Service — Server-side chat session management.
 *
 * Manages chat_sessions and chat_messages in Supabase.
 * Handles conversation history loading with token budgeting,
 * pending action storage, and auto-titling.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { TomoResponse } from "./responseFormatter";

// chat_sessions and chat_messages aren't in generated DB types yet.
// Use untyped client until `npx supabase gen types` is re-run after migration.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supa = () => supabaseAdmin() as any;

const TOKEN_BUDGET = 12000;
const CHARS_PER_TOKEN = 4; // rough estimate
const PENDING_ACTION_TTL_MS = 60 * 60 * 1000; // 60 minutes

// ── Types ────────────────────────────────────────────────────────

export interface ChatSession {
  id: string;
  user_id: string;
  title: string;
  pending_action: PendingAction | null;
  pending_action_expires_at: string | null;
  active_agent: string | null;
  conversation_state: ConversationState | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConversationState {
  currentTopic: string | null;
  referencedDates: Record<string, string>;
  referencedEventIds: string[];
  referencedEventNames: string[];
  /** Drill IDs from session plans — maps drill name → drillId UUID */
  referencedDrills: Record<string, string>;
  lastActionContext: string | null;
  extractedAt: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  structured: TomoResponse | null;
  agent: string | null;
  token_count: number;
  created_at: string;
}

export interface PendingAction {
  toolName: string;
  toolInput: Record<string, any>;
  agentType: string;
  preview: string;
  /** Batch actions — when multiple write actions need confirmation together */
  actions?: Array<{
    toolName: string;
    toolInput: Record<string, any>;
    agentType: string;
    preview: string;
  }>;
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

// ── Session CRUD ─────────────────────────────────────────────────

export async function createSession(userId: string): Promise<ChatSession> {
  const { data, error } = await supa()
    .from("chat_sessions")
    .insert({ user_id: userId })
    .select()
    .single();

  if (error) throw new Error(`Failed to create session: ${error.message}`);
  return data as ChatSession;
}

export async function getOrCreateSession(
  userId: string,
  sessionId?: string
): Promise<ChatSession> {
  if (sessionId) {
    const { data, error } = await supa()
      .from("chat_sessions")
      .select()
      .eq("id", sessionId)
      .eq("user_id", userId)
      .is("ended_at", null)
      .single();

    if (data && !error) return data as ChatSession;
  }

  // Find most recent active session or create new
  const { data: recent } = await supa()
    .from("chat_sessions")
    .select()
    .eq("user_id", userId)
    .is("ended_at", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();

  if (recent) return recent as ChatSession;
  return createSession(userId);
}

export async function listUserSessions(
  userId: string,
  limit = 20
): Promise<ChatSession[]> {
  const { data, error } = await supa()
    .from("chat_sessions")
    .select()
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to list sessions: ${error.message}`);
  return (data ?? []) as ChatSession[];
}

export async function endSession(
  userId: string,
  sessionId: string
): Promise<void> {
  const { error } = await supa()
    .from("chat_sessions")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("user_id", userId);

  if (error) throw new Error(`Failed to end session: ${error.message}`);
}

// ── Message Storage ──────────────────────────────────────────────

export async function saveMessage(
  sessionId: string,
  userId: string,
  role: "user" | "assistant",
  content: string,
  options?: {
    structured?: TomoResponse | null;
    agent?: string | null;
  }
): Promise<ChatMessage> {
  const tokenCount = Math.ceil(content.length / CHARS_PER_TOKEN);

  const { data, error } = await supa()
    .from("chat_messages")
    .insert({
      session_id: sessionId,
      user_id: userId,
      role,
      content,
      structured: options?.structured ?? null,
      agent: options?.agent ?? null,
      token_count: tokenCount,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to save message: ${error.message}`);

  // Auto-title session after first user message
  if (role === "user") {
    await autoTitleSession(sessionId, content);
  }

  return data as ChatMessage;
}

// ── Conversation History ─────────────────────────────────────────

export async function loadSessionHistory(
  sessionId: string
): Promise<{ messages: ConversationMessage[]; lastAgentType?: string }> {
  const { data, error } = await supa()
    .from("chat_messages")
    .select("role, content, token_count, structured, agent")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error || !data) return { messages: [] };

  // Trim to token budget — keep most recent messages
  const messages = data as Array<{
    role: "user" | "assistant";
    content: string;
    token_count: number;
    structured: TomoResponse | null;
    agent: string | null;
  }>;

  // Extract last agent type from the most recent assistant message
  let lastAgentType: string | undefined;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant" && messages[i].agent) {
      lastAgentType = messages[i].agent!;
      break;
    }
  }

  let totalTokens = 0;
  const trimmed: ConversationMessage[] = [];

  // Walk backwards, accumulating until budget hit
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    // Enrich assistant messages with structured data so the AI retains context
    // of what it proposed (e.g. specific sessions in a schedule_list)
    const content = msg.role === "assistant" && msg.structured
      ? enrichContentWithStructured(msg.content, msg.structured)
      : msg.content;
    const tokenCount = Math.ceil(content.length / CHARS_PER_TOKEN);
    if (totalTokens + tokenCount > TOKEN_BUDGET) break;
    totalTokens += tokenCount;
    trimmed.unshift({ role: msg.role, content });
  }

  return { messages: trimmed, lastAgentType };
}

/**
 * Enrich a short assistant message with key data from its structured response.
 * This gives the AI full context of what it proposed (sessions, stats, etc.)
 * so follow-up messages can reference them.
 */
function enrichContentWithStructured(content: string, structured: TomoResponse): string {
  const parts: string[] = [content];

  for (const card of structured.cards) {
    if (card.type === "schedule_list") {
      const items = (card as any).items as Array<{ time: string; title: string; type: string }>;
      if (items?.length > 0) {
        const date = (card as any).date ?? "";
        const itemsStr = items
          .map((i) => `${date ? date + " " : ""}${i.time} ${i.title} (${i.type})`)
          .join(", ");
        parts.push(`[Proposed schedule: ${itemsStr}]`);
      }
    } else if (card.type === "confirm_card") {
      parts.push(`[Pending confirmation: ${(card as any).body}]`);
    } else if (card.type === "text_card" && (card as any).body && !(content.includes((card as any).body))) {
      parts.push((card as any).body);
    }
  }

  return parts.join("\n\n");
}

export async function loadSessionMessages(
  sessionId: string,
  userId: string
): Promise<ChatMessage[]> {
  const { data, error } = await supa()
    .from("chat_messages")
    .select()
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to load messages: ${error.message}`);
  return (data ?? []) as ChatMessage[];
}

// ── Pending Actions ──────────────────────────────────────────────

export async function savePendingAction(
  sessionId: string,
  action: PendingAction
): Promise<void> {
  const expiresAt = new Date(Date.now() + PENDING_ACTION_TTL_MS).toISOString();

  const { error } = await supa()
    .from("chat_sessions")
    .update({
      pending_action: action,
      pending_action_expires_at: expiresAt,
    })
    .eq("id", sessionId);

  if (error)
    throw new Error(`Failed to save pending action: ${error.message}`);
}

export interface PendingActionResult {
  action: PendingAction | null;
  expired: boolean;
}

export async function getPendingAction(
  sessionId: string
): Promise<PendingActionResult> {
  const { data, error } = await supa()
    .from("chat_sessions")
    .select("pending_action, pending_action_expires_at")
    .eq("id", sessionId)
    .single();

  if (error || !data) return { action: null, expired: false };

  const session = data as Pick<
    ChatSession,
    "pending_action" | "pending_action_expires_at"
  >;

  if (!session.pending_action) return { action: null, expired: false };

  // Check expiry
  if (
    session.pending_action_expires_at &&
    new Date(session.pending_action_expires_at) < new Date()
  ) {
    await clearPendingAction(sessionId);
    return { action: null, expired: true };
  }

  return { action: session.pending_action, expired: false };
}

export async function clearPendingAction(sessionId: string): Promise<void> {
  await supa()
    .from("chat_sessions")
    .update({
      pending_action: null,
      pending_action_expires_at: null,
    })
    .eq("id", sessionId);
}

// ── Session State (Agent Lock + Conversation State) ─────────────

export async function getSessionState(sessionId: string): Promise<{
  activeAgent: string | null;
  conversationState: ConversationState | null;
}> {
  const { data, error } = await supa()
    .from("chat_sessions")
    .select("active_agent, conversation_state")
    .eq("id", sessionId)
    .single();

  if (error || !data) return { activeAgent: null, conversationState: null };
  return {
    activeAgent: data.active_agent ?? null,
    conversationState: data.conversation_state ?? null,
  };
}

export async function updateSessionState(
  sessionId: string,
  updates: {
    activeAgent?: string | null;
    conversationState?: ConversationState | null;
  }
): Promise<void> {
  const payload: Record<string, any> = {};
  if ("activeAgent" in updates) payload.active_agent = updates.activeAgent;
  if ("conversationState" in updates) payload.conversation_state = updates.conversationState;

  if (Object.keys(payload).length === 0) return;

  await supa()
    .from("chat_sessions")
    .update(payload)
    .eq("id", sessionId);
}

// ── Auto-title ───────────────────────────────────────────────────

async function autoTitleSession(
  sessionId: string,
  firstMessage: string
): Promise<void> {
  // Only title if session still has default title
  const { data: session } = await supa()
    .from("chat_sessions")
    .select("title")
    .eq("id", sessionId)
    .single();

  if (!session || session.title !== "New Chat") return;

  const title =
    firstMessage.length <= 40
      ? firstMessage
      : firstMessage.slice(0, 37) + "...";

  await supa()
    .from("chat_sessions")
    .update({ title })
    .eq("id", sessionId);
}

// ── Affirmation Detection ────────────────────────────────────────

const AFFIRMATION_PATTERN =
  /^(yes|yeah|yep|yup|sure|ok|okay|do it|go ahead|confirm|please|make (the|those) (update|change)|sounds good|let'?s (go|do it))/i;

export function isAffirmation(message: string): boolean {
  return AFFIRMATION_PATTERN.test(message.trim());
}
