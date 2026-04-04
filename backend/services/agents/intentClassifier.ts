/**
 * Intent Classifier — 3-layer hybrid intent classification engine.
 * Layer 1: Exact match ($0, <1ms) — chip actions + common phrases
 * Layer 2: Haiku AI (~$0.0001, <200ms) — context-aware classification
 * Layer 3: Fallthrough to full agent orchestrator
 */

import Anthropic from "@anthropic-ai/sdk";
import { logger } from "@/lib/logger";
import { withRetry } from "@/lib/aiRetry";
import { INTENT_REGISTRY, INTENT_BY_ID, buildClassifierIntentList, type IntentDefinition } from "./intentRegistry";
import type { ConversationState } from "./sessionService";

// ── Types ──────────────────────────────────────────────────
export interface ClassificationResult {
  intentId: string;
  capsuleType: string | null;
  agentType: "timeline" | "output" | "mastery" | "settings";
  confidence: number;
  extractedParams: Record<string, any>;
  classificationLayer: "exact_match" | "haiku" | "fallthrough";
  latencyMs: number;
}

interface ClassifierContext {
  todayDate: string;
  activeTab?: string;
  userId: string;
}

interface ClassifierOptions {
  abTestMode?: boolean;
}

// ── Singleton Anthropic client ──────────────────────────────
let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

// ── Layer 1: Exact Match Map ──────────────────────────────
// Built once at module load from chip actions + common phrases

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\?+$/, "").replace(/\s+/g, " ");
}

const EXACT_MATCH_MAP = new Map<string, { intentId: string; params: Record<string, any> }>();

