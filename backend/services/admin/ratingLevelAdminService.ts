import { supabaseAdmin } from "@/lib/supabase/admin";

const db = () => supabaseAdmin();

// ---------- List ----------

export async function listRatingLevels(sportId: string) {
  const { data, error } = await db()
    .from("sport_rating_levels")
    .select("*")
    .eq("sport_id", sportId)
    .order("sort_order", { ascending: true })
    .order("min_rating", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

// ---------- Get ----------

export async function getRatingLevel(id: string) {
  const { data, error } = await db()
    .from("sport_rating_levels")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
}

// ---------- Create ----------

export async function createRatingLevel(input: {
  sport_id: string;
  name: string;
  min_rating: number;
  max_rating: number;
  description?: string;
  color?: string;
  sort_order?: number;
}) {
  const { data, error } = await db()
    .from("sport_rating_levels")
    .insert([input])
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ---------- Update ----------

export async function updateRatingLevel(
  id: string,
  input: {
    name?: string;
    min_rating?: number;
    max_rating?: number;
    description?: string;
    color?: string;
    sort_order?: number;
  }
) {
  const { data, error } = await db()
    .from("sport_rating_levels")
    .update(input)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ---------- Delete ----------

export async function deleteRatingLevel(id: string) {
  const { error } = await db()
    .from("sport_rating_levels")
    .delete()
    .eq("id", id);

  if (error) throw error;
}
