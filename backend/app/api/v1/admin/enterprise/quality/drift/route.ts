import { NextRequest, NextResponse } from "next/server";
import { requireEnterprise } from "@/lib/admin/enterpriseAuth";
import { listDriftAlerts } from "@/services/admin/chatQualityAdminService";

/**
 * GET /api/v1/admin/enterprise/quality/drift
 *   ?status=open|patch_proposed|patch_merged|resolved|false_alarm
 *   ?dimension=tone|faithfulness|...
 *   ?limit=50&offset=0
 */
export async function GET(req: NextRequest) {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth.error;

  const url = req.nextUrl;
  const status = url.searchParams.get("status") ?? undefined;
  const dimension = url.searchParams.get("dimension") ?? undefined;
  const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);
  const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);

  try {
    const result = await listDriftAlerts({ status, dimension, limit, offset });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load drift alerts" },
      { status: 500 }
    );
  }
}
