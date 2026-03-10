/**
 * Tool Executor for Claude AI Coach
 * Executes tool calls by querying Supabase directly.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { ArchetypeInfo, type Archetype } from "@/types";

export async function executeToolCall(
  userId: string,
  toolName: string,
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const db = supabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);

  try {
    switch (toolName) {
      case "get_athlete_profile": {
        const { data: user } = await db
          .from("users")
          .select("*")
          .eq("id", userId)
          .single();

        if (!user) return { error: "User profile not found" };

        const archetypeDetail = user.archetype
          ? ArchetypeInfo[user.archetype as Archetype]
          : null;

        return {
          name: user.name,
          age: user.age,
          sport: user.sport,
          archetype: user.archetype,
          archetypeInfo: archetypeDetail
            ? {
                name: archetypeDetail.name,
                emoji: archetypeDetail.emoji,
                description: archetypeDetail.description,
                fatalFlaw: archetypeDetail.fatalFlaw,
              }
            : null,
          currentStreak: user.current_streak,
          longestStreak: user.longest_streak,
          totalPoints: user.total_points,
          daysSinceRest: user.days_since_rest,
        };
      }

      case "get_recent_checkins": {
        const days = Math.min((input.days as number) || 7, 30);
        const { data: checkins } = await db
          .from("checkins")
          .select("*")
          .eq("user_id", userId)
          .order("date", { ascending: false })
          .limit(days);

        return {
          count: checkins?.length || 0,
          checkins: (checkins || []).map((c) => ({
            date: c.date,
            energy: c.energy,
            soreness: c.soreness,
            sleepHours: c.sleep_hours,
            painFlag: c.pain_flag,
            painLocation: c.pain_location,
            readiness: c.readiness,
            effortYesterday: c.effort_yesterday,
            mood: c.mood,
            academicStress: c.academic_stress,
          })),
        };
      }

      case "get_today_plan": {
        const { data: plan } = await db
          .from("plans")
          .select("*")
          .eq("user_id", userId)
          .eq("date", today)
          .single();

        if (!plan)
          return { message: "No plan for today. Athlete has not checked in yet." };

        return {
          date: plan.date,
          readiness: plan.readiness,
          sport: plan.sport,
          workoutType: plan.workout_type,
          intensity: plan.intensity,
          duration: plan.duration,
          warmup: plan.warmup,
          mainWorkout: plan.main_workout,
          cooldown: plan.cooldown,
          focusAreas: plan.focus_areas,
          alerts: plan.alerts,
          status: plan.status,
        };
      }

      case "get_calendar_events": {
        if (input.startDate && input.endDate) {
          const { data: events } = await db
            .from("calendar_events")
            .select("*")
            .eq("user_id", userId)
            .gte("start_at", `${input.startDate}T00:00:00`)
            .lte("start_at", `${input.endDate}T23:59:59`)
            .order("start_at", { ascending: true });
          return { count: events?.length || 0, events: events || [] };
        }

        const date = (input.date as string) || today;
        const { data: events } = await db
          .from("calendar_events")
          .select("*")
          .eq("user_id", userId)
          .gte("start_at", `${date}T00:00:00`)
          .lte("start_at", `${date}T23:59:59`)
          .order("start_at", { ascending: true });

        return { count: events?.length || 0, events: events || [] };
      }

      case "get_sleep_history": {
        const days = Math.min((input.days as number) || 7, 30);
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const { data: logs } = await db
          .from("sleep_logs")
          .select("*")
          .eq("user_id", userId)
          .gte("date", startDate.toISOString().slice(0, 10))
          .order("date", { ascending: false });

        return {
          count: logs?.length || 0,
          sleepLogs: (logs || []).map((l) => ({
            date: l.date,
            hours: l.duration_hours,
            quality: l.quality,
            source: l.source,
          })),
        };
      }

      case "get_test_results": {
        const limit = Math.min((input.limit as number) || 10, 30);

        if (input.type === "phone") {
          const { data: sessions } = await db
            .from("phone_test_sessions")
            .select("*")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(limit);
          return { count: sessions?.length || 0, sessions: sessions || [] };
        }

        if (input.type === "blazepod") {
          const { data: sessions } = await db
            .from("blazepod_sessions")
            .select("*")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(limit);
          return { count: sessions?.length || 0, sessions: sessions || [] };
        }

        return { error: 'type must be "phone" or "blazepod"' };
      }

      case "create_calendar_event": {
        if (!input.name || !input.date) {
          return { error: "name and date are required" };
        }

        const startAt = input.startTime
          ? `${input.date}T${input.startTime}:00`
          : `${input.date}T00:00:00`;
        const endAt = input.endTime
          ? `${input.date}T${input.endTime}:00`
          : null;

        const { data: event, error } = await db
          .from("calendar_events")
          .insert({
            user_id: userId,
            title: input.name as string,
            event_type: (input.type as string) || "training",
            start_at: startAt,
            end_at: endAt,
            notes: (input.notes as string) || "",
          })
          .select()
          .single();

        if (error) return { error: error.message };
        return { success: true, event };
      }

      case "search_knowledge_base": {
        // Simple text search on knowledge_base table
        const query = input.query as string;
        if (!query) return { error: "query is required" };

        const { data: results } = await db
          .from("knowledge_base")
          .select("category, title, content, metadata")
          .textSearch("content", query.split(" ").join(" & "))
          .limit(5);

        if (!results || results.length === 0) {
          // Fallback: use ilike for partial matching
          const { data: fallback } = await db
            .from("knowledge_base")
            .select("category, title, content, metadata")
            .ilike("content", `%${query.split(" ")[0]}%`)
            .limit(3);

          return {
            count: fallback?.length || 0,
            results: (fallback || []).map((r, i) => ({
              rank: i + 1,
              title: r.title,
              text: r.content,
              category: r.category,
            })),
          };
        }

        return {
          count: results.length,
          results: results.map((r, i) => ({
            rank: i + 1,
            title: r.title,
            text: r.content,
            category: r.category,
          })),
        };
      }

      case "get_padel_progress": {
        const { data: progress } = await db
          .from("padel_progress")
          .select("*")
          .eq("user_id", userId);

        if (!progress || progress.length === 0) {
          return { message: "No padel progress data yet." };
        }

        return {
          shots: progress.map((p) => ({
            shotType: p.shot_type,
            masteryLevel: p.mastery_level,
            lastPracticed: p.last_practiced,
            notes: p.notes,
          })),
        };
      }

      default:
        return { error: `Unknown tool: ${toolName}` };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { error: `Tool failed: ${message}` };
  }
}
