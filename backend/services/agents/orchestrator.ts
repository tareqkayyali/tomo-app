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
  buildTimelineSystemPrompt,
} from "./timelineAgent";
import {
  outputTools,
  executeOutputTool,
  buildOutputSystemPrompt,
} from "./outputAgent";
import {
  masteryTools,
  executeMasteryTool,
  buildMasterySystemPrompt,
} from "./masteryAgent";
import { validateResponse, GUARDRAIL_SYSTEM_BLOCK, categorizeMessage } from "./chatGuardrails";
import { supabaseAdmin } from "@/lib/supabase/admin";
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
import { isAffirmation, type ConversationMessage, type ConversationState } from "./sessionService";
import { buildRuleContext } from "@/services/scheduling/scheduleRuleEngine";
// conversationStateExtractor is called from route.ts, not here

const MAX_TOOL_ITERATIONS = 5;

// ── GEN Z RESPONSE FORMATTING RULES ──────────────────────────────
const GENZ_RESPONSE_RULES = `
RESPONSE FORMAT — CRITICAL:
You are talking to Gen Z athletes (13-25). They have zero patience for walls of text.

Rules:
1. BOTTOM LINE FIRST: Start with a headline (max 8 words). This is the most important info.
2. MAX 2 SENTENCES for any explanation. If you need more, use bullet points.
3. Use emoji anchors to break up content: ⚡ for energy, 😴 for sleep, 💪 for training, 🎯 for goals, 📅 for schedule, 🔥 for streaks, 🩹 for soreness.
4. Prefer structured data over prose. Numbers in stat format: "Energy: 8/10 ⚡" not "Your energy level is currently at eight out of ten."
5. End with 1-2 action suggestions, phrased as questions: "Want me to adjust your schedule?" or "Should I log that check-in?"
6. NEVER use: "Great question!", "Absolutely!", "I'd be happy to", "Let me explain", or any filler.
7. NEVER start with "Based on your data" or "Looking at your profile".
8. Be direct. Be brief. Be useful.

Example good response:
"💪 Ready to push today
Your readiness is GREEN — 8/10 energy, low soreness, 7.5h sleep.
Today: Strength session at 4pm, then recovery.

Want me to preview your workout or check for schedule clashes?"

Example bad response:
"Based on your latest check-in data, it looks like you're doing really well today! Your energy levels are at 8 out of 10, which is great, and your soreness is low. You slept about 7.5 hours last night. I'd recommend going ahead with your planned strength session at 4pm today, followed by some recovery work. Let me know if you'd like more details about anything!"
`;


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

  // Timeline signals
  if (
    context.activeTab === "Timeline" ||
    /schedule|calendar|event|exam|study|session|training|match|add|block|reschedule|today|tomorrow|week|when|plan|lock/i.test(
      lower
    )
  ) {
    agents.add("timeline");
  }

  // Output signals
  if (
    context.activeTab === "Output" ||
    /readiness|tired|energy|sleep|recovery|vitals|how (do|am) i feel|check.?in|score|metric|compare|benchmark|percentile|rank|how.*stack up|vs other|test result|how fit|sprint|jump|sore|soreness|pain|drill|exercise|workout|warm.?up|cool.?down|practice plan|training plan|what.*(should|can) i train|weakness|weak|gap|strength|area.*(improve|work|develop)|where.*(need|lack)|my best|my worst/i.test(
      lower
    )
  ) {
    agents.add("output");
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
  conversationState?: ConversationState | null
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
      console.warn("[chat-guardrail] Response leak detected in confirmation, sanitizing...");
    }

    // Build date-aware follow-up chips based on the confirmed action's date
    const actionDate = lastDate ?? confirmedAction.toolInput?.date;
    const scheduleChip = actionDate && actionDate !== context.todayDate
      ? { label: "See schedule", action: `What's on my schedule for ${actionDate}?` }
      : { label: "See schedule", action: "What's on my schedule today?" };

    return {
      message: validation.sanitized,
      structured: buildTextResponse(validation.sanitized, [
        scheduleChip,
        { label: "Check readiness", action: "How am I feeling?" },
      ]),
      refreshTargets: [...new Set(allRefreshTargets)],
    };
  }

  // Route to appropriate agent(s) — with agent lock for conversation stability
  let agentTypes: ("timeline" | "output" | "mastery")[];

  if (activeAgent && !detectTopicShift(userMessage, activeAgent)) {
    // Agent lock: stay with current agent unless explicit topic shift
    agentTypes = [activeAgent as "timeline" | "output" | "mastery"];
  } else {
    agentTypes = routeToAgents(userMessage, context, lastAgentType);
  }
  const primaryAgent = agentTypes[0];

  // Build combined tools and system prompt for this request
  const { tools, systemPrompt } = buildAgentConfig(agentTypes, context, conversationState);

  const anthropic = getClient();
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";

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

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 1024,
      system: systemPrompt,
      tools: tools as Anthropic.Tool[],
      messages,
    });

    // If end_turn — extract text and return
    if (response.stop_reason === "end_turn") {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");

      const finalMessage = text || "I couldn't process that — try rephrasing?";
      const validation = validateResponse(finalMessage);
      if (!validation.safe) {
        console.warn("[chat-guardrail] Response leak detected, sanitizing...");
      }

      // Try to parse structured response from Claude's output
      const structured = parseStructuredResponse(validation.sanitized);

      // Auto-generate per-drill chips from session_plan cards
      if (structured) {
        injectSessionPlanChips(structured);
      }

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
    if (response.stop_reason === "tool_use") {
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );

      // Check if any tools are write actions (may be multiple e.g. batch delete)
      const writeBlocks = toolUseBlocks.filter((b) => WRITE_ACTIONS.has(b.name));
      if (writeBlocks.length > 0) {
        // Extract any text Claude said before the tool calls
        const textBefore = response.content
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
          console.warn("[orchestrator] Calendar validation failed:", err instanceof Error ? err.message : err);
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
      messages.push({ role: "assistant", content: response.content });

      const toolResults = await Promise.all(
        toolUseBlocks.map(async (toolBlock) => {
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
          };
        })
      );

      messages.push({ role: "user", content: toolResults });
      continue;
    }

    // Unexpected stop — try to extract text
    const fallbackText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    if (fallbackText) {
      return { message: fallbackText, refreshTargets };
    }
    break;
  }

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

