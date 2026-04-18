import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ageTierFromDob } from "@/services/compliance/ageTier";

// POST /api/v1/admin/users/:id/dob-override
// Body: { date_of_birth: YYYY-MM-DD, justification: string (>=10 chars) }
//
// Emergency override for the one-way younger-DOB gate (per memory
// P1 #4 — athletes can change DOB to younger values within a session;
// older edits require admin review). Typical use cases:
//   - User typo at signup (off by a year).
//   - Verification dispute where the real DOB differs from the
//     submitted one.
//   - DOB correction after gov-ID verification in a KYC flow.
//
// Every call writes admin_override_log with action='dob_older_change'
// and before/after JSON. The change recomputes age_tier via
// ageTierFromDob; if tier flips (e.g. T2 → T3), downstream visibility
// defaults change accordingly via fn_guardian_can_read at next query.

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
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body", code: "INVALID_BODY" }, { status: 400 });
  }
  const { date_of_birth, justification } = body as Record<string, unknown>;

  if (typeof date_of_birth !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date_of_birth)) {
    return NextResponse.json(
      { error: "date_of_birth must be YYYY-MM-DD", code: "INVALID_DOB" },
      { status: 400 }
    );
  }
  // Reject future DOBs and implausibly-old DOBs — defence against typos.
  const parsed = new Date(`${date_of_birth}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return NextResponse.json({ error: "Unparseable DOB", code: "INVALID_DOB" }, { status: 400 });
  }
  const now = Date.now();
  if (parsed.getTime() > now) {
    return NextResponse.json({ error: "DOB in future", code: "DOB_FUTURE" }, { status: 400 });
  }
  const earliest = new Date("1900-01-01T00:00:00Z");
  if (parsed < earliest) {
    return NextResponse.json({ error: "DOB too early", code: "DOB_EARLY" }, { status: 400 });
  }

  const reason = typeof justification === "string" ? justification.trim() : "";
  if (reason.length < 10) {
    return NextResponse.json(
      { error: "justification must be at least 10 characters", code: "JUSTIFICATION_TOO_SHORT" },
      { status: 400 }
    );
  }

  const db = supabaseAdmin() as unknown as UntypedDb;

  const { data: before } = await db
    .from("users")
    .select("id, date_of_birth, age, consent_status")
    .eq("id", id)
    .maybeSingle();

  const beforeRow = (before ?? null) as {
    id: string;
    date_of_birth: string | null;
    age: number | null;
    consent_status: string | null;
  } | null;
  if (!beforeRow) {
    return NextResponse.json({ error: "User not found", code: "NOT_FOUND" }, { status: 404 });
  }

  // Tier-change detection for the audit record.
  const tierBefore = ageTierFromDob(beforeRow.date_of_birth ? new Date(beforeRow.date_of_birth) : null);
  const tierAfter = ageTierFromDob(parsed);

  // Update users.date_of_birth + date_of_birth_set_at. Do NOT touch
  // consent_status — if tier flips, the next consent check evaluates
  // against the new tier; re-consent is handled by the existing
  // version/re-consent flow if required.
  const { error: updErr } = await db
    .from("users")
    .update({
      date_of_birth,
      date_of_birth_set_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (updErr) {
    return NextResponse.json(
      { error: updErr.message, code: "UPDATE_FAILED" },
      { status: 500 }
    );
  }

  // Audit — non-blocking. Action enum distinguishes 'dob_older_change'
  // (true admin escape hatch) from 'age_tier_override' (rare path,
  // synthetic tier regardless of DOB). We use dob_older_change here
  // because the primary effect is the DOB change; tier change is a
  // consequence.
  try {
    await db.from("admin_override_log").insert({
      admin_id: auth.user.id,
      action: "dob_older_change",
      subject_user_id: id,
      before_value: {
        date_of_birth: beforeRow.date_of_birth,
        age: beforeRow.age,
        tier: tierBefore,
      },
      after_value: {
        date_of_birth,
        tier: tierAfter,
        tier_flipped: tierBefore !== tierAfter,
      },
      justification: reason,
    });
  } catch (err) {
    console.error("[admin/dob-override] audit insert failed:", err);
  }

  return NextResponse.json({
    ok: true,
    dob: date_of_birth,
    tierBefore,
    tierAfter,
    tierFlipped: tierBefore !== tierAfter,
  });
}
