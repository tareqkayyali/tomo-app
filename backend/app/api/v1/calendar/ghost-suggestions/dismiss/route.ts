import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

/**
 * Dismiss a ghost pattern.
 * In the Supabase version, ghost dismissals are handled client-side
 * since ghost suggestions are computed on-the-fly from event patterns.
 * This endpoint returns success to maintain API compatibility.
 */
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    const { patternKey } = body;

    if (!patternKey) {
      return NextResponse.json(
        { error: "patternKey is required" },
        { status: 400 }
      );
    }

    // Ghost dismissals are tracked client-side in the mobile app
    // to avoid needing a separate dismissals table. The pattern
    // detection already handles filtering via confirmed events.
    return NextResponse.json(
      { success: true, patternKey },
      { headers: { "api-version": "v1" } }
    );
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}
