/**
 * POST /api/v1/chat/agent-stream
 *
 * Streaming version of /api/v1/chat/agent.
 * Returns Server-Sent Events (SSE) with status updates during tool execution
 * and the final structured response in the "done" event.
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
import { buildPlayerContext } from "@/services/agents/contextBuilder";
import { orchestrate, CAPSULE_DIRECT_ACTIONS } from "@/services/agents/orchestrator";
import { executeOutputTool } from "@/services/agents/outputAgent";
import { executeTimelineTool } from "@/services/agents/timelineAgent";
import { executeMasteryTool } from "@/services/agents/masteryAgent";
import { executeSettingsTool } from "@/services/agents/settingsAgent";
import type { CapsuleAction } from "@/services/agents/responseFormatter";
import { preFlightCheck } from "@/services/agents/chatGuardrails";
import {
  getAIServiceMode,
  proxyToAIServiceStream,
  shadowProxyToAIService,
  type AIServiceRequest,
} from "@/services/agents/aiServiceProxy";
import {
  getOrCreateSession,
  loadSessionHistory,
  saveMessage,
  savePendingAction,
  getPendingAction,
  clearPendingAction,
  getSessionState,
  updateSessionState,
  isAffirmation,
  type ConversationState,
} from "@/services/agents/sessionService";
import { extractConversationState } from "@/services/agents/conversationStateExtractor";

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
        // ── Guardrail pre-flight ──
        const preflight = preFlightCheck(message);
        if (preflight.blocked) {
          send("done", { message: preflight.message, structured: null, sessionId: null, refreshTargets: [], pendingConfirmation: null });
          controller.close();
          return;
        }

        // ── Session management (mirrors /chat/agent exactly) ──
        let sessionId: string | null = null;
        let conversationHistory: { role: "user" | "assistant"; content: string }[] = [];
        let lastAgentType: string | undefined;
        let activeAgent: string | null = null;
        let conversationState: ConversationState | null = null;

        try {
          const session = await getOrCreateSession(auth.user.id, body.sessionId);
          sessionId = session.id;
          await saveMessage(session.id, auth.user.id, "user", message);

          const sessionState = await getSessionState(session.id);
          activeAgent = sessionState.activeAgent;
          conversationState = sessionState.conversationState;

          // Server-side pending action detection
          if (!body.confirmedAction && isAffirmation(message)) {
            const pendingResult = await getPendingAction(session.id);
            if (pendingResult.action) {
              body.confirmedAction = {
                toolName: pendingResult.action.toolName,
                toolInput: pendingResult.action.toolInput,
                agentType: pendingResult.action.agentType,
                actions: pendingResult.action.actions,
              };
              await clearPendingAction(session.id);
            }
          }

          const historyResult = await loadSessionHistory(session.id);
          conversationHistory = historyResult.messages.slice(0, -1);
          lastAgentType = historyResult.lastAgentType;

          if (body.confirmedAction) {
            await clearPendingAction(session.id);
          }
        } catch (sessionErr) {
          logger.warn("[agent-stream] Session management unavailable", { error: sessionErr instanceof Error ? sessionErr.message : String(sessionErr) });
        }

        // ── Build player context ──
        send("status", { status: "Loading your profile..." });
        const context = await buildPlayerContext(
          auth.user.id,
          body.activeTab ?? "Chat",
          message,
          body.timezone
        );

        // ── Handle capsule submissions ──
        if (body.capsuleAction) {
          send("status", { status: "Processing..." });
          const ca = body.capsuleAction as CapsuleAction;
          const executors: Record<string, typeof executeOutputTool> = {
            output: executeOutputTool,
            timeline: executeTimelineTool,
            mastery: executeMasteryTool,
            settings: executeSettingsTool,
          };
          const executor = executors[ca.agentType];
          if (executor) {
            const toolResult = await executor(ca.toolName, ca.toolInput, context);
            const refreshTargets = toolResult.refreshTarget ? [toolResult.refreshTarget] : [];
            const resultMsg = toolResult.error
              ? `Error: ${toolResult.error}`
              : `Done! ${ca.toolName.replace(/_/g, " ")} completed.`;

            if (sessionId) {
              await saveMessage(sessionId, auth.user.id, "assistant", resultMsg).catch(() => {});
            }

            send("done", { message: resultMsg, structured: null, sessionId, refreshTargets, pendingConfirmation: null });
            controller.close();
            return;
          }
        }

        // ── AI Service proxy check ──
        const aiServiceMode = getAIServiceMode();

        if (aiServiceMode === "true") {
          // Full proxy: Python AI service handles orchestration
          send("status", { status: "Thinking..." });

          const aiRequest: AIServiceRequest = {
            message,
            session_id: sessionId,
            player_id: auth.user.id,
            active_tab: body.activeTab ?? "Chat",
            timezone: body.timezone ?? "UTC",
            confirmed_action: body.confirmedAction ?? null,
          };

          for await (const sse of proxyToAIServiceStream(aiRequest, (s) => send("status", { status: s }))) {
            send(sse.event, sse.data);
          }

          controller.close();
          return;
        }

        if (aiServiceMode === "shadow") {
          // Shadow mode: fire-and-forget to Python, TS serves response
          shadowProxyToAIService({
            message,
            session_id: sessionId,
            player_id: auth.user.id,
            active_tab: body.activeTab ?? "Chat",
            timezone: body.timezone ?? "UTC",
            confirmed_action: body.confirmedAction ?? null,
          });
        }

        // ── Orchestrate with streaming callbacks (TypeScript path) ──
        send("status", { status: "Thinking..." });
        const result = await orchestrate(
          message,
          context,
          body.confirmedAction,
          conversationHistory,
          lastAgentType,
          activeAgent,
          conversationState,
          {
            onStatus: (status) => send("status", { status }),
          }
        );

        // ── Save response + update session state ──
        if (sessionId) {
          try {
            await saveMessage(sessionId, auth.user.id, "assistant", result.message, {
              structured: result.structured ?? null,
              agent: result.agentType ?? null,
            });

            if (result.pendingConfirmation) {
              await savePendingAction(sessionId, {
                toolName: result.pendingConfirmation.toolName,
                toolInput: result.pendingConfirmation.toolInput,
                agentType: result.pendingConfirmation.agentType,
                preview: result.pendingConfirmation.preview,
                actions: result.pendingConfirmation.actions ?? undefined,
              });
            }

            const newConversationState = extractConversationState(
              message,
              result.message,
              conversationState,
              context.todayDate,
              context.timezone,
              result.structured
            );

            await updateSessionState(sessionId, {
              activeAgent: result.agentType ?? activeAgent,
              conversationState: newConversationState,
            });
          } catch (saveErr) {
            logger.warn("[agent-stream] Save failed", { error: saveErr instanceof Error ? saveErr.message : String(saveErr) });
          }
        }

        // ── Send final result ──
        const debugMode = req.headers.get("x-tomo-debug") === "true";
        send("done", {
          message: result.message,
          structured: result.structured ?? null,
          sessionId,
          refreshTargets: result.refreshTargets,
          pendingConfirmation: result.pendingConfirmation ?? null,
          context: {
            ageBand: context.ageBand,
            readinessScore: context.readinessScore,
            activeTab: context.activeTab,
          },
          ...(debugMode && result._eval ? { _eval: result._eval } : {}),
        });

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
      "Connection": "keep-alive",
      "api-version": "v1",
    },
  });
}
