/**
 * Quick Action Formatter — converts raw tool results into structured card responses.
 * Used by capsule fast-path to deterministically format data without AI.
 */

import type { PlayerContext } from "./contextBuilder";

interface FormattedResponse {
  headline: string;
  cards: any[];
  chips: any[];
}

export function formatQuickAction(
  toolName: string,
  result: any,
  context: PlayerContext
): FormattedResponse {
  switch (toolName) {
    case "get_readiness_detail":
      return formatReadiness(result, context);
    case "get_consistency_score":
      return formatConsistency(result);
    case "get_dual_load_score":
      return formatDualLoad(result);
    case "get_today_events":
      return formatTodayEvents(result, context);
    case "get_week_schedule":
      return formatWeekSchedule(result);
    case "get_test_results":
      return formatTestResults(result);
    default:
      // Fallback: wrap in text card
      return {
        headline: "Here's what I found",
        cards: [{ type: "text_card", emoji: "📊", headline: "Result", body: JSON.stringify(result).slice(0, 300) }],
        chips: [],
      };
  }
}

function formatReadiness(result: any, context: PlayerContext): FormattedResponse {
  // Tool returns { date, checkIn: { energy, soreness, sleep_hours, ... }, vitals?: {...}, isToday? }
  const checkIn = result.checkIn ?? result.components ?? null;
  const vitals = result.vitals ?? {};
  const isToday = result.isToday !== false; // default true for backwards compat
  const score = result.readinessScore ?? result.score ?? checkIn?.readiness ?? context.readinessScore;
  const rag = (score ?? "").toString().toUpperCase();
  const emoji = rag === "GREEN" ? "💚" : rag === "YELLOW" ? "💛" : rag === "RED" ? "❤️" : "📊";

  const items: any[] = [];

  if (checkIn) {
    if (checkIn.energy != null) items.push({ label: "Energy", value: checkIn.energy, unit: "/10" });
    if (checkIn.soreness != null) items.push({ label: "Soreness", value: checkIn.soreness, unit: "/10" });
    if (checkIn.sleep_hours != null) items.push({ label: "Sleep", value: checkIn.sleep_hours, unit: "hrs" });
    if (checkIn.mood != null) items.push({ label: "Mood", value: checkIn.mood, unit: "/10" });
    if (checkIn.academic_stress != null) items.push({ label: "Academic Stress", value: checkIn.academic_stress, unit: "/10" });
  }

  // Add Whoop vitals if available
  if (vitals?.hrv) items.push({ label: "HRV", value: vitals.hrv, unit: "ms" });
  if (vitals?.resting_hr) items.push({ label: "Resting HR", value: vitals.resting_hr, unit: "bpm" });
  if (vitals?.recovery_score) items.push({ label: "Recovery", value: vitals.recovery_score, unit: "%" });
  if (!checkIn && vitals?.sleep_hours) items.push({ label: "Sleep", value: vitals.sleep_hours, unit: "hrs" });

  // If no data at all, show placeholder
  if (items.length === 0) {
    items.push(
      { label: "Energy", value: "—", unit: "/10" },
      { label: "Soreness", value: "—", unit: "/10" },
      { label: "Sleep", value: "—", unit: "hrs" },
      { label: "Mood", value: "—", unit: "/10" },
    );
  }

  const dateLabel = !isToday && result.date ? ` (${result.date})` : "";
  const headline = checkIn
    ? `${emoji} Readiness: ${rag || "Unknown"}${dateLabel}`
    : `${emoji} No check-in today`;

  return {
    headline,
    cards: [{ type: "stat_grid", items }],
    chips: [
      ...(!checkIn || !isToday ? [{ label: "Log check-in", action: "I want to check in" }] : []),
      { label: "Get training plan", action: "What should I train today?" },
    ],
  };
}

