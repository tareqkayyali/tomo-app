import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";

function getAIServiceUrl(): string {
  if (process.env.AI_SERVICE_URL) return process.env.AI_SERVICE_URL;
  if (process.env.RAILWAY_ENVIRONMENT) return "http://tomo-ai.railway.internal:8000";
  return "http://localhost:8000";
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const res = await fetch(`${getAIServiceUrl()}/admin/ai-health/insights`, {
      headers: {
        "X-Service-Key": process.env.TS_BACKEND_SERVICE_KEY ?? "",
      },
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      { error: "AI service unavailable", detail: String(err) },
      { status: 503 }
    );
  }
}
