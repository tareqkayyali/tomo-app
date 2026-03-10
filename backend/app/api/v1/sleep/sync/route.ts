import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { z } from "zod";

const sleepSyncSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  totalHours: z.number().min(0).max(24),
  quality: z
    .enum(["poor", "fair", "good", "excellent"])
    .nullable()
    .optional(),
  source: z.enum(["healthkit", "manual"]).optional().default("manual"),
  bedTime: z.string().nullable().optional(),
  wakeTime: z.string().nullable().optional(),
});

/**
 * Derive sleep quality from hours if not provided.
 */
function deriveQuality(hours: number): number {
  if (hours >= 9) return 5; // excellent
  if (hours >= 8) return 4; // good
  if (hours >= 6) return 3; // fair
  return 2; // poor
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    const parsed = sleepSyncSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { date, totalHours, source, bedTime, wakeTime } = parsed.data;
    const quality = deriveQuality(totalHours);

    const db = supabaseAdmin();

    // Check for existing log on this date
    const { data: existing } = await db
      .from("sleep_logs")
      .select("id, source")
      .eq("user_id", auth.user.id)
      .eq("date", date)
      .single();

    // HealthKit overwrites manual, but manual doesn't overwrite HealthKit
    if (existing && existing.source === "healthkit" && source === "manual") {
      return NextResponse.json(
        { error: "HealthKit data already logged for this date" },
        { status: 409 }
      );
    }

    const sleepData = {
      user_id: auth.user.id,
      date,
      duration_hours: totalHours,
      quality,
      source,
      bed_time: bedTime || null,
      wake_time: wakeTime || null,
    };

    let sleepLog;
    if (existing) {
      const { data, error } = await db
        .from("sleep_logs")
        .update(sleepData)
        .eq("id", existing.id)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      sleepLog = data;
    } else {
      const { data, error } = await db
        .from("sleep_logs")
        .insert(sleepData)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      sleepLog = data;
    }

    // Award bonus points for 8+ hours of sleep (if not already awarded)
    let pointsAwarded = 0;
    if (totalHours >= 8) {
      const today = new Date().toISOString().slice(0, 10);
      const ledgerId = `${auth.user.id}_sleep_${date}`;

      const { data: existingPoints } = await db
        .from("points_ledger")
        .select("id")
        .eq("id", ledgerId)
        .single();

      if (!existingPoints) {
        await db.from("points_ledger").insert({
          id: ledgerId,
          user_id: auth.user.id,
          date: today,
          points: 10,
          reasons: ["SLEEP_BONUS"],
          compliant: true,
        });

        // Update user total points
        const { data: user } = await db
          .from("users")
          .select("total_points")
          .eq("id", auth.user.id)
          .single();

        if (user) {
          await db
            .from("users")
            .update({ total_points: user.total_points + 10 })
            .eq("id", auth.user.id);
        }

        pointsAwarded = 10;
      }
    }

    return NextResponse.json(
      { sleepLog, pointsAwarded },
      { headers: { "api-version": "v1" } }
    );
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}