function formatConsistency(result: any): FormattedResponse {
  const streak = result.streakDays ?? result.streak ?? 0;
  const score = result.consistencyScore ?? result.score ?? 0;

  return {
    headline: `🔥 ${streak}-day streak`,
    cards: [{
      type: "stat_grid",
      items: [
        { label: "Streak", value: streak, unit: "days" },
        { label: "Consistency", value: typeof score === "number" ? `${Math.round(score)}%` : score, unit: "" },
        ...(result.totalSessions ? [{ label: "Total Sessions", value: result.totalSessions, unit: "" }] : []),
        ...(result.thisWeek ? [{ label: "This Week", value: result.thisWeek, unit: "sessions" }] : []),
      ],
    }],
    chips: [
      { label: "View mastery", action: "Go to mastery" },
    ],
  };
}

function formatDualLoad(result: any): FormattedResponse {
  const acwr = result.acwr ?? "N/A";
  const athletic = result.athleticLoad7day ?? result.athletic ?? "N/A";
  const academic = result.academicLoad7day ?? result.academic ?? "N/A";
  const dual = result.dualLoadIndex ?? "N/A";
  const risk = result.injuryRiskFlag ?? "N/A";

  // ACWR zone description
  const acwrNum = typeof acwr === "number" ? acwr : null;
  const acwrZone = acwrNum != null
    ? acwrNum > 1.5 ? "Danger zone — high injury risk" : acwrNum > 1.3 ? "Elevated — reduce intensity" : acwrNum >= 0.8 ? "Sweet spot — optimal loading" : "Undertraining — increase load gradually"
    : "";

  return {
    headline: `📊 Load: ACWR ${acwr}`,
    cards: [
      {
        type: "stat_grid",
        items: [
          { label: "ACWR", value: acwr, unit: "" },
          { label: "Athletic (7d)", value: athletic, unit: "AU" },
          { label: "Academic (7d)", value: academic, unit: "AU" },
          { label: "Dual Index", value: dual, unit: "/100" },
          { label: "Risk", value: risk, unit: "" },
        ],
      },
      {
        type: "text_card",
        emoji: "📖",
        headline: "What do these mean?",
        body: `ACWR (Acute:Chronic Workload Ratio) compares your last 7 days of training load to your last 28 days. ${acwrZone ? acwrZone + ". " : ""}The safe zone is 0.8–1.3.\n\nAU (Arbitrary Units) measures total training stress — combining session duration, intensity, and type. Higher AU = more load on your body.\n\nDual Index combines athletic + academic load to flag weeks where both are high.`,
      },
    ],
    chips: [
      { label: "View schedule", action: "Show my schedule today" },
    ],
  };
}

function formatTodayEvents(result: any, context: PlayerContext): FormattedResponse {
  const events = Array.isArray(result) ? result : result.events ?? [];

  if (events.length === 0) {
    return {
      headline: "📅 Nothing scheduled today",
      cards: [{ type: "text_card", emoji: "📅", headline: "Clear day", body: "No events on your calendar today. Want to add something?" }],
      chips: [
        { label: "Add training", action: "I want to add a training session" },
        { label: "View week", action: "Show my week schedule" },
      ],
    };
  }

  return {
    headline: `📅 ${events.length} event${events.length > 1 ? "s" : ""} today`,
    cards: [{
      type: "schedule_list",
      items: events.map((e: any) => {
        const raw = e.event_type ?? e.eventType ?? "training";
        const typeMap: Record<string, string> = { school: "study", recovery: "rest" };
        const type = typeMap[raw] ?? (["training", "match", "study", "rest", "exam"].includes(raw) ? raw : "other");
        return {
          time: e.local_end ? `${e.local_start}–${e.local_end}` : e.local_start ?? "",
          title: e.title ?? e.name ?? "Event",
          type,
        };
      }),
    }],
    chips: [
      { label: "Add event", action: "I want to add an event" },
      { label: "View week", action: "Show my week schedule" },
    ],
  };
}

