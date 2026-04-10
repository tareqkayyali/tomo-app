import { NextRequest, NextResponse } from "next/server";
import { requireEnterprise } from "@/lib/admin/enterpriseAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/v1/admin/enterprise/protocols
 * List protocols resolved through the tenant hierarchy.
 * Super admins see all. Institutional PDs see their institution's + global.
 *
 * Returns protocols sorted: mandatory first, then by priority.
 */
export async function GET(req: NextRequest) {
  const auth = await requireEnterprise(req);
  if ("error" in auth) return auth.error;

  const db = supabaseAdmin();
  const isGlobal = auth.user.isSuperAdmin;

  try {
    let query = (db as any) // pd_protocols not in generated types until regen
      .from("pd_protocols")
      .select(
        "protocol_id, name, category, safety_critical, is_built_in, priority, institution_id, is_enabled"
      )
      .eq("is_enabled", true)
      .order("safety_critical", { ascending: false })
      .order("is_built_in", { ascending: false })
      .order("priority");

    // Non-super-admins only see global + their institution's protocols
    if (!isGlobal) {
      const tenantIds = auth.user.memberships.map((m) => m.tenant_id);
      // Include global (institution_id IS NULL) + user's tenant protocols
      query = query.or(
        `institution_id.is.null,institution_id.in.(${tenantIds.join(",")})`
      );
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Map to response format with source_tier
    const protocols = (data || []).map((p: any) => ({
      protocol_id: p.protocol_id,
      name: p.name,
      category: p.category,
      safety_critical: p.safety_critical,
      is_built_in: p.is_built_in,
      priority: p.priority,
      institution_id: p.institution_id,
      source_tier: p.institution_id ? "institutional" : "global",
    }));

    return NextResponse.json({ protocols });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch protocols" },
      { status: 500 }
    );
  }
}
