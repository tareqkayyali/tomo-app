/**
 * Timeline Agent — owns all calendar operations.
 * Adapted to actual Tomo schema: calendar_events uses title, start_at, end_at (timestamptz).
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { PlayerContext } from "./contextBuilder";
import { getDayBoundsISO, toTimezoneISO } from "./contextBuilder";
import { estimateTotalLoad } from "@/services/events/computations/loadEstimator";
import { bridgeCalendarToEventStream } from "@/services/events/calendarBridge";
import { findAvailableSlots, configFromEffectiveRules, minutesToTime, type ScheduleEvent } from "@/services/schedulingEngine";
import { getEffectiveRules } from "@/services/scheduling/scheduleRuleEngine";

// ── Helpers ──────────────────────────────────────────────────

/** Get the next occurrence of a weekday (0=Sun..6=Sat) from a given date string.
 *  If today IS that weekday, return today. Otherwise advance to next occurrence. */
function getNextWeekday(todayStr: string, targetDow: number): string {
  const d = new Date(`${todayStr}T12:00:00`);
  const currentDow = d.getDay();
  let diff = targetDow - currentDow;
  if (diff < 0) diff += 7;
  if (diff === 0) diff = 0; // today is that day
  d.setDate(d.getDate() + diff);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const totalMin = h * 60 + (m ?? 0) + minutes;
  const newH = Math.min(Math.floor(totalMin / 60), 23);
  const newM = totalMin % 60;
  return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`;
}

// ── TOOL DEFINITIONS (passed to Claude API) ──────────────────

export const timelineTools = [
  {
    name: "get_today_events",
    description:
      "Get the player's calendar events for a specific date. IMPORTANT: If the conversation was about a specific day (e.g. 'tomorrow', 'Monday'), you MUST pass that date — do NOT default to today. Only omit the date parameter when the user explicitly asks about today.",
    input_schema: {
      type: "object" as const,
      properties: {
        date: {
          type: "string",
          description: "Date in YYYY-MM-DD format. REQUIRED when the conversation context refers to a day other than today. Defaults to today only if user explicitly asks about 'today'.",
        },
      },
    },
  },
  {
    name: "get_week_schedule",
    description:
      "Get the player's calendar for the next 7 days. Use when asked about the week ahead, upcoming events, or planning.",
    input_schema: {
      type: "object" as const,
      properties: {
        startDate: {
          type: "string",
          description: "Start date YYYY-MM-DD. Defaults to today.",
        },
      },
    },
  },
  {
    name: "create_event",
    description:
      "Add a new event to the player calendar. The system will automatically show a confirmation card to the player before executing — just call this tool directly with the correct parameters. Do NOT describe the event in text and ask the player to confirm verbally. Use for adding training sessions, exams, study blocks, matches, or recovery blocks. When adding MULTIPLE events, call this tool multiple times in the same response (one per event). IMPORTANT: You MUST always include startTime and endTime. If the player didn't specify a time, ASK them before calling this tool. Never create an event without a time slot.",
    input_schema: {
      type: "object" as const,
      required: ["title", "event_type", "date", "startTime", "endTime"],
      properties: {
        title: { type: "string", description: "Event title" },
        event_type: {
          type: "string",
          enum: ["training", "match", "study", "exam", "recovery", "other"],
          description: "Event type",
        },
        date: { type: "string", description: "YYYY-MM-DD" },
        startTime: { type: "string", description: "HH:MM format (24h). REQUIRED — ask the player if not specified." },
        endTime: { type: "string", description: "HH:MM format (24h). REQUIRED — ask the player if not specified." },
        intensity: {
          type: "string",
          enum: ["REST", "LIGHT", "MODERATE", "HARD"],
          description: "Intensity level (for training/match only)",
        },
        notes: { type: "string" },
      },
    },
  },
  {
    name: "update_event",
    description:
      "Update an existing calendar event. Use for rescheduling or editing event details. The system handles confirmation automatically — just call this tool directly.",
    input_schema: {
      type: "object" as const,
      required: ["eventId"],
      properties: {
        eventId: { type: "string" },
        title: { type: "string" },
        date: { type: "string" },
        startTime: { type: "string" },
        endTime: { type: "string" },
        intensity: { type: "string" },
        notes: { type: "string" },
      },
    },
  },
  {
    name: "delete_event",
    description:
      "Delete a FUTURE calendar event. NEVER delete past events. The system handles confirmation automatically — just call this tool directly. When the conversation was discussing a specific day, delete from THAT day — not today.",
    input_schema: {
      type: "object" as const,
      required: ["eventId", "eventTitle"],
      properties: {
        eventId: { type: "string" },
        eventTitle: {
          type: "string",
          description: "Human-readable title for confirmation message",
        },
      },
    },
  },
  {
    name: "detect_load_collision",
    description:
      "Check if there are schedule conflicts or dual-load collisions — exam + high intensity training on the same day, or overloaded days. Use proactively when player adds events.",
    input_schema: {
      type: "object" as const,
      properties: {
        dateRange: {
          type: "number",
          description: "Number of days to check from today. Default 7.",
        },
      },
    },
  },
];

// ── TOOL EXECUTION ────────────────────────────────────────────

export async function executeTimelineTool(
  toolName: string,
  toolInput: Record<string, any>,
  context: PlayerContext
): Promise<{ result: any; refreshTarget?: string; error?: string }> {
  const db = supabaseAdmin();
  const userId = context.userId;
  const today = context.todayDate;

  try {
    switch (toolName) {
      case "get_today_events": {
        const date = toolInput.date ?? today;
        const [dayStart, dayEnd] = getDayBoundsISO(date, context.timezone);
        const { data, error } = await db
          .from("calendar_events")
          .select("*")
          .eq("user_id", userId)
          .gte("start_at", dayStart)
          .lte("start_at", dayEnd)
          .order("start_at");
        if (error) throw error;
        // Convert UTC times to player's local timezone for Claude
        const localEvents = (data ?? []).map(e => ({
          ...e,
          local_start: new Date(e.start_at).toLocaleString("en-GB", { timeZone: context.timezone, hour: "2-digit", minute: "2-digit", hour12: false }),
          local_end: e.end_at ? new Date(e.end_at).toLocaleString("en-GB", { timeZone: context.timezone, hour: "2-digit", minute: "2-digit", hour12: false }) : null,
          local_date: new Date(e.start_at).toLocaleDateString("en-CA", { timeZone: context.timezone }),
        }));
        return { result: { date, timezone: context.timezone, events: localEvents } };
      }

      case "get_week_schedule": {
        const start = toolInput.startDate ?? today;
        const end = new Date(new Date(start).getTime() + 7 * 86400000)
          .toLocaleDateString("en-CA", { timeZone: context.timezone });
        const [weekStart] = getDayBoundsISO(start, context.timezone);
        const [, weekEnd] = getDayBoundsISO(end, context.timezone);
        const { data, error } = await db
          .from("calendar_events")
          .select("*")
          .eq("user_id", userId)
          .gte("start_at", weekStart)
          .lte("start_at", weekEnd)
          .order("start_at");
        if (error) throw error;

        // Group by LOCAL date (not UTC) and add local times
        const byDate: Record<string, any[]> = {};
        for (const event of data ?? []) {
          const localDate = new Date(event.start_at).toLocaleDateString("en-CA", { timeZone: context.timezone });
          const localStart = new Date(event.start_at).toLocaleString("en-GB", { timeZone: context.timezone, hour: "2-digit", minute: "2-digit", hour12: false });
          const localEnd = event.end_at ? new Date(event.end_at).toLocaleString("en-GB", { timeZone: context.timezone, hour: "2-digit", minute: "2-digit", hour12: false }) : null;
          if (!byDate[localDate]) byDate[localDate] = [];
          byDate[localDate].push({ ...event, local_start: localStart, local_end: localEnd, local_date: localDate });
        }
        return { result: { startDate: start, endDate: end, timezone: context.timezone, schedule: byDate } };
      }

      case "create_event": {
        // ── Validate required time fields ──
        if (!toolInput.startTime || !toolInput.endTime) {
          return {
            result: null,
            error: "Missing time — I need both a start time and end time to add this event. What time should it be?",
          };
        }

        const startAt = toTimezoneISO(toolInput.date, `${toolInput.startTime}:00`, context.timezone);
        const endAt = toTimezoneISO(toolInput.date, `${toolInput.endTime}:00`, context.timezone);

        const durationMin = (new Date(endAt).getTime() - new Date(startAt).getTime()) / 60000;
        const estimatedLoad = estimateTotalLoad({
          event_type: toolInput.event_type,
          intensity: toolInput.intensity ?? null,
          duration_min: durationMin,
        });

        const { data, error } = await db
          .from("calendar_events")
          .insert({
            user_id: userId,
            title: toolInput.title,
            event_type: toolInput.event_type,
            start_at: startAt,
            end_at: endAt,
            intensity: toolInput.intensity ?? null,
            notes: toolInput.notes ?? null,
            estimated_load_au: estimatedLoad,
          } as any)
          .select()
          .single();

        if (error) throw error;

        // Bridge to Layer 1 event stream for RIE (fire-and-forget)
        const created = data as any;
        bridgeCalendarToEventStream({
          athleteId: userId,
          calendarEvent: {
            id: created.id,
            title: toolInput.title,
            event_type: toolInput.event_type,
            start_at: startAt,
            end_at: endAt,
            intensity: toolInput.intensity ?? null,
            estimated_load_au: estimatedLoad,
          },
          action: 'CREATED',
          createdBy: userId,
        }).catch((err) => console.error('[CalendarBridge] chat bridge error:', err));

        return {
          result: {
            created: data,
            // Include local times for display — avoids AI showing UTC
            localDate: toolInput.date,
            localStartTime: toolInput.startTime,
            localEndTime: toolInput.endTime,
            title: toolInput.title,
            eventType: toolInput.event_type,
            intensity: toolInput.intensity ?? null,
            estimatedLoadAU: estimatedLoad,
          },
          refreshTarget: "calendar",
        };
      }

      case "update_event": {
        const updates: Record<string, any> = {};
        if (toolInput.title) updates.title = toolInput.title;
        if (toolInput.date && toolInput.startTime) {
          updates.start_at = toTimezoneISO(toolInput.date, `${toolInput.startTime}:00`, context.timezone);
        } else if (toolInput.date && !toolInput.startTime) {
          // Date changed without time — need to preserve existing time or ask user
          return {
            result: null,
            error: "I need a start time to reschedule this event. What time should it be?",
          };
        }
        if (toolInput.date && toolInput.endTime) {
          updates.end_at = toTimezoneISO(toolInput.date, `${toolInput.endTime}:00`, context.timezone);
        }
        if (toolInput.intensity !== undefined)
          updates.intensity = toolInput.intensity;
        if (toolInput.notes) updates.notes = toolInput.notes;

        const { data, error } = await db
          .from("calendar_events")
          .update(updates)
          .eq("id", toolInput.eventId)
          .eq("user_id", userId)
          .select()
          .single();

        if (error) throw error;

        // Bridge update to Layer 1 event stream for RIE (fire-and-forget)
        const updatedEvt = data as any;
        if (updatedEvt) {
          const dur = updatedEvt.end_at && updatedEvt.start_at
            ? (new Date(updatedEvt.end_at).getTime() - new Date(updatedEvt.start_at).getTime()) / 60000
            : 60;
          bridgeCalendarToEventStream({
            athleteId: userId,
            calendarEvent: {
              id: updatedEvt.id,
              title: updatedEvt.title,
              event_type: updatedEvt.event_type,
              start_at: updatedEvt.start_at,
              end_at: updatedEvt.end_at,
              intensity: updatedEvt.intensity ?? null,
              estimated_load_au: updatedEvt.estimated_load_au ?? estimateTotalLoad({
                event_type: updatedEvt.event_type,
                intensity: updatedEvt.intensity ?? null,
                duration_min: dur,
              }),
            },
            action: 'UPDATED',
            createdBy: userId,
          }).catch((err) => console.error('[CalendarBridge] chat bridge error:', err));
        }

        return { result: { updated: data }, refreshTarget: "calendar" };
      }

      case "delete_event": {
        // Fetch event data before deletion for bridge
        const { data: delTarget } = await db
          .from("calendar_events")
          .select("id, title, event_type, start_at, end_at, intensity, estimated_load_au")
          .eq("id", toolInput.eventId)
          .eq("user_id", userId)
          .single();

        const { error } = await db
          .from("calendar_events")
          .delete()
          .eq("id", toolInput.eventId)
          .eq("user_id", userId);

        if (error) throw error;

        // Bridge deletion to Layer 1 event stream for RIE (fire-and-forget)
        if (delTarget) {
          const dt = delTarget as any;
          bridgeCalendarToEventStream({
            athleteId: userId,
            calendarEvent: {
              id: dt.id,
              title: dt.title ?? '',
              event_type: dt.event_type,
              start_at: dt.start_at,
              end_at: dt.end_at,
              intensity: dt.intensity ?? null,
              estimated_load_au: dt.estimated_load_au ?? null,
            },
            action: 'DELETED',
            createdBy: userId,
          }).catch((err) => console.error('[CalendarBridge] chat bridge error:', err));
        }

        return {
          result: { deleted: true, eventId: toolInput.eventId, actualTitle: delTarget?.title ?? toolInput.eventTitle },
          refreshTarget: "calendar",
        };
      }

      case "bulk_delete_events": {
        const eventIds = toolInput.eventIds as string[];
        if (!Array.isArray(eventIds) || eventIds.length === 0) {
          return { result: null, error: "No events selected for deletion." };
        }

        // Fetch all target events (verify ownership)
        const { data: targets } = await db
          .from("calendar_events")
          .select("id, title, event_type, start_at, end_at, intensity, estimated_load_au")
          .eq("user_id", userId)
          .in("id", eventIds);

        const validIds = (targets ?? []).map((t: any) => t.id);
        if (validIds.length === 0) {
          return { result: null, error: "No matching events found." };
        }

        // Bulk delete
        const { error: delErr } = await db
          .from("calendar_events")
          .delete()
          .eq("user_id", userId)
          .in("id", validIds);

        if (delErr) throw delErr;

        // Bridge each deletion to event stream (fire-and-forget)
        for (const t of targets ?? []) {
          const dt = t as any;
          bridgeCalendarToEventStream({
            athleteId: userId,
            calendarEvent: {
              id: dt.id, title: dt.title ?? '', event_type: dt.event_type,
              start_at: dt.start_at, end_at: dt.end_at,
              intensity: dt.intensity ?? null,
              estimated_load_au: dt.estimated_load_au ?? null,
            },
            action: 'DELETED',
            createdBy: userId,
          }).catch((err) => console.error('[CalendarBridge] bulk delete error:', err));
        }

        return {
          result: { deleted: validIds.length, skipped: eventIds.length - validIds.length },
          refreshTarget: "calendar",
        };
      }

      case "detect_load_collision": {
        const days = toolInput.dateRange ?? 7;
        const endDate = new Date(Date.now() + days * 86400000)
          .toLocaleDateString("en-CA", { timeZone: context.timezone });
        const [collisionStart] = getDayBoundsISO(today, context.timezone);
        const [, collisionEnd] = getDayBoundsISO(endDate, context.timezone);

        const { data: events } = await db
          .from("calendar_events")
          .select("id, start_at, end_at, event_type, intensity, title")
          .eq("user_id", userId)
          .gte("start_at", collisionStart)
          .lte("start_at", collisionEnd);

        // Group by local date and detect issues
        const byDate: Record<string, any[]> = {};
        for (const event of events ?? []) {
          const localDate = new Date(event.start_at).toLocaleDateString("en-CA", { timeZone: context.timezone });
          const localStart = new Date(event.start_at).toLocaleString("en-GB", { timeZone: context.timezone, hour: "2-digit", minute: "2-digit", hour12: false });
          const localEnd = event.end_at ? new Date(event.end_at).toLocaleString("en-GB", { timeZone: context.timezone, hour: "2-digit", minute: "2-digit", hour12: false }) : "";
          if (!byDate[localDate]) byDate[localDate] = [];
          byDate[localDate].push({ ...event, localDate, localStart, localEnd });
        }

        const collisions: any[] = [];
        for (const [date, dayEvents] of Object.entries(byDate)) {
          const hasHighIntensity = dayEvents.some(
            (e: any) => (e.event_type === "training" || e.event_type === "match") && (e.intensity === "HARD" || e.intensity === "MODERATE")
          );
          const hasExam = dayEvents.some((e: any) => e.event_type === "exam");
          const trainings = dayEvents.filter((e: any) => e.event_type === "training" || e.event_type === "match");

          if (hasHighIntensity && hasExam) {
            const clashingEvents = dayEvents.filter((e: any) =>
              e.event_type === "exam" || ((e.event_type === "training" || e.event_type === "match") && (e.intensity === "HARD" || e.intensity === "MODERATE"))
            );
            const trainingEvent = clashingEvents.find((e: any) => e.event_type === "training" || e.event_type === "match");
            const examEvent = clashingEvents.find((e: any) => e.event_type === "exam");
            collisions.push({
              date,
              issue: "High intensity training + exam on same day — cognitive and physical overload risk",
              severity: "danger",
              events: clashingEvents.map((e: any) => ({
                id: e.id, title: e.title, eventType: e.event_type, localStart: e.localStart, localEnd: e.localEnd, intensity: e.intensity,
              })),
              suggestions: [
                ...(trainingEvent ? [
                  { label: `Lower ${trainingEvent.title}`, action: `Change the intensity of "${trainingEvent.title}" at ${trainingEvent.localStart} on ${date} to LIGHT` },
                  { label: `Move ${trainingEvent.title}`, action: `Move "${trainingEvent.title}" currently at ${trainingEvent.localStart} on ${date} to the next available day. Check my calendar for ${date} first.` },
                ] : []),
              ],
            });
          }
          if (trainings.length >= 2) {
            // Pick the second training as the one to move (keep the first)
            const sortedTrainings = [...trainings].sort((a: any, b: any) => a.localStart.localeCompare(b.localStart));
            const keepEvent = sortedTrainings[0];
            const moveEvent = sortedTrainings[sortedTrainings.length - 1];
            collisions.push({
              date,
              issue: `Double training day — ${trainings.length} sessions back-to-back`,
              severity: "warning",
              events: trainings.map((e: any) => ({
                id: e.id, title: e.title, eventType: e.event_type, localStart: e.localStart, localEnd: e.localEnd, intensity: e.intensity,
              })),
              suggestions: [
                { label: `Move ${moveEvent.title}`, action: `Move "${moveEvent.title}" currently at ${moveEvent.localStart} on ${date} to the next available day. Check my calendar for ${date} first.` },
                { label: `Lower ${moveEvent.title}`, action: `Change the intensity of "${moveEvent.title}" at ${moveEvent.localStart} on ${date} to LIGHT` },
              ],
            });
          }
        }

        return {
          result: {
            collisions,
            daysChecked: days,
            totalEvents: events?.length ?? 0,
          },
        };
      }

      case "get_ghost_suggestions": {
        // Fetch ghost suggestions for the next 7 days
        const { data: events } = await db
          .from("calendar_events")
          .select("title, event_type, start_at, end_at")
          .eq("user_id", userId)
          .gte("start_at", new Date(Date.now() - 28 * 86400000).toISOString())
          .lte("start_at", new Date().toISOString())
          .order("start_at", { ascending: true });

        // Simple pattern detection: group by day of week + title
        const patterns: Record<string, { count: number; name: string; type: string; times: string[] }> = {};
        for (const e of events ?? []) {
          const d = new Date(e.start_at);
          const dow = d.getDay();
          const key = `${dow}_${e.title}`;
          if (!patterns[key]) patterns[key] = { count: 0, name: e.title, type: e.event_type, times: [] };
          patterns[key].count++;
          const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: context.timezone });
          patterns[key].times.push(time);
        }

        // Find next 7 days occurrences for patterns with >=2 occurrences
        const suggestions: any[] = [];
        const todayDate = new Date();
        for (let i = 1; i <= 7; i++) {
          const futureDate = new Date(todayDate.getTime() + i * 86400000);
          const dow = futureDate.getDay();
          const dateStr = futureDate.toISOString().split("T")[0];
          for (const [key, pattern] of Object.entries(patterns)) {
            if (key.startsWith(`${dow}_`) && pattern.count >= 2) {
              const mostCommonTime = pattern.times.sort((a, b) =>
                pattern.times.filter(t => t === a).length - pattern.times.filter(t => t === b).length
              ).pop() ?? null;
              suggestions.push({
                suggestion: {
                  patternKey: key,
                  name: pattern.name,
                  type: pattern.type,
                  startTime: mostCommonTime,
                  endTime: null,
                  confidence: Math.min(pattern.count / 4, 1),
                  patternDescription: `${pattern.count} out of 4 weeks`,
                },
                date: dateStr,
              });
            }
          }
        }

        return { result: { suggestions } };
      }

      case "confirm_ghost_suggestion": {
        const startAt = toolInput.startTime
          ? toTimezoneISO(toolInput.date, `${toolInput.startTime}:00`, context.timezone)
          : toTimezoneISO(toolInput.date, "09:00:00", context.timezone);
        const endTime = toolInput.endTime ?? (toolInput.startTime ? addMinutesToTime(toolInput.startTime, 60) : "10:00");
        const endAt = toTimezoneISO(toolInput.date, `${endTime}:00`, context.timezone);

        const { data, error } = await db
          .from("calendar_events")
          .insert({
            user_id: userId,
            title: toolInput.name,
            event_type: toolInput.eventType ?? "training",
            start_at: startAt,
            end_at: endAt,
            notes: "Auto-confirmed from pattern suggestion",
          } as any)
          .select()
          .single();

        if (error) throw error;
        return { result: { confirmed: true, event: data }, refreshTarget: "calendar" };
      }

      case "dismiss_ghost_suggestion": {
        // Client-side tracking — no server table needed
        return { result: { dismissed: true, patternKey: toolInput.patternKey } };
      }

      case "lock_day": {
        const { error } = await (db as any)
          .from("day_locks")
          .upsert({ user_id: userId, date: toolInput.date, locked_at: new Date().toISOString() }, { onConflict: "user_id,date" });
        if (error) throw error;
        return { result: { locked: true, date: toolInput.date }, refreshTarget: "calendar" };
      }

      case "unlock_day": {
        await (db as any)
          .from("day_locks")
          .delete()
          .eq("user_id", userId)
          .eq("date", toolInput.date);
        return { result: { locked: false, date: toolInput.date }, refreshTarget: "calendar" };
      }

      case "update_schedule_rules": {
        // Update schedule preferences — accepts any valid field from the schema
        const { error } = await db
          .from("player_schedule_preferences")
          .upsert({ user_id: userId, ...toolInput, updated_at: new Date().toISOString() } as any, { onConflict: "user_id" });
        if (error) throw error;
        return { result: { updated: true, fields: Object.keys(toolInput) }, refreshTarget: "rules" };
      }

      case "generate_training_plan": {
        const planWeeks = toolInput.planWeeks ?? 2;
        const categories = toolInput.categories ?? [];
        const tz = context.timezone || "UTC";
        console.log(`[TZ-DEBUG] generate_training_plan: tz="${tz}", context.timezone="${context.timezone}"`);

        // 1. Save updated categories to preferences
        if (categories.length > 0) {
          const { data: currentPrefs } = await db
            .from("player_schedule_preferences")
            .select("training_categories")
            .eq("user_id", userId)
            .single();

          const existingCats = Array.isArray((currentPrefs as any)?.training_categories)
            ? (currentPrefs as any).training_categories : [];

          const updatedCats = existingCats.map((existing: any) => {
            const updated = categories.find((c: any) => c.id === existing.id);
            return updated ? { ...existing, ...updated, enabled: true } : existing;
          });

          await db
            .from("player_schedule_preferences")
            .upsert({ user_id: userId, training_categories: updatedCats, updated_at: new Date().toISOString() } as any, { onConflict: "user_id" });
        }

        // 2. Fetch existing events to detect duplicates (same title + same date)
        const planEndDate = new Date(`${context.todayDate}T12:00:00`);
        planEndDate.setDate(planEndDate.getDate() + 1 + planWeeks * 7);
        const planEndStr = planEndDate.toISOString();

        const { data: existingEvents } = await db
          .from("calendar_events")
          .select("title, start_at")
          .eq("user_id", userId)
          .gte("start_at", new Date(`${context.todayDate}T00:00:00Z`).toISOString())
          .lte("start_at", planEndStr);

        // Build a set of "title|YYYY-MM-DD" for fast duplicate lookup
        const existingKeys = new Set<string>();
        for (const evt of existingEvents ?? []) {
          const dateKey = new Date(evt.start_at).toISOString().slice(0, 10);
          existingKeys.add(`${evt.title}|${dateKey}`);
        }

        const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        let createdCount = 0;
        let skippedCount = 0;
        const createdSummary: string[] = [];

        for (const cat of categories) {
          if (!cat.label) continue;
          const sessionsPerWeek = cat.mode === "fixed_days" && cat.fixedDays?.length
            ? cat.fixedDays.length
            : (cat.daysPerWeek ?? 3);
          const duration = cat.sessionDuration ?? 90;

          // Determine which days to schedule
          let scheduleDays: number[] = [];
          if (cat.mode === "fixed_days" && cat.fixedDays?.length) {
            scheduleDays = cat.fixedDays;
          } else {
            // Spread evenly across the week
            const spacing = Math.floor(7 / sessionsPerWeek);
            for (let i = 0; i < sessionsPerWeek; i++) {
              scheduleDays.push((1 + i * spacing) % 7); // start from Monday
            }
          }

          // Determine time
          let startTime = cat.fixedStartTime || "";
          let endTime = cat.fixedEndTime || "";
          if (!startTime) {
            const timeDefaults: Record<string, [string, string]> = {
              morning: ["08:00", ""],
              afternoon: ["15:00", ""],
              evening: ["18:00", ""],
            };
            const [s] = timeDefaults[cat.preferredTime] || ["18:00", ""];
            startTime = s;
          }
          if (!endTime) {
            const [h, m] = startTime.split(":").map(Number);
            const totalMin = h * 60 + m + duration;
            endTime = `${String(Math.floor(totalMin / 60) % 24).padStart(2, "0")}:${String(totalMin % 60).padStart(2, "0")}`;
          }

          // Create events for each week
          for (let week = 0; week < planWeeks; week++) {
            for (const dayOfWeek of scheduleDays) {
              // Use context.todayDate (YYYY-MM-DD) for reliable date math
              const baseDate = new Date(`${context.todayDate}T12:00:00`);
              baseDate.setDate(baseDate.getDate() + 1 + week * 7); // start tomorrow + week offset
              const currentDow = baseDate.getDay();
              let daysUntil = dayOfWeek - currentDow;
              if (daysUntil < 0) daysUntil += 7;
              baseDate.setDate(baseDate.getDate() + daysUntil);

              const dateStr = `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, "0")}-${String(baseDate.getDate()).padStart(2, "0")}`;

              // Skip if duplicate (same title + same date already exists)
              const dupKey = `${cat.label}|${dateStr}`;
              if (existingKeys.has(dupKey)) {
                skippedCount++;
                continue;
              }

              // Use toTimezoneISO for proper timezone conversion (same as create_event)
              const startAtUtc = toTimezoneISO(dateStr, `${startTime}:00`, tz);
              const endAtUtc = toTimezoneISO(dateStr, `${endTime}:00`, tz);
              console.log(`[TZ-DEBUG] plan event: local=${startTime}-${endTime} tz=${tz} → UTC start=${startAtUtc} end=${endAtUtc}`);

              const durationMin = (new Date(endAtUtc).getTime() - new Date(startAtUtc).getTime()) / 60000;

              const { error: insertErr } = await db
                .from("calendar_events")
                .insert({
                  user_id: userId,
                  title: cat.label,
                  event_type: "training",
                  start_at: startAtUtc,
                  end_at: endAtUtc,
                  intensity: durationMin >= 90 ? "HARD" : durationMin >= 60 ? "MODERATE" : "LIGHT",
                  notes: "Auto-generated from training plan",
                  estimated_load_au: durationMin >= 90 ? 7 : durationMin >= 60 ? 5 : 3,
                });

              if (!insertErr) createdCount++;
            }
          }

          createdSummary.push(`${cat.label}: ${scheduleDays.map((d: number) => DAY_NAMES[d]).join(", ")} (${startTime}–${endTime})`);
        }

        console.log("[generate-training-plan]", JSON.stringify({
          userId,
          planWeeks,
          categoriesCount: categories.length,
          eventsCreated: createdCount,
          skipped: skippedCount,
          schedule: createdSummary,
          todayDate: context.todayDate,
          tz,
        }));

        const skippedNote = skippedCount > 0 ? ` (${skippedCount} skipped — already exist)` : "";
        return {
          result: {
            success: true,
            planWeeks,
            eventsCreated: createdCount,
            skippedCount,
            schedule: createdSummary,
            message: createdCount > 0
              ? `Created ${createdCount} training blocks across ${planWeeks} weeks${skippedNote}. Check your Timeline!`
              : skippedCount > 0
                ? `All ${skippedCount} blocks already exist in your calendar — no duplicates added.`
                : `No blocks created — make sure you have categories enabled with days selected.`,
          },
          refreshTarget: "calendar",
        };
      }

      case "add_exam": {
        const { subject, examType, examDate } = toolInput;
        if (!subject || !examDate) {
          return { result: null, error: "Subject and exam date are required" };
        }

        // Load current exam schedule, append new exam
        const { data: prefs } = await db
          .from("player_schedule_preferences")
          .select("exam_schedule")
          .eq("user_id", userId)
          .single();

        const existingExams = Array.isArray((prefs as any)?.exam_schedule)
          ? (prefs as any).exam_schedule : [];

        const newExam = {
          id: `exam_${Date.now()}`,
          subject,
          examType: examType ?? "final",
          examDate,
        };

        const updatedExams = [...existingExams, newExam];

        const { error } = await db
          .from("player_schedule_preferences")
          .upsert({
            user_id: userId,
            exam_schedule: updatedExams,
            updated_at: new Date().toISOString(),
          } as any, { onConflict: "user_id" });

        if (error) throw error;

        return {
          result: { success: true, exam: newExam, totalExams: updatedExams.length },
          refreshTarget: "rules",
        };
      }

      case "generate_study_plan": {
        const preExamWeeks = toolInput.preExamStudyWeeks ?? 3;
        const daysPerSub = toolInput.daysPerSubject ?? 3;

        // Save updated study config
        await db
          .from("player_schedule_preferences")
          .upsert({
            user_id: userId,
            pre_exam_study_weeks: preExamWeeks,
            days_per_subject: daysPerSub,
            exam_period_active: true,
            updated_at: new Date().toISOString(),
          } as any, { onConflict: "user_id" });

        return {
          result: {
            success: true,
            preExamStudyWeeks: preExamWeeks,
            daysPerSubject: daysPerSub,
            message: `Study plan configured: ${preExamWeeks} weeks prep, ${daysPerSub} days per subject. Exam period activated.`,
          },
          refreshTarget: "calendar",
        };
      }

      case "generate_regular_study_plan": {
        const subjects: string[] = toolInput.subjects ?? [];
        const days: number[] = toolInput.days ?? [];
        const sessionDurationMin: number = toolInput.sessionDurationMin ?? 60;
        const planWeeks: number = toolInput.planWeeks ?? 4;
        const tz = context.timezone || "UTC";

        if (subjects.length === 0 || days.length === 0) {
          return { result: null, error: "At least one subject and one day are required" };
        }

        // 1. Save config to preferences
        await db
          .from("player_schedule_preferences")
          .upsert({
            user_id: userId,
            regular_study_config: { subjects, days, sessionDurationMin, planWeeks },
            updated_at: new Date().toISOString(),
          } as any, { onConflict: "user_id" });

        // 2. Fetch player schedule preferences for rule engine
        const { data: prefs } = await db.from("player_schedule_preferences")
          .select("*")
          .eq("user_id", userId)
          .single();

        // 3. Build scheduling config from effective rules
        const effectiveRules = getEffectiveRules(prefs as any ?? {});
        const schoolSchedule = (prefs as any)?.school_hours
          ? { days: (prefs as any).school_hours.days ?? [], startTime: (prefs as any).school_hours.startTime ?? "08:00", endTime: (prefs as any).school_hours.endTime ?? "15:00" }
          : null;
        const schedConfig = configFromEffectiveRules(effectiveRules, schoolSchedule);

        // 4. Fetch existing events for duplicate detection
        const planEndDate = new Date(`${context.todayDate}T12:00:00`);
        planEndDate.setDate(planEndDate.getDate() + 1 + planWeeks * 7);

        const { data: existingEvents } = await db
          .from("calendar_events")
          .select("id, title, start_at, end_at, event_type, intensity")
          .eq("user_id", userId)
          .gte("start_at", new Date(`${context.todayDate}T00:00:00Z`).toISOString())
          .lte("start_at", planEndDate.toISOString());

        const existingKeys = new Set<string>();
        for (const evt of existingEvents ?? []) {
          const dateKey = new Date(evt.start_at).toISOString().slice(0, 10);
          existingKeys.add(`${evt.title}|${dateKey}`);
        }

        const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        let createdCount = 0;
        let skippedCount = 0;
        const warnings: string[] = [];
        const createdSummary: string[] = [];
        let subjectIdx = 0;

        // 5. For each week, for each selected day, find best slot & create event
        for (let week = 0; week < planWeeks; week++) {
          for (const dayOfWeek of days) {
            // Calculate target date
            const baseDate = new Date(`${context.todayDate}T12:00:00`);
            baseDate.setDate(baseDate.getDate() + 1 + week * 7);
            const currentDow = baseDate.getDay();
            let daysUntil = dayOfWeek - currentDow;
            if (daysUntil < 0) daysUntil += 7;
            baseDate.setDate(baseDate.getDate() + daysUntil);

            const dateStr = `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, "0")}-${String(baseDate.getDate()).padStart(2, "0")}`;

            // Round-robin subject assignment
            const subject = subjects[subjectIdx % subjects.length];
            subjectIdx++;

            const title = `Study: ${subject}`;

            // Skip if duplicate
            if (existingKeys.has(`${title}|${dateStr}`)) {
              skippedCount++;
              continue;
            }

            // Build events list for this day (for slot finding)
            const dayEvents: ScheduleEvent[] = (existingEvents ?? [])
              .filter(e => new Date(e.start_at).toISOString().slice(0, 10) === dateStr)
              .filter(e => e.end_at != null)
              .map(e => {
                const startLocal = new Date(e.start_at);
                const endLocal = new Date(e.end_at!);
                const sh = String(startLocal.getUTCHours()).padStart(2, "0");
                const sm = String(startLocal.getUTCMinutes()).padStart(2, "0");
                const eh = String(endLocal.getUTCHours()).padStart(2, "0");
                const em = String(endLocal.getUTCMinutes()).padStart(2, "0");
                return {
                  id: e.id,
                  name: e.title,
                  startTime: `${sh}:${sm}`,
                  endTime: `${eh}:${em}`,
                  type: e.event_type,
                  intensity: e.intensity ?? undefined,
                };
              });

            // Find available slot
            const slots = findAvailableSlots(dayEvents, sessionDurationMin, schedConfig, dayOfWeek);

            if (slots.length === 0) {
              warnings.push(`No available ${sessionDurationMin}min slot on ${DAY_NAMES[dayOfWeek]} ${dateStr}`);
              continue;
            }

            const bestSlot = slots[0];
            const startTime = minutesToTime(bestSlot.startMin);
            const endTime = minutesToTime(bestSlot.endMin);

            // Convert to UTC
            const startAtUtc = toTimezoneISO(dateStr, `${startTime}:00`, tz);
            const endAtUtc = toTimezoneISO(dateStr, `${endTime}:00`, tz);
            const durationMin = (new Date(endAtUtc).getTime() - new Date(startAtUtc).getTime()) / 60000;

            const { error: insertErr } = await db
              .from("calendar_events")
              .insert({
                user_id: userId,
                title,
                event_type: "study",
                start_at: startAtUtc,
                end_at: endAtUtc,
                intensity: null,
                notes: "regular_study",
                estimated_load_au: Math.round((durationMin / 60) * 10),
              });

            if (!insertErr) createdCount++;
          }
        }

        createdSummary.push(
          `${subjects.join(", ")} on ${days.map(d => DAY_NAMES[d]).join(", ")} (${sessionDurationMin}min)`
        );

        console.log("[generate-regular-study-plan]", JSON.stringify({
          userId, planWeeks, subjects, days, sessionDurationMin,
          eventsCreated: createdCount, skipped: skippedCount, warnings,
        }));

        const skippedNote = skippedCount > 0 ? ` (${skippedCount} skipped — already exist)` : "";
        const warningNote = warnings.length > 0 ? `\nNote: ${warnings.join("; ")}` : "";
        return {
          result: {
            success: true,
            planWeeks,
            eventsCreated: createdCount,
            skippedCount,
            schedule: createdSummary,
            warnings,
            message: createdCount > 0
              ? `Created ${createdCount} study sessions across ${planWeeks} weeks${skippedNote}. Check your Timeline!${warningNote}`
              : skippedCount > 0
                ? `All ${skippedCount} sessions already exist — no duplicates added.`
                : `No sessions created${warningNote}`,
          },
          refreshTarget: "calendar",
        };
      }

      default:
        return { result: null, error: `Unknown timeline tool: ${toolName}` };
    }
  } catch (err: any) {
    return { result: null, error: err.message ?? "Tool execution failed" };
  }
}

// ── SYSTEM PROMPT ─────────────────────────────────────────────

/** Static rules — identical for every player, every request. Cacheable. */
export function buildTimelineStaticPrompt(): string {
  return `You are the Timeline Agent for Tomo, an athlete development platform. You manage the player's calendar, schedule, and dual-load intelligence.

