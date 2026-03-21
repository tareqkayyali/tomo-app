import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { themeCreateSchema } from "@/lib/validation/uiConfigSchemas";
import { createTheme } from "@/services/admin/themeAdminService";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const parsed = themeCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const theme = await createTheme(parsed.data);
    return NextResponse.json(theme, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to import theme", detail: String(err) },
      { status: 500 }
    );
  }
}
