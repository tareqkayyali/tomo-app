import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

const HEADERS = { "api-version": "v1" };

// Subtle defaults (see memory: feedback_subtle_notifications.md) — kept in
// sync with migration 087. Changes to defaults must update both.
const DEFAULT_PREFERENCES = {
  quiet_hours_start: "21:00",
  quiet_hours_end: "08:00",
  daily_reminder_time: "07:30",
  push_critical: true,
  push_training: true,
  push_coaching: true,
  push_academic: true,
  push_triangle: true,
  push_cv: false,
  push_system: false,
  max_push_per_day: 3,
  min_push_interval_minutes: 120,
};

const BOOLEAN_FIELDS = [
  "push_critical",
  "push_training",
  "push_coaching",
  "push_academic",
  "push_triangle",
  "push_cv",
  "push_system",
] as const;

/**
 * GET /api/v1/notifications/settings
 * Returns the athlete's notification preferences.
 * Falls back to defaults if no row exists.
 */
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const db = supabaseAdmin() as any;
  const { data } = await db
    .from("athlete_notification_preferences")
    .select("*")
    .eq("athlete_id", auth.user.id)
    .single();

  return NextResponse.json(
    { preferences: data ?? { athlete_id: auth.user.id, ...DEFAULT_PREFERENCES } },
    { headers: HEADERS }
  );
}

/**
 * PUT /api/v1/notifications/settings
 * Upsert athlete notification preferences.
 */
export async function PUT(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();

    // Validate and filter
    const updates: Record<string, unknown> = {
      athlete_id: auth.user.id,
      updated_at: new Date().toISOString(),
    };

    // Time fields
    if (body.quiet_hours_start && /^\d{2}:\d{2}$/.test(body.quiet_hours_start)) {
      updates.quiet_hours_start = body.quiet_hours_start;
    }
    if (body.quiet_hours_end && /^\d{2}:\d{2}$/.test(body.quiet_hours_end)) {
      updates.quiet_hours_end = body.quiet_hours_end;
    }
    if (body.daily_reminder_time && /^\d{2}:\d{2}$/.test(body.daily_reminder_time)) {
      updates.daily_reminder_time = body.daily_reminder_time;
    }

    // Boolean toggles
    for (const field of BOOLEAN_FIELDS) {
      if (typeof body[field] === "boolean") {
        // push_critical cannot be disabled
        if (field === "push_critical" && body[field] === false) continue;
        updates[field] = body[field];
      }
    }

    // Max push per day
    if (typeof body.max_push_per_day === "number") {
      updates.max_push_per_day = Math.max(1, Math.min(10, body.max_push_per_day));
    }

    // Minimum inter-push interval (subtle throttle — non-critical only)
    if (typeof body.min_push_interval_minutes === "number") {
      updates.min_push_interval_minutes = Math.max(0, Math.min(720, body.min_push_interval_minutes));
    }

    // Opt-in school-hours quiet
    if (typeof body.school_hours_quiet === "boolean") {
      updates.school_hours_quiet = body.school_hours_quiet;
    }

    const db = supabaseAdmin() as any;
    const { data, error } = await db
      .from("athlete_notification_preferences")
      .upsert(updates, { onConflict: "athlete_id" })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500, headers: HEADERS }
      );
    }

    return NextResponse.json(
      { preferences: data },
      { headers: HEADERS }
    );
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400, headers: HEADERS }
    );
  }
}

/**
 * POST /api/v1/notifications/settings (legacy compat)
 * Redirects to PUT behavior.
 */
export async function POST(req: NextRequest) {
  return PUT(req);
}
