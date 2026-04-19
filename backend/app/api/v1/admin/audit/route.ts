import { NextRequest, NextResponse } from "next/server";
import { requireEnterprise } from "@/lib/admin/enterpriseAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/v1/admin/audit
 *   Paginated audit log viewer. Filters:
 *     actor, resource_type, resource_id, action, tenant_id, since, until
 *   Returns: { rows: [...], total }
 */
export async function GET(req: NextRequest) {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth.error;

  const sp = req.nextUrl.searchParams;
  const limit = Math.min(Number(sp.get("limit") ?? "50") || 50, 200);
  const offset = Math.max(Number(sp.get("offset") ?? "0") || 0, 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin() as any;
  let query = db
    .from("admin_audit_log")
    .select(
      "id, actor_id, actor_email, actor_role, action, resource_type, resource_id, tenant_id, metadata, ip_address, user_agent, created_at",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const actor = sp.get("actor");
  if (actor) query = query.eq("actor_id", actor);
  const resourceType = sp.get("resource_type");
  if (resourceType) query = query.eq("resource_type", resourceType);
  const resourceId = sp.get("resource_id");
  if (resourceId) query = query.eq("resource_id", resourceId);
  const action = sp.get("action");
  if (action) query = query.eq("action", action);
  const tenantId = sp.get("tenant_id");
  if (tenantId) query = query.eq("tenant_id", tenantId);
  const since = sp.get("since");
  if (since) query = query.gte("created_at", since);
  const until = sp.get("until");
  if (until) query = query.lte("created_at", until);

  try {
    const { data, error, count } = await query;
    if (error) throw new Error(error.message);
    return NextResponse.json({ rows: data ?? [], total: count ?? 0 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
