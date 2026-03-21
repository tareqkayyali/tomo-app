import { supabaseAdmin } from "@/lib/supabase/admin";
import type {
  ThemeCreateInput,
  ThemeUpdateInput,
} from "@/lib/validation/uiConfigSchemas";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabaseAdmin() as any;

export async function listThemes() {
  const { data, error } = await db()
    .from("app_themes")
    .select("*")
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getTheme(id: string) {
  const { data, error } = await db()
    .from("app_themes")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function createTheme(input: ThemeCreateInput) {
  if (input.is_active) {
    await db().from("app_themes").update({ is_active: false }).eq("is_active", true);
  }
  const { data, error } = await db()
    .from("app_themes")
    .insert([{
      ...input,
      colors_dark: input.colors_dark as Record<string, never>,
      colors_light: input.colors_light as Record<string, never>,
      typography: input.typography as Record<string, never>,
    }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateTheme(id: string, input: ThemeUpdateInput) {
  if (input.is_active) {
    await db().from("app_themes").update({ is_active: false }).eq("is_active", true);
  }
  const { data, error } = await db()
    .from("app_themes")
    .update({
      ...input,
      colors_dark: input.colors_dark as Record<string, never> | undefined,
      colors_light: input.colors_light as Record<string, never> | undefined,
      typography: input.typography as Record<string, never> | undefined,
    } as Record<string, unknown>)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function activateTheme(id: string) {
  await db().from("app_themes").update({ is_active: false }).eq("is_active", true);
  const { data, error } = await db()
    .from("app_themes")
    .update({ is_active: true })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTheme(id: string) {
  const theme = await getTheme(id);
  if (theme?.is_active) throw new Error("Cannot delete the active theme");
  const { error } = await db().from("app_themes").delete().eq("id", id);
  if (error) throw error;
}

export async function exportTheme(id: string) {
  const theme = await getTheme(id);
  if (!theme) throw new Error("Theme not found");
  return {
    name: theme.name,
    colors_dark: theme.colors_dark,
    colors_light: theme.colors_light,
    typography: theme.typography,
  };
}
