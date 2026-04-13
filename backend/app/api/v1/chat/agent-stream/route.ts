/**
 * POST /api/v1/chat/agent-stream
 *
 * Streaming chat endpoint — proxies all AI traffic to the Python AI service (tomo-ai).
 * Capsule actions (direct tool execution, $0) still execute in TypeScript.
 *
 * Events:
 *   event: status  → { status: "Checking your readiness..." }
 *   event: done    → { message, structured, sessionId, refreshTargets, pendingConfirmation, context }
 *   event: error   → { error: "..." }
 *
 * Phase 9 cleanup: Removed TS orchestrator path. Python serves 100% of AI traffic.
 */

import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";
import { logger } from "@/lib/logger";
import { buildPlayerContext } from "@/services/agents/contextBuilder";
import { executeOutputTool } from "@/services/agents/outputAgent";
import { executeTimelineTool } from "@/services/agents/timelineAgent";
import { executeMasteryTool } from "@/services/agents/masteryAgent";
import { executeSettingsTool } from "@/services/agents/settingsAgent";
import { preFlightCheck, checkRedRiskForTool } from "@/services/agents/chatGuardrails";
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

        // ── Handle capsule actions ($0, deterministic) ──
        if (body.capsuleAction) {
          send("status", { status: "Processing..." });
          const ca = body.capsuleAction;

          const context = await buildPlayerContext(
            auth.user.id,
            body.activeTab ?? "Chat",
            message,
            body.timezone
          );

          // Safety gate: check RED risk before capsule write execution (matches sync route)
          const se = context.snapshotEnrichment;
          const safetyCheck = checkRedRiskForTool(
            ca.toolName,
            ca.toolInput,
            se?.injuryRiskFlag,
            se?.ccrsRecommendation,
            se?.ccrs,
          );
          const safeToolInput = safetyCheck.modifiedInput;
          if (safetyCheck.reasons.length > 0) {
            logger.warn(`[SAFETY-TS] Stream capsule gate: ${ca.toolName} → ${safetyCheck.reasons.join(", ")}`);
          }

          const executors: Record<string, typeof executeOutputTool> = {
            output: executeOutputTool,
            timeline: executeTimelineTool,
            mastery: executeMasteryTool,
            settings: executeSettingsTool,
          };
          const executor = executors[ca.agentType];
          if (executor) {
            const toolResult = await executor(ca.toolName, safeToolInput, context);
            const refreshTargets = toolResult.refreshTarget ? [toolResult.refreshTarget] : [];
            const friendlyName = ca.toolName.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
            const safetyNote = safetyCheck.safetyMessage ? `\n\n${safetyCheck.safetyMessage}` : "";
            const resultMsg = toolResult.error
              ? `${toolResult.error}`
              : `${friendlyName} — done!${safetyNote}`;

            if (sessionId) {
              await saveMessage(sessionId, auth.user.id, "assistant", resultMsg).catch(() => {});
            }

            send("done", {
              message: resultMsg,
              structured: null,
              sessionId,
              refreshTargets,
              pendingConfirmation: null,
              context: {
                ageBand: context.ageBand,
                readinessScore: context.readinessScore,
                activeTab: context.activeTab,
              },
            });
            controller.close();
            return;
          }
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
