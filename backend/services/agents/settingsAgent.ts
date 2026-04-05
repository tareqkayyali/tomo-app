/**
 * Settings & Profile Agent — owns goals, injury tracking, nutrition, sleep,
 * notification preferences, wearable connections, app settings, and deep navigation.
 * 4th agent in the orchestrator system.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { PlayerContext } from "./contextBuilder";
import { resolveNavigation, resolveNavigationFromMessage } from "./deepNavigationEngine";
import type { AppScreen } from "./deepNavigationEngine";
import { logger } from "@/lib/logger";

// ── Tool Definitions ──────────────────────────────────────────

export const settingsTools = [
  // ── READ TOOLS (10) ──
  {
    name: "get_profile_summary",
    description:
      "Get the player's profile summary — name, sport, position, age, height, weight, PHV stage. Use when asked 'my profile', 'who am I', 'show my info'.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_active_goals",
    description:
      "Get the player's active performance goals with target, deadline, current value, and progress %. Use when asked 'my goals', 'how close am I'.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_injury_log",
    description:
      "Get the player's injury history — active and recovered injuries with location, severity, date, and status. Use when asked 'my injuries', 'injury history', 'am I cleared'.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: { type: "string", description: "'active' | 'recovered' | 'all'. Default 'all'." },
      },
    },
  },
  {
    name: "get_nutrition_log",
    description:
      "Get today's nutrition entries — meals, estimated calories, notes. Use when asked 'what did I eat', 'my nutrition', 'today's meals'.",
    input_schema: {
      type: "object" as const,
      properties: {
        date: { type: "string", description: "Date in YYYY-MM-DD format. Default today." },
      },
    },
  },
  {
    name: "get_wearable_connections",
    description:
      "Get connected wearable devices and their status — last sync time, connection status. Use when asked 'my wearable', 'whoop status', 'my devices'.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_notification_settings",
    description:
      "Get the player's notification preference settings — which types are enabled/disabled. Use when asked 'my notification settings', 'what notifications am I getting'.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_journal_history",
    description:
      "Get past training journal entries (pre-session targets and post-session reflections). Use when asked 'my journals', 'past reflections', 'training log'.",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: { type: "number", description: "Number of entries to return. Default 10." },
      },
    },
  },
  {
    name: "get_drill_library",
    description:
      "Browse and search all available drills filterable by category, PHV safety, and equipment. Use when asked 'browse drills', 'drill library', 'show me exercises'.",
    input_schema: {
      type: "object" as const,
      properties: {
        category: { type: "string", description: "Filter by category: speed, strength, agility, endurance, recovery, mobility" },
        search: { type: "string", description: "Search by drill name" },
      },
    },
  },
  {
    name: "get_app_settings",
    description:
      "Get the player's app settings — language, units (metric/imperial), theme preference. Use when asked 'my settings', 'what units am I using'.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_notifications",
    description:
      "Get the player's recent notifications — unread first. Use when asked 'my notifications', 'what's new', 'any updates'.",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: { type: "number", description: "Number of notifications. Default 20." },
        unreadOnly: { type: "boolean", description: "Only unread. Default false." },
      },
    },
  },

  // ── WRITE TOOLS (15) ──
  {
    name: "update_profile_field",
    description:
      "Update a profile field — sport, position, height (cm), weight (kg), school hours, preferred foot. Use when player says 'change my sport', 'update my height'.",
    input_schema: {
      type: "object" as const,
      required: ["field", "value"],
      properties: {
        field: { type: "string", description: "Field name: sport | position | height_cm | weight_kg | school_start | school_end | preferred_foot | playing_style | gender" },
        value: { type: "string", description: "New value for the field" },
      },
    },
  },
  {
    name: "update_profile_batch",
    description:
      "Batch-update multiple profile fields at once. Used by the CV edit capsule. Accepts an object of field→value pairs.",
    input_schema: {
      type: "object" as const,
      required: ["updates"],
      properties: {
        updates: { type: "object", description: "Map of field name to new value, e.g. { height_cm: 180, weight_kg: 75 }" },
      },
    },
  },
  {
    name: "set_goal",
    description:
      "Create a new performance goal with target value, unit, and deadline. Use when player says 'set a goal', 'I want to reach X by Y'.",
    input_schema: {
      type: "object" as const,
      required: ["title"],
      properties: {
        title: { type: "string", description: "Goal title, e.g. 'Hit 40cm CMJ'" },
        target_value: { type: "number", description: "Target value, e.g. 40" },
        target_unit: { type: "string", description: "Unit, e.g. 'cm', 'seconds', 'kg'" },
        deadline: { type: "string", description: "Deadline in YYYY-MM-DD format" },
      },
    },
  },
  {
    name: "update_goal_progress",
    description:
      "Update the current value on an existing goal. Use when player logs new progress toward a goal.",
    input_schema: {
      type: "object" as const,
      required: ["goalId", "currentValue"],
      properties: {
        goalId: { type: "string", description: "Goal UUID" },
        currentValue: { type: "number", description: "New current value" },
      },
    },
  },
  {
    name: "complete_goal",
    description:
      "Mark a goal as achieved. Triggers achievement entry. Use when player says 'I hit my goal', 'mark goal as done'.",
    input_schema: {
      type: "object" as const,
      required: ["goalId"],
      properties: {
        goalId: { type: "string", description: "Goal UUID" },
      },
    },
  },
  {
    name: "log_injury",
    description:
      "Log a new injury or pain point. Severity: 1=soreness, 2=pain affects training, 3=cannot train. Use when player says 'I'm injured', 'I hurt my knee', 'I have pain in my ankle'.",
    input_schema: {
      type: "object" as const,
      required: ["location", "severity"],
      properties: {
        location: { type: "string", description: "Body location: knee, ankle, shoulder, back, hamstring, quad, hip, etc." },
        severity: { type: "number", description: "1=soreness, 2=pain affects training, 3=cannot train" },
        notes: { type: "string", description: "Additional context about the injury" },
      },
    },
  },
  {
    name: "update_injury_status",
    description:
      "Mark an injury as recovered or still active. Use when player says 'my knee is better', 'cleared from injury'.",
    input_schema: {
      type: "object" as const,
      required: ["injuryId", "status"],
      properties: {
        injuryId: { type: "string", description: "Injury UUID" },
        status: { type: "string", description: "'active' | 'recovered'" },
      },
    },
  },
  {
    name: "log_nutrition",
    description:
      "Log a meal or nutrition entry. Use when player says 'I ate pasta', 'log lunch', 'record my food'.",
    input_schema: {
      type: "object" as const,
      required: ["meal"],
      properties: {
        meal: { type: "string", description: "Meal description" },
        calories: { type: "number", description: "Estimated calories (optional)" },
        notes: { type: "string", description: "Additional notes" },
      },
    },
  },
  {
    name: "log_sleep_manual",
    description:
      "Log sleep manually (when no wearable data). Use when player says 'I slept 7 hours', 'log my sleep'.",
    input_schema: {
      type: "object" as const,
      required: ["hours"],
      properties: {
        hours: { type: "number", description: "Sleep hours (e.g. 7.5)" },
        quality: { type: "number", description: "Sleep quality 1-5 (1=terrible, 5=excellent)" },
      },
    },
  },
  {
    name: "update_notification_pref",
    description:
      "Toggle a notification type on or off. Use when player says 'turn off streak notifications', 'enable daily reminders'.",
    input_schema: {
      type: "object" as const,
      required: ["type", "enabled"],
      properties: {
        type: { type: "string", description: "Notification type: daily_reminder | streak | milestones | red_day | weekly_summary | coaching_tips | recovery_alerts" },
        enabled: { type: "boolean", description: "true to enable, false to disable" },
      },
    },
  },
  {
    name: "mark_notifications_read",
    description:
      "Mark one or all notifications as read. Use when player says 'mark all as read', 'clear notification badge'.",
    input_schema: {
      type: "object" as const,
      properties: {
        notificationId: { type: "string", description: "Specific notification UUID. Omit to mark all." },
      },
    },
  },
  {
    name: "navigate_to",
    description:
      "Deep-navigate to any screen in the Tomo app with optional pre-fill state. Use when an action requires a UI form or the player wants to go to a specific screen. Screens: ProfileScreen, ScheduleRulesScreen, NotificationCenterScreen, CVPreviewScreen, CVEditScreen, WearableSettingsScreen, AppSettingsScreen, TestHistoryScreen, DrillLibraryScreen, JournalHistoryScreen, AchievementsScreen, SleepDetailScreen, GoalsScreen, InjuryLogScreen.",
    input_schema: {
      type: "object" as const,
      required: ["screen"],
      properties: {
        screen: { type: "string", description: "Target screen name (e.g. 'ProfileScreen', 'CVPreviewScreen')" },
        params: { type: "string", description: "Optional JSON-encoded pre-fill parameters for the screen" },
        highlight: { type: "string", description: "Optional element ID to highlight on arrival" },
      },
    },
  },
  {
    name: "submit_feedback",
    description:
      "Submit app feedback — bug report, feature request, or general feedback. Use when player says 'report a bug', 'give feedback', 'suggest a feature'.",
    input_schema: {
      type: "object" as const,
      required: ["message"],
      properties: {
        message: { type: "string", description: "Feedback message" },
        type: { type: "string", description: "'bug' | 'feature' | 'general'. Default 'general'." },
      },
    },
  },
  {
    name: "refresh_recommendations",
    description:
      "Trigger a deep refresh of personalized recommendations. Use when player says 'refresh my recs', 'update my suggestions'.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_integration_status",
    description:
      "Check status of all integrations (WHOOP, etc.) — connection status, last sync, errors. Use when asked 'is my whoop connected', 'integration status'.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_leaderboard",
    description:
      "Get leaderboard rankings — global, local, team, archetype, or streaks. Use when asked 'leaderboard', 'where do I rank', 'top players'.",
    input_schema: {
      type: "object" as const,
      properties: {
        boardType: { type: "string", description: "'global' | 'streaks' | 'local' | 'archetype'. Default 'global'." },
      },
    },
  },
];

// ── Tool Executor ─────────────────────────────────────────────

export async function executeSettingsTool(
  toolName: string,
  toolInput: Record<string, any>,
  context: PlayerContext
): Promise<{ result: any; refreshTarget?: string; error?: string }> {
  const db = supabaseAdmin();
  // Cast to any for tables not yet in generated types (athlete_goals, athlete_injuries, etc.)
  const dbAny = db as any;
  const userId = context.userId;

  try {
    switch (toolName) {
      // ── READ TOOLS ──

      case "get_profile_summary": {
        const [userRes, snapRes] = await Promise.all([
          db.from("users").select("name, sport, age, email").eq("id", userId).single(),
          db.from("athlete_snapshots").select("position, date_of_birth, height_cm, weight_kg, preferred_foot, playing_style, gender").eq("athlete_id", userId).single(),
        ]);
        const user = userRes.data as any ?? {};
        const snap = snapRes.data as any ?? {};
        return {
          result: {
            name: user.name ?? context.name,
            sport: user.sport ?? context.sport,
            position: snap.position ?? context.position,
            age: user.age,
            dateOfBirth: snap.date_of_birth,
            heightCm: snap.height_cm,
            weightKg: snap.weight_kg,
            preferredFoot: snap.preferred_foot,
            playingStyle: snap.playing_style,
            gender: snap.gender,
            phvStage: context.snapshotEnrichment?.phvStage ?? "unknown",
          },
        };
      }

      case "get_active_goals": {
        const { data: goals } = await dbAny
          .from("athlete_goals")
          .select("*")
          .eq("athlete_id", userId)
          .eq("status", "active")
          .order("created_at", { ascending: false });
        return {
          result: {
            goals: (goals ?? []).map((g: any) => ({
              id: g.id,
              title: g.title,
              targetValue: g.target_value,
              targetUnit: g.target_unit,
              currentValue: g.current_value,
              progressPct: g.target_value ? Math.round((g.current_value / g.target_value) * 100) : 0,
              deadline: g.deadline,
              daysRemaining: g.deadline ? Math.ceil((new Date(g.deadline).getTime() - Date.now()) / 86400000) : null,
              status: g.status,
            })),
            count: (goals ?? []).length,
          },
        };
      }

      case "get_injury_log": {
        const statusFilter = toolInput.status ?? "all";
        let query = dbAny.from("athlete_injuries").select("*").eq("athlete_id", userId).order("logged_at", { ascending: false }).limit(20);
        if (statusFilter !== "all") {
          query = query.eq("status", statusFilter);
        }
        const { data: injuries } = await query;
        return {
          result: {
            injuries: (injuries ?? []).map((i: any) => ({
              id: i.id,
              location: i.body_location,
              severity: i.severity,
              severityLabel: i.severity === 1 ? "Soreness" : i.severity === 2 ? "Pain" : "Cannot train",
              notes: i.notes,
              status: i.status,
              loggedAt: i.logged_at,
              recoveredAt: i.recovered_at,
            })),
            activeCount: (injuries ?? []).filter((i: any) => i.status === "active").length,
          },
        };
      }

      case "get_nutrition_log": {
        const date = toolInput.date ?? context.todayDate;
        const { data: entries } = await dbAny
          .from("athlete_nutrition_log")
          .select("*")
          .eq("athlete_id", userId)
          .eq("logged_date", date)
          .order("logged_at", { ascending: true });
        const totalCals = (entries ?? []).reduce((sum: number, e: any) => sum + (e.estimated_calories ?? 0), 0);
        return {
          result: {
            date,
            entries: (entries ?? []).map((e: any) => ({
              id: e.id,
              meal: e.meal_description,
              calories: e.estimated_calories,
              notes: e.notes,
              time: e.logged_at,
            })),
            totalCalories: totalCals,
            mealCount: (entries ?? []).length,
          },
        };
      }

      case "get_wearable_connections": {
        const { data: tokens } = await dbAny
          .from("whoop_tokens")
          .select("last_synced_at, created_at")
          .eq("user_id", userId)
          .single();
        return {
          result: {
            whoop: tokens ? {
              connected: true,
              lastSyncedAt: tokens.last_synced_at,
              connectedAt: tokens.created_at,
            } : { connected: false },
          },
        };
      }

      case "get_notification_settings": {
        const { data: prefs } = await dbAny
          .from("athlete_notification_preferences")
          .select("*")
          .eq("athlete_id", userId)
          .single();
        return {
          result: {
            preferences: prefs ?? {
              daily_reminder: true,
              streak: true,
              milestones: true,
              red_day: true,
              weekly_summary: true,
              coaching_tips: true,
              recovery_alerts: true,
            },
          },
        };
      }

      case "get_journal_history": {
        const limit = toolInput.limit ?? 10;
        const { data: journals } = await dbAny
          .from("training_journals")
          .select("id, calendar_event_id, pre_target, pre_cue, post_rating, post_reflection, post_highlight, created_at")
          .eq("athlete_id", userId)
          .order("created_at", { ascending: false })
          .limit(limit);
        return {
          result: {
            journals: journals ?? [],
            count: (journals ?? []).length,
          },
        };
      }

      case "get_drill_library": {
        let query = dbAny.from("drills").select("id, name, category, description, equipment, difficulty, phv_safe, primary_attribute, tags").eq("enabled", true);
        if (toolInput.category) {
          query = query.eq("category", toolInput.category);
        }
        if (toolInput.search) {
          query = query.ilike("name", `%${toolInput.search}%`);
        }
        const { data: drills } = await query.order("name").limit(30);
        return {
          result: {
            drills: drills ?? [],
            count: (drills ?? []).length,
            filters: { category: toolInput.category ?? "all", search: toolInput.search ?? null },
          },
        };
      }

      case "get_app_settings": {
        const { data: prefs } = await db
          .from("player_schedule_preferences")
          .select("units, language, theme")
          .eq("user_id", userId)
          .single();
        return {
          result: {
            units: (prefs as any)?.units ?? "metric",
            language: (prefs as any)?.language ?? "en",
            theme: (prefs as any)?.theme ?? "dark",
          },
        };
      }

      case "get_notifications": {
        const limit = toolInput.limit ?? 20;
        let query = dbAny.from("athlete_notifications").select("id, type, title, body, priority, read, created_at").eq("athlete_id", userId);
        if (toolInput.unreadOnly) {
          query = query.eq("read", false);
        }
        const { data: notifs } = await query.order("created_at", { ascending: false }).limit(limit);
        return {
          result: {
            notifications: notifs ?? [],
            unreadCount: (notifs ?? []).filter((n: any) => !n.read).length,
            total: (notifs ?? []).length,
          },
        };
      }

      // ── WRITE TOOLS ──

      case "update_profile_field": {
        const { field, value } = toolInput;
        const snapshotFields = ["position", "height_cm", "weight_kg", "preferred_foot", "playing_style", "gender", "sitting_height_cm"];
        const userFields = ["sport", "name"];

        if (snapshotFields.includes(field)) {
          await db.from("athlete_snapshots").update({ [field]: value }).eq("athlete_id", userId);
        } else if (userFields.includes(field)) {
          await db.from("users").update({ [field]: value }).eq("id", userId);
        } else {
          return { result: null, error: `Unknown profile field: ${field}` };
        }
        return { result: { updated: field, newValue: value }, refreshTarget: "profile" };
      }

      case "update_profile_batch": {
        const updates = toolInput.updates as Record<string, any>;
        const snapshotFields = ["position", "height_cm", "weight_kg", "preferred_foot", "playing_style", "gender", "sitting_height_cm", "date_of_birth"];
        const userFields = ["sport", "name"];

        const snapshotUpdates: Record<string, any> = {};
        const userUpdates: Record<string, any> = {};

        for (const [field, value] of Object.entries(updates)) {
          if (snapshotFields.includes(field)) {
            snapshotUpdates[field] = value;
          } else if (userFields.includes(field)) {
            userUpdates[field] = value;
          }
        }

        const promises: PromiseLike<any>[] = [];
        if (Object.keys(snapshotUpdates).length > 0) {
          promises.push(db.from("athlete_snapshots").update(snapshotUpdates).eq("athlete_id", userId));
        }
        if (Object.keys(userUpdates).length > 0) {
          promises.push(db.from("users").update(userUpdates).eq("id", userId));
        }
        await Promise.all(promises);

        return { result: { updated: Object.keys(updates) }, refreshTarget: "profile" };
      }

      case "set_goal": {
        const { data: goal } = await dbAny.from("athlete_goals").insert({
          athlete_id: userId,
          title: toolInput.title,
          target_value: toolInput.target_value ?? null,
          target_unit: toolInput.target_unit ?? null,
          deadline: toolInput.deadline ?? null,
        }).select().single();
        return { result: { goal, message: `Goal set: ${toolInput.title}` } };
      }

      case "update_goal_progress": {
        const { data: updated } = await dbAny.from("athlete_goals")
          .update({ current_value: toolInput.currentValue })
          .eq("id", toolInput.goalId)
          .eq("athlete_id", userId)
          .select()
          .single();
        if (!updated) return { result: null, error: "Goal not found" };
        const pct = updated.target_value ? Math.round((toolInput.currentValue / updated.target_value) * 100) : 0;
        return { result: { goal: updated, progressPct: pct } };
      }

      case "complete_goal": {
        const { data: completed } = await dbAny.from("athlete_goals")
          .update({ status: "achieved", achieved_at: new Date().toISOString() })
          .eq("id", toolInput.goalId)
          .eq("athlete_id", userId)
          .select()
          .single();
        if (!completed) return { result: null, error: "Goal not found" };
        return { result: { goal: completed, message: `Goal achieved: ${completed.title}` } };
      }

      case "log_injury": {
        const { data: injury } = await dbAny.from("athlete_injuries").insert({
          athlete_id: userId,
          body_location: toolInput.location,
          severity: toolInput.severity,
          notes: toolInput.notes ?? null,
        }).select().single();
        return {
          result: {
            injury,
            severityLabel: toolInput.severity === 1 ? "Soreness" : toolInput.severity === 2 ? "Pain — affects training" : "Cannot train",
            message: `Injury logged: ${toolInput.location} (${toolInput.severity === 1 ? "soreness" : toolInput.severity === 2 ? "pain" : "severe"})`,
          },
          refreshTarget: "readiness",
        };
      }

      case "update_injury_status": {
        const updates: Record<string, any> = { status: toolInput.status };
        if (toolInput.status === "recovered") {
          updates.recovered_at = new Date().toISOString();
        }
        const { data: updated } = await dbAny.from("athlete_injuries")
          .update(updates)
          .eq("id", toolInput.injuryId)
          .eq("athlete_id", userId)
          .select()
          .single();
        if (!updated) return { result: null, error: "Injury not found" };
        return { result: { injury: updated, message: `Injury status updated to ${toolInput.status}` }, refreshTarget: "readiness" };
      }

      case "log_nutrition": {
        const { data: entry } = await dbAny.from("athlete_nutrition_log").insert({
          athlete_id: userId,
          meal_description: toolInput.meal,
          estimated_calories: toolInput.calories ?? null,
          notes: toolInput.notes ?? null,
        }).select().single();
        return { result: { entry, message: `Logged: ${toolInput.meal}` } };
      }

      case "log_sleep_manual": {
        const { data: entry } = await dbAny.from("athlete_sleep_manual").insert({
          athlete_id: userId,
          hours: toolInput.hours,
          quality: toolInput.quality ?? null,
        }).select().single();
        return { result: { entry, message: `Logged ${toolInput.hours}h sleep` }, refreshTarget: "readiness" };
      }

      case "update_notification_pref": {
        const { type, enabled } = toolInput;
        await dbAny.from("athlete_notification_preferences")
          .upsert({ athlete_id: userId, [type]: enabled }, { onConflict: "athlete_id" });
        return { result: { type, enabled, message: `${type} notifications ${enabled ? "enabled" : "disabled"}` } };
      }

      case "mark_notifications_read": {
        if (toolInput.notificationId) {
          await dbAny.from("athlete_notifications")
            .update({ read: true })
            .eq("id", toolInput.notificationId)
            .eq("athlete_id", userId);
          return { result: { message: "Notification marked as read" } };
        } else {
          await dbAny.from("athlete_notifications")
            .update({ read: true })
            .eq("athlete_id", userId)
            .eq("read", false);
          return { result: { message: "All notifications marked as read" }, refreshTarget: "notifications" };
        }
      }

      case "navigate_to": {
        const screen = toolInput.screen as AppScreen;
        const card = resolveNavigation({
          screen,
          params: toolInput.params,
          highlight: toolInput.highlight,
        });
        return { result: { navigationCard: card } };
      }

      case "submit_feedback": {
        const feedbackType = toolInput.type ?? "general";
        try {
          await dbAny.from("feedback").insert({
            user_id: userId,
            type: feedbackType,
            message: toolInput.message,
          });
        } catch (e) {
          logger.warn("[settings-agent] Feedback insert failed, continuing", { error: e });
        }
        return { result: { message: `Thank you for your ${feedbackType} feedback. We'll review it.` } };
      }

      case "refresh_recommendations": {
        try {
          const { triggerDeepRefreshAsync } = await import("../recommendations/deepRecRefresh");
          try {
            triggerDeepRefreshAsync(userId);
          } catch (refreshErr: any) {
            logger.warn("[settings-agent] Deep refresh failed", { error: refreshErr });
          }
        } catch (e) {
          logger.warn("[settings-agent] Could not trigger deep refresh", { error: e });
        }
        return { result: { message: "Refreshing your personalized recommendations. This may take a moment." }, refreshTarget: "recommendations" };
      }

      case "get_integration_status": {
        const { data: whoopToken } = await dbAny
          .from("whoop_tokens")
          .select("last_synced_at, created_at, access_token")
          .eq("user_id", userId)
          .single();

        return {
          result: {
            integrations: {
              whoop: whoopToken ? {
                connected: true,
                lastSynced: whoopToken.last_synced_at,
                hasValidToken: !!whoopToken.access_token,
              } : { connected: false },
            },
          },
        };
      }

      case "get_leaderboard": {
        const boardType = toolInput.boardType ?? "global";

        // Query leaderboard view
        const { data: entries } = await dbAny
          .from("points_ledger")
          .select("user_id, users!inner(name, sport)")
          .order("balance", { ascending: false })
          .limit(20);

        // Find user's rank
        const userRank = (entries ?? []).findIndex((e: any) => e.user_id === userId) + 1;

        return {
          result: {
            boardType,
            entries: (entries ?? []).map((e: any, i: number) => ({
              rank: i + 1,
              name: (e.users as any)?.name ?? "Athlete",
              sport: (e.users as any)?.sport ?? "",
              isCurrentUser: e.user_id === userId,
            })),
            userRank: userRank > 0 ? userRank : "Not ranked",
          },
        };
      }

      default:
        return { result: null, error: `Unknown settings tool: ${toolName}` };
    }
  } catch (err: any) {
    logger.error("[settings-agent] Tool execution failed", { tool: toolName, error: err.message });
    return { result: null, error: err.message ?? "Tool execution failed" };
  }
}

// ── System Prompt Builders ────────────────────────────────────

export function buildSettingsStaticPrompt(): string {
  return `You are the Settings & Profile Agent for Tomo — you handle everything the other agents don't: goals, injury tracking, nutrition, sleep logging, app settings, notifications, wearable connections, and deep navigation.

RULES:
1. Goals are personal performance targets — help athletes set specific, measurable goals with deadlines
2. Injury logging is NOT diagnosis — log what the athlete reports, suggest modified training
3. Nutrition logging is simple meal tracking — no medical nutrition advice
4. Sleep logging is a manual override when wearable data isn't available
5. Navigation: when a UI form is needed, use navigate_to to open the exact screen
6. Keep responses actionable and concise

INJURY SEVERITY SCALE:
- 1 = Soreness (can train normally, just aware of it)
- 2 = Pain (affects training, needs modification)
- 3 = Cannot train (needs rest or medical attention)

When an athlete reports pain at severity 2+, ALWAYS suggest modified training and flag it.
For severity 3, recommend consulting a medical professional.

GOAL TRACKING:
- Help athletes set SMART goals (Specific, Measurable, Achievable, Relevant, Time-bound)
- When a goal is close to deadline, proactively mention it
- Celebrate achieved goals with genuine enthusiasm

COMMAND CENTER RULES — CRITICAL:
1. NO DEAD ENDS. Every query resolves as EXECUTE or NAVIGATE. Never output "can't", "not possible", "not available", or "contact someone".
2. If you can do it with a tool, do it. If it requires a UI form, use navigate_to.
3. Never tell the athlete to navigate manually — open the screen for them.

TONE: Like a smart personal assistant who also understands athletic performance.`;
}

export function buildSettingsDynamicPrompt(context: PlayerContext): string {
  return `
PLAYER CONTEXT:
- Name: ${context.name} | Sport: ${context.sport} | Age Band: ${context.ageBand ?? "Unknown"}
- Today: ${context.todayDate} | Current time: ${context.currentTime}`;
}
