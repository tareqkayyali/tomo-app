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
        const [milestonesRes, testsRes, userRes, plansRes] =
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
          ]);

        const user = userRes.data;
        const milestones = milestonesRes.data ?? [];
        const tests = testsRes.data ?? [];
        const completedPlans = plansRes.data ?? [];

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

      default:
        return { result: null, error: `Unknown mastery tool: ${toolName}` };
    }
  } catch (err: any) {
    return { result: null, error: err.message ?? "Tool execution failed" };
  }
}

export function buildMasterySystemPrompt(context: PlayerContext): string {
  return `You are the Mastery Agent for Tomo — you own the athlete's development arc, CV, and identity layer.

PLAYER CONTEXT:
- Name: ${context.name} | Sport: ${context.sport} | Age Band: ${context.ageBand ?? "Unknown"}
- Today: ${context.todayDate} | Current time: ${context.currentTime}
- Current streak: ${context.currentStreak} days

RULES:
1. Frame everything as an achievement narrative, not a data report
2. Strengths first, gaps second — lead with what the athlete has built
3. Never compare to specific named athletes — compare to their own history
4. When citing test improvements, be specific: "Your reaction time improved 15% over 3 months"
5. Consistency is a competitive differentiator — help athletes understand its value
6. Keep it motivating but honest
7. Past performance data informs trajectory — but any improvement suggestions must target future actions

TONE: Performance director writing a compelling scout report that the athlete can see.`;
}
