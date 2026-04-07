/**
 * Protocol Review Service — CRUD for the protocol_review_log table.
 * Tracks all sports science configuration changes with scientific justification.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabaseAdmin() as any;

export interface ProtocolReviewInput {
  section: string;
  rule_key: string;
  old_value?: unknown;
  new_value?: unknown;
  observation?: string;
  justification: string;
  citation?: string;
  changed_by?: string;
}

export async function listProtocolReviews(options?: {
  section?: string;
  status?: string;
  limit?: number;
}) {
  let query = db()
    .from("protocol_review_log")
    .select("*")
    .order("created_at", { ascending: false });

  if (options?.section) {
    query = query.eq("section", options.section);
  }
  if (options?.status) {
    query = query.eq("status", options.status);
  }
  if (options?.limit) {
    query = query.limit(options.limit);
  } else {
    query = query.limit(100);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function createProtocolReview(input: ProtocolReviewInput) {
  const { data, error } = await db()
    .from("protocol_review_log")
    .insert([{
      section: input.section,
      rule_key: input.rule_key,
      old_value: input.old_value ?? null,
      new_value: input.new_value ?? null,
      observation: input.observation ?? null,
      justification: input.justification,
      citation: input.citation ?? null,
      changed_by: input.changed_by ?? null,
      status: "logged",
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateProtocolReviewStatus(
  id: string,
  status: "applied" | "rejected"
) {
  const updates: Record<string, unknown> = { status };
  if (status === "applied") {
    updates.applied_at = new Date().toISOString();
  }

  const { data, error } = await db()
    .from("protocol_review_log")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}
