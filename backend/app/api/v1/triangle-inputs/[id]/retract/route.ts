import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// POST /api/v1/triangle-inputs/:id/retract
// Body: { reason?: string }
// Author soft-retracts their own input. Retrieval excludes retracted
// rows; audit still preserves the row.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedDb = { from: (table: string) => any };

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "id required", code: "ID_REQUIRED" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const reason = typeof (body as { reason?: unknown }).reason === "string"
    ? (body as { reason: string }).reason
    : null;

  const db = supabaseAdmin() as unknown as UntypedDb;

  const { data, error } = await db
    .from("triangle_inputs")
    .update({
      retracted_at: new Date().toISOString(),
      retracted_reason: reason,
    })
    .eq("id", id)
    .eq("author_id", auth.user.id)
    .is("retracted_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message, code: "RETRACT_FAILED" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updated: data !== null });
}
