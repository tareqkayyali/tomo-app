import { supabaseAdmin } from "@/lib/supabase/admin";

const db = () => supabaseAdmin();

// ---------- List ----------

export async function listSkills(sportId: string) {
  const { data, error } = await db()
    .from("sport_skills")
    .select("*")
    .eq("sport_id", sportId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

// ---------- Get ----------

export async function getSkill(id: string) {
  const { data, error } = await db()
    .from("sport_skills")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
}

// ---------- Create ----------

export async function createSkill(input: {
  sport_id: string;
  key: string;
  name: string;
  category?: string;
  description?: string;
  icon?: string;
  sort_order?: number;
  sub_metrics?: { key: string; label: string; unit: string; description: string }[];
}) {
  const { data, error } = await db()
    .from("sport_skills")
    .insert([input])
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ---------- Update ----------

export async function updateSkill(
  id: string,
  input: {
    key?: string;
    name?: string;
    category?: string;
    description?: string;
    icon?: string;
    sort_order?: number;
    sub_metrics?: { key: string; label: string; unit: string; description: string }[];
  }
) {
  const { data, error } = await db()
    .from("sport_skills")
    .update(input)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ---------- Delete ----------

export async function deleteSkill(id: string) {
  const { error } = await db()
    .from("sport_skills")
    .delete()
    .eq("id", id);

  if (error) throw error;
}
