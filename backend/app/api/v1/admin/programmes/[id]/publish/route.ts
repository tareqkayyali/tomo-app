import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { publishProgramme } from "@/services/admin/programmeAdminService";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  try {
    const programme = await publishProgramme(id);
    return NextResponse.json(programme);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to publish programme", detail: String(err) },
      { status: 500 }
    );
  }
}
