import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { activateTheme } from "@/services/admin/themeAdminService";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  try {
    const theme = await activateTheme(id);
    return NextResponse.json(theme, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to activate theme", detail: String(err) },
      { status: 500 }
    );
  }
}
