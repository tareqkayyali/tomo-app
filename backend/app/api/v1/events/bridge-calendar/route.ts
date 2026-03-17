/**
 * POST /api/v1/events/bridge-calendar — Cron endpoint
 *
 * Bridges completed calendar events from yesterday into the Athlete Data Fabric
 * (athlete_events). Designed to run once daily via Vercel Cron or external scheduler.
 *
 * Auth: CRON_SECRET bearer token (same pattern as /api/v1/suggestions/expire).
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { bridgeCompletedCalendarEvents } from "@/services/events/calendarBridge";

export async function POST(req: NextRequest) {
  // Auth: check CRON_SECRET
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const db = supabaseAdmin();

    // Yesterday's date in UTC
    const yesterday = new Date(Date.now() - 86400000)
      .toISOString()
      .split("T")[0];

    // Find all athletes who had calendar events yesterday
    const { data: athleteRows, error: queryErr } = await (db as any)
      .from("calendar_events")
      .select("user_id")
      .gte("start_at", `${yesterday}T00:00:00.000Z`)
      .lte("start_at", `${yesterday}T23:59:59.999Z`)
      .in("event_type", ["training", "match", "recovery", "study", "exam"]);

    if (queryErr) {
      return NextResponse.json(
        { error: queryErr.message },
        { status: 500 },
      );
    }

    // Deduplicate athlete IDs
    const athleteIds: string[] = [...new Set<string>((athleteRows ?? []).map((r: any) => r.user_id as string))];

    let totalBridged = 0;
    const results: Array<{ athleteId: string; bridged: number }> = [];

    for (const athleteId of athleteIds) {
      const bridged = await bridgeCompletedCalendarEvents(athleteId, yesterday);
      totalBridged += bridged;
      if (bridged > 0) {
        results.push({ athleteId, bridged });
      }
    }

    return NextResponse.json(
      {
        date: yesterday,
        athletesProcessed: athleteIds.length,
        totalBridged,
        details: results,
      },
      { headers: { "api-version": "v1" } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
