import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { getAllTags } from "@/services/admin/drillAdminService";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const tags = await getAllTags();
    return NextResponse.json({ tags });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to get tags", detail: String(err) },
      { status: 500 }
    );
  }
}
