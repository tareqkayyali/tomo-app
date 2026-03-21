/**
 * Daily Briefing Service — Command & Control Center
 *
 * Generates a structured daily briefing for the athlete on chat open.
 * Runs 6 parallel Supabase queries and applies performance-director rules
 * to surface alerts, status, and quick actions.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { ArchetypeInfo, type Archetype } from "@/types";
import { getRecommendations } from "@/services/recommendations/getRecommendations";
import type { Recommendation } from "@/services/recommendations/types";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BriefingAlert {
  type:
    | "rest_needed"
    | "acwr_warning"
    | "pain_flag"
    | "academic_stress"
    | "streak_risk";
  emoji: string;
  message: string;
  severity: "info" | "warn" | "critical";
}

export interface QuickAction {
  label: string;
  icon: string; // Ionicons name
  screen: string; // React Navigation screen name
  params?: Record<string, unknown>;
}

export interface BriefingPlanSummary {
  intensity: string;
  workoutType: string;
  duration: number;
}

export interface BriefingEvent {
  title: string;
  time: string | null;
  type: string;
}

export interface DailyBriefing {
  greeting: string;
  readinessStatus: "green" | "yellow" | "red" | "unknown";
  readinessLabel: string;
  hasCheckedIn: boolean;
  streakCount: number;
  streakAtRisk: boolean;
  todayPlan: BriefingPlanSummary | null;
  upcomingEvents: BriefingEvent[];
  alerts: BriefingAlert[];
  quickActions: QuickAction[];
  archetypeEmoji: string | null;
  /** Layer 4 RIE — top P1/P2 recommendation for daily AI insight card */
  topRecommendation: {
    recType: string;
    priority: number;
    title: string;
    bodyShort: string;
  } | null;
}

// ─── Greeting Generator ─────────────────────────────────────────────────────

function buildGreeting(name: string, hour: number): string {
  const first = name?.split(" ")[0] || "champ";
  if (hour < 12) return `gm ${first} ☀️`;
  if (hour < 17) return `afternoon grind ${first} 💪`;
  return `evening ${first} 🌙`;
}

// ─── Readiness Label ────────────────────────────────────────────────────────

function getReadinessLabel(
  status: "green" | "yellow" | "red" | "unknown"
): string {
  switch (status) {
    case "green":
      return "Locked in 🟢";
    case "yellow":
      return "Take it easy 🟡";
    case "red":
      return "Rest day 🔴";
    default:
      return "Check in to find out";
  }
}

// ─── ACWR-lite Calculation ──────────────────────────────────────────────────

/**
 * Simplified Acute:Chronic Workload Ratio using effort_yesterday from check-ins.
 * Acute = avg of last 3 days, Chronic = avg of last 7 days.
 * Returns ratio or null if insufficient data.
 */
function calculateACWR(
  checkins: { effort_yesterday: number | null }[]
): number | null {
  const efforts = checkins
    .map((c) => c.effort_yesterday)
    .filter((e): e is number => e !== null && e !== undefined);

  if (efforts.length < 4) return null;

  const acute = efforts.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
  const chronic = efforts.slice(0, 7).reduce((a, b) => a + b, 0) / Math.min(efforts.length, 7);

  if (chronic === 0) return null;
  return acute / chronic;
}

// ─── Alert Generator ────────────────────────────────────────────────────────

function generateAlerts(
  user: { days_since_rest: number; current_streak: number },
  todayCheckin: { pain_flag: boolean; academic_stress: number | null; readiness: string | null } | null,
  recentCheckins: { effort_yesterday: number | null }[],
  hasCheckedIn: boolean,
  localHour: number
): BriefingAlert[] {
  const alerts: BriefingAlert[] = [];

  // Performance Director: Rest day needed (6+ days)
  if (user.days_since_rest >= 6) {
    alerts.push({
      type: "rest_needed",
      emoji: "🛑",
      message:
        user.days_since_rest >= 7
          ? `${user.days_since_rest} days straight — rest day is overdue`
          : "6 days in a row — consider a rest day tomorrow",
      severity: user.days_since_rest >= 7 ? "critical" : "warn",
    });
  }

  // Performance Director: ACWR spike
  const acwr = calculateACWR(recentCheckins);
  if (acwr !== null && acwr > 1.3) {
    alerts.push({
      type: "acwr_warning",
      emoji: "📈",
      message: "Training load spiking — dial it back today",
      severity: "warn",
    });
  }

  // Pain flag from today's check-in
  if (todayCheckin?.pain_flag) {
    alerts.push({
      type: "pain_flag",
      emoji: "🚨",
      message: "You flagged pain — rest is the move today",
      severity: "critical",
    });
  }

  // Academic stress
  if (
    todayCheckin?.academic_stress !== null &&
    todayCheckin?.academic_stress !== undefined &&
    todayCheckin.academic_stress >= 7
  ) {
    alerts.push({
      type: "academic_stress",
      emoji: "📚",
      message: `Academic stress at ${todayCheckin.academic_stress}/10 — lighter session today`,
      severity: "warn",
    });
  }

  // Streak at risk (after 4pm, no check-in, has a streak)
  if (!hasCheckedIn && user.current_streak > 0 && localHour >= 16) {
    alerts.push({
      type: "streak_risk",
      emoji: "🔥",
      message: `${user.current_streak}-day streak at risk — check in before midnight`,
      severity: "info",
    });
  }

  return alerts;
}

