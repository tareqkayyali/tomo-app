/**
 * Intent Handlers — capsule-building functions extracted from orchestrator.
 * Each handler maps to one intent and returns an OrchestratorResult.
 */

import { executeTimelineTool } from "./timelineAgent";
import { executeOutputTool } from "./outputAgent";
import { executeMasteryTool } from "./masteryAgent";
import type { PlayerContext, ActiveRecommendation } from "./contextBuilder";
import type { ConversationState } from "./sessionService";
import type { OrchestratorResult } from "./orchestrator";
import { buildTextResponse } from "./responseFormatter";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export type IntentHandler = (
  message: string,
  params: Record<string, any>,
  context: PlayerContext,
  conversationState: ConversationState | null
) => Promise<OrchestratorResult | null>;

// ── Test Log Handler ──
async function handleLogTest(
  message: string, params: Record<string, any>, context: PlayerContext
): Promise<OrchestratorResult | null> {
  const catalogResult = await executeOutputTool("get_test_catalog", {}, context);
  if (!catalogResult.result?.readyToUseCapsuleCard) return null;

  const capsuleCard = catalogResult.result.readyToUseCapsuleCard;
  const lowerMsg = message.toLowerCase();

  // Pre-fill test type if mentioned
  const testHints: Record<string, string> = {
    "sprint": "10m-sprint", "10m": "10m-sprint", "20m": "20m-sprint", "30m": "30m-sprint",
    "cmj": "cmj", "jump": "cmj", "vertical": "vertical-jump", "broad jump": "broad-jump",
    "agility": "5-10-5-agility", "5-10-5": "5-10-5-agility", "t-test": "t-test",
    "reaction": "reaction-time", "balance": "balance-y",
    "beep": "beep-test", "yoyo": "yoyo-ir1", "vo2": "vo2max",
    "grip": "grip-strength", "squat": "1rm-squat", "bench": "1rm-bench",
  };
  for (const [hint, testId] of Object.entries(testHints)) {
    if (lowerMsg.includes(hint) && capsuleCard.catalog.some((t: any) => t.id === testId)) {
      capsuleCard.prefilledTestType = testId;
      break;
    }
  }

  const testName = capsuleCard.prefilledTestType
    ? capsuleCard.prefilledTestType.replace(/-/g, " ")
    : "test";

  return {
    message: `Log your ${testName} result`,
    structured: {
      headline: `Log your ${testName} result`,
      cards: [capsuleCard],
      chips: [],
    },
    refreshTargets: [],
    agentType: "output",
  };
}

// ── Check-in Handler ──
async function handleCheckIn(
  _message: string, _params: Record<string, any>, context: PlayerContext
): Promise<OrchestratorResult | null> {
  return {
    message: "Quick check-in",
    structured: {
      headline: "Quick check-in",
      cards: [{
        type: "checkin_capsule" as const,
        prefilledDate: context.todayDate,
        lastCheckinDate: undefined,
      }],
      chips: [],
    },
    refreshTargets: [],
    agentType: "output",
  };
}

// ── Navigation Handler ──
async function handleNavigate(
  message: string, params: Record<string, any>, context: PlayerContext
): Promise<OrchestratorResult | null> {
  const lowerMsg = message.toLowerCase();
  const navMap: Record<string, { tabName: string; icon: string; label: string; description: string }> = {
    "timeline":   { tabName: "Timeline", icon: "📅", label: "Timeline", description: "Your calendar and daily schedule" },
    "calendar":   { tabName: "Timeline", icon: "📅", label: "Timeline", description: "Your calendar and daily schedule" },
    "schedule":   { tabName: "Timeline", icon: "📅", label: "Timeline", description: "Your calendar and daily schedule" },
    "output":     { tabName: "Output", icon: "📊", label: "Output", description: "Vitals, metrics, and programs" },
    "vitals":     { tabName: "Output", icon: "📊", label: "My Vitals", description: "Readiness, sleep, and energy trends" },
    "metrics":    { tabName: "Output", icon: "📊", label: "My Metrics", description: "Test scores and benchmarks" },
    "programs":   { tabName: "Output", icon: "📊", label: "My Programs", description: "Training programs and recommendations" },
    "tests":      { tabName: "Output", icon: "📊", label: "My Metrics", description: "Test scores and benchmarks" },
    "mastery":    { tabName: "Mastery", icon: "🧬", label: "Mastery", description: "DNA card, pillars, and streaks" },
    "progress":   { tabName: "Mastery", icon: "🧬", label: "Mastery", description: "DNA card, pillars, and streaks" },
    "dna":        { tabName: "Mastery", icon: "🧬", label: "Mastery", description: "Your DNA card and identity" },
    "own it":     { tabName: "OwnIt", icon: "🎯", label: "Own It", description: "Personalized recommendations and focus" },
    "for you":    { tabName: "OwnIt", icon: "🎯", label: "Own It", description: "Personalized recommendations and focus" },
    "recommendations": { tabName: "OwnIt", icon: "🎯", label: "Own It", description: "Personalized recommendations and focus" },
    "chat":       { tabName: "Home", icon: "💬", label: "Tomo Chat", description: "AI command center" },
  };

  // If classifier extracted targetTab, use it
  if (params.targetTab) {
    const tabMap: Record<string, typeof navMap[string]> = {
      Timeline: navMap["timeline"],
      Output: navMap["output"],
      Mastery: navMap["mastery"],
      OwnIt: navMap["own it"],
      Home: navMap["chat"],
    };
    const nav = tabMap[params.targetTab];
    if (nav) {
      return {
        message: `Opening ${nav.label}`,
        structured: {
          headline: `Opening ${nav.label}`,
          cards: [{ type: "navigation_capsule" as const, icon: nav.icon, target: nav.tabName, label: nav.label, description: nav.description, deepLink: { tabName: nav.tabName } }],
          chips: [],
        },
        refreshTargets: [],
        agentType: "output",
      };
    }
  }

  for (const [keyword, nav] of Object.entries(navMap)) {
    if (lowerMsg.includes(keyword)) {
      return {
        message: `Opening ${nav.label}`,
        structured: {
          headline: `Opening ${nav.label}`,
          cards: [{ type: "navigation_capsule" as const, icon: nav.icon, target: nav.tabName, label: nav.label, description: nav.description, deepLink: { tabName: nav.tabName } }],
          chips: [],
        },
        refreshTargets: [],
        agentType: "output",
      };
    }
  }
  return null;
}

// ── Quick Action Handlers ──
async function handleQuickAction(
  toolName: string,
  toolInput: Record<string, any>,
  executor: (name: string, input: Record<string, any>, ctx: PlayerContext) => Promise<any>,
  headline: string,
  agentType: string,
  context: PlayerContext
): Promise<OrchestratorResult | null> {
  try {
    const result = await executor(toolName, toolInput, context);
    if (result.result) {
      const { formatQuickAction } = await import("./quickActionFormatter");
      const formatted = formatQuickAction(toolName, result.result, context);
      return {
        message: headline,
        structured: formatted,
        refreshTargets: result.refreshTarget ? [result.refreshTarget] : [],
        agentType,
      };
    }
  } catch (e) {
    logger.warn("[intent-handler] Quick action failed", { tool: toolName, error: e });
  }
  return null;
}

