import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { createModeSchema } from "@/lib/validation/modeSchemas";
import { getAllModes, createMode } from "@/services/admin/modeAdminService";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const modes = await getAllModes();
    return NextResponse.json({ modes });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to list modes", detail: String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const parsed = createModeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const mode = await createMode(parsed.data);
    return NextResponse.json(mode, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to create mode", detail: String(err) },
      { status: 500 }
    );
  }
}
