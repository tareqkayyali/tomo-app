/**
 * Agent Orchestrator — routes intent from Tomo Chat to the correct agent(s).
 * Handles multi-agent instructions, tool-use loops, and confirmation gates.
 *
 * Complements the existing chatService.ts — this is the "command center" layer
 * that can take actions, while the existing chat remains the conversational coach.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { PlayerContext } from "./contextBuilder";
import {
  timelineTools,
  executeTimelineTool,
  buildTimelineStaticPrompt,
  buildTimelineDynamicPrompt,
} from "./timelineAgent";
import {
  outputTools,
  executeOutputTool,
  buildOutputStaticPrompt,
  buildOutputDynamicPrompt,
} from "./outputAgent";
import {
  masteryTools,
  executeMasteryTool,
  buildMasteryStaticPrompt,
  buildMasteryDynamicPrompt,
} from "./masteryAgent";
import { validateResponse, GUARDRAIL_SYSTEM_BLOCK, categorizeMessage } from "./chatGuardrails";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { getDayBoundsISO, toTimezoneISO } from "./contextBuilder";
import {
  parseStructuredResponse,
  buildTextResponse,
  extractCleanMessage,
  OUTPUT_FORMAT_INSTRUCTION,
  type TomoResponse,
  type SessionPlan,
  type ActionChip,
} from "./responseFormatter";
import { applyChipInjection } from "./chipInject";
import { isAffirmation, type ConversationMessage, type ConversationState } from "./sessionService";
import { buildRuleContext, buildModeRuleContext } from "@/services/scheduling/scheduleRuleEngine";
import type { ModeParams } from "@/services/scheduling/modeConfig";
import { withRetry } from "@/lib/aiRetry";
import { trackedClaudeCall, type TrackedCallMeta } from "@/lib/trackedClaudeCall";
import { classifyIntent } from "./intentClassifier";
import { intentHandlers } from "./intentHandlers";
import { retrieveChatKnowledge } from "./ragChatRetriever";
import { loadAthleteMemory } from "./longitudinalMemory";
// conversationStateExtractor is called from route.ts, not here

const MAX_TOOL_ITERATIONS = 5;

// ── SPORT-POSITION CONTEXT LAYER ──────────────────────────────────
export function buildSportContextSegment(ctx: PlayerContext): string {
  const sport = ctx.sport?.toLowerCase() ?? "";
  const position = ctx.position ?? "unknown";
  const phvStage = ctx.snapshotEnrichment?.phvStage ?? null;

  const sportMap: Record<string, string> = {
    football: `Sport: Association football (soccer). Position: ${position}.
Key performance metrics: Yo-Yo IR1, 10m/30m sprint, CMJ, agility T-test. ACWR model: 7:28 rolling.
Load framework: Training units/week, match = 1.0 AU reference. Monitor ACWR sweet spot 0.8–1.3.
${position === "goalkeeper" ? "Position note: Lower running volume, higher explosive demand. Prioritize reaction time, diving mechanics, distribution." : ""}
${position === "striker" || position === "forward" ? "Position note: High-intensity sprint frequency. Prioritize acceleration, finishing under fatigue, 1v1 situations." : ""}
${position === "midfielder" ? "Position note: Highest total distance covered. Prioritize aerobic base, repeated sprint ability, passing under pressure." : ""}
${position === "defender" || position === "centre-back" ? "Position note: High aerial duel frequency. Prioritize strength, heading technique, recovery speed." : ""}`,

    padel: `Sport: Padel. Playing style: ${position}.
Key metrics: Reaction time (BlazePods), lateral movement speed, court coverage, wrist/forearm loading.
Load framework: Match density + training volume. Rally length and court movement patterns drive load.
Watch for: Shoulder and wrist overuse patterns. Dominant-arm asymmetry increases oblique/shoulder injury risk.
${position === "drive" ? "Style note: Aggressive baseline play. Monitor wrist/elbow loading from repeated drives." : ""}
${position === "revés" || position === "backhand" ? "Style note: Higher rotational demand. Monitor core and oblique fatigue." : ""}`,

    athletics: `Sport: Athletics. Event group: ${position}.
Key metrics: Event-specific benchmarks, sprint mechanics (contact time, flight time), jump testing.
Load framework: High-CNS cost per quality session. Monitor inter-session recovery carefully.
${position === "sprints" ? "Event note: Maximal neuromuscular demand. 48-72h between quality sprint sessions." : ""}
${position === "throws" ? "Event note: High power/strength demand. Monitor shoulder and back loading." : ""}
${position === "jumps" ? "Event note: High impact loading. Monitor ankle/knee stress, especially during growth phases." : ""}`,

    basketball: `Sport: Basketball. Position: ${position}.
Key metrics: Vertical jump, agility, sprint, court coverage. ACWR for practice + game load.
Load framework: Game count per week drives weekly load. Practice intensity varies by phase.`,

    tennis: `Sport: Tennis. Playing style: ${position}.
Key metrics: Lateral movement speed, serve velocity, rally endurance.
Load framework: Match frequency + practice volume. Monitor shoulder/elbow loading for serve-dominant players.`,
  };

  let segment = sportMap[sport] ?? `Sport: ${ctx.sport ?? "Unknown"}. Position: ${position}.`;

  // PHV safety overlay (reinforcement — deterministic gates exist elsewhere)
  if (phvStage === "mid_phv" || phvStage === "MID") {
    segment += `\n⚠️ MID-PHV ACTIVE: This athlete is in peak growth velocity. Loading multiplier 0.60×.
BLOCKED movements: barbell back squat, depth/drop jumps, Olympic lifts, maximal sprint, heavy deadlift.
If any blocked movement is discussed: acknowledge, explain growth-phase risk, offer safe alternative.`;
  }

  return segment;
}

// ── AGE-BAND COMMUNICATION PROFILE ────────────────────────────────
export function buildToneProfile(ageBand: string | null): string {
  const band = ageBand?.toUpperCase() ?? "";
  if (band === "U13")
    return `COMMUNICATION PROFILE (U13):
- Simple, warm, short sentences. No sport-science jargon.
- Celebrate effort over outcomes. Positive framing first.
- Parent may be reviewing — always age-appropriate language.
- Use analogies they understand (games, school, fun challenges).`;

  if (band === "U15" )
    return `COMMUNICATION PROFILE (U15):
- Peer-level but supportive. Start introducing data simply.
- Acknowledge effort and emotional state before giving analytics.
- Identity-forming age — protect confidence while being honest about gaps.
- They want to feel like a real athlete — treat them as one.`;

  if (band === "U17" )
    return `COMMUNICATION PROFILE (U17):
- Direct. Treat as a dedicated athlete who can handle honest feedback.
- Data-grounded advice is expected and appreciated.
- Balance: acknowledge pressure (exams, recruitment) before performance talk.
- They respect coaches who are straight with them.`;

  if (band === "U19" )
    return `COMMUNICATION PROFILE (U19):
- Professional peer. Full technical language acceptable.
- Recruitment context is real — flag opportunities clearly.
- Data-first is fine. Skip motivational framing unless they express doubt.
- They want actionable specifics, not encouragement.`;

  return `COMMUNICATION PROFILE (Senior):
- Professional peer. Data-dense responses welcome.
- Direct feedback. Skip motivational framing.
- They manage their own career — respect their autonomy.`;
}

// ── GEN Z RESPONSE FORMATTING RULES ──────────────────────────────
const GENZ_RESPONSE_RULES = `
RESPONSE FORMAT — Gen Z athletes (13-25), zero patience for walls of text:
1. HEADLINE FIRST (max 8 words) — the bottom-line takeaway.
2. MAX 2 SENTENCES total explanation. Use stat_grid or stat_row cards for data — NOT paragraphs.
3. Emoji anchors: ⚡energy 😴sleep 💪training 🎯goals 📅schedule 🔥streaks 🩹soreness
4. Stat format: "Energy: 8/10 ⚡" not prose. ALWAYS prefer structured cards over text.
5. End with 1-2 action suggestions as questions.
6. NO filler ("Great question!", "Absolutely!", "Based on your data").
7. Be direct. Be brief. Be useful. Max 3 sentences of text TOTAL.
8. For training program recommendations, ALWAYS use program_recommendation card type — never plain text. Max 5 programs. One-liner per program.
9. STAY ON TOPIC. Only address what the player asked about. Do NOT bring in unrelated recommendations or data.
10. When showing vitals/readiness data, USE stat_grid cards — never describe numbers in prose.`;


let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

// ── WRITE ACTIONS — require confirmation gate ─────────────────
const WRITE_ACTIONS = new Set([
  "create_event",
  "update_event",
  "delete_event",
  "log_check_in",
  // Capsule write actions
  "log_test_result",
  "update_schedule_rules",
  "generate_training_plan",
  "add_exam",
  "generate_study_plan",
]);

// ── CAPSULE DIRECT ACTIONS — single-step confirmation (capsule submit = confirm) ──
export const CAPSULE_DIRECT_ACTIONS = new Set([
  "log_test_result",
  "log_check_in",
  "rate_drill",
  "interact_program",
  "confirm_ghost_suggestion",
  "dismiss_ghost_suggestion",
  "lock_day",
  "unlock_day",
  "sync_whoop",
]);

// ── CAPSULE GATED ACTIONS — two-step (still show ConfirmationCard) ──
export const CAPSULE_GATED_ACTIONS = new Set([
  "delete_test_result",
  "edit_test_result",
  "schedule_program",
  "create_event",
  "update_event",
  "delete_event",
  "bulk_delete_events",
  "update_schedule_rules",
  "generate_training_plan",
  "add_exam",
  "generate_study_plan",
]);

// ── AGENT ROUTING — keyword + tab context signals ─────────────
function routeToAgents(
  message: string,
  context: PlayerContext,
  lastAgentType?: string
): ("timeline" | "output" | "mastery")[] {
  // Affirmation continuity: keep same agent when user says "yes", "do it", etc.
  if (isAffirmation(message) && lastAgentType) {
    const valid = ["timeline", "output", "mastery"];
    if (valid.includes(lastAgentType)) {
      return [lastAgentType as "timeline" | "output" | "mastery"];
    }
  }

  const lower = message.toLowerCase();
  const agents = new Set<"timeline" | "output" | "mastery">();

  // Program-specific queries → Output agent FIRST (has get_my_programs tool)
  const isProgramQuery = /program|my program|training program|program.*detail|about.*program/i.test(lower);

  // Recovery/recommendation follow-ups → Output ONLY (never timeline)
  // Prevents "Plan Recovery Protocol" from triggering event creation
  const isRecoveryFollowUp = /recovery.*protocol|recovery.*plan|tell me more about.*rec|act on.*rec|recovery.*program|what.*should.*do.*recover/i.test(lower);
  const isRecommendationFollowUp = /tell me more about the "|recommendation.*and what i should/i.test(lower);

  // Output signals — checked first so it's primary when both match
  if (
    isProgramQuery ||
    isRecoveryFollowUp ||
    isRecommendationFollowUp ||
    context.activeTab === "Output" ||
    /readiness|tired|energy|sleep|recovery|vitals|how (do|am) i feel|check.?in|score|metric|compare|benchmark|percentile|rank|how.*stack up|vs other|test result|how fit|sprint|jump|sore|soreness|pain|drill|exercise|workout|warm.?up|cool.?down|practice plan|training plan|what.*(should|can) i train|weakness|weak|gap|strength|area.*(improve|work|develop)|where.*(need|lack)|my best|my worst/i.test(
      lower
    )
  ) {
    agents.add("output");
  }

  // Timeline signals — skip if this is a recovery/recommendation follow-up
  if (
    !isRecoveryFollowUp && !isRecommendationFollowUp && (
    context.activeTab === "Timeline" ||
    /schedule|calendar|event|exam|study|session|training|match|add|block|reschedule|today|tomorrow|week|when|plan|lock/i.test(
      lower
    ))
  ) {
    agents.add("timeline");
  }

  // Mastery signals
  if (
    context.activeTab === "Mastery" ||
    /progress|improve|better|cv|profile|achievement|milestone|recruit|scout|trajectory|develop|history|pr|personal record|best|consistency|streak/i.test(
      lower
    )
  ) {
    agents.add("mastery");
  }

  // Default: route by active tab if no clear signal
  if (agents.size === 0) {
    const tabMap: Record<string, "timeline" | "output" | "mastery"> = {
      Timeline: "timeline",
      Output: "output",
      Mastery: "mastery",
    };
    const defaultAgent = tabMap[context.activeTab];
    if (defaultAgent) agents.add(defaultAgent);
    else agents.add("output"); // global fallback
  }

  return Array.from(agents);
}

export interface PendingWriteAction {
  toolName: string;
  toolInput: Record<string, any>;
  agentType: string;
  preview: string;
}

export interface OrchestratorResult {
  message: string;
  structured?: TomoResponse | null;
  refreshTargets: string[];
  /** Single or batch pending confirmation — actions array supports multiple writes */
  pendingConfirmation?: PendingWriteAction & {
    /** When batch > 1, all actions are here. First item = same as top-level fields for backward compat */
    actions?: PendingWriteAction[];
  };
  agentType?: string;
  error?: string;
}

