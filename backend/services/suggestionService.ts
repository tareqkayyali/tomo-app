/**
 * Suggestion Service
 * Handles CRUD + resolution for coach/parent suggestions to players.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { SuggestionStatus, UserRole } from "@/types";
import type { Json } from "@/types/database";

// ── Create ──────────────────────────────────────────────────────────

export async function createSuggestion(data: {
  playerId: string;
  authorId: string;
  authorRole: UserRole;
  suggestionType: string;
  title: string;
  payload: Record<string, unknown>;
  expiresAt?: string;
}) {
  const db = supabaseAdmin();

  const { data: suggestion, error } = await db
    .from("suggestions")
    .insert({
      player_id: data.playerId,
      author_id: data.authorId,
      author_role: data.authorRole,
      suggestion_type: data.suggestionType,
      title: data.title,
      payload: data.payload as unknown as Json,
      status: "pending" as SuggestionStatus,
      expires_at: data.expiresAt || null,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create suggestion: ${error.message}`);
  return suggestion;
}

// ── List for Player ─────────────────────────────────────────────────

export async function listSuggestions(
  playerId: string,
  status?: string
) {
  const db = supabaseAdmin();

  let query = db
    .from("suggestions")
    .select("*, author:users!suggestions_author_id_fkey(name)")
    .eq("player_id", playerId)
    .order("created_at", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) throw new Error(`Failed to list suggestions: ${error.message}`);

  // Flatten author name
  return (data || []).map((s) => ({
    ...s,
    authorName: (s.author as any)?.name || null,
    author: undefined,
  }));
}

// ── List by Author ──────────────────────────────────────────────────

export async function listAuthoredSuggestions(authorId: string) {
  const db = supabaseAdmin();

  const { data, error } = await db
    .from("suggestions")
    .select("*, player:users!suggestions_player_id_fkey(name)")
    .eq("author_id", authorId)
    .order("created_at", { ascending: false });

  if (error)
    throw new Error(`Failed to list authored suggestions: ${error.message}`);

  return (data || []).map((s) => ({
    ...s,
    playerName: (s.player as any)?.name || null,
    player: undefined,
  }));
}

// ── Resolve ─────────────────────────────────────────────────────────

export async function resolveSuggestion(
  suggestionId: string,
  playerId: string,
  resolution: {
    status: "accepted" | "edited" | "declined";
    playerNotes?: string;
  }
) {
  const db = supabaseAdmin();

  const { data, error } = await db
    .from("suggestions")
    .update({
      status: resolution.status,
      player_notes: resolution.playerNotes || null,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", suggestionId)
    .eq("player_id", playerId)
    .select()
    .single();

  if (error || !data) {
    throw new Error("Suggestion not found or does not belong to this player");
  }

  return data;
}

// ── Expire Old ──────────────────────────────────────────────────────

export async function expireOldSuggestions() {
  const db = supabaseAdmin();
  const now = new Date().toISOString();

  const { data, error } = await db
    .from("suggestions")
    .update({ status: "expired" as SuggestionStatus })
    .eq("status", "pending")
    .lt("expires_at", now)
    .select("id");

  if (error) throw new Error(`Failed to expire suggestions: ${error.message}`);
  return data || [];
}
