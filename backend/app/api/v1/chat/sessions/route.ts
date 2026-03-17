/**
 * GET  /api/v1/chat/sessions — List user's chat sessions
 * POST /api/v1/chat/sessions — Create a new chat session
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { listUserSessions, createSession } from "@/services/agents/sessionService";

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const sessions = await listUserSessions(auth.user.id);
    return NextResponse.json({ sessions });
  } catch (err) {
    console.error("List sessions error:", err);
    return NextResponse.json(
      { error: "Failed to list sessions" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const session = await createSession(auth.user.id);
    return NextResponse.json({ session });
  } catch (err) {
    console.error("Create session error:", err);
    return NextResponse.json(
      { error: "Failed to create session" },
      { status: 500 }
    );
  }
}
