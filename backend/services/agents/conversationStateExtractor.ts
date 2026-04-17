/**
 * Conversation State Extractor — Layer 4 of the Context Pipeline.
 *
 * Deterministic (no LLM call) extraction of conversation entities.
 * Runs after each exchange, persisted to chat_sessions.conversation_state.
 * Gives the orchestrator + agents continuity across turns:
 *   - Which dates the user referenced (for "add at 5pm" without specifying a day)
 *   - Which events were discussed (for "cancel the 15:30 training")
 *   - Current topic and action context (for agent lock stability)
 */

import type { ConversationState } from "./sessionService";

// ── Day-of-week mapping ──────────────────────────────────────────

const DAY_NAMES: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

// ── Topic → Agent mapping ────────────────────────────────────────

const TOPIC_AGENT_MAP: Record<string, string> = {
  scheduling: "timeline",
  training: "output",
  readiness: "output",
  recovery: "output",
  weakness: "output",
  drill: "output",
  benchmark: "output",
  mastery: "mastery",
  recruiting: "mastery",
};

// ── Main extraction function ─────────────────────────────────────

export function extractConversationState(
  userMessage: string,
  assistantMessage: string,
  previousState: ConversationState | null,
  todayDate: string,
  _timezone: string,
  structured?: any
): ConversationState {
  const referencedDates = extractDates(userMessage, todayDate);
  const { eventIds, eventNames } = extractEvents(assistantMessage);
  const drills = extractDrills(assistantMessage, structured);
  const topic = detectTopic(userMessage);
  const actionContext = detectActionContext(userMessage, assistantMessage);

  // Merge with previous state — carry forward events/dates that are still relevant
  const mergedDates = { ...previousState?.referencedDates, ...referencedDates };
  const mergedEventIds = dedup([
    ...(previousState?.referencedEventIds ?? []),
    ...eventIds,
  ]).slice(-20); // keep last 20
  const mergedEventNames = dedup([
    ...(previousState?.referencedEventNames ?? []),
    ...eventNames,
  ]).slice(-20);

  // Merge drills — carry forward from previous state + add new ones
  const mergedDrills = {
    ...(previousState?.referencedDrills ?? {}),
    ...drills,
  };

  return {
    currentTopic: topic || previousState?.currentTopic || null,
    referencedDates: mergedDates,
    referencedEventIds: mergedEventIds,
    referencedEventNames: mergedEventNames,
    referencedDrills: mergedDrills,
    lastActionContext: actionContext || previousState?.lastActionContext || null,
    extractedAt: new Date().toISOString(),
  };
}

/**
 * Determine which agent domain a topic maps to.
 * Used by agent lock to detect topic shifts.
 */
export function getAgentForTopic(topic: string | null): string | null {
  if (!topic) return null;
  return TOPIC_AGENT_MAP[topic] ?? null;
}

// ── Date extraction ──────────────────────────────────────────────

function extractDates(
  message: string,
  todayDate: string
): Record<string, string> {
  const dates: Record<string, string> = {};
  const lower = message.toLowerCase();

  // "today"
  if (/\btoday\b/i.test(lower)) {
    dates.today = todayDate;
  }

  // "tomorrow"
  if (/\btomorrow\b/i.test(lower)) {
    dates.tomorrow = addDays(todayDate, 1);
  }

  // "day after tomorrow"
  if (/\bday after tomorrow\b/i.test(lower)) {
    dates["day after tomorrow"] = addDays(todayDate, 2);
  }

  // "yesterday"
  if (/\byesterday\b/i.test(lower)) {
    dates.yesterday = addDays(todayDate, -1);
  }

  // "next week"
  if (/\bnext week\b/i.test(lower)) {
    dates["next week"] = addDays(todayDate, 7);
  }

  // Day names: "Monday", "next Tuesday", "this Wednesday"
  for (const [name, dow] of Object.entries(DAY_NAMES)) {
    const nextPattern = new RegExp(`\\bnext\\s+${name}\\b`, "i");
    const thisPattern = new RegExp(`\\bthis\\s+${name}\\b`, "i");
    const barePattern = new RegExp(`\\b${name}\\b`, "i");

    if (nextPattern.test(lower)) {
      // "next Monday" = always 7+ days ahead
      dates[`next ${name}`] = getNextWeekday(todayDate, dow, true);
    } else if (thisPattern.test(lower)) {
      // "this Monday" = this week's occurrence
      dates[name] = getNextWeekday(todayDate, dow, false);
    } else if (barePattern.test(lower)) {
      // "Monday" = next occurrence (including today)
      dates[name] = getNextWeekday(todayDate, dow, false);
    }
  }

  // Explicit dates: "March 15", "March 15th", "15 March", "15/3", "3/15"
  const monthNames: Record<string, number> = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
    jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  };

  // "March 15" or "March 15th"
  const monthDayRegex = /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?\b/gi;
  let match;
  while ((match = monthDayRegex.exec(lower)) !== null) {
    const month = monthNames[match[1].toLowerCase()];
    const day = parseInt(match[2]);
    if (month && day >= 1 && day <= 31) {
      const year = parseInt(todayDate.slice(0, 4));
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      dates[match[0].trim()] = dateStr;
    }
  }

  return dates;
}

