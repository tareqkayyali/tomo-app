import { NextRequest, NextResponse } from "next/server";
import { requireEnterprise } from "@/lib/admin/enterpriseAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/v1/admin/enterprise/organizations/:id/members
 * List all members of an organization.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireEnterprise(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const db = supabaseAdmin();

  const { data, error } = await (db as any) // organization_memberships not in generated types until regen
    .from("organization_memberships")
    .select("*")
    .eq("tenant_id", id)
    .eq("is_active", true)
    .order("role")
    .order("joined_at");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ members: data || [] });
}

/**
 * POST /api/v1/admin/enterprise/organizations/:id/members
 * Add a member to an organization.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = await req.json();
  const db = supabaseAdmin();

  if (!body.user_id || !body.role) {
    return NextResponse.json(
      { error: "user_id and role are required" },
      { status: 400 }
    );
  }

  // Validate role
  const validRoles = [
    "super_admin",
    "institutional_pd",
    "coach",
    "analyst",
    "athlete",
  ];
  if (!validRoles.includes(body.role)) {
    return NextResponse.json(
      { error: `Invalid role. Must be one of: ${validRoles.join(", ")}` },
      { status: 400 }
    );
  }

  // Only super admins can assign super_admin role
  if (body.role === "super_admin" && !auth.user.isSuperAdmin) {
    return NextResponse.json(
      { error: "Only super admins can assign super_admin role" },
      { status: 403 }
    );
  }

  // Default permissions based on role
  const defaultPermissions: Record<string, Record<string, boolean>> = {
    super_admin: {
      can_manage_tenants: true,
      can_manage_users: true,
      can_edit_protocols: true,
      can_edit_knowledge: true,
      can_manage_athletes: true,
      can_view_analytics: true,
    },
    institutional_pd: {
      can_manage_users: true,
      can_edit_protocols: true,
      can_edit_knowledge: true,
      can_manage_athletes: true,
      can_view_analytics: true,
    },
    coach: {
      can_manage_athletes: true,
      can_view_analytics: true,
    },
    analyst: {
      can_view_analytics: true,
    },
    athlete: {},
  };

  const { data, error } = await (db as any) // organization_memberships not in generated types until regen
    .from("organization_memberships")
    .upsert(
      {
        user_id: body.user_id,
        tenant_id: id,
        role: body.role,
        permissions: body.permissions || defaultPermissions[body.role] || {},
        invited_by: auth.user.id,
        is_active: true,
      },
      {
        onConflict: "user_id,tenant_id",
      }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ membership: data }, { status: 201 });
}
