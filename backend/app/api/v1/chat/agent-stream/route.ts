/**
 * POST /api/v1/chat/agent-stream
 *
 * SSE streaming chat endpoint. Thin proxy to Python AI service.
 * Auth + rate limit + forward. ALL logic in Python.
 */

import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";
import { logger } from "@/lib/logger";
import {
  proxyToAIServiceSync,
  type AIServiceRequest,
} from "@/services/agents/aiServiceProxy";
import {
  getOrCreateSession,
  saveMessage,
} from "@/services/agents/sessionService";
import {
  runQualityPipeline,
  mapPythonAgent,
  computeFellThrough,
} from "@/services/quality";
import { randomUUID } from "node:crypto";
import { ObservabilityHeaders } from "@/lib/observability/ids";
import { captureError } from "@/lib/errorTracker";
import { ErrorCode } from "@/lib/observability/error-codes";

function normalizeCapsuleAction(capsuleAction: any) {
  if (!capsuleAction) return null;
  const toolInput = { ...(capsuleAction.toolInput ?? {}) };
  let toolName = capsuleAction.toolName;
  let agentType = capsuleAction.agentType;

  const toolAliases: Record<string, string> = {
    update_notification_settings: "update_notification_preferences",
    sync_whoop: "sync_wearable",
  };
  const agentAliases: Record<string, string> = {
    testing_benchmark: "performance",
    training_program: "performance",
    dual_load: "planning",
    cv_identity: "identity",
    mastery: "identity",
    output: "performance",
    timeline: "planning",
  };

  toolName = toolAliases[toolName] ?? toolName;
  agentType = agentAliases[agentType] ?? agentType;

  if (toolName === "sync_wearable" && !toolInput.provider) {
    toolInput.provider = "whoop";
  }

  return { toolName, toolInput, agentType };
}

export async function POST(req: NextRequest) {
  const traceId = req.headers.get(ObservabilityHeaders.traceId) ?? randomUUID();
  const requestId = req.headers.get(ObservabilityHeaders.requestId);
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
        // Session management (non-blocking)
        let sessionId: string | null = null;
        try {
          const session = await getOrCreateSession(auth.user.id, body.sessionId);
          sessionId = session.id;
          await saveMessage(session.id, auth.user.id, "user", message);
        } catch (sessionErr) {
          logger.warn("[agent-stream] Session mgmt unavailable", {
            error: sessionErr instanceof Error ? sessionErr.message : String(sessionErr),
          });
        }

        // See agent/route: read-only program capsule tools are formatted in Python (not "done" template).
        if (body.capsuleAction) {
          body.confirmedAction = normalizeCapsuleAction(body.capsuleAction);
        }

        const aiRequest: AIServiceRequest = {
          message,
          session_id: sessionId,
          player_id: auth.user.id,
          active_tab: body.activeTab ?? "Chat",
          timezone: body.timezone ?? "UTC",
          confirmed_action: body.confirmedAction ?? null,
        };

        send("status", { status: "Thinking..." });

        try {
          const pyResult = await proxyToAIServiceSync(aiRequest);
          send("done", {
            message: pyResult.message,
            structured: pyResult.structured,
            sessionId: pyResult.sessionId || sessionId,
            refreshTargets: pyResult.refreshTargets || [],
            pendingConfirmation: pyResult.pendingConfirmation || null,
            context: pyResult.context || {},
          });

          // Quality + safety pipeline — fire-and-forget after response sent.
          void runQualityPipeline({
            traceId,
            turnId: randomUUID(),
            sessionId: pyResult.sessionId || sessionId,
            userId: auth.user.id,
            userMessage: message,
            assistantResponse: pyResult.message || "",
            activeTab: body.activeTab ?? null,
            agent: mapPythonAgent(pyResult.telemetry?.agent),
            hasRag: pyResult.telemetry?.has_rag ?? false,
            intentConfidence: pyResult.telemetry?.routing_confidence ?? null,
            fellThrough: computeFellThrough(pyResult.telemetry?.classification_layer),
          });
        } catch (proxyErr) {
          await captureError(proxyErr, {
            layer: "backend",
            endpoint: "/api/v1/chat/agent-stream",
            traceId,
            requestId,
            userId: auth.user.id,
            errorCode: ErrorCode.BE.AI.SERVICE_FAILED,
          });
          logger.error("[agent-stream] Python proxy failed", {
            error: proxyErr instanceof Error ? proxyErr.message : String(proxyErr),
          });
          send("error", { error: "Something went wrong. Try again." });
        }

        controller.close();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Stream error";
        await captureError(err, {
          layer: "backend",
          endpoint: "/api/v1/chat/agent-stream",
          traceId,
          requestId,
          userId: auth.user.id,
          errorCode: ErrorCode.BE.CHAT.STREAM_FAILED,
        });
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
