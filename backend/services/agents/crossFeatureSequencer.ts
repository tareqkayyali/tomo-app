/**
 * Cross-Feature Sequencer (CFS) — Multi-agent command chains.
 * Single messages that execute across multiple systems simultaneously.
 * All sequences are deterministic ($0 AI cost) or use minimal tool calls.
 */

import { executeTimelineTool } from "./timelineAgent";
import { executeOutputTool } from "./outputAgent";
import { executeSettingsTool } from "./settingsAgent";
import type { PlayerContext } from "./contextBuilder";
import type { OrchestratorResult } from "./orchestrator";
import { buildTextResponse } from "./responseFormatter";
import type { TomoResponse } from "./responseFormatter";
import { logger } from "@/lib/logger";

// ── Command 1: Injury Mode ──────────────────────────────────────
// Trigger: "I hurt my knee", "I'm injured"
// Sequence: log_injury → get_training_session(injury_flag) → return injury_card + modified session

export async function executeInjuryMode(
  message: string,
  context: PlayerContext
): Promise<OrchestratorResult | null> {
  try {
    // Extract injury details from message
    const lower = message.toLowerCase();
    const bodyParts = [
      "knee", "ankle", "shoulder", "back", "hamstring", "quad", "hip",
      "calf", "shin", "foot", "wrist", "elbow", "neck", "groin", "thigh",
      "achilles", "glute", "arm", "leg",
    ];
    const location = bodyParts.find(p => lower.includes(p)) ?? "unspecified";

    // Determine severity from language
    let severity = 1; // default: soreness
    if (/can'?t (train|play|move|walk|run)|unable to|severe|bad|really hurt|can barely/i.test(lower)) {
      severity = 3;
    } else if (/pain|hurts?|twinge|ache|sore|tight|stiff/i.test(lower)) {
      severity = 2;
    }

    // Step 1: Log the injury
    const injuryResult = await executeSettingsTool("log_injury", {
      location,
      severity,
      notes: message,
    }, context);

    // Step 2: Get modified training session (if severity allows training)
    let sessionCards: any[] = [];
    if (severity < 3) {
      try {
        const sessionResult = await executeOutputTool("get_training_session", {
          category: severity === 1 ? "training" : "recovery",
          injuryFlag: true,
          injuryLocation: location,
        }, context);
        if (sessionResult.result?.cards) {
          sessionCards = sessionResult.result.cards;
        }
      } catch (e) {
        logger.warn("[CFS] Modified session fetch failed, continuing", { error: e });
      }
    }

    // Build combined response
    const severityLabel = severity === 1 ? "Soreness" : severity === 2 ? "Pain — affects training" : "Cannot train";
    const recoveryTip = severity === 3
      ? `Rest is priority. No training today. If pain persists, see a medical professional.`
      : severity === 2
        ? `Avoid loaded ${location} movements. Light technical work and upper body focus.`
        : `Monitor during warm-up. If it worsens, switch to recovery work.`;

    const cards: any[] = [
      {
        type: "injury_card",
        location,
        severity,
        severityLabel,
        recoveryTip,
        autoAdjustedSession: severity < 3 && sessionCards.length > 0,
      },
      ...sessionCards,
    ];

    const chips = severity < 3
      ? [
          { label: "See adjusted session", action: "Give me a recovery session" },
          { label: "Check my readiness", action: "What's my readiness?" },
        ]
      : [
          { label: "Check my readiness", action: "What's my readiness?" },
          { label: "When can I train again?", action: "When should I return to training?" },
        ];

    return {
      message: `Injury logged: ${location} (${severityLabel})`,
      structured: {
        headline: `Injury logged — ${location}`,
        cards,
        chips,
      },
      refreshTargets: ["readiness"],
      agentType: "settings",
    };
  } catch (e) {
    logger.error("[CFS] Injury mode failed", { error: e });
    return null;
  }
}

// ── Command 2: Load Reduce ──────────────────────────────────────
// Trigger: "take it easy", "reduce my load", "recovery week"
// Sequence: get_week_schedule → summarize reductions → offer recovery

