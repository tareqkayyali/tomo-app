import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// GET /api/v1/admin/ai-health/baselines
// Returns the current active + long_term_anchor baselines, plus their promotion history.
// Promotion (PATCH) deferred to Phase 5; super_admin-only at that time.

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin() as any; // ai_* tables not in generated types until regen

  const [
    { data: active, error: activeError },
    { data: anchor, error: anchorError },
    { data: history, error: historyError },
  ] = await Promise.all([
    db
      .from("ai_eval_baselines")
      .select("*")
      .eq("kind", "active")
      .eq("is_retired", false)
      .maybeSingle(),
    db
      .from("ai_eval_baselines")
      .select("*")
      .eq("kind", "long_term_anchor")
      .eq("is_retired", false)
      .maybeSingle(),
    db
      .from("ai_eval_baselines")
      .select("id, kind, commit_sha, promoted_at, promoted_by, is_retired, retired_at")
      .order("promoted_at", { ascending: false })
      .limit(50),
  ]);

  const firstError = activeError ?? anchorError ?? historyError;
  if (firstError) {
    return NextResponse.json(
      { error: "Failed to load baselines", detail: firstError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    active: active ?? null,
    long_term_anchor: anchor ?? null,
    history: history ?? [],
  });
}
