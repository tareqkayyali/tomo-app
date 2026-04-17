import { NextRequest, NextResponse } from "next/server";
import { requireEnterprise } from "@/lib/admin/enterpriseAuth";
import { listSafetyAuditFlags } from "@/services/admin/chatQualityAdminService";

/**
 * GET /api/v1/admin/enterprise/quality/safety-flags
 *   ?status=open|triaged|resolved|false_alarm
 *   ?severity=critical|high|medium
 *   ?flagType=rule_missed|false_positive
 *   ?limit=50&offset=0
 *
 * Returns safety audit flags joined with their safety_audit_log context.
 */
export async function GET(req: NextRequest) {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth.error;

  const url = req.nextUrl;
  const status = url.searchParams.get("status") as any;
  const severity = url.searchParams.get("severity") as any;
  const flagType = url.searchParams.get("flagType") as any;
  const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);
  const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);

  try {
    const result = await listSafetyAuditFlags({
      status,
      severity,
      flagType,
      limit,
      offset,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load safety flags" },
      { status: 500 }
    );
  }
}
