/**
 * POST /api/v1/chat/pills/track
 *
 * Logs a pill tap for the authenticated user. Fire-and-forget from mobile.
 *
 * Body: { pillId: string, source: 'empty_state' | 'in_response' }
 *
 * - `pillId` must be non-empty and <= 64 chars. We do NOT check it against
 *   the current library: a pill can be disabled/renamed after a user tapped
 *   it, but the historical event is still valid telemetry.
 * - `source` is constrained to the CHECK values in the DB.
 *
 * Auth: Bearer (proxy.ts sets x-user-id). RLS enforces user_id = auth.uid().
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

const bodySchema = z.object({
  pillId: z.string().min(1).max(64),
  source: z.enum(["empty_state", "in_response"]),
});

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", detail: parsed.error.format() },
      { status: 400 }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin() as any;
  const { error } = await db.from("chat_pill_usage").insert({
    user_id: auth.user.id,
    pill_id: parsed.data.pillId,
    source: parsed.data.source,
  });

  if (error) {
    logger.warn("[chat/pills/track] insert failed", {
      userId: auth.user.id,
      pillId: parsed.data.pillId,
      source: parsed.data.source,
      error: error.message,
    });
    return NextResponse.json({ error: "Failed to track" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
