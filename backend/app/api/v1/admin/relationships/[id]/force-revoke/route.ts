import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// POST /api/v1/admin/relationships/:id/force-revoke
// Body: { justification: string (min 10 chars) }
//
// Admin force-revokes a relationship (sets status='revoked') and writes
// a mandatory-justification row to admin_override_log so the action is
// auditable. The justification length constraint matches the DB check
// on admin_override_log (migration 065).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedDb = { from: (table: string) => any };

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "id required", code: "ID_REQUIRED" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const justification =
    body && typeof (body as { justification?: unknown }).justification === "string"
      ? ((body as { justification: string }).justification).trim()
      : "";
  if (justification.length < 10) {
    return NextResponse.json(
      { error: "justification must be at least 10 characters", code: "JUSTIFICATION_TOO_SHORT" },
      { status: 400 }
    );
  }

  const db = supabaseAdmin() as unknown as UntypedDb;

  const { data: before } = await db
    .from("relationships")
    .select("id, guardian_id, player_id, relationship_type, status")
    .eq("id", id)
    .maybeSingle();

  const beforeRow = (before ?? null) as {
    id: string;
    guardian_id: string;
    player_id: string;
    relationship_type: string;
    status: string;
  } | null;
  if (!beforeRow) {
    return NextResponse.json({ error: "Relationship not found", code: "NOT_FOUND" }, { status: 404 });
  }
  if (beforeRow.status === "revoked") {
    return NextResponse.json(
      { error: "Already revoked", code: "ALREADY_REVOKED" },
      { status: 409 }
    );
  }

  const { data: updated, error: updErr } = await db
    .from("relationships")
    .update({ status: "revoked" })
    .eq("id", id)
    .select("id, status")
    .single();

  if (updErr || !updated) {
    return NextResponse.json(
      { error: updErr?.message ?? "Update failed", code: "UPDATE_FAILED" },
      { status: 500 }
    );
  }

  // Audit row — non-blocking. Log but never fail the caller if audit
  // insert glitches; the relationship status change is primary.
  try {
    const ipInet = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? null;
    await db.from("admin_override_log").insert({
      admin_id: auth.user.id,
      action: "relationship_force_revoke",
      subject_user_id: beforeRow.player_id,
      before_value: beforeRow,
      after_value: { ...beforeRow, status: "revoked" },
      justification,
      // ip_inet column exists on admin_override_log via migration 065
      ...(ipInet ? { ip_inet: ipInet } : {}),
    });
  } catch (err) {
    console.error("[admin/relationships/force-revoke] audit insert failed:", err);
  }

  return NextResponse.json({ ok: true, id: updated.id, status: updated.status });
}
