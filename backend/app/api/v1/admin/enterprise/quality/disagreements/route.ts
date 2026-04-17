import { NextRequest, NextResponse } from "next/server";
import { requireEnterprise } from "@/lib/admin/enterpriseAuth";
import { listQualityDisagreements } from "@/services/admin/chatQualityAdminService";

/**
 * GET /api/v1/admin/enterprise/quality/disagreements
 *   ?agent=timeline|output|mastery|orchestrator|capsule|fast_path
 *   ?ageBand=u13|u15|u17|u19_plus
 *   ?sport=football|padel|...
 *   ?minDisagreement=0.3  (default)
 *   ?limit=50&offset=0
 *
 * Returns turns where the judges disagreed by > minDisagreement. Used for
 * judge calibration + golden-set curation.
 */
export async function GET(req: NextRequest) {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth.error;

  const url = req.nextUrl;
  const agent = url.searchParams.get("agent") ?? undefined;
  const ageBand = url.searchParams.get("ageBand") ?? undefined;
  const sport = url.searchParams.get("sport") ?? undefined;
  const minDisagreement = parseFloat(
    url.searchParams.get("minDisagreement") ?? "0.3"
  );
  const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);
  const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);

  try {
    const result = await listQualityDisagreements({
      agent,
      ageBand,
      sport,
      minDisagreement,
      limit,
      offset,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load disagreements" },
      { status: 500 }
    );
  }
}
