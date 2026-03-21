import { supabaseAdmin } from "@/lib/supabase/admin";
import type {
  AttributeCreateInput,
  AttributeUpdateInput,
} from "@/lib/validation/sportSchemas";

const db = () => supabaseAdmin();

// ---------- List ----------

export async function listAttributes(sportId: string) {
  const { data, error } = await db()
    .from("sport_attributes")
    .select("*")
    .eq("sport_id", sportId)
    .order("sort_order", { ascending: true })
    .order("key", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

// ---------- Get ----------

export async function getAttribute(id: string) {
  const { data, error } = await db()
    .from("sport_attributes")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
}

// ---------- Create ----------

export async function createAttribute(input: AttributeCreateInput) {
  const { data, error } = await db()
    .from("sport_attributes")
    .insert([input])
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ---------- Update ----------

export async function updateAttribute(id: string, input: AttributeUpdateInput) {
  const { data, error } = await db()
    .from("sport_attributes")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ---------- Delete ----------

export async function deleteAttribute(id: string) {
  const { error } = await db().from("sport_attributes").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Reorder ----------

export async function reorderAttributes(
  items: { id: string; sort_order: number }[]
) {
  for (const item of items) {
    await db()
      .from("sport_attributes")
      .update({ sort_order: item.sort_order })
      .eq("id", item.id);
  }
}
