import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { cognitiveWindowSchema } from "@/lib/validation/planningSchemas";
import {
  getAllWindows,
  createWindow,
} from "@/services/admin/cognitiveWindowAdminService";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const windows = await getAllWindows();
    return NextResponse.json({ windows });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to list cognitive windows", detail: String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const parsed = cognitiveWindowSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const window = await createWindow(parsed.data);
    return NextResponse.json(window, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to create cognitive window", detail: String(err) },
      { status: 500 }
    );
  }
}
