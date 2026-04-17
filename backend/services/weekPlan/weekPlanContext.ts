/**
 * Week Plan Context Loader
 *
 * Gathers every input `weekPlanBuilder` needs from live state:
 *   - player_schedule_preferences (school, day bounds, exam/league flags)
 *   - calendar_events for the target week (existing events to avoid)
 *   - athlete_snapshots (readiness RAG + ACWR)
 *   - day_locks for the week
 *   - scheduling config (CMS-managed)
 *
 * Isolated so every endpoint (draft, validate-edit, commit, suggest) uses
 * the same input shape — no drift between preview and persistence.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  getSchedulingConfigFromCMS,
  type SchedulingConfig,
} from "@/services/schedulingEngine";
import type { ExistingEvent, PlayerPrefs } from "./weekPlanBuilder";
import { enumerateWeek } from "./weekPlanBuilder";

export interface LoadedContext {
  playerPrefs: PlayerPrefs;
  existingEvents: ExistingEvent[];
  readinessRag: "GREEN" | "AMBER" | "RED" | null;
  acwr: number | null;
  dayLocks: string[];
  config: SchedulingConfig;
}

export async function loadWeekPlanContext(args: {
  userId: string;
  weekStart: string;     // YYYY-MM-DD (Monday)
  timezone: string;
}): Promise<LoadedContext> {
  const db = supabaseAdmin();
  const weekDates = enumerateWeek(args.weekStart);
  const endDate = weekDates[weekDates.length - 1];

  const [prefsRes, eventsRes, snapRes, lockRes, config] = await Promise.all([
    (db as any)
      .from("player_schedule_preferences")
      .select(
        "school_days, school_start, school_end, day_bounds_start, day_bounds_end, weekend_bounds_start, weekend_bounds_end, league_is_active, exam_period_active",
      )
      .eq("user_id", args.userId)
      .maybeSingle(),
    (db as any)
      .from("calendar_events")
      .select("id, title, event_type, start_at, end_at, intensity")
      .eq("user_id", args.userId)
      .gte("start_at", `${args.weekStart}T00:00:00Z`)
      .lte("start_at", `${endDate}T23:59:59Z`),
    (db as any)
      .from("athlete_snapshots")
      .select("readiness_rag, acwr")
      .eq("athlete_id", args.userId)
      .maybeSingle(),
    // day_locks may not exist yet in every env; tolerate missing table.
    (db as any)
      .from("day_locks")
      .select("locked_date")
      .eq("user_id", args.userId)
      .gte("locked_date", args.weekStart)
      .lte("locked_date", endDate)
      .then(
        (r: any) => r,
        () => ({ data: [] }),
      ),
    getSchedulingConfigFromCMS(),
  ]);

  const prefs = prefsRes?.data ?? null;
  const playerPrefs: PlayerPrefs = {
    timezone: args.timezone || "UTC",
    schoolDays: prefs?.school_days ?? [],
    schoolStart: prefs?.school_start ?? "08:00",
    schoolEnd: prefs?.school_end ?? "15:00",
    dayBoundsStart: prefs?.day_bounds_start ?? "06:00",
    dayBoundsEnd: prefs?.day_bounds_end ?? "22:00",
    weekendBoundsStart: prefs?.weekend_bounds_start ?? undefined,
    weekendBoundsEnd: prefs?.weekend_bounds_end ?? undefined,
    leagueActive: Boolean(prefs?.league_is_active),
    examPeriodActive: Boolean(prefs?.exam_period_active),
  };

  const existingEvents: ExistingEvent[] = (eventsRes?.data ?? []).map(
    (row: any) => {
      // start_at / end_at are UTC ISO — convert back to local HH:MM + date.
      const start = new Date(row.start_at);
      const end = row.end_at ? new Date(row.end_at) : null;
      return {
        id: String(row.id),
        name: row.title,
        date: toLocalISODate(start, args.timezone),
        startTime: toLocalHHMM(start, args.timezone),
        endTime: end ? toLocalHHMM(end, args.timezone) : null,
        eventType: row.event_type,
        intensity: row.intensity ?? null,
      };
    },
  );

  const snap = snapRes?.data ?? null;
  const rag = normaliseRag(snap?.readiness_rag);
  const acwr = typeof snap?.acwr === "number" ? snap.acwr : null;

  const lockRows = (lockRes as any)?.data ?? [];
  const dayLocks = lockRows.map((r: any) => r.locked_date);

  return {
    playerPrefs,
    existingEvents,
    readinessRag: rag,
    acwr,
    dayLocks,
    config,
  };
}

function normaliseRag(
  raw: unknown,
): "GREEN" | "AMBER" | "RED" | null {
  if (!raw) return null;
  const s = String(raw).toUpperCase();
  if (s === "GREEN" || s === "AMBER" || s === "RED") return s;
  return null;
}

function toLocalHHMM(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const hh = parts.find((p) => p.type === "hour")?.value ?? "00";
  const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${hh}:${mm}`;
}

function toLocalISODate(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const dd = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${dd}`;
}
