import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { duplicateDrill } from "@/services/admin/drillAdminService";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  try {
    const drill = await duplicateDrill(id);
    return NextResponse.json(drill, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to duplicate drill", detail: String(err) },
      { status: 500 }
    );
  }
}
