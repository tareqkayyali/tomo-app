/**
 * PATCH /api/v1/week-plan/subjects
 *
 * Upsert the athlete's study-subjects list on player_schedule_preferences.
 * Used by the StudyPlanCapsule to persist inline-added subjects so they
 * survive to the next session.
 *
 * Why not /api/v1/schedule/rules? That route uses directQuery (requires
 * SUPABASE_DB_URL) which is not guaranteed set on every env — athletes
 * hit "SUPABASE_DB_URL is not set" when adding a subject from the planner.
 * This endpoint uses the service-role Supabase admin client, which is
 * already required by every other week-plan route.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { z } from "zod";

const bodySchema = z.object({
  // Full authoritative list — replaces the column. Mobile dedupes + trims
  // before sending; we sanity-check here.
  study_subjects: z.array(z.string().min(1).max(60)).max(40),
});

export async function PATCH(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: "Invalid request", detail: (err as Error).message },
      { status: 400 },
    );
  }

  const db = supabaseAdmin();

  // Dedupe case-insensitive preserving insertion order.
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const raw of body.study_subjects) {
    const s = raw.trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    clean.push(s);
  }

  const { error } = await (db as any)
    .from("player_schedule_preferences")
    .upsert(
      {
        user_id: auth.user.id,
        study_subjects: clean,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  if (error) {
    return NextResponse.json(
      { error: "Failed to save subjects", detail: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, study_subjects: clean });
}
