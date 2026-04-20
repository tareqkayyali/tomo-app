import { supabaseAdmin } from "@/lib/supabase/admin";
import type {
  AssessmentCreateInput,
  AssessmentUpdateInput,
  AssessmentFilters,
} from "@/lib/validation/assessmentSchemas";

const db = () => supabaseAdmin();

// ---------- List ----------

export async function listAssessments(filters: AssessmentFilters) {
  const { sport_id, search, page, limit } = filters;
  const offset = (page - 1) * limit;

  let query = db()
    .from("sport_test_definitions")
    .select("*", { count: "exact" })
    .order("sport_id", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (sport_id) query = query.eq("sport_id", sport_id);
  if (search) query = query.ilike("name", `%${search}%`);

  const { data, count, error } = await query;
  if (error) throw error;

  return {
    assessments: data ?? [],
    total: count ?? 0,
    page,
    limit,
  };
}

// ---------- Get ----------

export async function getAssessment(id: string) {
  const { data, error } = await db()
    .from("sport_test_definitions")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
}

// ---------- Create ----------

export async function createAssessment(input: AssessmentCreateInput) {
  const { data, error } = await db()
    .from("sport_test_definitions")
    .insert([input])
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ---------- Update ----------

export async function updateAssessment(id: string, input: AssessmentUpdateInput) {
  const { data, error } = await db()
    .from("sport_test_definitions")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ---------- Delete ----------

export async function deleteAssessment(id: string) {
  const { error } = await db()
    .from("sport_test_definitions")
    .delete()
    .eq("id", id);

  if (error) throw error;
}
