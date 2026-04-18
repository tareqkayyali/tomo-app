// Age-tier derivation for Triangle compliance authority.
//
// Age-tier is ORTHOGONAL to age-band. Age-band (U13/U15/U17/U19/U21/SEN/VET)
// drives athletic cohort bucketing — benchmarks, training prescriptions,
// peer comparison. Age-tier (T1/T2/T3) drives compliance authority —
// who has approval power over training decisions, which consent flow
// applies, and how visibility defaults.
//
//   T1  < 13       COPPA. Parent is verifiable consent holder.
//                  All writes gated until parental consent.
//   T2  13–15      GDPR-K locked 16 EU-wide + youth sport governance.
//                  Parent approval required for training-plan changes;
//                  parent supersedes coach on decisions.
//   T3  ≥ 16       Self-consent. Parent visibility is athlete-preference
//                  driven per domain (training/academic/wellbeing/…)
//
//   UNKNOWN        DOB not set. Treated conservatively as T2 by callers
//                  (Apple 5.1.4 "treat as child if age unknown").
//
// Keep in sync with SQL function `public.get_age_tier(dob)` in migration
// 00000000000063. The SQL function is the source of truth for RLS and
// views; this TS copy is the source of truth for application logic and
// the two are asserted equal by the ageTier test suite's parity block.
//
// Pure. Zero I/O. Safe to import from hot paths.

import { ageFromDob } from "./index";

export type AgeTier = "T1" | "T2" | "T3" | "UNKNOWN";

export function ageTierFromAge(age: number | null): AgeTier {
  if (age === null || Number.isNaN(age) || age < 0) return "UNKNOWN";
  if (age < 13) return "T1";
  if (age < 16) return "T2";
  return "T3";
}

export function ageTierFromDob(dob: Date | null, now: Date = new Date()): AgeTier {
  if (!dob) return "UNKNOWN";
  return ageTierFromAge(ageFromDob(dob, now));
}

// Apple 5.1.4: if a user's tier is unknown we do NOT silently fall through
// to T3 — we escalate to the strictest tier that still allows the user to
// use the app. T2 is the conservative default: requires consent but does
// not hard-block signup.
export function effectiveTier(tier: AgeTier): Exclude<AgeTier, "UNKNOWN"> {
  return tier === "UNKNOWN" ? "T2" : tier;
}

// Does this tier require parental authority over training decisions?
// True for T1 and T2; false for T3 unless athlete preference opts in.
export function requiresParentalAuthority(tier: AgeTier): boolean {
  return effectiveTier(tier) !== "T3";
}

// Does parent supersede coach for this tier?
// True for T1 and T2 per the locked Triangle compliance rules.
export function parentSupersedesCoach(tier: AgeTier): boolean {
  return effectiveTier(tier) !== "T3";
}
