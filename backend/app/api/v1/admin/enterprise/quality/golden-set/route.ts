import { NextRequest, NextResponse } from "next/server";
import { requireEnterprise } from "@/lib/admin/enterpriseAuth";
import { listGoldenScenarios } from "@/services/admin/chatQualityAdminService";

/**
 * GET /api/v1/admin/enterprise/quality/golden-set
 *   ?suite=s1..s8  ?source=curated|live_low_score|regression_canary
 *   ?isFrozen=true|false  ?limit=50&offset=0
 */
export async function GET(req: NextRequest) {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth.error;

  const url = req.nextUrl;
  const suite = url.searchParams.get("suite") ?? undefined;
  const source = url.searchParams.get("source") ?? undefined;
  const isFrozenParam = url.searchParams.get("isFrozen");
  const isFrozen =
    isFrozenParam === "true" ? true : isFrozenParam === "false" ? false : undefined;
  const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);
  const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);

  try {
    const result = await listGoldenScenarios({ suite, source, isFrozen, limit, offset });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load golden set" },
      { status: 500 }
    );
  }
}