// Populate from registry examples that are short (< 8 words) — these are exact-matchable
function buildExactMatchMap(): void {
  // Chip action strings we control (these MUST be exact matches)
  const chipActions: Array<{ text: string; intentId: string; params?: Record<string, any> }> = [
    // Test log
    { text: "log a test", intentId: "log_test" },
    { text: "I want to log a new test", intentId: "log_test" },
    // Check-in
    { text: "check in", intentId: "check_in" },
    { text: "I want to check in", intentId: "check_in" },
    { text: "log tonight's sleep", intentId: "check_in" },
    // Navigation
    { text: "go to timeline", intentId: "navigate", params: { targetTab: "Timeline" } },
    { text: "go to output", intentId: "navigate", params: { targetTab: "Output" } },
    { text: "go to mastery", intentId: "navigate", params: { targetTab: "Mastery" } },
    { text: "go to own it", intentId: "navigate", params: { targetTab: "OwnIt" } },
    // Quick actions
    { text: "what's my readiness", intentId: "qa_readiness" },
    { text: "what's my readiness?", intentId: "qa_readiness" },
    { text: "my readiness", intentId: "qa_readiness" },
    { text: "how am i", intentId: "qa_readiness" },
    { text: "how do i feel", intentId: "qa_readiness" },
    { text: "readiness score", intentId: "qa_readiness" },
    { text: "my streak", intentId: "qa_streak" },
    { text: "what's my streak", intentId: "qa_streak" },
    { text: "my load", intentId: "qa_load" },
    { text: "training load", intentId: "qa_load" },
    { text: "acwr", intentId: "qa_load" },
    { text: "today's schedule", intentId: "qa_today_schedule" },
    { text: "what's today", intentId: "qa_today_schedule" },
    { text: "my schedule today", intentId: "qa_today_schedule" },
    { text: "what's on my schedule today", intentId: "qa_today_schedule" },
    { text: "what's on my schedule today?", intentId: "qa_today_schedule" },
    { text: "this week", intentId: "qa_week_schedule" },
    { text: "my week", intentId: "qa_week_schedule" },
    { text: "show my week", intentId: "qa_week_schedule" },
    { text: "what's this week", intentId: "qa_week_schedule" },
    { text: "what's on my schedule this week?", intentId: "qa_week_schedule" },
    { text: "show me this week's schedule", intentId: "qa_week_schedule" },
    { text: "my tests", intentId: "qa_test_history" },
    { text: "test history", intentId: "qa_test_history" },
    { text: "test results", intentId: "qa_test_history" },
    { text: "my scores", intentId: "qa_test_history" },
    // Programs
    { text: "my programs", intentId: "show_programs" },
    { text: "my timeline", intentId: "qa_today_schedule" },
    { text: "what programs do you recommend for me", intentId: "show_programs" },
    // Conflicts
    { text: "check conflicts", intentId: "check_conflicts" },
    { text: "check for any schedule conflicts", intentId: "check_conflicts" },
    // Schedule rules
    { text: "edit my schedule rules", intentId: "schedule_rules" },
    { text: "edit my rules", intentId: "schedule_rules" },
    { text: "my rules", intentId: "schedule_rules" },
    // Training plan
    { text: "plan my training", intentId: "plan_training" },
    { text: "plan my training week", intentId: "plan_training" },
    { text: "give me a training plan", intentId: "plan_training" },
    // Study plan (exam-driven)
    { text: "plan my study", intentId: "plan_study" },
    { text: "plan my study schedule", intentId: "plan_study" },
    // Regular study (weekly routine)
    { text: "plan my regular study", intentId: "plan_regular_study" },
    { text: "schedule my weekly studies", intentId: "plan_regular_study" },
    { text: "set up study routine", intentId: "plan_regular_study" },
    { text: "regular study schedule", intentId: "plan_regular_study" },
    { text: "weekly study plan", intentId: "plan_regular_study" },
    // Events
    { text: "I want to add a training session", intentId: "create_event" },
    { text: "add event", intentId: "create_event" },
    { text: "build a session for now", intentId: "create_event" },
    { text: "build a session", intentId: "create_event" },
    { text: "Build me a training session for today", intentId: "create_event" },
    // Exams
    { text: "I want to add a new exam", intentId: "add_exam" },
    { text: "add an exam", intentId: "add_exam" },
    // Subjects
    { text: "manage my study subjects", intentId: "manage_subjects" },
    { text: "edit subjects", intentId: "manage_subjects" },
    // Categories
    { text: "add a new training category", intentId: "training_categories" },
    // Leaderboard
    { text: "show me the global leaderboard", intentId: "leaderboard", params: { boardType: "global" } },
    { text: "show me the streak leaderboard", intentId: "leaderboard", params: { boardType: "streaks" } },
    // CV
    { text: "edit my profile", intentId: "edit_cv" },
    { text: "edit my CV profile", intentId: "edit_cv" },
    { text: "edit my cv profile", intentId: "edit_cv" },
    // Bulk edit
    { text: "bulk edit my events", intentId: "bulk_edit_events" },
    { text: "bulk edit events", intentId: "bulk_edit_events" },
    { text: "bulk delete events", intentId: "bulk_edit_events" },
    { text: "manage my schedule blocks", intentId: "bulk_edit_events" },
    { text: "clean up my schedule", intentId: "bulk_edit_events" },
    // PHV
    { text: "calculate my growth stage", intentId: "phv_calculate" },
    { text: "what is my current growth stage", intentId: "phv_query" },
    { text: "what is my growth stage", intentId: "phv_query" },
    { text: "what's my growth stage", intentId: "phv_query" },
    // Strengths
    { text: "my strengths", intentId: "strengths_gaps" },
    { text: "my gaps", intentId: "strengths_gaps" },
    // Recommendations
    { text: "my recommendations", intentId: "recommendations" },
    { text: "what should I do", intentId: "recommendations" },
    // Whoop
    { text: "sync whoop", intentId: "whoop_sync" },
    // View schedule
    { text: "view my week", intentId: "qa_week_schedule" },
    { text: "view today's schedule", intentId: "qa_today_schedule" },
    // Notifications
    { text: "notification settings", intentId: "notification_settings" },
    // ── Cross-Feature Commands ──
    { text: "daily briefing", intentId: "today_briefing" },
    { text: "morning update", intentId: "today_briefing" },
    { text: "brief me", intentId: "today_briefing" },
    { text: "what do i need to do today", intentId: "today_briefing" },
    { text: "give me everything for today", intentId: "today_briefing" },
    { text: "today's briefing", intentId: "today_briefing" },
    { text: "reduce my load", intentId: "load_reduce" },
    { text: "recovery week", intentId: "load_reduce" },
    { text: "take it easy this week", intentId: "load_reduce" },
    { text: "go light this week", intentId: "load_reduce" },
    { text: "i need a deload", intentId: "load_reduce" },
    { text: "exam mode", intentId: "exam_setup" },
    { text: "exam week setup", intentId: "exam_setup" },
    { text: "finals week", intentId: "exam_setup" },
    { text: "clear my week", intentId: "full_reset" },
    { text: "start fresh", intentId: "full_reset" },
    { text: "wipe my schedule", intentId: "full_reset" },
    { text: "clean slate", intentId: "full_reset" },
    // ── Settings & Profile Agent ──
    // Goals
    { text: "my goals", intentId: "view_goals" },
    { text: "show my goals", intentId: "view_goals" },
    { text: "set a goal", intentId: "set_goal" },
    { text: "create a goal", intentId: "set_goal" },
    { text: "update my goal", intentId: "update_goal" },
    // Injury
    { text: "i'm injured", intentId: "log_injury" },
    { text: "log injury", intentId: "log_injury" },
    { text: "log an injury", intentId: "log_injury" },
    { text: "flag an injury", intentId: "log_injury" },
    { text: "my injuries", intentId: "injury_status" },
    { text: "injury status", intentId: "injury_status" },
    { text: "injury history", intentId: "injury_status" },
    // Nutrition
    { text: "log food", intentId: "log_nutrition" },
    { text: "log a meal", intentId: "log_nutrition" },
    { text: "log my lunch", intentId: "log_nutrition" },
    { text: "what did i eat", intentId: "view_nutrition" },
    { text: "my nutrition", intentId: "view_nutrition" },
    // Sleep
    { text: "log sleep", intentId: "log_sleep" },
    { text: "log my sleep", intentId: "log_sleep" },
    { text: "sleep data", intentId: "view_sleep_data" },
    { text: "my sleep history", intentId: "view_sleep_data" },
    // Profile
    { text: "my profile", intentId: "view_profile" },
    { text: "show my profile", intentId: "view_profile" },
    { text: "update my height", intentId: "update_profile" },
    { text: "change my weight", intentId: "update_profile" },
    { text: "change my sport", intentId: "update_profile" },
    { text: "update my position", intentId: "update_profile" },
    // Settings
    { text: "my settings", intentId: "app_settings" },
    { text: "app settings", intentId: "app_settings" },
    // Notifications
    { text: "show my notifications", intentId: "view_notifications" },
    { text: "any new notifications", intentId: "view_notifications" },
    { text: "what's new", intentId: "view_notifications" },
    { text: "mark all as read", intentId: "clear_notifications" },
    { text: "clear all notifications", intentId: "clear_notifications" },
    // Wearable
    { text: "my wearable", intentId: "wearable_status" },
    { text: "whoop status", intentId: "wearable_status" },
    { text: "connect wearable", intentId: "connect_wearable" },
    { text: "connect my whoop", intentId: "connect_wearable" },
    // Navigation
    { text: "browse drills", intentId: "browse_drills" },
    { text: "drill library", intentId: "browse_drills" },
    { text: "my journals", intentId: "view_journal_history" },
    { text: "journal history", intentId: "view_journal_history" },
    { text: "test history", intentId: "view_test_history" },
    // Feedback & Recommendations
    { text: "give feedback", intentId: "submit_feedback" },
    { text: "report a bug", intentId: "submit_feedback" },
    { text: "suggest a feature", intentId: "submit_feedback" },
    { text: "refresh my recommendations", intentId: "refresh_recommendations" },
    // Update/Edit events
    { text: "edit my session", intentId: "update_event" },
    { text: "edit my event", intentId: "update_event" },
    { text: "reschedule my training", intentId: "update_event" },
    { text: "reschedule my session", intentId: "update_event" },
    { text: "reschedule my match", intentId: "update_event" },
    { text: "move my training", intentId: "update_event" },
    { text: "move my session", intentId: "update_event" },
    { text: "change my session time", intentId: "update_event" },
    { text: "change my gym time", intentId: "update_event" },
    { text: "modify my training", intentId: "update_event" },
    { text: "update my event", intentId: "update_event" },
    // Journal
    { text: "journal", intentId: "journal_pre" },
    { text: "training journal", intentId: "journal_pre" },
    { text: "set my target", intentId: "journal_pre" },
    { text: "set my focus", intentId: "journal_pre" },
    { text: "write journal", intentId: "journal_pre" },
    { text: "reflect on training", intentId: "journal_post" },
    { text: "how was my session", intentId: "journal_post" },
    { text: "training reflection", intentId: "journal_post" },
    { text: "session review", intentId: "journal_post" },
    { text: "log my reflection", intentId: "journal_post" },
  ];

  for (const chip of chipActions) {
    EXACT_MATCH_MAP.set(normalize(chip.text), {
      intentId: chip.intentId,
      params: chip.params ?? {},
    });
  }
}

