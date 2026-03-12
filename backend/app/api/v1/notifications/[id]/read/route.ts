import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { markAsRead } from "@/services/notificationService";

/**
 * POST /api/v1/notifications/[id]/read
 * Mark a single notification as read.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const { id: notificationId } = await params;

  try {
    const notification = await markAsRead(notificationId, auth.user.id);
    return NextResponse.json(
      { notification },
      { headers: { "api-version": "v1" } }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Notification not found" },
      { status: 404 }
    );
  }
}
