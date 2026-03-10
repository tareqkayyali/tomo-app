import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

const DEFAULT_PREFERENCES = {
  dailyReminder: true,
  dailyReminderTime: "07:00",
  streakReminders: true,
  milestoneAlerts: true,
  redDayGuidance: true,
  weeklySummary: true,
};

const ALLOWED_FIELDS = [
  "dailyReminder",
  "dailyReminderTime",
  "streakReminders",
  "milestoneAlerts",
  "redDayGuidance",
  "weeklySummary",
];

/**
 * Notification preferences are stored in the users table metadata
 * since we don't have a dedicated notification_preferences table.
 * We use a simple approach: store in user profile as a JSON column or
 * handle via the existing users.exam_periods jsonb pattern.
 *
 * For now, we store them as a lightweight key-value via the users table update.
 * In the future, a dedicated table can be added.
 */

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  // Return default preferences (preferences will be stored client-side
  // via AsyncStorage until a dedicated notification_preferences table is added)
  return NextResponse.json(
    { preferences: DEFAULT_PREFERENCES },
    { headers: { "api-version": "v1" } }
  );
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();

    // Filter and validate allowed fields
    const updates: Record<string, unknown> = {};
    for (const field of ALLOWED_FIELDS) {
      if (body[field] !== undefined) {
        if (field === "dailyReminderTime") {
          if (!/^\d{2}:\d{2}$/.test(body[field])) {
            return NextResponse.json(
              { error: "dailyReminderTime must be HH:mm format" },
              { status: 400 }
            );
          }
          updates[field] = body[field];
        } else if (typeof body[field] === "boolean") {
          updates[field] = body[field];
        }
      }
    }

    // Merge with defaults
    const merged = { ...DEFAULT_PREFERENCES, ...updates };

    return NextResponse.json(
      { preferences: merged },
      { headers: { "api-version": "v1" } }
    );
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}
