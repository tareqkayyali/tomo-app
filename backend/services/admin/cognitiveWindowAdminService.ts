import { supabaseAdmin } from '@/lib/supabase/admin';

const db = () => supabaseAdmin();

// ---------- List ----------

export async function getAllWindows() {
  const { data, error } = await (db() as any)
    .from('cognitive_windows')
    .select('*')
    .order('session_type', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

// ---------- Get ----------

export async function getWindowById(id: string) {
  const { data, error } = await (db() as any)
    .from('cognitive_windows')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

// ---------- Create ----------

export async function createWindow(window: Record<string, unknown>) {
  const { data, error } = await (db() as any)
    .from('cognitive_windows')
    .insert([window])
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ---------- Update ----------

export async function updateWindow(id: string, updates: Record<string, unknown>) {
  const { data, error } = await (db() as any)
    .from('cognitive_windows')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ---------- Delete ----------

export async function deleteWindow(id: string) {
  const { error } = await (db() as any)
    .from('cognitive_windows')
    .delete()
    .eq('id', id);

  if (error) throw error;
}
