import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Enterprise CMS Role-Based Auth — the single source of truth for admin access.
 *
 * Roles (hierarchical):
 *   super_admin       — Full access to all tenants, all features
 *   institutional_pd  — Full access to own institution + child groups
 *   coach             — Read + athlete management for own institution
 *   analyst           — Read-only for own institution
 *
 * Auth flow:
 *   1. Validate JWT via requireAuth (existing)
 *   2. Fetch user's org memberships from organization_memberships
 *   3. Resolve highest role across all memberships
 *   4. Return EnterpriseUser with role + tenant context
 */

export interface TenantMembership {
  id: string;
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  tenant_tier: "global" | "institution" | "group";
  role: OrgRole;
  permissions: Record<string, boolean>;
  is_active: boolean;
}

export type OrgRole =
  | "super_admin"
  | "institutional_pd"
  | "coach"
  | "analyst"
  | "athlete";

export interface EnterpriseUser {
  id: string;
  email: string;
  memberships: TenantMembership[];
  primaryRole: OrgRole;
  primaryTenantId: string;
  primaryTenantName: string;
  isSuperAdmin: boolean;
}

const ROLE_HIERARCHY: Record<OrgRole, number> = {
  super_admin: 0,
  institutional_pd: 1,
  coach: 2,
  analyst: 3,
  athlete: 4,
};

/**
 * Require enterprise CMS access.
 * Returns the user with all their org memberships and resolved role.
 */
export async function requireEnterprise(
  req: NextRequest,
  minRole: OrgRole = "analyst"
): Promise<{ user: EnterpriseUser } | { error: NextResponse }> {
  const auth = requireAuth(req);
  if ("error" in auth) return auth;

  const db = supabaseAdmin();

  // Fetch all active memberships with tenant info
  const { data: memberships, error } = await (db as any) // organization_memberships not in generated types until regen
    .from("organization_memberships")
    .select(
      `
      id,
      tenant_id,
      role,
      permissions,
      is_active,
      cms_tenants!inner (
        name,
        slug,
        tier,
        is_active
      )
    `
    )
    .eq("user_id", auth.user.id)
    .eq("is_active", true);

  if (error || !memberships || memberships.length === 0) {
    return {
      error: NextResponse.json(
        { error: "Enterprise CMS access required" },
        { status: 403 }
      ),
    };
  }

  // Map memberships
  const mapped: TenantMembership[] = memberships.map((m: any) => ({
    id: m.id,
    tenant_id: m.tenant_id,
    tenant_name: m.cms_tenants?.name || "Unknown",
    tenant_slug: m.cms_tenants?.slug || "",
    tenant_tier: m.cms_tenants?.tier || "institution",
    role: m.role as OrgRole,
    permissions: m.permissions || {},
    is_active: m.is_active,
  }));

  // Determine primary role (highest across all memberships)
  const sortedByRole = [...mapped].sort(
    (a, b) =>
      (ROLE_HIERARCHY[a.role] ?? 99) - (ROLE_HIERARCHY[b.role] ?? 99)
  );

  const primaryMembership = sortedByRole[0];
  const primaryRole = primaryMembership.role;

  // Check minimum role requirement
  if (
    (ROLE_HIERARCHY[primaryRole] ?? 99) > (ROLE_HIERARCHY[minRole] ?? 99)
  ) {
    return {
      error: NextResponse.json(
        {
          error: `Insufficient permissions. Required: ${minRole}, have: ${primaryRole}`,
        },
        { status: 403 }
      ),
    };
  }

  const enterpriseUser: EnterpriseUser = {
    id: auth.user.id,
    email: auth.user.email || "",
    memberships: mapped,
    primaryRole,
    primaryTenantId: primaryMembership.tenant_id,
    primaryTenantName: primaryMembership.tenant_name,
    isSuperAdmin: primaryRole === "super_admin",
  };

  return { user: enterpriseUser };
}

/**
 * Require a specific permission for a specific tenant.
 * Used for fine-grained access control in API routes.
 */
export async function requireTenantPermission(
  req: NextRequest,
  tenantId: string,
  permission: string
): Promise<{ user: EnterpriseUser } | { error: NextResponse }> {
  const result = await requireEnterprise(req);
  if ("error" in result) return result;

  const { user } = result;

  // Super admins have all permissions
  if (user.isSuperAdmin) return { user };

  // Find membership for the specific tenant
  const membership = user.memberships.find(
    (m) => m.tenant_id === tenantId
  );

  if (!membership) {
    return {
      error: NextResponse.json(
        { error: "No access to this organization" },
        { status: 403 }
      ),
    };
  }

  if (!membership.permissions[permission]) {
    return {
      error: NextResponse.json(
        { error: `Missing permission: ${permission}` },
        { status: 403 }
      ),
    };
  }

  return { user };
}

/**
 * Get enterprise user context for server components (layout/pages).
 * Returns null if user is not authenticated or has no CMS access.
 */
export async function getEnterpriseUser(
  userId: string
): Promise<EnterpriseUser | null> {
  const db = supabaseAdmin();

  const { data: memberships } = await (db as any) // organization_memberships not in generated types until regen
    .from("organization_memberships")
    .select(
      `
      id,
      tenant_id,
      role,
      permissions,
      is_active,
      cms_tenants!inner (
        name,
        slug,
        tier,
        is_active
      )
    `
    )
    .eq("user_id", userId)
    .eq("is_active", true);

  if (!memberships || memberships.length === 0) {
    return null;
  }

  const mapped: TenantMembership[] = memberships.map((m: any) => ({
    id: m.id,
    tenant_id: m.tenant_id,
    tenant_name: m.cms_tenants?.name || "Unknown",
    tenant_slug: m.cms_tenants?.slug || "",
    tenant_tier: m.cms_tenants?.tier || "institution",
    role: m.role as OrgRole,
    permissions: m.permissions || {},
    is_active: m.is_active,
  }));

  const sorted = [...mapped].sort(
    (a, b) =>
      (ROLE_HIERARCHY[a.role] ?? 99) - (ROLE_HIERARCHY[b.role] ?? 99)
  );
  const primary = sorted[0];

  return {
    id: userId,
    email: "",
    memberships: mapped,
    primaryRole: primary.role,
    primaryTenantId: primary.tenant_id,
    primaryTenantName: primary.tenant_name,
    isSuperAdmin: primary.role === "super_admin",
  };
}
