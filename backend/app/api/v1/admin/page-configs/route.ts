import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { pageConfigCreateSchema } from "@/lib/validation/uiConfigSchemas";
import { listPageConfigs, createPageConfig } from "@/services/admin/pageConfigAdminService";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const result = await listPageConfigs();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to list page configs", detail: String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const parsed = pageConfigCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const config = await createPageConfig(parsed.data);
    return NextResponse.json(config, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to create page config", detail: String(err) },
      { status: 500 }
    );
  }
}
