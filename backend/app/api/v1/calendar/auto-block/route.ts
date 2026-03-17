import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { localToUtc } from "@/lib/calendarHelpers";
import { z } from "zod";

// ─── Validation ────────────────────────────────────────────────────────────

const autoBlockSchema = z.object({
  schoolDays: z.array(z.number().min(0).max(6)),
  schoolStart: z.string().regex(/^\d{2}:\d{2}$/),
  schoolEnd: z.string().regex(/^\d{2}:\d{2}$/),
  sleepStart: z.string().regex(/^\d{2}:\d{2}$/).optional(), // bedtime e.g. "22:00"
  sleepEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),   // wake e.g. "06:00"
  rangeDays: z.number().min(1).max(90).optional().default(30),
  timezone: z.string().optional(),
});

// Marker used to identify system-generated blocks
const AUTO_BLOCK_MARKER = "auto_block";
const SCHOOL_TITLE = "🏫 School Hours";
const SLEEP_TITLE = "😴 Sleep";

// ─── POST /api/v1/calendar/auto-block ──────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    const parsed = autoBlockSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { schoolDays, schoolStart, schoolEnd, rangeDays, sleepStart, sleepEnd } = parsed.data;
    const tz = parsed.data.timezone || "Asia/Riyadh";
    const db = supabaseAdmin();
    const userId = auth.user.id;

    // 1. Compute date range: today → today + rangeDays
    const today = new Date();
    const dates: string[] = [];
    for (let i = 0; i < rangeDays; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      dates.push(d.toISOString().slice(0, 10)); // YYYY-MM-DD
    }

    const rangeStart = dates[0];
    const rangeEnd = dates[dates.length - 1];

    // 2. Fetch ALL existing auto-blocked events (school + sleep) in range
    const startUtc = localToUtc(rangeStart, "00:00", tz);
    const endUtc = localToUtc(rangeEnd, "23:59", tz);

    const { data: existingBlocks } = await db
      .from("calendar_events")
      .select("id, title, start_at, notes")
      .eq("user_id", userId)
      .eq("notes", AUTO_BLOCK_MARKER)
      .gte("start_at", startUtc)
      .lte("start_at", endUtc);

    // 3. Separate existing blocks by type
    const existingSchoolByDate = new Map<string, string>(); // date → id
    const existingSleepByDate = new Map<string, string>();  // date → id

    for (const block of existingBlocks ?? []) {
      const startDate = new Date(block.start_at);
      const localDate = startDate.toLocaleDateString("en-CA", { timeZone: tz });
      if (block.title.startsWith("🏫")) {
        existingSchoolByDate.set(localDate, block.id);
      } else if (block.title.startsWith("😴")) {
        existingSleepByDate.set(localDate, block.id);
      }
    }

    // 4. Build expected school blocks
    const expectedSchoolDates = new Set<string>();
    for (const dateStr of dates) {
      const d = new Date(dateStr + "T12:00:00Z");
      const dayOfWeek = d.getUTCDay();
      if (schoolDays.includes(dayOfWeek)) {
        expectedSchoolDates.add(dateStr);
      }
    }

    // 5. Build expected sleep blocks (every day)
    const expectedSleepDates = new Set<string>(sleepStart && sleepEnd ? dates : []);

    // 6. Diff and collect deletes + inserts
    const toDelete: string[] = [];
    const toInsert: Array<{
      user_id: string;
      title: string;
      event_type: string;
      start_at: string;
      end_at: string;
      notes: string;
    }> = [];

    // School: delete stale, create missing
    for (const [date, id] of existingSchoolByDate) {
      if (!expectedSchoolDates.has(date)) toDelete.push(id);
    }
    for (const date of expectedSchoolDates) {
      if (!existingSchoolByDate.has(date)) {
        toInsert.push({
          user_id: userId,
          title: SCHOOL_TITLE,
          event_type: "other",
          start_at: localToUtc(date, schoolStart, tz),
          end_at: localToUtc(date, schoolEnd, tz),
          notes: AUTO_BLOCK_MARKER,
        });
      }
    }

    // Sleep: delete stale, create missing
    // Sleep block = evening portion on each day (sleepStart → 23:59)
    // The morning portion (00:00 → sleepEnd) is handled by day_bounds_start
    if (sleepStart && sleepEnd) {
      for (const [date, id] of existingSleepByDate) {
        if (!expectedSleepDates.has(date)) toDelete.push(id);
      }
      for (const date of expectedSleepDates) {
        if (!existingSleepByDate.has(date)) {
          toInsert.push({
            user_id: userId,
            title: SLEEP_TITLE,
            event_type: "other",
            start_at: localToUtc(date, sleepStart, tz),
            end_at: localToUtc(date, "23:59", tz),
            notes: AUTO_BLOCK_MARKER,
          });
        }
      }
    } else {
      // No sleep params → delete all existing sleep blocks
      for (const [, id] of existingSleepByDate) {
        toDelete.push(id);
      }
    }

    // 7. Execute deletes
    if (toDelete.length > 0) {
      await db.from("calendar_events").delete().in("id", toDelete);
    }

    // 8. Execute inserts
    if (toInsert.length > 0) {
      const { error: insertErr } = await db
        .from("calendar_events")
        .insert(toInsert);
      if (insertErr) {
        console.error("[auto-block] Insert error:", insertErr);
        return NextResponse.json(
          { error: "Failed to create blocks", details: insertErr.message },
          { status: 500 }
        );
      }
    }

    console.log(
      `[auto-block] user=${userId} deleted=${toDelete.length} created=${toInsert.length} range=${rangeStart}..${rangeEnd}`
    );

    return NextResponse.json({
      created: toInsert.length,
      deleted: toDelete.length,
      range: { start: rangeStart, end: rangeEnd },
    });
  } catch (err) {
    console.error("[auto-block] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