export async function executeLoadReduce(
  message: string,
  context: PlayerContext
): Promise<OrchestratorResult | null> {
  try {
    // Step 1: Get this week's schedule
    const weekResult = await executeTimelineTool("get_week_schedule", {}, context);
    const weekData = weekResult.result;

    // Step 2: Get current readiness
    const readinessResult = await executeOutputTool("get_readiness_detail", {}, context);
    const readiness = readinessResult.result;

    // Step 3: Get a recovery session recommendation
    let recoveryCards: any[] = [];
    try {
      const sessionResult = await executeOutputTool("get_training_session", {
        category: "recovery",
      }, context);
      if (sessionResult.result?.cards) {
        recoveryCards = sessionResult.result.cards;
      }
    } catch (e) {
      logger.warn("[CFS] Recovery session fetch failed", { error: e });
    }

    // Build combined response
    const readinessColor = readiness?.color ?? "YELLOW";
    const readinessMsg = readinessColor === "RED"
      ? "Your readiness is RED — recovery is the right call."
      : readinessColor === "YELLOW"
        ? "Readiness is YELLOW — lighter training will help you bounce back."
        : "Readiness is GREEN but reducing load proactively is smart periodization.";

    const cards: any[] = [
      {
        type: "text_card" as const,
        headline: "Load reduction activated",
        body: `${readinessMsg}\n\nHere's what I recommend:\n• Keep athlete-owned sessions at LIGHT intensity\n• Focus on technical skills and recovery\n• Prioritize sleep and nutrition this week`,
      },
      ...recoveryCards,
    ];

    return {
      message: "Load reduction mode",
      structured: {
        headline: "Recovery focus activated",
        cards,
        chips: [
          { label: "Show my week", action: "What's my schedule this week?" },
          { label: "Recovery drills", action: "Give me recovery exercises" },
        ],
      },
      refreshTargets: ["readiness", "recommendations"],
      agentType: "output",
    };
  } catch (e) {
    logger.error("[CFS] Load reduce failed", { error: e });
    return null;
  }
}

// ── Command 3: Exam Week Setup ──────────────────────────────────
// Trigger: "exam mode", "I have exams this week", "big exam on Thursday"
// Sequence: detect_load_collision → show dual load analysis → offer study plan

export async function executeExamSetup(
  message: string,
  context: PlayerContext
): Promise<OrchestratorResult | null> {
  try {
    // Step 1: Check for load collisions
    const collisionResult = await executeTimelineTool("detect_load_collision", {}, context);
    const collisions = collisionResult.result;

    // Step 2: Get the week schedule
    const weekResult = await executeTimelineTool("get_week_schedule", {}, context);

    // Step 3: Get dual load score
    const loadResult = await executeOutputTool("get_dual_load_score", {}, context);
    const dualLoad = loadResult.result;

    // Build response
    const hasCollisions = collisions?.conflicts?.length > 0;
    const dualLoadScore = dualLoad?.dualLoadIndex ?? 0;

    const collisionWarning = hasCollisions
      ? `Found ${collisions.conflicts.length} conflict(s) — high-intensity training on exam days.`
      : "No direct exam-training conflicts found.";

    const loadWarning = dualLoadScore > 65
      ? `Dual load index is ${dualLoadScore}% — that's elevated. Consider reducing training intensity.`
      : `Dual load index is ${dualLoadScore}% — manageable, but watch for fatigue.`;

    const cards: any[] = [
      {
        type: "text_card" as const,
        headline: "Exam week analysis",
        body: `${collisionWarning}\n${loadWarning}\n\nRecommendations:\n• Keep training sessions shorter (30-45 min max)\n• Prioritize sleep — it's your #1 exam and recovery tool\n• Schedule study blocks between training, not after\n• Light movement before study sessions boosts focus`,
      },
    ];

    if (hasCollisions && collisions.conflicts) {
      cards.push({
        type: "clash_list" as const,
        clashes: collisions.conflicts,
      });
    }

    return {
      message: "Exam week setup",
      structured: {
        headline: "Exam mode",
        cards,
        chips: [
          { label: "Plan my study", action: "Plan my study schedule" },
          { label: "Show my week", action: "What's my schedule this week?" },
          { label: "Add an exam", action: "I want to add a new exam" },
        ],
      },
      refreshTargets: [],
      agentType: "timeline",
    };
  } catch (e) {
    logger.error("[CFS] Exam setup failed", { error: e });
    return null;
  }
}

