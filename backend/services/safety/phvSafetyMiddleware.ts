/**
 * PHV Safety Middleware
 *
 * Phase 3 protection: blocks high-risk strength exercises for
 * athletes in the Mid-PHV growth stage (peak height velocity ~12-14,
 * growth-plate injury risk elevated).
 *
 * Until now these rules lived as system-prompt comments in
 * orchestrator.ts — LLMs don't obey them reliably. This middleware
 * enforces them on the write path so the guarantee holds regardless
 * of what the AI suggests or the user types.
 *
 * Scope:
 *   - Training calendar events only. Non-training events and
 *     non-Mid-PHV athletes pass through.
 *   - Name + notes are scanned case-insensitively against a small
 *     keyword set (Olympic lifts, heavy barbell squat/deadlift,
 *     depth drops). False positives are acceptable here — the
 *     response explains what to do instead.
 *
 * Returns `{ ok: true }` on allow, or `{ ok: false, code, reason,
 * suggestion }` on block. Callers should return 400 with the payload.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type PHVStage =
  | "pre_phv"
  | "mid_phv"
  | "post_phv"
  | "not_applicable"
  | "unknown";

export type PHVSafetyCheckInput = {
  userId: string;
  eventType: string | null; // calendar_events.event_type
  name: string | null;
  notes?: string | null;
};

export type PHVSafetyResult =
  | { ok: true }
  | {
      ok: false;
      code: "UNSAFE_FOR_MID_PHV";
      reason: string;
      suggestion: string;
      matchedKeyword: string;
    };

// Keyword patterns we block for Mid-PHV. Keep the list tight and
// focused on heavy-barbell + plyometric-drop work. Each entry is a
// lowercase substring — exact-phrase enough to avoid hitting "squat
// jumps" (bodyweight, fine) while catching "back squat" (heavy).
const MID_PHV_BLOCK_KEYWORDS: Array<{
  keyword: string;
  suggestion: string;
}> = [
  // Heavy barbell lower body
  { keyword: "back squat", suggestion: "goblet squat or split squat" },
  { keyword: "front squat", suggestion: "goblet squat" },
  { keyword: "barbell squat", suggestion: "goblet squat or bodyweight squat" },
  { keyword: "deadlift", suggestion: "hip hinge with kettlebell or trap bar" },
  { keyword: "romanian deadlift", suggestion: "single-leg RDL bodyweight" },
  { keyword: "heavy squat", suggestion: "bodyweight squats or goblet squat" },
  // Olympic lifts
  { keyword: "clean and jerk", suggestion: "dumbbell push press" },
  { keyword: "power clean", suggestion: "medicine-ball clean or broad jump" },
  { keyword: "hang clean", suggestion: "medicine-ball throw" },
  { keyword: "snatch", suggestion: "kettlebell swing" },
  // Depth work / high-impact plyometrics
  { keyword: "depth jump", suggestion: "broad jump or low box step-down" },
  { keyword: "depth drop", suggestion: "low box step-down" },
];

/**
 * Read the athlete's PHV stage from athlete_snapshots. Returns
 * 'unknown' on any failure so downstream callers default-allow.
 */
export async function fetchPHVStage(
  db: SupabaseClient,
  userId: string
): Promise<PHVStage> {
  try {
    const { data } = await db
      .from("athlete_snapshots")
      .select("phv_stage")
      .eq("athlete_id", userId)
      .maybeSingle();
    if (!data) return "unknown";
    const stage = (data as { phv_stage?: string | null }).phv_stage;
    if (
      stage === "pre_phv" ||
      stage === "mid_phv" ||
      stage === "post_phv" ||
      stage === "not_applicable"
    ) {
      return stage;
    }
    return "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Core guard. Given a calendar event payload, decide if it's safe
 * to write for this athlete.
 */
export async function checkPHVSafety(
  db: SupabaseClient,
  input: PHVSafetyCheckInput
): Promise<PHVSafetyResult> {
  // Only gate training events. Match, recovery, study, exam, other
  // can't contain strength work (by schema).
  if (input.eventType && input.eventType !== "training") return { ok: true };

  const stage = await fetchPHVStage(db, input.userId);
  if (stage !== "mid_phv") return { ok: true };

  const haystack = `${input.name ?? ""} ${input.notes ?? ""}`.toLowerCase();
  if (!haystack.trim()) return { ok: true };

  for (const rule of MID_PHV_BLOCK_KEYWORDS) {
    if (haystack.includes(rule.keyword)) {
      return {
        ok: false,
        code: "UNSAFE_FOR_MID_PHV",
        reason:
          "You're in a growth phase right now, so heavy-barbell and depth-drop work is blocked — your growth plates are more sensitive until post-PHV.",
        suggestion: `Try ${rule.suggestion} instead.`,
        matchedKeyword: rule.keyword,
      };
    }
  }
  return { ok: true };
}
