/**
 * For You Service — AI-personalized daily recommendations
 *
 * Aggregates player data (checkins, tests, plans, progress, stats)
 * and calls Claude to generate personalized ForYou content.
 * Falls back to rule-based defaults if Claude is unavailable.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import Anthropic from "@anthropic-ai/sdk";
import { getRecommendations } from "@/services/recommendations/getRecommendations";
import type { Recommendation } from "@/services/recommendations/types";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ForYouQuickAction {
  label: string;
  icon: string;
  screen: string;
  params?: Record<string, unknown>;
}

export interface ForYouContent {
  greeting: string;
  readiness: {
    score: number;
    status: "green" | "yellow" | "red" | "unknown";
    label: string;
  };
  focusArea: {
    attribute: string;
    attributeKey: string;
    score: number;
    headline: string;
    description: string;
    drills: string[];
    color: string;
    ctaScreen: string;
    ctaLabel: string;
  } | null;
  tomorrowPreview: {
    intensity: string;
    workoutType: string;
    duration: number;
    description: string;
  } | null;
  recoveryTips: Array<{
    emoji: string;
    title: string;
    detail: string;
    color: string;
  }>;
  nextMilestone: {
    name: string;
    current: number;
    target: number;
    progress: number;
  } | null;
  peerInsight: string | null;
  challenge: {
    title: string;
    description: string;
    metric: string;
    ctaScreen: string;
  } | null;
  alerts: Array<{
    type: string;
    emoji: string;
    message: string;
    severity: "info" | "warn" | "critical";
  }>;
  /** Layer 4 RIE recommendations — pre-computed, priority-ordered */
  recommendations: Array<{
    recType: string;
    priority: number;
    title: string;
    bodyShort: string;
    bodyLong: string | null;
    confidence: number;
  }>;
  quickActions: ForYouQuickAction[];
  generatedAt: string;
}

// ─── Attribute Metadata ─────────────────────────────────────────────────────

const ATTRIBUTE_META: Record<string, { color: string; fullName: string }> = {
  pace: { color: "#00D9FF", fullName: "Pace" },
  shooting: { color: "#FF6B35", fullName: "Shooting" },
  passing: { color: "#30D158", fullName: "Passing" },
  dribbling: { color: "#A855F7", fullName: "Dribbling" },
  defending: { color: "#F39C12", fullName: "Defending" },
  physicality: { color: "#E74C3C", fullName: "Physicality" },
};

const TEST_ATTRIBUTE_MAP: Record<string, string[]> = {
  sprint: ["pace"],
  jump: ["physicality", "defending"],
  endurance: ["physicality"],
  agility: ["dribbling"],
  shooting: ["shooting"],
  passing: ["passing"],
  strength: ["defending", "physicality"],
};

// ─── Attribute → Screen Mapping ──────────────────────────────────────────────

const ATTRIBUTE_TO_SCREEN: Record<string, { screen: string; label: string }> = {
  pace: { screen: "SprintTest", label: "Run Sprint Test" },
  shooting: { screen: "PhoneTestsList", label: "Test Your Shooting" },
  passing: { screen: "PhoneTestsList", label: "Test Your Passing" },
  dribbling: { screen: "AgilityTest", label: "Run Agility Test" },
  defending: { screen: "JumpTest", label: "Test Explosiveness" },
  physicality: { screen: "JumpTest", label: "Test Your Power" },
};

// ─── Streak Milestones ──────────────────────────────────────────────────────

const STREAK_MILESTONES = [
  { id: "week_streak", name: "Week Warrior", target: 7 },
  { id: "two_week_streak", name: "Consistent", target: 14 },
  { id: "month_streak", name: "Unstoppable", target: 30 },
  { id: "quarter_streak", name: "Legend", target: 90 },
];

// ─── Greeting Generator ─────────────────────────────────────────────────────

function buildGreeting(name: string, hour: number): string {
  const first = name?.split(" ")[0] || "champ";
  if (hour < 12) return `gm ${first}`;
  if (hour < 17) return `afternoon grind ${first}`;
  return `evening ${first}`;
}

