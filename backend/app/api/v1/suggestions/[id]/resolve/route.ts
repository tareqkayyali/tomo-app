import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth";
import { resolveSuggestion } from "@/services/suggestionService";
import { createNotification } from "@/services/notificationService";

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
      { suggestion: resolved },
      { headers: { "api-version": "v1" } }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to resolve suggestion" },
      { status: 404 }
    );
  }
}