function buildAgentConfig(
  agentTypes: string[],
  context: PlayerContext,
  conversationState?: ConversationState | null
) {
  const toolSets: Record<string, any[]> = {
    timeline: timelineTools,
    output: outputTools,
    mastery: masteryTools,
  };

  const promptBuilders: Record<string, (ctx: PlayerContext) => string> = {
    timeline: buildTimelineSystemPrompt,
    output: buildOutputSystemPrompt,
    mastery: buildMasterySystemPrompt,
  };

  // Combine tools from all needed agents
  const tools = agentTypes.flatMap((a) => toolSets[a] ?? []);

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
  const scheduleRuleBlock = `\n\n${buildRuleContext(context.schedulePreferences, context.activeScenario)}`;

  // Build Layer 4 recommendation context block (RIE — adds ~200 tokens)
  let recsBlock = "";
  if (context.activeRecommendations && context.activeRecommendations.length > 0) {
    const recLines = context.activeRecommendations.map((r) => {
      const pLabel = r.priority === 1 ? "🚨 URGENT" : r.priority === 2 ? "⚡ TODAY" : r.priority === 3 ? "📋 THIS WEEK" : "ℹ️ INFO";
      return `- [${pLabel}] ${r.recType}: ${r.title} — ${r.bodyShort} (confidence: ${r.confidence.toFixed(2)})`;
    });
    recsBlock = `\n\nCURRENT_RECOMMENDATIONS (Layer 4 — pre-computed, priority-ordered):
${recLines.join("\n")}
Use these recommendations to ground your responses. When the athlete asks "what should I do?" or "how am I doing?", reference relevant recs.
P1/P2 recs should be proactively surfaced. P3/P4 are supporting context.`;
  }

  // Primary agent system prompt + context about other available tools + guardrails + Gen Z rules + output format
  const systemPrompt =
    promptBuilders[agentTypes[0]](context) +
    temporalBlock +
    scheduleRuleBlock +
    recsBlock +
    conversationContextBlock +
    (agentTypes.length > 1
      ? `\n\nYou also have access to tools from: ${agentTypes.slice(1).join(", ")} to handle this request fully.`
      : "") +
    `\n\n${GUARDRAIL_SYSTEM_BLOCK}` +
    `\n\n${GENZ_RESPONSE_RULES}` +
    `\n\n${OUTPUT_FORMAT_INSTRUCTION}`;

  return { tools, systemPrompt };
}

async function executeTool(
  agentType: string,
  toolName: string,
  toolInput: Record<string, any>,
  context: PlayerContext
) {
  // Route to the correct agent's executor based on tool name prefix match
  if (timelineTools.some((t) => t.name === toolName))
    return executeTimelineTool(toolName, toolInput, context);
  if (outputTools.some((t) => t.name === toolName))
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
      `Removed "${toolInput.eventTitle}" from your calendar ✓`,
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
