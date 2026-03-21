import { supabaseAdmin } from "@/lib/supabase/admin";
import { FOOTBALL_PROGRAMS } from "@/services/programs/footballPrograms";
import type {
  ProgramCreateInput,
  ProgramUpdateInput,
  ProgramFilters,
} from "@/lib/validation/programSchemas";

const db = () => supabaseAdmin();
const TABLE = "football_training_programs";

// ---------- List (merged: hardcoded + DB) ----------

export async function listPrograms(filters: ProgramFilters) {
  const { category, type, search, page, limit } = filters;

  // 1. Get DB programs
  let query = (db() as any)
    .from(TABLE)
    .select("*", { count: "exact" })
    .order("name", { ascending: true });

  if (category) query = query.eq("category", category);
  if (type) query = query.eq("type", type);
  if (search) query = query.ilike("name", `%${search}%`);

  const { data: dbPrograms, error } = await query;
  if (error) throw error;

  const dbIds = new Set((dbPrograms ?? []).map((p: { id: string }) => p.id));

  // 2. Get hardcoded programs (not yet in DB)
  let hardcoded = FOOTBALL_PROGRAMS
    .filter((p) => !dbIds.has(p.id))
    .map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      type: p.type,
      description: p.description,
      equipment: p.equipment,
      duration_minutes: p.duration_minutes,
      position_emphasis: p.position_emphasis,
      difficulty: p.difficulty,
      tags: p.tags,
      prescriptions: p.prescriptions,
      phv_guidance: p.phv_guidance,
      source: "hardcoded" as const,
    }));

  // Apply filters to hardcoded too
  if (category) hardcoded = hardcoded.filter((p) => p.category === category);
  if (type) hardcoded = hardcoded.filter((p) => p.type === type);
  if (search) {
    const s = search.toLowerCase();
    hardcoded = hardcoded.filter((p) => p.name.toLowerCase().includes(s));
  }

  // 3. Merge: DB programs first (editable), then hardcoded (read-only)
  const dbWithSource = (dbPrograms ?? []).map((p: Record<string, unknown>) => ({
    ...p,
    source: "database",
  }));
  const allPrograms = [...dbWithSource, ...hardcoded].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  // 4. Paginate
  const total = allPrograms.length;
  const offset = (page - 1) * limit;
  const paginated = allPrograms.slice(offset, offset + limit);

  return {
    programs: paginated,
    total,
    page,
    limit,
  };
}

// ---------- Get Full ----------

export async function getProgramFull(id: string) {
  // Check DB first
  const { data, error } = await (db() as any)
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .single();

  if (data) return { ...data, source: "database" };

  // Fallback to hardcoded
  const hardcoded = FOOTBALL_PROGRAMS.find((p) => p.id === id);
  if (hardcoded) return { ...hardcoded, source: "hardcoded" };

  if (error) throw error;
  return null;
}

// ---------- Create ----------

export async function createProgram(input: ProgramCreateInput) {
  const { data, error } = await (db() as any)
    .from(TABLE)
    .insert({
      id: input.id ?? undefined,
      name: input.name,
      category: input.category,
      type: input.type,
      description: input.description ?? "",
      equipment: input.equipment ?? [],
      duration_minutes: input.duration_minutes ?? 30,
      position_emphasis: input.position_emphasis ?? ["ALL"],
      difficulty: input.difficulty ?? "intermediate",
      tags: input.tags ?? [],
      prescriptions: input.prescriptions ?? {},
      phv_guidance: input.phv_guidance ?? {},
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ---------- Update ----------

export async function updateProgram(id: string, input: ProgramUpdateInput) {
  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) payload.name = input.name;
  if (input.category !== undefined) payload.category = input.category;
  if (input.type !== undefined) payload.type = input.type;
  if (input.description !== undefined) payload.description = input.description;
  if (input.equipment !== undefined) payload.equipment = input.equipment;
  if (input.duration_minutes !== undefined) payload.duration_minutes = input.duration_minutes;
  if (input.position_emphasis !== undefined) payload.position_emphasis = input.position_emphasis;
  if (input.difficulty !== undefined) payload.difficulty = input.difficulty;
  if (input.tags !== undefined) payload.tags = input.tags;
  if (input.prescriptions !== undefined) payload.prescriptions = input.prescriptions;
  if (input.phv_guidance !== undefined) payload.phv_guidance = input.phv_guidance;

  const { data, error } = await (db() as any)
    .from(TABLE)
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ---------- Delete ----------

export async function deleteProgram(id: string) {
  const { error } = await (db() as any).from(TABLE).delete().eq("id", id);
  if (error) throw error;
}

// ---------- Duplicate ----------

export async function duplicateProgram(id: string) {
  const original = await getProgramFull(id);
  if (!original) throw new Error("Program not found");

  const { id: _, created_at: __, updated_at: ___, source: ____, ...fields } = original;

  return createProgram({
    ...fields,
    name: `${fields.name} (Copy)`,
  });
}

// ---------- Import hardcoded to DB ----------

export async function importHardcodedToDb(programId: string) {
  const hardcoded = FOOTBALL_PROGRAMS.find((p) => p.id === programId);
  if (!hardcoded) throw new Error("Hardcoded program not found");

  return createProgram({
    id: hardcoded.id,
    name: hardcoded.name,
    category: hardcoded.category,
    type: hardcoded.type,
    description: hardcoded.description,
    equipment: hardcoded.equipment,
    duration_minutes: hardcoded.duration_minutes,
    position_emphasis: hardcoded.position_emphasis,
    difficulty: hardcoded.difficulty,
    tags: hardcoded.tags,
    prescriptions: hardcoded.prescriptions as Record<string, unknown>,
    phv_guidance: hardcoded.phv_guidance as Record<string, unknown>,
  });
}