function formatWeekSchedule(result: any): FormattedResponse {
  // result.schedule is Record<string, event[]> keyed by "YYYY-MM-DD"
  const schedule: Record<string, any[]> = result.schedule ?? {};
  const sortedDates = Object.keys(schedule).sort();

  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // ── Detect recurring events: same title+time on 3+ days ──
  const eventSignatures: Record<string, { title: string; start: string; end: string; type: string; dates: string[] }> = {};
  for (const date of sortedDates) {
    for (const e of schedule[date]) {
      const title = e.title ?? e.name ?? "Event";
      const start = e.local_start ?? "";
      const end = e.local_end ?? "";
      const key = `${title}|${start}|${end}`;
      if (!eventSignatures[key]) {
        eventSignatures[key] = { title, start, end, type: e.event_type ?? "other", dates: [] };
      }
      eventSignatures[key].dates.push(date);
    }
  }

  const recurringKeys = new Set<string>();
  const summaryParts: string[] = [];
  for (const [key, sig] of Object.entries(eventSignatures)) {
    if (sig.dates.length >= 3) {
      recurringKeys.add(key);
      // Build day list like "Mon–Fri" or "Mon, Wed, Fri"
      const dayIndices = sig.dates.map(d => new Date(d + "T12:00:00").getDay()).sort((a, b) => a - b);
      const isConsecutive = dayIndices.every((v, i) => i === 0 || v === dayIndices[i - 1] + 1);
      const dayStr = isConsecutive && dayIndices.length > 2
        ? `${DAY_NAMES[dayIndices[0]]}–${DAY_NAMES[dayIndices[dayIndices.length - 1]]}`
        : dayIndices.map(i => DAY_NAMES[i]).join(", ");
      const timeStr = sig.end ? `${sig.start}–${sig.end}` : sig.start;
      summaryParts.push(`${sig.title} ${timeStr} (${dayStr})`);
    }
  }

  const summary = summaryParts.join("  ·  ");

  // ── Build per-day schedule — show ALL events, recurring summary is just context ──
  const mapType = (t: string) => {
    if (["training", "match", "study", "rest", "exam"].includes(t)) return t;
    if (t === "school") return "study";
    if (t === "recovery") return "rest";
    return "other";
  };

  const days: { dayLabel: string; items: any[] }[] = [];
  let totalEvents = 0;
  for (const date of sortedDates) {
    const d = new Date(date + "T12:00:00");
    const dayLabel = `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
    const items = schedule[date].map((e: any) => ({
      time: e.local_end ? `${e.local_start}–${e.local_end}` : e.local_start ?? "",
      title: e.title ?? e.name ?? "Event",
      type: mapType(e.event_type ?? "other"),
    }));

    if (items.length > 0) {
      days.push({ dayLabel, items });
      totalEvents += items.length;
    }
  }

  const headline = totalEvents > 0
    ? `📅 Your week — ${totalEvents} activities`
    : "📅 Your week";

  return {
    headline,
    cards: [{
      type: "week_schedule",
      summary,
      days,
    }],
    chips: [
      { label: "Add event", action: "I want to add an event" },
      { label: "Edit my rules", action: "Edit my schedule rules" },
      { label: "Check conflicts", action: "Check for any schedule conflicts" },
    ],
  };
}

function formatTestResults(result: any): FormattedResponse {
  const tests = Array.isArray(result) ? result : result.tests ?? result.results ?? [];

  if (tests.length === 0) {
    return {
      headline: "📊 No test results yet",
      cards: [{ type: "text_card", emoji: "📊", headline: "No tests", body: "You haven't logged any test results yet. Want to log one now?" }],
      chips: [
        { label: "Log a test", action: "I want to log a test" },
      ],
    };
  }

  // Group by test type, show latest
  const byType: Record<string, { latest: number; date: string; best: number; count: number }> = {};
  for (const t of tests) {
    const type = t.testType ?? t.test_type ?? "unknown";
    if (!byType[type]) {
      byType[type] = { latest: t.score, date: t.date ?? t.created_at ?? "", best: t.score, count: 0 };
    }
    byType[type].count++;
    if (t.score > byType[type].best) byType[type].best = t.score;
  }

  return {
    headline: `📊 ${Object.keys(byType).length} test types logged`,
    cards: [{
      type: "stat_grid",
      items: Object.entries(byType).map(([type, d]) => ({
        label: type.replace(/_/g, " "),
        value: d.latest,
        unit: `best: ${d.best}`,
      })),
    }],
    chips: [
      { label: "Log a test", action: "I want to log a test" },
      { label: "Compare to peers", action: "Compare my benchmarks to peers" },
    ],
  };
}
