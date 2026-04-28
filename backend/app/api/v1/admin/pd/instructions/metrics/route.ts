import { NextRequest, NextResponse } from "next/server";
import { requireEnterprise } from "@/lib/admin/enterpriseAuth";
import { listProgressMetrics } from "@/services/admin/progressMetricAdminService";

/**
 * GET /api/v1/admin/pd/instructions/metrics
 *
 * Returns the list of available metric keys (from `progress_metrics`)
 * that a `dashboard_section` directive can reference. The PD picks one
 * from this dropdown rather than typing a free-text key.
 *
 * Custom metrics (new entries in `progress_metrics`) are out of scope
 * for the methodology layer — they require a developer / data-engineer
 * change. PDs only reference what's already in the registry.
 */
export async function GET(req: NextRequest) {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth.error;

  try {
    const metrics = await listProgressMetrics();
    // Return the minimum needed for a clean dropdown. Hide source-engineering
    // fields (source_kind, source_field) — those are data-engineer concerns.
    const out = (metrics as any[])
      .filter((m) => m.is_enabled !== false)
      .map((m) => ({
        metric_key: m.metric_key,
        display_name: m.display_name,
        display_unit: m.display_unit,
        category: m.category,
        sport_filter: m.sport_filter ?? null,
      }));
    return NextResponse.json({ metrics: out });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to list metrics", detail: String(err) },
      { status: 500 },
    );
  }
}