// ─── Quick Actions Generator ────────────────────────────────────────────────

function generateQuickActions(
  hasCheckedIn: boolean,
  hasPlan: boolean
): QuickAction[] {
  const actions: QuickAction[] = [];

  if (!hasCheckedIn) {
    actions.push({
      label: "Check in",
      icon: "clipboard-outline",
      screen: "Checkin",
    });
  }

  if (hasPlan) {
    actions.push({
      label: "View plan",
      icon: "fitness-outline",
      screen: "Plan",
    });
  }

  actions.push({
    label: "Run a test",
    icon: "stopwatch-outline",
    screen: "PhoneTestsList",
  });

  // Cap at 3
  return actions.slice(0, 3);
}

// ─── Main Briefing Generator ────────────────────────────────────────────────

export async function generateBriefing(
  userId: string,
  clientHour?: number,
  timezone?: string
): Promise<DailyBriefing> {
  const db = supabaseAdmin();
  const tz = timezone || "UTC";
  const today = new Date().toLocaleDateString("en-CA", { timeZone: tz }); // YYYY-MM-DD in player's local TZ
  const localHour = clientHour ?? new Date().getHours();

  // 7 parallel queries (6 existing + Layer 4 recs)
  const [userRes, checkinRes, planRes, eventsRes, recentRes, sleepRes, rieRecsRes] =
    await Promise.all([
      db
        .from("users")
        .select(
          "name, sport, archetype, current_streak, days_since_rest"
        )
        .eq("id", userId)
        .single(),
      db
        .from("checkins")
        .select("energy, soreness, sleep_hours, readiness, pain_flag, academic_stress")
        .eq("user_id", userId)
        .eq("date", today)
        .single(),
      db
        .from("plans")
        .select("intensity, workout_type, duration, readiness, status")
        .eq("user_id", userId)
        .eq("date", today)
        .single(),
      db
        .from("calendar_events")
        .select("title, start_at, event_type")
        .eq("user_id", userId)
        .gte("start_at", `${today}T00:00:00`)
        .lte("start_at", `${today}T23:59:59`)
        .order("start_at", { ascending: true })
        .limit(3),
      db
        .from("checkins")
        .select("effort_yesterday, energy, soreness")
        .eq("user_id", userId)
        .order("date", { ascending: false })
        .limit(7),
      db
        .from("sleep_logs")
        .select("duration_hours, quality")
        .eq("user_id", userId)
        .order("date", { ascending: false })
        .limit(1),
      // Layer 4 — top P1/P2 rec for daily AI insight
      getRecommendations(userId, { role: "ATHLETE", limit: 3 }).catch(() => [] as Recommendation[]),
    ]);

  const user = userRes.data ?? {
    name: "Athlete",
    sport: "football",
    archetype: null,
    current_streak: 0,
    days_since_rest: 0,
  };

  const todayCheckin = checkinRes.data;
  const todayPlan = planRes.data;
  const events = eventsRes.data || [];
  const recentCheckins = recentRes.data || [];
  const rieRecs: Recommendation[] = (rieRecsRes as Recommendation[]) ?? [];
  const hasCheckedIn = !!todayCheckin;

  // Readiness status
  let readinessStatus: "green" | "yellow" | "red" | "unknown" = "unknown";
  if (todayCheckin?.readiness) {
    const r = todayCheckin.readiness.toLowerCase();
    if (r === "green") readinessStatus = "green";
    else if (r === "yellow") readinessStatus = "yellow";
    else if (r === "red") readinessStatus = "red";
  }

  // Archetype emoji
  const archetypeEmoji = user.archetype
    ? ArchetypeInfo[user.archetype as Archetype]?.emoji || null
    : null;

  // Plan summary
  const planSummary: BriefingPlanSummary | null = todayPlan
    ? {
        intensity: todayPlan.intensity,
        workoutType: todayPlan.workout_type,
        duration: todayPlan.duration,
      }
    : null;

  // Upcoming events
  const upcomingEvents: BriefingEvent[] = events.map((e: any) => ({
    title: e.title,
    time: e.start_at
      ? new Date(e.start_at).toLocaleTimeString("en-US", {
          timeZone: tz,
          hour: "numeric",
          minute: "2-digit",
        })
      : null,
    type: e.event_type,
  }));

  // Alerts
  const alerts = generateAlerts(
    user as { days_since_rest: number; current_streak: number },
    todayCheckin,
    recentCheckins as { effort_yesterday: number | null }[],
    hasCheckedIn,
    localHour
  );

  // Quick actions
  const quickActions = generateQuickActions(hasCheckedIn, !!todayPlan);

  return {
    greeting: buildGreeting(user.name, localHour),
    readinessStatus,
    readinessLabel: getReadinessLabel(readinessStatus),
    hasCheckedIn,
    streakCount: user.current_streak ?? 0,
    streakAtRisk: !hasCheckedIn && (user.current_streak ?? 0) > 0 && localHour >= 16,
    todayPlan: planSummary,
    upcomingEvents,
    alerts,
    quickActions,
    archetypeEmoji,
    // Layer 4 — top P1/P2 rec for the "AI Insight" card on Timeline
    topRecommendation: rieRecs.length > 0
      ? {
          recType: rieRecs[0].rec_type,
          priority: rieRecs[0].priority,
          title: rieRecs[0].title,
          bodyShort: rieRecs[0].body_short,
        }
      : null,
  };
}