// Initialize on module load
buildExactMatchMap();

// Prefix patterns that should always go to full AI (conversational follow-ups)
const FALLTHROUGH_PREFIXES = [
  /^tell me more about/i,
  /^explain (the|my|this)/i,
  /^what should i do (about|based|today|with)/i,
  /^act on/i,
  /^how do i/i,
  /^help me understand/i,
  /^what does .* mean/i,
  /^can you (recommend|suggest|advise|help|explain)/i,
  /^my .* (recommendation|rec) says/i,
  /^my readiness .* says/i,
  /recommendation.*says/i,
  /reported pain|address pain|pain report|injury|injured/i,
  /program.*(drills?|exercises?|sessions?|details?|explain)/i,
  /drills? (for|in|from) my/i,
  /what.*(drills?|exercises?) .*(in|for|from)/i,
];

function tryExactMatch(message: string): ClassificationResult | null {
  const norm = normalize(message);

  // Check fallthrough prefixes first — these are follow-up questions
  // that need full AI context, not quick-action re-triggering
  for (const rx of FALLTHROUGH_PREFIXES) {
    if (rx.test(norm)) {
      return {
        intentId: "agent_fallthrough",
        capsuleType: null,
        agentType: "output",
        confidence: 1.0,
        extractedParams: {},
        classificationLayer: "exact_match",
        latencyMs: 0,
      };
    }
  }

  const match = EXACT_MATCH_MAP.get(norm);
  if (!match) return null;

  const intent = INTENT_BY_ID.get(match.intentId);
  if (!intent) return null;

  return {
    intentId: match.intentId,
    capsuleType: intent.capsuleType,
    agentType: intent.agentType,
    confidence: 1.0,
    extractedParams: match.params,
    classificationLayer: "exact_match",
    latencyMs: 0,
  };
}

