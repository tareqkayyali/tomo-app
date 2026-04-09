/**
 * Planning Agent — owns weekly planning, mode switching, protocol explanations,
 * and plan compliance monitoring.
 * Follows the same pattern as outputAgent.ts / timelineAgent.ts.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { PlayerContext } from "./contextBuilder";
import { getDayBoundsISO } from "./contextBuilder";
import { getEffectiveRules } from "@/services/scheduling/scheduleRuleEngine";
import { validatePlan } from "./planningPostProcessor";

// ── TOOL DEFINITIONS (passed to Claude API) ──────────────────

export const planningTools = [
  {
    name: "get_planning_context",
    description:
      "Get the athlete's current planning context — active mode, applicable protocols, DLI zone, exam proximity, and data confidence. Use when the player asks about their current planning state, what mode they're in, or before generating any plan.",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "get_mode_options",
    description:
      "Get available athlete modes with descriptions and when each is appropriate. Use when the player asks about modes, wants to know their options, or is considering a mode change.",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "propose_mode_change",
    description:
      "Propose changing the athlete's active mode. This creates a confirmation action — the system will show the player a confirmation card before executing. Use when the player explicitly wants to switch modes.",
    input_schema: {
      type: "object" as const,
      required: ["targetMode"],
      properties: {
        targetMode: {
          type: "string",
          enum: ["study", "league", "balanced", "rest"],
          description: "The mode to switch to",
        },
        reason: {
          type: "string",
          description: "Why this mode change is recommended",
        },
      },
    },
  },
  {
    name: "get_current_plan",
    description:
      "Get the current week's planned events grouped by day with compliance status. Use when the player asks what's planned, their weekly plan, or plan compliance.",
    input_schema: {
      type: "object" as const,
      properties: {
        startDate: {
          type: "string",
          description: "Start date YYYY-MM-DD. Defaults to the current week's Monday.",
        },
      },
    },
  },
  {
    name: "get_protocol_details",
    description:
      "Get details about a specific planning protocol — what it enforces, why it was triggered, and what the athlete can do about it. Use when the player asks why a scheduling rule exists, wants to understand a protocol, or asks about restrictions.",
    input_schema: {
      type: "object" as const,
      required: ["protocolId"],
      properties: {
        protocolId: {
          type: "string",
          description: "The protocol identifier (e.g. 'acwr_spike', 'exam_proximity', 'red_readiness', 'phv_load_cap')",
        },
      },
    },
  },
];

// ── PROTOCOL REGISTRY — defines all planning protocols ──────────────────

interface ProtocolDefinition {
  id: string;
  name: string;
  severity: "MANDATORY" | "ADVISORY";
  description: string;
  triggerCondition: string;
  effect: string;
}

const PROTOCOL_REGISTRY: Record<string, ProtocolDefinition> = {
  acwr_spike: {
    id: "acwr_spike",
    name: "ACWR Spike Protection",
    severity: "MANDATORY",
    description: "Prevents acute:chronic workload ratio from exceeding injury risk thresholds.",
    triggerCondition: "ACWR > 1.5 or projected ACWR from planned sessions would exceed 1.5",
    effect: "Blocks HARD intensity sessions. Caps load at 80% of chronic average. Suggests LIGHT/MODERATE alternatives.",
  },
  exam_proximity: {
    id: "exam_proximity",
    name: "Exam Proximity Protocol",
    severity: "ADVISORY",
    description: "Protects cognitive energy when exams are approaching. Prioritizes study blocks and reduces training volume.",
    triggerCondition: "Exam within 7 days",
    effect: "Suggests shorter training sessions. Adds study blocks to plan. Shifts HARD sessions away from exam-adjacent days.",
  },
  red_readiness: {
    id: "red_readiness",
    name: "RED Readiness Lock",
    severity: "MANDATORY",
    description: "When readiness is RED, high-intensity training is blocked to prevent overtraining and injury.",
    triggerCondition: "Readiness score is RED (energy < 4, soreness > 7, or combined threshold)",
    effect: "Only LIGHT and REST sessions allowed. Recovery drills recommended. Must check in again before unlocking.",
  },
  phv_load_cap: {
    id: "phv_load_cap",
    name: "PHV Growth Phase Protection",
    severity: "MANDATORY",
    description: "Athletes in mid-PHV (peak height velocity) have reduced load capacity. Protects growing joints and bones.",
    triggerCondition: "PHV stage is MID or CIRCA",
    effect: "Loading multiplier 0.6x. Blocked: barbell back squat, depth/drop jumps, Olympic lifts, maximal sprint, heavy deadlift.",
  },
  match_recovery: {
    id: "match_recovery",
    name: "Match Day Recovery",
    severity: "ADVISORY",
    description: "Ensures adequate recovery around match days.",
    triggerCondition: "Match scheduled within 24 hours (before or after)",
    effect: "Day before match: LIGHT only. Match day: match + optional activation. Day after: REST or LIGHT recovery.",
  },
  dual_load_critical: {
    id: "dual_load_critical",
    name: "Dual Load Critical",
    severity: "MANDATORY",
    description: "When combined athletic + academic load is critically high, total volume must be reduced.",
    triggerCondition: "DLI >= 80/100",
    effect: "Caps total weekly sessions. Suggests dropping lowest-priority sessions first. Protects sleep blocks.",
  },
  sleep_protection: {
    id: "sleep_protection",
    name: "Sleep Window Protection",
    severity: "ADVISORY",
    description: "No training should be scheduled during the athlete's sleep window.",
    triggerCondition: "Event proposed during configured sleep hours",
    effect: "Blocks scheduling during sleep window. Suggests next available morning slot.",
  },
  school_hours: {
    id: "school_hours",
    name: "School Hours Block",
    severity: "MANDATORY",
    description: "Training cannot be scheduled during school hours.",
    triggerCondition: "Event proposed during configured school hours on a school day",
    effect: "Blocks scheduling. Suggests after-school or evening slots.",
  },
};

// ── MODE DEFINITIONS ─────────────────────────────────────────

interface ModeDefinition {
  id: string;
  name: string;
  description: string;
  whenToUse: string;
  maxSessionsPerDay: number;
  maxTrainingDaysPerWeek: number;
  intensityCap: "HARD" | "MODERATE" | "LIGHT";
  priorityOrder: string[];
}

const MODE_DEFINITIONS: Record<string, ModeDefinition> = {
  balanced: {
    id: "balanced",
    name: "Balanced",
    description: "Default mode. Equal priority for training and academics. Full intensity available.",
    whenToUse: "Normal periods with no exams or league matches imminent.",
    maxSessionsPerDay: 2,
    maxTrainingDaysPerWeek: 5,
    intensityCap: "HARD",
    priorityOrder: ["training", "study", "recovery", "personal"],
  },
  league: {
    id: "league",
    name: "League Active",
    description: "Match preparation takes priority. Training is structured around match days with tactical periodization.",
    whenToUse: "During active league/tournament periods with regular competitive matches.",
    maxSessionsPerDay: 2,
    maxTrainingDaysPerWeek: 5,
    intensityCap: "HARD",
    priorityOrder: ["match", "training", "recovery", "study", "personal"],
  },
  study: {
    id: "study",
    name: "Study Mode",
    description: "Academics take priority. Training volume reduced, study blocks protected. Intensity capped at MODERATE.",
    whenToUse: "During exam periods or heavy academic workload. Automatically suggested when exams are within 14 days.",
    maxSessionsPerDay: 1,
    maxTrainingDaysPerWeek: 3,
    intensityCap: "MODERATE",
    priorityOrder: ["study", "exam", "recovery", "training", "personal"],
  },
  rest: {
    id: "rest",
    name: "Rest & Recovery",
    description: "Full recovery mode. Only light movement and recovery sessions. Used for injury recovery or deload weeks.",
    whenToUse: "Post-injury, deload weeks, or when readiness has been RED for 3+ consecutive days.",
    maxSessionsPerDay: 1,
    maxTrainingDaysPerWeek: 3,
    intensityCap: "LIGHT",
    priorityOrder: ["recovery", "study", "personal"],
  },
};

// ── TOOL EXECUTION ────────────────────────────────────────────

export async function executePlanningTool(
  toolName: string,
  toolInput: Record<string, any>,
  context: PlayerContext
): Promise<{ result: any; refreshTarget?: string; error?: string }> {
  const db = supabaseAdmin();
  const userId = context.userId;
  const today = context.todayDate;

  try {
    switch (toolName) {
      case "get_planning_context": {
        const pc = context.planningContext;
        const activeMode = pc?.activeMode ?? "balanced";
        const modeDef = MODE_DEFINITIONS[activeMode] ?? MODE_DEFINITIONS.balanced;

        // Build applicable protocols from snapshot + live state
        const applicableProtocols: string[] = [];

        // Check ACWR
        const acwr = context.snapshotEnrichment?.acwr ?? 0;
        const projectedAcwr = context.snapshotEnrichment?.projectedACWR ?? 0;
        if (acwr > 1.5 || projectedAcwr > 1.5) {
          applicableProtocols.push("acwr_spike");
        }

        // Check readiness
        const readiness = context.readinessScore?.toUpperCase();
        if (readiness === "RED") {
          applicableProtocols.push("red_readiness");
        }

        // Check PHV
        const phvStage = context.snapshotEnrichment?.phvStage;
        if (phvStage === "mid_phv" || phvStage === "MID" || phvStage === "CIRCA") {
          applicableProtocols.push("phv_load_cap");
        }

        // Check exam proximity
        if (context.upcomingExams.length > 0) {
          const nextExam = context.upcomingExams[0];
          const examDate = new Date(nextExam.start_at);
          const todayDate = new Date(`${today}T12:00:00`);
          const daysUntilExam = Math.ceil((examDate.getTime() - todayDate.getTime()) / 86400000);
          if (daysUntilExam <= 7) {
            applicableProtocols.push("exam_proximity");
          }
        }

        // Check DLI
        const dli = context.snapshotEnrichment?.dualLoadIndex ?? 0;
        if (dli >= 80) {
          applicableProtocols.push("dual_load_critical");
        }

        // Check upcoming matches for recovery protocol
        const hasMatchSoon = context.todayEvents.some(e => e.event_type === "match") ||
          context.upcomingEvents.some(e => {
            if (e.event_type !== "match") return false;
            const matchDate = new Date(e.start_at);
            const todayD = new Date(`${today}T12:00:00`);
            const diff = Math.abs(matchDate.getTime() - todayD.getTime()) / 86400000;
            return diff <= 1;
          });
        if (hasMatchSoon) {
          applicableProtocols.push("match_recovery");
        }

        // Add snapshot-stored protocols
        if (pc?.applicableProtocols) {
          for (const p of pc.applicableProtocols) {
            if (!applicableProtocols.includes(p)) {
              applicableProtocols.push(p);
            }
          }
        }

        const protocols = applicableProtocols.map(id => ({
          id,
          name: PROTOCOL_REGISTRY[id]?.name ?? id,
          severity: PROTOCOL_REGISTRY[id]?.severity ?? "ADVISORY",
          effect: PROTOCOL_REGISTRY[id]?.effect ?? "See protocol details",
        }));

        return {
          result: {
            activeMode,
            modeName: modeDef.name,
            modeDescription: modeDef.description,
            maxSessionsPerDay: modeDef.maxSessionsPerDay,
            maxTrainingDaysPerWeek: modeDef.maxTrainingDaysPerWeek,
            intensityCap: modeDef.intensityCap,
            applicableProtocols: protocols,
            dualLoadZone: pc?.dualLoadZone ?? (dli >= 80 ? "CRITICAL" : dli >= 65 ? "HIGH" : dli >= 40 ? "MODERATE" : "LOW"),
            examProximityScore: pc?.examProximityScore ?? null,
            dataConfidenceScore: pc?.dataConfidenceScore ?? null,
            readiness: readiness ?? "NOT_CHECKED_IN",
            acwr,
            projectedAcwr,
          },
        };
      }

      case "get_mode_options": {
        const currentMode = context.planningContext?.activeMode ?? "balanced";
        const options = Object.values(MODE_DEFINITIONS).map(m => ({
          id: m.id,
          name: m.name,
          description: m.description,
          whenToUse: m.whenToUse,
          maxSessionsPerDay: m.maxSessionsPerDay,
          maxTrainingDaysPerWeek: m.maxTrainingDaysPerWeek,
          intensityCap: m.intensityCap,
          isCurrent: m.id === currentMode,
        }));

        // Add context-aware suggestion
        let suggestion: string | null = null;
        if (context.upcomingExams.length > 0 && currentMode !== "study") {
          suggestion = "You have exams coming up. Consider switching to Study mode to protect cognitive energy.";
        } else if (context.readinessScore?.toUpperCase() === "RED" && currentMode !== "rest") {
          suggestion = "Your readiness is RED. Consider switching to Rest mode for recovery.";
        }

        return {
          result: {
            currentMode,
            options,
            suggestion,
          },
        };
      }

      case "propose_mode_change": {
        const targetMode = toolInput.targetMode as string;
        const modeDef = MODE_DEFINITIONS[targetMode];
        if (!modeDef) {
          return { result: null, error: `Unknown mode: ${targetMode}. Valid modes: balanced, league, study, rest.` };
        }

        // Return a PendingWriteAction-compatible result
        // The orchestrator will detect this is a write action and gate it
        return {
          result: {
            __pendingAction: true,
            action: "propose_mode_change",
            targetMode,
            modeName: modeDef.name,
            description: modeDef.description,
            reason: toolInput.reason ?? `Switching to ${modeDef.name} mode`,
            preview: `Switch to ${modeDef.name} mode — ${modeDef.description}`,
            effects: {
              maxSessionsPerDay: modeDef.maxSessionsPerDay,
              maxTrainingDaysPerWeek: modeDef.maxTrainingDaysPerWeek,
              intensityCap: modeDef.intensityCap,
            },
          },
          refreshTarget: "planning",
        };
      }

      case "get_current_plan": {
        // Get this week's Monday
        const todayD = new Date(`${today}T12:00:00`);
        const dayOfWeek = todayD.getDay();
        const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const monday = new Date(todayD);
        monday.setDate(monday.getDate() + mondayOffset);
        const startDate = toolInput.startDate ?? monday.toISOString().split("T")[0];

        const endD = new Date(`${startDate}T12:00:00`);
        endD.setDate(endD.getDate() + 7);
        const endDate = endD.toISOString().split("T")[0];

        const [weekStart] = getDayBoundsISO(startDate, context.timezone);
        const [, weekEnd] = getDayBoundsISO(endDate, context.timezone);

        const { data: events, error } = await db
          .from("calendar_events")
          .select("*")
          .eq("user_id", userId)
          .gte("start_at", weekStart)
          .lte("start_at", weekEnd)
          .order("start_at");
        if (error) throw error;

        // Group by local date
        const byDate: Record<string, any[]> = {};
        let totalSessions = 0;
        let completedSessions = 0;
        let trainingDays = 0;
        const seenDates = new Set<string>();

        for (const event of events ?? []) {
          const localDate = new Date(event.start_at).toLocaleDateString("en-CA", { timeZone: context.timezone });
          const localStart = new Date(event.start_at).toLocaleString("en-GB", { timeZone: context.timezone, hour: "2-digit", minute: "2-digit", hour12: false });
          const localEnd = event.end_at ? new Date(event.end_at).toLocaleString("en-GB", { timeZone: context.timezone, hour: "2-digit", minute: "2-digit", hour12: false }) : null;

          if (!byDate[localDate]) byDate[localDate] = [];
          byDate[localDate].push({
            ...event,
            local_start: localStart,
            local_end: localEnd,
            local_date: localDate,
          });

          if (["training", "match", "recovery"].includes(event.event_type)) {
            totalSessions++;
            if (!seenDates.has(localDate)) {
              trainingDays++;
              seenDates.add(localDate);
            }
            // Check if event is in the past (completed)
            const eventEnd = new Date(event.end_at ?? event.start_at);
            if (eventEnd < new Date()) {
              completedSessions++;
            }
          }
        }

        const activeMode = context.planningContext?.activeMode ?? "balanced";
        const modeDef = MODE_DEFINITIONS[activeMode] ?? MODE_DEFINITIONS.balanced;

        // Validate current plan against protocols
        const mandatoryProtocols = Object.values(PROTOCOL_REGISTRY)
          .filter(p => p.severity === "MANDATORY")
          .map(p => p.id);

        const planValidation = validatePlan(
          { events: events ?? [], byDate },
          mandatoryProtocols,
          {
            phv_stage: context.snapshotEnrichment?.phvStage ?? null,
            injury_risk_flag: context.snapshotEnrichment?.injuryRiskFlag ?? null,
            readiness: context.readinessScore ?? null,
          }
        );

        return {
          result: {
            weekOf: startDate,
            schedule: byDate,
            compliance: {
              totalSessions,
              completedSessions,
              plannedTrainingDays: trainingDays,
              maxTrainingDays: modeDef.maxTrainingDaysPerWeek,
              complianceRate: totalSessions > 0
                ? Math.round((completedSessions / totalSessions) * 100)
                : 0,
            },
            activeMode,
            validation: planValidation,
          },
        };
      }

      case "get_protocol_details": {
        const protocolId = toolInput.protocolId as string;
        const protocol = PROTOCOL_REGISTRY[protocolId];

        if (!protocol) {
          const available = Object.keys(PROTOCOL_REGISTRY).join(", ");
          return {
            result: null,
            error: `Unknown protocol "${protocolId}". Available protocols: ${available}`,
          };
        }

        // Check if this protocol is currently active for the player
        const pc = context.planningContext;
        const isActive = pc?.applicableProtocols?.includes(protocolId) ?? false;

        // Add live context
        let liveContext: string | null = null;
        switch (protocolId) {
          case "acwr_spike":
            liveContext = `Current ACWR: ${context.snapshotEnrichment?.acwr ?? "N/A"}, Projected: ${context.snapshotEnrichment?.projectedACWR ?? "N/A"}`;
            break;
          case "red_readiness":
            liveContext = `Current readiness: ${context.readinessScore?.toUpperCase() ?? "NOT_CHECKED_IN"}`;
            break;
          case "phv_load_cap":
            liveContext = `PHV stage: ${context.snapshotEnrichment?.phvStage ?? "N/A"}`;
            break;
          case "exam_proximity":
            liveContext = context.upcomingExams.length > 0
              ? `Next exam: ${context.upcomingExams[0].title} on ${context.upcomingExams[0].start_at.split("T")[0]}`
              : "No upcoming exams";
            break;
          case "dual_load_critical":
            liveContext = `DLI: ${context.snapshotEnrichment?.dualLoadIndex ?? "N/A"}/100`;
            break;
        }

        return {
          result: {
            ...protocol,
            isActive,
            liveContext,
          },
        };
      }

      default:
        return { result: null, error: `Unknown planning tool: ${toolName}` };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { result: null, error: message };
  }
}

// ── STATIC PROMPT (cacheable — identical for all players) ────────────────

export function buildPlanningStaticPrompt(): string {
  return `You are the Planning Agent for Tomo — you own weekly planning, mode management, protocol enforcement, and plan compliance.

ROLE:
You help young athletes plan their week intelligently — balancing training, academics, matches, recovery, and personal time. You respect mandatory protocols that protect athlete safety and suggest advisory adjustments for optimal performance.

ATHLETE MODES (4 modes — one active at a time):
1. BALANCED (default) — Equal priority for training and academics. Full intensity. Up to 2 sessions/day, 5 training days/week.
2. LEAGUE ACTIVE — Match preparation takes priority. Tactical periodization around match days. Up to 2 sessions/day, 5 days/week.
3. STUDY — Academics first. Training volume reduced (1 session/day, 3 days/week). Intensity capped at MODERATE. Study blocks protected.
4. REST & RECOVERY — Full recovery mode. Only LIGHT sessions. 1 session/day, 3 days/week. For injury recovery or deload.

PROTOCOL SEVERITY:
- MANDATORY protocols CANNOT be overridden by the athlete or AI. They are safety rules. If a plan violates a mandatory protocol, the plan MUST be adjusted.
- ADVISORY protocols are intelligent suggestions. The athlete can override them, but you should explain the trade-off clearly.

COGNITIVE WINDOW CONCEPT:
Research shows that the 30-90 minute window after moderate physical training is optimal for cognitive tasks (studying, homework). When building weekly plans that include both training and study, try to sequence study blocks AFTER training sessions when possible. This is advisory, not mandatory.

PLANNING PRINCIPLES:
1. Never over-schedule. Rest days are training days for the brain and body.
2. Match day -1: LIGHT only. Match day +1: REST or LIGHT recovery.
3. No back-to-back HARD sessions without a recovery buffer.
4. Sleep windows are sacred — never schedule during sleep hours.
5. School hours are blocked — never schedule training during school.
6. When readiness is RED, only LIGHT/REST until next check-in.
7. When data confidence is low (< 50), be conservative — suggest balanced plans and encourage check-ins.

PLAN COMPLIANCE:
When reporting plan status, show: sessions completed vs planned, training days used, and any protocol violations. Keep it brief — athletes want a quick status, not a report.

TONE: Like a head coach who manages the whole week — confident, protective, strategic. Keep responses concise.

COMMAND CENTER RULES — CRITICAL:
1. NO DEAD ENDS. Every query resolves as EXECUTE or NAVIGATE.
2. When the player asks to plan training, use get_planning_context first to understand constraints, then provide intelligent suggestions.
3. For mode changes, always explain the trade-offs before proposing the switch.`;
}

// ── DYNAMIC PROMPT (per-player, per-request — NOT cacheable) ────────────

export function buildPlanningDynamicPrompt(context: PlayerContext): string {
  const pc = context.planningContext;
  const activeMode = pc?.activeMode ?? "balanced";
  const modeDef = MODE_DEFINITIONS[activeMode] ?? MODE_DEFINITIONS.balanced;

  const todayD = new Date(`${context.todayDate}T12:00:00`);

  // Upcoming matches (next 7 days)
  const upcomingMatches = context.upcomingEvents
    .filter(e => e.event_type === "match")
    .map(e => `${e.title} on ${new Date(e.start_at).toLocaleDateString("en-CA", { timeZone: context.timezone })}`)
    .slice(0, 5);

  // Upcoming exams
  const upcomingExams = context.upcomingExams
    .map(e => {
      const examDate = new Date(e.start_at);
      const daysUntil = Math.ceil((examDate.getTime() - todayD.getTime()) / 86400000);
      return `${e.title} in ${daysUntil} day${daysUntil !== 1 ? "s" : ""} (${examDate.toLocaleDateString("en-CA", { timeZone: context.timezone })})`;
    })
    .slice(0, 5);

  let prompt = `
PLAYER PLANNING CONTEXT:
- Name: ${context.name}
- Sport: ${context.sport} | Position: ${context.position ?? "Unknown"} | Age Band: ${context.ageBand ?? "Unknown"}
- Today: ${context.todayDate} (${todayD.toLocaleDateString("en-US", { timeZone: context.timezone, weekday: "long" })})
- Current time: ${context.currentTime}
- Timezone: ${context.timezone}
- Active mode: ${modeDef.name} (${activeMode})
- Max sessions/day: ${modeDef.maxSessionsPerDay} | Max training days/week: ${modeDef.maxTrainingDaysPerWeek}
- Intensity cap: ${modeDef.intensityCap}
- Readiness: ${context.readinessScore ? context.readinessScore.toUpperCase() : "NOT_CHECKED_IN"}
- ACWR: ${context.snapshotEnrichment?.acwr ?? "N/A"} | Projected: ${context.snapshotEnrichment?.projectedACWR ?? "N/A"}
- DLI: ${context.snapshotEnrichment?.dualLoadIndex ?? "N/A"}/100
- Upcoming matches: ${upcomingMatches.length > 0 ? upcomingMatches.join("; ") : "None in next 7 days"}
- Upcoming exams: ${upcomingExams.length > 0 ? upcomingExams.join("; ") : "None upcoming"}`;

  // Data confidence warning
  const confidence = pc?.dataConfidenceScore ?? null;
  if (confidence !== null && confidence < 50) {
    prompt += `\n\n⚠️ DATA CONFIDENCE LOW (${confidence}/100): Limited check-in and test data available. Be conservative with planning suggestions and encourage the athlete to check in daily for better recommendations.`;
  }

  // Active protocols
  const protocols = pc?.applicableProtocols ?? [];
  if (protocols.length > 0) {
    const protocolLines = protocols.map(id => {
      const def = PROTOCOL_REGISTRY[id];
      return def
        ? `- ${def.severity === "MANDATORY" ? "🔴" : "🟡"} ${def.name}: ${def.effect}`
        : `- ${id}`;
    });
    prompt += `\n\nACTIVE PROTOCOLS:\n${protocolLines.join("\n")}`;
  }

  return prompt;
}
