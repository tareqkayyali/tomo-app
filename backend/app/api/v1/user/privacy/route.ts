import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

const DEFAULT_PRIVACY = {
  passportEnabled: false,
  showVideoTests: false,
  showStreakData: false,
  showArchetype: false,
  showPhysicalProfile: false,
  showSleepData: false,
  showPoints: false,
};

const ALLOWED_FIELDS = Object.keys(DEFAULT_PRIVACY);

/**
 * Privacy settings are handled client-side via AsyncStorage
 * until a dedicated privacy_settings table is added.
 * This endpoint returns defaults and accepts updates for API compatibility.
 */

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  return NextResponse.json(
    { privacySettings: DEFAULT_PRIVACY },
    { headers: { "api-version": "v1" } }
  );
}

export async function PUT(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();

    // Filter and validate: only boolean values allowed
    const updates: Record<string, boolean> = {};
    for (const field of ALLOWED_FIELDS) {
      if (body[field] !== undefined) {
        if (typeof body[field] !== "boolean") {
          return NextResponse.json(
            { error: `${field} must be a boolean` },
            { status: 400 }
          );
        }
        updates[field] = body[field];
      }
    }

    // Merge with defaults
    const merged = { ...DEFAULT_PRIVACY, ...updates };

    return NextResponse.json(
      { privacySettings: merged },
      { headers: { "api-version": "v1" } }
    );
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}
