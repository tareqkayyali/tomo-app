/**
 * POST /api/v1/dual-load/integrated-plan
 *
 * Generate and persist an integrated weekly plan that balances
 * athletic training with academic commitments.
 *
 * Called by Dual-Load Agent via Python bridge.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const userId = req.headers.get("x-tomo-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Missing user ID" }, { status: 401 });
  }

  const body = await req.json();
  const {
    week_start,
    balance_ratio,
    plan_items,
  } = body;

  if (!week_start || !plan_items || !Array.isArray(plan_items)) {
    return NextResponse.json(
      { error: "week_start and plan_items[] required" },
      { status: 400 },
    );
  }

  const db = supabaseAdmin();

  // Create calendar events for each plan item
  const eventsToInsert = plan_items.map((item: any) => ({
    user_id: userId,
    title: item.title,
    event_type: item.event_type || "training",
    start_at: item.start_at,
    end_at: item.end_at,
    intensity: item.intensity || "MODERATE",
    notes: item.notes || null,
    metadata: {
      source: "dual_load_integrated_plan",
      balance_ratio,
      week_start,
      ...(item.metadata || {}),
    },
  }));

  const { data: created, error: insertError } = await db
    .from("calendar_events")
    .insert(eventsToInsert)
    .select("id, title, event_type, start_at, intensity");

  if (insertError) {
    return NextResponse.json(
      { error: "Failed to create plan events", detail: insertError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    integrated_plan: {
      week_start,
      balance_ratio,
      events_created: created?.length ?? 0,
      events: created || [],
    },
  });
}
