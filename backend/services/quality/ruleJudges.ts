/**
 * Judge C — rule-based heuristics.
 *
 * Zero LLM cost, fully deterministic, fully orthogonal to Judges A/B.
 * Produces a score 0.0–1.0 per dimension. Null where the rule has no signal
 * (e.g., empathy dimension when not triggered).
 *
 * Design: each sub-judge is a pure function. Scores average equal-weighted
 * into the final dimension score.
 */

import type {
  AthleteContext,
  Dimension,
  DimensionScores,
  RuleJudgeResult,
  TurnCapture,
} from "./types";
import {
  AGE_BAND_TARGETS,
  COACH_VERBS,
  DIRECTIVE_VERBS,
  FILLER_OPENER_STARTS,
  FORBIDDEN_PHRASE_PATTERNS,
  TURN_LENGTH_CAPS,
  U13_FORBIDDEN_TERMS,
  U15_FORBIDDEN_TERMS,
} from "./constants";

// ---------------------------------------------------------------------------
// Text utilities
// ---------------------------------------------------------------------------

const WORD_RE = /[A-Za-z]+(?:'[A-Za-z]+)?/g;
const SENTENCE_RE = /[^.!?]+[.!?]+/g;

function sentences(text: string): string[] {
  const m = text.match(SENTENCE_RE);
  if (!m) return text.trim() ? [text.trim()] : [];
  return m.map((s) => s.trim()).filter(Boolean);
}

function words(text: string): string[] {
  return text.match(WORD_RE) ?? [];
}

function syllablesInWord(w: string): number {
  const s = w.toLowerCase();
  if (!s) return 0;
  if (s.length <= 3) return 1;
  const cleaned = s
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "")
    .replace(/^y/, "");
  const groups = cleaned.match(/[aeiouy]+/g);
  return Math.max(1, groups?.length ?? 1);
}

/** Flesch-Kincaid grade level. Classic formula. */
function fleschKincaidGrade(text: string): number {
  const sents = sentences(text);
  const ws = words(text);
  if (sents.length === 0 || ws.length === 0) return 0;
  const totalSyllables = ws.reduce((sum, w) => sum + syllablesInWord(w), 0);
  const asl = ws.length / sents.length;
  const asw = totalSyllables / ws.length;
  return 0.39 * asl + 11.8 * asw - 15.59;
}

/** Scale a value against a target range into a 0–1 score. */
function rangeScore(value: number, target: { min: number; max: number }): number {
  if (value >= target.min && value <= target.max) return 1.0;
  const dist =
    value < target.min ? target.min - value : value - target.max;
  if (dist <= 1) return 0.7;
  if (dist <= 2) return 0.4;
  return 0.0;
}

function clamp(x: number, lo = 0, hi = 1): number {
  return Math.max(lo, Math.min(hi, x));
}

function roundToStep(x: number, step = 0.05): number {
  // parseFloat(toFixed) collapses floating-point drift — avoids artefacts like
  // 0.05 × 6 producing 0.30000000000000004 which then triggers check-constraint
  // rejections on numeric(3,2) columns.
  return parseFloat((Math.round(x / step) * step).toFixed(2));
}

// ---------------------------------------------------------------------------
// Dimension: faithfulness (rule component)
//   Without RAG context, the rule judge can only do a light structural check
//   for numeric-claim density. If numeric claims exist, they should appear in
//   the retrieved chunks — but we don't pass chunks to Judge C in Phase 1.
//   Return null when has_rag=true so Judges A/B carry the weight.
// ---------------------------------------------------------------------------

function scoreFaithfulness(turn: TurnCapture): number | null {
  if (turn.hasRag) return null;
  // Non-RAG: check for unhedged specific claims that should be hedged.
  // Heuristic: if response makes a strong claim about a named research study,
  // person, or percentage without caveat, downgrade slightly.
  const strongClaim =
    /(\d+%|according to|research shows|studies (show|prove|confirm))/i.test(
      turn.assistantResponse
    );
  const hedged =
    /(roughly|around|about|typically|often|can|may|might|tends to)/i.test(
      turn.assistantResponse
    );
  if (strongClaim && !hedged) return 0.7;
  return 1.0;
}

// ---------------------------------------------------------------------------
// Dimension: answer_quality (structural completeness)
// ---------------------------------------------------------------------------

function scoreAnswerQuality(turn: TurnCapture): number {
  const resp = turn.assistantResponse.trim();
  if (resp.length < 10) return 0.0;

  // Empty-shell response ("I can help with that.")
  if (/^i (can|will) (help|try|assist)[\s.!]*$/i.test(resp)) return 0.2;

  // Echoes the question without answering.
  if (resp.toLowerCase().includes(turn.userMessage.toLowerCase().trim())) {
    return 0.4;
  }

  return 1.0;
}