// ─── ACWR-lite ──────────────────────────────────────────────────────────────

function calculateACWR(
  checkins: { effort_yesterday: number | null }[]
): number | null {
  const efforts = checkins
    .map((c) => c.effort_yesterday)
    .filter((e): e is number => e !== null && e !== undefined);
  if (efforts.length < 4) return null;
  const acute = efforts.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
  const chronic =
    efforts.slice(0, 7).reduce((a, b) => a + b, 0) /
    Math.min(efforts.length, 7);
  if (chronic === 0) return null;
  return acute / chronic;
}

// ─── Alert Generator ────────────────────────────────────────────────────────

function generateAlerts(
  user: { days_since_rest: number; current_streak: number },
  todayCheckin: {
    pain_flag: boolean;
    academic_stress: number | null;
    readiness: string | null;
  } | null,
  recentCheckins: { effort_yesterday: number | null }[],
  hasCheckedIn: boolean,
  localHour: number
): ForYouContent["alerts"] {
  const alerts: ForYouContent["alerts"] = [];

  if (user.days_since_rest >= 6) {
    alerts.push({
      type: "rest_needed",
      emoji: "",
      message:
        user.days_since_rest >= 7
          ? `${user.days_since_rest} days straight — rest day is overdue`
          : "6 days in a row — consider a rest day tomorrow",
      severity: user.days_since_rest >= 7 ? "critical" : "warn",
    });
  }

  const acwr = calculateACWR(recentCheckins);
  if (acwr !== null && acwr > 1.3) {
    alerts.push({
      type: "acwr_warning",
      emoji: "",
      message: "Training load spiking — dial it back today",
      severity: "warn",
    });
  }

  if (todayCheckin?.pain_flag) {
    alerts.push({
      type: "pain_flag",
      emoji: "",
      message: "You flagged pain — rest is the move today",
      severity: "critical",
    });
  }

  if (
    todayCheckin?.academic_stress !== null &&
    todayCheckin?.academic_stress !== undefined &&
    todayCheckin.academic_stress >= 7
  ) {
    alerts.push({
      type: "academic_stress",
      emoji: "",
      message: `Academic stress at ${todayCheckin.academic_stress}/10 — lighter session today`,
      severity: "warn",
    });
  }

  if (!hasCheckedIn && user.current_streak > 0 && localHour >= 16) {
    alerts.push({
      type: "streak_risk",
      emoji: "",
      message: `${user.current_streak}-day streak at risk — check in before midnight`,
      severity: "info",
    });
  }

  return alerts;
}

// ─── Compute Attribute Scores from Test Results ─────────────────────────────

function computeAttributeScores(
  testResults: Array<{
    test_type: string;
    percentile: number | null;
    created_at: string;
  }>
): Record<string, number> {
  const scores: Record<string, number[]> = {};

  for (const r of testResults) {
    if (r.percentile == null) continue;
    const attrs = TEST_ATTRIBUTE_MAP[r.test_type] || [];
    for (const attr of attrs) {
      if (!scores[attr]) scores[attr] = [];
      scores[attr].push(r.percentile);
    }
  }

  const result: Record<string, number> = {};
  for (const [attr, vals] of Object.entries(scores)) {
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    result[attr] = Math.min(99, Math.round(avg * 0.99));
  }

  return result;
}

// ─── Claude AI Recommendation Generator ─────────────────────────────────────

interface PlayerDataSummary {
  name: string;
  age: number | null;
  sport: string;
  position: string | null;
  streak: number;
  totalPoints: number;
  readiness: string | null;
  energy: number | null;
  soreness: number | null;
  sleepHours: number | null;
  painFlag: boolean;
  academicStress: number | null;
  todayPlan: { intensity: string; workoutType: string; duration: number } | null;
  attributeScores: Record<string, number>;
  recentTestCount: number;
  weeklyTestCount: number;
  /** Layer 4 RIE recommendations for grounding AI prompt */
  rieContext: string;
}

