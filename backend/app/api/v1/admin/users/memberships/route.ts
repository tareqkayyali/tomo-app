import { NextRequest, NextResponse } from "next/server";
import { requireEnterprise } from "@/lib/admin/enterpriseAuth";
import type { OrgRole } from "@/lib/admin/enterpriseAuth";
import {
  assignMembership,
  setMembershipActive,
} from "@/services/admin/userAdminService";
import { logAudit } from "@/lib/admin/audit";

const VALID_ROLES: readonly OrgRole[] = [
  "super_admin",
  "institutional_pd",
  "coach",
  "analyst",
  "athlete",
] as const;

/**
 * POST /api/v1/admin/users/memberships
 *   Body: { user_id, tenant_id, role, is_active? }
 *   Upsert on (user_id, tenant_id).
 *
 * PATCH /api/v1/admin/users/memberships
 *   Body: { membership_id, is_active }
 *   Toggle active flag.
 */
export async function POST(req: NextRequest) {
  const auth = await requireEnterprise(req, "super_admin");
  if ("error" in auth) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const user_id = typeof body.user_id === "string" ? body.user_id : "";
  const tenant_id = typeof body.tenant_id === "string" ? body.tenant_id : "";
  const role = typeof body.role === "string" ? (body.role as OrgRole) : "athlete";
  if (!user_id || !tenant_id) {
    return NextResponse.json(
      { error: "user_id and tenant_id are required" },
      { status: 400 }
    );
  }
  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json(
      { error: `Invalid role '${role}'` },
      { status: 400 }
    );
  }

  const is_active = typeof body.is_active === "boolean" ? body.is_active : true;

  try {
    await assignMembership({ user_id, tenant_id, role, is_active });
    await logAudit({
      actor: auth.user,
      action: "role_change",
      resource_type: "organization_membership",
      resource_id: `${user_id}:${tenant_id}`,
      tenant_id,
      metadata: { user_id, tenant_id, role, is_active },
      req,
    });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireEnterprise(req, "super_admin");
  if ("error" in auth) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const membership_id =
    typeof body.membership_id === "string" ? body.membership_id : "";
  const is_active =
    typeof body.is_active === "boolean" ? body.is_active : true;
  if (!membership_id) {
    return NextResponse.json(
      { error: "membership_id is required" },
      { status: 400 }
    );
  }

  try {
    await setMembershipActive(membership_id, is_active);
    await logAudit({
      actor: auth.user,
      action: is_active ? "activate" : "deactivate",
      resource_type: "organization_membership",
      resource_id: membership_id,
      metadata: { is_active },
      req,
    });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
