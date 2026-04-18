import { z } from "zod";

export const checkinSchema = z.object({
  energy: z.number().min(1).max(10),
  soreness: z.number().min(1).max(10),
  painFlag: z.boolean(),
  painLocation: z.string().nullable().optional(),
  sleepHours: z.number().min(0).max(24),
  effortYesterday: z.number().min(1).max(10),
  mood: z.number().min(1).max(10),
  academicStress: z.number().min(1).max(10).nullable().optional(),
});

// ISO 8601 date (YYYY-MM-DD). Month + year precision is acceptable at
// the age gate (day defaults to 01 on the client) but the column is a
// proper DATE — keep the parse strict.
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
  message: "date_of_birth must be YYYY-MM-DD",
});

// ISO 3166-1 alpha-2 country code, uppercase. Resolved by the
// geo-region Edge Function before the age gate submits. The register
// route re-checks the request IP and overrides if they disagree — this
// field is a hint to the UI, never trusted as the security boundary.
const iso3166Alpha2 = z.string().length(2).regex(/^[A-Z]{2}$/);

export const registerSchema = z.object({
  name: z.string().min(1).max(100),
  sport: z.enum(["football", "soccer", "basketball", "tennis", "padel"]).optional(),
  dateOfBirth: isoDateSchema,
  role: z.enum(["player", "coach", "parent"]).optional().default("player"),
  displayRole: z.string().max(50).optional(),
  // Legal acceptance — must match the current served versions or the
  // route rejects with STALE_LEGAL_VERSION.
  tosVersion: z.string().min(1).max(32),
  privacyVersion: z.string().min(1).max(32),
  // Region hint from the geo-region Edge Function.
  regionCode: iso3166Alpha2.optional(),
});

export const inviteCodeSchema = z.object({
  targetRole: z.enum(["coach", "parent"]),
});

export const acceptInviteSchema = z.object({
  code: z.string().min(4).max(10),
});

export const createSuggestionSchema = z.object({
  playerId: z.string().uuid(),
  suggestionType: z.enum(["study_block", "exam_date", "test_result", "calendar_event"]),
  title: z.string().min(1).max(200),
  payload: z.record(z.string(), z.unknown()),
});

export const resolveSuggestionSchema = z.object({
  status: z.enum(["accepted", "edited", "declined"]),
  playerNotes: z.string().max(500).optional(),
});

// ── Phase 2: per-step onboarding persistence ─────────────────────
// The new player flow is 4 screens after AgeGate+Account: sport,
// position, heightWeight, goal. Every screen writes the user's
// answer to users.onboarding_state via /progress so a crash or
// app-switch resumes at the last unanswered step. Final submit
// goes through /finalize which materialises the answers into
// top-level users columns, fires the PHV event, and seeds My Rules.

export const ONBOARDING_STEPS = ['sport', 'position', 'heightWeight', 'goal'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

// A single step's answer shape. Each screen writes only its own
// fields; the server merges into the existing jsonb state.
export const onboardingAnswersSchema = z.object({
  sport: z.enum(["football", "soccer", "basketball", "tennis", "padel"]).optional(),
  position: z.string().max(32).optional(),
  heightCm: z.number().min(100).max(230).optional(),
  weightKg: z.number().min(25).max(180).optional(),
  primaryGoal: z
    .enum(["get_better", "stay_consistent", "recover", "get_recruited", "have_fun"])
    .optional(),
});

export const onboardingProgressSchema = z.object({
  step: z.enum(ONBOARDING_STEPS),
  answers: onboardingAnswersSchema,
});

// Finalize is strict: every required field must be present. We read
// the accumulated state and validate it here rather than trusting
// the client to re-send everything. Extra keys tolerated.
export const onboardingFinalizeSchema = z
  .object({
    sport: z.enum(["football", "soccer", "basketball", "tennis", "padel"]),
    position: z.string().min(1).max(32),
    heightCm: z.number().min(100).max(230),
    weightKg: z.number().min(25).max(180),
    primaryGoal: z.enum(["get_better", "stay_consistent", "recover", "get_recruited", "have_fun"]),
  })
  .passthrough();

export type OnboardingProgressInput = z.infer<typeof onboardingProgressSchema>;
export type OnboardingFinalizeInput = z.infer<typeof onboardingFinalizeSchema>;

// Legacy schema retained for /onboarding route backward-compat during
// the mobile rollout. New mobile clients hit /onboarding/progress +
// /onboarding/finalize instead.
export const onboardingSchema = z.object({
  sport: z.enum(["football", "soccer", "basketball", "tennis", "padel"]).optional(),
  age: z.number().int().min(8).max(50).optional(),
  schoolHours: z.number().min(0).max(16).nullable().optional(),
  examPeriods: z
    .array(
      z.object({
        name: z.string(),
        startDate: z.string(),
        endDate: z.string(),
      })
    )
    .nullable()
    .optional(),
  // New education fields
  educationType: z.enum(["school", "university"]).optional(),
  educationYear: z.number().int().min(1).max(12).optional(),
  // Profile fields
  height: z.number().min(50).max(250).optional(),
  weight: z.number().min(20).max(200).optional(),
  gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional(),
  primaryGoal: z.enum(["improve_fitness", "get_recruited", "recover_from_injury", "stay_consistent", "have_fun"]).optional(),
  position: z.string().max(50).optional(),
  playingStyle: z.string().max(50).optional(),
  selectedSports: z.array(z.string()).optional(),
  footballPosition: z.string().max(10).optional(),
  footballExperience: z.enum(["beginner", "intermediate", "advanced", "elite"]).optional(),
  footballCompetition: z.enum(["recreational", "club", "academy", "professional"]).optional(),
  footballSelfAssessment: z.record(z.string(), z.number()).optional(),
});

export const feedbackSchema = z.object({
  planId: z.string().uuid(),
  completed: z.boolean(),
  actualEffort: z.number().min(1).max(10).optional(),
  notes: z.string().max(500).optional(),
});

export const linkByEmailSchema = z.object({
  email: z.string().email(),
});

export const respondLinkSchema = z.object({
  action: z.enum(["accept", "decline"]),
});

export type CheckinInput = z.infer<typeof checkinSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type OnboardingInput = z.infer<typeof onboardingSchema>;
export type FeedbackInput = z.infer<typeof feedbackSchema>;
export type LinkByEmailInput = z.infer<typeof linkByEmailSchema>;
export type RespondLinkInput = z.infer<typeof respondLinkSchema>;