async function handleQaReadiness(_m: string, _p: Record<string, any>, ctx: PlayerContext): Promise<OrchestratorResult | null> {
  return handleQuickAction("get_readiness_detail", {}, executeOutputTool, "Your readiness", "output", ctx);
}
async function handleQaStreak(_m: string, _p: Record<string, any>, ctx: PlayerContext): Promise<OrchestratorResult | null> {
  return handleQuickAction("get_consistency_score", {}, executeMasteryTool, "Your streak", "mastery", ctx);
}
async function handleQaLoad(_m: string, _p: Record<string, any>, ctx: PlayerContext): Promise<OrchestratorResult | null> {
  return handleQuickAction("get_dual_load_score", {}, executeOutputTool, "Your load", "output", ctx);
}
async function handleQaTodaySchedule(_m: string, _p: Record<string, any>, ctx: PlayerContext): Promise<OrchestratorResult | null> {
  return handleQuickAction("get_today_events", { date: ctx.todayDate }, executeTimelineTool, "Today's schedule", "timeline", ctx);
}
async function handleQaWeekSchedule(_m: string, _p: Record<string, any>, ctx: PlayerContext): Promise<OrchestratorResult | null> {
  return handleQuickAction("get_week_schedule", { startDate: ctx.todayDate }, executeTimelineTool, "This week", "timeline", ctx);
}
async function handleQaTestHistory(_m: string, _p: Record<string, any>, ctx: PlayerContext): Promise<OrchestratorResult | null> {
  return handleQuickAction("get_test_results", {}, executeOutputTool, "Your test history", "output", ctx);
}

// ── Show Programs Handler ──
async function handleShowPrograms(
  _message: string, _params: Record<string, any>, context: PlayerContext
): Promise<OrchestratorResult | null> {
  try {
    const result = await executeOutputTool("get_my_programs", {}, context);
    if (result.result?.programs && result.result.programs.length > 0) {
      const programCards = result.result.programs.slice(0, 5).map((p: any) => ({
        type: "program_action_capsule" as const,
        programId: p.id ?? p.programId ?? "",
        programName: p.name ?? p.programName ?? "Training Program",
        frequency: (p.frequency && p.frequency !== "undefined" && p.frequency !== "null") ? p.frequency : (p.sessionsPerWeek ? `${p.sessionsPerWeek}x/week` : "3x/week"),
        duration: p.duration ?? (p.durationWeeks ? `${p.durationWeeks} weeks` : "6 weeks"),
        priority: (p.priority === 1 ? "high" : p.priority === 2 ? "medium" : "low") as "high" | "medium" | "low",
        currentStatus: p.status ?? null,
        availableActions: p.status === "active"
          ? ["done" as const, "dismissed" as const]
          : ["details" as const, "add_to_training" as const],
      }));

      return {
        message: "Your programs",
        structured: { headline: "Your programs", cards: programCards, chips: [{ label: "Recommend more", action: "What programs do you recommend for me?" }] },
        refreshTargets: [],
        agentType: "output",
      };
    }

    // No active programs — show recommendations
    const recResult = await executeOutputTool("get_training_program_recommendations", {}, context);
    const recs = recResult.result?.programs ?? recResult.result?.recommendations ?? [];
    if (recs.length > 0) {
      const recCards = recs.slice(0, 5).map((p: any) => ({
        type: "program_action_capsule" as const,
        programId: p.id ?? p.programId ?? "",
        programName: p.name ?? p.programName ?? "Training Program",
        frequency: (p.frequency && p.frequency !== "undefined" && p.frequency !== "null") ? p.frequency : (p.sessionsPerWeek ? `${p.sessionsPerWeek}x/week` : "3x/week"),
        duration: p.duration ?? (p.durationWeeks ? `${p.durationWeeks} weeks` : "6 weeks"),
        priority: (p.priority === 1 ? "high" : p.priority === 2 ? "medium" : "low") as "high" | "medium" | "low",
        currentStatus: null,
        availableActions: ["details" as const, "add_to_training" as const],
      }));

      return {
        message: "Recommended programs for you",
        structured: {
          headline: "🏋️ Recommended Programs",
          cards: recCards,
          chips: [
            { label: "Build me a session", action: "Build me a training session for today" },
            { label: "Focus on speed", action: "I want to improve my sprint speed" },
          ],
        },
        refreshTargets: [],
        agentType: "output",
      };
    }
  } catch (e) {
    logger.warn("[intent-handler] show_programs failed", { error: e });
  }
  return null;
}

// ── Manage Programs Handler ──
async function handleManagePrograms(
  _message: string, _params: Record<string, any>, context: PlayerContext
): Promise<OrchestratorResult | null> {
  try {
    const db = supabaseAdmin();
    const { data: snapshot } = await db.from("athlete_snapshots").select("program_recommendations").eq("athlete_id", context.userId).single();
    const { data: interactions } = await (db as any).from("program_interactions").select("program_id, action").eq("user_id", context.userId);

    const interactionMap = new Map((interactions ?? []).map((i: any) => [i.program_id, i.action]));
    const recs = (snapshot as any)?.program_recommendations?.programs ?? [];

    const programs = recs.slice(0, 6).map((p: any) => ({
      programId: p.programId ?? p.id,
      name: p.name,
      category: p.category ?? "",
      status: interactionMap.get(p.programId ?? p.id) ?? "recommended",
      description: p.description?.substring(0, 80),
    }));

    if (programs.length > 0) {
      return {
        message: "Your programs",
        structured: { headline: "📋 Your Programs", cards: [{ type: "program_interact_capsule" as const, programs }], chips: [] },
        refreshTargets: [],
        agentType: "output",
      };
    }
  } catch (e) {
    logger.warn("[intent-handler] manage_programs failed", { error: e });
  }
  return null;
}

// ── Timeline Capabilities Handler ──
async function handleTimelineCapabilities(
  _message: string, _params: Record<string, any>, _context: PlayerContext
): Promise<OrchestratorResult | null> {
  return {
    message: "Here's what I can help you with on your timeline",
    structured: {
      headline: "📅 Timeline Command Center",
      cards: [{ type: "text_card" as const, headline: "📅 Your Timeline Powers", body: "I can manage your entire schedule through chat. Tap any option below:" }],
      chips: [
        { label: "📅 Add an event", action: "I want to add a training session" },
        { label: "⚙️ Edit my rules", action: "Edit my schedule rules" },
        { label: "🗓️ Plan my training", action: "Plan my training week" },
        { label: "📚 Plan my study", action: "Plan my study schedule" },
        { label: "📊 View my week", action: "Show me this week's schedule" },
        { label: "⚡ Check conflicts", action: "Check for any schedule conflicts" },
      ],
    },
    refreshTargets: [],
    agentType: "timeline",
  };
}

