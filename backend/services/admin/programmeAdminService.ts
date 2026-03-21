import { supabaseAdmin } from "@/lib/supabase/admin";
import type {
  ProgrammeCreateInput,
  ProgrammeUpdateInput,
  ProgrammeFilters,
  ProgrammeDrillInput,
} from "@/lib/validation/programmeSchemas";

const db = () => supabaseAdmin();

// ---------- List ----------

export async function listProgrammes(filters: ProgrammeFilters) {
  const { status, season_cycle, search, page, limit } = filters;
  const offset = (page - 1) * limit;

  let query = (db() as any)
    .from("coach_programmes")
    .select("*, users!coach_programmes_coach_id_fkey(full_name)", { count: "exact" })
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq("status", status);
  if (season_cycle) query = query.eq("season_cycle", season_cycle);
  if (search) query = query.ilike("name", `%${search}%`);

  const { data, count, error } = await query;
  if (error) throw error;

  return {
    programmes: data ?? [],
    total: count ?? 0,
    page,
    limit,
  };
}

// ---------- Get Full ----------

export async function getProgrammeFull(id: string) {
  const [progRes, drillsRes] = await Promise.all([
    (db() as any)
      .from("coach_programmes")
      .select("*")
      .eq("id", id)
      .single(),
    (db() as any)
      .from("programme_drills")
      .select("*, training_drills(name, category, duration_minutes)")
      .eq("programme_id", id)
      .order("week_number")
      .order("day_of_week")
      .order("order_in_day"),
  ]);

  if (progRes.error) throw progRes.error;
  if (!progRes.data) return null;

  return {
    ...progRes.data,
    drills: drillsRes.data ?? [],
  };
}

// ---------- Create ----------

export async function createProgramme(input: ProgrammeCreateInput) {
  const { drills, ...programmeData } = input;

  const { data: programme, error } = await (db() as any)
    .from("coach_programmes")
    .insert({
      ...programmeData,
      status: programmeData.status || "draft",
    })
    .select()
    .single();

  if (error) throw error;

  // Insert drills if provided
  if (drills && drills.length > 0) {
    await replaceProgrammeDrills(programme.id, drills);
  }

  return programme;
}

// ---------- Update ----------

export async function updateProgramme(id: string, input: ProgrammeUpdateInput) {
  const { drills, ...programmeData } = input;

  // Update programme fields
  if (Object.keys(programmeData).length > 0) {
    const { error } = await (db() as any)
      .from("coach_programmes")
      .update(programmeData)
      .eq("id", id);
    if (error) throw error;
  }

  // Replace drills if provided
  if (drills !== undefined) {
    await replaceProgrammeDrills(id, drills);
  }

  return getProgrammeFull(id);
}

// ---------- Replace Drills (full replace) ----------

async function replaceProgrammeDrills(programmeId: string, drills: ProgrammeDrillInput[]) {
  // Delete existing
  await (db() as any)
    .from("programme_drills")
    .delete()
    .eq("programme_id", programmeId);

  if (drills.length === 0) return;

  // Insert new
  const rows = drills.map((d, i) => ({
    programme_id: programmeId,
    drill_id: d.drill_id,
    week_number: d.week_number,
    day_of_week: d.day_of_week,
    sets: d.sets,
    reps: d.reps,
    intensity: d.intensity,
    rest_seconds: d.rest_seconds,
    rpe_target: d.rpe_target,
    duration_min: d.duration_min,
    tempo_note: d.tempo_note,
    coach_notes: d.coach_notes,
    repeat_weeks: d.repeat_weeks,
    progression: d.progression,
    is_mandatory: d.is_mandatory,
    order_in_day: d.order_in_day ?? i,
  }));

  const { error } = await (db() as any)
    .from("programme_drills")
    .insert(rows);
  if (error) throw error;
}

// ---------- Delete (archive) ----------

export async function deleteProgramme(id: string) {
  const { error } = await (db() as any)
    .from("coach_programmes")
    .update({ status: "archived" })
    .eq("id", id);
  if (error) throw error;
}

// ---------- Publish ----------

export async function publishProgramme(id: string) {
  // For now, just change status. The full calendar-event generation
  // can be triggered via the existing coachProgrammeService.publishProgramme()
  const { data, error } = await (db() as any)
    .from("coach_programmes")
    .update({ status: "published" })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}
