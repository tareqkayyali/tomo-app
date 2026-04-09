import { supabaseAdmin } from '@/lib/supabase/admin';
import { clearModeConfigCache } from '../scheduling/modeConfig';

const db = () => supabaseAdmin();

// ---------- List ----------

export async function getAllModes() {
  const { data, error } = await (db() as any)
    .from('athlete_modes')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

// ---------- Get ----------

export async function getModeById(id: string) {
  const { data, error } = await (db() as any)
    .from('athlete_modes')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

// ---------- Create ----------

export async function createMode(mode: Record<string, unknown>) {
  const { data, error } = await (db() as any)
    .from('athlete_modes')
    .insert([mode])
    .select()
    .single();

  if (error) throw error;
  clearModeConfigCache();
  return data;
}

// ---------- Update ----------

export async function updateMode(id: string, updates: Record<string, unknown>) {
  const { data, error } = await (db() as any)
    .from('athlete_modes')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  clearModeConfigCache();
  return data;
}

// ---------- Delete ----------

export async function deleteMode(id: string) {
  const { error } = await (db() as any)
    .from('athlete_modes')
    .delete()
    .eq('id', id);

  if (error) throw error;
  clearModeConfigCache();
}