// ── Conflict Resolution Handler ──
async function handleCheckConflicts(
  _message: string, _params: Record<string, any>, context: PlayerContext
): Promise<OrchestratorResult | null> {
  try {
    const result = await executeTimelineTool("detect_load_collision", { dateRange: 7 }, context);
    const data = result.result as any;

    return {
      message: data.collisions?.length > 0
        ? `Found ${data.collisions.length} conflict${data.collisions.length > 1 ? 's' : ''}`
        : "No conflicts found",
      structured: {
        headline: data.collisions?.length > 0
          ? `⚠️ ${data.collisions.length} Schedule Conflict${data.collisions.length > 1 ? 's' : ''}`
          : "✅ Schedule looks clean",
        cards: [{ type: "conflict_resolution_capsule" as const, conflicts: data.collisions ?? [], daysChecked: data.daysChecked ?? 7, totalEvents: data.totalEvents ?? 0 }],
        chips: data.collisions?.length > 0 ? [
          { label: "Fix all conflicts", action: "Help me resolve all my schedule conflicts" },
          { label: "View my week", action: "Show me this week's full schedule" },
        ] : [
          { label: "Add training", action: "I want to add a training session" },
          { label: "View my week", action: "Show me this week's full schedule" },
        ],
      },
      refreshTargets: [],
      agentType: "timeline",
    };
  } catch (e) {
    logger.warn("[intent-handler] check_conflicts failed", { error: e });
  }
  return null;
}

// ── Ghost Suggestions Handler ──
async function handleGhostSuggestions(
  _message: string, _params: Record<string, any>, context: PlayerContext
): Promise<OrchestratorResult | null> {
  try {
    const result = await executeTimelineTool("get_ghost_suggestions", {}, context);
    const suggestions = (result.result as any)?.suggestions ?? [];

    return {
      message: suggestions.length > 0 ? `${suggestions.length} suggestion${suggestions.length > 1 ? "s" : ""} found` : "No suggestions",
      structured: {
        headline: suggestions.length > 0 ? "👻 Smart Suggestions" : "👻 No Suggestions Yet",
        cards: [{
          type: "ghost_suggestion_capsule" as const,
          suggestions: suggestions.map((s: any) => ({
            patternKey: s.suggestion?.patternKey ?? "", name: s.suggestion?.name ?? "Training",
            eventType: s.suggestion?.type ?? "training", date: s.date,
            startTime: s.suggestion?.startTime ?? null, endTime: s.suggestion?.endTime ?? null,
            confidence: s.suggestion?.confidence ?? 0.5, patternDescription: s.suggestion?.patternDescription ?? "",
          })),
        }],
        chips: [],
      },
      refreshTargets: [],
      agentType: "timeline",
    };
  } catch (e) {
    logger.warn("[intent-handler] ghost_suggestions failed", { error: e });
  }
  return null;
}

// ── Day Lock Handler ──
async function handleDayLock(
  message: string, _params: Record<string, any>, context: PlayerContext
): Promise<OrchestratorResult | null> {
  try {
    const { parseEventHints } = await import("./eventHintParser");
    const hints = parseEventHints(message.toLowerCase(), context);
    const targetDate = hints.date || context.todayDate;

    const db = supabaseAdmin();
    const { data: lockData } = await (db as any).from("day_locks").select("locked_at").eq("user_id", context.userId).eq("date", targetDate).maybeSingle();
    const isLocked = !!lockData;

    return {
      message: isLocked ? "Day is locked" : "Day is unlocked",
      structured: {
        headline: isLocked ? "🔒 Day Locked" : "🔓 Day Unlocked",
        cards: [{ type: "day_lock_capsule" as const, date: targetDate, locked: isLocked }],
        chips: [],
      },
      refreshTargets: [],
      agentType: "timeline",
    };
  } catch (e) {
    logger.warn("[intent-handler] day_lock failed", { error: e });
  }
  return null;
}

