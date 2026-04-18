/**
 * GET /api/v1/week-plan/modes
 *
 * Returns the CMS athlete_modes catalog + the athlete's current mode so
 * the week-planner's first step can let them pick a mode for this plan
 * (used only for planning — doesn't mutate their global mode).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const db = supabaseAdmin();
  const [modesRes, prefsRes] = await Promise.all([
    (db as any)
      .from("athlete_modes")
      .select("id, label, description, icon, color, sort_order")
      .eq("is_enabled", true)
      .order("sort_order", { ascending: true }),
    (db as any)
      .from("player_schedule_preferences")
      .select("athlete_mode, week_start_day")
      .eq("user_id", auth.user.id)
      .maybeSingle(),
  ]);

  const modes = (modesRes?.data ?? []).map((row: any) => ({
    id: String(row.id),
    label: String(row.label),
    description: row.description ?? null,
    icon: row.icon ?? null,
    color: row.color ?? null,
  }));

  const currentMode = prefsRes?.data?.athlete_mode ?? "balanced";
  // Week start weekday. Per the My Rules golden rule: read the player's
  // configured value first, fall back to Saturday (6) only when nothing
  // is set. The column has a DB default of 6 (ME academic calendar),
  // so in practice this is `??` belt-and-suspenders.
  const weekStartDay = typeof prefsRes?.data?.week_start_day === "number"
    ? prefsRes.data.week_start_day
    : 6;

  return NextResponse.json({ modes, currentMode, weekStartDay });
}