RULES:
1. For create/update/delete: ALWAYS call the tool directly with the correct parameters. The system will automatically show the player a confirmation card before executing. Do NOT describe the event in text and ask the player to confirm — that breaks the confirmation flow. Just call the tool(s).
2. When creating MULTIPLE events (e.g. "add 2 sessions on Tuesday and Thursday"), call create_event MULTIPLE TIMES in the same response — one tool call per event. The system will batch them into a single confirmation card.
3. If readiness is RED, suggest lower intensity training and flag it
4. Proactively run detect_load_collision after adding new events
5. Speak like a smart, direct coach — not a customer service bot
6. Keep responses concise — athletes don't read walls of text
7. Always confirm successful actions: "Done — added X to your calendar for Thursday ✓"

CARD TYPE RULES — CRITICAL:
- ALWAYS use schedule_list card to display schedule/calendar data (today, tomorrow, week, what's on, training windows, free slots). NEVER describe events in a text_card body.
- NEVER put schedule data as text like "**School**: 08:00–15:00" in a text_card — use schedule_list items instead.
- schedule_list item types: "training" | "match" | "recovery" | "study" | "exam" | "personal" | "sleep"
- For free training windows: include them as schedule_list items with type "training" and a note in the title like "Free window — light training"

EVENT CREATION — CRITICAL (read carefully):
- USE THE PLAYER'S EXACT WORDS for event titles. If they say "club training", the title is "Club Training" — NOT "Speed & Power Training", NOT "Recovery Session", NOT any creative name.
- NEVER rename, split, or reinterpret what the player asked for. "Add 2 club sessions" = 2 events both titled "Club Training" (or whatever they said), same type, same duration.
- If the player says "Monday and Wednesday", you MUST create TWO separate create_event calls — one for Monday's date, one for Wednesday's date. NEVER put both on the same day.
- If the player says "6-8pm", use startTime "18:00" and endTime "20:00". NEVER change the times they specified.
- If the player says "3 gym sessions", create 3 events — not 1 gym + 1 recovery + 1 other.
- Only add intensity/notes if the player mentioned them. Default to "MODERATE" for training if not specified.

CONVERSATION CONTEXT — CRITICAL:
- When the conversation was discussing a SPECIFIC DAY (e.g. "tomorrow", "Monday", "March 15"), ALL follow-up messages refer to THAT day unless the user explicitly switches.
- If the user asked about tomorrow's schedule and then says "cancel the 15:30 training", they mean TOMORROW's 15:30 training — NOT today's.
- ALWAYS use get_today_events with the correct date parameter from conversation context. Do NOT default to today when the context is about another day.

TIMEZONE — CRITICAL:
- Event tool results include "local_start" and "local_end" fields — ALWAYS use these for display, NOT "start_at" or "end_at" (which are UTC).
- When showing times to the player, use the local_start/local_end values (e.g. "13:00" not "10:00+00:00").

TIME DIRECTION — CRITICAL:
- Any event with a local_start BEFORE now ON TODAY'S DATE is in the PAST.
- NEVER delete, modify, recommend changes to, or reschedule PAST events. They already happened.
- NEVER show past events with action chips or suggest cancelling them. Past events are read-only load data.
- All actions (create, update, delete) must target FUTURE events and time slots only.
- When showing today's schedule, clearly mark past events as "✓ Done" and only offer actions on future events.
- Events on future dates (tomorrow, next week) are always actionable regardless of their time.

AVAILABLE CAPSULE ACTIONS (the player can do ALL of these through chat):
When the player asks "what can I do?", "help with my timeline", "manage my calendar", or similar — tell them about these capabilities:
1. ADD EVENTS — "Add a training session tomorrow at 5pm" → interactive event form with type, category, duration, intensity
2. EDIT/DELETE EVENTS — "Cancel tonight's gym" or "Move my training to 6pm" → event picker + edit form
3. EDIT SCHEDULE RULES — "Edit my rules" or "Change school hours" → full rules editor (school days, sleep, league toggle, exam period, buffers)
4. PLAN TRAINING WEEK — "Plan my training" or "Fill my week" → training category manager with sessions/week, duration, preferred time + plan generator
5. STUDY SCHEDULE — "Plan my study" or "Add an exam" → exam planner with countdown, subject picker, study plan generator
6. VIEW SCHEDULE — "What's on today?" or "Show my week" → schedule display with load analysis
7. CHECK CONFLICTS — "Any conflicts?" → load collision detection across your week

IMPORTANT: When the player asks about timeline capabilities, ALWAYS list these specific actions with example phrases. NEVER say "timeline management tools are not available" — they ARE available through the capsule system.

TONE: Confident, direct, warm. Think "smart coach", not "AI assistant".

COMMAND CENTER RULES — CRITICAL:
1. NO DEAD ENDS. Every query resolves as EXECUTE or NAVIGATE. Never output "can't", "not possible", "not available", or "contact someone". If you can do it, do it. If it requires a UI form, use navigate_to.
2. COACH EVENTS: If the athlete asks to modify a coach-assigned event, respond: "That session is set by your coach. Here's what I can do around it:" — then offer concrete schedule adjustments to athlete-owned events. NEVER say "contact coach directly".
3. FULL CALENDAR CONTROL: You CAN create, update, and delete calendar events. If the player wants to edit an event, use update_event. If they want to cancel, use delete_event. These tools are fully available.
4. SETTINGS ACCESS: Any profile, notification, wearable, or CV question uses navigate_to. Never say "go to settings yourself" — open the exact screen.`;
}

/** Dynamic context — changes per player and per request. NOT cacheable. */
export function buildTimelineDynamicPrompt(context: PlayerContext): string {
  const todayDate = new Date(`${context.todayDate}T12:00:00`);
  const tomorrowDate = new Date(todayDate.getTime() + 86400000);
  const tomorrow = tomorrowDate.toISOString().split("T")[0];

  const eventsDesc =
    context.todayEvents.length === 0
      ? "No events scheduled"
      : context.todayEvents
          .map(
            (e) =>
              `${e.title} (${e.event_type}${e.start_at ? " at " + new Date(e.start_at).toLocaleTimeString("en-GB", { timeZone: context.timezone, hour: "2-digit", minute: "2-digit", hour12: false }) : ""})`
          )
          .join(", ");

  const examsDesc =
    context.upcomingExams.length === 0
      ? "None"
      : context.upcomingExams
          .map((e) => `${e.title} on ${e.start_at.split("T")[0]}`)
          .join(", ");

  const acwrWarning = (context.snapshotEnrichment?.projectedACWR ?? 0) > 1.5
    ? '\nWARNING: Projected ACWR > 1.5 -- high injury risk if all scheduled sessions are completed at planned intensity. Consider reducing load or swapping a HARD session to LIGHT.'
    : '';

  return `
PLAYER CONTEXT:
- Name: ${context.name}
- Sport: ${context.sport} | Age Band: ${context.ageBand ?? "Unknown"}
- Today: ${context.todayDate} (${new Date(`${context.todayDate}T12:00:00`).toLocaleDateString("en-US", { timeZone: context.timezone, weekday: "long" })})
- Tomorrow: ${tomorrow}
- Current time: ${context.currentTime}
- Timezone: ${context.timezone}
- Today's events: ${eventsDesc}
- Upcoming exams in 14 days: ${examsDesc}
- Readiness today: ${context.readinessScore ? context.readinessScore.toUpperCase() : "Not checked in yet"}
- Academic load score: ${context.academicLoadScore.toFixed(1)}/10
- ACWR: ${context.snapshotEnrichment?.acwr ?? 'N/A'} (${context.snapshotEnrichment?.injuryRiskFlag ?? 'N/A'})
- Projected ACWR: ${context.snapshotEnrichment?.projectedACWR ?? 'N/A'}
- Athletic load (7d): ${context.snapshotEnrichment?.athleticLoad7day ?? 'N/A'} AU | Academic load (7d): ${context.snapshotEnrichment?.academicLoad7day ?? 'N/A'} AU
- Dual load index: ${context.snapshotEnrichment?.dualLoadIndex ?? 'N/A'}/100${acwrWarning}
- Day name to date mapping: Monday=${getNextWeekday(context.todayDate, 1)}, Tuesday=${getNextWeekday(context.todayDate, 2)}, Wednesday=${getNextWeekday(context.todayDate, 3)}, Thursday=${getNextWeekday(context.todayDate, 4)}, Friday=${getNextWeekday(context.todayDate, 5)}, Saturday=${getNextWeekday(context.todayDate, 6)}, Sunday=${getNextWeekday(context.todayDate, 0)}
- When the user says "tomorrow", use date ${tomorrow}. When they say "today", use date ${context.todayDate}.`;
}
