/**
 * GET  /api/v1/schedule/rules  — Load player schedule preferences + effective rules
 * PATCH /api/v1/schedule/rules — Update player schedule preferences
 *
 * Uses direct PostgreSQL connection (bypasses PostgREST schema cache).
 *
 * ACTUAL column types (verified via information_schema):
 *   - *_days columns: integer[] (NOT jsonb)
 *   - exam_subjects, study_subjects: text[] (NOT jsonb)
 *   - exam_start_date: date (NOT text)
 *   - training_categories, exam_schedule, mode_params_override, regular_study_config: jsonb
 *   - weekend_bounds_start, weekend_bounds_end: text (nullable)
 *   - all other text/int/bool columns: as expected
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { directQuery } from "@/lib/supabase/directDb";
import {
  DEFAULT_PREFERENCES,
  detectScenario,
  getEffectiveRules,
  type PlayerSchedulePreferences,
} from "@/services/scheduling/scheduleRuleEngine";
import { emitEventSafe } from "@/services/events/eventEmitter";

// All columns that can be written via PATCH
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
]);

// ── Column type classification (matches actual DB schema) ──

// integer[] columns — pg driver sends JS arrays as PostgreSQL arrays
const INT_ARRAY_FIELDS = new Set([
  "school_days", "study_days", "gym_days", "personal_dev_days", "club_days",
]);

// text[] columns
const TEXT_ARRAY_FIELDS = new Set([
  "exam_subjects", "study_subjects",
]);

// jsonb columns — need JSON.stringify + ::jsonb cast
const JSONB_FIELDS = new Set([
  "training_categories", "exam_schedule", "mode_params_override",
]);

// date column — needs ::date cast
const DATE_FIELDS = new Set([
  "exam_start_date",
]);

/**
 * Build the SQL parameter placeholder and serialize the value
 * based on the actual column type in the database.
 */
function sqlParam(
  key: string,
  value: unknown,
  paramIdx: number,
): { placeholder: string; serialized: unknown } {
  if (JSONB_FIELDS.has(key)) {
    return {
      placeholder: `$${paramIdx}::jsonb`,
      serialized: value === null ? null : JSON.stringify(value),
    };
  }
  if (DATE_FIELDS.has(key)) {
    return {
      placeholder: value === null ? `$${paramIdx}` : `$${paramIdx}::date`,
      serialized: value,
    };
  }
  // integer[], text[], and all scalar types — pg driver handles natively
  return {
    placeholder: `$${paramIdx}`,
    serialized: value,
  };
}

// ── GET ────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  let row: Record<string, unknown> | null = null;
  try {
    const rows = await directQuery(
      `SELECT * FROM public.player_schedule_preferences WHERE user_id = $1 LIMIT 1`,
      [auth.user.id],
    );
    row = rows[0] ?? null;
  } catch (err) {
    console.error("[schedule/rules GET] DB error:", err);
  }

  const merged: PlayerSchedulePreferences = {
    ...DEFAULT_PREFERENCES,
    ...(row ?? {}),
  };

  const scenario = detectScenario(merged);
  const effective = getEffectiveRules(merged, scenario);

  return NextResponse.json({
    preferences: merged,
    scenario,
    athleteMode: (merged as any).athlete_mode ?? "balanced",
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

    // Check if row exists
    const existing = await directQuery(
      `SELECT user_id FROM public.player_schedule_preferences WHERE user_id = $1 LIMIT 1`,
      [auth.user.id],
    );

    if (existing.length > 0) {
      // UPDATE — build SET clause with correct type casts
      const setClauses: string[] = [];
      const values: unknown[] = [];
      let paramIdx = 1;

      for (const [key, value] of Object.entries(updates)) {
        const { placeholder, serialized } = sqlParam(key, value, paramIdx);
        setClauses.push(`${key} = ${placeholder}`);
        values.push(serialized);
        paramIdx++;
      }

      setClauses.push(`updated_at = now()`);
      values.push(auth.user.id);

      await directQuery(
        `UPDATE public.player_schedule_preferences SET ${setClauses.join(", ")} WHERE user_id = $${paramIdx}`,
        values,
      );
    } else {
      // INSERT
      const columns: string[] = ["user_id"];
      const placeholders: string[] = ["$1"];
      const values: unknown[] = [auth.user.id];
      let paramIdx = 2;

      for (const [key, value] of Object.entries(updates)) {
        columns.push(key);
        const { placeholder, serialized } = sqlParam(key, value, paramIdx);
        placeholders.push(placeholder);
        values.push(serialized);
        paramIdx++;
      }

      await directQuery(
        `INSERT INTO public.player_schedule_preferences (${columns.join(", ")}) VALUES (${placeholders.join(", ")})`,
        values,
      );
    }

    // Fetch updated row
    const rows = await directQuery(
      `SELECT * FROM public.player_schedule_preferences WHERE user_id = $1 LIMIT 1`,
      [auth.user.id],
    );
    const row = rows[0] ?? null;

    const merged: PlayerSchedulePreferences = {
      ...DEFAULT_PREFERENCES,
      ...(row ?? {}),
    };

    // ── Emit MODE_CHANGE event if athlete_mode was updated ──
    if (updates.athlete_mode) {
      const previousMode = (row as any)?.athlete_mode ?? "balanced";
      const newMode = updates.athlete_mode as string;
      if (previousMode !== newMode) {
        await emitEventSafe({
          athleteId: auth.user.id,
          eventType: "MODE_CHANGE",
          source: "MANUAL",
          payload: {
            previous_mode: previousMode,
            new_mode: newMode,
            mode_params: {},
            trigger: "manual",
          },
          createdBy: auth.user.id,
        });
      }
    }

    return NextResponse.json({
      updated: true,
      scenario: detectScenario(merged),
      athleteMode: (merged as any).athlete_mode ?? "balanced",
    });
  } catch (err) {
    console.error("[schedule/rules PATCH] Unhandled error:", err);
    return NextResponse.json(
      { error: `Server error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
}
