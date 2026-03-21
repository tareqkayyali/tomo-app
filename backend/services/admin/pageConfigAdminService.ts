import { supabaseAdmin } from "@/lib/supabase/admin";
import type {
  PageConfigCreateInput,
  PageConfigUpdateInput,
} from "@/lib/validation/uiConfigSchemas";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabaseAdmin() as any;

export async function listPageConfigs() {
  const { data, error } = await db()
    .from("page_configs")
    .select("*")
    .order("screen_key", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getPageConfig(id: string) {
  const { data, error } = await db()
    .from("page_configs")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function getPageConfigByKey(screenKey: string) {
  const { data, error } = await db()
    .from("page_configs")
    .select("*")
    .eq("screen_key", screenKey)
    .single();
  if (error) throw error;
  return data;
}

export async function createPageConfig(input: PageConfigCreateInput) {
  const { data, error } = await db()
    .from("page_configs")
    .insert([{
      ...input,
      sections: input.sections as unknown as Record<string, never>,
      metadata: input.metadata as unknown as Record<string, never>,
    }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updatePageConfig(id: string, input: PageConfigUpdateInput) {
  const { data, error } = await db()
    .from("page_configs")
    .update({
      ...input,
      sections: input.sections as unknown as Record<string, never> | undefined,
      metadata: input.metadata as unknown as Record<string, never> | undefined,
    } as Record<string, unknown>)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deletePageConfig(id: string) {
  const { error } = await db().from("page_configs").delete().eq("id", id);
  if (error) throw error;
}