async function generateAIRecommendations(
  data: PlayerDataSummary
): Promise<{
  focusArea: ForYouContent["focusArea"];
  recoveryTips: ForYouContent["recoveryTips"];
  peerInsight: string | null;
  challenge: ForYouContent["challenge"];
} | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const client = new Anthropic({ apiKey });
    const model = process.env.ANTHROPIC_FORYOU_MODEL || "claude-haiku-4-5-20251001";

    // Find weakest attribute
    const attrs = Object.entries(data.attributeScores);
    const weakest = attrs.length > 0
      ? attrs.reduce((min, curr) => (curr[1] < min[1] ? curr : min))
      : null;

    const prompt = `You are a sports performance coach for a Gen Z athlete (ages 13-25). Generate personalized daily recommendations based on their data.

PLAYER DATA:
- Name: ${data.name}
- Age: ${data.age ?? "unknown"}
- Sport: ${data.sport}
- Position: ${data.position ?? "unknown"}
- Current streak: ${data.streak} days
- Total points: ${data.totalPoints}
- Today's readiness: ${data.readiness ?? "not checked in yet"}
- Energy level: ${data.energy ?? "unknown"}/10
- Soreness level: ${data.soreness ?? "unknown"}/10
- Last sleep: ${data.sleepHours ?? "unknown"} hours
- Pain flagged: ${data.painFlag ? "YES" : "no"}
- Academic stress: ${data.academicStress ?? "unknown"}/10
- Today's plan: ${data.todayPlan ? `${data.todayPlan.intensity} intensity, ${data.todayPlan.workoutType}, ${data.todayPlan.duration}min` : "no plan set"}
- Attribute scores (0-99): ${JSON.stringify(data.attributeScores)}
- Weakest attribute: ${weakest ? `${weakest[0]} (${weakest[1]})` : "none"}
- Tests this week: ${data.weeklyTestCount}
- Total recent tests: ${data.recentTestCount}
${data.rieContext ? `\nACTIVE RECOMMENDATIONS (pre-computed insights):\n${data.rieContext}\nUse these recommendations to ground your advice. They reflect the athlete's current state.` : ""}

Respond with ONLY valid JSON (no markdown, no code fences) in this exact format:
{
  "focusHeadline": "short headline for the weekly focus area (e.g. 'Level Up Your Defending')",
  "focusDescription": "1-2 sentences about why this area needs work and what improvement looks like",
  "focusDrills": ["drill 1 name", "drill 2 name", "drill 3 name"],
  "recoveryTips": [
    {"emoji": "", "title": "short title", "detail": "1 sentence personalized tip", "color": "#hex"},
    {"emoji": "", "title": "short title", "detail": "1 sentence personalized tip", "color": "#hex"},
    {"emoji": "", "title": "short title", "detail": "1 sentence personalized tip", "color": "#hex"}
  ],
  "peerInsight": "1 sentence insight about athletes with similar profiles (reference their archetype, age group, or sport)",
  "challengeTitle": "Challenge name (e.g. 'Sprint Speed Challenge')",
  "challengeDescription": "1 sentence description of the weekly challenge",
  "challengeMetric": "metric to track (e.g. 'Run 3 sprint tests this week')"
}

