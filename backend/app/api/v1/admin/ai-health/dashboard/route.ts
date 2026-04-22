import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// GET /api/v1/admin/ai-health/dashboard?from=<iso>&to=<iso>
//
// Direct-DB replacement of the old Python proxy. Response shape matches the
// legacy contract exactly — CMS page at
// backend/app/admin/(app)/(ops)/(monitoring)/ai-health/page.tsx keeps working
// without changes.
//
// Defaults to last 24 hours when either bound is missing.

interface GlobalStats {
  total_traces: number;
  avg_cost: number;
  avg_latency_ms: number;
  error_rate: number;
  safety_flags: number;
  total_cost_usd: number;
}

interface AgentStats {
  agent_type: string;
  total_traces: number;
  success_count: number;
  error_count: number;
  success_rate: number;
  avg_cost: number;
  avg_latency_ms: number;
  avg_confidence: number;
  top_intents: string[];
  safety_flags: number;
  cost_total_usd: number;
}

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

function round(value: number, decimals: number): number {
  const m = Math.pow(10, decimals);
  return Math.round(value * m) / m;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const url = new URL(req.url);
  const { from, to } = parseTimeRange(
    url.searchParams.get("from"),
    url.searchParams.get("to"),
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin() as any; // ai_trace_log column set differs from generated types

  const { data: traces, error } = await db
    .from("ai_trace_log")
    .select(
      "agent_type, intent_id, total_cost_usd, latency_ms, validation_passed, phv_gate_fired, crisis_detected, ped_detected, medical_warning, routing_confidence",
    )
    .gte("created_at", from.toISOString())
    .lte("created_at", to.toISOString());

  if (error) {
    return NextResponse.json(
      { error: "Failed to load dashboard", detail: error.message },
      { status: 500 },
    );
  }

  const rows = traces ?? [];
  const total = rows.length;

  // ── Global stats ──────────────────────────────────────────────────────
  let sumCost = 0;
  let sumLatency = 0;
  let failed = 0;
  let safetyFlags = 0;
  for (const r of rows) {
    sumCost += Number(r.total_cost_usd ?? 0);
    sumLatency += Number(r.latency_ms ?? 0);
    if (r.validation_passed === false) failed++;
    if (r.phv_gate_fired || r.crisis_detected || r.ped_detected || r.medical_warning) {
      safetyFlags++;
    }
  }
  const globalStats: GlobalStats = {
    total_traces: total,
    avg_cost: total ? round(sumCost / total, 6) : 0,
    avg_latency_ms: total ? round(sumLatency / total, 1) : 0,
    error_rate: total ? round((failed / total) * 100, 2) : 0,
    safety_flags: safetyFlags,
    total_cost_usd: round(sumCost, 4),
  };

  // ── Per-agent stats ───────────────────────────────────────────────────
  type AgentAcc = {
    agent_type: string;
    total: number;
    success: number;
    cost: number;
    latency: number;
    confidence: number;
    confidence_count: number;
    cost_total: number;
    safety: number;
    intents: Map<string, number>;
  };
  const byAgent = new Map<string, AgentAcc>();
  for (const r of rows) {
    const key = String(r.agent_type ?? "unknown");
    let acc = byAgent.get(key);
    if (!acc) {
      acc = {
        agent_type: key,
        total: 0,
        success: 0,
        cost: 0,
        latency: 0,
        confidence: 0,
        confidence_count: 0,
        cost_total: 0,
        safety: 0,
        intents: new Map(),
      };
      byAgent.set(key, acc);
    }
    acc.total++;
    if (r.validation_passed !== false) acc.success++;
    acc.cost += Number(r.total_cost_usd ?? 0);
    acc.cost_total += Number(r.total_cost_usd ?? 0);
    acc.latency += Number(r.latency_ms ?? 0);
    if (r.routing_confidence != null) {
      acc.confidence += Number(r.routing_confidence);
      acc.confidence_count++;
    }
    if (r.phv_gate_fired || r.crisis_detected) acc.safety++;
    const intent = String(r.intent_id ?? "unknown");
    acc.intents.set(intent, (acc.intents.get(intent) ?? 0) + 1);
  }

  const agents: AgentStats[] = Array.from(byAgent.values())
    .map((a) => {
      const topIntents = Array.from(a.intents.entries())
        .sort((x, y) => y[1] - x[1])
        .slice(0, 3)
        .map(([name]) => name);
      return {
        agent_type: a.agent_type,
        total_traces: a.total,
        success_count: a.success,
        error_count: a.total - a.success,
        success_rate: round((a.success / Math.max(a.total, 1)) * 100, 2),
        avg_cost: round(a.cost / Math.max(a.total, 1), 6),
        avg_latency_ms: round(a.latency / Math.max(a.total, 1), 1),
        avg_confidence: a.confidence_count
          ? round(a.confidence / a.confidence_count, 4)
          : 0,
        top_intents: topIntents,
        safety_flags: a.safety,
        cost_total_usd: round(a.cost_total, 4),
      };
    })
    .sort((a, b) => b.total_traces - a.total_traces);

  return NextResponse.json({
    global_stats: globalStats,
    agents,
    time_range: {
      from: from.toISOString(),
      to: to.toISOString(),
    },
  });
}
