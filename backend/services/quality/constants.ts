/**
 * Runtime constants derived from the voice / empathy / age-tone specs.
 *
 * Source of truth for the specs lives in `docs/`:
 *   - tomo-voice-spec.md
 *   - tomo-empathy-pattern.md
 *   - tomo-age-tone-profiles.md
 *
 * Update both places together.
 */

import type { AgeBand } from "./types";

// ---------------------------------------------------------------------------
// Voice spec — forbidden phrases (Tone judge, Judge C)
// ---------------------------------------------------------------------------

export const FORBIDDEN_PHRASE_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\bhow may i assist\b/i, label: "corporate_opener" },
  { re: /\bi'?d be (happy|glad|delighted) to\b/i, label: "corporate_opener" },
  { re: /\b(as|being) an ai( language model)?\b/i, label: "ai_self_reference" },
  { re: /\b(amazing|awesome) (work|job|effort)\b/i, label: "fake_hype" },
  { re: /\bgreat (question|point)\b/i, label: "filler_praise" },
  { re: /\byou'?ve got this\b/i, label: "fake_hype" },
  { re: /\bcrushing it\b/i, label: "fake_hype" },
  { re: /\bi hear you\b/i, label: "therapy_speak" },
  { re: /\bi understand how you feel\b/i, label: "therapy_speak" },
  { re: /\bthat sounds (really|so) tough\b/i, label: "therapy_speak" },
  { re: /\bi'?m here for you\b/i, label: "therapy_speak" },
  { re: /\bit'?s important to remember\b/i, label: "lecture_voice" },
  { re: /\bkey to success\b/i, label: "lecture_voice" },
  { re: /\bat the end of the day\b/i, label: "filler" },
  { re: /(amazing|awesome|fantastic|wonderful)!/i, label: "fake_hype" },
];

/** Filler-opener sentence starters — detected on the first sentence only. */
export const FILLER_OPENER_STARTS: RegExp[] = [
  /^(sure|absolutely|certainly|of course|happy to|glad to|great)[,.!\s]/i,
  /^(let me (help|assist)|i'?ll be happy)/i,
  /^(that'?s a great|that'?s a really good)/i,
];

// ---------------------------------------------------------------------------
// Voice spec — preferred coach lexicon (Tone judge bonus)
// ---------------------------------------------------------------------------

export const COACH_VERBS = [
  "push", "reset", "reload", "recover", "dial in", "shake off", "lock in",
  "build", "taper", "peak", "unload", "deload", "ramp", "sharpen", "tune",
  "progress", "regress", "hold", "repeat",
];

export const DIRECTIVE_VERBS = [
  "do", "try", "skip", "swap", "add", "drop", "keep", "move to", "shift to",
  "aim for", "hit", "target",
];

// ---------------------------------------------------------------------------
// Empathy triggers
// ---------------------------------------------------------------------------

/** Trigger A — direct emotion lexicon. */
export const EMOTION_LEXICON = /\b(frustrated|frustrating|pissed|angry|furious|gutted|crushed|devastated|scared|terrified|anxious|worried|nervous|stressed|overwhelmed|panicking|hate|hated|hating|sick of|tired of|fed up|done with|can'?t (do|handle|deal|cope|take) (it|this|any ?more)|giving up|want to quit|thinking of quitting|exhausted|drained|burnt out|burned out|embarrassed|humiliated|ashamed|lonely|no one (gets|understands)|confused|don'?t know what to do|hopeless|pointless|what'?s the point)\b/i;

/** Trigger B — pain / injury disclosure. */
export const PAIN_LEXICON = /\b(hurts|hurting|sore|tight|pulled|tweaked|strained|sharp pain|aching|can'?t (walk|run|move|lift)|something popped|knee gave|rolled my ankle|been (hurting|sore) for)\b/i;

/**
 * Trigger C — life-context stress. Narrower than v1 of the spec to avoid
 * false positives on e.g. bare "parents" or "exam" (fitness test). Requires
 * co-occurrence of the noun with a stress verb or clear-stress phrase.
 */
export const LIFE_STRESS_LEXICON = /\b(exam (stress|pressure|week|anxiety|coming up|tomorrow|next week)|finals|midterm pressure|school (stress|pressure|load|overwhelming)|(parents|dad|mum|mom) (won'?t|doesn'?t|don'?t|hate|fighting|pressure|arguing|angry at)|coach (benched|dropped|picked|won'?t play|cut|yelled|said i)|didn'?t make (the team|selection|the squad|cut)|cut from (the team|selection))\b/i;

// ---------------------------------------------------------------------------
// Action triggers (actionability dimension only graded when athlete is
// seeking direction — heuristic pattern on the user turn)
// ---------------------------------------------------------------------------

export const ACTION_SEEKING_LEXICON = /\b(what should i (do|eat|train|try)|how (do|should) i|should i (do|eat|train|skip|push|rest)|help me|give me a|plan for|what'?s the best way|how can i|can you (build|make|give|plan|set up|write)|build me|make me|design me|what do i do|i need (a|to))\b/i;

// ---------------------------------------------------------------------------
// Age Fit — numeric targets per band (source: tomo-age-tone-profiles.md)
// ---------------------------------------------------------------------------

export interface AgeBandTargets {
  sentenceWordCount: { min: number; max: number };
  fkGrade: { min: number; max: number };
  conceptCap: number; // approximated by paragraph count
}

export const AGE_BAND_TARGETS: Record<AgeBand, AgeBandTargets> = {
  u13:      { sentenceWordCount: { min: 8, max: 12 }, fkGrade: { min: 3, max: 5 },  conceptCap: 1 },
  u15:      { sentenceWordCount: { min: 10, max: 16 }, fkGrade: { min: 5, max: 7 },  conceptCap: 2 },
  u17:      { sentenceWordCount: { min: 12, max: 20 }, fkGrade: { min: 7, max: 9 },  conceptCap: 3 },
  u19_plus: { sentenceWordCount: { min: 12, max: 30 }, fkGrade: { min: 9, max: 12 }, conceptCap: 10 },
  unknown:  { sentenceWordCount: { min: 10, max: 20 }, fkGrade: { min: 6, max: 10 }, conceptCap: 3 },
};

// ---------------------------------------------------------------------------
// Per-age-band forbidden vocabulary for the Age Fit judge (rule component)
// ---------------------------------------------------------------------------

/** Acronyms and physiology terms banned for U13 responses. */
export const U13_FORBIDDEN_TERMS = /\b(ACWR|RPE|PHV|HRV|1RM|ROM|VO2|Z[1-5]|lactate|mitochondri[ao]n?|glycogen|cortisol|anaerobic|aerobic threshold|neuromuscular|CNS fatigue|chronic|acute ratio)\b/i;

/** Same list minus a few permitted at U15 (PB, RPE OK). */
export const U15_FORBIDDEN_TERMS = /\b(ACWR|PHV|HRV|1RM|VO2|mitochondri[ao]n?|glycogen|cortisol|neuromuscular|CNS fatigue|chronic.acute ratio)\b/i;

// ---------------------------------------------------------------------------
// Turn length caps (Tone judge — length discipline)
// ---------------------------------------------------------------------------

/** Max sentence count before we count it as over-long without being asked. */
export const TURN_LENGTH_CAPS = {
  factualLookup: 2,
  directive: 5,
  explanation: 8,
};

// ---------------------------------------------------------------------------
// Pricing hint for Judge A (Haiku) cost tracking.
// Authoritative source: trackedClaudeCall.ts. Mirrored here for
// internal cost estimates when a trackedClaudeCall is not used.
// ---------------------------------------------------------------------------

export const HAIKU_MODEL = "claude-haiku-4-5-20251001";
