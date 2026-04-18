import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// POST /api/v1/admin/approvals/:id/override
// Body: { decision: 'accepted' | 'declined', justification: string (>= 10 chars) }
//
// Emergency admin override on a stuck approval_request. Writes directly
// to suggestions + appends a system-authored entry to approval_chain +
// records an admin_override_log row with justification. Does NOT re-run
// the pure approvalResolver because that would re-evaluate the human
// chain and potentially ignore the admin's intent; the admin is
// authoritative here. Safety gates elsewhere (programPublish etc.)
// still run after this resolves.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedDb = { from: (table: string) => any };

const VALID_DECISIONS = new Set(["accepted", "declined"]);

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
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body", code: "INVALID_BODY" }, { status: 400 });
  }
  const { decision, justification } = body as Record<string, unknown>;
  if (typeof decision !== "string" || !VALID_DECISIONS.has(decision)) {
    return NextResponse.json(
      { error: "decision must be accepted|declined", code: "INVALID_DECISION" },
      { status: 400 }
    );
  }
  const reason =
    typeof justification === "string" ? justification.trim() : "";
  if (reason.length < 10) {
    return NextResponse.json(
      { error: "justification must be at least 10 characters", code: "JUSTIFICATION_TOO_SHORT" },
      { status: 400 }
    );
  }

  const db = supabaseAdmin() as unknown as UntypedDb;

  const { data: before } = await db
    .from("suggestions")
    .select("id, player_id, mode, status, approval_chain")
    .eq("id", id)
    .maybeSingle();

  const beforeRow = (before ?? null) as {
    id: string;
    player_id: string;
    mode: string;
    status: string;
    approval_chain: unknown;
  } | null;
  if (!beforeRow) {
    return NextResponse.json({ error: "Suggestion not found", code: "NOT_FOUND" }, { status: 404 });
  }
  if (beforeRow.mode !== "approval_request") {
    return NextResponse.json(
      { error: "Not an approval_request suggestion", code: "WRONG_MODE" },
      { status: 400 }
    );
  }
  if (beforeRow.status !== "pending") {
    return NextResponse.json(
      { error: `Already resolved: ${beforeRow.status}`, code: "ALREADY_RESOLVED" },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();
  const chainBase = Array.isArray(beforeRow.approval_chain)
    ? (beforeRow.approval_chain as Array<Record<string, unknown>>)
    : [];
  const nextChain = [
    ...chainBase,
    {
      role: "system",
      user_id: auth.user.id,
      decision: decision === "accepted" ? "accept" : "decline",
      at: now,
      notes: `ADMIN_OVERRIDE: ${reason}`,
    },
  ];

  const { data: updated, error: updErr } = await db
    .from("suggestions")
    .update({
      status: decision,
      approval_chain: nextChain,
      resolved_at: now,
      resolved_by: auth.user.id,
      resolved_by_role: "system",
      resolution_rationale: `admin override: ${reason}`,
    })
    .eq("id", id)
    .select("id, status, resolved_at, resolution_rationale")
    .single();

  if (updErr || !updated) {
    return NextResponse.json(
      { error: updErr?.message ?? "Update failed", code: "UPDATE_FAILED" },
      { status: 500 }
    );
  }

  // Audit row — non-blocking but logged.
  try {
    await db.from("admin_override_log").insert({
      admin_id: auth.user.id,
      // admin_override_log.action enum (migration 065) doesn't have a
      // dedicated 'approval_override' value. Both accept/decline land
      // here as 'moderation_override' — the justification + before/
      // after JSON carry the semantic. Add an enum value in a later
      // migration if this becomes a frequent query dimension.
      action: "moderation_override",
      subject_user_id: beforeRow.player_id,
      before_value: beforeRow,
      after_value: { status: decision, resolved_at: now },
      justification: reason,
    });
  } catch (err) {
    console.error("[admin/approvals/override] audit insert failed:", err);
  }

  return NextResponse.json({ ok: true, suggestion: updated });
}
