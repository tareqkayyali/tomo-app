import { supabaseAdmin } from '@/lib/supabase/admin';

const db = () => supabaseAdmin();

// ---------- List ----------

export async function getAllCategories() {
  const { data, error } = await (db() as any)
    .from('training_category_templates')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

// ---------- Get ----------

export async function getCategoryById(id: string) {
  const { data, error } = await (db() as any)
    .from('training_category_templates')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

// ---------- Create ----------

export async function createCategory(category: Record<string, unknown>) {
  const { data, error } = await (db() as any)
    .from('training_category_templates')
    .insert([category])
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ---------- Update ----------

export async function updateCategory(id: string, updates: Record<string, unknown>) {
  const { data, error } = await (db() as any)
    .from('training_category_templates')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ---------- Delete ----------

export async function deleteCategory(id: string) {
  const { error } = await (db() as any)
    .from('training_category_templates')
    .delete()
    .eq('id', id);

  if (error) throw error;
}
