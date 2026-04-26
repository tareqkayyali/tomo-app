import { createHash } from "node:crypto";
import { ErrorCode, type ErrorCodeValue } from "./error-codes";

export type ErrorSeverity = "critical" | "high" | "medium" | "low" | "info";

export const ERROR_CODE_SEVERITY: Partial<Record<ErrorCodeValue, ErrorSeverity>> = {
  [ErrorCode.BE.SAFETY.PHV_VIOLATION]: "critical",
  [ErrorCode.PY.SAFETY.PHV_FILTER_FAILED]: "critical",
  [ErrorCode.BE.AI.SERVICE_UNREACHABLE]: "high",
  [ErrorCode.BE.AI.SERVICE_TIMEOUT]: "high",
  [ErrorCode.PY.CHAT.SUPERVISOR_CRASH]: "high",
  [ErrorCode.PY.CHAT.STREAM_FAILED]: "high",
  [ErrorCode.BE.API.BAD_REQUEST]: "low",
  [ErrorCode.BE.API.UNHANDLED]: "medium",
  [ErrorCode.BE.SYSTEM.INTERNAL]: "medium",
};

export interface TomoErrorOptions {
  errorCode: ErrorCodeValue;
  severity?: ErrorSeverity;
  isRetryable?: boolean;
  metadata?: Record<string, unknown>;
  endpoint?: string;
}

export class TomoError extends Error {
  readonly errorCode: ErrorCodeValue;
  readonly severity: ErrorSeverity;
  readonly isRetryable: boolean;
  readonly fingerprint: string;
  readonly metadata: Record<string, unknown>;

  constructor(message: string, options: TomoErrorOptions) {
    super(message);
    this.name = "TomoError";
    this.errorCode = options.errorCode;
    this.severity =
      options.severity ?? ERROR_CODE_SEVERITY[options.errorCode] ?? "medium";
    this.isRetryable = options.isRetryable ?? false;
    this.metadata = options.metadata ?? {};
    this.fingerprint = buildFingerprint(
      this.name,
      options.endpoint ?? "unknown",
      this.stack?.split("\n")[1] ?? "no-stack"
    );
  }
}

export class AuthError extends TomoError {
  constructor(message: string, options: Omit<TomoErrorOptions, "errorCode">) {
    super(message, { ...options, errorCode: ErrorCode.BE.AUTH.UNAUTHORIZED, severity: "low" });
    this.name = "AuthError";
  }
}

export class AiServiceError extends TomoError {
  constructor(message: string, options: Omit<TomoErrorOptions, "errorCode"> = {}) {
    super(message, { ...options, errorCode: ErrorCode.BE.AI.SERVICE_FAILED, severity: "high" });
    this.name = "AiServiceError";
  }
}

export class SafetyError extends TomoError {
  constructor(message: string, options: Omit<TomoErrorOptions, "errorCode"> = {}) {
    super(message, { ...options, errorCode: ErrorCode.BE.SAFETY.PHV_VIOLATION, severity: "critical" });
    this.name = "SafetyError";
  }
}

export class ApiError extends TomoError {
  constructor(message: string, options: Omit<TomoErrorOptions, "errorCode"> = {}) {
    super(message, { ...options, errorCode: ErrorCode.BE.API.UNHANDLED });
    this.name = "ApiError";
  }
}

export class DbError extends TomoError {
  constructor(message: string, options: Omit<TomoErrorOptions, "errorCode"> = {}) {
    super(message, { ...options, errorCode: ErrorCode.BE.DB.QUERY_FAILED });
    this.name = "DbError";
  }
}

export function buildFingerprint(
  errorType: string,
  endpoint: string,
  stackTop: string
): string {
  const raw = `${errorType}|${endpoint}|${stackTop}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

