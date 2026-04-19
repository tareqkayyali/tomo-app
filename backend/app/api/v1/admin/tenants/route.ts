import { NextRequest, NextResponse } from "next/server";
import { requireEnterprise } from "@/lib/admin/enterpriseAuth";
import { listTenants } from "@/services/admin/userAdminService";

/**
 * GET /api/v1/admin/tenants — flat list of active tenants.
 * Used by the users admin page's role-assignment dialog.
 */
export async function GET(req: NextRequest) {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth.error;

  try {
    const tenants = await listTenants();
    return NextResponse.json({ tenants });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
