/**
 * GET /api/v1/admin/enterprise/protocols/generations
 *
 * Paginated list of protocol generations for the CMS audit view.
 * Tenant-scoped: institutional_pd sees their own generations and any on
 * tenants they are a member of. super_admin sees everything.
 *
 * Query params (all optional):
 *   outcome   — pending | saved | edited_then_saved | discarded | failed
 *   limit     — default 50, max 200
 *   offset    — default 0
 */

import { NextRequest, NextResponse } from "next/server";
import { requireEnterprise } from "@/lib/admin/enterpriseAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

const VALID_OUTCOMES = new Set([
  "pending",
  "saved",
  "edited_then_saved",
  "discarded",
  "failed",
]);

export async function GET(req: NextRequest) {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const outcome = searchParams.get("outcome");
  const limit = Math.min(
    200,
    Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10) || 50),
  );
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10) || 0);

  const db = supabaseAdmin() as any;
  let q = db
    .from("pd_protocol_generations")
    .select(
      "generation_id, created_by, created_by_email, tenant_id, prompt, scope_hints, outcome, model, cost_usd, latency_ms, saved_protocol_id, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (outcome && VALID_OUTCOMES.has(outcome)) {
    q = q.eq("outcome", outcome);
  }

  if (!auth.user.isSuperAdmin) {
    const tenantIds = auth.user.memberships.map((m) => m.tenant_id);
    // Owner-or-tenant filter: OR clause via two conditions.
    if (tenantIds.length > 0) {
      q = q.or(
        `created_by.eq.${auth.user.id},tenant_id.in.(${tenantIds.join(",")})`,
      );
    } else {
      q = q.eq("created_by", auth.user.id);
    }
  }

  const { data, count, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    generations: data ?? [],
    total: count ?? 0,
    limit,
    offset,
  });
}
