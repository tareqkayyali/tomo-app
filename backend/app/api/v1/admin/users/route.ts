import { NextRequest, NextResponse } from "next/server";
import { requireEnterprise } from "@/lib/admin/enterpriseAuth";
import { listUsers } from "@/services/admin/userAdminService";

/** GET /api/v1/admin/users — paginated list with email/name search. */
export async function GET(req: NextRequest) {
  const auth = await requireEnterprise(req, "super_admin");
  if ("error" in auth) return auth.error;

  const sp = req.nextUrl.searchParams;
  const search = sp.get("search") ?? undefined;
  const limit = Number(sp.get("limit") ?? "25") || 25;
  const offset = Number(sp.get("offset") ?? "0") || 0;

  try {
    const result = await listUsers({ search, limit, offset });
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
