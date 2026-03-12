import { NextRequest, NextResponse } from "next/server";
import { expireOldSuggestions } from "@/services/suggestionService";

/**
 * POST /api/v1/suggestions/expire
 *
 * Cron-friendly endpoint to expire stale suggestions.
 * Can be called by Vercel Cron, an external scheduler, or manually.
 * Protected by a simple bearer token check (CRON_SECRET env var).
 */
export async function POST(req: NextRequest) {
  // Simple auth: check for CRON_SECRET header
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const expired = await expireOldSuggestions();
    return NextResponse.json(
      { expired: expired.length, ids: expired.map((e) => e.id) },
      { headers: { "api-version": "v1" } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
