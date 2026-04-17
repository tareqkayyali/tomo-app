/**
 * Dashboard Section Admin Service — CRUD for CMS-managed dashboard sections.
 *
 * Follows the same pattern as planningProtocolAdminService.ts:
 *   - Module-level db() wrapper (supabaseAdmin, bypasses RLS)
 *   - 5 pure functions: list, get, create, update, delete
 *   - Cache clear on every mutation
 *   - Plus: reorder (batch sort_order update)
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { clearDashboardSectionCache } from '../dashboard/dashboardSectionLoader';

const db = () => supabaseAdmin();

// ---------- List ----------

export async function getAllDashboardSections() {
  const { data, error } = await (db() as any)
    .from('dashboard_sections')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

// ---------- Get ----------

export async function getDashboardSectionById(id: string) {
  const { data, error } = await (db() as any)
    .from('dashboard_sections')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

// ---------- Get by Key ----------

export async function getDashboardSectionByKey(sectionKey: string) {
  const { data, error } = await (db() as any)
    .from('dashboard_sections')
    .select('*')
    .eq('section_key', sectionKey)
    .single();

  if (error) throw error;
  return data;
}

// ---------- Create ----------

export async function createDashboardSection(section: Record<string, unknown>) {
  const { data, error } = await (db() as any)
    .from('dashboard_sections')
    .insert([section])
    .select()
    .single();

  if (error) throw error;
  clearDashboardSectionCache();
  return data;
}

// ---------- Update ----------

export async function updateDashboardSection(id: string, updates: Record<string, unknown>) {
  const { data, error } = await (db() as any)
    .from('dashboard_sections')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  clearDashboardSectionCache();
  return data;
}

// ---------- Delete ----------

export async function deleteDashboardSection(id: string) {
  const { error } = await (db() as any)
    .from('dashboard_sections')
    .delete()
    .eq('id', id);

  if (error) throw error;
  clearDashboardSectionCache();
}

// ---------- Reorder (batch sort_order update) ----------

export async function reorderDashboardSections(
  order: Array<{ id: string; sort_order: number }>
) {
  // Execute individual updates in a loop — Supabase JS doesn't support
  // batch upsert with different values per row cleanly. The section count
  // is small (typically 10-15 rows), so N queries is acceptable.
  const client = db() as any;

  for (const item of order) {
    const { error } = await client
      .from('dashboard_sections')
      .update({ sort_order: item.sort_order, updated_at: new Date().toISOString() })
      .eq('id', item.id);

    if (error) throw error;
  }

  clearDashboardSectionCache();
}

// ---------- Toggle Enable/Disable ----------

export async function toggleDashboardSection(id: string, isEnabled: boolean) {
  const { data, error } = await (db() as any)
    .from('dashboard_sections')
    .update({ is_enabled: isEnabled, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  clearDashboardSectionCache();
  return data;
}

// ---------- Duplicate ----------

export async function duplicateDashboardSection(id: string) {
  // Fetch original
  const original = await getDashboardSectionById(id);
  if (!original) throw new Error('Section not found');

  // Create copy with modified key and name
  const { id: _id, created_at, updated_at, updated_by, ...rest } = original;
  const copy = {
    ...rest,
    section_key: `${original.section_key}_copy_${Date.now()}`,
    display_name: `${original.display_name} (Copy)`,
    is_enabled: false, // Disabled by default
    sort_order: original.sort_order + 1,
  };

  return createDashboardSection(copy);
}
