import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ALLOWED_SPORTS, type Sport } from "@/types";

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const db = supabaseAdmin();
  const { data: user, error } = await db
    .from("users")
    .select("*")
    .eq("id", auth.user.id)
    .single();

  if (error || !user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({ user }, { headers: { "api-version": "v1" } });
}

const ALLOWED_UPDATE_FIELDS: Record<string, string> = {
  name: "name",
  displayName: "name",
  sport: "sport",
  age: "age",
  region: "region",
  teamId: "team_id",
  seasonPhase: "season_phase",
  weeklyTrainingDays: "weekly_training_days",
  healthKitConnected: "health_kit_connected",
  fcmToken: "fcm_token",
  photoUrl: "photo_url",
  studySubjects: "study_subjects",
  examSchedule: "exam_schedule",
  trainingPreferences: "training_preferences",
  studyPlanConfig: "study_plan_config",
  schoolSchedule: "school_schedule",
  customTrainingTypes: "custom_training_types",
  connectedWearables: "connected_wearables",
};

export async function PUT(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();

    // Map camelCase keys from mobile to snake_case DB columns
    const updates: Record<string, unknown> = {};
    for (const [camelKey, dbColumn] of Object.entries(ALLOWED_UPDATE_FIELDS)) {
      if (body[camelKey] !== undefined) {
        updates[dbColumn] = body[camelKey];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    // Validate sport if included
    if (updates.sport && !ALLOWED_SPORTS.includes(updates.sport as Sport)) {
      return NextResponse.json(
        { error: "Invalid sport. Must be one of: soccer, basketball, tennis, padel" },
        { status: 400 }
      );
    }

    updates.updated_at = new Date().toISOString();

    const db = supabaseAdmin();
    const { data: user, error } = await db
      .from("users")
      .update(updates)
      .eq("id", auth.user.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ user }, { headers: { "api-version": "v1" } });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
