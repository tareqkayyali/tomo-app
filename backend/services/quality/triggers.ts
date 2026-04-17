/**
 * Conditional-dimension triggers.
 *
 * The Empathy and Actionability dimensions are only graded when the athlete's
 * turn hits a trigger. Otherwise they grade null (excluded from aggregates).
 *
 * See docs/tomo-empathy-pattern.md for the canonical trigger list.
 */

import {
  EMOTION_LEXICON,
  PAIN_LEXICON,
  LIFE_STRESS_LEXICON,
  ACTION_SEEKING_LEXICON,
} from "./constants";
import type { EmpathyTriggerResult, ActionTriggerResult } from "./types";

export function detectEmpathyTrigger(userMessage: string): EmpathyTriggerResult {
  const matched: string[] = [];

  const emo = userMessage.match(EMOTION_LEXICON);
  if (emo) matched.push(`emotion:${emo[0]}`);

  const pain = userMessage.match(PAIN_LEXICON);
  if (pain) matched.push(`pain:${pain[0]}`);

  const life = userMessage.match(LIFE_STRESS_LEXICON);
  if (life) matched.push(`life:${life[0]}`);

  return { triggered: matched.length > 0, matched };
}

export function detectActionTrigger(userMessage: string): ActionTriggerResult {
  const m = userMessage.match(ACTION_SEEKING_LEXICON);
  return {
    triggered: m !== null,
    matched: m ? [m[0]] : [],
  };
}
