import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// GET /api/v1/admin/ai-health/prompt-logs
//   ?from=<iso>  &to=<iso>       (default: last 24h)
//   ?athlete_id=<uuid>
//   ?session_id=<uuid>
//   ?agent_type=<string>
//   ?limit=50 (1–200)  ?offset=0

function parseTimeRange(from: string | null, to: string | null) {
  const now = new Date();
  const dtTo = to ? new Date(to) : now;
  const dtFrom = from
    ? new Date(from)
    : new Date(dtTo.getTime() - 24 * 3600 * 1000);
  if (isNaN(dtTo.getTime()) || isNaN(dtFrom.getTime())) {
    return { from: new Date(now.getTime() - 24 * 3600 * 1000), to: now };
  }
  return { from: dtFrom, to: dtTo };
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const url = new URL(req.url);
  const { from, to } = parseTimeRange(
    url.searchParams.get("from"),
    url.searchParams.get("to"),
  );
  const athleteId = url.searchParams.get("athlete_id");
  const sessionId = url.searchParams.get("session_id");
  const agentType = url.searchParams.get("agent_type");
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 1),
    200,
  );
  const offset = Math.max(
    parseInt(url.searchParams.get("offset") ?? "0", 10) || 0,
    0,
  );

  const db = supabaseAdmin() as ReturnType<typeof supabaseAdmin> & { from(table: string): any };
  let query = db
    .from("prompt_render_log")
    .select(
      "id,request_id,athlete_id,session_id,turn_index,agent_type,intent_id,static_tokens,dynamic_tokens,total_tokens,memory_facts_count,memory_available,validation_warnings,created_at",
      { count: "exact" },
    )
    .gte("created_at", from.toISOString())
    .lte("created_at", to.toISOString())
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (athleteId) query = query.eq("athlete_id", athleteId);
  if (sessionId) query = query.eq("session_id", sessionId);
  if (agentType) query = query.eq("agent_type", agentType);

  const { data, error, count } = await query;

  if (error) {
    console.error("[prompt-logs] query error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ logs: data ?? [], total: count ?? 0 });
}
