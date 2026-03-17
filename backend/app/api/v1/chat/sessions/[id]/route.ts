/**
 * GET    /api/v1/chat/sessions/:id — Load session message history
 * DELETE /api/v1/chat/sessions/:id — End (archive) a session
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  loadSessionMessages,
  endSession,
} from "@/services/agents/sessionService";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    const messages = await loadSessionMessages(id, auth.user.id);
    return NextResponse.json({ messages });
  } catch (err) {
    console.error("Load session messages error:", err);
    return NextResponse.json(
      { error: "Failed to load session" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    await endSession(auth.user.id, id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("End session error:", err);
    return NextResponse.json(
      { error: "Failed to end session" },
      { status: 500 }
    );
  }
}
