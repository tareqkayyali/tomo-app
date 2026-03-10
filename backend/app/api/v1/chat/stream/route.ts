import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { processMessageStream } from "@/services/chat/chatService";

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  let message: string;
  try {
    const body = await req.json();
    message = body.message;
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid request body" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!message || typeof message !== "string") {
    return new Response(
      JSON.stringify({ error: "message is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (message.length > 2000) {
    return new Response(
      JSON.stringify({ error: "Message too long (max 2000 characters)" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Server-Sent Events stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const result = await processMessageStream(
          auth.user.id,
          message,
          (text: string) => {
            // Send delta event
            controller.enqueue(
              encoder.encode(`event: delta\ndata: ${JSON.stringify({ text })}\n\n`)
            );
          },
          (status: string) => {
            // Send status event
            controller.enqueue(
              encoder.encode(
                `event: status\ndata: ${JSON.stringify({ status })}\n\n`
              )
            );
          }
        );

        // Send done event
        controller.enqueue(
          encoder.encode(
            `event: done\ndata: ${JSON.stringify({
              intent: result.intent,
              userMessage: result.userMsg,
              aiMessage: result.aiMsg,
            })}\n\n`
          )
        );

        controller.close();
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Stream error";
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({ error: errorMessage })}\n\n`
          )
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "api-version": "v1",
    },
  });
}
