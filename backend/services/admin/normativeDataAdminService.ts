import { supabaseAdmin } from "@/lib/supabase/admin";
import type {
  NormativeCreateInput,
  NormativeUpdateInput,
  NormativeBulkUpdateInput,
  NormativeCsvRow,
} from "@/lib/validation/normativeSchemas";

const db = () => supabaseAdmin();

const AGE_LABELS = Array.from({ length: 11 }, (_, i) => i + 13); // 13..23

// ---------- List ----------

export async function listNormativeData(sportId?: string) {
  let query = db()
    .from("sport_normative_data")
    .select("*")
    .order("metric_name", { ascending: true });

  if (sportId) query = query.eq("sport_id", sportId);

  const { data, error } = await query;
  if (error) throw error;

  return data ?? [];
}

// ---------- Create ----------

export async function createNormativeRow(input: NormativeCreateInput) {
  const { data, error } = await db()
    .from("sport_normative_data")
    .insert([input])
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ---------- Update ----------

export async function updateNormativeRow(
  id: string,
  input: NormativeUpdateInput
) {
  const { data, error } = await db()
    .from("sport_normative_data")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ---------- Delete ----------

export async function deleteNormativeRow(id: string) {
  const { error } = await db()
    .from("sport_normative_data")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

// ---------- Bulk Update ----------

export async function bulkUpdateNormativeData(
  input: NormativeBulkUpdateInput
) {
  const results: { id: string; success: boolean; error?: string }[] = [];

  for (const update of input.updates) {
    const { error } = await db()
      .from("sport_normative_data")
      .update({
        means: update.means,
        sds: update.sds,
        updated_at: new Date().toISOString(),
      })
      .eq("id", update.id);

    results.push({
      id: update.id,
      success: !error,
      error: error ? String(error.message) : undefined,
    });
  }

  const failedCount = results.filter((r) => !r.success).length;
  return {
    total: results.length,
    succeeded: results.length - failedCount,
    failed: failedCount,
    results,
  };
}

// ---------- Export CSV ----------

export async function exportAsCsv(sportId: string) {
  const rows = await listNormativeData(sportId);

  // Build CSV header
  const header = [
    "metric_name",
    "unit",
    "attribute_key",
    "direction",
    ...AGE_LABELS.flatMap((age) => [`age_${age}_mean`, `age_${age}_sd`]),
  ];

  const csvRows = rows.map((row) => {
    const means = row.means as number[];
    const sds = row.sds as number[];
    return [
      csvEscape(row.metric_name),
      csvEscape(row.unit ?? ""),
      csvEscape(row.attribute_key),
      row.direction,
      ...AGE_LABELS.flatMap((_, i) => [
        String(means[i] ?? 0),
        String(sds[i] ?? 0),
      ]),
    ].join(",");
  });

  return [header.join(","), ...csvRows].join("\n");
}

// ---------- Import from CSV rows ----------

export async function importFromCsvRows(
  sportId: string,
  rows: NormativeCsvRow[]
) {
  const results: { metric: string; success: boolean; error?: string }[] = [];

  for (const row of rows) {
    const means = AGE_LABELS.map(
      (age) => (row as Record<string, unknown>)[`age_${age}_mean`] as number
    );
    const sds = AGE_LABELS.map(
      (age) => (row as Record<string, unknown>)[`age_${age}_sd`] as number
    );

    // Upsert: if sport_id + metric_name exists, update; otherwise insert
    const { data: existing } = await db()
      .from("sport_normative_data")
      .select("id")
      .eq("sport_id", sportId)
      .eq("metric_name", row.metric_name)
      .limit(1)
      .single();

    if (existing) {
      const { error } = await db()
        .from("sport_normative_data")
        .update({
          unit: row.unit,
          attribute_key: row.attribute_key,
          direction: row.direction,
          means,
          sds,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      results.push({
        metric: row.metric_name,
        success: !error,
        error: error?.message,
      });
    } else {
      const { error } = await db()
        .from("sport_normative_data")
        .insert([
          {
            sport_id: sportId,
            metric_name: row.metric_name,
            unit: row.unit,
            attribute_key: row.attribute_key,
            direction: row.direction,
            age_min: 13,
            age_max: 23,
            means,
            sds,
          },
        ]);

      results.push({
        metric: row.metric_name,
        success: !error,
        error: error?.message,
      });
    }
  }

  const failedCount = results.filter((r) => !r.success).length;
  return {
    total: results.length,
    succeeded: results.length - failedCount,
    failed: failedCount,
    results,
  };
}

// ---------- Helpers ----------

function csvEscape(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}
