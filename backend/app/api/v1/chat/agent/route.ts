/**
 * POST /api/v1/chat/agent
 *
 * Chat endpoint — proxies all AI traffic to the Python AI service (tomo-ai).
 * Capsule actions (direct tool execution, $0) still execute in TypeScript.
 *
 * Phase 9 cleanup: Removed TS orchestrator path. Python serves 100% of AI traffic.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";
import { logger } from "@/lib/logger";
import { buildPlayerContext } from "@/services/agents/contextBuilder";
import { executeOutputTool } from "@/services/agents/outputAgent";
import { executeTimelineTool } from "@/services/agents/timelineAgent";
import { executeMasteryTool } from "@/services/agents/masteryAgent";
import { executeSettingsTool } from "@/services/agents/settingsAgent";
import {
  preFlightCheck,
  categorizeMessage,
} from "@/services/agents/chatGuardrails";
import {
  proxyToAIServiceStream,
  proxyToAIServiceSync,
  type AIServiceRequest,
} from "@/services/agents/aiServiceProxy";
import {
  getOrCreateSession,
  saveMessage,
} from "@/services/agents/sessionService";

/** Capsule action shape sent by mobile app */
interface CapsuleAction {
  toolName: string;
  toolInput: Record<string, any>;
  agentType: string;
}

/** Format a Server-Sent Event */
function formatSSE(event: string, data: any): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  // Rate limit: 20 requests/minute per user
  const { allowed } = checkRateLimit(auth.user.id, 20, 60000);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  let body: {
    message: string;
    sessionId?: string;
    activeTab?: string;
    timezone?: string;
    confirmedAction?: {
      toolName: string;
      toolInput: Record<string, any>;
      agentType: string;
      actions?: Array<{
        toolName: string;
        toolInput: Record<string, any>;
        agentType: string;
        preview: string;
      }>;
    };
    capsuleAction?: CapsuleAction;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.message?.trim()) {
    return NextResponse.json(
      { error: "message is required" },
      { status: 400 }
    );
  }

  if (body.message.length > 2000) {
    return NextResponse.json(
      { error: "Message too long (max 2000 characters)" },
      { status: 400 }
    );
  }

  // ── GUARDRAIL PRE-FLIGHT CHECK ─────────────────────────────
  const guardrailResult = preFlightCheck(body.message);

  if (guardrailResult.blocked) {
    return NextResponse.json({
      message: guardrailResult.message,
      refreshTargets: [],
      pendingConfirmation: null,
      blocked: true,
      category: guardrailResult.category,
    });
  }

  // Tag topic for analytics (non-blocking)
  const _topicCategory = categorizeMessage(body.message);

  try {
    // ── SESSION MANAGEMENT ──────────────────────────────────────
    let sessionId: string | null = null;

    try {
      const session = await getOrCreateSession(auth.user.id, body.sessionId);
      sessionId = session.id;
      await saveMessage(session.id, auth.user.id, "user", body.message);
    } catch (sessionErr) {
      console.warn("[chat] Session management unavailable:", sessionErr instanceof Error ? sessionErr.message : sessionErr);
    }

    // ── CAPSULE ACTION — direct tool execution, skip LLM ($0) ───
    if (body.capsuleAction) {
      const { toolName, toolInput, agentType } = body.capsuleAction;

      // Build context for tool execution
      const context = await buildPlayerContext(
        auth.user.id,
        body.activeTab ?? "Chat",
        body.message,
        body.timezone
      );

      // Execute the tool directly based on agent type
      let toolResult: { result: any; refreshTarget?: string; error?: string };
      try {
        const executors: Record<string, typeof executeOutputTool> = {
          output: executeOutputTool,
          timeline: executeTimelineTool,
          mastery: executeMasteryTool,
          settings: executeSettingsTool,
        };
        const executor = executors[agentType];
        if (executor) {
          toolResult = await executor(toolName, toolInput, context);
        } else {
          toolResult = { result: null, error: `Unknown agent type: ${agentType}` };
        }
      } catch (execErr) {
        toolResult = { result: null, error: execErr instanceof Error ? execErr.message : "Capsule action failed" };
      }

      const refreshTargets = toolResult.refreshTarget ? [toolResult.refreshTarget] : [];

      // Deterministic response — no LLM needed for capsule confirmation
      const friendlyName = toolName.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
      const message = toolResult.error
        ? `❌ ${toolResult.error}`
        : `✅ ${friendlyName} — done!`;

      // Save capsule result to session
      if (sessionId) {
        try {
          await saveMessage(sessionId, auth.user.id, "assistant", message, {
            structured: null,
            agent: agentType,
          });
        } catch (e) { console.error("[chat-agent] Save capsule message failed:", e); }
      }

      return NextResponse.json(
        {
          message,
          structured: null,
          sessionId,
          refreshTargets,
          pendingConfirmation: null,
          context: {
            ageBand: context.ageBand,
            readinessScore: context.readinessScore,
            activeTab: context.activeTab,
          },
        },
        { headers: { "api-version": "v1" } }
      );
    }

    // ── PYTHON AI SERVICE — all non-capsule traffic ─────────────
    const aiRequest: AIServiceRequest = {
      message: body.message,
      session_id: sessionId,
      player_id: auth.user.id,
      active_tab: body.activeTab ?? "Chat",
      timezone: body.timezone ?? "UTC",
      confirmed_action: body.confirmedAction ?? null,
    };

    // Detect SSE streaming request
    const wantsStream = req.nextUrl.searchParams.get("stream") === "true";

    if (wantsStream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            controller.enqueue(encoder.encode(formatSSE("status", { status: "Thinking..." })));
            for await (const sse of proxyToAIServiceStream(aiRequest, (s) => {
              controller.enqueue(encoder.encode(formatSSE("status", { status: s })));
            })) {
              controller.enqueue(encoder.encode(formatSSE(sse.event, sse.data)));
            }
            controller.close();
          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "Stream error";
            controller.enqueue(encoder.encode(formatSSE("error", { error: errorMessage })));
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

    // Non-streaming: sync proxy to Python
    const pyResult = await proxyToAIServiceSync(aiRequest);
    return NextResponse.json(pyResult);
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Agent chat error";
    logger.error("Agent chat route error", { error: err instanceof Error ? err.message : String(err), userId: auth.user.id });
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