// ── Whoop Sync Handler ──
async function handleWhoopSync(
  _message: string, _params: Record<string, any>, context: PlayerContext
): Promise<OrchestratorResult | null> {
  try {
    const db = supabaseAdmin();
    const { data: connection } = await (db as any).from("wearable_connections").select("provider, last_sync_at").eq("user_id", context.userId).eq("provider", "whoop").maybeSingle();
    const connected = !!connection;
    const lastSyncAt = (connection as any)?.last_sync_at ? new Date((connection as any).last_sync_at).toLocaleString("en-GB", { timeZone: context.timezone, hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short", hour12: false }) : undefined;

    return {
      message: connected ? "Whoop ready to sync" : "Whoop not connected",
      structured: {
        headline: connected ? "⌚ Whoop Sync" : "⌚ Whoop Not Connected",
        cards: [{ type: "whoop_sync_capsule" as const, connected, lastSyncAt }],
        chips: connected ? [] : [{ label: "Go to Settings", action: "Navigate to settings to connect Whoop" }],
      },
      refreshTargets: [],
      agentType: "output",
    };
  } catch (e) {
    logger.warn("[intent-handler] whoop_sync failed", { error: e });
  }
  return null;
}

// ── Leaderboard Handler ──
async function handleLeaderboard(
  message: string, params: Record<string, any>, context: PlayerContext
): Promise<OrchestratorResult | null> {
  try {
    const db = supabaseAdmin();
    const boardType = params.boardType ?? (/streak/i.test(message) ? "streaks" : "global");
    const orderCol = boardType === "streaks" ? "current_streak" : "total_points";

    const { data: entries } = await db.from("users").select("id, name, sport, total_points, current_streak").order(orderCol, { ascending: false }).limit(10);
    const leaderboard = (entries ?? []).map((e: any, i: number) => ({
      rank: i + 1, name: e.name ?? "Player", sport: e.sport ?? "",
      totalPoints: e.total_points ?? 0, currentStreak: e.current_streak ?? 0,
      isCurrentUser: e.id === context.userId,
    }));
    const userRank = leaderboard.find((e: any) => e.isCurrentUser)?.rank ?? null;

    return {
      message: `Leaderboard — you're #${userRank ?? "?"}`,
      structured: {
        headline: "🏆 Leaderboard",
        cards: [{ type: "leaderboard_capsule" as const, boardType, entries: leaderboard, userRank }],
        chips: [
          ...(boardType === "global" ? [{ label: "🔥 Streak board", action: "Show me the streak leaderboard" }] : []),
          ...(boardType === "streaks" ? [{ label: "🏆 Points board", action: "Show me the global leaderboard" }] : []),
        ],
      },
      refreshTargets: [],
      agentType: "mastery",
    };
  } catch (e) {
    logger.warn("[intent-handler] leaderboard failed", { error: e });
  }
  return null;
}

// ── PHV Query Handler ──
async function handlePhvQuery(
  _message: string, _params: Record<string, any>, context: PlayerContext
): Promise<OrchestratorResult | null> {
  try {
    const db = supabaseAdmin();
    const { data: snapshot } = await db.from("athlete_snapshots").select("height_cm, sitting_height_cm, weight_kg, phv_offset_years, phv_stage").eq("athlete_id", context.userId).single();
    const s = snapshot as any;

    if (s?.phv_offset_years != null && s?.phv_stage) {
      const offset = s.phv_offset_years;
      const sign = offset > 0 ? "+" : "";
      const STAGE_LABELS: Record<string, string> = {
        "pre-phv-early": "Pre-PHV (Early)", "pre-phv-approaching": "Pre-PHV (Approaching)",
        "at-phv": "At PHV", "post-phv-recent": "Post-PHV (Recent)", "post-phv-stable": "Post-PHV (Stable)",
      };
      const stageLabel = STAGE_LABELS[s.phv_stage] ?? s.phv_stage;
      return {
        message: `Your current growth stage is ${stageLabel} (${sign}${offset} years from PHV)`,
        structured: {
          headline: `📊 Growth Stage: ${stageLabel}`,
          cards: [{
            type: "stat_grid" as const,
            items: [
              { label: "Maturity Offset", value: `${sign}${offset}`, unit: "yrs" },
              { label: "Stage", value: stageLabel, unit: "" },
              ...(s.height_cm ? [{ label: "Height", value: s.height_cm, unit: "cm" }] : []),
              ...(s.weight_kg ? [{ label: "Weight", value: s.weight_kg, unit: "kg" }] : []),
            ],
          }],
          chips: [{ label: "Recalculate", action: "Calculate my growth stage" }],
        },
        refreshTargets: [],
        agentType: "output",
      };
    }
    // No existing data — fall through to calculator
    return handlePhvCalculate("", {}, context, null);
  } catch (e) {
    logger.warn("[intent-handler] phv_query failed", { error: e });
  }
  return null;
}

// ── PHV Calculate Handler ──
async function handlePhvCalculate(
  _message: string, _params: Record<string, any>, context: PlayerContext, _state: ConversationState | null
): Promise<OrchestratorResult | null> {
  try {
    const db = supabaseAdmin();
    const { data: profile } = await db.from("users").select("gender, date_of_birth").eq("id", context.userId).single();
    const { data: snapshot } = await db.from("athlete_snapshots").select("height_cm, sitting_height_cm, weight_kg, phv_offset_years, phv_stage").eq("athlete_id", context.userId).single();
    const p = profile as any;
    const s = snapshot as any;

    return {
      message: "Calculate your growth stage",
      structured: {
        headline: "📏 Growth Stage Calculator",
        cards: [{
          type: "phv_calculator_capsule" as const,
          sex: p?.gender ?? undefined, dob: p?.date_of_birth ?? undefined,
          standingHeightCm: s?.height_cm ?? undefined, sittingHeightCm: s?.sitting_height_cm ?? undefined,
          weightKg: s?.weight_kg ?? undefined, previousOffset: s?.phv_offset_years ?? undefined,
          previousStage: s?.phv_stage ?? undefined,
        }],
        chips: [],
      },
      refreshTargets: [],
      agentType: "output",
    };
  } catch (e) {
    logger.warn("[intent-handler] phv_calculate failed", { error: e });
  }
  return null;
}

// ── Strengths & Gaps Handler ──
async function handleStrengthsGaps(
  _message: string, _params: Record<string, any>, context: PlayerContext
): Promise<OrchestratorResult | null> {
  try {
    const benchResult = await executeOutputTool("get_benchmark_comparison", {}, context);
    const profile = benchResult.result as any;
    if (profile?.results?.length > 0) {
      return {
        message: "Your performance profile",
        structured: {
          headline: "📊 Performance Profile",
          cards: [{
            type: "strengths_gaps_capsule" as const,
            overallPercentile: profile.overallPercentile ?? 0,
            strengths: (profile.strengths ?? []).slice(0, 3).map((s: string) => {
              const r = profile.results.find((r: any) => r.metricLabel === s);
              return r ? { metric: r.metricLabel, percentile: r.percentile, value: r.value, unit: r.unit } : { metric: s, percentile: 0, value: 0, unit: "" };
            }),
            gaps: (profile.gaps ?? []).slice(0, 3).map((g: string) => {
              const r = profile.results.find((r: any) => r.metricLabel === g);
              return r ? { metric: r.metricLabel, percentile: r.percentile, value: r.value, unit: r.unit } : { metric: g, percentile: 0, value: 0, unit: "" };
            }),
            totalMetrics: profile.results.length,
          }],
          chips: [
            { label: "Log a test", action: "I want to log a new test" },
            { label: "Get drills for gaps", action: "Give me drills to improve my weak areas" },
          ],
        },
        refreshTargets: [],
        agentType: "output",
      };
    }
  } catch (e) {
    logger.warn("[intent-handler] strengths_gaps failed", { error: e });
  }
  return null;
}

// ── Simple Capsule Handlers ──
async function handlePadelShots(): Promise<OrchestratorResult | null> {
  return {
    message: "Log padel session",
    structured: { headline: "🎾 Log Padel Session", cards: [{ type: "padel_shot_capsule" as const, shotTypes: [] }], chips: [] },
    refreshTargets: [], agentType: "output",
  };
}

async function handleBlazepods(): Promise<OrchestratorResult | null> {
  return {
    message: "Log BlazePods session",
    structured: { headline: "⚡ Log BlazePods Session", cards: [{ type: "blazepods_capsule" as const, drillTypes: [] }], chips: [] },
    refreshTargets: [], agentType: "output",
  };
}

async function handleNotificationSettings(
  _message: string, _params: Record<string, any>, context: PlayerContext
): Promise<OrchestratorResult | null> {
  const db = supabaseAdmin() as any;
  const { data: prefs } = await db
    .from("athlete_notification_preferences")
    .select("daily_reminder_time, push_training, push_coaching")
    .eq("athlete_id", context.userId)
    .maybeSingle();

  const dailyReminderTime = prefs?.daily_reminder_time ?? "07:00";

  return {
    message: "Notification settings",
    structured: {
      headline: "🔔 Notification Settings",
      cards: [{
        type: "notification_settings_capsule" as const,
        current: {
          dailyReminder: true,
          dailyReminderTime: dailyReminderTime,
          streakReminders: prefs?.push_training ?? true,
          milestoneAlerts: prefs?.push_coaching ?? true,
          redDayGuidance: true,
          weeklySummary: true,
        },
      }],
      chips: [],
    },
    refreshTargets: [], agentType: "output",
  };
}

// ── Exam / Subject / Category / Rules / Plans ──
async function handleAddExam(
  _message: string, _params: Record<string, any>, context: PlayerContext
): Promise<OrchestratorResult | null> {
  try {
    const db = supabaseAdmin();
    const { data: prefs } = await db.from("player_schedule_preferences").select("exam_schedule, study_subjects").eq("user_id", context.userId).single();
    const p = prefs as any;
    const existingExams = (p?.exam_schedule ?? []).filter((e: any) => e.examDate >= context.todayDate);
    const studySubjects = p?.study_subjects ?? [];
    return {
      message: "Add an exam",
      structured: { headline: "Add Exam", cards: [{ type: "exam_capsule" as const, existingExams, studySubjects }], chips: [] },
      refreshTargets: [], agentType: "timeline",
    };
  } catch { return null; }
}

async function handleManageSubjects(
  _message: string, _params: Record<string, any>, context: PlayerContext
): Promise<OrchestratorResult | null> {
  try {
    const db = supabaseAdmin();
    const { data: prefs } = await db.from("player_schedule_preferences").select("study_subjects").eq("user_id", context.userId).single();
    return {
      message: "Manage study subjects",
      structured: { headline: "Study Subjects", cards: [{ type: "subject_capsule" as const, currentSubjects: (prefs as any)?.study_subjects ?? [] }], chips: [] },
      refreshTargets: [], agentType: "timeline",
    };
  } catch { return null; }
}

async function handleTrainingCategories(
  _message: string, _params: Record<string, any>, context: PlayerContext
): Promise<OrchestratorResult | null> {
  try {
    const db = supabaseAdmin();
    const { data: prefs } = await db.from("player_schedule_preferences").select("training_categories").eq("user_id", context.userId).single();
    const cats = ((prefs as any)?.training_categories ?? []).map((c: any) => ({
      id: c.id, label: c.label, enabled: c.enabled ?? true,
      daysPerWeek: c.daysPerWeek ?? 3, sessionDuration: c.sessionDuration ?? 60,
      preferredTime: c.preferredTime ?? "afternoon",
    }));
    return {
      message: "Manage training categories",
      structured: { headline: "Training Categories", cards: [{ type: "training_category_capsule" as const, currentCategories: cats }], chips: [] },
      refreshTargets: [], agentType: "timeline",
    };
  } catch { return null; }
}

async function handleCreateEvent(
  message: string, _params: Record<string, any>, context: PlayerContext
): Promise<OrchestratorResult | null> {
  const { parseEventHints } = await import("./eventHintParser");
  const hints = parseEventHints(message.toLowerCase(), context);

  let trainingCategories: Array<{ id: string; label: string; icon?: string }> = [];
  try {
    const db = supabaseAdmin();
    const { data: prefData } = await db.from("player_schedule_preferences").select("training_categories").eq("user_id", context.userId).single();
    const cats = (prefData as any)?.training_categories;
    if (Array.isArray(cats)) {
      trainingCategories = cats.filter((c: any) => c.enabled !== false).map((c: any) => ({ id: c.id, label: c.label, icon: c.icon }));
    }
  } catch (e) { logger.warn("[intent-handler] Category load failed", { error: e }); }

  let prefilledCategory: string | undefined;
  for (const cat of trainingCategories) {
    if (message.toLowerCase().includes(cat.id) || message.toLowerCase().includes(cat.label.toLowerCase())) {
      prefilledCategory = cat.id;
      break;
    }
  }

  return {
    message: "Add event",
    structured: {
      headline: hints.title ? `Add "${hints.title}"` : "Add event",
      cards: [{
        type: "event_edit_capsule" as const, mode: "create" as const,
        prefilledTitle: hints.title, prefilledEventType: hints.eventType,
        prefilledDate: hints.date, prefilledStartTime: hints.startTime,
        prefilledEndTime: hints.endTime, prefilledIntensity: hints.intensity,
        prefilledCategory,
        trainingCategories: trainingCategories.length > 0 ? trainingCategories : undefined,
      }],
      chips: [],
    },
    refreshTargets: [],
    agentType: "timeline",
  };
}

async function handleDeleteEvent(
  message: string, _params: Record<string, any>, context: PlayerContext
): Promise<OrchestratorResult | null> {
  const { parseEventHints } = await import("./eventHintParser");
  const hints = parseEventHints(message.toLowerCase(), context);
  const targetDate = hints.date || context.todayDate;

  try {
    const result = await executeTimelineTool("get_today_events", { date: targetDate }, context);
    const events = Array.isArray(result.result) ? result.result : result.result?.events ?? [];
    const futureEvents = events.filter((e: any) => {
      const eventTime = e.local_start ?? e.startTime ?? "";
      return targetDate > context.todayDate || eventTime > (context.currentTime ?? "00:00");
    });

    return {
      message: "Cancel event",
      structured: {
        headline: "Cancel which event?",
        cards: [{
          type: "event_edit_capsule" as const, mode: "delete" as const,
          prefilledDate: targetDate,
          existingEvents: futureEvents.map((e: any) => ({
            id: e.id, title: e.title ?? e.name ?? "Event",
            eventType: e.event_type ?? e.eventType ?? "training",
            date: targetDate, startTime: e.local_start ?? e.startTime ?? "",
            endTime: e.local_end ?? e.endTime ?? "",
            intensity: e.intensity ?? undefined,
          })),
        }],
        chips: [],
      },
      refreshTargets: [],
      agentType: "timeline",
    };
  } catch (e) {
    logger.warn("[intent-handler] delete_event failed", { error: e });
  }
  return null;
}

async function handleEditCv(
  _message: string, _params: Record<string, any>, context: PlayerContext
): Promise<OrchestratorResult | null> {
  try {
    const db = supabaseAdmin();
    const [userRes, snapRes] = await Promise.all([
      db.from("users").select("name, sport, age").eq("id", context.userId).single(),
      db.from("athlete_snapshots").select("position, date_of_birth, height_cm, weight_kg, preferred_foot, playing_style, gender, sitting_height_cm").eq("athlete_id", context.userId).single(),
    ]);
    const user = userRes.data as any ?? {};
    const snap = snapRes.data as any ?? {};

    const fields = [
      { field: "name", label: "Name", inputType: "text" as const, currentValue: user.name ?? context.name ?? null },
      { field: "position", label: "Position", inputType: "selector" as const, options: ["GK", "CB", "LB", "RB", "CDM", "CM", "CAM", "LW", "RW", "ST", "CF"], currentValue: snap.position ?? null },
      { field: "date_of_birth", label: "Date of Birth", inputType: "date" as const, currentValue: snap.date_of_birth ?? null },
      { field: "height_cm", label: "Height", inputType: "number" as const, currentValue: snap.height_cm ?? null, unit: "cm" },
      { field: "weight_kg", label: "Weight", inputType: "number" as const, currentValue: snap.weight_kg ?? null, unit: "kg" },
      { field: "preferred_foot", label: "Preferred Foot", inputType: "selector" as const, options: ["Left", "Right", "Both"], currentValue: snap.preferred_foot ?? null },
      { field: "playing_style", label: "Playing Style", inputType: "text" as const, currentValue: snap.playing_style ?? null },
    ];

    return {
      message: "Edit your profile",
      structured: { headline: "Edit your profile", cards: [{ type: "cv_edit_capsule" as const, fields }], chips: [] },
      refreshTargets: [],
      agentType: "mastery",
    };
  } catch (e) {
    logger.warn("[intent-handler] edit_cv failed", { error: e });
  }
  return null;
}

async function handleExamSchedule(
  message: string, _params: Record<string, any>, context: PlayerContext
): Promise<OrchestratorResult | null> {
  const { parseEventHints } = await import("./eventHintParser");
  const hints = parseEventHints(message.toLowerCase(), context);

  return {
    message: "Schedule your exam",
    structured: {
      headline: "Schedule exam",
      cards: [{
        type: "event_edit_capsule" as const, mode: "create" as const,
        prefilledTitle: hints.title || "Exam", prefilledEventType: "exam" as const,
        prefilledDate: hints.date, prefilledStartTime: hints.startTime, prefilledEndTime: hints.endTime,
      }],
      chips: [{ label: "Set exam period", action: "I want to set my exam period dates and subjects" }],
    },
    refreshTargets: [],
    agentType: "timeline",
  };
}

async function handleScheduleRules(
  _message: string, _params: Record<string, any>, context: PlayerContext
): Promise<OrchestratorResult | null> {
  try {
    const db = supabaseAdmin();
    const { data: prefs } = await db.from("player_schedule_preferences").select("*").eq("user_id", context.userId).single();
    const p = prefs as any;
    const scenario = p?.league_is_active && p?.exam_period_active ? "league_and_exam"
      : p?.league_is_active ? "league_active" : p?.exam_period_active ? "exam_period" : "normal";

    return {
      message: "Your schedule rules",
      structured: {
        headline: "⚙️ My Schedule Rules",
        cards: [{
          type: "schedule_rules_capsule" as const, scenario,
          current: {
            schoolDays: p?.school_days ?? [0, 1, 2, 3, 4], schoolStart: p?.school_start ?? "08:00",
            schoolEnd: p?.school_end ?? "15:00", sleepStart: p?.sleep_start ?? "22:00",
            sleepEnd: p?.sleep_end ?? "06:00", leagueIsActive: p?.league_is_active ?? false,
            examPeriodActive: p?.exam_period_active ?? false,
            bufferDefaultMin: p?.buffer_default_min ?? 30, bufferPostMatchMin: p?.buffer_post_match_min ?? 60,
            bufferPostHighIntensityMin: p?.buffer_post_high_intensity_min ?? 45,
            studyDays: p?.study_days ?? [0, 1, 2, 3], studyStart: p?.study_start ?? "16:00",
            studyDurationMin: p?.study_duration_min ?? 45,
          },
        }],
        chips: [
          { label: "Add an exam", action: "I want to add a new exam" },
          { label: "Edit subjects", action: "manage my study subjects" },
          { label: "Add training category", action: "add a new training category" },
        ],
      },
      refreshTargets: [],
      agentType: "timeline",
    };
  } catch (e) {
    logger.warn("[intent-handler] schedule_rules failed", { error: e });
  }
  return null;
}

async function handlePlanTraining(
  _message: string, _params: Record<string, any>, context: PlayerContext
): Promise<OrchestratorResult | null> {
  try {
    const db = supabaseAdmin();
    const { data: prefs } = await db.from("player_schedule_preferences").select("training_categories").eq("user_id", context.userId).single();
    const cats = (prefs as any)?.training_categories ?? [];
    const categories = Array.isArray(cats) ? cats.map((c: any) => ({
      id: c.id, label: c.label, icon: c.icon, enabled: c.enabled !== false,
      mode: c.mode ?? "days_per_week", fixedDays: c.fixedDays ?? [],
      daysPerWeek: c.daysPerWeek ?? 2, sessionDuration: c.sessionDuration ?? 60,
      preferredTime: c.preferredTime ?? "afternoon",
    })) : [];

    return {
      message: "Plan your training week",
      structured: {
        headline: "🗓️ Plan My Training",
        cards: [{ type: "training_schedule_capsule" as const, categories, defaultWeeks: 2 }],
        chips: [
          { label: "Add training category", action: "add a new training category" },
          { label: "Edit my rules", action: "edit my schedule rules" },
          { label: "View my week", action: "what's on my schedule this week?" },
        ],
      },
      refreshTargets: [],
      agentType: "timeline",
    };
  } catch (e) {
    logger.warn("[intent-handler] plan_training failed", { error: e });
  }
  return null;
}

async function handlePlanStudy(
  _message: string, _params: Record<string, any>, context: PlayerContext
): Promise<OrchestratorResult | null> {
  try {
    const db = supabaseAdmin();
    const { data: prefs } = await db.from("player_schedule_preferences").select("exam_schedule, study_subjects, pre_exam_study_weeks, days_per_subject, exam_period_active").eq("user_id", context.userId).single();
    const p = prefs as any;
    const examSchedule = Array.isArray(p?.exam_schedule) ? p.exam_schedule : [];
    const today = new Date();

    const exams = examSchedule.map((e: any) => {
      const examDate = new Date(e.examDate);
      const daysUntil = Math.ceil((examDate.getTime() - today.getTime()) / 86400000);
      return { id: e.id, subject: e.subject, examType: e.examType, examDate: e.examDate, daysUntil };
    }).filter((e: any) => e.daysUntil >= 0).sort((a: any, b: any) => a.daysUntil - b.daysUntil);

    // Check for existing study blocks on the calendar
    let studyBlockCount = 0;
    let studyDateRange: string | undefined;
    try {
      const todayISO = today.toISOString();
      const futureISO = new Date(today.getTime() + 90 * 86400000).toISOString();
      const { data: studyBlocks } = await db.from("calendar_events")
        .select("start_at")
        .eq("user_id", context.userId)
        .eq("event_type", "study")
        .gte("start_at", todayISO)
        .lte("start_at", futureISO)
        .order("start_at", { ascending: true });
      if (studyBlocks && studyBlocks.length > 0) {
        studyBlockCount = studyBlocks.length;
        const firstDate = new Date((studyBlocks as any[])[0].start_at);
        const lastDate = new Date((studyBlocks as any[])[studyBlocks.length - 1].start_at);
        studyDateRange = `${firstDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${lastDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
      }
    } catch { /* non-critical */ }

    return {
      message: "Your study schedule",
      structured: {
        headline: "📚 Study Schedule",
        cards: [{
          type: "study_schedule_capsule" as const, exams,
          studySubjects: p?.study_subjects ?? [], preExamStudyWeeks: p?.pre_exam_study_weeks ?? 3,
          daysPerSubject: p?.days_per_subject ?? 3, examPeriodActive: p?.exam_period_active ?? false,
          hasStudyPlan: studyBlockCount > 0,
          studyPlanBlockCount: studyBlockCount,
          studyPlanDateRange: studyDateRange,
        }],
        chips: [
          { label: "Add an exam", action: "I want to add a new exam" },
          { label: "Regular study routine", action: "plan my regular study" },
          { label: "Edit subjects", action: "manage my study subjects" },
          { label: "Edit my rules", action: "edit my schedule rules" },
        ],
      },
      refreshTargets: [],
      agentType: "timeline",
    };
  } catch (e) {
    logger.warn("[intent-handler] plan_study failed", { error: e });
  }
  return null;
}

// ── Regular Study Handler ──
async function handlePlanRegularStudy(
  _message: string, _params: Record<string, any>, context: PlayerContext
): Promise<OrchestratorResult | null> {
  try {
    const db = supabaseAdmin();
    const { data: prefs } = await db.from("player_schedule_preferences")
      .select("study_subjects, regular_study_config")
      .eq("user_id", context.userId).single();
    const p = prefs as any;
    const studySubjects: string[] = Array.isArray(p?.study_subjects) ? p.study_subjects : [];
    const currentConfig = p?.regular_study_config ?? null;

    // Count existing regular study events in next 4 weeks
    let existingSessionCount = 0;
    try {
      const today = new Date();
      const futureISO = new Date(today.getTime() + 28 * 86400000).toISOString();
      const { count } = await db.from("calendar_events")
        .select("id", { count: "exact", head: true })
        .eq("user_id", context.userId)
        .eq("event_type", "study")
        .eq("notes", "regular_study")
        .gte("start_at", today.toISOString())
        .lte("start_at", futureISO);
      existingSessionCount = count ?? 0;
    } catch { /* non-critical */ }

    return {
      message: "Your regular study routine",
      structured: {
        headline: "📖 Regular Study Schedule",
        cards: [{
          type: "regular_study_capsule" as any,
          studySubjects,
          currentConfig,
          hasExistingPlan: existingSessionCount > 0,
          existingSessionCount,
        }],
        chips: [
          { label: "Exam study plan", action: "plan my study schedule" },
          { label: "Edit subjects", action: "manage my study subjects" },
        ],
      },
      refreshTargets: [],
      agentType: "timeline",
    };
  } catch (e) {
    logger.warn("[intent-handler] plan_regular_study failed", { error: e });
  }
  return null;
}

// ── Recommendations Handler ──
// Map user query topics → rec_type enum values (deterministic, $0 cost)
const TOPIC_TO_REC_TYPES: Record<string, string[]> = {
  recovery:  ['RECOVERY', 'READINESS'],
  sleep:     ['RECOVERY', 'READINESS'],
  load:      ['LOAD_WARNING'],
  training:  ['DEVELOPMENT', 'LOAD_WARNING'],
  injury:    ['READINESS', 'LOAD_WARNING'],
  academic:  ['ACADEMIC'],
  study:     ['ACADEMIC'],
  cv:        ['CV_OPPORTUNITY'],
  streak:    ['MOTIVATION'],
};

// Topic detection patterns (matched against user message)
const TOPIC_PATTERNS: [string, RegExp][] = [
  ['recovery', /recover|ice.?bath|foam|stretch|deload|cool.?down|rest day/i],
  ['sleep', /sleep|nap|bed|tired|fatigue|parasympathetic/i],
  ['load', /load|acwr|overtraining|volume|intensity/i],
  ['training', /train|drill|workout|session|gym|program/i],
  ['injury', /injur|pain|sore|strain|rehab|prevent/i],
  ['academic', /study|exam|school|homework|academic/i],
  ['cv', /cv|profile|recruit|scout|talent/i],
  ['streak', /streak|consistency|habit|check.?in/i],
];

function detectQueryTopics(message: string): string[] {
  const lower = message.toLowerCase();
  const matched: string[] = [];
  for (const [topic, rx] of TOPIC_PATTERNS) {
    if (rx.test(lower)) matched.push(topic);
  }
  return matched;
}

function filterRecsByRecType(recs: ActiveRecommendation[], topics: string[]): ActiveRecommendation[] {
  if (topics.length === 0) return recs; // no topic → show all
  const allowedTypes = new Set<string>();
  for (const t of topics) {
    for (const rt of (TOPIC_TO_REC_TYPES[t] ?? [])) allowedTypes.add(rt);
  }
  if (allowedTypes.size === 0) return recs;
  const filtered = recs.filter(r => allowedTypes.has(r.recType));
  return filtered.length > 0 ? filtered : recs; // fallback to all if no match
}

async function handleRecommendations(
  message: string, _params: Record<string, any>, context: PlayerContext
): Promise<OrchestratorResult | null> {
  // FALL THROUGH to AI agent for richer, sport-specific, personalized responses.
  // The orchestrator now has sport context + age tone + rec filtering in its system prompt.
  // Returning null sends this to the full AI pipeline where Claude can synthesize
  // recommendations with sport-specific framing, position context, and age-appropriate tone.
  return null;
}

// ── Drill Rating Handler ──
async function handleDrillRating(
  _message: string, _params: Record<string, any>, _context: PlayerContext
): Promise<OrchestratorResult | null> {
  // This is typically triggered from context (after a drill detail view)
  // For now, return null to fall through to AI which can ask which drill
  return null;
}

// ── Bulk Edit Events Handler ──
async function handleBulkEditEvents(
  _message: string, _params: Record<string, any>, context: PlayerContext
): Promise<OrchestratorResult | null> {
  try {
    const db = supabaseAdmin();
    // Use simple ISO date range — start_at is already stored as ISO/UTC
    const now = new Date();
    const startISO = now.toISOString();
    const endISO = new Date(now.getTime() + 28 * 86400000).toISOString();

    const { data: rawEvents, error: fetchErr } = await db
      .from("calendar_events")
      .select("id, title, event_type, start_at, end_at, intensity")
      .eq("user_id", context.userId)
      .gte("start_at", startISO)
      .lte("start_at", endISO)
      .order("start_at", { ascending: true });

    logger.info("[bulk-edit-handler]", {
      userId: context.userId,
      startISO: startISO.slice(0, 19),
      endISO: endISO.slice(0, 19),
      eventCount: rawEvents?.length ?? 0,
      error: fetchErr?.message ?? null,
    });

    const tz = context.timezone || "UTC";
    const events = (rawEvents ?? []).map((e: any) => {
      const start = new Date(e.start_at);
      const end = new Date(e.end_at);
      // Use same formatting as timelineAgent for consistency
      const date = start.toLocaleDateString("en-CA", { timeZone: tz });
      const startTime = start.toLocaleString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false });
      const endTime = end.toLocaleString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false });
      return {
        id: e.id,
        title: e.title ?? "Event",
        eventType: e.event_type ?? "training",
        date,
        startTime,
        endTime,
        intensity: e.intensity ?? undefined,
      };
    });

    // Group by title + time pattern
    const groupMap = new Map<string, { key: string; title: string; eventType: string; timeSlot: string; count: number; eventIds: string[] }>();
    for (const evt of events) {
      const key = `${evt.title}__${evt.startTime}-${evt.endTime}__${evt.eventType}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          key, title: evt.title, eventType: evt.eventType,
          timeSlot: `${evt.startTime}–${evt.endTime}`, count: 0, eventIds: [],
        });
      }
      const g = groupMap.get(key)!;
      g.count++;
      g.eventIds.push(evt.id);
    }

    const groupedEvents = Array.from(groupMap.values()).sort((a, b) => b.count - a.count);

    if (events.length === 0) {
      return {
        message: "No upcoming events to edit",
        structured: {
          headline: "📋 No Events Found",
          cards: [{ type: "text_card" as const, headline: "No upcoming events", body: "You don't have any events in the next 4 weeks. Add some first!" }],
          chips: [
            { label: "Add training", action: "I want to add a training session" },
            { label: "Plan my week", action: "plan my training week" },
          ],
        },
        refreshTargets: [],
        agentType: "timeline",
      };
    }

    return {
      message: `${events.length} events in the next 4 weeks`,
      structured: {
        headline: `📋 Bulk Edit — ${events.length} Events`,
        cards: [{
          type: "bulk_timeline_edit_capsule" as const,
          events,
          groupedEvents,
        }],
        chips: [
          { label: "View my week", action: "what's on my schedule this week?" },
          { label: "Add training", action: "I want to add a training session" },
        ],
      },
      refreshTargets: [],
      agentType: "timeline",
    };
  } catch (e) {
    logger.warn("[intent-handler] bulk_edit_events failed", { error: e });
  }
  return null;
}

