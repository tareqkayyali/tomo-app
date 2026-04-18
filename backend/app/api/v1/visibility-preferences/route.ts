import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// GET  /api/v1/visibility-preferences
//   Returns the athlete's current (guardian × domain) visibility matrix
//   plus the linked guardians so the UI can render the grid even when
//   no preferences exist yet.
//
// PUT  /api/v1/visibility-preferences
//   Upsert one or more preferences. Body: {preferences: [{guardianId,
//   domain, visible}, ...]}. Caller is always the athlete — guardian
//   tries fail with 403.
//
// RLS on player_visibility_preferences (migration 064) already gates
// this; we add the app-layer guard so callers get structured error
// codes.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedDb = { from: (table: string) => any };

const VALID_DOMAINS = new Set([
  "training", "academic", "wellbeing", "safety", "logistics", "cv",
]);

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const db = supabaseAdmin() as unknown as UntypedDb;

  // Linked guardians (coach + parent).
  const { data: rels } = await db
    .from("relationships")
    .select("guardian_id, relationship_type, status")
    .eq("player_id", auth.user.id)
    .eq("status", "accepted");

  const linked = (rels ?? []) as Array<{
    guardian_id: string;
    relationship_type: "coach" | "parent";
  }>;

  const guardianIds = linked.map((r) => r.guardian_id);
  const [guardianProfiles, prefRows] = await Promise.all([
    guardianIds.length === 0
      ? Promise.resolve({ data: [] })
      : db
          .from("users")
          .select("id, name, email")
          .in("id", guardianIds),
    db
      .from("player_visibility_preferences")
      .select("guardian_id, domain, visible, parent_approval_required, updated_at")
      .eq("player_id", auth.user.id),
  ]);

  const profiles = ((guardianProfiles as { data: unknown }).data ?? []) as Array<{
    id: string;
    name: string | null;
    email: string | null;
  }>;
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  const prefs = ((prefRows as { data: unknown }).data ?? []) as Array<{
    guardian_id: string;
    domain: string;
    visible: boolean;
    parent_approval_required: boolean;
    updated_at: string;
  }>;

  const guardians = linked.map((r) => {
    const profile = profileById.get(r.guardian_id);
    return {
      guardianId: r.guardian_id,
      relationshipType: r.relationship_type,
      name: profile?.name ?? null,
      email: profile?.email ?? null,
    };
  });

  return NextResponse.json({
    guardians,
    preferences: prefs.map((p) => ({
      guardianId: p.guardian_id,
      domain: p.domain,
      visible: p.visible,
      parentApprovalRequired: p.parent_approval_required,
      updatedAt: p.updated_at,
    })),
  });
}

export async function PUT(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || !Array.isArray((body as { preferences?: unknown }).preferences)) {
    return NextResponse.json({ error: "preferences array required", code: "INVALID_BODY" }, { status: 400 });
  }

  const entries = (body as { preferences: Array<Record<string, unknown>> }).preferences;
  if (entries.length === 0) {
    return NextResponse.json({ ok: true, updated: 0 });
  }
  if (entries.length > 64) {
    return NextResponse.json({ error: "too many preferences in one call", code: "TOO_MANY" }, { status: 400 });
  }

  const normalised: Array<{
    player_id: string;
    guardian_id: string;
    domain: string;
    visible: boolean;
    parent_approval_required: boolean;
    updated_at: string;
  }> = [];

  for (const e of entries) {
    const guardianId = e.guardianId;
    const domain = e.domain;
    const visible = e.visible;
    if (typeof guardianId !== "string" || guardianId.length === 0) {
      return NextResponse.json({ error: "guardianId required", code: "INVALID_GUARDIAN" }, { status: 400 });
    }
    if (typeof domain !== "string" || !VALID_DOMAINS.has(domain)) {
      return NextResponse.json({ error: `Invalid domain: ${domain}`, code: "INVALID_DOMAIN" }, { status: 400 });
    }
    if (typeof visible !== "boolean") {
      return NextResponse.json({ error: "visible must be boolean", code: "INVALID_VISIBLE" }, { status: 400 });
    }
    const parentApprovalRequired =
      typeof e.parentApprovalRequired === "boolean" ? e.parentApprovalRequired : false;
    normalised.push({
      player_id: auth.user.id,
      guardian_id: guardianId,
      domain,
      visible,
      parent_approval_required: parentApprovalRequired,
      updated_at: new Date().toISOString(),
    });
  }

  // Verify every guardianId is actually linked to the athlete (safety
  // gate on top of RLS) — prevents a coach-identified UUID being used
  // to create a preference row against a stranger.
  const db = supabaseAdmin() as unknown as UntypedDb;
  const guardianIds = Array.from(new Set(normalised.map((n) => n.guardian_id)));
  const { data: relRows } = await db
    .from("relationships")
    .select("guardian_id")
    .eq("player_id", auth.user.id)
    .eq("status", "accepted")
    .in("guardian_id", guardianIds);
  const linkedSet = new Set(((relRows ?? []) as Array<{ guardian_id: string }>).map((r) => r.guardian_id));
  for (const gid of guardianIds) {
    if (!linkedSet.has(gid)) {
      return NextResponse.json(
        { error: `Guardian ${gid} is not linked`, code: "NOT_LINKED" },
        { status: 403 }
      );
    }
  }

  const { error } = await db
    .from("player_visibility_preferences")
    .upsert(normalised, { onConflict: "player_id,guardian_id,domain" });

  if (error) {
    console.error("[PUT /visibility-preferences] upsert error:", error);
    return NextResponse.json({ error: error.message, code: "UPSERT_FAILED" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updated: normalised.length });
}
