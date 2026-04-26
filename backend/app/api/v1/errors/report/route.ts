import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { captureError } from "@/lib/errorTracker";
import { ObservabilityHeaders } from "@/lib/observability/ids";
import { ErrorCode } from "@/lib/observability/error-codes";

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 32 * 1024) {
    return NextResponse.json({ accepted: true }, { status: 202 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ accepted: true }, { status: 202 });
  }

  const traceId = req.headers.get(ObservabilityHeaders.traceId);
  const requestId = req.headers.get(ObservabilityHeaders.requestId);
  const endpoint =
    typeof body.endpoint === "string" ? body.endpoint : "mobile:unknown";
  const message =
    typeof body.message === "string" && body.message.trim().length > 0
      ? body.message
      : "Mobile client error";
  const error = new Error(message);

  void captureError(error, {
    layer: "mobile",
    traceId,
    requestId,
    endpoint,
    userId: auth.user.id,
    sessionId:
      typeof body.sessionId === "string" ? body.sessionId : undefined,
    platform:
      typeof body.platform === "string" ? body.platform : undefined,
    appVersion:
      typeof body.appVersion === "string" ? body.appVersion : undefined,
    metadata: body,
    errorCode: ErrorCode.MOB.SYSTEM.UNHANDLED,
  });

  return NextResponse.json({ accepted: true }, { status: 202 });
}