// ---------------------------------------------------------------------------
// Dimension: tone (6 sub-signals from the voice spec)
// ---------------------------------------------------------------------------

function scoreTone(turn: TurnCapture): { score: number; violations: string[] } {
  const resp = turn.assistantResponse;
  const violations: string[] = [];
  const sents = sentences(resp);
  const first = sents[0] ?? "";

  // 1. No forbidden phrases
  let s1 = 1.0;
  for (const { re, label } of FORBIDDEN_PHRASE_PATTERNS) {
    if (re.test(resp)) {
      s1 = 0.0;
      violations.push(`forbidden:${label}`);
    }
  }

  // 2. No filler opener
  let s2 = 1.0;
  for (const re of FILLER_OPENER_STARTS) {
    if (re.test(first)) {
      s2 = 0.0;
      violations.push("filler_opener");
      break;
    }
  }

  // 3. Specificity: numbers, sport terms, or coach verbs appear somewhere
  const hasNumber = /\d/.test(resp);
  const respLower = resp.toLowerCase();
  const hasCoachVerb = COACH_VERBS.some((v) => respLower.includes(v));
  const hasDirective = DIRECTIVE_VERBS.some((v) => respLower.includes(v));
  const s3 = hasNumber || hasCoachVerb || hasDirective ? 1.0 : 0.5;

  // 4. Directness: avoid hedge soup (3+ hedges in one sentence)
  const hedgeCount = (resp.match(/\b(maybe|perhaps|possibly|might|could|sort of|kind of|arguably)\b/gi) ?? []).length;
  const s4 = hedgeCount <= 2 ? 1.0 : hedgeCount <= 4 ? 0.5 : 0.0;

  // 5. Coach register: no therapy-speak beyond the forbidden list (acknowledge-
  //    performance, apology chains). Forbidden list already catches most.
  //    Extra: no starting with apology.
  const s5 = /^(i'?m (so )?sorry|my apologies|unfortunately)/i.test(first) ? 0.5 : 1.0;
  if (s5 < 1.0) violations.push("apology_opener");

  // 6. Length discipline — rough heuristic: ≤ 8 sentences unless explicit
  //    depth request ("explain", "why", "how does") was in the user msg.
  const depthAsk = /\b(explain|why|how does|break ?it ?down|walk me through)\b/i.test(turn.userMessage);
  const cap = depthAsk ? 14 : TURN_LENGTH_CAPS.explanation;
  const s6 = sents.length <= cap ? 1.0 : sents.length <= cap + 4 ? 0.6 : 0.3;
  if (s6 < 1.0) violations.push("over_long");

  let score = (s1 + s2 + s3 + s4 + s5 + s6) / 6;
  // Forbidden phrases are a hard fail for brand voice — any match caps the
  // tone score at 0.3 regardless of the other sub-signals. Without this
  // cap a response with 4 forbidden phrases but short length / no hedges
  // could still score ~0.6 by averaging.
  if (s1 === 0) score = Math.min(score, 0.3);
  return { score: roundToStep(clamp(score)), violations };
}

// ---------------------------------------------------------------------------
// Dimension: age_fit (FK grade + sentence length + band forbidden vocab)
// ---------------------------------------------------------------------------

function scoreAgeFit(turn: TurnCapture, ctx: AthleteContext): number {
  const target = AGE_BAND_TARGETS[ctx.ageBand];
  const fk = fleschKincaidGrade(turn.assistantResponse);
  const fkScore = rangeScore(fk, target.fkGrade);

  const sents = sentences(turn.assistantResponse);
  const wordCounts = sents.map((s) => words(s).length).filter((n) => n > 0);
  const meanLen =
    wordCounts.length === 0
      ? 0
      : wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length;
  const lenScore = rangeScore(meanLen, target.sentenceWordCount);

  // Band-specific forbidden vocab
  let vocabScore = 1.0;
  if (ctx.ageBand === "u13" && U13_FORBIDDEN_TERMS.test(turn.assistantResponse)) {
    vocabScore = 0.0;
  } else if (
    ctx.ageBand === "u15" &&
    U15_FORBIDDEN_TERMS.test(turn.assistantResponse)
  ) {
    vocabScore = 0.3;
  }

  return roundToStep(clamp((fkScore + lenScore + vocabScore) / 3));
}

// ---------------------------------------------------------------------------
// Dimension: conversational (continuity / responsiveness proxy)
//   Rule judge is weak here; give a soft signal based on length vs ask.
// ---------------------------------------------------------------------------

function scoreConversational(turn: TurnCapture): number {
  const userWords = words(turn.userMessage).length;
  const respWords = words(turn.assistantResponse).length;
  // Very short question → very long answer = likely info-dump.
  if (userWords <= 10 && respWords > 200) return 0.5;
  // Very long question → very short answer = likely dismissive.
  if (userWords > 40 && respWords < 20) return 0.5;
  return 1.0;
}

// ---------------------------------------------------------------------------
// Dimension: empathy (conditional) — rule judge checks for forbidden
// therapy-speak and for presence of a "Name" acknowledgement phrase.
// ---------------------------------------------------------------------------

function scoreEmpathy(turn: TurnCapture, empathyTriggered: boolean): number | null {
  if (!empathyTriggered) return null;

  const resp = turn.assistantResponse;
  const violations: string[] = [];

  // Therapy-speak forbidden (same as tone, reinforced here)
  if (
    /\b(i hear you|i'?m here for you|i understand how you feel|that sounds (really|so) tough)\b/i.test(
      resp
    )
  ) {
    violations.push("therapy_speak");
  }

  // Acknowledgement signal — some specific language pointing at what the
  // athlete raised. Heuristic: response contains a feeling-word OR a
  // context word from the user message in its first sentence.
  const firstSent = sentences(resp)[0] ?? "";
  const ackWords = [
    "stings", "makes sense", "real", "tough spot", "frustrating",
    "rough", "brutal", "demoralizing", "scary", "unfair", "pressure",
  ];
  const hasAck = ackWords.some((w) => firstSent.toLowerCase().includes(w));

  // Pivot signal — response contains a directive verb (actionable next step)
  const respLower = resp.toLowerCase();
  const hasPivot = DIRECTIVE_VERBS.some((v) => respLower.includes(v));

  let score = 0.5;
  if (hasAck) score += 0.25;
  if (hasPivot) score += 0.25;
  if (violations.length > 0) score = Math.min(score, 0.3);

  return roundToStep(clamp(score));
}

// ---------------------------------------------------------------------------
// Dimension: personalization — does the response use context we know about
// the athlete? Sport, position, age band signals.
// ---------------------------------------------------------------------------

function scorePersonalization(
  turn: TurnCapture,
  ctx: AthleteContext
): number | null {
  const resp = turn.assistantResponse.toLowerCase();
  let signals = 0;
  let possible = 0;

  if (ctx.sport) {
    possible++;
    if (resp.includes(ctx.sport.toLowerCase())) signals++;
  }
  if (ctx.position) {
    possible++;
    if (resp.includes(ctx.position.toLowerCase())) signals++;
  }
  if (possible === 0) return null;

  return roundToStep(signals / possible);
}

// ---------------------------------------------------------------------------
// Dimension: actionability (conditional) — directive verb presence + a
// specific next step ("tomorrow", "this week", "next", "then").
// ---------------------------------------------------------------------------

function scoreActionability(
  turn: TurnCapture,
  actionTriggered: boolean
): number | null {
  if (!actionTriggered) return null;

  const resp = turn.assistantResponse.toLowerCase();
  const hasDirective = DIRECTIVE_VERBS.some((v) => resp.includes(v));
  const hasTiming =
    /\b(today|tomorrow|this week|next|then|after|before|mon|tue|wed|thu|fri|sat|sun)\b/i.test(
      turn.assistantResponse
    );
  const hasNumber = /\d/.test(turn.assistantResponse);

  let score = 0.0;
  if (hasDirective) score += 0.4;
  if (hasTiming) score += 0.3;
  if (hasNumber) score += 0.3;
  return roundToStep(clamp(score));
}

// ---------------------------------------------------------------------------
// Entry point — run Judge C end-to-end
// ---------------------------------------------------------------------------

export function runRuleJudge(
  turn: TurnCapture,
  ctx: AthleteContext,
  flags: { empathyTriggered: boolean; actionTriggered: boolean }
): RuleJudgeResult {
  const tone = scoreTone(turn);

  const scores: DimensionScores = {
    faithfulness: scoreFaithfulness(turn),
    answer_quality: scoreAnswerQuality(turn),
    tone: tone.score,
    age_fit: scoreAgeFit(turn, ctx),
    conversational: scoreConversational(turn),
    empathy: scoreEmpathy(turn, flags.empathyTriggered),
    personalization: scorePersonalization(turn, ctx),
    actionability: scoreActionability(turn, flags.actionTriggered),
  };

  return { scores, violations: tone.violations };
}

// Exported for unit-test + reuse.
export const _internals = {
  fleschKincaidGrade,
  sentences,
  words,
  rangeScore,
};

/** Required re-export so Dimension isn't flagged as unused in type-only files. */
export type { Dimension };
