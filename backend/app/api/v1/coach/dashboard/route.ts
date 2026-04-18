import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole, getLinkedPlayers } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// GET /api/v1/coach/dashboard?pillar=training|metrics|progress
//
// Coach Dashboard aggregates one-row-per-athlete data across three
// pillars. Preserves the existing per-player drill-in (→ CoachPlayerDetail)
// by returning the same playerId that Players tab uses.
//
// Performance target per P4 plan: <500ms for a 50-player roster.
// Strategy: getLinkedPlayers already does one JOIN on relationships +
// users + readMultipleSnapshots — O(1) DB round trips in roster size.
// Programmes + deltas are fetched in parallel.
//
// Pillar semantics:
//   training   — per-athlete programme status (drafts, pending approval,
//                published, flagged by safety gate)
//   metrics    — readiness/ACWR/dual-load heatmap row per athlete
//   progress   — 30-day mastery delta, streak, adherence

type Pillar = "training" | "metrics" | "progress";
const PILLARS: Set<Pillar> = new Set(["training", "metrics", "progress"]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedDb = { from: (table: string) => any };

interface ProgrammeAggRow {
  athlete_id: string;
  drafts: number;
  pending_approval: number;
  published: number;
  safety_flagged: number;
}

async function fetchProgrammeAggregates(
  db: UntypedDb,
  playerIds: string[]
): Promise<Map<string, ProgrammeAggRow>> {
  if (playerIds.length === 0) return new Map();
  // training_programs has athlete_id + status; suggestions has
  // mode='approval_request' rows pointing at training_programs via
  // target_ref. Single pass per athlete aggregating counts.
  const [{ data: programmeRows }, { data: approvalRows }] = await Promise.all([
    db
      .from("training_programs")
      .select("athlete_id, active")
      .in("athlete_id", playerIds),
    db
      .from("suggestions")
      .select("player_id, status, target_ref_type")
      .in("player_id", playerIds)
      .eq("mode", "approval_request")
      .eq("status", "pending"),
  ]);

  const map = new Map<string, ProgrammeAggRow>();
  for (const id of playerIds) {
    map.set(id, {
      athlete_id: id,
      drafts: 0,
      pending_approval: 0,
      published: 0,
      safety_flagged: 0,
    });
  }
  for (const r of (programmeRows ?? []) as Array<{ athlete_id: string; active: boolean }>) {
    const cell = map.get(r.athlete_id);
    if (!cell) continue;
    if (r.active) cell.published++;
    else cell.drafts++;
  }
  for (const r of (approvalRows ?? []) as Array<{ player_id: string; target_ref_type: string | null }>) {
    if (r.target_ref_type !== "training_programs") continue;
    const cell = map.get(r.player_id);
    if (!cell) continue;
    cell.pending_approval++;
  }
  return map;
}

async function fetchMasteryDeltas(
  db: UntypedDb,
  playerIds: string[]
): Promise<Map<string, number | null>> {
  if (playerIds.length === 0) return new Map();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data } = await db
    .from("athlete_monthly_summary")
    .select("athlete_id, mastery_score, snapshot_date")
    .in("athlete_id", playerIds)
    .gte("snapshot_date", since)
    .order("snapshot_date", { ascending: false });

  // Keep the most recent + second-most-recent per athlete to compute delta.
  const byAthlete = new Map<string, Array<{ score: number; date: string }>>();
  for (const r of (data ?? []) as Array<{ athlete_id: string; mastery_score: number | null; snapshot_date: string }>) {
    if (r.mastery_score == null) continue;
    const arr = byAthlete.get(r.athlete_id) ?? [];
    if (arr.length < 2) {
      arr.push({ score: r.mastery_score, date: r.snapshot_date });
      byAthlete.set(r.athlete_id, arr);
    }
  }
  const deltas = new Map<string, number | null>();
  for (const id of playerIds) {
    const arr = byAthlete.get(id);
    if (!arr || arr.length < 2) {
      deltas.set(id, null);
    } else {
      deltas.set(id, +(arr[0].score - arr[1].score).toFixed(2));
    }
  }
  return deltas;
}

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;
  const roleRes = await requireRole(auth.user.id, ["coach"]);
  if ("error" in roleRes) return roleRes.error;

  const url = new URL(req.url);
  const pillar = (url.searchParams.get("pillar") ?? "metrics") as Pillar;
  if (!PILLARS.has(pillar)) {
    return NextResponse.json({ error: "Invalid pillar", code: "INVALID_PILLAR" }, { status: 400 });
  }

  const players = await getLinkedPlayers(auth.user.id, "COACH");
  const playerIds = players.map((p) => p.id);
  const db = supabaseAdmin() as unknown as UntypedDb;

  if (pillar === "metrics") {
    const rows = players.map((p) => ({
      playerId: p.id,
      name: p.name,
      sport: p.sport,
      ageTier: p.ageTier,
      readinessRag: p.readinessRag,
      acwr: p.acwr,
      dualLoadIndex: p.dualLoadIndex,
      wellnessTrend: p.wellnessTrend,
      lastCheckinDate: p.lastCheckinDate ?? null,
    }));
    // Sort: RED first, then AMBER, then missing, then GREEN (surfaces
    // the athletes a coach needs to look at now).
    const rank: Record<string, number> = { RED: 0, AMBER: 1 };
    rows.sort((a, b) => {
      const ra = rank[a.readinessRag ?? ""] ?? (a.readinessRag == null ? 2 : 3);
      const rb = rank[b.readinessRag ?? ""] ?? (b.readinessRag == null ? 2 : 3);
      return ra - rb;
    });
    return NextResponse.json({ pillar, rows });
  }

  if (pillar === "training") {
    const programmes = await fetchProgrammeAggregates(db, playerIds);
    const rows = players.map((p) => {
      const agg = programmes.get(p.id);
      return {
        playerId: p.id,
        name: p.name,
        sport: p.sport,
        ageTier: p.ageTier,
        drafts: agg?.drafts ?? 0,
        pendingApproval: agg?.pending_approval ?? 0,
        published: agg?.published ?? 0,
        safetyFlagged: agg?.safety_flagged ?? 0,
      };
    });
    // Sort: most pending-approval first (surfaces coach action).
    rows.sort((a, b) => (b.pendingApproval + b.drafts) - (a.pendingApproval + a.drafts));
    return NextResponse.json({ pillar, rows });
  }

  // pillar === "progress"
  const deltas = await fetchMasteryDeltas(db, playerIds);
  const rows = players.map((p) => ({
    playerId: p.id,
    name: p.name,
    sport: p.sport,
    ageTier: p.ageTier,
    currentStreak: p.currentStreak,
    totalPoints: p.totalPoints,
    masteryDelta30d: deltas.get(p.id) ?? null,
    sessionsTotal: p.sessionsTotal,
    lastSessionAt: p.lastSessionAt,
  }));
  // Sort: biggest regression first so coach can intervene.
  rows.sort((a, b) => {
    const da = a.masteryDelta30d;
    const db = b.masteryDelta30d;
    if (da == null && db == null) return 0;
    if (da == null) return 1;
    if (db == null) return -1;
    return da - db; // negative deltas = regressions, sort ascending
  });
  return NextResponse.json({ pillar, rows });
}
