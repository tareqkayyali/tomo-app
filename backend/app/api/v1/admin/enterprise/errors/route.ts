import { NextRequest, NextResponse } from "next/server";
import { requireEnterprise } from "@/lib/admin/enterpriseAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

export async function GET(req: NextRequest) {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth.error;

  const db = supabaseAdmin() as any;
  const params = req.nextUrl.searchParams;
  const layer = params.get("layer");
  const severity = params.get("severity");
  const errorCode = params.get("error_code");
  const fingerprint = params.get("fingerprint");
  const traceId = params.get("trace_id");
  const requestId = params.get("request_id");
  const userId = params.get("user_id");
  const hours = clamp(parseInt(params.get("hours") ?? "24", 10) || 24, 1, 720);
  const limit = clamp(parseInt(params.get("limit") ?? "50", 10) || 50, 1, 200);
  const offset = Math.max(parseInt(params.get("offset") ?? "0", 10) || 0, 0);

  const sinceIso = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  let query = db
    .from("app_errors")
    .select("*", { count: "exact" })
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (layer) query = query.eq("layer", layer);
  if (severity) query = query.eq("severity", severity);
  if (errorCode) query = query.ilike("error_code", `${errorCode}%`);
  if (fingerprint) query = query.eq("fingerprint", fingerprint);
  if (traceId) query = query.eq("trace_id", traceId);
  if (requestId) query = query.eq("request_id", requestId);
  if (userId) query = query.eq("user_id", userId);

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json(
      { error: "Failed to load app errors", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    errors: data ?? [],
    total: count ?? 0,
    limit,
    offset,
  });
}
