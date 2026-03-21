import { supabaseAdmin } from "@/lib/supabase/admin";
import type {
  ContentItemCreateInput,
  ContentItemUpdateInput,
  ContentItemFilters,
} from "@/lib/validation/contentSchemas";

const db = () => supabaseAdmin();

// ---------- List ----------

export async function listContentItems(filters: ContentItemFilters) {
  const { category, subcategory, sport_id, active, search, page, limit } =
    filters;
  const offset = (page - 1) * limit;

  let query = db()
    .from("content_items")
    .select("*", { count: "exact" })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (category) query = query.eq("category", category);
  if (subcategory) query = query.ilike("subcategory", `%${subcategory}%`);
  if (sport_id) query = query.eq("sport_id", sport_id);
  if (active !== undefined) query = query.eq("active", active);
  if (search) query = query.or(`key.ilike.%${search}%,category.ilike.%${search}%,subcategory.ilike.%${search}%`);

  const { data, count, error } = await query;
  if (error) throw error;

  return {
    items: data ?? [],
    total: count ?? 0,
    page,
    limit,
  };
}

// ---------- Get ----------

export async function getContentItem(id: string) {
  const { data, error } = await db()
    .from("content_items")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
}

// ---------- Create ----------

export async function createContentItem(input: ContentItemCreateInput) {
  const { data, error } = await db()
    .from("content_items")
    .insert([{ ...input, content: input.content as unknown as Record<string, never> }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ---------- Update ----------

export async function updateContentItem(
  id: string,
  input: ContentItemUpdateInput
) {
  const { data, error } = await db()
    .from("content_items")
    .update({
      ...input,
      content: input.content as unknown as Record<string, never> | undefined,
      updated_at: new Date().toISOString(),
    } as Record<string, unknown>)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ---------- Delete ----------

export async function deleteContentItem(id: string) {
  const { error } = await db().from("content_items").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Categories ----------

export async function getCategories() {
  const { data, error } = await db()
    .from("content_items")
    .select("category")
    .order("category");

  if (error) throw error;

  const unique = [...new Set((data ?? []).map((r) => r.category))];
  return unique;
}