Rules:
- Use Gen Z language, keep it short and punchy
- Recovery tips should reference actual data (sleep hours, soreness level, etc.)
- Focus area should be the weakest attribute
- Challenge should be achievable in one week
- Peer insight should feel motivating, not judgmental
- All colors should be hex codes`;

    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content
      .filter(
        (block): block is Anthropic.TextBlock => block.type === "text"
      )
      .map((block) => block.text)
      .join("");

    const parsed = JSON.parse(text);

    // Map to ForYouContent types
    const focusAttrKey = weakest ? weakest[0] : null;
    const focusMeta = focusAttrKey ? ATTRIBUTE_META[focusAttrKey] : null;

    const focusScreenInfo = focusAttrKey ? ATTRIBUTE_TO_SCREEN[focusAttrKey] : null;

    return {
      focusArea: focusAttrKey && focusMeta
        ? {
            attribute: focusMeta.fullName,
            attributeKey: focusAttrKey,
            score: weakest![1],
            headline: parsed.focusHeadline || `Level Up Your ${focusMeta.fullName}`,
            description: parsed.focusDescription || "",
            drills: parsed.focusDrills || [],
            color: focusMeta.color,
            ctaScreen: focusScreenInfo?.screen || "PhoneTestsList",
            ctaLabel: focusScreenInfo?.label || "Start Training",
          }
        : null,
      recoveryTips: parsed.recoveryTips || [],
      peerInsight: parsed.peerInsight || null,
      challenge: parsed.challengeTitle
        ? {
            title: parsed.challengeTitle,
            description: parsed.challengeDescription || "",
            metric: parsed.challengeMetric || "",
            ctaScreen: "PhoneTestsList",
          }
        : null,
    };
  } catch (err) {
    console.error("[ForYou] Claude AI error:", err);
    return null;
  }
}

// ─── Fallback (rule-based) Recommendations ──────────────────────────────────

function generateFallbackRecommendations(
  data: PlayerDataSummary
): {
  focusArea: ForYouContent["focusArea"];
  recoveryTips: ForYouContent["recoveryTips"];
  peerInsight: string | null;
  challenge: ForYouContent["challenge"];
} {
  // Find weakest attribute
  const attrs = Object.entries(data.attributeScores);
  const weakest = attrs.length > 0
    ? attrs.reduce((min, curr) => (curr[1] < min[1] ? curr : min))
    : null;

  const focusAttrKey = weakest ? weakest[0] : null;
  const focusMeta = focusAttrKey ? ATTRIBUTE_META[focusAttrKey] : null;

  const focusScreenInfo = focusAttrKey ? ATTRIBUTE_TO_SCREEN[focusAttrKey] : null;

  const focusArea =
    focusAttrKey && focusMeta
      ? {
          attribute: focusMeta.fullName,
          attributeKey: focusAttrKey,
          score: weakest![1],
          headline: `Level Up Your ${focusMeta.fullName}`,
          description: `Your ${focusMeta.fullName} score (${weakest![1]}) has room to grow. Focus on targeted drills this week.`,
          drills: [
            `${focusMeta.fullName} drill set 1`,
            `${focusMeta.fullName} drill set 2`,
            `${focusMeta.fullName} drill set 3`,
          ],
          color: focusMeta.color,
          ctaScreen: focusScreenInfo?.screen || "PhoneTestsList",
          ctaLabel: focusScreenInfo?.label || "Start Training",
        }
      : null;

  // Recovery tips based on actual data
  const tips: ForYouContent["recoveryTips"] = [];

  if (data.sleepHours !== null) {
    tips.push({
      emoji: "",
      title: data.sleepHours < 8 ? "Sleep Target: 9+ hours" : "Great Sleep!",
      detail:
        data.sleepHours < 8
          ? `You got ${data.sleepHours}hrs last night. Push for 9+ tonight for max recovery.`
          : `${data.sleepHours}hrs — solid recovery sleep. Keep it up.`,
      color: "#00D9FF",
    });
  } else {
    tips.push({
      emoji: "",
      title: "Track Your Sleep",
      detail:
        "Log your sleep to get personalized recovery insights.",
      color: "#00D9FF",
    });
  }

  tips.push({
    emoji: "",
    title: "Hydration Check",
    detail:
      data.soreness !== null && data.soreness >= 7
        ? "High soreness — extra fluids today. Aim for 3L."
        : "Stay on top of hydration. Aim for 2.5L before bed.",
    color: "#30D158",
  });

  tips.push({
    emoji: "",
    title: "10-min Stretch",
    detail:
      data.soreness !== null && data.soreness >= 7
        ? "Soreness is high — stretching and foam rolling are key today."
        : "Focus on hip flexors and hamstrings for injury prevention.",
    color: "#A855F7",
  });

  return {
    focusArea,
    recoveryTips: tips,
    peerInsight:
      data.weeklyTestCount >= 3
        ? "Athletes who test 3x/week improve their overall rating 23% faster."
        : "Testing more frequently helps track progress — aim for 3 tests this week.",
    challenge: {
      title: "Sprint Speed Challenge",
      description:
        "Run 3 sprint tests this week and beat your personal best",
      metric: "3 sprint tests",
      ctaScreen: "SprintTest",
    },
  };
}

// ─── Main Generator ─────────────────────────────────────────────────────────

export async function generateForYouContent(
  userId: string,
  clientHour?: number
): Promise<ForYouContent> {
  const db = supabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);
  const localHour = clientHour ?? new Date().getHours();
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoStr = weekAgo.toISOString().slice(0, 10);
  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 30);
  const monthAgoStr = monthAgo.toISOString().slice(0, 10);

  // 8 parallel queries (7 existing + Layer 4 recs)
  const [
    userRes,
    checkinRes,
    planRes,
    recentCheckinsRes,
    testResultsRes,
    milestonesRes,
    weekTestsRes,
    rieRecsRes,
  ] = await Promise.all([
    db
      .from("users")
      .select(
        "name, sport, archetype, current_streak, days_since_rest, total_points, age"
      )
      .eq("id", userId)
      .single(),
    db
      .from("checkins")
      .select(
        "energy, soreness, sleep_hours, readiness, pain_flag, academic_stress"
      )
      .eq("user_id", userId)
      .eq("date", today)
      .single(),
    db
      .from("plans")
      .select("intensity, workout_type, duration")
      .eq("user_id", userId)
      .eq("date", today)
      .single(),
    db
      .from("checkins")
      .select("effort_yesterday, energy, soreness, sleep_hours")
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .limit(7),
    db
      .from("football_test_results")
      .select("test_type, percentile, created_at")
      .eq("user_id", userId)
      .gte("date", monthAgoStr)
      .order("created_at", { ascending: false }),
    db
      .from("milestones")
      .select("type")
      .eq("user_id", userId),
    db
      .from("football_test_results")
      .select("id")
      .eq("user_id", userId)
      .gte("date", weekAgoStr),
    // Layer 4 — top P1+P2+P3 recs for Own It page
    getRecommendations(userId, { role: "ATHLETE", limit: 8 }).catch(() => [] as Recommendation[]),
  ]);

  const user = userRes.data ?? {
    name: "Athlete",
    sport: "football",
    archetype: null,
    current_streak: 0,
    days_since_rest: 0,
    total_points: 0,
    age: null,
  };

  const todayCheckin = checkinRes.data;
  const todayPlan = planRes.data;
  const recentCheckins = recentCheckinsRes.data || [];
  const testResults = testResultsRes.data || [];
  const weekTests = weekTestsRes.data || [];
  const unlockedMilestones = (milestonesRes.data || []).map((m) => m.type);
  const rieRecs: Recommendation[] = (rieRecsRes as Recommendation[]) ?? [];
  const hasCheckedIn = !!todayCheckin;

  // Readiness
  let readinessStatus: "green" | "yellow" | "red" | "unknown" = "unknown";
  let readinessScore = 0;
  if (todayCheckin?.readiness) {
    const r = todayCheckin.readiness.toLowerCase();
    if (r === "green") {
      readinessStatus = "green";
      readinessScore = 85;
    } else if (r === "yellow") {
      readinessStatus = "yellow";
      readinessScore = 60;
    } else if (r === "red") {
      readinessStatus = "red";
      readinessScore = 30;
    }
  }

  const readinessLabels: Record<string, string> = {
    green: "Locked in",
    yellow: "Take it easy",
    red: "Rest day",
    unknown: "Check in to find out",
  };

  // Attribute scores
  const attributeScores = computeAttributeScores(
    testResults as Array<{
      test_type: string;
      percentile: number | null;
      created_at: string;
    }>
  );

  // Alerts
  const alerts = generateAlerts(
    user as { days_since_rest: number; current_streak: number },
    todayCheckin,
    recentCheckins as { effort_yesterday: number | null }[],
    hasCheckedIn,
    localHour
  );

  // Next milestone
  const unlockedIds = unlockedMilestones;
  let nextMilestone: ForYouContent["nextMilestone"] = null;
  for (const m of STREAK_MILESTONES) {
    if (!unlockedIds.includes(m.id)) {
      nextMilestone = {
        name: m.name,
        current: user.current_streak ?? 0,
        target: m.target,
        progress: Math.min(
          1,
          (user.current_streak ?? 0) / m.target
        ),
      };
      break;
    }
  }

  // Build RIE context string for AI grounding
  const rieContext = rieRecs.length > 0
    ? rieRecs.map((r) => {
        const pLabel = r.priority === 1 ? "URGENT" : r.priority === 2 ? "TODAY" : r.priority === 3 ? "THIS WEEK" : "INFO";
        return `- [${pLabel}] ${r.rec_type}: ${r.title} — ${r.body_short}`;
      }).join("\n")
    : "";

  // Player data summary for AI
  const playerData: PlayerDataSummary = {
    name: user.name || "Athlete",
    age: user.age as number | null,
    sport: user.sport || "football",
    position: null, // Could be enhanced later
    streak: user.current_streak ?? 0,
    totalPoints: user.total_points ?? 0,
    readiness: todayCheckin?.readiness ?? null,
    energy: todayCheckin?.energy ?? null,
    soreness: todayCheckin?.soreness ?? null,
    sleepHours: todayCheckin?.sleep_hours ?? null,
    painFlag: todayCheckin?.pain_flag ?? false,
    academicStress: todayCheckin?.academic_stress ?? null,
    todayPlan: todayPlan
      ? {
          intensity: todayPlan.intensity,
          workoutType: todayPlan.workout_type,
          duration: todayPlan.duration,
        }
      : null,
    attributeScores,
    recentTestCount: testResults.length,
    weeklyTestCount: weekTests.length,
    rieContext,
  };

  // Tomorrow preview
  const tomorrowPreview: ForYouContent["tomorrowPreview"] = todayPlan
    ? {
        intensity: todayPlan.intensity,
        workoutType: todayPlan.workout_type,
        duration: todayPlan.duration,
        description:
          readinessStatus === "green"
            ? "You're good to go — full intensity."
            : readinessStatus === "yellow"
              ? "Technical focus — light intensity. Recovery is key."
              : readinessStatus === "red"
                ? "Rest day recommended. Listen to your body."
                : "Check in to get a personalized plan.",
      }
    : null;

  // Generate AI recommendations (with fallback)
  const aiRecs = await generateAIRecommendations(playerData);
  const recs = aiRecs || generateFallbackRecommendations(playerData);

  // Quick actions
  const quickActions: ForYouQuickAction[] = [];
  if (!hasCheckedIn) {
    quickActions.push({ label: "Check In", icon: "clipboard-outline", screen: "Checkin" });
  }

  return {
    greeting: buildGreeting(user.name || "Athlete", localHour),
    readiness: {
      score: readinessScore,
      status: readinessStatus,
      label: readinessLabels[readinessStatus],
    },
    focusArea: recs.focusArea,
    tomorrowPreview,
    recoveryTips: recs.recoveryTips,
    nextMilestone,
    peerInsight: recs.peerInsight,
    challenge: recs.challenge,
    alerts,
    recommendations: rieRecs.map((r) => ({
      recType: r.rec_type,
      priority: r.priority,
      title: r.title,
      bodyShort: r.body_short,
      bodyLong: r.body_long,
      confidence: r.confidence_score,
    })),
    quickActions: quickActions.slice(0, 3),
    generatedAt: new Date().toISOString(),
  };
}