// ── Command 4: Full Reset ───────────────────────────────────────
// Trigger: "clear my week", "delete everything I planned", "start fresh"
// Sequence: get_week_schedule → show confirm_card for athlete events → bulk delete on confirm

export async function executeFullReset(
  message: string,
  context: PlayerContext
): Promise<OrchestratorResult | null> {
  try {
    // Get this week's events
    const weekResult = await executeTimelineTool("get_week_schedule", {}, context);
    const weekData = weekResult.result;

    // Filter to athlete-created events only (not coach-assigned)
    const allEvents: any[] = [];
    if (weekData?.days) {
      for (const day of weekData.days) {
        for (const event of day.events ?? []) {
          // Only include events the athlete created (not coach-assigned)
          if (!event.coach_assigned && !event.is_coach_event) {
            allEvents.push({
              id: event.id,
              title: event.title ?? event.name ?? "Event",
              date: day.date,
              startTime: event.local_start ?? event.startTime ?? "",
              eventType: event.event_type ?? event.eventType ?? "training",
            });
          }
        }
      }
    }

    if (allEvents.length === 0) {
      return {
        message: "No athlete-created events to clear",
        structured: buildTextResponse("Your week is already clear — no athlete-created events to remove. Coach sessions remain as-is."),
        refreshTargets: [],
        agentType: "timeline",
      };
    }

    // Show confirmation card
    const eventList = allEvents.map(e => `• ${e.title} (${e.date} ${e.startTime})`).join("\n");

    return {
      message: "Confirm: clear your week?",
      structured: {
        headline: "Clear your week?",
        cards: [{
          type: "confirm_card" as const,
          headline: `Delete ${allEvents.length} athlete-created event${allEvents.length > 1 ? "s" : ""}?`,
          body: `${eventList}\n\nCoach-assigned sessions will remain untouched.`,
          confirmLabel: "Clear all",
          cancelLabel: "Keep them",
        }],
        chips: [],
      },
      pendingConfirmation: {
        toolName: "bulk_delete_events",
        toolInput: { eventIds: allEvents.map(e => e.id) },
        agentType: "timeline",
        preview: `Delete ${allEvents.length} events`,
      },
      refreshTargets: [],
      agentType: "timeline",
    };
  } catch (e) {
    logger.error("[CFS] Full reset failed", { error: e });
    return null;
  }
}

// ── Command 5: Today Briefing ───────────────────────────────────
// Trigger: "what do I need to do today", "give me everything for today"
// Sequence: 5 parallel reads → daily_briefing_card ($0 fast path)

