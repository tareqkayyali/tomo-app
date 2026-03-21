import { supabaseAdmin } from "@/lib/supabase/admin";
import type {
  FeatureFlagCreateInput,
  FeatureFlagUpdateInput,
} from "@/lib/validation/uiConfigSchemas";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabaseAdmin() as any;

export async function listFlags() {
  const { data, error } = await db()
    .from("feature_flags")
    .select("*")
    .order("flag_key", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getFlag(id: string) {
  const { data, error } = await db()
    .from("feature_flags")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function createFlag(input: FeatureFlagCreateInput) {
  const { data, error } = await db()
    .from("feature_flags")
    .insert([input])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateFlag(id: string, input: FeatureFlagUpdateInput) {
  const { data, error } = await db()
    .from("feature_flags")
    .update(input as Record<string, unknown>)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteFlag(id: string) {
  const { error } = await db().from("feature_flags").delete().eq("id", id);
  if (error) throw error;
}
