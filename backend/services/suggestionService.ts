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
  // Approval-mode fields (migration 068, P2.2). Optional — omitting
  // keeps the default mode='suggestion' flow.
  mode?: "suggestion" | "approval_request";
  blocking?: boolean;
  requiredApproverRole?: "parent" | "coach" | "athlete";
  supersedeRule?: "first_decision" | "parent_supersedes_coach" | "unanimous";
  targetRefType?: string;
  targetRefId?: string;
}) {
  const db = supabaseAdmin();

  // Tables extended in migration 068 are not yet in the generated
  // Supabase types; cast at this boundary only.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const insertPayload: any = {
    player_id: data.playerId,
    author_id: data.authorId,
    author_role: data.authorRole,
    suggestion_type: data.suggestionType,
    title: data.title,
    payload: data.payload as unknown as Json,
    status: "pending" as SuggestionStatus,
    expires_at: data.expiresAt || null,
  };
  if (data.mode) insertPayload.mode = data.mode;
  if (data.blocking !== undefined) insertPayload.blocking = data.blocking;
  if (data.requiredApproverRole) insertPayload.required_approver_role = data.requiredApproverRole;
  if (data.supersedeRule) insertPayload.supersede_rule = data.supersedeRule;
  if (data.targetRefType) insertPayload.target_ref_type = data.targetRefType;
  if (data.targetRefId) insertPayload.target_ref_id = data.targetRefId;

  const { data: suggestion, error } = await db
    .from("suggestions")
    .insert(insertPayload)
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

// ── Decide (approval-mode) ──────────────────────────────────────────
//
// Guardian (coach or parent) lands a decision on an approval_request
// suggestion. Appends to approval_chain, runs the pure resolver, and
// persists the resolved status. Safety gates are NOT run here — this
// is a human-authority signal only. The call site that consumes the
// resolved status (e.g. programPublish) re-runs the deterministic
// safety filter afterwards.

import { resolveApproval, defaultSupersedeRuleForTier, type ChainEntry } from "./triangle/approvalResolver";
import { ageTierFromDob } from "./compliance/ageTier";
import type { AgeTier } from "@/types";

export async function decideApproval(input: {
  suggestionId: string;
  deciderId: string;
  deciderRole: "coach" | "parent" | "athlete";
  decision: "accept" | "decline" | "edit";
  notes?: string;
}) {
  const db = supabaseAdmin();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const untyped = db as any;

  const { data: row, error: loadErr } = await untyped
    .from("suggestions")
    .select(
      "id, player_id, mode, status, supersede_rule, required_approver_role, approval_chain, target_ref_type, target_ref_id"
    )
    .eq("id", input.suggestionId)
    .maybeSingle();

  if (loadErr || !row) {
    throw new Error("Suggestion not found");
  }
  if (row.mode !== "approval_request") {
    throw new Error("Suggestion is not in approval_request mode");
  }
  if (row.status !== "pending") {
    throw new Error(`Suggestion already resolved: ${row.status}`);
  }

  // Load the athlete's DOB to compute tier. If dob is missing we treat
  // as UNKNOWN → parent-supersedes-coach per conservative default.
  const { data: athlete } = await untyped
    .from("users")
    .select("date_of_birth")
    .eq("id", row.player_id)
    .maybeSingle();
  const dob = athlete?.date_of_birth ? new Date(athlete.date_of_birth) : null;
  const tier: AgeTier = ageTierFromDob(dob);

  // Derive the supersede rule — use the row's explicit value when set,
  // else default from tier.
  const supersedeRule =
    (row.supersede_rule as "first_decision" | "parent_supersedes_coach" | "unanimous") ??
    defaultSupersedeRuleForTier(tier);

  // Append the new decision to the chain.
  const priorChain: ChainEntry[] = Array.isArray(row.approval_chain) ? (row.approval_chain as ChainEntry[]) : [];
  const nextEntry: ChainEntry = {
    role: input.deciderRole,
    user_id: input.deciderId,
    decision: input.decision,
    at: new Date().toISOString(),
    notes: input.notes,
  };
  const nextChain = [...priorChain, nextEntry];

  const resolved = resolveApproval(
    {
      ageTier: tier,
      requiredApproverRole:
        (row.required_approver_role as "parent" | "coach" | "athlete" | null) ?? null,
      supersedeRule,
    },
    nextChain
  );

  // Persist chain always; persist status transitions only on resolution.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: any = {
    approval_chain: nextChain as unknown as Json,
  };
  if (resolved.status !== "pending") {
    update.status = resolved.status;
    update.resolved_at = new Date().toISOString();
    update.resolved_by = resolved.resolvedBy ?? null;
    update.resolved_by_role = resolved.resolvedByRole ?? null;
    update.resolution_rationale = resolved.rationale;
  }

  const { data: updated, error: updErr } = await untyped
    .from("suggestions")
    .update(update)
    .eq("id", input.suggestionId)
    .select()
    .single();

  if (updErr || !updated) {
    throw new Error(`Failed to update suggestion: ${updErr?.message ?? "no row"}`);
  }

  return {
    suggestion: updated,
    resolved,
    tier,
  };
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
