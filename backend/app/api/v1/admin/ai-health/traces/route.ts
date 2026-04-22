import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// GET /api/v1/admin/ai-health/traces
//   ?from=<iso> &to=<iso> (default: last 24h)
//   ?agent_type=<any> ?path_type=<any> ?intent_id=<any>
//   ?validation_passed=true|false
//   ?cost_bucket=<any> ?latency_bucket=<any>
//   ?limit=50 (1-200) ?offset=0
//
// Direct-DB replacement of the old Python proxy. Response shape matches the
// legacy contract. Missing assistant_response values are backfilled from
// chat_messages in a single additional query (session_id + 60s window),
// replacing the legacy LATERAL JOIN.

const TRACE_COLS = [
  "id",
  "created_at",
  "message",
  "assistant_response",
  "agent_type",
  "path_type",
  "intent_id",
  "classification_layer",
  "routing_confidence",
  "tool_count",
  "tool_names",
  "total_cost_usd",
  "total_tokens",
  "latency_ms",
  "validation_passed",
  "validation_flags",
  "phv_gate_fired",
  "crisis_detected",
  "rag_used",
  "sport",
  "age_band",
  "readiness_rag",
  "acwr",
  "cost_bucket",
  "latency_bucket",
  "turn_number",
  "response_length_chars",
  "session_id", // needed for backfill; stripped from response if not in legacy set
] as const;

function parseTimeRange(from: string | null, to: string | null) {
  const now = new Date();
  const dtTo = to ? new Date(to) : now;
  const dtFrom = from ? new Date(from) : new Date(dtTo.getTime() - 24 * 3600 * 1000);
  if (isNaN(dtTo.getTime()) || isNaN(dtFrom.getTime())) {
    return {
      from: new Date(now.getTime() - 24 * 3600 * 1000),
      to: now,
    };
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
  const agentType = url.searchParams.get("agent_type");
  const pathType = url.searchParams.get("path_type");
  const intentId = url.searchParams.get("intent_id");
  const validationPassedRaw = url.searchParams.get("validation_passed");
  const costBucket = url.searchParams.get("cost_bucket");
  const latencyBucket = url.searchParams.get("latency_bucket");
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 1),
    200,
  );
  const offset = Math.max(
    parseInt(url.searchParams.get("offset") ?? "0", 10) || 0,
    0,
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin() as any; // ai_trace_log column set differs from generated types

  let query = db
    .from("ai_trace_log")
    .select(TRACE_COLS.join(", "), { count: "exact" })
    .gte("created_at", from.toISOString())
    .lte("created_at", to.toISOString())
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (agentType) query = query.eq("agent_type", agentType);
  if (pathType) query = query.eq("path_type", pathType);
  if (intentId) query = query.eq("intent_id", intentId);
  if (validationPassedRaw !== null) {
    query = query.eq("validation_passed", validationPassedRaw === "true");
  }
  if (costBucket) query = query.eq("cost_bucket", costBucket);
  if (latencyBucket) query = query.eq("latency_bucket", latencyBucket);

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json(
      { error: "Failed to load traces", detail: error.message },
      { status: 500 },
    );
  }

  type TraceRow = Record<string, unknown>;
  const rows: TraceRow[] = (data ?? []) as TraceRow[];

  // ── Batch backfill: assistant_response from chat_messages ──────────
  // Replaces the legacy LATERAL JOIN with one bulk query + client merge.
  const needsBackfill = rows.filter(
    (r) =>
      (r.assistant_response === null || r.assistant_response === undefined) &&
      typeof r.session_id === "string" &&
      typeof r.created_at === "string",
  );
  if (needsBackfill.length > 0) {
    const sessionIds = Array.from(
      new Set(needsBackfill.map((r) => r.session_id as string)),
    );
    const times = needsBackfill.map((r) =>
      new Date(r.created_at as string).getTime(),
    );
    const minT = new Date(Math.min(...times));
    const maxT = new Date(Math.max(...times) + 60_000);

    const { data: messages } = await db
      .from("chat_messages")
      .select("session_id, created_at, content")
      .in("session_id", sessionIds)
      .eq("role", "assistant")
      .gte("created_at", minT.toISOString())
      .lte("created_at", maxT.toISOString())
      .order("created_at", { ascending: true });

    if (messages) {
      // Group by session_id for O(1) per-trace lookup
      const bySession = new Map<
        string,
        { created_at: string; content: string }[]
      >();
      for (const m of messages) {
        const sid = String(m.session_id);
        if (!bySession.has(sid)) bySession.set(sid, []);
        bySession.get(sid)!.push({
          created_at: m.created_at as string,
          content: String(m.content ?? ""),
        });
      }

      for (const r of needsBackfill) {
        const sid = r.session_id as string;
        const traceT = new Date(r.created_at as string).getTime();
        const candidates = bySession.get(sid) ?? [];
        // First chat_message strictly after trace, within 60s window
        const match = candidates.find((c) => {
          const mT = new Date(c.created_at).getTime();
          return mT >= traceT && mT <= traceT + 60_000;
        });
        if (match) r.assistant_response = match.content;
      }
    }
  }

  // Drop session_id from response if it wasn't in the legacy column set.
  // (Legacy columns did include session_id via the INSIGHTS path but not
  // the /traces response; keep it in for the CMS page's trace-detail use.)
  return NextResponse.json({
    traces: rows,
    total_count: count ?? rows.length,
    limit,
    offset,
  });
}
