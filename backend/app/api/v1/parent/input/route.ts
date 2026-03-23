/**
 * POST /api/v1/parent/input
 * Parent logs structured input about their child (schedule conflicts, wellness, academic load).
 * Emits PARENT_INPUT event to the Athlete Data Fabric.
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
    const { playerId, inputType, message, severity } = body;

    if (!playerId || !inputType || !message) {
      return NextResponse.json(
        { error: "playerId, inputType, and message are required" },
        { status: 400 }
      );
    }

    const validTypes = ["schedule_conflict", "wellness_concern", "academic_load", "injury_report", "general"];
    if (!validTypes.includes(inputType)) {
      return NextResponse.json(
        { error: `inputType must be one of: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }

    // Verify parent-player relationship
    const db = supabaseAdmin();
    const { data: rel } = await db
      .from("relationships")
      .select("id")
      .eq("guardian_id", auth.user.id)
      .eq("player_id", playerId)
      .eq("relationship_type", "parent")
      .eq("status", "accepted")
      .single();

    if (!rel) {
      return NextResponse.json({ error: "Not authorized for this player" }, { status: 403 });
    }

    // Emit PARENT_INPUT event
    await emitEventSafe({
      athleteId: playerId,
      eventType: "PARENT_INPUT",
      occurredAt: new Date().toISOString(),
      source: "PARENT",
      payload: {
        input_type: inputType,
        message,
        severity: severity || "low",
        parent_id: auth.user.id,
      },
      createdBy: auth.user.id,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[POST /parent/input] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