// ── Journal Pre-Session Handler ──
async function handleJournalPre(
  _message: string, _params: Record<string, any>, context: PlayerContext
): Promise<OrchestratorResult | null> {
  try {
    const db = supabaseAdmin();
    const today = context.todayDate;
    const tomorrow = new Date(new Date(today).getTime() + 24 * 3600 * 1000).toISOString().split('T')[0];

    // Fetch today + tomorrow training/match/recovery events
    const { data: events } = await db
      .from('calendar_events')
      .select('id, title, event_type, start_at, end_at')
      .eq('user_id', context.userId)
      .gte('start_at', `${today}T00:00:00Z`)
      .lte('start_at', `${tomorrow}T23:59:59Z`)
      .in('event_type', ['training', 'match', 'recovery'])
      .order('start_at', { ascending: true });

    if (!events || events.length === 0) {
      return {
        message: "No training sessions found today or tomorrow. Add a session to your Timeline first, then set your target.",
        structured: buildTextResponse("No training sessions found today or tomorrow. Add a session to your Timeline first, then set your target."),
        refreshTargets: [],
        agentType: "output",
      };
    }

    // Check which already have journals
    const eventIds = events.map(e => e.id);
    const { data: journals } = await (db as any)
      .from('training_journals')
      .select('calendar_event_id, journal_state, pre_target')
      .eq('user_id', context.userId)
      .in('calendar_event_id', eventIds);

    const journalMap = new Map<string, any>((journals ?? []).map((j: any) => [j.calendar_event_id, j]));

    // Build list of events with journal state
    const todaysTrainings = events.map(e => {
      const j: any = journalMap.get(e.id);
      const variantMap: Record<string, string> = { training: 'standard', match: 'match', recovery: 'recovery' };
      return {
        eventId: e.id,
        name: e.title,
        eventType: e.event_type,
        startTime: e.start_at,
        journalState: j?.journal_state ?? 'empty',
        journalVariant: variantMap[e.event_type] ?? 'standard',
        hasPreJournal: j?.journal_state === 'pre_set' || j?.journal_state === 'complete',
      };
    });

    // Auto-select first event that needs a pre-journal
    const autoSelect = todaysTrainings.find(t => !t.hasPreJournal) ?? todaysTrainings[0];

    return {
      message: "Set your training target",
      structured: {
        headline: "Set your training target",
        cards: [{
          type: "training_journal_pre_capsule" as const,
          calendar_event_id: autoSelect.eventId,
          event_name: autoSelect.name,
          event_time: new Date(autoSelect.startTime).toLocaleTimeString('en-GB', { timeZone: context.timezone, hour: '2-digit', minute: '2-digit', hour12: false }),
          event_category: autoSelect.eventType,
          journal_variant: autoSelect.journalVariant,
          todays_trainings: todaysTrainings,
        }],
        chips: [
          { label: "View timeline", action: "what's on my schedule today?" },
        ],
      },
      refreshTargets: [],
      agentType: "output",
    };
  } catch (e) {
    logger.warn("[intent-handler] journal_pre failed", { error: e });
    return null;
  }
}

