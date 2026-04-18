/**
 * Seed My Rules (player_schedule_preferences) on onboarding finalize.
 *
 * Per the "My Rules is the core foundation" rule: every downstream
 * feature reads player_schedule_preferences first and cascades to
 * catalog defaults only when a field is empty. If we rely purely on
 * the table's column defaults, every new athlete lands with the same
 * Middle-East / football-optimised schedule — not teen-friendly for
 * a padel player in Europe.
 *
 * This seeder writes sport-aware + age-band-aware defaults. Anything
 * the athlete leaves blank (exam subjects, study subjects) stays
 * empty — they configure those later via My Rules.
 *
 * Idempotent: uses upsert keyed on user_id. Safe to re-run on resume.
 */
import { SupabaseClient } from "@supabase/supabase-js";
import { AgeBand } from "@/services/compliance";

type Sport = "football" | "soccer" | "basketball" | "tennis" | "padel";

type TrainingCategory = {
  id: string;
  label: string;
  icon: string;
  color: string;
  enabled: boolean;
  mode: "fixed_days" | "days_per_week";
  fixedDays: number[];
  daysPerWeek: number;
  sessionDuration: number;
  preferredTime: "morning" | "afternoon" | "evening";
};

// Sport-specific session time + duration defaults. Ages U13-U15 get
// shorter sessions and one fewer club day (per youth-training
// guidelines — avoid over-training during growth spurts).
function trainingCategoriesFor(sport: Sport, ageBand: AgeBand): TrainingCategory[] {
  const lightLoad = ageBand === "U13" || ageBand === "U15";

  const clubDefaults: Record<Sport, Partial<TrainingCategory>> = {
    football: {
      label: "Club / Academy",
      icon: "football-outline",
      fixedDays: lightLoad ? [1, 3] : [1, 3, 5],
      daysPerWeek: lightLoad ? 2 : 3,
      sessionDuration: lightLoad ? 75 : 90,
      preferredTime: "afternoon",
    },
    soccer: {
      label: "Club / Academy",
      icon: "football-outline",
      fixedDays: lightLoad ? [1, 3] : [1, 3, 5],
      daysPerWeek: lightLoad ? 2 : 3,
      sessionDuration: lightLoad ? 75 : 90,
      preferredTime: "afternoon",
    },
    basketball: {
      label: "Team Practice",
      icon: "basketball-outline",
      fixedDays: lightLoad ? [2, 4] : [2, 4, 6],
      daysPerWeek: lightLoad ? 2 : 3,
      sessionDuration: lightLoad ? 75 : 90,
      preferredTime: "afternoon",
    },
    tennis: {
      label: "Court Sessions",
      icon: "tennisball-outline",
      fixedDays: [0, 2, 4],
      daysPerWeek: 3,
      sessionDuration: lightLoad ? 60 : 75,
      preferredTime: "afternoon",
    },
    padel: {
      label: "Court Sessions",
      icon: "tennisball-outline",
      fixedDays: [5, 6],
      daysPerWeek: 2,
      sessionDuration: lightLoad ? 60 : 75,
      preferredTime: "afternoon",
    },
  };

  return [
    {
      id: "club",
      color: "#FF6B35",
      enabled: true,
      mode: "fixed_days",
      fixedDays: [],
      daysPerWeek: 3,
      sessionDuration: 90,
      preferredTime: "afternoon",
      label: "Club",
      icon: "football-outline",
      ...clubDefaults[sport],
    } as TrainingCategory,
    {
      id: "gym",
      label: lightLoad ? "Bodyweight + Mobility" : "Gym",
      icon: "barbell-outline",
      color: "#00D9FF",
      // U13/U15 avoid barbell work by default (PHV middleware enforces
      // anyway, but off-by-default removes the temptation).
      enabled: !lightLoad,
      mode: "days_per_week",
      fixedDays: [],
      daysPerWeek: lightLoad ? 1 : 2,
      sessionDuration: 45,
      preferredTime: "morning",
    },
    {
      id: "personal",
      label: "Personal",
      icon: "fitness-outline",
      color: "#30D158",
      enabled: false,
      mode: "days_per_week",
      fixedDays: [],
      daysPerWeek: 1,
      sessionDuration: 45,
      preferredTime: "evening",
    },
  ];
}

// Sport-neutral time defaults that depend only on age.
function sleepWindowFor(ageBand: AgeBand): { sleepStart: string; sleepEnd: string } {
  // Younger athletes default to earlier bed / longer sleep per
  // paediatric sleep recommendations (9+ hours U13, ~8.5 U15, 8 U17+).
  if (ageBand === "U13") return { sleepStart: "21:30", sleepEnd: "06:30" };
  if (ageBand === "U15") return { sleepStart: "22:00", sleepEnd: "06:30" };
  return { sleepStart: "22:00", sleepEnd: "06:00" };
}

export type SeedScheduleInput = {
  userId: string;
  sport: Sport;
  ageBand: AgeBand;
};

export async function seedSchedulePreferences(
  db: SupabaseClient,
  input: SeedScheduleInput
): Promise<void> {
  const { userId, sport, ageBand } = input;
  const sleep = sleepWindowFor(ageBand);
  const categories = trainingCategoriesFor(sport, ageBand);

  const { error } = await db
    .from("player_schedule_preferences")
    .upsert(
      {
        user_id: userId,
        sleep_start: sleep.sleepStart,
        sleep_end: sleep.sleepEnd,
        // day_bounds_* are derived from sleep — copy so downstream
        // consumers don't need to re-derive.
        day_bounds_start: sleep.sleepEnd,
        day_bounds_end: sleep.sleepStart,
        training_categories: categories,
        // Exam / study subjects intentionally left empty — athlete
        // configures via My Rules when they first toggle exam period.
        exam_subjects: [],
        study_subjects: [],
        exam_schedule: [],
        league_is_active: false,
        exam_period_active: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (error) {
    // Don't swallow — surface upstream so finalize can log but doesn't
    // hard-fail onboarding on a seeding hiccup (My Rules can be
    // configured later; blocking signup is worse).
    throw error;
  }
}
