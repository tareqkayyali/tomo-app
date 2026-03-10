import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const db = supabaseAdmin();
  const { data: progress, error } = await db
    .from("padel_progress")
    .select("*")
    .eq("user_id", auth.user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { padelProgress: progress || [] },
    { headers: { "api-version": "v1" } }
  );
}

export async function PUT(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    const { shotRatings } = body;

    if (!shotRatings || typeof shotRatings !== "object") {
      return NextResponse.json(
        { error: "shotRatings object is required" },
        { status: 400 }
      );
    }

    const db = supabaseAdmin();

    // Upsert each shot type
    const updates = Object.entries(shotRatings).map(
      ([shotType, data]) => {
        const rating = data as { rating?: number; notes?: string };
        return db
          .from("padel_progress")
          .upsert(
            {
              user_id: auth.user.id,
              shot_type: shotType,
              mastery_level: rating.rating || 0,
              last_practiced: new Date().toISOString().slice(0, 10),
              notes: rating.notes || null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id,shot_type" }
          )
          .select();
      }
    );

    await Promise.all(updates);

    // Return updated progress
    const { data: progress } = await db
      .from("padel_progress")
      .select("*")
      .eq("user_id", auth.user.id);

    return NextResponse.json(
      { padelProgress: progress || [] },
      { headers: { "api-version": "v1" } }
    );
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}
