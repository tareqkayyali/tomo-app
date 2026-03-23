/**
 * POST /api/v1/injuries — Flag an injury
 * DELETE /api/v1/injuries — Clear an injury
 *
 * Emits INJURY_FLAG or INJURY_CLEARED events.
 * Updates injury_risk_flag on athlete_snapshots via injuryHandler.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { emitEventSafe } from "@/services/events/eventEmitter";

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    const { location, severity, description, reportedBy } = body;

    if (!location || !severity) {
      return NextResponse.json(
        { error: "location and severity are required" },
        { status: 400 }
      );
    }

    const validSeverities = ["minor", "moderate", "severe"];
    if (!validSeverities.includes(severity)) {
      return NextResponse.json(
        { error: `severity must be one of: ${validSeverities.join(", ")}` },
        { status: 400 }
      );
    }

    await emitEventSafe({
      athleteId: auth.user.id,
      eventType: "INJURY_FLAG",
      occurredAt: new Date().toISOString(),
      source: reportedBy === "coach" ? "COACH" : "MANUAL",
      payload: {
        location,
        severity,
        description: description || "",
        reported_by: reportedBy || "athlete",
      },
      createdBy: auth.user.id,
    });

    return NextResponse.json({ success: true, status: "flagged" });
  } catch (err) {
    console.error("[POST /injuries] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    const { location, clearedBy } = body;

    await emitEventSafe({
      athleteId: auth.user.id,
      eventType: "INJURY_CLEARED",
      occurredAt: new Date().toISOString(),
      source: clearedBy === "coach" ? "COACH" : "MANUAL",
      payload: {
        location: location || "general",
        cleared_by: clearedBy || "athlete",
      },
      createdBy: auth.user.id,
    });

    return NextResponse.json({ success: true, status: "cleared" });
  } catch (err) {
    console.error("[DELETE /injuries] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
