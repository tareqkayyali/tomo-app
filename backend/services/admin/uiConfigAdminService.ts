import { supabaseAdmin } from "@/lib/supabase/admin";
import type {
  UIConfigCreateInput,
  UIConfigUpdateInput,
} from "@/lib/validation/uiConfigSchemas";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabaseAdmin() as any;

export async function listUIConfigs() {
  const { data, error } = await db()
    .from("ui_config")
    .select("*")
    .order("config_key", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getUIConfig(key: string) {
  const { data, error } = await db()
    .from("ui_config")
    .select("*")
    .eq("config_key", key)
    .single();
  if (error) throw error;
  return data;
}

export async function upsertUIConfig(input: UIConfigCreateInput) {
  // Try to find existing
  const { data: existing } = await db()
    .from("ui_config")
    .select("id")
    .eq("config_key", input.config_key)
    .single();

  if (existing) {
    // Update existing
    const { data, error } = await db()
      .from("ui_config")
      .update({
        config_value: input.config_value,
        updated_at: new Date().toISOString(),
      } as Record<string, unknown>)
      .eq("config_key", input.config_key)
      .select()
      .single();
    if (error) throw error;
    return data;
  } else {
    // Insert new
    const { data, error } = await db()
      .from("ui_config")
      .insert([{
        config_key: input.config_key,
        config_value: input.config_value,
      }])
      .select()
      .single();
    if (error) throw error;
    return data;
  }
}

export async function updateUIConfig(key: string, input: UIConfigUpdateInput) {
  const { data, error } = await db()
    .from("ui_config")
    .update({
      config_value: input.config_value,
      updated_at: new Date().toISOString(),
    } as Record<string, unknown>)
    .eq("config_key", key)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteUIConfig(key: string) {
  const { error } = await db().from("ui_config").delete().eq("config_key", key);
  if (error) throw error;
}
