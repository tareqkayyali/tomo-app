/**
 * GET  /api/v1/schedule/rules  — Load player schedule preferences + effective rules
 * PATCH /api/v1/schedule/rules — Update player schedule preferences
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  DEFAULT_PREFERENCES,
  detectScenario,
  getEffectiveRules,
  getEffectiveRulesWithMode,
  type PlayerSchedulePreferences,
} from "@/services/scheduling/scheduleRuleEngine";
import { getModeDefinition } from "@/services/scheduling/modeConfig";
import { emitEventSafe } from "@/services/events/eventEmitter";

const TABLE = "player_schedule_preferences";

// DB columns are nullable (pre-defaults); domain type is non-null. This drops
// nulls before merging so DEFAULT_PREFERENCES fills any gaps cleanly.
function mergeWithDefaults(
  row: Record<string, unknown> | null,
): PlayerSchedulePreferences {
  const patch: Partial<PlayerSchedulePreferences> = {};
  if (row) {
    for (const [key, value] of Object.entries(row)) {
      if (value !== null) {
        (patch as Record<string, unknown>)[key] = value;
      }
    }
  }
  return { ...DEFAULT_PREFERENCES, ...patch };
}

// Columns the PATCH endpoint accepts. PostgREST handles type serialization
// (jsonb, integer[], text[], date) natively via the schema cache.
const ALLOWED_FIELDS = new Set([
  "school_days", "school_start", "school_end",
  "sleep_start", "sleep_end",
  "day_bounds_start", "day_bounds_end",
  "weekend_bounds_start", "weekend_bounds_end",
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
  // First weekday of the athlete's training week (0=Sun..6=Sat).
  // Default 6 (Saturday) — see migration 059.
  "week_start_day",
]);

// ── GET ────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const db = supabaseAdmin();
  const { data: row, error } = await db
    .from(TABLE)
    .select("*")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (error) {
    console.error("[schedule/rules GET] DB error:", error);
  }

  const merged = mergeWithDefaults(row);

  const scenario = detectScenario(merged);
  const athleteMode = merged.athlete_mode ?? "balanced";

  // Use CMS mode-aware rules when mode params are available; fall back to legacy scenario-based rules
  let effective;
  try {
    const modeDef = await getModeDefinition(athleteMode);
    if (modeDef?.params) {
      effective = getEffectiveRulesWithMode(merged, modeDef.params, athleteMode);
    } else {
      effective = getEffectiveRules(merged, scenario);
    }
  } catch {
    effective = getEffectiveRules(merged, scenario);
  }

  return NextResponse.json({
    preferences: merged,
    scenario,
    athleteMode,
    effectiveRules: {
      buffers: effective.buffers,
      intensityCaps: effective.intensityCaps,
      dayBounds: effective.dayBounds,
      weekendBounds: effective.weekendBounds,
      ruleCount: effective.rules.length,
    },
  });
}

// ── PATCH ──────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  try {
    const auth = requireAuth(req);
    if ("error" in auth) return auth.error;

    const body = await req.json();

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

    let previousMode: string | null = null;
    if (updates.athlete_mode) {
      const { data: existing } = await db
        .from(TABLE)
        .select("athlete_mode")
        .eq("user_id", auth.user.id)
        .maybeSingle();
      previousMode = existing?.athlete_mode ?? "balanced";
    }

    const { data: row, error: upsertError } = await db
      .from(TABLE)
      .upsert(
        { ...updates, user_id: auth.user.id, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      )
      .select("*")
      .single();

    if (upsertError) {
      console.error("[schedule/rules PATCH] Upsert failed:", upsertError);
      return NextResponse.json(
        { error: `Save failed: ${upsertError.message}` },
        { status: 500 },
      );
    }

    const merged = mergeWithDefaults(row);

    // Emit MODE_CHANGE event only when the mode actually changed
    if (updates.athlete_mode && previousMode !== updates.athlete_mode) {
      await emitEventSafe({
        athleteId: auth.user.id,
        eventType: "MODE_CHANGE",
        source: "MANUAL",
        payload: {
          previous_mode: previousMode as string,
          new_mode: updates.athlete_mode as string,
          mode_params: {},
          trigger: "manual",
        },
        createdBy: auth.user.id,
      });
    }

    return NextResponse.json({
      updated: true,
      scenario: detectScenario(merged),
      athleteMode: merged.athlete_mode ?? "balanced",
    });
  } catch (err) {
    console.error("[schedule/rules PATCH] Unhandled error:", err);
    return NextResponse.json(
      { error: `Server error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
}
