/**
 * Timeline Agent — owns all calendar operations.
 * Adapted to actual Tomo schema: calendar_events uses title, start_at, end_at (timestamptz).
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { PlayerContext } from "./contextBuilder";
import { getDayBoundsISO, toTimezoneISO } from "./contextBuilder";
import { estimateTotalLoad } from "@/services/events/computations/loadEstimator";
import { bridgeCalendarToEventStream } from "@/services/events/calendarBridge";

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
        return { result: { date, events: data ?? [] } };
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

        // Group by date
        const byDate: Record<string, any[]> = {};
        for (const event of data ?? []) {
          const eventDate = event.start_at.split("T")[0];
          if (!byDate[eventDate]) byDate[eventDate] = [];
          byDate[eventDate].push(event);
        }
        return { result: { startDate: start, endDate: end, schedule: byDate } };
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

        return { result: { created: data }, refreshTarget: "calendar" };
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
          result: { deleted: true, eventId: toolInput.eventId },
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
          .select("start_at, event_type, intensity, title")
          .eq("user_id", userId)
          .gte("start_at", collisionStart)
          .lte("start_at", collisionEnd);

        // Group by date and detect issues
        const byDate: Record<string, any[]> = {};
        for (const event of events ?? []) {
          const eventDate = event.start_at.split("T")[0];
          if (!byDate[eventDate]) byDate[eventDate] = [];
          byDate[eventDate].push(event);
        }

        const collisions: {
          date: string;
          issue: string;
          events: string[];
        }[] = [];
        for (const [date, dayEvents] of Object.entries(byDate)) {
          const hasHighIntensityTraining = dayEvents.some(
            (e) =>
              (e.event_type === "training" || e.event_type === "match") &&
              (e.intensity === "HARD" || e.intensity === "MODERATE")
          );
          const hasExam = dayEvents.some((e) => e.event_type === "exam");
          const trainingCount = dayEvents.filter(
            (e) => e.event_type === "training" || e.event_type === "match"
          ).length;

          if (hasHighIntensityTraining && hasExam) {
            collisions.push({
              date,
              issue:
                "High intensity training + exam on same day — cognitive and physical overload risk",
              events: dayEvents.map((e) => e.title),
            });
          }
          if (trainingCount >= 2) {
            collisions.push({
              date,
              issue: "Double training day — monitor recovery carefully",
              events: dayEvents
                .filter((e) => e.event_type === "training")
                .map((e) => e.title),
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

      default:
        return { result: null, error: `Unknown timeline tool: ${toolName}` };
    }
  } catch (err: any) {
    return { result: null, error: err.message ?? "Tool execution failed" };
  }
}

// ── SYSTEM PROMPT ─────────────────────────────────────────────

export function buildTimelineSystemPrompt(context: PlayerContext): string {
  // Calculate tomorrow's date in the player's timezone
  const todayDate = new Date(`${context.todayDate}T12:00:00`);
  const tomorrowDate = new Date(todayDate.getTime() + 86400000);
  const tomorrow = tomorrowDate.toISOString().split("T")[0];

  const eventsDesc =
    context.todayEvents.length === 0
      ? "No events scheduled"
      : context.todayEvents
          .map(
            (e) =>
              `${e.title} (${e.event_type}${e.start_at ? " at " + e.start_at.split("T")[1]?.slice(0, 5) : ""})`
          )
          .join(", ");

  const examsDesc =
    context.upcomingExams.length === 0
      ? "None"
      : context.upcomingExams
          .map((e) => `${e.title} on ${e.start_at.split("T")[0]}`)
          .join(", ");

  return `You are the Timeline Agent for Tomo, an athlete development platform. You manage ${context.name}'s calendar, schedule, and dual-load intelligence.

PLAYER CONTEXT:
- Name: ${context.name}
- Sport: ${context.sport} | Age Band: ${context.ageBand ?? "Unknown"}
- Today: ${context.todayDate} (${new Date(`${context.todayDate}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" })})
- Tomorrow: ${tomorrow}
- Current time: ${context.currentTime}
- Today's events: ${eventsDesc}
- Upcoming exams in 14 days: ${examsDesc}
- Readiness today: ${context.readinessScore ? context.readinessScore.toUpperCase() : "Not checked in yet"}
- Academic load score: ${context.academicLoadScore.toFixed(1)}/10
- ACWR: ${context.snapshotEnrichment?.acwr ?? 'N/A'} (${context.snapshotEnrichment?.injuryRiskFlag ?? 'N/A'})
- Projected ACWR (if all scheduled sessions complete): ${context.snapshotEnrichment?.projectedACWR ?? 'N/A'}
- Athletic load (7d): ${context.snapshotEnrichment?.athleticLoad7day ?? 'N/A'} AU | Academic load (7d): ${context.snapshotEnrichment?.academicLoad7day ?? 'N/A'} AU
- Dual load index: ${context.snapshotEnrichment?.dualLoadIndex ?? 'N/A'}/100${(context.snapshotEnrichment?.projectedACWR ?? 0) > 1.5 ? '\n⚠️ WARNING: Projected ACWR > 1.5 — high injury risk if all scheduled sessions are completed at planned intensity. Consider reducing load or swapping a HARD session to LIGHT.' : ''}

RULES:
1. For create/update/delete: ALWAYS call the tool directly with the correct parameters. The system will automatically show the player a confirmation card before executing. Do NOT describe the event in text and ask the player to confirm — that breaks the confirmation flow. Just call the tool(s).
2. When creating MULTIPLE events (e.g. "add 2 sessions on Tuesday and Thursday"), call create_event MULTIPLE TIMES in the same response — one tool call per event. The system will batch them into a single confirmation card.
3. If readiness is RED, suggest lower intensity training and flag it
4. Proactively run detect_load_collision after adding new events
5. Speak like a smart, direct coach — not a customer service bot
6. Keep responses concise — athletes don't read walls of text
7. Always confirm successful actions: "Done — added X to your calendar for Thursday ✓"

EVENT CREATION — CRITICAL (read carefully):
- USE THE PLAYER'S EXACT WORDS for event titles. If they say "club training", the title is "Club Training" — NOT "Speed & Power Training", NOT "Recovery Session", NOT any creative name.
- NEVER rename, split, or reinterpret what the player asked for. "Add 2 club sessions" = 2 events both titled "Club Training" (or whatever they said), same type, same duration.
- If the player says "Monday and Wednesday", you MUST create TWO separate create_event calls — one for Monday's date, one for Wednesday's date. NEVER put both on the same day.
- If the player says "6-8pm", use startTime "18:00" and endTime "20:00". NEVER change the times they specified.
- If the player says "3 gym sessions", create 3 events — not 1 gym + 1 recovery + 1 other.
- Only add intensity/notes if the player mentioned them. Default to "MODERATE" for training if not specified.
- When creating multiple events for different days, calculate the correct YYYY-MM-DD for each day name relative to today (${context.todayDate}).
- Day name to date mapping: Monday=${getNextWeekday(context.todayDate, 1)}, Tuesday=${getNextWeekday(context.todayDate, 2)}, Wednesday=${getNextWeekday(context.todayDate, 3)}, Thursday=${getNextWeekday(context.todayDate, 4)}, Friday=${getNextWeekday(context.todayDate, 5)}, Saturday=${getNextWeekday(context.todayDate, 6)}, Sunday=${getNextWeekday(context.todayDate, 0)}.

CONVERSATION CONTEXT — CRITICAL:
- When the conversation was discussing a SPECIFIC DAY (e.g. "tomorrow", "Monday", "March 15"), ALL follow-up messages refer to THAT day unless the user explicitly switches.
- If the user asked about tomorrow's schedule and then says "cancel the 15:30 training", they mean TOMORROW's 15:30 training — NOT today's.
- ALWAYS use get_today_events with the correct date parameter from conversation context. Do NOT default to today when the context is about another day.
- When the user says "tomorrow", use date ${tomorrow}. When they say "today", use date ${context.todayDate}.

TIME DIRECTION — CRITICAL:
- The current time is ${context.currentTime}. Any event with a start_at BEFORE now ON TODAY'S DATE is in the PAST.
- NEVER delete, modify, recommend changes to, or reschedule PAST events. They already happened.
- NEVER show past events with action chips or suggest cancelling them. Past events are read-only load data.
- All actions (create, update, delete) must target FUTURE events and time slots only.
- When showing today's schedule, clearly mark past events as "✓ Done" and only offer actions on future events.
- Events on future dates (tomorrow, next week) are always actionable regardless of their time.

TONE: Confident, direct, warm. Think "smart coach", not "AI assistant".`;
}
