/**
 * POST /api/v1/chat/agent
 *
 * Thin proxy to Python AI service. Auth + rate limit + forward. Nothing else.
 * ALL safety, validation, and formatting happens in Python.
 * Supports both sync (default) and SSE streaming (?stream=true).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";
import { logger } from "@/lib/logger";
import {
  proxyToAIServiceStream,
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

function formatSSE(event: string, data: any): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const { allowed } = checkRateLimit(auth.user.id, 20, 60000);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.message?.trim() || body.message.length > 2000) {
    return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  }

  try {
    // Session management (non-blocking — failure doesn't break chat)
    let sessionId: string | null = null;
    try {
      const session = await getOrCreateSession(auth.user.id, body.sessionId);
      sessionId = session.id;
      await saveMessage(session.id, auth.user.id, "user", body.message);
    } catch (sessionErr) {
      logger.warn("[chat] Session mgmt unavailable", {
        error: sessionErr instanceof Error ? sessionErr.message : String(sessionErr),
      });
    }

    // Capsule → Python currently uses confirmed_action (see ai-service supervisor).
    // Read-only program tools (e.g. get_program_details) are formatted in
    // format_response._build_program_read_capsule_response — not the Pulse "done" template.
    if (body.capsuleAction) {
      const { toolName, toolInput, agentType } = body.capsuleAction;
      body.confirmedAction = { toolName, toolInput, agentType };
    }

    // Build request for Python AI service
    const aiRequest: AIServiceRequest = {
      message: body.message.trim(),
      session_id: sessionId,
      player_id: auth.user.id,
      active_tab: body.activeTab ?? "Chat",
      timezone: body.timezone ?? "UTC",
      confirmed_action: body.confirmedAction ?? null,
    };

    // SSE streaming path
    if (req.nextUrl.searchParams.get("stream") === "true") {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            controller.enqueue(encoder.encode(formatSSE("status", { status: "Thinking..." })));

            // Use sync proxy wrapped in SSE (Railway drops raw SSE between services)
            try {
              const pyResult = await proxyToAIServiceSync(aiRequest);
              controller.enqueue(encoder.encode(formatSSE("done", {
                message: pyResult.message,
                structured: pyResult.structured,
                sessionId: pyResult.sessionId || sessionId,
                refreshTargets: pyResult.refreshTargets || [],
                pendingConfirmation: pyResult.pendingConfirmation || null,
                context: {},
              })));

              // Quality + safety pipeline — fire-and-forget after response handed to user.
              void runQualityPipeline({
                traceId: randomUUID(),
                turnId: randomUUID(),
                sessionId: pyResult.sessionId || sessionId,
                userId: auth.user.id,
                userMessage: body.message.trim(),
                assistantResponse: pyResult.message || "",
                activeTab: body.activeTab ?? null,
                agent: mapPythonAgent(pyResult.telemetry?.agent),
                hasRag: pyResult.telemetry?.has_rag ?? false,
                intentConfidence: pyResult.telemetry?.routing_confidence ?? null,
                fellThrough: computeFellThrough(pyResult.telemetry?.classification_layer),
              });
            } catch (proxyErr) {
              logger.error("[chat-stream] Python proxy failed", {
                error: proxyErr instanceof Error ? proxyErr.message : String(proxyErr),
              });
              controller.enqueue(encoder.encode(formatSSE("error", {
                error: "Something went wrong. Try again.",
              })));
            }

            controller.close();
          } catch (err) {
            controller.enqueue(encoder.encode(formatSSE("error", {
              error: err instanceof Error ? err.message : "Stream error",
            })));
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

    // Sync path — forward to Python and return response directly
    const pyResult = await proxyToAIServiceSync(aiRequest);

    // Quality + safety pipeline — fire-and-forget after we have the result.
    void runQualityPipeline({
      traceId: randomUUID(),
      turnId: randomUUID(),
      sessionId: pyResult.sessionId || sessionId,
      userId: auth.user.id,
      userMessage: body.message.trim(),
      assistantResponse: pyResult.message || "",
      activeTab: body.activeTab ?? null,
      agent: mapPythonAgent(pyResult.telemetry?.agent),
      hasRag: pyResult.telemetry?.has_rag ?? false,
      intentConfidence: pyResult.telemetry?.routing_confidence ?? null,
      fellThrough: computeFellThrough(pyResult.telemetry?.classification_layer),
    });

    return NextResponse.json(pyResult);

  } catch (err) {
    logger.error("[chat] Route error", {
      error: err instanceof Error ? err.message : String(err),
      userId: auth.user.id,
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Chat error" },
      { status: 500 }
    );
  }
}
