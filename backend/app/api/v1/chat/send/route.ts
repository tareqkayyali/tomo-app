import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { processMessage } from "@/services/chat/chatService";

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    const { message } = body;

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "message is required and must be a string" },
        { status: 400 }
      );
    }

    if (message.length > 2000) {
      return NextResponse.json(
        { error: "Message too long (max 2000 characters)" },
        { status: 400 }
      );
    }

    const result = await processMessage(auth.user.id, message);

    return NextResponse.json(
      {
        userMessage: result.userMsg,
        aiMessage: result.aiMsg,
        intent: result.intent,
      },
      { headers: { "api-version": "v1" } }
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Chat error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
