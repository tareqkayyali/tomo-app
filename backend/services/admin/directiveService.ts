/**
 * Methodology Directive Service — Phase 1
 *
 * CRUD for `methodology_directives` — the typed, machine-applicable rules
 * derived from a methodology document (or hand-authored). Payload is
 * polymorphically validated against the schema for `directive_type` via
 * `parseDirectiveWrite` before any write reaches the DB.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  parseDirectiveWrite,
  validateDirectivePayload,
  type DirectiveType,
  type DirectiveWriteInput,
} from "@/lib/validation/admin/directiveSchemas";

const TABLE = "methodology_directives";

export interface MethodologyDirective {
  id: string;
  document_id: string | null;
  schema_version: number;
  directive_type: DirectiveType;
  audience: "athlete" | "coach" | "parent" | "all";
  sport_scope: string[];
  age_scope: string[];
  phv_scope: string[];
  position_scope: string[];
  mode_scope: string[];
  priority: number;
  payload: Record<string, unknown>;
  source_excerpt: string | null;
  confidence: number | null;
  status: "proposed" | "approved" | "published" | "retired";
  approved_by: string | null;
  approved_at: string | null;
  retired_at: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  change_reason: string | null;
}

const db = () => supabaseAdmin();

export async function listDirectives(filters?: {
  directive_type?: DirectiveType;
  audience?: MethodologyDirective["audience"];
  status?: MethodologyDirective["status"];
  document_id?: string;
}): Promise<MethodologyDirective[]> {
  let q = (db() as any).from(TABLE).select("*").order("updated_at", { ascending: false });
  if (filters?.directive_type) q = q.eq("directive_type", filters.directive_type);
  if (filters?.audience) q = q.eq("audience", filters.audience);
  if (filters?.status) q = q.eq("status", filters.status);
  if (filters?.document_id) q = q.eq("document_id", filters.document_id);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as MethodologyDirective[];
}

export async function getDirective(id: string): Promise<MethodologyDirective | null> {
  const { data, error } = await (db() as any).from(TABLE).select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data ?? null) as MethodologyDirective | null;
}

export async function createDirective(
  raw: unknown,
  updatedBy: string,
): Promise<MethodologyDirective> {
  const input: DirectiveWriteInput = parseDirectiveWrite(raw);
  const row = {
    document_id: input.document_id ?? null,
    directive_type: input.directive_type,
    audience: input.audience ?? "all",
    sport_scope: input.sport_scope ?? [],
    age_scope: input.age_scope ?? [],
    phv_scope: input.phv_scope ?? [],
    position_scope: input.position_scope ?? [],
    mode_scope: input.mode_scope ?? [],
    priority: input.priority ?? 100,
    payload: input.payload,
    source_excerpt: input.source_excerpt ?? null,
    confidence: input.confidence ?? null,
    status: input.status ?? "proposed",
    change_reason: input.change_reason ?? null,
    updated_by: updatedBy,
  };
  const { data, error } = await (db() as any).from(TABLE).insert([row]).select().single();
  if (error) throw error;
  return data as MethodologyDirective;
}

export async function updateDirective(
  id: string,
  patch: Partial<{
    payload: Record<string, unknown>;
    audience: MethodologyDirective["audience"];
    sport_scope: string[];
    age_scope: string[];
    phv_scope: string[];
    position_scope: string[];
    mode_scope: string[];
    priority: number;
    source_excerpt: string | null;
    status: MethodologyDirective["status"];
    change_reason: string | null;
    document_id: string | null;
  }>,
  updatedBy: string,
): Promise<MethodologyDirective> {
  // If payload is being changed, re-validate against the directive's type.
  if (patch.payload !== undefined) {
    const existing = await getDirective(id);
    if (!existing) throw new Error("Directive not found");
    validateDirectivePayload(existing.directive_type, patch.payload);
  }

  const row: Record<string, unknown> = { ...patch, updated_by: updatedBy };
  const { data, error } = await (db() as any)
    .from(TABLE)
    .update(row)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as MethodologyDirective;
}

export async function deleteDirective(id: string, updatedBy: string): Promise<void> {
  // Stamp updated_by so the audit trigger captures the actor before deletion.
  await (db() as any)
    .from(TABLE)
    .update({ updated_by: updatedBy, change_reason: "deleted" })
    .eq("id", id);
  const { error } = await (db() as any).from(TABLE).delete().eq("id", id);
  if (error) throw error;
}

/** Approve = mark status=approved + record approver. */
export async function approveDirective(
  id: string,
  approverId: string,
): Promise<MethodologyDirective> {
  const { data, error } = await (db() as any)
    .from(TABLE)
    .update({
      status: "approved",
      approved_by: approverId,
      approved_at: new Date().toISOString(),
      updated_by: approverId,
      change_reason: "approved",
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as MethodologyDirective;
}