// ── Layer 2: Haiku Classifier ──────────────────────────────

const CLASSIFIER_SYSTEM_PROMPT = `You classify user messages for a sports coaching app into intents.

INTENTS:
${buildClassifierIntentList()}
agent_fallthrough: None of the above / needs full AI conversation or reasoning

CRITICAL RULES:
- If the user asks about a SPECIFIC program by name (e.g. "explain my First Touch program drills"), classify as agent_fallthrough — NOT show_programs.
- If the user references a SPECIFIC recommendation by name or quotes it, classify as agent_fallthrough — NOT qa_readiness or recommendations.
- If the user mentions pain, injury, or soreness in context of "what should I do", classify as agent_fallthrough — NOT qa_readiness.
- "show_programs" is ONLY for listing all programs (e.g. "my programs", "what programs do I have").
- "qa_readiness" is ONLY for checking vitals/scores (e.g. "how am I", "my readiness"). NOT for asking what to do about readiness signals.
- When in doubt, use agent_fallthrough with confidence 0.6.

Return JSON only: {"intent":"<id>","confidence":<0.0-1.0>,"params":{}}
Extract params if mentioned: testType, date, eventType, targetTab, boardType.
For boardType: "global" or "streaks".
For targetTab: "Timeline", "Output", "Mastery", "OwnIt", "Home".
Confidence 0.9+ for clear matches, 0.7-0.9 for likely matches, <0.7 for uncertain.`;

function buildContextSummary(
  conversationState: ConversationState | null,
  context: ClassifierContext
): string {
  const parts: string[] = [];
  if (conversationState?.currentTopic) {
    parts.push(`Topic: ${conversationState.currentTopic}`);
  }
  if (conversationState?.lastActionContext) {
    parts.push(`Last action: ${conversationState.lastActionContext}`);
  }
  if (conversationState?.referencedDates && Object.keys(conversationState.referencedDates).length > 0) {
    const dates = Object.entries(conversationState.referencedDates).slice(0, 3)
      .map(([k, v]) => `${k}=${v}`).join(", ");
    parts.push(`Dates: ${dates}`);
  }
  if (context.activeTab) {
    parts.push(`Tab: ${context.activeTab}`);
  }
  return parts.length > 0 ? parts.join(" | ") : "No prior context";
}

