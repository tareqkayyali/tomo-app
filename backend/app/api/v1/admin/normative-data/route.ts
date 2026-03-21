import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import {
  normativeFilterSchema,
  normativeCreateSchema,
} from "@/lib/validation/normativeSchemas";
import {
  listNormativeData,
  createNormativeRow,
} from "@/services/admin/normativeDataAdminService";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const params = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = normativeFilterSchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid filters", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const rows = await listNormativeData(parsed.data.sport_id);
    return NextResponse.json({ rows });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to list normative data", detail: String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const parsed = normativeCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const row = await createNormativeRow(parsed.data);
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to create normative row", detail: String(err) },
      { status: 500 }
    );
  }
}
