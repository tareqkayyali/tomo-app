/**
 * POST /api/v1/cv/recruitment-visibility
 *
 * Toggle the athlete's recruitment visibility — controls whether
 * their profile is discoverable by scouts/coaches in the system.
 *
 * Called by CV & Identity Agent via Python bridge.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const userId = req.headers.get("x-tomo-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Missing user ID" }, { status: 401 });
  }

  const body = await req.json();
  const { visible, visibility_level } = body;

  if (typeof visible !== "boolean") {
    return NextResponse.json(
      { error: "visible (boolean) is required" },
      { status: 400 },
    );
  }

  const db = supabaseAdmin();

  // Update recruitment visibility on the athlete profile
  const { data: profile, error: updateError } = await (db as any)
    .from("profiles")
    .update({
      recruitment_visible: visible,
      recruitment_visibility_level: visibility_level || (visible ? "public" : "private"),
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId)
    .select("id, recruitment_visible, recruitment_visibility_level")
    .single();

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to update visibility", detail: updateError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    recruitment: {
      visible: profile?.recruitment_visible ?? visible,
      visibility_level: profile?.recruitment_visibility_level ?? (visible ? "public" : "private"),
    },
  });
}
