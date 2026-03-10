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
  sport: z.enum(["soccer", "basketball", "tennis", "padel"]),
  age: z.number().int().min(10).max(50).optional(),
});

export const onboardingSchema = z.object({
  sport: z.enum(["soccer", "basketball", "tennis", "padel"]).optional(),
  age: z.number().int().min(10).max(50).optional(),
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
});

export const feedbackSchema = z.object({
  planId: z.string().uuid(),
  completed: z.boolean(),
  actualEffort: z.number().min(1).max(10).optional(),
  notes: z.string().max(500).optional(),
});

export type CheckinInput = z.infer<typeof checkinSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type OnboardingInput = z.infer<typeof onboardingSchema>;
export type FeedbackInput = z.infer<typeof feedbackSchema>;
