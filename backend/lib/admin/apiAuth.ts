import { NextRequest } from "next/server";
import { requireEnterprise } from "@/lib/admin/enterpriseAuth";
import type { NextResponse } from "next/server";
import type { RequestUser } from "@/lib/auth";

/**
 * Require admin access for API routes.
 *
 * Compatibility wrapper over `requireEnterprise(req, "institutional_pd")`.
 * Preserves the legacy `{ user: RequestUser } | { error }` shape so existing
 * callers don't need to change, while sourcing auth from enterprise RBAC
 * (organization_memberships) instead of the deprecated users.is_admin flag.
 *
 * For routes that require super_admin, call requireEnterprise directly.
 */
export async function requireAdmin(
  req: NextRequest
): Promise<{ user: RequestUser } | { error: NextResponse }> {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth;
  return { user: { id: auth.user.id, email: auth.user.email } };
}
