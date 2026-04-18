import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// POST /api/v1/event-annotations/:id/read
// Athlete marks an annotation as read. Author can see read_by_athlete_at
// on their own feed to know the note landed. Idempotent — repeated
// calls are no-ops after the first.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedDb = { from: (table: string) => any };

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "id required", code: "ID_REQUIRED" }, { status: 400 });
  }

  const db = supabaseAdmin() as unknown as UntypedDb;

  // Only the annotation's athlete can mark it read — a parent or coach
  // reading it is irrelevant to the author's read-receipt signal.
  const { data, error } = await db
    .from("event_annotations")
    .update({ read_by_athlete_at: new Date().toISOString() })
    .eq("id", id)
    .eq("athlete_id", auth.user.id)
    .is("read_by_athlete_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[POST /event-annotations/:id/read]", error);
    return NextResponse.json({ error: error.message, code: "READ_RECEIPT_FAILED" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updated: data !== null });
}
