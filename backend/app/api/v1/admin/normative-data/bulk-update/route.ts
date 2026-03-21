import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { normativeBulkUpdateSchema } from "@/lib/validation/normativeSchemas";
import { bulkUpdateNormativeData } from "@/services/admin/normativeDataAdminService";

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const parsed = normativeBulkUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const result = await bulkUpdateNormativeData(parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to bulk update normative data", detail: String(err) },
      { status: 500 }
    );
  }
}
