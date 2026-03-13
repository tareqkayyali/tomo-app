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

export const registerSchema = z.object({
  name: z.string().min(1).max(100),
  sport: z.enum(["football", "soccer", "basketball", "tennis", "padel"]).optional(),
  age: z.number().int().min(8).max(50).optional(),
  role: z.enum(["player", "coach", "parent"]).optional().default("player"),
  displayRole: z.string().max(50).optional(),
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
