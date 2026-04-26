import { Platform } from "react-native";
import { Sentry } from "./sentry";
import { API_BASE_URL } from "./apiConfig";
import { getIdToken } from "./auth";
import { getCurrentTraceId } from "./observability";

export interface MobileErrorContext {
  screen?: string;
  feature?: string;
  endpoint?: string;
  traceId?: string;
  metadata?: Record<string, unknown>;
}

export function captureError(error: unknown, context: MobileErrorContext = {}): void {
  const traceId = context.traceId || getCurrentTraceId() || "unknown";

  Sentry.withScope((scope) => {
    scope.setTag("trace_id", traceId);
    scope.setTag("screen", context.screen ?? "unknown");
    scope.setTag("feature", context.feature ?? "unknown");
    scope.setContext("mobile_error", {
      endpoint: context.endpoint ?? null,
      platform: Platform.OS,
      ...context.metadata,
    });
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
  });

  void reportErrorToBackend(error, traceId, context).catch(() => undefined);
}

async function reportErrorToBackend(
  error: unknown,
  traceId: string,
  context: MobileErrorContext
): Promise<void> {
  const token = await getIdToken();
  if (!token) return;

  const payload = {
    message:
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "Mobile error",
    endpoint: context.endpoint ?? null,
    screen: context.screen ?? null,
    feature: context.feature ?? null,
    platform: Platform.OS,
    metadata: context.metadata ?? {},
  };

  await fetch(`${API_BASE_URL}/api/v1/errors/report`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "x-trace-id": traceId,
    },
    body: JSON.stringify(payload),
  });
}