export async function executeTodayBriefing(
  message: string,
  context: PlayerContext
): Promise<OrchestratorResult | null> {
  try {
    // All reads in parallel — $0 cost
    const [eventsRes, readinessRes, loadRes, goalsRes, journalRes] = await Promise.all([
      executeTimelineTool("get_today_events", {}, context),
      executeOutputTool("get_readiness_detail", {}, context),
      executeOutputTool("get_dual_load_score", {}, context),
      executeSettingsTool("get_active_goals", {}, context).catch(() => ({ result: null })),
      executeOutputTool("get_pending_post_journal", {}, context).catch(() => ({ result: null })),
    ]);

    const events = eventsRes.result;
    const readiness = readinessRes.result;
    const load = loadRes.result;
    const goals = goalsRes.result;
    const pendingJournals = journalRes.result;

    // Build the daily briefing card
    const readinessColor = readiness?.color ?? "UNKNOWN";
    const readinessEmoji = readinessColor === "GREEN" ? "🟢" : readinessColor === "YELLOW" ? "🟡" : readinessColor === "RED" ? "🔴" : "⚪";
    const loadValue = load?.acwr ?? load?.dualLoadIndex ?? "—";

    // Count events by type
    const eventList = Array.isArray(events) ? events : events?.events ?? [];
    const eventCount = eventList.length;
    const trainingCount = eventList.filter((e: any) => e.event_type === "training" || e.eventType === "training").length;
    const matchCount = eventList.filter((e: any) => e.event_type === "match" || e.eventType === "match").length;

    // Active goals due soon
    const urgentGoals = (goals?.goals ?? []).filter((g: any) => g.daysRemaining != null && g.daysRemaining <= 7 && g.daysRemaining > 0);

    // Build briefing sections
    const briefingSections: string[] = [];

    // Readiness
    briefingSections.push(`${readinessEmoji} Readiness: ${readinessColor}${readiness?.score ? ` (${readiness.score}/100)` : ""}`);

    // Load
    if (load) {
      briefingSections.push(`📊 Load: ACWR ${loadValue}${load.loadZone ? ` (${load.loadZone})` : ""}`);
    }

    // Schedule summary
    if (eventCount === 0) {
      briefingSections.push("📅 Rest day — no events scheduled");
    } else {
      const parts = [];
      if (trainingCount > 0) parts.push(`${trainingCount} training`);
      if (matchCount > 0) parts.push(`${matchCount} match`);
      const otherCount = eventCount - trainingCount - matchCount;
      if (otherCount > 0) parts.push(`${otherCount} other`);
      briefingSections.push(`📅 Today: ${parts.join(", ")}`);
    }

    // Urgent goals
    if (urgentGoals.length > 0) {
      briefingSections.push(`🎯 ${urgentGoals.length} goal${urgentGoals.length > 1 ? "s" : ""} due this week`);
    }

    // Pending journals
    const pendingCount = pendingJournals?.pendingSessions?.length ?? 0;
    if (pendingCount > 0) {
      briefingSections.push(`📓 ${pendingCount} session${pendingCount > 1 ? "s" : ""} waiting for reflection`);
    }

    // Intensity recommendation based on readiness
    let intensityRec = "";
    if (readinessColor === "RED") {
      intensityRec = "\n\n⚠️ Readiness is RED — recovery focus today. Light movement only.";
    } else if (readinessColor === "YELLOW") {
      intensityRec = "\n\nReadiness is YELLOW — moderate intensity max. Listen to your body.";
    }

    const cards: any[] = [
      {
        type: "daily_briefing_card" as const,
        date: context.todayDate,
        readinessColor,
        readinessScore: readiness?.score,
        acwr: load?.acwr,
        loadZone: load?.loadZone,
        eventCount,
        trainingCount,
        matchCount,
        urgentGoals: urgentGoals.map((g: any) => ({
          title: g.title,
          progressPct: g.progressPct,
          daysRemaining: g.daysRemaining,
        })),
        pendingJournalCount: pendingCount,
        briefingSummary: briefingSections.join("\n") + intensityRec,
      },
    ];

    // Add schedule list if events exist
    if (eventCount > 0) {
      cards.push({
        type: "schedule_list" as const,
        date: context.todayDate,
        items: eventList.map((e: any) => ({
          id: e.id,
          title: e.title ?? e.name ?? "Event",
          type: e.event_type ?? e.eventType ?? "training",
          startTime: e.local_start ?? e.startTime ?? "",
          endTime: e.local_end ?? e.endTime ?? "",
          intensity: e.intensity,
        })),
      });
    }

    // Smart chips based on state
    const chips: Array<{ label: string; action: string }> = [];
    if (readinessColor === "RED") {
      chips.push({ label: "Recovery session", action: "Give me a recovery session" });
    } else if (trainingCount > 0) {
      chips.push({ label: "Pre-training target", action: "Set my training target" });
    }
    if (pendingCount > 0) {
      chips.push({ label: "Reflect on session", action: "Log how training went" });
    }
    chips.push({ label: "Check readiness", action: "What's my readiness?" });

    return {
      message: "Your daily briefing",
      structured: {
        headline: `Today — ${context.todayDate}`,
        cards,
        chips,
      },
      refreshTargets: [],
      agentType: "output",
      _eval: {
        classifierLayer: "exact_match",
        intentId: "today_briefing",
        confidence: 1.0,
        agentRouted: "output",
        modelUsed: "fast_path_cfs",
        costUsd: 0,
        latencyMs: 0,
        inputTokens: 0,
        outputTokens: 0,
        capsuleType: null,
        cardTypes: ["daily_briefing_card", "schedule_list"],
      },
    };
  } catch (e) {
    logger.error("[CFS] Today briefing failed", { error: e });
    return null;
  }
}
