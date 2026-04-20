import { supabaseAdmin } from "@/lib/supabase/admin";

const db = () => supabaseAdmin();

// ---------- List ----------

export async function listPositions(sportId: string) {
  const { data, error } = await db()
    .from("sport_positions")
    .select("*")
    .eq("sport_id", sportId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

// ---------- Get ----------

export async function getPosition(id: string) {
  const { data, error } = await db()
    .from("sport_positions")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
}

// ---------- Create ----------

export async function createPosition(input: {
  sport_id: string;
  key: string;
  label: string;
  sort_order?: number;
  attribute_weights?: Record<string, number>;
}) {
  const { data, error } = await db()
    .from("sport_positions")
    .insert([input])
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ---------- Update ----------

export async function updatePosition(
  id: string,
  input: {
    key?: string;
    label?: string;
    sort_order?: number;
    attribute_weights?: Record<string, number>;
  }
) {
  const { data, error } = await db()
    .from("sport_positions")
    .update(input)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ---------- Delete ----------

export async function deletePosition(id: string) {
  const { error } = await db()
    .from("sport_positions")
    .delete()
    .eq("id", id);

  if (error) throw error;
}
