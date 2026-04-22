import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { requireEnterprise } from "@/lib/admin/enterpriseAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

const CONFIG_ID = "00000000-0000-0000-0000-000000000001";

// GET /api/v1/admin/ai-health/config
// Returns the single ai_auto_heal_config row. Read-only for analyst+
// institutional_pd.

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin() as any; // ai_auto_heal_config not in generated types until regen
  const { data, error } = await db
    .from("ai_auto_heal_config")
    .select("*")
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Failed to load config", detail: error.message },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json(
      { error: "ai_auto_heal_config not seeded — run migration 092" },
      { status: 500 },
    );
  }

  return NextResponse.json({ config: data });
}

// PATCH /api/v1/admin/ai-health/config
// Super_admin only. Currently supports `enabled: boolean` only (the
// kill-switch). Other knobs (budget, rate limits, blocked_paths) stay
// schema-defaulted until we need admin-level tuning — they'd each need
// range validation I'm not building speculatively.
//
// Every change writes an ai_auto_heal_audit row with the toggling user's
// email as actor.
export async function PATCH(req: NextRequest) {
  const auth = await requireEnterprise(req, "super_admin");
  if ("error" in auth) return auth.error;

  let body: { enabled?: unknown; reason?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.enabled !== "boolean") {
    return NextResponse.json(
      {
        error: "Missing or invalid 'enabled' — must be boolean",
      },
      { status: 400 },
    );
  }
  const newEnabled = body.enabled;
  const reason =
    typeof body.reason === "string" && body.reason.trim().length > 0
      ? body.reason.trim().slice(0, 500)
      : newEnabled
        ? "Manual activation via CMS"
        : "Manual deactivation via CMS";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin() as any;

  // Load current state so we can write the before/after audit.
  const { data: current, error: loadErr } = await db
    .from("ai_auto_heal_config")
    .select("enabled")
    .eq("id", CONFIG_ID)
    .maybeSingle();
  if (loadErr || !current) {
    return NextResponse.json(
      {
        error: "Failed to load current config",
        detail: loadErr?.message ?? "row not found",
      },
      { status: 500 },
    );
  }

  // No-op guard — prevents audit-log churn when the UI double-clicks or
  // two admins race.
  if (current.enabled === newEnabled) {
    return NextResponse.json({
      ok: true,
      enabled: newEnabled,
      noop: true,
      reason: "already in requested state",
    });
  }

  const actorEmail = auth.user.email ?? auth.user.id;
  const { error: updateErr } = await db
    .from("ai_auto_heal_config")
    .update({
      enabled: newEnabled,
      updated_at: new Date().toISOString(),
      updated_by: `admin:${actorEmail}`,
    })
    .eq("id", CONFIG_ID);

  if (updateErr) {
    return NextResponse.json(
      { error: "Failed to update config", detail: updateErr.message },
      { status: 500 },
    );
  }

  // Audit — best-effort, don't fail the flip if audit write errors
  try {
    await db.from("ai_auto_heal_audit").insert({
      actor: `admin:${actorEmail}`,
      action: newEnabled ? "config_toggle_enabled" : "config_toggle_disabled",
      target_table: "ai_auto_heal_config",
      target_id: CONFIG_ID,
      before_state: { enabled: current.enabled },
      after_state: { enabled: newEnabled },
      reason,
    });
  } catch {
    // Audit failure shouldn't block the toggle; logged by supabase client
  }

  return NextResponse.json({
    ok: true,
    enabled: newEnabled,
    changed_from: current.enabled,
    reason,
  });
}
