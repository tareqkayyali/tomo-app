/**
 * POST /api/v1/parent/children/[id]/notify-study-info
 *
 * Sends an in-app notification to the child asking them to fill in
 * their subjects, exam schedule, and training preferences.
 * Parent only — requires active relationship.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole, requireRelationship } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
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
    // Rate limit: max 1 notification per child per 24 hours
    const db = supabaseAdmin();
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await db
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", childId)
      .eq("type", "study_info_request")
      .gte("created_at", twentyFourHoursAgo);

    if (count && count > 0) {
      return NextResponse.json(
        { error: "Notification already sent in the last 24 hours" },
        { status: 429 }
      );
    }

    await createNotification({
      userId: childId,
      type: "study_info_request",
      title: "Your parent needs your study info",
      body: "Please add your subjects and exam schedule in Profile \u2192 Edit Profile so they can help plan your study sessions.",
      data: { parentId: auth.user.id },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[POST /api/v1/parent/children/[id]/notify-study-info] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
