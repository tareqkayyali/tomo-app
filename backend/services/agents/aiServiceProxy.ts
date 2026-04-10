/**
 * AI Service Proxy — forwards non-capsule AI requests to the Python AI microservice.
 *
 * Feature flag: AI_SERVICE_ENABLED
 *   - "false" (default) → all AI traffic uses TypeScript orchestrator
 *   - "shadow" → both TS + Python run; TS serves response, Python logged to LangSmith
 *   - "true" → Python serves response; TS orchestrator bypassed
 *
 * Internal networking: Uses Railway private networking (<5ms latency)
 *   - Production: http://tomo-ai.railway.internal:8000
 *   - Local dev:  http://localhost:8000
 */

import { logger } from "@/lib/logger";

// ── Types ────────────────────────────────────────────────────────

export interface AIServiceRequest {
  message: string;
  session_id: string | null;
  player_id: string;
  active_tab: string;
  timezone: string;
  confirmed_action?: {
    toolName: string;
    toolInput: Record<string, any>;
    agentType: string;
    actions?: Array<{
      toolName: string;
      toolInput: Record<string, any>;
      agentType: string;
      preview: string;
    }>;
  } | null;
}

export interface AIServiceResponse {
  message: string;
  structured: any | null;
  sessionId: string;
  refreshTargets: string[];
  pendingConfirmation: any | null;
}

type AIServiceMode = "false" | "shadow" | "true";

// ── Config ───────────────────────────────────────────────────────

function getAIServiceUrl(): string {
  return (
    process.env.AI_SERVICE_URL ||
    (process.env.RAILWAY_ENVIRONMENT
      ? "http://tomo-ai.railway.internal:8000"
      : "http://localhost:8000")
  );
}

export function getAIServiceMode(): AIServiceMode {
  const mode = (process.env.AI_SERVICE_ENABLED || "false").toLowerCase();
  if (mode === "true" || mode === "shadow") return mode;
  return "false";
}

// ── SSE Stream Proxy ─────────────────────────────────────────────

/**
 * Proxy a chat request to the Python AI service via SSE streaming.
 * Returns an async generator that yields SSE event strings in the same
 * format the mobile app expects: event: status/done/error.
 *
 * Used by agent-stream route when AI_SERVICE_ENABLED=true.
 */
export async function* proxyToAIServiceStream(
  request: AIServiceRequest,
  onStatus?: (status: string) => void
): AsyncGenerator<{ event: string; data: any }> {
  const url = `${getAIServiceUrl()}/api/v1/chat`;
  const t0 = Date.now();

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      logger.error("[ai-proxy] Python service error", {
        status: response.status,
        error: errorText,
      });
      yield {
        event: "error",
        data: { error: `AI service error: ${response.status}` },
      };
      return;
    }

    if (!response.body) {
      yield { event: "error", data: { error: "No response body from AI service" } };
      return;
    }

    // Parse SSE stream from Python service
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep incomplete line in buffer

      let currentEvent = "";
      let currentData = "";

      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          currentData = line.slice(6);
        } else if (line === "" && currentEvent && currentData) {
          // Empty line = end of SSE message
          try {
            const parsed = JSON.parse(currentData);

            if (currentEvent === "status" && onStatus) {
              onStatus(parsed.status);
            }

            yield { event: currentEvent, data: parsed };
          } catch (parseErr) {
            logger.warn("[ai-proxy] Failed to parse SSE data", {
              event: currentEvent,
              data: currentData,
            });
          }
          currentEvent = "";
          currentData = "";
        }
      }
    }

    const elapsed = Date.now() - t0;
    logger.info("[ai-proxy] Stream complete", { elapsed_ms: elapsed });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Proxy connection failed";
    logger.error("[ai-proxy] Connection error", { error: errorMsg, url });
    yield { event: "error", data: { error: errorMsg } };
  }
}

// ── Sync Proxy ───────────────────────────────────────────────────

/**
 * Proxy a chat request to the Python AI service synchronously.
 * Returns the full response as JSON (no SSE).
 *
 * Used by /chat/agent route (non-streaming path) when AI_SERVICE_ENABLED=true.
 */
export async function proxyToAIServiceSync(
  request: AIServiceRequest
): Promise<AIServiceResponse> {
  const url = `${getAIServiceUrl()}/api/v1/chat/sync`;
  const t0 = Date.now();

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      logger.error("[ai-proxy] Sync error", {
        status: response.status,
        error: errorText,
      });
      throw new Error(`AI service returned ${response.status}`);
    }

    const data = await response.json();
    const elapsed = Date.now() - t0;
    logger.info("[ai-proxy] Sync complete", { elapsed_ms: elapsed });

    return {
      message: data.message,
      structured: data.structured ?? null,
      sessionId: data.session_id || data.sessionId,
      refreshTargets: data.refresh_targets || data.refreshTargets || [],
      pendingConfirmation:
        data.pending_confirmation || data.pendingConfirmation || null,
    };
  } catch (err) {
    const errorMsg =
      err instanceof Error ? err.message : "Proxy connection failed";
    logger.error("[ai-proxy] Sync connection error", { error: errorMsg });
    throw new Error(errorMsg);
  }
}

// ── Shadow Mode ──────────────────────────────────────────────────

/**
 * Fire-and-forget request to Python service for shadow mode comparison.
 * Does NOT affect the user-facing response — purely for LangSmith logging.
 */
export function shadowProxyToAIService(request: AIServiceRequest): void {
  const url = `${getAIServiceUrl()}/api/v1/chat/sync`;

  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  })
    .then((res) => {
      if (!res.ok) {
        logger.warn("[ai-proxy:shadow] Python returned non-OK", {
          status: res.status,
        });
      } else {
        logger.info("[ai-proxy:shadow] Shadow request completed");
      }
    })
    .catch((err) => {
      logger.warn("[ai-proxy:shadow] Shadow request failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
}

// ── Health Check ─────────────────────────────────────────────────

/**
 * Check if the Python AI service is reachable.
 * Used by the TypeScript health endpoint to report AI service status.
 */
export async function checkAIServiceHealth(): Promise<{
  healthy: boolean;
  latency_ms?: number;
  error?: string;
}> {
  const url = `${getAIServiceUrl()}/health`;
  const t0 = Date.now();

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });

    const latency = Date.now() - t0;

    if (response.ok) {
      return { healthy: true, latency_ms: latency };
    }

    return {
      healthy: false,
      latency_ms: latency,
      error: `Status ${response.status}`,
    };
  } catch (err) {
    return {
      healthy: false,
      error: err instanceof Error ? err.message : "Unreachable",
    };
  }
}
