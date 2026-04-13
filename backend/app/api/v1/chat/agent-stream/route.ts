/**
 * POST /api/v1/chat/agent-stream
 *
 * Streaming chat endpoint — proxies ALL traffic to the Python AI service.
 * Capsule actions are forwarded to Python as confirmed_action (v2 single write path).
 *
 * Events:
 *   event: status  → { status: "Checking your readiness..." }
 *   event: done    → { message, structured, sessionId, refreshTargets, pendingConfirmation, context }
 *   event: error   → { error: "..." }
 */

import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";
import { logger } from "@/lib/logger";
import {
  proxyToAIServiceStream,
  type AIServiceRequest,
} from "@/services/agents/aiServiceProxy";
import {
  getOrCreateSession,
  saveMessage,
} from "@/services/agents/sessionService";

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const { allowed } = checkRateLimit(auth.user.id, 20, 60000);
  if (!allowed) {
    return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), { status: 400 });
  }

  const message = body.message?.trim();
  if (!message || message.length > 2000) {
    return new Response(JSON.stringify({ error: "Invalid message" }), { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: any) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // Pre-flight guardrails REMOVED — will be CMS-configurable.

        // ── Session management ──
        let sessionId: string | null = null;
        try {
          const session = await getOrCreateSession(auth.user.id, body.sessionId);
          sessionId = session.id;
          await saveMessage(session.id, auth.user.id, "user", message);
        } catch (sessionErr) {
          logger.warn("[agent-stream] Session management unavailable", { error: sessionErr instanceof Error ? sessionErr.message : String(sessionErr) });
        }

        // ── Capsule actions → Python AI service (v2: single write path) ──
        // Forwarded to Python as confirmed_action for unified safety + audit pipeline.
        if (body.capsuleAction) {
          logger.info(`[capsule→python] Forwarding ${body.capsuleAction.toolName} to AI service`);
          // Normalize shape: strip capsule-specific 'type' field, keep only confirmedAction fields
          const { toolName, toolInput, agentType } = body.capsuleAction;
          body.confirmedAction = { toolName, toolInput, agentType };
        }

        // ── Python AI service — all non-capsule traffic ──
        const aiRequest: AIServiceRequest = {
          message,
          session_id: sessionId,
          player_id: auth.user.id,
          active_tab: body.activeTab ?? "Chat",
          timezone: body.timezone ?? "UTC",
          confirmed_action: body.confirmedAction ?? null,
        };

        send("status", { status: "Thinking..." });

        for await (const sse of proxyToAIServiceStream(aiRequest, (s) => send("status", { status: s }))) {
          send(sse.event, sse.data);
        }

        controller.close();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Stream error";
        logger.error("[agent-stream] Error", { error: errorMessage, userId: auth.user.id });
        send("error", { error: errorMessage });
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
