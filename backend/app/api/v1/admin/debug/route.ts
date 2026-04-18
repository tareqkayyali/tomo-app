/**
 * Admin Debug API — proxies to Python AI service debug endpoints.
 *
 * GET /api/v1/admin/debug?type=errors   — Recent errors from ai_debug_errors
 * GET /api/v1/admin/debug?type=requests — Recent requests from ai_debug_requests
 *
 * Reads directly from Supabase via the Python service, which gives cross-instance
 * visibility that the old in-memory buffer couldn't provide.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireEnterprise } from "@/lib/admin/enterpriseAuth";

function getAIServiceUrl(): string {
  if (process.env.AI_SERVICE_URL) return process.env.AI_SERVICE_URL;
  if (process.env.RAILWAY_ENVIRONMENT) return "http://tomo-ai.railway.internal:8000";
  return "http://localhost:8000";
}

export async function GET(req: NextRequest) {
  const auth = await requireEnterprise(req, "super_admin");
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") ?? "errors";
  const limit = searchParams.get("limit") ?? "50";
  const userId = searchParams.get("user_id") ?? "";
  const severity = searchParams.get("severity") ?? "";
  const node = searchParams.get("node") ?? "";
  const status = searchParams.get("status") ?? "";
  const hours = searchParams.get("hours") ?? "24";

  const aiUrl = getAIServiceUrl();

  try {
    let endpoint: string;
    const params = new URLSearchParams({ limit, hours });

    if (type === "requests") {
      endpoint = "/health/requests";
      if (userId) params.set("user_id", userId);
      if (status) params.set("status", status);
    } else {
      endpoint = "/health/errors";
      if (userId) params.set("user_id", userId);
      if (severity) params.set("severity", severity);
      if (node) params.set("node", node);
    }

    const res = await fetch(`${aiUrl}${endpoint}?${params}`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `AI service returned ${res.status}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: "AI service unavailable", detail: String(err) },
      { status: 503 }
    );
  }
}
