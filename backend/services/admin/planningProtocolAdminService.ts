import { supabaseAdmin } from '@/lib/supabase/admin';
import { clearPlanningProtocolCache } from '../planning/planningProtocolSelector';

const db = () => supabaseAdmin();

// ---------- List ----------

export async function getAllProtocols() {
  const { data, error } = await (db() as any)
    .from('planning_protocols')
    .select('*')
    .order('severity', { ascending: true })
    .order('name', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

// ---------- Get ----------

export async function getProtocolById(id: string) {
  const { data, error } = await (db() as any)
    .from('planning_protocols')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

// ---------- Create ----------

export async function createProtocol(protocol: Record<string, unknown>) {
  const { data, error } = await (db() as any)
    .from('planning_protocols')
    .insert([protocol])
    .select()
    .single();

  if (error) throw error;
  clearPlanningProtocolCache();
  return data;
}

// ---------- Update ----------

export async function updateProtocol(id: string, updates: Record<string, unknown>) {
  const { data, error } = await (db() as any)
    .from('planning_protocols')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  clearPlanningProtocolCache();
  return data;
}

// ---------- Delete ----------

export async function deleteProtocol(id: string) {
  const { error } = await (db() as any)
    .from('planning_protocols')
    .delete()
    .eq('id', id);

  if (error) throw error;
  clearPlanningProtocolCache();
}
