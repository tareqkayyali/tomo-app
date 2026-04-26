import { ErrorCode, type ErrorCodeValue } from "./error-codes";
import {
  ERROR_CODE_SEVERITY,
  buildFingerprint,
  type ErrorSeverity,
  TomoError,
} from "./error-taxonomy";
import { redactMessage, redactMetadata, redactStack } from "./redaction";

export interface ErrorContext {
  traceId?: string | null;
  requestId?: string | null;
  correlationId?: string | null;
  userId?: string | null;
  sessionId?: string | null;
  endpoint?: string | null;
  httpStatus?: number | null;
  layer: "mobile" | "backend" | "python";
  environment?: string | null;
  appVersion?: string | null;
  platform?: string | null;
  osVersion?: string | null;
  metadata?: Record<string, unknown>;
  errorCode?: ErrorCodeValue;
  severity?: ErrorSeverity;
}

export interface ErrorEvent {
  trace_id: string | null;
  request_id: string | null;
  correlation_id: string | null;
  layer: "mobile" | "backend" | "python";
  error_code: string;
  error_type: string;
  message: string;
  stack_trace: string;
  fingerprint: string;
  user_id: string | null;
  session_id: string | null;
  endpoint: string | null;
  http_status: number | null;
  severity: ErrorSeverity;
  sampled: boolean;
  environment: string;
  app_version: string | null;
  platform: string | null;
  os_version: string | null;
  metadata: Record<string, unknown>;
}

const MAX_METADATA_JSON_BYTES = 8 * 1024;

function shouldCountSample(severity: ErrorSeverity): boolean {
  const random = Math.random();
  if (severity === "critical") return true;
  if (severity === "high") return random <= 0.5;
  if (severity === "medium") return random <= 0.1;
  if (severity === "low") return random <= 0.05;
  return false;
}

function defaultErrorCode(layer: ErrorContext["layer"]): ErrorCodeValue {
  if (layer === "mobile") return ErrorCode.MOB.SYSTEM.UNHANDLED;
  if (layer === "python") return ErrorCode.PY.SYSTEM.INTERNAL;
  return ErrorCode.BE.SYSTEM.INTERNAL;
}

function clampMetadataSize(
  metadata: Record<string, unknown>
): Record<string, unknown> {
  try {
    const serialized = JSON.stringify(metadata);
    if (serialized.length <= MAX_METADATA_JSON_BYTES) return metadata;
    return {
      _truncated: true,
      _reason: "metadata_too_large",
      _max_bytes: MAX_METADATA_JSON_BYTES,
    };
  } catch {
    return {
      _truncated: true,
      _reason: "metadata_serialization_failed",
      _max_bytes: MAX_METADATA_JSON_BYTES,
    };
  }
}

export function buildErrorEvent(error: unknown, context: ErrorContext): ErrorEvent {
  const endpoint = context.endpoint || "unknown";
  const err = error instanceof Error ? error : new Error(String(error));
  const stack = err.stack || "";
  const stackTop = stack.split("\n")[1] || "no-stack";
  const resolvedCode =
    context.errorCode ??
    (error instanceof TomoError ? error.errorCode : defaultErrorCode(context.layer));
  const resolvedSeverity =
    context.severity ??
    (error instanceof TomoError
      ? error.severity
      : ERROR_CODE_SEVERITY[resolvedCode] ?? "medium");

  const sampled = shouldCountSample(resolvedSeverity);
  const redactedMessage = redactMessage(err.message || "Unknown error");
  const redactedStack = redactStack(stack);
  const metadata = clampMetadataSize(redactMetadata(context.metadata ?? {}));

  return {
    trace_id: context.traceId ?? null,
    request_id: context.requestId ?? null,
    correlation_id: context.correlationId ?? context.traceId ?? null,
    layer: context.layer,
    error_code: resolvedCode,
    error_type: err.name || "Error",
    message: redactedMessage,
    stack_trace: redactedStack,
    fingerprint: buildFingerprint(err.name || "Error", endpoint, stackTop),
    user_id: context.userId ?? null,
    session_id: context.sessionId ?? null,
    endpoint: context.endpoint ?? null,
    http_status: context.httpStatus ?? null,
    severity: resolvedSeverity,
    sampled,
    environment: context.environment || process.env.NODE_ENV || "production",
    app_version: context.appVersion ?? null,
    platform: context.platform ?? null,
    os_version: context.osVersion ?? null,
    metadata,
  };
}
