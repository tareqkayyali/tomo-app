import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * PUT /api/v1/user/onboarding/complete
 *
 * Role-safe onboarding completion for non-player accounts.
 * Coach and parent flows do not collect player-specific fields
 * (sport/position/height/weight/goal), so they cannot use the
 * player finalize endpoint.
 */
export async function PUT(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const db = supabaseAdmin();
    const { data: user, error: readErr } = await db
      .from("users")
      .select("id, role, onboarding_complete")
      .eq("id", auth.user.id)
      .single();

    if (readErr || !user) {
      return NextResponse.json({ error: "User not found", code: "USER_NOT_FOUND" }, { status: 404 });
    }

    if (user.onboarding_complete) {
      return NextResponse.json({ user, alreadyComplete: true });
    }

    if ((user.role ?? "player") === "player") {
      return NextResponse.json(
        {
          error: "Players must finish full onboarding",
          code: "PLAYER_REQUIRES_FINALIZE",
        },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const { data: updated, error: updateErr } = await db
      .from("users")
      .update({
        onboarding_complete: true,
        onboarding_state: null,
        updated_at: now,
      })
      .eq("id", auth.user.id)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json(
        { error: "Failed to complete onboarding", code: "UPDATE_FAILED" },
        { status: 500 }
      );
    }

    return NextResponse.json({ user: updated });
  } catch (err) {
    console.error("[onboarding complete] error:", err);
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL" }, { status: 500 });
  }
}
