/**
 * GET  /api/v1/schedule/rules  — Load player schedule preferences + effective rules
 * PATCH /api/v1/schedule/rules — Update player schedule preferences
 *
 * Note: Uses `as any` for table name because player_schedule_preferences is not
 * yet in generated Supabase types. Regenerate types after running the migration.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  DEFAULT_PREFERENCES,
  detectScenario,
  getEffectiveRules,
  type PlayerSchedulePreferences,
} from "@/services/scheduling/scheduleRuleEngine";
import { emitEventSafe } from "@/services/events/eventEmitter";

// Table name cast — regenerate types after migration to remove
const TABLE = "player_schedule_preferences" as any;

// ── GET ────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const db = supabaseAdmin();
  const { data: prefs } = await (db as any)
    .from(TABLE)
    .select("*")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  // Merge DB row with defaults for any missing fields
  const merged: PlayerSchedulePreferences = {
    ...DEFAULT_PREFERENCES,
    ...(prefs ?? {}),
  };

  const scenario = detectScenario(merged);
  const effective = getEffectiveRules(merged, scenario);

  return NextResponse.json({
    preferences: merged,
    scenario,
    athleteMode: (merged as any).athlete_mode ?? 'balanced',
    effectiveRules: {
      buffers: effective.buffers,
      intensityCaps: effective.intensityCaps,
      dayBounds: effective.dayBounds,
      ruleCount: effective.rules.length,
    },
  });
}

// ── PATCH ──────────────────────────────────────────────────────

const ALLOWED_FIELDS = new Set([
  "school_days", "school_start", "school_end",
  "sleep_start", "sleep_end",
  "day_bounds_start", "day_bounds_end",
  "study_days", "study_start", "study_duration_min",
  "gym_days", "gym_start", "gym_duration_min",
  "personal_dev_days", "personal_dev_start",
  "club_days", "club_start",
  "buffer_default_min", "buffer_post_match_min", "buffer_post_high_intensity_min",
  "league_is_active", "exam_period_active",
  "exam_subjects", "exam_start_date",
  "pre_exam_study_weeks", "days_per_subject",
  "training_categories", "exam_schedule", "study_subjects",
  "athlete_mode", "mode_params_override",
]);

export async function PATCH(req: NextRequest) {
  try {
    const auth = requireAuth(req);
    if ("error" in auth) return auth.error;

    const body = await req.json();

    // Filter to only allowed fields
    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (ALLOWED_FIELDS.has(key)) {
        updates[key] = value;
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const db = supabaseAdmin();
    const upsertPayload = {
      user_id: auth.user.id,
      ...updates,
      updated_at: new Date().toISOString(),
    };

    const { error } = await (db as any)
      .from(TABLE)
      .upsert(upsertPayload, { onConflict: "user_id" });

    if (error) {
      console.error("[schedule/rules PATCH] Supabase error:", error.message, error.code, error.details, error.hint);
      return NextResponse.json(
        { error: `Supabase: ${error.message}${error.hint ? ' — ' + error.hint : ''}` },
        { status: 500 }
      );
    }

    // Return updated scenario
    const { data: prefs } = await (db as any)
      .from(TABLE)
      .select("*")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    const merged: PlayerSchedulePreferences = {
      ...DEFAULT_PREFERENCES,
      ...(prefs ?? {}),
    };

    // ── Emit MODE_CHANGE event if athlete_mode was updated ──
    if (updates.athlete_mode) {
      const previousMode = (prefs as any)?.athlete_mode ?? 'balanced';
      const newMode = updates.athlete_mode as string;
      if (previousMode !== newMode) {
        await emitEventSafe({
          athleteId: auth.user.id,
          eventType: 'MODE_CHANGE',
          source: 'MANUAL',
          payload: {
            previous_mode: previousMode,
            new_mode: newMode,
            mode_params: {},
            trigger: 'manual',
          },
          createdBy: auth.user.id,
        });
      }
    }

    return NextResponse.json({
      updated: true,
      scenario: detectScenario(merged),
      athleteMode: (merged as any).athlete_mode ?? 'balanced',
    });
  } catch (err) {
    console.error("[schedule/rules PATCH] Unhandled error:", err);
    return NextResponse.json(
      { error: `Server error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
