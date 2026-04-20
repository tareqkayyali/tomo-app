import { supabaseAdmin } from "@/lib/supabase/admin";
import type {
  SportCreateInput,
  SportUpdateInput,
} from "@/lib/validation/sportSchemas";

const db = () => supabaseAdmin();

// ---------- List ----------

export async function listSports() {
  const { data, error } = await db()
    .from("sports")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

// ---------- Get ----------

export async function getSport(id: string) {
  const { data, error } = await db()
    .from("sports")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
}

// ---------- Create ----------

export async function createSport(input: SportCreateInput) {
  const { data, error } = await db()
    .from("sports")
    .insert([{ ...input, config: input.config as unknown as Record<string, never> }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ---------- Update ----------

export async function updateSport(id: string, input: SportUpdateInput) {
  const { data, error } = await db()
    .from("sports")
    .update({
      ...input,
      config: input.config as unknown as Record<string, never> | undefined,
      updated_at: new Date().toISOString(),
    } as Record<string, unknown>)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ---------- Delete ----------

export async function deleteSport(id: string) {
  const { error } = await db().from("sports").delete().eq("id", id);
  if (error) throw error;
}
