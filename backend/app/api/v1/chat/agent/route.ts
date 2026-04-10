/**
 * POST /api/v1/chat/agent
 *
 * Agent-based chat endpoint with session management.
 *
 * 6-Layer Context Pipeline:
 *   1. Player Memory Snapshot (PlayerContext with temporal context)
 *   2. Temporal Context Builder (time-of-day, match day, exam proximity)
 *   3. Session History (token-budgeted conversation history)
 *   4. Conversation State Extractor (dates, events, topic, intent)
 *   5. Intent Router + Agent Lock (routing with stability)
 *   6. System Prompt Assembly (agent prompt + guardrails + Gen Z rules)
 *
 * Flow:
 *   1. Gets or creates a chat session
 *   2. Loads conversation history + session state (agent lock, conversation state)
 *   3. Detects affirmations → checks server-side pending actions
 *   4. Builds full player context with temporal awareness (once)
 *   5. Routes to specialized agents with agent lock stability
 *   6. Extracts conversation state for next turn
 *   7. Saves messages + pending actions + session state to DB
 *   8. Returns structured response + refreshTargets
 */

import { NextRequest, NextResponse } from "next/server";
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
import type { StreamCallbacks } from "@/lib/trackedClaudeCall";
import {
  preFlightCheck,
  categorizeMessage,
} from "@/services/agents/chatGuardrails";
import {
  getAIServiceMode,
  shouldUsePythonService,
  proxyToAIServiceStream,
  proxyToAIServiceSync,
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
import { extractConversationState, resolveEntityReference } from "@/services/agents/conversationStateExtractor";
import { updateAthleteMemory } from "@/services/agents/longitudinalMemory";

/** Format a Server-Sent Event */
function formatSSE(event: string, data: any): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  // Rate limit: 20 requests/minute per user for this expensive endpoint
  const { allowed } = checkRateLimit(auth.user.id, 20, 60000);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again shortly.' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  let body: {
    message: string;
    sessionId?: string;
    activeTab?: string;
    timezone?: string; // IANA timezone e.g. "Asia/Riyadh"
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
    // ── SESSION MANAGEMENT (graceful — works without DB tables) ──
    let sessionId: string | null = null;
    let conversationHistory: { role: "user" | "assistant"; content: string }[] = [];
    let lastAgentType: string | undefined;
    let activeAgent: string | null = null;
    let conversationState: ConversationState | null = null;

    try {
      const session = await getOrCreateSession(auth.user.id, body.sessionId);
      sessionId = session.id;

      // Save user message to DB
      await saveMessage(session.id, auth.user.id, "user", body.message);

      // Load session state (agent lock + conversation state)
      const sessionState = await getSessionState(session.id);
      activeAgent = sessionState.activeAgent;
      conversationState = sessionState.conversationState;

      // Server-side pending action detection
      if (!body.confirmedAction && isAffirmation(body.message)) {
        const pendingResult = await getPendingAction(session.id);
        if (pendingResult.action) {
          body.confirmedAction = {
            toolName: pendingResult.action.toolName,
            toolInput: pendingResult.action.toolInput,
            agentType: pendingResult.action.agentType,
            actions: pendingResult.action.actions,
          };
          await clearPendingAction(session.id);
        } else if (pendingResult.expired) {
          // Pending action expired — let the user know
        }
      }

      // Load conversation history + last agent type
      const historyResult = await loadSessionHistory(session.id);
      // Remove the last message (current user message we just saved)
      conversationHistory = historyResult.messages.slice(0, -1);
      lastAgentType = historyResult.lastAgentType;

      // Clear pending action from DB when frontend passes confirmedAction directly
      // (button-click path doesn't go through server-side affirmation detection)
      if (body.confirmedAction) {
        await clearPendingAction(session.id);
      }
    } catch (sessionErr) {
      // Session tables may not exist yet — continue without session features
      console.warn("[chat] Session management unavailable:", sessionErr instanceof Error ? sessionErr.message : sessionErr);
    }

    // Build player context snapshot with temporal awareness (called ONCE per request)
    const context = await buildPlayerContext(
      auth.user.id,
      body.activeTab ?? "Chat",
      body.message,
      body.timezone
    );

    // ── CAPSULE ACTION — direct tool execution, skip LLM ─────────
    if (body.capsuleAction) {
      const { toolName, toolInput, agentType } = body.capsuleAction;

      // Execute the tool directly based on agent type
      let toolResult: { result: any; refreshTarget?: string; error?: string };
      try {
        if (agentType === "output") {
          toolResult = await executeOutputTool(toolName, toolInput, context);
        } else if (agentType === "timeline") {
          toolResult = await executeTimelineTool(toolName, toolInput, context);
        } else if (agentType === "mastery") {
          toolResult = await executeMasteryTool(toolName, toolInput, context);
        } else if (agentType === "settings") {
          toolResult = await executeSettingsTool(toolName, toolInput, context);
        } else {
          toolResult = { result: null, error: `Unknown agent type: ${agentType}` };
        }
      } catch (execErr) {
        toolResult = { result: null, error: execErr instanceof Error ? execErr.message : "Capsule action failed" };
      }

      const refreshTargets = toolResult.refreshTarget ? [toolResult.refreshTarget] : [];

      // Save user message + result to session
      if (sessionId) {
        try {
          const resultMessage = toolResult.error
            ? `Action failed: ${toolResult.error}`
            : `Action completed: ${toolName}`;
          await saveMessage(sessionId, auth.user.id, "assistant", resultMessage, {
            structured: null,
            agent: agentType,
          });
        } catch (e) { console.error("[chat-agent] Save capsule message failed:", e); }
      }

      // Route through orchestrate with a result summary that won't re-trigger intents
      // Prefix with [CAPSULE_RESULT] so intent matcher can skip it
      const resultSummary = toolResult.error
        ? `[CAPSULE_RESULT] The action "${toolName}" failed: ${toolResult.error}. Let the player know what went wrong.`
        : `[CAPSULE_RESULT] The action "${toolName}" succeeded. Result: ${JSON.stringify(toolResult.result)}. Confirm the result to the player with a brief, encouraging response and suggest next steps.`;

      // Try AI-powered response, fall back to deterministic if Claude is unavailable
      let capsuleResult: { message: string; structured?: any; agentType?: string; refreshTargets?: string[] };
      try {
        capsuleResult = await orchestrate(
          resultSummary,
          context,
          undefined,
          conversationHistory,
          agentType,
          agentType,
          conversationState
        );
      } catch (orchErr) {
        console.warn("[chat-agent] Orchestrate failed for capsule, using deterministic fallback:", orchErr);
        // Deterministic fallback — no AI needed
        if (toolResult.error) {
          capsuleResult = { message: `❌ ${toolResult.error}`, agentType };
        } else {
          const friendlyName = toolName.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
          capsuleResult = { message: `✅ ${friendlyName} — done!`, agentType };
        }
      }

      if (sessionId) {
        try {
          await saveMessage(sessionId, auth.user.id, "assistant", capsuleResult.message, {
            structured: capsuleResult.structured ?? null,
            agent: capsuleResult.agentType ?? agentType,
          });

          const newConversationState = extractConversationState(
            body.message,
            capsuleResult.message,
            conversationState,
            context.todayDate,
            context.timezone,
            capsuleResult.structured
          );

          await updateSessionState(sessionId, {
            activeAgent: capsuleResult.agentType ?? agentType,
            conversationState: newConversationState,
          });
        } catch (e) { console.error("[chat-agent] Save capsule response failed:", e); }
      }

      return NextResponse.json(
        {
          message: capsuleResult.message,
          structured: capsuleResult.structured ?? null,
          sessionId,
          refreshTargets: [...refreshTargets, ...(capsuleResult.refreshTargets ?? [])],
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

    // ── Entity Resolution — resolve pronouns ("that drill", "it") to entities ──
    let enrichedMessage = body.message;
    if (conversationState?.entityGraph) {
      const resolved = resolveEntityReference(body.message, conversationState.entityGraph);
      if (resolved) {
        enrichedMessage = `${body.message} [context: "${resolved.type}" refers to "${resolved.value}"${resolved.id ? ` (id: ${resolved.id})` : ''}]`;
      }
    }

    // Detect SSE streaming request
    const wantsStream = req.nextUrl.searchParams.get("stream") === "true";

    // ── Helper: save result to session after orchestration completes ──
    const saveResultToSession = async (result: Awaited<ReturnType<typeof orchestrate>>) => {
      if (!sessionId) return;
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
          body.message,
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

        const fullHistory = [
          ...conversationHistory,
          { role: "user" as const, content: body.message },
          { role: "assistant" as const, content: result.message },
        ];
        updateAthleteMemory(auth.user.id, fullHistory).catch((e) =>
          console.warn("[Memory] Background update failed:", e)
        );
      } catch (saveErr) {
        console.warn("[chat] Failed to save response:", saveErr instanceof Error ? saveErr.message : saveErr);
      }
    };

    // ── AI Service proxy — shadow mode + percentage-based cutover ──
    const aiServiceMode = getAIServiceMode();
    const aiRequest: AIServiceRequest = {
      message: body.message,
      session_id: sessionId,
      player_id: auth.user.id,
      active_tab: body.activeTab ?? "Chat",
      timezone: body.timezone ?? "UTC",
      confirmed_action: body.confirmedAction ?? null,
    };

    // ── STREAMING PATH — SSE response ──────────────────────────────
    if (wantsStream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            // Full proxy: Python handles everything
            if (aiServiceMode === "true" && shouldUsePythonService()) {
              controller.enqueue(encoder.encode(formatSSE("status", { status: "Thinking..." })));
              for await (const sse of proxyToAIServiceStream(aiRequest, (s) => {
                controller.enqueue(encoder.encode(formatSSE("status", { status: s })));
              })) {
                controller.enqueue(encoder.encode(formatSSE(sse.event, sse.data)));
              }
              controller.close();
              return;
            }

            // Shadow: fire-and-forget to Python, TS serves
            if (aiServiceMode === "shadow" || aiServiceMode === "true") {
              shadowProxyToAIService(aiRequest);
            }

            // Emit initial status while context is ready
            controller.enqueue(encoder.encode(formatSSE("status", { status: "Thinking..." })));

            const streamCallbacks: StreamCallbacks = {
              onDelta: (text) => {
                controller.enqueue(encoder.encode(formatSSE("delta", { text })));
              },
              onStatus: (status) => {
                controller.enqueue(encoder.encode(formatSSE("status", { status })));
              },
            };

            const result = await orchestrate(
              enrichedMessage,
              context,
              body.confirmedAction,
              conversationHistory,
              lastAgentType,
              activeAgent,
              conversationState,
              streamCallbacks
            );

            // Save to session (fire-and-forget within stream)
            saveResultToSession(result).catch(() => {});

            // Send final structured result
            const debugMode = req.headers.get("x-tomo-debug") === "true";
            controller.enqueue(encoder.encode(formatSSE("done", {
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
            })));

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
          "Connection": "keep-alive",
          "api-version": "v1",
        },
      });
    }

    // ── NON-STREAMING PATH — JSON response ──────────────────────────

    // Full proxy: Python handles everything
    if (aiServiceMode === "true" && shouldUsePythonService()) {
      const pyResult = await proxyToAIServiceSync(aiRequest);
      return NextResponse.json(pyResult);
    }

    // Shadow: fire-and-forget to Python, TS serves
    if (aiServiceMode === "shadow" || aiServiceMode === "true") {
      shadowProxyToAIService(aiRequest);
    }

    const result = await orchestrate(
      enrichedMessage,
      context,
      body.confirmedAction,
      conversationHistory,
      lastAgentType,
      activeAgent,
      conversationState
    );

    await saveResultToSession(result);

    const debugMode = req.headers.get("x-tomo-debug") === "true";
    return NextResponse.json(
      {
        message: result.message,
        structured: result.structured ?? null,
        sessionId: sessionId,
        refreshTargets: result.refreshTargets,
        pendingConfirmation: result.pendingConfirmation ?? null,
        context: {
          ageBand: context.ageBand,
          readinessScore: context.readinessScore,
          activeTab: context.activeTab,
        },
        ...(debugMode && result._eval ? { _eval: result._eval } : {}),
      },
      { headers: { "api-version": "v1" } }
    );
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Agent chat error";
    logger.error("Agent chat route error", { error: err instanceof Error ? err.message : String(err), userId: auth.user.id });
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