// ── MAIN ORCHESTRATION FUNCTION ─────────────────────────────────
/** Optional streaming callbacks — if provided, the orchestrator emits events during processing. */
export interface StreamCallbacks {
  onStatus?: (status: string) => void;
  onDelta?: (text: string) => void;
}

export async function orchestrate(
  userMessage: string,
  context: PlayerContext,
  confirmedAction?: {
    toolName: string;
    toolInput: Record<string, any>;
    agentType: string;
  },
  conversationHistory?: ConversationMessage[],
  lastAgentType?: string,
  activeAgent?: string | null,
  conversationState?: ConversationState | null,
  streamCallbacks?: StreamCallbacks
): Promise<OrchestratorResult> {
  // If player confirmed a pending write action — execute it directly
  // Supports batch: confirmedAction.actions[] may contain multiple writes
  if (confirmedAction) {
    const actions: Array<{ toolName: string; toolInput: Record<string, any>; agentType: string }> =
      (confirmedAction as any).actions?.length > 0
        ? (confirmedAction as any).actions
        : [confirmedAction];

    const allResults: string[] = [];
    const allRefreshTargets: string[] = [];
    let lastDate: string | undefined;

    for (const action of actions) {
      const result = await executeTool(
        action.agentType,
        action.toolName,
        action.toolInput,
        context
      );
      if (result.error) {
        allResults.push(`❌ ${action.toolInput?.eventTitle ?? action.toolName}: ${result.error}`);
      } else {
        allResults.push(
          formatConfirmationResult(action.toolName, action.toolInput, result.result)
        );
      }
      if (result.refreshTarget) allRefreshTargets.push(result.refreshTarget);
      if (action.toolInput?.date) lastDate = action.toolInput.date;
    }

    const rawMessage = allResults.join("\n");
    const validation = validateResponse(rawMessage);
    if (!validation.safe) {
      logger.warn("[chat-guardrail] Response leak detected in confirmation, sanitizing");
    }

    // Build action-specific follow-up chips using capsule triggers
    const confirmedToolName = confirmedAction.toolName ?? (confirmedAction as any).actions?.[0]?.toolName;
    let followUpChips: Array<{ label: string; action: string }> = [];

    switch (confirmedToolName) {
      case "update_schedule_rules":
        followUpChips = [
          { label: "Plan my training", action: "plan my training week" },
          { label: "Add an exam", action: "I want to add a new exam" },
          { label: "View my week", action: "what's on my schedule this week?" },
        ];
        break;
      case "create_event":
        followUpChips = [
          { label: "Add another event", action: "I want to add a training session" },
          { label: "View today's schedule", action: "what's on my schedule today?" },
          { label: "Check conflicts", action: "check for any schedule conflicts" },
        ];
        break;
      case "generate_training_plan":
        followUpChips = [
          { label: "View my week", action: "what's on my schedule this week?" },
          { label: "Check conflicts", action: "check for any schedule conflicts" },
          { label: "Edit my rules", action: "edit my schedule rules" },
        ];
        break;
      case "generate_study_plan":
      case "add_exam":
        followUpChips = [
          { label: "Plan my study", action: "plan my study schedule" },
          { label: "Edit subjects", action: "manage my study subjects" },
          { label: "View my week", action: "what's on my schedule this week?" },
        ];
        break;
      default: {
        const actionDate = lastDate ?? confirmedAction.toolInput?.date;
        followUpChips = [
          actionDate && actionDate !== context.todayDate
            ? { label: "See schedule", action: `What's on my schedule for ${actionDate}?` }
            : { label: "See schedule", action: "what's on my schedule today?" },
          { label: "Check readiness", action: "what's my readiness?" },
        ];
      }
    }

    return {
      message: validation.sanitized,
      structured: buildTextResponse(validation.sanitized, followUpChips),
      refreshTargets: [...new Set(allRefreshTargets)],
    };
  }

  // Route to appropriate agent(s) — with agent lock for conversation stability
  let agentTypes: ("timeline" | "output" | "mastery")[];

  // Program queries always break agent lock — they need the Output agent's get_my_programs tool
  const forceOutputRoute = /program|my program|training program|about.*program/i.test(userMessage.toLowerCase());

  if (activeAgent && !forceOutputRoute && !detectTopicShift(userMessage, activeAgent)) {
    // Agent lock: stay with current agent unless explicit topic shift or program query
    agentTypes = [activeAgent as "timeline" | "output" | "mastery"];
  } else {
    agentTypes = routeToAgents(userMessage, context, lastAgentType);
  }
  const primaryAgent = agentTypes[0];

  logger.info("[orchestrator] routing", {
    primaryAgent,
    allAgents: agentTypes,
    forceOutputRoute,
    activeAgent,
    messagePreview: userMessage.substring(0, 80),
  });

  // ── Skip intent classification for capsule result messages ──────────────
  const isCapsuleResult = userMessage.startsWith("[CAPSULE_RESULT]");

  // ── INTENT CLASSIFICATION — hybrid 3-layer classifier replaces regex ─────
  const classification = isCapsuleResult ? { intentId: "agent_fallthrough" as const, confidence: 0, classificationLayer: "skip" as const, latencyMs: 0, capsuleType: undefined, extractedParams: {}, agentType: (activeAgent ?? "timeline") as "timeline" | "output" | "mastery" } : await classifyIntent(
    userMessage,
    conversationState ?? null,
    { todayDate: context.todayDate, activeTab: context.activeTab, userId: context.userId }
  );

  logger.info("[intent-classifier]", {
    intentId: classification.intentId,
    confidence: classification.confidence,
    layer: classification.classificationLayer,
    latencyMs: classification.latencyMs,
    capsule: classification.capsuleType,
    params: classification.extractedParams,
  });

  if (classification.intentId !== "agent_fallthrough" && classification.confidence >= 0.65) {
    const handler = intentHandlers[classification.intentId];
    if (handler) {
      try {
        const result = await handler(
          userMessage,
          classification.extractedParams,
          context,
          conversationState ?? null
        );
        if (result) {
          return { ...result, agentType: result.agentType ?? classification.agentType };
        }
      } catch (e) {
        logger.warn("[intent-handler] Failed, falling through to AI", {
          intent: classification.intentId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  // ── Classifier did not match or handler returned null — fall through to AI ─────
  const lowerMsg = userMessage.toLowerCase();

  // Build combined tools and system prompt for this request
  const { tools, systemBlocks } = await buildAgentConfig(agentTypes, context, conversationState, userMessage);

  const anthropic = getClient();

  // ── HYBRID MODEL ROUTING — Haiku for simple, Sonnet for complex ──
  const SONNET_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";
  const HAIKU_MODEL = process.env.ANTHROPIC_HAIKU_MODEL || "claude-haiku-4-5-20251001";

  const isComplexIntent =
    // Multi-agent routing → needs Sonnet's reasoning
    agentTypes.length > 1
    // Calendar WRITE actions with conflict detection (read-only schedule queries → Haiku)
    || /\b(move|reschedule|cancel|delete|update|edit)\b.*\b(event|training|session|match)\b/i.test(lowerMsg)
    // Multi-turn conversation with active date context → context continuity matters
    || (conversationState?.referencedDates && Object.keys(conversationState.referencedDates).length > 1)
    // Explicit planning / multi-step reasoning
    || /\b(plan my week|optimize|analyze my|what if|how should i)\b/i.test(lowerMsg)
    // Session generation → multi-step tool chains (but single drill detail → Haiku)
    || /\b(session plan|build.*session|full workout|practice plan|training plan)\b/i.test(lowerMsg)
    // Benchmark comparison → multi-step with formatting
    || /\b(compare.*peer|how.*stack|vs other|rank.*against)\b/i.test(lowerMsg)
    // PHV assessment → complex calculation
    || /\b(phv|maturity offset|growth stage)\b/i.test(lowerMsg);

  const model = isComplexIntent ? SONNET_MODEL : HAIKU_MODEL;

  logger.info("[model-routing]", {
    model: model === SONNET_MODEL ? "sonnet" : "haiku",
    isComplex: isComplexIntent,
    agents: agentTypes.length,
    hasConvState: !!(conversationState?.referencedDates && Object.keys(conversationState.referencedDates).length > 0),
    messagePreview: userMessage.substring(0, 50),
  });

  // Build messages with conversation history
  const messages: Anthropic.MessageParam[] = [];

  // Include conversation history (trimmed to token budget by sessionService)
  if (conversationHistory && conversationHistory.length > 0) {
    for (const msg of conversationHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  // Add current user message
  messages.push({ role: "user", content: userMessage });
  const refreshTargets: string[] = [];

  // Build telemetry metadata for tracked API calls
  const callMeta: TrackedCallMeta = {
    userId: context.userId,
    sessionId: null, // populated from route.ts if available
    agentType: agentTypes[0],
    intentId: null,
  };

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await withRetry(
      () => trackedClaudeCall(anthropic, {
        model,
        max_tokens: 4096,
        system: systemBlocks,
        tools: tools as Anthropic.Tool[],
        messages,
      }, callMeta),
      '[orchestrator] Claude API'
    );

    // Log prompt cache performance (kept for backward compat)
    const usage = response.message.usage as any;
    if (usage?.cache_creation_input_tokens || usage?.cache_read_input_tokens) {
      logger.info("[prompt-cache]", {
        cacheWrite: usage.cache_creation_input_tokens ?? 0,
        cacheRead: usage.cache_read_input_tokens ?? 0,
        uncached: usage.input_tokens ?? 0,
        iteration: i,
      });
    }

    // If end_turn — extract text and return
    if (response.message.stop_reason === "end_turn") {
      const text = response.message.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");

      const finalMessage = text || "I couldn't process that — try rephrasing?";
      const validation = validateResponse(finalMessage);
      if (!validation.safe) {
        logger.warn("[chat-guardrail] Response leak detected, sanitizing");
      }

      // Debug: log what Claude returned so we can diagnose parse failures
      const rawPreview = validation.sanitized.substring(0, 200);
      logger.info("[orchestrator] Claude raw response preview", {
        length: validation.sanitized.length,
        startsWithBrace: validation.sanitized.trim().startsWith('{'),
        hasJsonFence: validation.sanitized.includes('```json'),
        hasHeadline: validation.sanitized.includes('"headline"'),
        hasCards: validation.sanitized.includes('"cards"'),
        preview: rawPreview,
      });

      // Try to parse structured response from Claude's output
      const structured = parseStructuredResponse(validation.sanitized);

      logger.info("[orchestrator] Parse result", {
        parsed: !!structured,
        cardCount: structured?.cards?.length ?? 0,
      });

      // Auto-generate per-drill chips from session_plan cards
      if (structured) {
        injectSessionPlanChips(structured);
      }

      // CMS chip injection (shadow / active / no-op depending on
      // `chat_pills.inResponse` flags). Mutates `structured.chips` when
      // active; logs-only when shadow. Always safe — swallows all errors.
      // See docs/CHAT_PILLS_RFC.md §4.5 and services/agents/chipInject.ts.
      await applyChipInjection(structured, context);

      // When structured JSON is parsed, extract a clean short message
      // instead of sending raw JSON text to the frontend
      const cleanMessage = structured
        ? extractCleanMessage(structured)
        : validation.sanitized;

      return {
        message: cleanMessage,
        structured: structured ?? buildTextResponse(validation.sanitized),
        refreshTargets,
        agentType: primaryAgent,
      };
    }

    // If tool_use — check for write action gate, then execute
    if (response.message.stop_reason === "tool_use") {
      const toolUseBlocks = response.message.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );

      // Check if any tools are write actions (may be multiple e.g. batch delete)
      const writeBlocks = toolUseBlocks.filter((b) => WRITE_ACTIONS.has(b.name));
      if (writeBlocks.length > 0) {
        // Extract any text Claude said before the tool calls
        const textBefore = response.message.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n");

        // Build actions array for all write blocks
        const actions: PendingWriteAction[] = writeBlocks.map((wb) => {
          const input = wb.input as Record<string, any>;
          return {
            toolName: wb.name,
            toolInput: input,
            agentType: primaryAgent,
            preview: buildConfirmationPreview(wb.name, input),
          };
        });

        const combinedPreview = actions.map((a) => a.preview).join("\n");

        // Validate calendar actions for overlaps, gaps, and duplicates
        let validation: CalendarValidationResult = { warnings: [], suggestedSlots: [] };
        try {
          validation = await validateCalendarActions(actions, context);
        } catch (err) {
          logger.warn("[orchestrator] Calendar validation failed", { error: err instanceof Error ? err.message : String(err) });
        }

        const { warnings: calendarWarnings, suggestedSlots } = validation;
        const warningText = calendarWarnings.length > 0
          ? "\n" + calendarWarnings.map((w) => w.message).join("\n")
          : "";

        // Try to parse structured response from Claude's pre-tool text
        let structured = textBefore ? parseStructuredResponse(textBefore) : null;

        // Strip any confirm_card from structured response — the frontend renders
        // its own ConfirmationCard from pendingConfirmation. Having both causes
        // duplicate confirmation UIs.
        if (structured) {
          structured.cards = structured.cards.filter((c) => c.type !== "confirm_card");
        }

        // If no structured response (or it was just a confirm_card), build a simple text card
        if (!structured || structured.cards.length === 0) {
          const headline = actions.length > 1
            ? `📅 ${actions.length} changes to review`
            : buildConfirmationHeadline(actions[0].toolName);
          structured = {
            headline,
            cards: [
              {
                type: "text_card" as const,
                headline: "",
                body: combinedPreview.replace(/ Reply "yes".*$/gm, "") + warningText,
              },
            ],
            chips: [],
            contextTags: ["response:text", "always"],
          };
        } else if (warningText) {
          // Append warnings as a coach note card
          structured.cards.push({
            type: "coach_note" as const,
            note: calendarWarnings.map((w) => w.message).join("\n"),
          });
        }

        // Add suggested alternative slots as action chips when conflicts exist
        if (suggestedSlots.length > 0) {
          if (!structured.chips) structured.chips = [];

          // Get the conflicting event title for natural-language chips
          const conflictingAction = actions.find((a) => a.toolName === "create_event");
          const eventTitle = conflictingAction?.toolInput.title ?? "session";

          for (const slot of suggestedSlots) {
            structured.chips.push({
              label: `Try ${slot.label}`,
              action: `Schedule ${eventTitle} from ${slot.startTime} to ${slot.endTime} on ${slot.date}`,
            });
          }

          // Always offer "keep original" as last chip
          structured.chips.push({
            label: "Keep original time",
            action: `Keep the original time for ${eventTitle}, add it anyway`,
          });
        }

        const cleanMessage = textBefore || combinedPreview;

        // First action is the "primary" for backward compat; all are in actions[]
        return {
          message: cleanMessage,
          structured,
          refreshTargets: [],
          pendingConfirmation: {
            ...actions[0],
            actions: actions.length > 1 ? actions : undefined,
          },
        };
      }

      // All read actions — execute them
      messages.push({ role: "assistant", content: response.message.content });

      // Emit status events during tool execution for streaming UX
      const toolStatusMap: Record<string, string> = {
        get_readiness_detail: "Checking your readiness...",
        get_today_events: "Looking at your schedule...",
        get_week_schedule: "Loading your week...",
        get_test_results: "Pulling your test history...",
        get_benchmark_comparison: "Comparing your benchmarks...",
        get_training_session: "Building your session...",
        get_drill_detail: "Loading drill details...",
        get_my_programs: "Checking your programs...",
        get_training_program_recommendations: "Finding programs for you...",
        get_consistency_score: "Calculating your streak...",
        get_dual_load_score: "Analyzing your load...",
        calculate_phv_stage: "Assessing maturity stage...",
        detect_load_collision: "Checking for conflicts...",
      };

      const toolResults = await Promise.all(
        toolUseBlocks.map(async (toolBlock) => {
          streamCallbacks?.onStatus?.(toolStatusMap[toolBlock.name] ?? `Running ${toolBlock.name}...`);
          const toolResult = await executeTool(
            primaryAgent,
            toolBlock.name,
            toolBlock.input as Record<string, any>,
            context
          );
          if (toolResult.refreshTarget)
            refreshTargets.push(toolResult.refreshTarget);
          return {
            type: "tool_result" as const,
            tool_use_id: toolBlock.id,
            content: toolResult.error
              ? `Error: ${toolResult.error}`
              : JSON.stringify(toolResult.result),
            _toolName: toolBlock.name,
            _rawResult: toolResult.result,
          };
        })
      );

      // ── CAPSULE INTERCEPT — short-circuit AI formatting for capsule tools ──
      // When get_test_catalog is called, return the capsule response directly
      // instead of letting the AI format it (AI always falls back to text+chips).
      const catalogResult = toolResults.find((r) => (r as any)._toolName === "get_test_catalog");
      if (catalogResult && (catalogResult as any)._rawResult?.readyToUseCapsuleCard) {
        const capsuleCard = (catalogResult as any)._rawResult.readyToUseCapsuleCard;

        // Check if the player mentioned a specific test type — pre-fill it
        const msgLower = userMessage.toLowerCase();
        const testHints: Record<string, string> = {
          "sprint": "10m-sprint", "10m": "10m-sprint", "20m": "20m-sprint", "30m": "30m-sprint",
          "cmj": "cmj", "jump": "cmj", "vertical": "vertical-jump", "broad jump": "broad-jump",
          "agility": "5-10-5-agility", "5-10-5": "5-10-5-agility", "t-test": "t-test", "pro agility": "pro-agility",
          "reaction": "reaction-time", "balance": "balance-y",
          "beep": "beep-test", "yoyo": "yoyo-ir1", "vo2": "vo2max", "cooper": "cooper-12min",
          "grip": "grip-strength", "squat": "1rm-squat", "bench": "1rm-bench",
        };
        for (const [hint, testId] of Object.entries(testHints)) {
          if (msgLower.includes(hint)) {
            // Verify this test exists in catalog
            if (capsuleCard.catalog.some((t: any) => t.id === testId)) {
              capsuleCard.prefilledTestType = testId;
              break;
            }
          }
        }

        return {
          message: "Log your test result",
          structured: {
            headline: capsuleCard.prefilledTestType
              ? `Log your ${capsuleCard.prefilledTestType.replace(/-/g, " ")} result`
              : "Log your test result",
            cards: [capsuleCard],
            chips: [],
            contextTags: ["response:benchmark", "metric_missing"],
          },
          refreshTargets: [],
          agentType: primaryAgent,
        };
      }

      // Strip internal-only fields before sending to Claude API (it rejects unknown props)
      const cleanResults = toolResults.map(({ _toolName, _rawResult, ...rest }: any) => rest);
      messages.push({ role: "user", content: cleanResults });
      continue;
    }

    // Unexpected stop — try to extract text
    const fallbackText = response.message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    if (fallbackText) {
      return { message: fallbackText, refreshTargets };
    }
    break;
  }

  logger.error("[orchestrator] Exhausted tool iterations without final response", {
    userId: context.userId,
    agent: primaryAgent,
    iterations: MAX_TOOL_ITERATIONS,
  });
  return {
    message: "I couldn't process that — try rephrasing?",
    refreshTargets,
  };
}

// ── AGENT LOCK — topic shift detection ──────────────────────────

const CONTINUATION_PATTERN =
  /^(also|and|plus|another|one more|what about|how about|can you also|add another|same for)/i;

/**
 * injectSessionPlanChips — when a structured response contains a session_plan card,
 * replace Claude's generic chips with one chip per drill so users can tap any drill
 * by name to fetch its details.
 */
function injectSessionPlanChips(structured: TomoResponse): void {
  const planCard = structured.cards?.find(
    (c): c is SessionPlan => c.type === "session_plan"
  );
  if (!planCard || !planCard.items?.length) return;

  const drillChips: ActionChip[] = planCard.items.map((item) => ({
    label: item.name,
    action: `Show me drill details for "${item.name}" [drillId:${item.drillId}]`,
  }));

  structured.chips = drillChips;
}

/**
 * Detect whether the user's message represents a genuine topic shift
 * that should break the agent lock. Returns false for:
 *   - Affirmations ("yes", "do it", "sounds good")
 *   - Continuations ("also add...", "and on Thursday...")
 *   - Messages in the same agent domain as the current lock
 */
function detectTopicShift(message: string, currentAgent: string): boolean {
  const trimmed = message.trim();

  // Affirmations never shift
  if (isAffirmation(trimmed)) return false;

  // Continuation phrases never shift
  if (CONTINUATION_PATTERN.test(trimmed)) return false;

  // Classify the new message's topic
  const category = categorizeMessage(trimmed);
  const newAgentDomain = getAgentForCategory(category);

  // If we can't determine the domain, don't shift
  if (!newAgentDomain) return false;

  // Shift only if the new message maps to a DIFFERENT agent
  return newAgentDomain !== currentAgent;
}

/** Map guardrail categories to agent domains */
function getAgentForCategory(category: string): string | null {
  const map: Record<string, string> = {
    scheduling: "timeline",
    training: "output",
    readiness: "output",
    recovery: "output",
    nutrition: "output",
    mastery: "mastery",
    recruiting: "mastery",
    academic_balance: "timeline",
    general_sport: "output",
  };
  return map[category] ?? null;
}

// ── HELPERS ───────────────────────────────────────────────────

/**
 * Build agent config with prompt caching support.
 * Returns system prompt as two blocks: static (cacheable) + dynamic (per-request).
 * The static block contains guardrails, Gen Z rules, output format, and agent base rules.
 * The dynamic block contains player context, temporal context, schedule rules, recs, and conversation state.
 */
async function buildAgentConfig(
  agentTypes: string[],
  context: PlayerContext,
  conversationState?: ConversationState | null,
  userMessage?: string
) {
  const toolSets: Record<string, any[]> = {
    timeline: timelineTools,
    output: outputTools,
    mastery: masteryTools,
  };

  // Static prompt builders — no context needed, identical across all requests
  const staticPromptBuilders: Record<string, () => string> = {
    timeline: buildTimelineStaticPrompt,
    output: buildOutputStaticPrompt,
    mastery: buildMasteryStaticPrompt,
  };

  // Dynamic prompt builders — per-player, per-request context
  const dynamicPromptBuilders: Record<string, (ctx: PlayerContext) => string> = {
    timeline: buildTimelineDynamicPrompt,
    output: buildOutputDynamicPrompt,
    mastery: buildMasteryDynamicPrompt,
  };

  // Combine tools from all needed agents, add cache_control to last tool
  const tools = agentTypes.flatMap((a) => toolSets[a] ?? []);
  const toolsWithCache = tools.map((t, i) =>
    i === tools.length - 1
      ? { ...t, cache_control: { type: "ephemeral" as const } }
      : t
  );

  // ── STATIC BLOCK (cacheable — same for every player using this agent combo) ──
  const staticPrefix = [
    GUARDRAIL_SYSTEM_BLOCK,
    GENZ_RESPONSE_RULES,
    OUTPUT_FORMAT_INSTRUCTION,
    staticPromptBuilders[agentTypes[0]](),
  ].join("\n\n");

  // ── DYNAMIC BLOCK (per-request — player context, temporal, schedule, recs, conversation) ──

  // Cross-session athlete memory (~100-280 tokens, loaded from DB)
  let athleteMemoryBlock = "";
  try {
    athleteMemoryBlock = await loadAthleteMemory(context.userId);
  } catch (e) {
    console.warn("[Memory] Failed to load, continuing without:", e);
  }

  // Sport-position context layer (~150-250 tokens, sport-specific coaching rules)
  const sportContext = `\n\n${buildSportContextSegment(context)}`;

  // Age-band communication profile (~60-80 tokens)
  const toneProfile = `\n\n${buildToneProfile(context.ageBand)}`;

  // Agent-specific dynamic context
  const agentDynamic = dynamicPromptBuilders[agentTypes[0]](context);

  // Build conversation context block from persisted state
  let conversationContextBlock = "";
  if (conversationState) {
    const parts: string[] = [];
    const dateEntries = Object.entries(conversationState.referencedDates);
    if (dateEntries.length > 0) {
      const contextDate = dateEntries[dateEntries.length - 1]; // most recent
      parts.push(`- Context date: ${contextDate[0]} (${contextDate[1]})`);
    }
    if (conversationState.referencedEventNames.length > 0) {
      parts.push(`- Referenced events: ${conversationState.referencedEventNames.slice(-5).join(", ")}`);
    }
    if (conversationState.currentTopic) {
      parts.push(`- Current topic: ${conversationState.currentTopic}`);
    }
    if (conversationState.lastActionContext) {
      parts.push(`- Last action: ${conversationState.lastActionContext}`);
    }
    // Inject drill context so Claude can look up drill IDs from previous session plans
    const drillEntries = Object.entries(conversationState.referencedDrills ?? {});
    if (drillEntries.length > 0) {
      const drillList = drillEntries
        .filter(([name, id]) => name !== id) // skip self-keyed entries
        .slice(-10)
        .map(([name, id]) => `  "${name}" → drillId: ${id}`)
        .join("\n");
      if (drillList) {
        parts.push(`- Session drills (name → ID):\n${drillList}`);
      }
    }
    if (parts.length > 0) {
      conversationContextBlock = `\n\nCONVERSATION CONTEXT (from previous turns):
${parts.join("\n")}
When the user says a time (e.g. "at 5pm") without specifying a date, use the context date above.
When the user refers to "the training" or "that session", check the referenced events above.
When the user asks about a drill by name, use the drill ID from the session drills list above to call get_drill_detail.
If the user message contains [drillId:UUID], extract that UUID and pass it directly.`;
    }
  }

  // Build temporal context block
  const tc = context.temporalContext;
  let temporalBlock = `\n\nTEMPORAL CONTEXT:
- Time of day: ${tc.timeOfDay} | Day type: ${tc.dayType}`;
  if (tc.isMatchDay) temporalBlock += `\n- ⚽ MATCH DAY: ${tc.matchDetails}`;
  if (tc.isExamProximity) temporalBlock += `\n- 📚 EXAM PROXIMITY: ${tc.examDetails}`;
  if (tc.suggestion) temporalBlock += `\n- Auto-suggestion: ${tc.suggestion}`;

  // Build schedule rule context (Layer 2.5 — adds ~400 tokens)
  // Use mode-aware rules when CMS mode params are available; fall back to legacy scenario-based rules
  const modeParams = context.planningContext?.modeParams as ModeParams | null;
  const modeId = context.planningContext?.activeMode as string | null;
  const scheduleRuleBlock = (modeParams && modeId)
    ? `\n\n${buildModeRuleContext(context.schedulePreferences, modeParams, modeId)}`
    : `\n\n${buildRuleContext(context.schedulePreferences, context.activeScenario)}`;

  // Build Layer 4 recommendation context block (RIE — adds ~200 tokens)
  // Group by rec_type so Claude can easily filter by topic relevance
  let recsBlock = "";
  if (context.activeRecommendations && context.activeRecommendations.length > 0) {
    const recLines = context.activeRecommendations.map((r) => {
      const pLabel = r.priority === 1 ? "🚨" : r.priority === 2 ? "⚡" : r.priority === 3 ? "📋" : "ℹ️";
      return `- ${pLabel} [${r.recType}] ${r.title} — ${r.bodyShort}`;
    });
    recsBlock = `\n\nACTIVE_RECOMMENDATIONS (grouped by rec_type tag):
${recLines.join("\n")}

REC FILTERING RULES (CRITICAL — follow strictly):
- ONLY reference recs whose [REC_TYPE] matches the player's question topic
- sleep/recovery question → only [RECOVERY] and [READINESS] recs
- training/workout question → only [DEVELOPMENT] and [LOAD_WARNING] recs
- academic/study question → only [ACADEMIC] recs
- "what should I do?" → pick the single highest-priority rec
- "show all recommendations" → show all
- NEVER show a rec tagged [READINESS] when asked about recovery unless it's specifically about recovery readiness
- When in doubt, show FEWER recs (1-2 max), not more`;
  }

  // RAG knowledge grounding (only for advisory queries with a user message)
  let ragContextBlock = "";
  if (userMessage && userMessage.length > 10 && !userMessage.startsWith("[CAPSULE_RESULT]")) {
    try {
      ragContextBlock = await retrieveChatKnowledge(userMessage, context, agentTypes[0]);
    } catch (e) {
      console.warn("[RAG] Chat retrieval failed, continuing without:", e);
    }
  }

  const dynamicSuffix =
    athleteMemoryBlock +
    sportContext +
    toneProfile +
    agentDynamic +
    temporalBlock +
    scheduleRuleBlock +
    recsBlock +
    ragContextBlock +
    conversationContextBlock +
    (agentTypes.length > 1
      ? `\n\nYou also have access to tools from: ${agentTypes.slice(1).join(", ")} to handle this request fully.`
      : "");

  // Return as block array for Anthropic API cache_control support
  const systemBlocks: Anthropic.TextBlockParam[] = [
    {
      type: "text" as const,
      text: staticPrefix,
      cache_control: { type: "ephemeral" as const },
    },
    {
      type: "text" as const,
      text: dynamicSuffix,
    },
  ];

  return { tools: toolsWithCache, systemBlocks };
}

async function executeTool(
  agentType: string,
  toolName: string,
  toolInput: Record<string, any>,
  context: PlayerContext
) {
  // Route to the correct agent's executor based on tool name prefix match
  // Capsule-only tools aren't in the Claude tool definitions but are handled by the executors
  const capsuleTimelineTools = ["update_schedule_rules", "generate_training_plan", "add_exam", "generate_study_plan", "confirm_ghost_suggestion", "dismiss_ghost_suggestion", "lock_day", "unlock_day", "get_ghost_suggestions"];
  const capsuleOutputTools = ["interact_program", "sync_whoop"];
  if (timelineTools.some((t) => t.name === toolName) || capsuleTimelineTools.includes(toolName))
    return executeTimelineTool(toolName, toolInput, context);
  if (outputTools.some((t) => t.name === toolName) || capsuleOutputTools.includes(toolName))
    return executeOutputTool(toolName, toolInput, context);
  if (masteryTools.some((t) => t.name === toolName))
    return executeMasteryTool(toolName, toolInput, context);
  return { result: null, error: "Unknown tool" };
}

function buildConfirmationRequest(
  toolName: string,
  toolInput: Record<string, any>
): string {
  const previews: Record<string, () => string> = {
    create_event: () =>
      `Add "${toolInput.title}" (${toolInput.event_type}) on ${toolInput.date} at ${toolInput.startTime}–${toolInput.endTime}?`,
    update_event: () => `Update this event with the new details?`,
    delete_event: () =>
      `Delete "${toolInput.eventTitle}" from your calendar?`,
    log_check_in: () =>
      `Log today's check-in — Energy: ${toolInput.energy}/10, Soreness: ${toolInput.soreness}/10, Sleep: ${toolInput.sleepHours}h?`,
  };
  return (
    (previews[toolName]?.() ?? "Confirm this action?") +
    ' Reply "yes" to confirm or tell me what to change.'
  );
}

function buildConfirmationPreview(
  toolName: string,
  toolInput: Record<string, any>
): string {
  // Preview for the ConfirmationCard — no "Reply yes" suffix since we have buttons
  const previews: Record<string, () => string> = {
    create_event: () =>
      `Add "${toolInput.title}" (${toolInput.event_type}) on ${toolInput.date} at ${toolInput.startTime}–${toolInput.endTime}`,
    update_event: () => `Update event with new details`,
    delete_event: () =>
      `Delete "${toolInput.eventTitle}" from calendar`,
    log_check_in: () =>
      `Log check-in — Energy: ${toolInput.energy}/10, Soreness: ${toolInput.soreness}/10, Sleep: ${toolInput.sleepHours}h`,
  };
  return previews[toolName]?.() ?? "Confirm this action";
}

function buildConfirmationHeadline(toolName: string): string {
  const headlines: Record<string, string> = {
    create_event: "📅 Adding to your calendar",
    update_event: "✏️ Here's the fix",
    delete_event: "🗑️ Removing event",
    log_check_in: "📝 Logging check-in",
  };
  return headlines[toolName] ?? "Confirm this action";
}

function formatConfirmationResult(
  toolName: string,
  toolInput: Record<string, any>,
  result: any
): string {
  const formats: Record<string, () => string> = {
    create_event: () =>
      `Done — added "${toolInput.title}" to your calendar for ${toolInput.date} at ${toolInput.startTime}–${toolInput.endTime} ✓`,
    update_event: () => `Updated ✓`,
    delete_event: () =>
      `Removed "${result?.actualTitle ?? toolInput.eventTitle}" from your calendar ✓`,
    log_check_in: () =>
      `Check-in saved ✓ Your readiness is ${result?.checkIn?.readiness ?? "processing"}.`,
  };
  return formats[toolName]?.() ?? "Done ✓";
}

// ── CALENDAR VALIDATION — delegates to shared scheduleValidationService ──

import {
  validateBatch,
  type ProposedEvent,
} from "@/services/scheduling/scheduleValidationService";

interface CalendarWarning {
  type: string;
  message: string;
}

interface SuggestedSlot {
  date: string;
  startTime: string; // HH:MM
  endTime: string;   // HH:MM
  label: string;     // display label e.g. "15:00 – 16:00"
}

interface CalendarValidationResult {
  warnings: CalendarWarning[];
  suggestedSlots: SuggestedSlot[];
}

function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Validate proposed create_event actions against the schedule rule engine + existing calendar.
 * Delegates to the shared scheduleValidationService for full rule-aware validation.
 * Returns warnings + suggested alternative slots when conflicts are found.
 */
async function validateCalendarActions(
  actions: PendingWriteAction[],
  context: PlayerContext
): Promise<CalendarValidationResult> {
  const createActions = actions.filter((a) => a.toolName === "create_event");
  if (createActions.length === 0) return { warnings: [], suggestedSlots: [] };

  // Convert PendingWriteActions → ProposedEvents for the validation service
  const proposed: ProposedEvent[] = createActions
    .filter((a) => a.toolInput.date && a.toolInput.startTime)
    .map((a) => ({
      title: a.toolInput.title ?? "Untitled",
      event_type: a.toolInput.event_type ?? "training",
      date: a.toolInput.date,
      startTime: a.toolInput.startTime,
      endTime: a.toolInput.endTime ?? minutesToHHMM(parseTimeToMinutes(a.toolInput.startTime) + 60),
      intensity: a.toolInput.intensity,
      notes: a.toolInput.notes,
    }));

  if (proposed.length === 0) return { warnings: [], suggestedSlots: [] };

  // Delegate to shared validation service (rule-engine aware)
  const preview = await validateBatch(context.userId, proposed, context.timezone);

  // Convert SchedulePreviewResponse → CalendarValidationResult for backwards compat
  const warnings: CalendarWarning[] = preview.events
    .flatMap((e) =>
      e.violations.map((v) => ({
        type: v.type,
        message: `⚠️ ${v.message}`,
      }))
    );

  const suggestedSlots: SuggestedSlot[] = preview.events
    .filter((e) => e.alternatives.length > 0)
    .flatMap((e) =>
      e.alternatives.map((alt) => ({
        date: e.date,
        startTime: alt.startTime,
        endTime: alt.endTime,
        label: `${alt.startTime} – ${alt.endTime}`,
      }))
    );

  return { warnings, suggestedSlots };
}
