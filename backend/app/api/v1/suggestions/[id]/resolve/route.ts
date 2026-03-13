import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { resolveSuggestion } from "@/services/suggestionService";
import { createNotification } from "@/services/notificationService";
import {
  toDbEventType,
  addMinutesToTimeStr,
} from "@/lib/calendarHelpers";

/**
 * POST /api/v1/suggestions/[id]/resolve
 * Resolve a suggestion (player only).
 * Body: { status: 'accepted' | 'edited' | 'declined', playerNotes?: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const roleResult = await requireRole(auth.user.id, ["player"]);
  if ("error" in roleResult) return roleResult.error;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const { status, playerNotes } = body;

  if (!status || !["accepted", "edited", "declined"].includes(status)) {
    return NextResponse.json(
      { error: "status must be one of: accepted, edited, declined" },
      { status: 400 }
    );
  }

  const { id: suggestionId } = await params;

  try {
    const resolved = await resolveSuggestion(suggestionId, auth.user.id, {
      status,
      playerNotes,
    });

    // Auto-create calendar_event when a calendar_event or study_block suggestion is accepted
    let eventCreated = false;
    if (
      status === "accepted" &&
      (resolved.suggestion_type === "calendar_event" || resolved.suggestion_type === "study_block") &&
      resolved.payload
    ) {
      try {
        const p = resolved.payload as Record<string, unknown>;
        const eventType = toDbEventType(String(p.type || (resolved.suggestion_type === "study_block" ? "study_block" : "training")));

        // Parse date and times — support both HH:mm fields and ISO timestamp fields
        let date = p.date ? String(p.date) : "";
        let startTime = p.startTime ? String(p.startTime) : null;
        let endTime = p.endTime ? String(p.endTime) : null;
        const duration = p.duration ? Number(p.duration) : null;

        // Try ISO timestamps (startAt/endAt from study plan generator)
        const startAtStr = p.startAt ? String(p.startAt) : null;
        const endAtStr = p.endAt ? String(p.endAt) : null;

        if (startAtStr && !startTime) {
          date = startAtStr.slice(0, 10);       // "2026-03-15"
          startTime = startAtStr.slice(11, 16); // "15:00"
        }
        if (endAtStr && !endTime) {
          endTime = endAtStr.slice(11, 16);     // "16:00"
        }

        // Compute endTime from startTime + duration as fallback
        if (!endTime && startTime && duration) {
          endTime = addMinutesToTimeStr(startTime, duration);
        }

        const startAt = startTime
          ? `${date}T${startTime}:00`
          : `${date}T00:00:00`;
        const endAt = endTime ? `${date}T${endTime}:00` : null;

        const db = supabaseAdmin();
        const insertBase = {
          user_id: resolved.player_id,
          title: resolved.title,
          event_type: eventType,
          start_at: startAt,
          end_at: endAt,
          notes: p.notes ? String(p.notes) : null,
        };
        const insertData = {
          ...insertBase,
          intensity: p.intensity ? String(p.intensity) : null,
          sport: p.sport ? String(p.sport) : null,
        } as typeof insertBase;

        await db.from("calendar_events").insert(insertData);
        eventCreated = true;
      } catch {
        // Best-effort: don't fail the resolve if event creation fails
      }
    }

    // Notify the author about the resolution
    if (resolved.author_id) {
      createNotification({
        userId: resolved.author_id,
        type: "suggestion_resolved",
        title: `Suggestion ${status}: ${resolved.title}`,
        body: playerNotes
          ? `Player notes: ${playerNotes}`
          : `Your suggestion was ${status}.`,
        data: { suggestionId: resolved.id, resolution: status },
      }).catch(() => {
        /* best-effort */
      });
    }

    return NextResponse.json(
      { suggestion: resolved, eventCreated },
      { headers: { "api-version": "v1" } }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to resolve suggestion" },
      { status: 404 }
    );
  }
}