// ── Journal Post-Session Handler ──
async function handleJournalPost(
  _message: string, _params: Record<string, any>, context: PlayerContext
): Promise<OrchestratorResult | null> {
  try {
    const db = supabaseAdmin();
    const today = context.todayDate;
    const yesterday = new Date(new Date(today).getTime() - 24 * 3600 * 1000).toISOString().split('T')[0];

    // Fetch today + yesterday events that have pre_set journals (need reflection)
    const { data: journals } = await (db as any)
      .from('training_journals')
      .select('id, calendar_event_id, training_name, training_category, pre_target, journal_state, journal_variant, event_date')
      .eq('user_id', context.userId)
      .in('journal_state', ['pre_set', 'empty'])
      .gte('event_date', yesterday)
      .lte('event_date', today)
      .order('event_date', { ascending: false });

    if (!journals || journals.length === 0) {
      // No pending reflections — check if there are any events at all
      return {
        message: "No pending reflections right now. Set a target before your next session, and I'll remind you to reflect afterward.",
        structured: buildTextResponse("No pending reflections right now. Set a target before your next session, and I'll remind you to reflect afterward."),
        refreshTargets: [],
        agentType: "output",
      };
    }

    // Auto-select the most recent one needing reflection (prefer pre_set over empty)
    const preSetJournals = journals.filter((j: any) => j.journal_state === 'pre_set');
    const autoSelect = preSetJournals[0] ?? journals[0];

    return {
      message: "Log your reflection",
      structured: {
        headline: "Log your reflection",
        cards: [{
          type: "training_journal_post_capsule" as const,
          calendar_event_id: autoSelect.calendar_event_id,
          journal_id: autoSelect.id,
          event_name: autoSelect.training_name,
          event_date: autoSelect.event_date,
          journal_variant: autoSelect.journal_variant,
          pre_target: autoSelect.pre_target ?? null,
          pending_journals: journals.map((j: any) => ({
            journalId: j.id,
            eventId: j.calendar_event_id,
            name: j.training_name,
            date: j.event_date,
            state: j.journal_state,
          })),
        }],
        chips: [
          { label: "View timeline", action: "what's on my schedule today?" },
        ],
      },
      refreshTargets: [],
      agentType: "output",
    };
  } catch (e) {
    logger.warn("[intent-handler] journal_post failed", { error: e });
    return null;
  }
}

