import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Global unhandled-exception hook — fires for every route that throws without catching.
// Covers all 357+ routes automatically: Sentry + app_errors, no per-route wiring needed.
export async function onRequestError(
  error: { digest: string } & Error,
  request: { path: string; method: string; headers: Record<string, string> },
  context: unknown
): Promise<void> {
  // 1. Sentry — existing crash intelligence
  Sentry.captureRequestError(error, request, context);

  // 2. app_errors — unified cross-service sink for admin dashboard + spike detection
  try {
    const { captureError } = await import("./lib/errorTracker");
    const { ErrorCode } = await import("./lib/observability/error-codes");
    await captureError(error, {
      endpoint: request.path,
      traceId: request.headers["x-trace-id"] ?? null,
      requestId: request.headers["x-request-id"] ?? null,
      severity: "high",
      errorCode: ErrorCode.BE.API.UNHANDLED,
      metadata: { method: request.method },
    });
  } catch {
    // never block — if captureError itself fails, Sentry above already has it
  }
}
