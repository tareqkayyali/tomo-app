import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";

function getAIServiceUrl(): string {
  if (process.env.AI_SERVICE_URL) return process.env.AI_SERVICE_URL;
  if (process.env.RAILWAY_ENVIRONMENT) return "http://tomo-ai.railway.internal:8000";
  return "http://localhost:8000";
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ fixId: string }> }
) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const { fixId } = await params;

  try {
    const body = await req.json();
    const res = await fetch(
      `${getAIServiceUrl()}/admin/ai-health/fixes/${fixId}/status`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Service-Key": process.env.TS_BACKEND_SERVICE_KEY ?? "",
        },
        body: JSON.stringify(body),
      }
    );
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      { error: "AI service unavailable", detail: String(err) },
      { status: 503 }
    );
  }
}
