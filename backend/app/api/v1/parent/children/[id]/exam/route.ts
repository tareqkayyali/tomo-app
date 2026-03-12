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

  const body = await req.json();
  const { subject, examType, examDate, notes } = body;

  if (!subject || !examType || !examDate) {
    return NextResponse.json(
      { error: "Missing required fields: subject, examType, examDate" },
      { status: 400 }
    );
  }

  const suggestion = await createSuggestion({
    playerId: childId,
    authorId: auth.user.id,
    authorRole: "parent",
    suggestionType: "exam_date",
    title: `Exam: ${subject} (${examType})`,
    payload: {
      subject,
      examType,
      examDate,
      notes: notes || null,
    },
    expiresAt: new Date(examDate).toISOString(),
  });

  await createNotification({
    userId: childId,
    type: "suggestion_received",
    title: "Upcoming Exam",
    body: `Your parent added an exam: ${subject} (${examType}) on ${examDate}`,
    data: { suggestionId: suggestion.id, suggestionType: "exam_date" },
  });

  return NextResponse.json(
    { suggestion },
    { status: 201, headers: { "api-version": "v1" } }
  );
}
