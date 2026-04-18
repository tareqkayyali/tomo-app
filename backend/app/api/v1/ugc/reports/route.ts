import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// POST /api/v1/ugc/reports
// Body: { targetType, targetId, reason, notes? }
// Files a UGC report. Required by Apple 1.2 + DSA Art. 14. Any
// authenticated user may report any piece of content; admin reviews
// within 24h (SLA tracked via sla_due_at generated column).

const VALID_TARGETS = new Set([
  "event_annotation", "chat_message", "coach_note", "journal_entry", "user_profile",
]);

const VALID_REASONS = new Set([
  "spam", "harassment", "sexual", "self_harm", "minor_safety", "misinformation", "other",
]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedDb = { from: (table: string) => any };

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid body", code: "INVALID_BODY" }, { status: 400 });
    }

    const { targetType, targetId, reason, notes } = body as Record<string, unknown>;

    if (typeof targetType !== "string" || !VALID_TARGETS.has(targetType)) {
      return NextResponse.json(
        { error: "Invalid targetType", code: "INVALID_TARGET_TYPE" },
        { status: 400 }
      );
    }
    if (typeof targetId !== "string" || targetId.length === 0) {
      return NextResponse.json(
        { error: "targetId required", code: "TARGET_ID_REQUIRED" },
        { status: 400 }
      );
    }
    if (typeof reason !== "string" || !VALID_REASONS.has(reason)) {
      return NextResponse.json(
        { error: "Invalid reason", code: "INVALID_REASON" },
        { status: 400 }
      );
    }

    const db = supabaseAdmin() as unknown as UntypedDb;

    // Insert the report row.
    const { data, error } = await db
      .from("ugc_reports")
      .insert({
        reporter_id: auth.user.id,
        target_type: targetType,
        target_id: targetId,
        reason,
        notes: typeof notes === "string" && notes.length > 0 ? notes : null,
      })
      .select("id, sla_due_at")
      .single();

    if (error || !data) {
      console.error("[POST /ugc/reports] insert error:", error);
      return NextResponse.json(
        { error: "Failed to file report", code: "REPORT_INSERT_FAILED" },
        { status: 500 }
      );
    }

    // Also enqueue the target for human review so admins see it in the
    // queue regardless of classifier outcome on the original content.
    await db
      .from("ugc_moderation_queue")
      .insert({
        target_type: targetType,
        target_id: targetId,
        trigger: "report",
        severity: "med",
        state: "pending",
      });

    return NextResponse.json(
      { id: data.id, slaDueAt: data.sla_due_at, ok: true },
      { status: 201 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /ugc/reports]", msg);
    return NextResponse.json({ error: msg, code: "REPORT_FAILED" }, { status: 500 });
  }
}
