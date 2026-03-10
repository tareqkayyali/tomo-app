import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MIN_CONFIDENCE = 0.5;
const MIN_OCCURRENCES = 2;

interface PatternEvent {
  title: string;
  event_type: string;
  start_at: string;
  end_at: string | null;
  notes: string | null;
}

interface Pattern {
  patternKey: string;
  name: string;
  type: string;
  dayOfWeek: number;
  startTime: string | null;
  endTime: string | null;
  occurrences: number;
  confidence: number;
  patternDescription: string;
}

/**
 * Detect recurring event patterns from the user's calendar history.
 */
async function detectPatterns(
  userId: string,
  lookbackWeeks = 4
): Promise<Pattern[]> {
  const today = new Date().toISOString().slice(0, 10);
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - lookbackWeeks * 7);
  const startDateStr = startDate.toISOString().slice(0, 10);

  const db = supabaseAdmin();
  const { data: events } = await db
    .from("calendar_events")
    .select("title, event_type, start_at, end_at, notes")
    .eq("user_id", userId)
    .gte("start_at", `${startDateStr}T00:00:00`)
    .lte("start_at", `${today}T23:59:59`)
    .order("start_at", { ascending: true });

  if (!events || events.length === 0) return [];

  // Group by normalizedName_dayOfWeek_startTime
  const groups: Record<string, PatternEvent[]> = {};
  for (const event of events) {
    const normalizedName = (event.title || "").toLowerCase().trim();
    if (!normalizedName) continue;

    const eventDate = new Date(event.start_at);
    const dayOfWeek = eventDate.getUTCDay();
    const startTime = event.start_at
      ? event.start_at.slice(11, 16)
      : "none";
    const key = `${normalizedName}_${dayOfWeek}_${startTime}`;

    if (!groups[key]) groups[key] = [];
    groups[key].push(event);
  }

  const patterns: Pattern[] = [];
  for (const [key, groupEvents] of Object.entries(groups)) {
    if (groupEvents.length < MIN_OCCURRENCES) continue;

    const confidence = Math.min(groupEvents.length / lookbackWeeks, 1.0);
    if (confidence < MIN_CONFIDENCE) continue;

    const template = groupEvents[groupEvents.length - 1]; // most recent
    const eventDate = new Date(template.start_at);
    const dayOfWeek = eventDate.getUTCDay();
    const startTime = template.start_at ? template.start_at.slice(11, 16) : null;
    const endTime = template.end_at ? template.end_at.slice(11, 16) : null;
    const dayName = DAY_NAMES[dayOfWeek];
    const timeStr = startTime && startTime !== "00:00" ? ` at ${startTime}` : "";

    patterns.push({
      patternKey: key,
      name: template.title,
      type: template.event_type || "training",
      dayOfWeek,
      startTime: startTime === "00:00" ? null : startTime,
      endTime,
      occurrences: groupEvents.length,
      confidence,
      patternDescription: `${groupEvents.length} out of ${lookbackWeeks} ${dayName}s${timeStr}`,
    });
  }

  patterns.sort((a, b) => b.confidence - a.confidence);
  return patterns;
}

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const daysAhead = 7;
    const patterns = await detectPatterns(auth.user.id);

    if (patterns.length === 0) {
      return NextResponse.json(
        { suggestions: [] },
        { headers: { "api-version": "v1" } }
      );
    }

    const today = new Date();

    // Build future dates
    const futureDates: { date: string; dayOfWeek: number }[] = [];
    for (let i = 1; i <= daysAhead; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      futureDates.push({
        date: d.toISOString().slice(0, 10),
        dayOfWeek: d.getUTCDay(),
      });
    }

    // Get existing events in the range
    const db = supabaseAdmin();
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + daysAhead);

    const { data: existingEvents } = await db
      .from("calendar_events")
      .select("title, start_at")
      .eq("user_id", auth.user.id)
      .gte("start_at", `${futureDates[0].date}T00:00:00`)
      .lte("start_at", `${endDate.toISOString().slice(0, 10)}T23:59:59`);

    // Build confirmed set for deduplication
    const confirmedSet = new Set<string>();
    for (const evt of existingEvents || []) {
      const normalized = (evt.title || "").toLowerCase().trim();
      const evtDate = evt.start_at.slice(0, 10);
      confirmedSet.add(`${normalized}_${evtDate}`);
    }

    // Project patterns onto future dates
    const suggestions: { suggestion: Omit<Pattern, "dayOfWeek" | "occurrences">; date: string }[] = [];
    for (const pattern of patterns) {
      const normalizedName = (pattern.name || "").toLowerCase().trim();

      for (const futureDate of futureDates) {
        if (futureDate.dayOfWeek !== pattern.dayOfWeek) continue;
        if (confirmedSet.has(`${normalizedName}_${futureDate.date}`)) continue;

        suggestions.push({
          suggestion: {
            patternKey: pattern.patternKey,
            name: pattern.name,
            type: pattern.type,
            startTime: pattern.startTime,
            endTime: pattern.endTime,
            confidence: pattern.confidence,
            patternDescription: pattern.patternDescription,
          },
          date: futureDate.date,
        });
      }
    }

    // Sort by date then confidence
    suggestions.sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return b.suggestion.confidence - a.suggestion.confidence;
    });

    return NextResponse.json(
      { suggestions },
      { headers: { "api-version": "v1" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
