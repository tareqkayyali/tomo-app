import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { uiConfigCreateSchema } from "@/lib/validation/uiConfigSchemas";
import { listUIConfigs, upsertUIConfig } from "@/services/admin/uiConfigAdminService";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const result = await listUIConfigs();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to list UI configs", detail: String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const parsed = uiConfigCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const config = await upsertUIConfig(parsed.data);
    return NextResponse.json(config, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to save UI config", detail: String(err) },
      { status: 500 }
    );
  }
}
