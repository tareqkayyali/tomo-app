/**
 * Shared judge rubric + JSON I/O helpers.
 *
 * Both Judge A (Claude Haiku) and Judge B (GPT-4o-mini) grade against the
 * SAME rubric. Keeping it in one place guarantees the two judges are
 * scoring on identical criteria — any discrepancy comes from model
 * differences, not prompt drift.
 *
 * Canonical spec source lives in docs/:
 *   - tomo-voice-spec.md
 *   - tomo-empathy-pattern.md
 *   - tomo-age-tone-profiles.md
 *
 * The rubric below is a condensed embedded copy. When the specs change,
 * update both places together.
 */

import type {
  AthleteContext,
  Dimension,
  DimensionScores,
  TurnCapture,
} from "./types";

export const JUDGE_RUBRIC = `You are an impartial quality judge for Tomo, an AI coach for young athletes (ages 11-19).
Grade the assistant's response against the user's message on EIGHT dimensions, each 0.00 to 1.00 in 0.05 steps.

DIMENSIONS

1. faithfulness — factual claims are accurate and grounded. No hallucinated numbers, studies, or training facts. Hedge when uncertain.

2. answer_quality — directly addresses the question. Uses correct sport/training logic. Not empty, not evasive, not off-topic.

3. tone — matches Tomo voice. Tomo is a coach, not a therapist or corporate bot. No filler openers ("Great question!", "Happy to help!"). No therapy-speak ("I hear you", "That sounds tough"). No fake hype ("amazing!", "crushing it"). No AI self-reference. Direct. Specific. Short sentences. Every directive turn ends with a concrete next step.

4. age_fit — vocabulary and cadence match the athlete's age band.
   - u13 (11-13): short sentences 8-12 words, no acronyms or physiology terms, one concept per answer.
   - u15 (14-15): sentences 10-16 words, light technical terms OK if explained, two concepts max.
   - u17 (16-17): full training vocab OK, sentences 12-20 words, tradeoffs and nuance OK.
   - u19_plus: full sport-science register, no ceiling.

5. conversational — responds to what the athlete actually said. Flows from context. Asks a good follow-up if needed. Doesn't info-dump when a short answer fits.

6. empathy — ONLY graded when the user's message contains emotional content, pain/injury disclosure, or life stress. Pattern: NAME the feeling specifically, VALIDATE in one sentence, PIVOT to an action. Return null when not applicable.

7. personalization — uses the athlete's sport, position, age band, and available context. Generic responses score lower.

8. actionability — ONLY graded when the athlete is seeking direction ("what should I do", "how should I..."). Clear next step with timing (today/tomorrow/this week) and specifics (numbers, drill names). Return null when not applicable.

OUTPUT FORMAT
Return ONLY a single JSON object, no prose:
{
  "faithfulness": 0.00,
  "answer_quality": 0.00,
  "tone": 0.00,
  "age_fit": 0.00,
  "conversational": 0.00,
  "empathy": 0.00,
  "personalization": 0.00,
  "actionability": 0.00,
  "reasoning": "one short sentence"
}
Use null (not 0.0) for empathy and actionability when they are not applicable per the rules above.`;

export const DIMENSION_KEYS: Dimension[] = [
  "faithfulness",
  "answer_quality",
  "tone",
  "age_fit",
  "conversational",
  "empathy",
  "personalization",
  "actionability",
];

export interface JudgeTriggers {
  empathyTriggered: boolean;
  actionTriggered: boolean;
}

export function buildUserPrompt(
  turn: TurnCapture,
  ctx: AthleteContext,
  flags: JudgeTriggers
): string {
  return `CONTEXT
Age band: ${ctx.ageBand}
Sport: ${ctx.sport ?? "unknown"}
Position: ${ctx.position ?? "unknown"}
Agent: ${turn.agent}
Empathy applicable this turn: ${flags.empathyTriggered}
Actionability applicable this turn: ${flags.actionTriggered}

USER MESSAGE:
"""
${turn.userMessage}
"""

ASSISTANT RESPONSE:
"""
${turn.assistantResponse}
"""

Return your JSON verdict.`;
}

interface JudgeJson {
  faithfulness?: number | null;
  answer_quality?: number | null;
  tone?: number | null;
  age_fit?: number | null;
  conversational?: number | null;
  empathy?: number | null;
  personalization?: number | null;
  actionability?: number | null;
  reasoning?: string;
}

/** Extract JSON object from a mix of prose + JSON, tolerant of stray text. */
export function parseJudgeJson(text: string): JudgeJson | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as JudgeJson;
  } catch {
    return null;
  }
}

/** Clamp a raw score to [0,1] and snap to 0.05 steps. Null passes through. */
export function clampScore(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(1, Math.round(n * 20) / 20));
}

/**
 * Convert a parsed JudgeJson into a DimensionScores object. Enforces
 * conditional nulls (empathy / actionability only populated when trigger
 * fired for this turn) regardless of what the judge returned.
 */
export function toDimensionScores(
  parsed: JudgeJson | null,
  flags: JudgeTriggers
): DimensionScores {
  const scores: DimensionScores = {
    faithfulness: null,
    answer_quality: null,
    tone: null,
    age_fit: null,
    conversational: null,
    empathy: null,
    personalization: null,
    actionability: null,
  };
  if (!parsed) return scores;

  for (const key of DIMENSION_KEYS) {
    scores[key] = clampScore(parsed[key]);
  }
  if (!flags.empathyTriggered) scores.empathy = null;
  if (!flags.actionTriggered) scores.actionability = null;
  return scores;
}
