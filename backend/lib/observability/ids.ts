import { randomUUID } from "node:crypto";

const TRACE_HEADER = "x-trace-id";
const REQUEST_HEADER = "x-request-id";

export function generateTraceId(): string {
  return randomUUID();
}

export function generateRequestId(): string {
  return randomUUID();
}

export function extractOrGenerateTraceId(headers: Headers): string {
  return headers.get(TRACE_HEADER) || generateTraceId();
}

export function extractOrGenerateRequestId(headers: Headers): string {
  return headers.get(REQUEST_HEADER) || generateRequestId();
}

export const ObservabilityHeaders = {
  traceId: TRACE_HEADER,
  requestId: REQUEST_HEADER,
} as const;