// ── HANDLER REGISTRY ──────────────────────────────────────

export const intentHandlers: Record<string, IntentHandler> = {
  log_test: handleLogTest,
  check_in: handleCheckIn,
  navigate: handleNavigate,
  show_programs: handleShowPrograms,
  manage_programs: handleManagePrograms,
  create_event: handleCreateEvent,
  delete_event: handleDeleteEvent,
  edit_cv: handleEditCv,
  schedule_rules: handleScheduleRules,
  plan_training: handlePlanTraining,
  plan_study: handlePlanStudy,
  plan_regular_study: handlePlanRegularStudy,
  add_exam: handleAddExam,
  manage_subjects: handleManageSubjects,
  training_categories: handleTrainingCategories,
  check_conflicts: handleCheckConflicts,
  phv_query: handlePhvQuery,
  phv_calculate: handlePhvCalculate,
  strengths_gaps: handleStrengthsGaps,
  leaderboard: handleLeaderboard,
  ghost_suggestions: handleGhostSuggestions,
  day_lock: handleDayLock,
  whoop_sync: handleWhoopSync,
  padel_shots: handlePadelShots,
  blazepods: handleBlazepods,
  notification_settings: handleNotificationSettings,
  recommendations: handleRecommendations,
  timeline_capabilities: handleTimelineCapabilities,
  exam_schedule: handleExamSchedule,
  drill_rating: handleDrillRating,
  // Quick actions
  qa_readiness: handleQaReadiness,
  qa_streak: handleQaStreak,
  qa_load: handleQaLoad,
  qa_today_schedule: handleQaTodaySchedule,
  qa_week_schedule: handleQaWeekSchedule,
  qa_test_history: handleQaTestHistory,
  bulk_edit_events: handleBulkEditEvents,
  // Journal
  journal_pre: handleJournalPre,
  journal_post: handleJournalPost,
};
