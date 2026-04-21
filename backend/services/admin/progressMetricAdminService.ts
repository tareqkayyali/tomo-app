/**
 * Progress Metrics Admin Service
 *
 * CRUD wrappers for the `progress_metrics` table. Mirrors the shape of
 * `dashboardSectionAdminService.ts` so the admin page can use the same
 * patterns (list, create, update, toggle, duplicate, delete).
 *
 * All access goes through supabaseAdmin (service role); callers are
 * authenticated at the route layer via `requireAdmin`.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';

export async function listProgressMetrics() {
  const db = supabaseAdmin();
  const { data, error } = await (db as any)
    .from('progress_metrics')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getProgressMetricById(id: string) {
  const db = supabaseAdmin();
  const { data, error } = await (db as any)
    .from('progress_metrics')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function createProgressMetric(input: Record<string, unknown>) {
  const db = supabaseAdmin();
  const { data, error } = await (db as any)
    .from('progress_metrics')
    .insert(input)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateProgressMetric(
  id: string,
  updates: Record<string, unknown>,
) {
  const db = supabaseAdmin();
  const { data, error } = await (db as any)
    .from('progress_metrics')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function toggleProgressMetric(id: string, isEnabled: boolean) {
  return updateProgressMetric(id, { is_enabled: isEnabled });
}

export async function deleteProgressMetric(id: string) {
  const db = supabaseAdmin();
  const { error } = await (db as any)
    .from('progress_metrics')
    .delete()
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function duplicateProgressMetric(id: string) {
  const existing = await getProgressMetricById(id);
  if (!existing) throw new Error('Progress metric not found');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id: _id, created_at, updated_at, ...rest } = existing as any;
  const copy = {
    ...rest,
    metric_key: `${rest.metric_key}_copy`,
    display_name: `${rest.display_name} (copy)`,
    is_enabled: false,
  };
  return createProgressMetric(copy);
}
