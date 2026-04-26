import * as Sentry from "@sentry/nextjs";
import { logger } from "@/lib/logger";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { buildErrorEvent, type ErrorContext } from "@/lib/observability/event";

const WRITE_TIMEOUT_MS = 500;

function insertAppError(event: ReturnType<typeof buildErrorEvent>): Promise<void> {
  const db = supabaseAdmin() as any;
  return db.from("app_errors").insert(event).then(() => undefined);
}

export async function captureError(error: unknown, context: ErrorContext): Promise<void> {
  const event = buildErrorEvent(error, context);

  logger.error("[error-tracker] captured", {
    trace_id: event.trace_id,
    request_id: event.request_id,
    error_code: event.error_code,
    error_type: event.error_type,
    severity: event.severity,
    endpoint: event.endpoint,
    sampled: event.sampled,
  });

  if (event.sampled) {
    Sentry.withScope((scope) => {
      scope.setTag("trace_id", event.trace_id ?? "unknown");
      scope.setTag("request_id", event.request_id ?? "unknown");
      scope.setTag("error_code", event.error_code);
      scope.setTag("severity", event.severity);
      scope.setContext("observability", {
        endpoint: event.endpoint,
        layer: event.layer,
        fingerprint: event.fingerprint,
      });
      Sentry.captureException(error instanceof Error ? error : new Error(event.message));
    });
  }

  if (event.severity === "info" && !event.sampled) {
    return;
  }

  if (event.severity === "critical" || event.severity === "high") {
    await Promise.race([
      insertAppError(event),
      new Promise<void>((resolve) => setTimeout(resolve, WRITE_TIMEOUT_MS)),
    ]).catch(() => undefined);
    return;
  }

  void insertAppError(event).catch(() => undefined);
}