async function classifyWithHaiku(
  message: string,
  conversationState: ConversationState | null,
  context: ClassifierContext
): Promise<{ intent: string; confidence: number; params: Record<string, any> } | null> {
  const HAIKU_MODEL = process.env.ANTHROPIC_HAIKU_MODEL || "claude-haiku-4-5-20251001";
  const anthropic = getClient();
  const contextSummary = buildContextSummary(conversationState, context);

  try {
    const response = await withRetry(
      () => anthropic.messages.create({
        model: HAIKU_MODEL,
        max_tokens: 100,
        temperature: 0,
        system: [{
          type: "text",
          text: CLASSIFIER_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        }],
        messages: [{
          role: "user",
          content: `Context: ${contextSummary}\n\nMESSAGE: "${message}"`,
        }],
      }),
      "[intent-classifier] Haiku"
    );

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map(b => b.text)
      .join("");

    // Parse JSON from response (handle markdown fences)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn("[intent-classifier] No JSON in Haiku response", { raw: text.substring(0, 200) });
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Log cache performance
    const usage = response.usage as any;
    if (usage?.cache_creation_input_tokens || usage?.cache_read_input_tokens) {
      logger.info("[intent-classifier-cache]", {
        cacheWrite: usage.cache_creation_input_tokens ?? 0,
        cacheRead: usage.cache_read_input_tokens ?? 0,
        uncached: usage.input_tokens ?? 0,
      });
    }

    return {
      intent: parsed.intent ?? "agent_fallthrough",
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
      params: parsed.params ?? {},
    };
  } catch (e) {
    logger.error("[intent-classifier] Haiku call failed", { error: e });
    return null;
  }
}

// ── Context Boosting ──────────────────────────────────────

function applyContextBoosts(
  confidence: number,
  intentId: string,
  conversationState: ConversationState | null
): number {
  const intent = INTENT_BY_ID.get(intentId);
  if (!intent?.contextBoosts || !conversationState) return confidence;

  let boost = 0;
  for (const condition of intent.contextBoosts) {
    const [field, value] = condition.split(":");
    if (field === "currentTopic" && conversationState.currentTopic === value) {
      boost += 0.1;
    }
    if (field === "lastActionContext" && conversationState.lastActionContext === value) {
      boost += 0.1;
    }
  }

  return Math.min(confidence + boost, 1.0);
}

// ── Main Classification Function ──────────────────────────

const CONFIDENCE_THRESHOLD = 0.65;

export async function classifyIntent(
  message: string,
  conversationState: ConversationState | null,
  context: ClassifierContext,
  options?: ClassifierOptions
): Promise<ClassificationResult> {
  const start = Date.now();

  // Kill switch
  if (process.env.INTENT_CLASSIFIER_ENABLED === "false") {
    return {
      intentId: "agent_fallthrough",
      capsuleType: null,
      agentType: "output",
      confidence: 0,
      extractedParams: {},
      classificationLayer: "fallthrough",
      latencyMs: Date.now() - start,
    };
  }

  // Layer 1: Exact match
  const exactResult = tryExactMatch(message);
  if (exactResult) {
    exactResult.latencyMs = Date.now() - start;
    logger.info("[intent-classifier]", {
      layer: "exact_match",
      intentId: exactResult.intentId,
      confidence: 1.0,
      latencyMs: exactResult.latencyMs,
      messagePreview: message.substring(0, 60),
    });
    return exactResult;
  }

  // Layer 2: Haiku classifier
  const haikuResult = await classifyWithHaiku(message, conversationState, context);

  if (haikuResult && haikuResult.intent !== "agent_fallthrough") {
    const intent = INTENT_BY_ID.get(haikuResult.intent);
    if (intent) {
      const boostedConfidence = applyContextBoosts(
        haikuResult.confidence,
        haikuResult.intent,
        conversationState
      );

      if (boostedConfidence >= CONFIDENCE_THRESHOLD) {
        const result: ClassificationResult = {
          intentId: haikuResult.intent,
          capsuleType: intent.capsuleType,
          agentType: intent.agentType,
          confidence: boostedConfidence,
          extractedParams: haikuResult.params,
          classificationLayer: "haiku",
          latencyMs: Date.now() - start,
        };

        logger.info("[intent-classifier]", {
          layer: "haiku",
          intentId: result.intentId,
          confidence: boostedConfidence,
          rawConfidence: haikuResult.confidence,
          latencyMs: result.latencyMs,
          params: haikuResult.params,
          messagePreview: message.substring(0, 60),
        });

        return result;
      }
    }
  }

  // Layer 3: Fallthrough
  const fallthrough: ClassificationResult = {
    intentId: "agent_fallthrough",
    capsuleType: null,
    agentType: "output",
    confidence: haikuResult?.confidence ?? 0,
    extractedParams: haikuResult?.params ?? {},
    classificationLayer: "fallthrough",
    latencyMs: Date.now() - start,
  };

  logger.info("[intent-classifier]", {
    layer: "fallthrough",
    haikuIntent: haikuResult?.intent ?? "none",
    haikuConfidence: haikuResult?.confidence ?? 0,
    latencyMs: fallthrough.latencyMs,
    messagePreview: message.substring(0, 60),
  });

  return fallthrough;
}