// ── Drill extraction from assistant response + structured data ────

function extractDrills(
  assistantMessage: string,
  structured?: any
): Record<string, string> {
  const drills: Record<string, string> = {};

  // Extract from structured session_plan cards (most reliable)
  if (structured?.cards) {
    for (const card of structured.cards) {
      if (card.type === "session_plan" && card.items) {
        for (const item of card.items) {
          if (item.drillId && item.name) {
            drills[item.name.toLowerCase()] = item.drillId;
          }
        }
      }
      if (card.type === "drill_card" && card.drillId && card.name) {
        drills[card.name.toLowerCase()] = card.drillId;
      }
    }
  }

  // Extract drillId references from text: "drillId: UUID" or [drillId:UUID]
  const drillIdRegex = /(?:drillId[:\s]+|drillId:)([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;
  let match;
  while ((match = drillIdRegex.exec(assistantMessage)) !== null) {
    // We don't have the name here, but store the ID keyed by itself
    drills[match[1]] = match[1];
  }

  return drills;
}

// ── Event extraction from assistant response ─────────────────────

function extractEvents(assistantMessage: string): {
  eventIds: string[];
  eventNames: string[];
} {
  const eventIds: string[] = [];
  const eventNames: string[] = [];

  // Extract UUIDs (event IDs from tool results)
  const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  let match;
  while ((match = uuidRegex.exec(assistantMessage)) !== null) {
    eventIds.push(match[0]);
  }

  // Extract event titles from common patterns
  // "Added "Club Training"" or "title: "Gym Session""
  const titleRegex = /(?:Added|Created|Updated|Removed|title[:\s]+)"([^"]+)"/gi;
  while ((match = titleRegex.exec(assistantMessage)) !== null) {
    eventNames.push(match[1]);
  }

  // Extract from schedule_list items in structured data
  const scheduleItemRegex = /\d{1,2}:\d{2}\s+([A-Z][^(,\n]+)/g;
  while ((match = scheduleItemRegex.exec(assistantMessage)) !== null) {
    const name = match[1].trim();
    if (name.length > 2 && name.length < 60) {
      eventNames.push(name);
    }
  }

  return { eventIds: dedup(eventIds), eventNames: dedup(eventNames) };
}

// ── Topic detection ──────────────────────────────────────────────

function detectTopic(message: string): string | null {
  const lower = message.toLowerCase();

  if (/schedule|calendar|event|add|book|reschedule|cancel|move|delete.*event|when|plan.*day|tomorrow|today.*schedule/i.test(lower))
    return "scheduling";
  if (/weakness|weak|gap|strength|area.*(improve|work|develop)|where.*(need|lack)|my best|my worst/i.test(lower))
    return "weakness";
  if (/compare|benchmark|percentile|rank|vs other|how.*stack up|where.*stand/i.test(lower))
    return "benchmark";
  if (/drill|exercise|workout|warm.?up|cool.?down|practice|session plan|what.*(should|can) i train/i.test(lower))
    return "drill";
  if (/readiness|tired|energy|sleep|recovery|how.*(do|am) i feel|check.?in|sore|soreness|pain/i.test(lower))
    return "readiness";
  if (/training|match|intensity|load/i.test(lower))
    return "training";
  if (/recover|rest|ice.?bath|foam.?roll|stretch|deload/i.test(lower))
    return "recovery";
  if (/progress|improve|milestone|achievement|cv|profile|recruit|scout|streak|personal record/i.test(lower))
    return "mastery";

  return null;
}

// ── Action context detection ─────────────────────────────────────

function detectActionContext(
  userMessage: string,
  assistantMessage: string
): string | null {
  const userLower = userMessage.toLowerCase();
  const assistLower = assistantMessage.toLowerCase();

  if (/\b(add|book|create|schedule|set up)\b/i.test(userLower) || /added|created|booked/i.test(assistLower))
    return "creating_events";
  if (/\b(cancel|delete|remove)\b/i.test(userLower) || /removed|deleted|cancelled/i.test(assistLower))
    return "deleting_events";
  if (/\b(move|reschedule|change|update)\b/i.test(userLower) || /updated|moved|rescheduled/i.test(assistLower))
    return "updating_events";
  if (/\b(check.?in|log|record)\b/i.test(userLower) || /check-in saved|logged/i.test(assistLower))
    return "checking_in";
  if (/\b(show|view|what'?s|see|look)\b/i.test(userLower))
    return "viewing";

  return null;
}

// ── Utility functions ────────────────────────────────────────────

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getNextWeekday(todayStr: string, targetDow: number, forceNextWeek: boolean): string {
  const d = new Date(`${todayStr}T12:00:00`);
  const currentDow = d.getDay();
  let diff = targetDow - currentDow;
  if (diff < 0) diff += 7;
  if (diff === 0 && forceNextWeek) diff = 7;
  d.setDate(d.getDate() + diff);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function dedup(arr: string[]): string[] {
  return [...new Set(arr)];
}
