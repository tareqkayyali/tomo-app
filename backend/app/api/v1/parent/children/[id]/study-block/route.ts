import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole, requireRelationship } from "@/lib/auth";
import { createSuggestion } from "@/services/suggestionService";
import { createNotification } from "@/services/notificationService";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const roleCheck = await requireRole(auth.user.id, ["parent"]);
  if ("error" in roleCheck) return roleCheck.error;

  const { id: childId } = await params;

  const relResult = await requireRelationship(auth.user.id, childId);
  if ("error" in relResult) return relResult.error;

  try {
    const body = await req.json();
    const { subject, startAt, endAt, priority, notes } = body;

    if (!subject || !startAt || !endAt) {
      return NextResponse.json(
        { error: "Missing required fields: subject, startAt, endAt" },
        { status: 400 }
      );
    }

    const suggestion = await createSuggestion({
      playerId: childId,
      authorId: auth.user.id,
      authorRole: "parent",
      suggestionType: "study_block",
      title: `Study Block: ${subject}`,
      payload: {
        subject,
        startAt,
        endAt,
        priority: priority || "medium",
        notes: notes || null,
      },
    });

    await createNotification({
      userId: childId,
      type: "suggestion_received",
      title: "New Study Block",
      body: `Your parent scheduled a study block for ${subject}`,
      data: { suggestionId: suggestion.id, suggestionType: "study_block" },
    });

    return NextResponse.json(
      { suggestion },
      { status: 201, headers: { "api-version": "v1" } }
    );
  } catch (err) {
    console.error('[POST /api/v1/parent/children/[id]/study-block] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
