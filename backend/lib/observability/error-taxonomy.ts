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

/**
 * Stable 16-char hex fingerprint of `{errorType}|{endpoint}|{stackTop}`.
 *
 * Used as a deduplication key in error logs / monitoring. Not a security
 * primitive — the input is non-secret error metadata and the output is
 * stored in plain JSONB.
 *
 * Implementation: FNV-1a 64-bit over the UTF-8 bytes of the input. Pure
 * JS (BigInt arithmetic + TextEncoder), deterministic, and runs identically
 * in Node and Edge runtimes — so this can be imported from
 * `instrumentation.ts` (Edge) without triggering Next.js's
 * "node:crypto not supported in Edge" warning.
 *
 * Note: this changed from sha256.slice(0, 16) on 2026-04-27. Existing error
 * groups in monitoring will be re-bucketed once after deploy.
 */
export function buildFingerprint(
  errorType: string,
  endpoint: string,
  stackTop: string
): string {
  return fnv1a64Hex(`${errorType}|${endpoint}|${stackTop}`);
}

// BigInt() constructors (not literals) so this compiles at the project's
// ES2017 target — the runtime BigInt support is available anywhere TextEncoder
// is, i.e. modern Node + Edge runtimes.
const _FNV_OFFSET_64 = BigInt("0xcbf29ce484222325");
const _FNV_PRIME_64 = BigInt("0x100000001b3");
const _U64_MASK = BigInt("0xffffffffffffffff");

function fnv1a64Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let hash = _FNV_OFFSET_64;
  for (let i = 0; i < bytes.length; i++) {
    hash = (hash ^ BigInt(bytes[i])) & _U64_MASK;
    hash = (hash * _FNV_PRIME_64) & _U64_MASK;
  }
  return hash.toString(16).padStart(16, "0");
}

