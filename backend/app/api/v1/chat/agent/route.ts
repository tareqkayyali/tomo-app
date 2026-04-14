/**
 * POST /api/v1/chat/agent
 *
 * Chat endpoint — proxies ALL traffic to the Python AI service.
 * Capsule actions are forwarded to Python as confirmed_action (v2 single write path).
 * Post-response safety filters (PHV, RED risk) still run in TS as the last safety net.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";
import { logger } from "@/lib/logger";
import {
  enforceRedRiskSafety,
  enforcePHVSafety,
  enforceNoDeadEnds,
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

  // Pre-flight guardrails REMOVED — will be CMS-configurable.
  // PHV safety is enforced downstream in Python validate_node + TS enforcePHVSafety.

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

    // ── CAPSULE ACTION → Python AI service (v2: single write path) ──
    // Forwarded to Python as confirmed_action for unified safety + audit pipeline.
    if (body.capsuleAction) {
      console.log(`[capsule→python] Forwarding ${body.capsuleAction.toolName} to AI service`);
      // Normalize shape: strip capsule-specific 'type' field, keep only confirmedAction fields
      const { toolName, toolInput, agentType } = body.capsuleAction;
      body.confirmedAction = { toolName, toolInput, agentType };
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
    // NOTE: Streaming responses bypass TS post-response safety filters.
    // Python's inline safety gates (pre_router RED risk, validate node PHV) cover streaming.
    const wantsStream = req.nextUrl.searchParams.get("stream") === "true";

    if (wantsStream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            controller.enqueue(encoder.encode(formatSSE("status", { status: "Thinking..." })));

            // S4 FIX: Accumulate response text during streaming for post-filter
            let accumulatedMessage = "";

            for await (const sse of proxyToAIServiceStream(aiRequest, (s) => {
              controller.enqueue(encoder.encode(formatSSE("status", { status: s })));
            })) {
              controller.enqueue(encoder.encode(formatSSE(sse.event, sse.data)));

              // Accumulate the done event for safety post-check
              if (sse.event === "done" && sse.data?.message) {
                accumulatedMessage += sse.data.message;
              }
            }

            // S4: Post-stream safety filter — check accumulated response
            if (accumulatedMessage) {
              try {
                const { supabaseAdmin } = await import("@/lib/supabase/admin");
                const db = supabaseAdmin();
                const { data: snap } = await (db as any)
                  .from("athlete_snapshots")
                  .select("injury_risk_flag, acwr, phv_stage")
                  .eq("athlete_id", auth.user.id)
                  .maybeSingle();

                if (snap) {
                  const corrections: string[] = [];

                  const redCheck = enforceRedRiskSafety(accumulatedMessage, snap.injury_risk_flag, snap.acwr);
                  if (redCheck.flagged) corrections.push("red_risk_violation");

                  const phvCheck = await enforcePHVSafety(accumulatedMessage, snap.phv_stage);
                  if (phvCheck.flagged) corrections.push("phv_safety_violation");

                  if (corrections.length > 0) {
                    console.warn(`[SAFETY-TS] Stream post-filter: ${corrections.join(", ")}`);
                    const correctedMessage = phvCheck.flagged ? phvCheck.sanitized : redCheck.sanitized;
                    controller.enqueue(encoder.encode(formatSSE("safety_correction", {
                      corrected_message: correctedMessage,
                      violations: corrections,
                    })));
                  }
                }
              } catch (safetyErr) {
                console.warn("[chat] Stream post-filter safety check failed:", safetyErr);
              }
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

    // ── POST-RESPONSE SAFETY FILTERS (defense-in-depth) ──────────
    // Python has its own safety gates, but these catch anything that slips through.
    if (pyResult.message && typeof pyResult.message === "string") {
      try {
        const { supabaseAdmin } = await import("@/lib/supabase/admin");
        const db = supabaseAdmin();
        const { data: snap } = await (db as any)
          .from("athlete_snapshots")
          .select("injury_risk_flag, acwr, phv_stage")
          .eq("athlete_id", auth.user.id)
          .maybeSingle();

        if (snap) {
          const redCheck = enforceRedRiskSafety(
            pyResult.message,
            snap.injury_risk_flag,
            snap.acwr
          );
          if (redCheck.flagged) {
            pyResult.message = redCheck.sanitized;
          }

          const phvCheck = await enforcePHVSafety(
            pyResult.message,
            snap.phv_stage
          );
          if (phvCheck.flagged) {
            pyResult.message = phvCheck.sanitized;
          }
        }
      } catch (safetyErr) {
        // Safety filter failure must never block the response
        console.warn("[chat] Post-response safety filter failed:", safetyErr);
      }

      pyResult.message = enforceNoDeadEnds(pyResult.message);
    }

    return NextResponse.json(pyResult);
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Agent chat error";
    logger.error("Agent chat route error", { error: err instanceof Error ? err.message : String(err), userId: auth.user.id });
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
