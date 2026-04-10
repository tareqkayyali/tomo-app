import { NextRequest, NextResponse } from "next/server";
import { requireEnterprise } from "@/lib/admin/enterpriseAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/v1/admin/enterprise/organizations
 * List all tenants (super admin sees all, PD sees own).
 */
export async function GET(req: NextRequest) {
  const auth = await requireEnterprise(req);
  if ("error" in auth) return auth.error;

  const db = supabaseAdmin();

  let query = (db as any) // cms_tenants not in generated types until regen
    .from("cms_tenants")
    .select("*")
    .order("tier")
    .order("name");

  // Non-super-admins only see their own tenants
  if (!auth.user.isSuperAdmin) {
    const tenantIds = auth.user.memberships.map((m) => m.tenant_id);
    query = query.in("id", tenantIds);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ tenants: data || [] });
}

/**
 * POST /api/v1/admin/enterprise/organizations
 * Create a new tenant. Super admin only.
 */
export async function POST(req: NextRequest) {
  const auth = await requireEnterprise(req, "super_admin");
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const db = supabaseAdmin();

  const { data, error } = await (db as any) // cms_tenants not in generated types until regen
    .from("cms_tenants")
    .insert({
      name: body.name,
      slug: body.slug,
      tier: body.tier || "institution",
      parent_id: body.parent_id || "00000000-0000-0000-0000-000000000001",
      subscription_tier: body.subscription_tier || "standard",
      max_athletes: body.max_athletes || 500,
      max_coaches: body.max_coaches || 50,
      max_knowledge_chunks: body.max_knowledge_chunks || 200,
      contact_email: body.contact_email || null,
      contact_name: body.contact_name || null,
      country: body.country || null,
      timezone: body.timezone || "UTC",
      config: body.config || {},
      branding: body.branding || {},
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ tenant: data }, { status: 201 });
}
