import { NextRequest, NextResponse } from "next/server";
import { requireEnterprise } from "@/lib/admin/enterpriseAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/v1/admin/enterprise/organizations/:id
 * Get a single tenant by ID.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireEnterprise(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const db = supabaseAdmin();

  const { data, error } = await (db as any) // cms_tenants not in generated types until regen
    .from("cms_tenants")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  return NextResponse.json({ tenant: data });
}

/**
 * PATCH /api/v1/admin/enterprise/organizations/:id
 * Update a tenant.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = await req.json();
  const db = supabaseAdmin();

  // Only allow updating safe fields
  const allowed: Record<string, unknown> = {};
  const safeFields = [
    "name",
    "config",
    "branding",
    "max_athletes",
    "max_coaches",
    "max_knowledge_chunks",
    "is_active",
    "subscription_tier",
    "contact_email",
    "contact_name",
    "country",
    "timezone",
  ];

  for (const field of safeFields) {
    if (body[field] !== undefined) {
      allowed[field] = body[field];
    }
  }

  const { data, error } = await (db as any) // cms_tenants not in generated types until regen
    .from("cms_tenants")
    .update(allowed)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ tenant: data });
}
