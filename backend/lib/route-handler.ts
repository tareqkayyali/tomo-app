import { NextRequest, NextResponse } from "next/server";
import { captureError } from "@/lib/errorTracker";
import { ErrorCode, type ErrorCodeValue } from "@/lib/observability/error-codes";
import { ObservabilityHeaders } from "@/lib/observability/ids";

export type RouteHandler = (req: NextRequest) => Promise<NextResponse | Response>;

interface WrapOptions {
  endpoint: string;
  layer?: "mobile" | "backend" | "python";
  errorCode?: ErrorCodeValue;
}

export function withErrorTracking(
  handler: RouteHandler,
  options: WrapOptions
): RouteHandler {
  return async (req: NextRequest) => {
    try {
      return await handler(req);
    } catch (error) {
      const traceId = req.headers.get(ObservabilityHeaders.traceId);
      const requestId = req.headers.get(ObservabilityHeaders.requestId);
      const errorCode = options.errorCode ?? ErrorCode.BE.API.UNHANDLED;
      await captureError(error, {
        layer: options.layer ?? "backend",
        endpoint: options.endpoint,
        traceId,
        requestId,
        errorCode,
      });

      return NextResponse.json(
        {
          error: "Internal server error",
          error_code: errorCode,
          trace_id: traceId,
        },
        { status: 500 }
      );
    }
  };
}
