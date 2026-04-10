import { NextRequest, NextResponse } from "next/server";
import { requireEnterprise } from "@/lib/admin/enterpriseAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/v1/admin/enterprise/knowledge/entities
 * List knowledge graph entities scoped to the tenant hierarchy.
 * Super admins see all. Others see global + their institution's.
 */
export async function GET(req: NextRequest) {
  const auth = await requireEnterprise(req);
  if ("error" in auth) return auth.error;

  const db = supabaseAdmin();
  const isGlobal = auth.user.isSuperAdmin;

  try {
    let query = (db as any) // knowledge_entities not in generated types until regen
      .from("knowledge_entities")
      .select("id, name, entity_type, description, institution_id")
      .order("entity_type")
      .order("name");

    // Scope to global + user's tenants for non-super-admins
    if (!isGlobal) {
      const tenantIds = auth.user.memberships.map((m) => m.tenant_id);
      query = query.or(
        `institution_id.is.null,institution_id.in.(${tenantIds.join(",")})`
      );
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ entities: data || [] });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch knowledge entities" },
      { status: 500 }
    );
  }
}
