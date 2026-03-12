import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole, requireRelationship } from "@/lib/auth";
import {
  createSuggestion,
  listSuggestions,
  listAuthoredSuggestions,
} from "@/services/suggestionService";
import { createNotification } from "@/services/notificationService";

/**
 * GET /api/v1/suggestions
 * - Players: returns their pending (or filtered) suggestions
 * - Coach/Parent: returns suggestions they authored
 */
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const roleResult = await requireRole(auth.user.id, [
    "player",
    "coach",
    "parent",
  ]);
  if ("error" in roleResult) return roleResult.error;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || undefined;

  try {
    if (roleResult.role === "player") {
      const suggestions = await listSuggestions(auth.user.id, status);
      return NextResponse.json(
        { suggestions },
        { headers: { "api-version": "v1" } }
      );
    }

    // Coach or Parent — return authored suggestions
    const suggestions = await listAuthoredSuggestions(auth.user.id);
    return NextResponse.json(
      { suggestions },
      { headers: { "api-version": "v1" } }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch suggestions" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/suggestions
 * Create a suggestion (coach/parent only).
 * Body: { playerId, suggestionType, title, payload, expiresAt? }
 */
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const roleResult = await requireRole(auth.user.id, ["coach", "parent"]);
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

  const { playerId, suggestionType, title, payload, expiresAt } = body;

  if (!playerId || !suggestionType || !title || !payload) {
    return NextResponse.json(
      {
        error:
          "Missing required fields: playerId, suggestionType, title, payload",
      },
      { status: 400 }
    );
  }

  // Verify relationship between author and player
  const relResult = await requireRelationship(auth.user.id, playerId);
  if ("error" in relResult) return relResult.error;

  try {
    const suggestion = await createSuggestion({
      playerId,
      authorId: auth.user.id,
      authorRole: roleResult.role,
      suggestionType,
      title,
      payload,
      expiresAt,
    });

    // Fire-and-forget notification to the player
    createNotification({
      userId: playerId,
      type: "suggestion_received",
      title: `New suggestion: ${title}`,
      body: `Your ${roleResult.role} sent you a suggestion.`,
      data: { suggestionId: suggestion.id, suggestionType },
    }).catch(() => {
      /* swallow — notification is best-effort */
    });

    return NextResponse.json(
      { suggestion },
      { status: 201, headers: { "api-version": "v1" } }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to create suggestion" },
      { status: 500 }
    );
  }
}
