/**
 * Program Admin Service — v2 (post migration 049)
 * ────────────────────────────────────────────────
 * Reads/writes the canonical `public.training_programs` table. The
 * hardcoded FOOTBALL_PROGRAMS merge is gone — the seed script
 * (scripts/seeds/seed_training_programs.ts) is the ONE entry point
 * that populates the DB from the TS source. Admins never see
 * "hardcoded" vs "database" anymore; the DB is the source of truth.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import type {
  ProgramCreateInput,
  ProgramUpdateInput,
  ProgramFilters,
} from "@/lib/validation/programSchemas";

const db = () => supabaseAdmin();
const TABLE = "training_programs";

// ── List ────────────────────────────────────────────────────────────────

export async function listPrograms(filters: ProgramFilters) {
  const { category, type, search, page, limit } = filters;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = (db() as any)
    .from(TABLE)
    .select("*", { count: "exact" })
    .eq("active", true)
    .order("name", { ascending: true });

  if (category) query = query.eq("category", category);
  if (type) query = query.eq("type", type);
  if (search) query = query.ilike("name", `%${search}%`);

  const offset = (page - 1) * limit;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const programs = ((data as any[]) || []).map((p: any) => ({
    ...p,
    // `source` is kept for admin UI back-compat — everything is DB now.
    source: "database" as const,
  }));

  return {
    programs,
    total: count ?? programs.length,
    page,
    limit,
  };
}

// ── Get Full ────────────────────────────────────────────────────────────

export async function getProgramFull(id: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db() as any)
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return { ...data, source: "database" as const };
}

// ── Create ──────────────────────────────────────────────────────────────

export async function createProgram(input: ProgramCreateInput) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db() as any)
    .from(TABLE)
    .insert({
      sport_id: (input as { sport_id?: string }).sport_id ?? "football",
      name: input.name,
      category: input.category,
      type: input.type,
      description: input.description ?? "",
      equipment: input.equipment ?? [],
      duration_minutes: input.duration_minutes ?? 30,
      duration_weeks: (input as { duration_weeks?: number }).duration_weeks ?? 4,
      position_emphasis: input.position_emphasis ?? ["ALL"],
      difficulty: input.difficulty ?? "intermediate",
      tags: input.tags ?? [],
      prescriptions: input.prescriptions ?? {},
      phv_guidance: input.phv_guidance ?? {},
      active: true,
      chat_eligible: (input as { chat_eligible?: boolean }).chat_eligible ?? true,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ── Update ──────────────────────────────────────────────────────────────

export async function updateProgram(id: string, input: ProgramUpdateInput) {
  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) payload.name = input.name;
  if (input.category !== undefined) payload.category = input.category;
  if (input.type !== undefined) payload.type = input.type;
  if (input.description !== undefined) payload.description = input.description;
  if (input.equipment !== undefined) payload.equipment = input.equipment;
  if (input.duration_minutes !== undefined) payload.duration_minutes = input.duration_minutes;
  if ((input as { duration_weeks?: number }).duration_weeks !== undefined) {
    payload.duration_weeks = (input as { duration_weeks?: number }).duration_weeks;
  }
  if (input.position_emphasis !== undefined) payload.position_emphasis = input.position_emphasis;
  if (input.difficulty !== undefined) payload.difficulty = input.difficulty;
  if (input.tags !== undefined) payload.tags = input.tags;
  if (input.prescriptions !== undefined) payload.prescriptions = input.prescriptions;
  if (input.phv_guidance !== undefined) payload.phv_guidance = input.phv_guidance;
  if ((input as { chat_eligible?: boolean }).chat_eligible !== undefined) {
    payload.chat_eligible = (input as { chat_eligible?: boolean }).chat_eligible;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db() as any)
    .from(TABLE)
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ── Toggle chat eligibility (single-field PATCH shortcut) ───────────────

export async function setChatEligibility(id: string, chatEligible: boolean) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db() as any)
    .from(TABLE)
    .update({ chat_eligible: chatEligible })
    .eq("id", id)
    .select("id, chat_eligible")
    .single();

  if (error) throw error;
  return data;
}

// ── Soft delete (flip active=false) ─────────────────────────────────────

export async function deleteProgram(id: string) {
  // Soft delete to preserve referential integrity with event_linked_programs.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db() as any)
    .from(TABLE)
    .update({ active: false })
    .eq("id", id);
  if (error) throw error;
}

// ── Duplicate ───────────────────────────────────────────────────────────

export async function duplicateProgram(id: string) {
  const original = await getProgramFull(id);
  if (!original) throw new Error("Program not found");

  const {
    id: _id,
    created_at: _ca,
    updated_at: _ua,
    source: _src,
    ...fields
  } = original as Record<string, unknown>;

  return createProgram({
    ...(fields as unknown as ProgramCreateInput),
    name: `${(fields as { name: string }).name} (Copy)`,
  });
}
