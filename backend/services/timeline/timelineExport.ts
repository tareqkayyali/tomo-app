/**
 * Assembles the data the public Timeline print page renders into a calendar
 * grid PDF. Pure read-side: token has already been resolved by the caller.
 *
 * Returns one block per calendar month overlapping the requested range. Each
 * month is a Sun-Sat week grid; cells outside the requested range are blanked
 * but kept so the grid stays rectangular (matches school-calendar reference).
 *
 * Event-type filter: the public chip list uses frontend names. "study_block"
 * collapses to BOTH `study_block` and `study` enum values in the DB (legacy
 * + current rows), mirroring `lib/calendarHelpers.ts:DB_TO_FRONTEND_TYPE`.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { localToUtc } from "@/lib/calendarHelpers";

export interface TimelineGridEvent {
  time_local: string; // "7:00 AM" or "" for all-day
  title: string;
  type: string; // frontend type ("training" | "match" | ...)
}

export interface TimelineGridDay {
  iso: string;          // "YYYY-MM-DD"
  day_num: number;      // 1-31
  in_range: boolean;    // false → cell is rendered blank
  is_weekend: boolean;
  is_today: boolean;
  events: TimelineGridEvent[];
}

export interface TimelineGridMonth {
  year: number;
  month: number;        // 1-12
  label: string;        // "May 2025"
  weeks: TimelineGridDay[][]; // rows of 7
}

export interface TimelineGridDoc {
  athlete: { name: string; sport: string | null };
  range: { from: string; to: string };
  tz: string;
  generated_at: string;
  months: TimelineGridMonth[];
}

const MONTH_LABELS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

// Frontend chip → DB enum value(s).
const TYPE_CHIP_TO_DB: Record<string, string[]> = {
  training: ["training"],
  match: ["match"],
  recovery: ["recovery"],
  study_block: ["study_block", "study"],
  exam: ["exam"],
  other: ["other"],
};

function expandTypes(chips: string[]): string[] {
  const set = new Set<string>();
  for (const c of chips) {
    for (const v of TYPE_CHIP_TO_DB[c] ?? [c]) set.add(v);
  }
  return Array.from(set);
}

function formatTime12h(time24: string | null): string {
  if (!time24) return "";
  const [hStr, mStr] = time24.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (isNaN(h) || isNaN(m)) return "";
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const mm = m.toString().padStart(2, "0");
  return `${h12}:${mm} ${period}`;
}

function utcToLocalDateTime(isoStr: string, tz: string): { date: string; time: string } {
  const d = new Date(isoStr);
  const date = d.toLocaleDateString("en-CA", { timeZone: tz });
  const time = d.toLocaleTimeString("en-GB", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
  });
  return { date, time };
}

function todayLocal(tz: string): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: tz });
}

function isoFor(year: number, month1: number, day: number): string {
  const m = month1.toString().padStart(2, "0");
  const d = day.toString().padStart(2, "0");
  return `${year}-${m}-${d}`;
}

function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

function dowSundayFirst(year: number, month1: number, day: number): number {
  // 0=Sun..6=Sat using UTC to stay deterministic (calendar grid is tz-free).
  return new Date(Date.UTC(year, month1 - 1, day)).getUTCDay();
}

const DB_TO_FRONTEND: Record<string, string> = { study: "study_block" };

export async function assembleTimelineGrid(args: {
  userId: string;
  fromDate: string;     // "YYYY-MM-DD"
  toDate: string;       // "YYYY-MM-DD"
  eventTypes: string[]; // frontend chips
  tz: string;
}): Promise<TimelineGridDoc> {
  const db = supabaseAdmin();

  const { data: userRow } = await (db as any)
    .from("users")
    .select("name, sport")
    .eq("id", args.userId)
    .single();

  const dbTypes = expandTypes(args.eventTypes);
  const rangeStart = localToUtc(args.fromDate, "00:00:00", args.tz);
  const rangeEnd = localToUtc(args.toDate, "23:59:59", args.tz);

  let query = (db as any)
    .from("calendar_events")
    .select("title, event_type, start_at")
    .eq("user_id", args.userId)
    .gte("start_at", rangeStart)
    .lte("start_at", rangeEnd)
    .order("start_at", { ascending: true });

  if (dbTypes.length > 0) {
    query = query.in("event_type", dbTypes);
  }

  const { data: rows, error } = await query;
  if (error) throw new Error(`assembleTimelineGrid query failed: ${error.message}`);

  // Bucket by local-date.
  const buckets = new Map<string, TimelineGridEvent[]>();
  for (const r of (rows ?? []) as Array<Record<string, unknown>>) {
    const startAt = r.start_at ? String(r.start_at) : null;
    if (!startAt) continue;
    const local = utcToLocalDateTime(startAt, args.tz);
    const isAllDay = local.time === "00:00";
    const dbType = String(r.event_type || "other");
    const ev: TimelineGridEvent = {
      time_local: isAllDay ? "" : formatTime12h(local.time),
      title: String(r.title || ""),
      type: DB_TO_FRONTEND[dbType] ?? dbType,
    };
    const arr = buckets.get(local.date) ?? [];
    arr.push(ev);
    buckets.set(local.date, arr);
  }

  // Build months overlapping the range.
  const [fy, fm] = args.fromDate.split("-").map(Number);
  const [ty, tm] = args.toDate.split("-").map(Number);
  const today = todayLocal(args.tz);
  const months: TimelineGridMonth[] = [];

  let y = fy;
  let m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    const dim = daysInMonth(y, m);
    const firstDow = dowSundayFirst(y, m, 1);
    const lastDow = dowSundayFirst(y, m, dim);
    // Week rows: leading blanks + 1..dim + trailing blanks to fill last week.
    const cells: TimelineGridDay[] = [];

    for (let i = 0; i < firstDow; i++) {
      cells.push({
        iso: "", day_num: 0, in_range: false,
        is_weekend: i === 0 || i === 6, is_today: false, events: [],
      });
    }
    for (let d = 1; d <= dim; d++) {
      const iso = isoFor(y, m, d);
      const dow = dowSundayFirst(y, m, d);
      const inRange = iso >= args.fromDate && iso <= args.toDate;
      cells.push({
        iso,
        day_num: d,
        in_range: inRange,
        is_weekend: dow === 0 || dow === 6,
        is_today: iso === today,
        events: inRange ? (buckets.get(iso) ?? []) : [],
      });
    }
    const trailing = lastDow === 6 ? 0 : 6 - lastDow;
    for (let i = 0; i < trailing; i++) {
      const dow = (lastDow + 1 + i) % 7;
      cells.push({
        iso: "", day_num: 0, in_range: false,
        is_weekend: dow === 0 || dow === 6, is_today: false, events: [],
      });
    }

    const weeks: TimelineGridDay[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

    months.push({
      year: y,
      month: m,
      label: `${MONTH_LABELS[m - 1]} ${y}`,
      weeks,
    });

    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }

  return {
    athlete: {
      name: (userRow?.name as string) ?? "Athlete",
      sport: (userRow?.sport as string) ?? null,
    },
    range: { from: args.fromDate, to: args.toDate },
    tz: args.tz,
    generated_at: new Date().toISOString(),
    months,
  };
}
