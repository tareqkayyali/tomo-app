import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { exportAsCsv } from "@/services/admin/normativeDataAdminService";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const sportId = req.nextUrl.searchParams.get("sport_id");
  if (!sportId) {
    return NextResponse.json(
      { error: "sport_id query param is required" },
      { status: 400 }
    );
  }

  try {
    const csv = await exportAsCsv(sportId);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="normative-data-${sportId}.csv"`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to export normative data", detail: String(err) },
      { status: 500 }
    );
  }
}
