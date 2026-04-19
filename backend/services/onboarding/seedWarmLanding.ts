/**
 * Seed Warm Landing
 *
 * Phase 4: the moment onboarding finishes is where new users bail if
 * every tab is empty. This seeder writes three starter dashboard
 * recommendations and one "your first week" training suggestion so
 * the first-session experience feels like Tomo already knows them —
 * no AI cost on landing.
 *
 * Called from /api/v1/user/onboarding/finalize. Errors here are
 * logged but non-fatal — a missed warm landing is worse UX but
 * blocking onboarding on a seeding hiccup is worse still.
 *
 * Idempotent-ish: we insert fresh rows each call, so if finalize
 * retries (rare), the user may see duplicates. Protected by the
 * `onboarding_complete` check in the route — finalize is a one-shot.
 */
import { SupabaseClient } from "@supabase/supabase-js";
import { AgeBand } from "@/services/compliance";

type Sport = "football" | "soccer" | "basketball" | "tennis" | "padel";

type Rec = {
  rec_type:
    | "READINESS"
    | "LOAD_WARNING"
    | "RECOVERY"
    | "DEVELOPMENT"
    | "ACADEMIC"
    | "CV_OPPORTUNITY"
    | "TRIANGLE_ALERT"
    | "MOTIVATION";
  priority: 1 | 2 | 3 | 4;
  title: string;
  body_short: string;
  body_long?: string;
  context: Record<string, unknown>;
  expires_at?: string;
};

function starterRecs(sport: Sport, ageBand: AgeBand): Rec[] {
  const inSevenDays = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

  const firstBenchmark: Record<Sport, { name: string; testKey: string }> = {
    football: { name: "20 m sprint", testKey: "sprint_20m" },
    soccer: { name: "20 m sprint", testKey: "sprint_20m" },
    basketball: { name: "Standing vertical jump", testKey: "vertical_jump" },
    tennis: { name: "T-test agility", testKey: "t_test" },
    padel: { name: "T-test agility", testKey: "t_test" },
  };

  const lightLoad = ageBand === "U13" || ageBand === "U15";

  return [
    {
      rec_type: "MOTIVATION",
      priority: 2,
      title: "Do your first check-in",
      body_short:
        "30 seconds — tell Tomo how you slept and feel. Unlocks today's readiness rating.",
      body_long:
        "Check-ins are how Tomo spots when you're red (rest), yellow (go easy), or green (push it). One per day, any time before training.",
      context: { action: "checkin", icon: "heart-outline" },
      expires_at: inSevenDays,
    },
    {
      rec_type: "DEVELOPMENT",
      priority: 3,
      title: `Try your first ${firstBenchmark[sport].name}`,
      body_short:
        "A quick on-phone test gives Tomo a baseline so it can show you real progress.",
      body_long:
        "This is your starting line. Everything Tomo suggests from here — session plans, recovery windows, stretch goals — ladders off this number.",
      context: {
        action: "benchmark_test",
        testKey: firstBenchmark[sport].testKey,
        icon: "timer-outline",
      },
      expires_at: inSevenDays,
    },
    {
      rec_type: "ACADEMIC",
      priority: 3,
      title: lightLoad ? "Tell Tomo your school hours" : "Set your school + exam window",
      body_short:
        "So Tomo can plan around your week without clashing with classes or revision.",
      body_long:
        "My Rules → School / Exams. Takes less than a minute. Tomo will space your training + study automatically.",
      context: { action: "my_rules", tab: "school", icon: "school-outline" },
      expires_at: inSevenDays,
    },
  ];
}

export async function seedWarmLanding(
  db: SupabaseClient,
  input: { userId: string; sport: Sport; ageBand: AgeBand }
): Promise<{ inserted: number }> {
  const now = new Date().toISOString();
  const recs = starterRecs(input.sport, input.ageBand).map((r) => ({
    athlete_id: input.userId,
    rec_type: r.rec_type,
    priority: r.priority,
    status: "PENDING",
    title: r.title,
    body_short: r.body_short,
    body_long: r.body_long ?? null,
    confidence_score: 1.0,
    evidence_basis: { source: "warm_landing_seed" },
    context: r.context,
    visible_to_athlete: true,
    visible_to_coach: false,
    visible_to_parent: false,
    created_at: now,
    expires_at: r.expires_at ?? null,
  }));

  const { error, count } = await db
    .from("athlete_recommendations")
    .insert(recs, { count: "exact" });

  if (error) throw error;
  return { inserted: count ?? recs.length };
}
