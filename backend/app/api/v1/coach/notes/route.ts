/**
 * POST /api/v1/coach/notes
 * Coach logs a structured observation about an athlete.
 * Emits COACH_NOTE event to the Athlete Data Fabric.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { emitEventSafe } from "@/services/events/eventEmitter";

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    const { playerId, note, category, tags } = body;

    if (!playerId || !note) {
      return NextResponse.json({ error: "playerId and note are required" }, { status: 400 });
    }

    // Verify coach-player relationship
    const db = supabaseAdmin();
    const { data: rel } = await db
      .from("relationships")
      .select("id")
      .eq("guardian_id", auth.user.id)
      .eq("player_id", playerId)
      .eq("relationship_type", "coach")
      .eq("status", "accepted")
      .single();

    if (!rel) {
      return NextResponse.json({ error: "Not authorized for this player" }, { status: 403 });
    }

    // Emit COACH_NOTE event
    await emitEventSafe({
      athleteId: playerId,
      eventType: "COACH_NOTE",
      occurredAt: new Date().toISOString(),
      source: "COACH",
      payload: {
        note,
        category: category || "general",
        tags: tags || [],
        coach_id: auth.user.id,
      },
      createdBy: auth.user.id,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[POST /coach/notes] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
