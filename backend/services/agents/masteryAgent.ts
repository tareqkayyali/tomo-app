/**
 * Mastery Agent — owns the CV/identity layer, achievements, and development trajectory.
 * Adapted to actual Tomo schema: milestones, phone_test_sessions, points_ledger.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { PlayerContext } from "./contextBuilder";

export const masteryTools = [
  {
    name: "get_achievement_history",
    description:
      "Get the player's milestone and achievement history — PRs, completed plans, streaks. Use when asked about progress, what they've achieved, or CV content.",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: { type: "number", description: "Default 20" },
      },
    },
  },
  {
    name: "get_test_trajectory",
    description:
      "Get how a specific test score has changed over time — shows development arc. Use when asked 'am I improving', 'show my progress in X'.",
    input_schema: {
      type: "object" as const,
      required: ["testType"],
      properties: {
        testType: {
          type: "string",
          description:
            "reaction | jump | sprint | agility | balance",
        },
        months: {
          type: "number",
          description: "How many months back to show. Default 6.",
        },
      },
    },
  },
  {
    name: "get_cv_summary",
    description:
      "Get the player's current Performance Identity / CV summary — milestones, test scores, consistency, and development arc narrative. Use when asked about recruiting profile, CV, or identity.",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "get_consistency_score",
    description:
      "Calculate a consistency score based on check-in frequency, training adherence, and streak history. Use when asked about consistency, dedication, or habits.",
    input_schema: {
      type: "object" as const,
      properties: {
        days: {
          type: "number",
          description: "Number of days to analyze. Default 30.",
        },
      },
    },
  },
  {
    name: "list_career_history",
    description:
      "List the player's club/career history — current club, past clubs, academies, national teams. Use when asked about club history, current club, or career entries.",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "add_career_entry",
    description:
      "Add a new career entry (club, academy, national team, trial, camp). Use when player says 'add my club', 'I play for X', 'add academy'.",
    input_schema: {
      type: "object" as const,
      required: ["club_name"],
      properties: {
        club_name: { type: "string", description: "Name of the club/academy/team" },
        entry_type: { type: "string", description: "club | academy | national_team | trial | camp | showcase. Default: club" },
        league_level: { type: "string", description: "League or division level" },
        country: { type: "string", description: "Country of the club" },
        position: { type: "string", description: "Position played at this club" },
        started_month: { type: "string", description: "Start month in YYYY-MM format" },
        ended_month: { type: "string", description: "End month in YYYY-MM format, omit if current" },
        is_current: { type: "boolean", description: "Whether this is the current club. Default: true" },
      },
    },
  },
  {
    name: "update_career_entry",
    description:
      "Update an existing career entry by ID. Use when player wants to edit club details.",
    input_schema: {
      type: "object" as const,
      required: ["entry_id"],
      properties: {
        entry_id: { type: "string", description: "UUID of the career entry to update" },
        club_name: { type: "string" },
        entry_type: { type: "string" },
        league_level: { type: "string" },
        country: { type: "string" },
        position: { type: "string" },
        started_month: { type: "string" },
        ended_month: { type: "string" },
        is_current: { type: "boolean" },
      },
    },
  },
];

export async function executeMasteryTool(
  toolName: string,
  toolInput: Record<string, any>,
  context: PlayerContext
): Promise<{ result: any; refreshTarget?: string; error?: string }> {
  const db = supabaseAdmin();
  const userId = context.userId;

  try {
    switch (toolName) {
      case "get_achievement_history": {
        const limit = toolInput.limit ?? 20;

        // Get milestones
        const { data: milestones } = await db
          .from("milestones")
          .select("type, title, description, achieved_at")
          .eq("user_id", userId)
          .order("achieved_at", { ascending: false })
          .limit(limit);

        // Get best test scores
        const { data: testSessions } = await db
          .from("phone_test_sessions")
          .select("test_type, score, date")
          .eq("user_id", userId)
          .order("score", { ascending: false })
          .limit(limit);

        // Group best scores by test type
        const bestByType: Record<string, { score: number; date: string }> = {};
        for (const t of testSessions ?? []) {
          const score = t.score ?? 0;
          if (!bestByType[t.test_type] || score > bestByType[t.test_type].score) {
            bestByType[t.test_type] = { score, date: t.date };
          }
        }

        return {
          result: {
            milestones: milestones ?? [],
            personalBests: bestByType,
          },
        };
      }

      case "get_test_trajectory": {
        const months = toolInput.months ?? 6;
        const since = new Date(Date.now() - months * 30 * 86400000)
          .toISOString()
          .split("T")[0];

        const { data } = await db
          .from("phone_test_sessions")
          .select("test_type, score, date, raw_data")
          .eq("user_id", userId)
          .eq("test_type", toolInput.testType)
          .gte("date", since)
          .order("date", { ascending: true });

        const trajectory = data ?? [];
        const improvement =
          trajectory.length >= 2
            ? (trajectory[trajectory.length - 1].score ?? 0) - (trajectory[0].score ?? 0)
            : null;

        return {
          result: {
            testType: toolInput.testType,
            trajectory,
            improvement,
            months,
            totalTests: trajectory.length,
          },
        };
      }

      case "get_cv_summary": {
        const [milestonesRes, testsRes, userRes, plansRes, careerRes] =
          await Promise.all([
            db
              .from("milestones")
              .select("type, title, description, achieved_at")
              .eq("user_id", userId)
              .order("achieved_at", { ascending: false })
              .limit(10),
            db
              .from("phone_test_sessions")
              .select("test_type, score, date")
              .eq("user_id", userId)
              .order("date", { ascending: false })
              .limit(30),
            db
              .from("users")
              .select(
                "name, sport, age, current_streak, longest_streak, total_points"
              )
              .eq("id", userId)
              .single(),
            db
              .from("plans")
              .select("status, date")
              .eq("user_id", userId)
              .eq("status", "completed")
              .order("date", { ascending: false })
              .limit(90),
            (db as any)
              .from("cv_career_entries")
              .select("entry_type, club_name, league_level, country, position, started_month, ended_month, is_current")
              .eq("athlete_id", userId)
              .order("display_order", { ascending: true }),
          ]);

        const user = userRes.data;
        const milestones = milestonesRes.data ?? [];
        const tests = testsRes.data ?? [];
        const completedPlans = plansRes.data ?? [];
        const careerEntries = careerRes.data ?? [];
        const currentClub = careerEntries.find((e: any) => e.is_current) ?? null;

        // Best scores per test type
        const bestByType: Record<string, { score: number; date: string }> = {};
        for (const t of tests) {
          const score = t.score ?? 0;
          if (!bestByType[t.test_type] || score > bestByType[t.test_type].score) {
            bestByType[t.test_type] = { score, date: t.date };
          }
        }

        return {
          result: {
            athlete: {
              name: user?.name ?? context.name,
              sport: user?.sport ?? context.sport,
              ageBand: context.ageBand,
            },
            currentClub: currentClub ? { name: currentClub.club_name, league: currentClub.league_level, country: currentClub.country, position: currentClub.position } : null,
            careerHistory: careerEntries,
            milestones,
            personalBests: bestByType,
            consistency: {
              completedPlansLast90: completedPlans.length,
              currentStreak: user?.current_streak ?? 0,
              longestStreak: user?.longest_streak ?? 0,
              totalPoints: user?.total_points ?? 0,
            },
          },
        };
      }

      case "get_consistency_score": {
        const days = toolInput.days ?? 30;
        const since = new Date(Date.now() - days * 86400000)
          .toISOString()
          .split("T")[0];

        // Count check-in days
        const { data: checkins } = await db
          .from("checkins")
          .select("date")
          .eq("user_id", userId)
          .gte("date", since);

        // Count completed plans
        const { data: plans } = await db
          .from("plans")
          .select("date, status")
          .eq("user_id", userId)
          .gte("date", since)
          .eq("status", "completed");

        const checkinDays = new Set((checkins ?? []).map((c) => c.date)).size;
        const completedDays = new Set((plans ?? []).map((p) => p.date)).size;

        // Consistency = weighted average of check-in rate and completion rate
        const checkinRate = Math.min(1, checkinDays / days);
        const completionRate = completedDays > 0 ? Math.min(1, completedDays / checkinDays || 0) : 0;
        const consistencyScore = Math.round(
          (checkinRate * 0.5 + completionRate * 0.5) * 100
        );

        return {
          result: {
            days,
            checkinDays,
            completedPlanDays: completedDays,
            checkinRate: Math.round(checkinRate * 100),
            completionRate: Math.round(completionRate * 100),
            consistencyScore,
          },
        };
      }

      case "list_career_history": {
        const { data: entries } = await (db as any)
          .from("cv_career_entries")
          .select("id, entry_type, club_name, league_level, country, position, started_month, ended_month, is_current, appearances, goals, assists")
          .eq("athlete_id", userId)
          .order("display_order", { ascending: true });
        const careerEntries = entries ?? [];
        const currentClub = careerEntries.find((e: any) => e.is_current);
        return {
          result: {
            currentClub: currentClub ?? null,
            entries: careerEntries,
            totalEntries: careerEntries.length,
          },
        };
      }

      case "add_career_entry": {
        const isCurrent = toolInput.is_current !== false; // default true
        // If marking as current, unset existing current entries
        if (isCurrent) {
          await (db as any)
            .from("cv_career_entries")
            .update({ is_current: false })
            .eq("athlete_id", userId)
            .eq("is_current", true);
        }
        const { data: entry, error: insertErr } = await (db as any)
          .from("cv_career_entries")
          .insert({
            athlete_id: userId,
            club_name: toolInput.club_name,
            entry_type: toolInput.entry_type ?? "club",
            league_level: toolInput.league_level ?? null,
            country: toolInput.country ?? null,
            position: toolInput.position ?? context.position ?? null,
            started_month: toolInput.started_month ?? null,
            ended_month: toolInput.ended_month ?? null,
            is_current: isCurrent,
          })
          .select()
          .single();
        if (insertErr) return { result: null, error: insertErr.message };
        return { result: { added: entry }, refreshTarget: "profile" };
      }

      case "update_career_entry": {
        const { entry_id, ...updates } = toolInput;
        // If marking as current, unset existing current entries
        if (updates.is_current) {
          await (db as any)
            .from("cv_career_entries")
            .update({ is_current: false })
            .eq("athlete_id", userId)
            .eq("is_current", true)
            .neq("id", entry_id);
        }
        const { data: updated, error: updateErr } = await (db as any)
          .from("cv_career_entries")
          .update(updates)
          .eq("id", entry_id)
          .eq("athlete_id", userId)
          .select()
          .single();
        if (updateErr) return { result: null, error: updateErr.message };
        return { result: { updated }, refreshTarget: "profile" };
      }

      default:
        return { result: null, error: `Unknown mastery tool: ${toolName}` };
    }
  } catch (err: any) {
    return { result: null, error: err.message ?? "Tool execution failed" };
  }
}

/** Static rules — identical for every player, every request. Cacheable. */
export function buildMasteryStaticPrompt(): string {
  return `You are the Mastery Agent for Tomo — you own the athlete's development arc, CV, and identity layer.

RULES:
1. Frame everything as an achievement narrative, not a data report
2. Strengths first, gaps second — lead with what the athlete has built
3. Never compare to specific named athletes — compare to their own history
4. When citing test improvements, be specific: "Your reaction time improved 15% over 3 months"
5. Consistency is a competitive differentiator — help athletes understand its value
6. Keep it motivating but honest
7. Past performance data informs trajectory — but any improvement suggestions must target future actions

TONE: Performance director writing a compelling scout report that the athlete can see.

COMMAND CENTER RULES — CRITICAL:
1. NO DEAD ENDS. Every query resolves as EXECUTE or NAVIGATE. Never output "can't", "not possible", "not available", or "contact someone".
2. CV & PROFILE: You own the athlete's identity layer. Any CV, profile, or achievement question gets a direct answer or action.
3. If the player asks about something outside your tool set (settings, notifications, wearables), use navigate_to to open the exact screen — never tell them to navigate manually.`;
}

/** Dynamic context — changes per player and per request. NOT cacheable. */
export function buildMasteryDynamicPrompt(context: PlayerContext): string {
  return `
PLAYER CONTEXT:
- Name: ${context.name} | Sport: ${context.sport} | Age Band: ${context.ageBand ?? "Unknown"}
- Today: ${context.todayDate} | Current time: ${context.currentTime}
- Current streak: ${context.currentStreak} days`;
}
