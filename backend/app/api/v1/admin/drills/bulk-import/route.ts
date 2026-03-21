import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { drillCreateSchema } from "@/lib/validation/drillSchemas";
import { createDrill } from "@/services/admin/drillAdminService";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const { rows } = body as { rows: unknown[] };

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json(
      { error: "rows array is required" },
      { status: 400 }
    );
  }

  const results: { index: number; success: boolean; error?: string; id?: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const parsed = drillCreateSchema.safeParse(rows[i]);
    if (!parsed.success) {
      results.push({
        index: i,
        success: false,
        error: JSON.stringify(parsed.error.flatten().fieldErrors),
      });
      continue;
    }

    try {
      const drill = await createDrill(parsed.data);
      results.push({ index: i, success: true, id: drill?.id });
    } catch (err) {
      results.push({ index: i, success: false, error: String(err) });
    }
  }

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  return NextResponse.json({ succeeded, failed, results }, { status: 201 });
}
