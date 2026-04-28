/**
 * Methodology Document Service — Phase 1
 *
 * CRUD for `methodology_documents` (the prose source of truth that the PD
 * authors / uploads). Bypasses RLS via the admin Supabase client; callers
 * (API route handlers) enforce their own role gate via `requireAdmin`.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import type {
  DocumentWriteInput,
} from "@/lib/validation/admin/directiveSchemas";

const TABLE = "methodology_documents";

export interface MethodologyDocument {
  id: string;
  title: string;
  audience: "athlete" | "coach" | "parent" | "all";
  sport_scope: string[];
  age_scope: string[];
  bucket: string | null;
  source_format: "markdown" | "pdf" | "docx" | "plain";
  source_text: string | null;
  source_file_url: string | null;
  status: "draft" | "under_review" | "published" | "archived";
  version: number;
  parent_version_id: string | null;
  authored_by: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

const db = () => supabaseAdmin();

export async function listMethodologyDocuments(filters?: {
  status?: MethodologyDocument["status"];
  audience?: MethodologyDocument["audience"];
}): Promise<MethodologyDocument[]> {
  let q = (db() as any).from(TABLE).select("*").order("updated_at", { ascending: false });
  if (filters?.status) q = q.eq("status", filters.status);
  if (filters?.audience) q = q.eq("audience", filters.audience);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as MethodologyDocument[];
}

export async function getMethodologyDocument(id: string): Promise<MethodologyDocument | null> {
  const { data, error } = await (db() as any).from(TABLE).select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data ?? null) as MethodologyDocument | null;
}

export async function createMethodologyDocument(
  input: DocumentWriteInput,
  authoredBy: string,
): Promise<MethodologyDocument> {
  const row = {
    title: input.title,
    audience: input.audience ?? "all",
    sport_scope: input.sport_scope ?? [],
    age_scope: input.age_scope ?? [],
    bucket: input.bucket ?? null,
    source_format: input.source_format,
    source_text: input.source_text ?? null,
    source_file_url: input.source_file_url ?? null,
    status: input.status ?? "draft",
    authored_by: authoredBy,
  };
  const { data, error } = await (db() as any).from(TABLE).insert([row]).select().single();
  if (error) throw error;
  return data as MethodologyDocument;
}

export async function updateMethodologyDocument(
  id: string,
  patch: Partial<DocumentWriteInput>,
): Promise<MethodologyDocument> {
  const row: Record<string, unknown> = {};
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.audience !== undefined) row.audience = patch.audience;
  if (patch.sport_scope !== undefined) row.sport_scope = patch.sport_scope;
  if (patch.age_scope !== undefined) row.age_scope = patch.age_scope;
  if (patch.bucket !== undefined) row.bucket = patch.bucket;
  if (patch.source_format !== undefined) row.source_format = patch.source_format;
  if (patch.source_text !== undefined) row.source_text = patch.source_text;
  if (patch.source_file_url !== undefined) row.source_file_url = patch.source_file_url;
  if (patch.status !== undefined) row.status = patch.status;

  const { data, error } = await (db() as any)
    .from(TABLE)
    .update(row)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as MethodologyDocument;
}

export async function deleteMethodologyDocument(id: string): Promise<void> {
  const { error } = await (db() as any).from(TABLE).delete().eq("id", id);
  if (error) throw error;
}
