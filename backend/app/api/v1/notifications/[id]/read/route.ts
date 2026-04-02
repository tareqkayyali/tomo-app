import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { markAsRead } from "@/services/notificationService";
import { markRead } from "@/services/notifications/notificationEngine";

const HEADERS = { "api-version": "v1" };

/**
 * POST /api/v1/notifications/[id]/read  (legacy compat)
 * PATCH /api/v1/notifications/[id]/read (new center)
 *
 * Mark a single notification as read.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    const notification = await markAsRead(id, auth.user.id);
    return NextResponse.json({ notification }, { headers: HEADERS });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Notification not found" },
      { status: 404, headers: HEADERS }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;

  const ok = await markRead(id);
  if (!ok) {
    return NextResponse.json(
      { error: "Notification not found or already read" },
      { status: 404, headers: HEADERS }
    );
  }

  return NextResponse.json({ success: true }, { headers: HEADERS });
}
