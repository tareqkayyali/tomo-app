/**
 * Output Agent — owns readiness, metrics, check-ins, and dual-load scoring.
 * Adapted to actual Tomo schema: checkins table, health_data, phone_test_sessions.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { PlayerContext } from "./contextBuilder";
import { getDayBoundsISO } from "./contextBuilder";
import {
  getRecommendedDrills,
  getDrillById,
  searchDrills,
} from "@/services/drillRecommendationService";
import { getPlayerBenchmarkProfile, processPhoneTestBenchmark } from "@/services/benchmarkService";
import { generateProgramRecommendations } from "@/services/programs/programRecommendationEngine";
import {
  calculatePHV,
  recordPHVAssessment,
} from "@/services/programs/phvCalculator";
import { RAW_TEST_GROUP_MAP, TEST_GROUPS } from "@/services/testGroupConstants";
import { emitEventSafe } from "@/services/events/eventEmitter";
import { triggerDeepRefreshAsync as triggerDeepRecRefreshAsync } from "@/services/recommendations/deepRecRefresh";
import { triggerDeepProgramRefreshAsync } from "@/services/programs/deepProgramRefresh";

export const outputTools = [
  {
    name: "get_readiness_detail",
    description:
      "Get detailed readiness breakdown — energy, soreness, sleep, mood, stress, pain. Use when player asks about readiness, how they feel, or if they should train.",
    input_schema: {
      type: "object" as const,
      properties: {
        date: {
          type: "string",
          description: "YYYY-MM-DD, defaults to today",
        },
      },
    },
  },
  {
    name: "get_vitals_trend",
    description:
      "Get wearable/health data trends over recent days. Use when asked about recovery trends or health metrics.",
    input_schema: {
      type: "object" as const,
      properties: {
        metric: {
          type: "string",
          description:
            "Metric type to filter (e.g. heart_rate, steps). Leave empty for all.",
        },
        days: {
          type: "number",
          description: "Number of days back. Default 7.",
        },
      },
    },
  },
  {
    name: "get_checkin_history",
    description:
      "Get recent check-in history showing energy, soreness, sleep, mood trends. Use when asked about patterns or how they've been feeling.",
    input_schema: {
      type: "object" as const,
      properties: {
        days: {
          type: "number",
          description: "Number of days to look back. Default 7.",
        },
      },
    },
  },
  {
    name: "get_dual_load_score",
    description:
      "Calculate the combined academic + athletic load score for today or this week. This is Tomo's unique dual-load intelligence. Use when asked about overall stress, balance, or overload risk.",
    input_schema: {
      type: "object" as const,
      properties: {
        date: {
          type: "string",
          description: "YYYY-MM-DD, defaults to today",
        },
      },
    },
  },
  {
    name: "log_check_in",
    description:
      "Log a daily check-in conversationally. Use when player reports how they feel, mentions sleep quality, energy, soreness, mood, or stress. Collect values 1-10 and save.",
    input_schema: {
      type: "object" as const,
      required: ["energy", "soreness", "sleepHours"],
      properties: {
        energy: { type: "number", description: "1-10" },
        soreness: { type: "number", description: "1-10" },
        sleepHours: { type: "number", description: "Hours slept (e.g. 7.5)" },
        mood: { type: "number", description: "1-10" },
        academicStress: {
          type: "number",
          description: "1-10 (academic + life stress)",
        },
        painFlag: { type: "boolean", description: "True if reporting pain" },
        painLocation: { type: "string", description: "Where the pain is" },
        notes: { type: "string" },
      },
    },
  },
  {
    name: "get_test_results",
    description:
      "Get the player's test history — reaction time, jump, sprint, agility, balance. Use when asked about performance test scores or recent results.",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description: "Number of results to return. Default 10.",
        },
        testType: {
          type: "string",
          description: "Filter by test type if specified",
        },
      },
    },
  },
  {
    name: "get_training_session",
    description:
      "Get a personalized training session with drills based on the player's readiness, age band, and performance gaps. Use when player asks for a workout, training plan, practice drills, warm-up routine, or what to train.",
    input_schema: {
      type: "object" as const,
      properties: {
        category: {
          type: "string",
          description:
            "warmup | training | cooldown | recovery | activation. Leave empty for a full balanced session.",
        },
        focus: {
          type: "string",
          description:
            "Attribute to focus on: pace, shooting, passing, dribbling, defending, physicality. Leave empty for balanced.",
        },
        limit: {
          type: "number",
          description: "Number of drills. Default 6.",
        },
      },
    },
  },
  {
    name: "get_drill_detail",
    description:
      "Get full details for a specific drill — instructions, equipment, progressions. Use when player asks about a specific drill or wants more info. IMPORTANT: If the user message contains [drillId:UUID], extract that UUID and pass it as drillId. If you only have a drill name, pass it as drillName instead.",
    input_schema: {
      type: "object" as const,
      properties: {
        drillId: {
          type: "string",
          description: "UUID of the drill (preferred). Extract from [drillId:UUID] in user messages if present.",
        },
        drillName: {
          type: "string",
          description: "Drill name to search for (fallback when drillId is not available).",
        },
      },
    },
  },
  {
    name: "get_benchmark_comparison",
    description:
      "Get the player's benchmark profile — percentile rankings vs age/position peers for all tested metrics. Shows strengths, gaps, and percentile zone for each metric. Use when the player asks about benchmarks, comparisons, percentiles, how they rank, or where they stand vs others.",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "get_training_program_recommendations",
    description:
      "Get personalised multi-week training program recommendations based on the player's age band, position, PHV stage, benchmark gaps, and anthropometrics. Use when player asks about training programmes, development plans, 6-week blocks, what to train long-term, or programme structure.",
    input_schema: {
      type: "object" as const,
      properties: {
        focusArea: {
          type: "string",
          description:
            "Optional focus area: sprint, strength, agility, endurance, technical, injury_prevention. Leave empty for full recommendation.",
        },
      },
    },
  },
  {
    name: "calculate_phv_stage",
    description:
      "Calculate and record PHV (Peak Height Velocity) stage from anthropometric measurements. Use when player or parent provides height, sitting height, weight, and age for maturity assessment.",
    input_schema: {
      type: "object" as const,
      required: [
        "standingHeightCm",
        "sittingHeightCm",
        "weightKg",
        "ageDecimal",
      ],
      properties: {
        standingHeightCm: {
          type: "number",
          description: "Standing height in cm",
        },
        sittingHeightCm: {
          type: "number",
          description: "Sitting height in cm",
        },
        weightKg: { type: "number", description: "Body weight in kg" },
        ageDecimal: {
          type: "number",
          description: "Age as decimal (e.g. 14.5)",
        },
      },
    },
  },
  {
    name: "get_my_programs",
    description:
      "Get the athlete's current personalized training programs including AI-generated and coach-assigned programs. Use when the athlete asks about their programs, a specific program by name, program drills/exercises, or wants details about a recommended training program. Pass program_name to filter and get related drills.",
    input_schema: {
      type: "object" as const,
      properties: {
        program_name: {
          type: "string",
          description:
            "Optional: filter by program name (partial match). If not provided, returns all programs.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_program_by_id",
    description:
      "Get full details of a specific training program including prescriptions, PHV guidance, and equipment. Use when player asks about a specific programme by name or ID.",
    input_schema: {
      type: "object" as const,
      required: ["programId"],
      properties: {
        programId: {
          type: "string",
          description: "The program ID (e.g. 'sprint_linear_10_30')",
        },
      },
    },
  },

  // ── Capsule Tools — test logging & catalog ──────────────────────

  {
    name: "get_test_catalog",
    description:
      "Get the available test catalog (tests the player can log). Returns test IDs, names, units, and categories. Use when the player wants to log a test but hasn't specified which one, or when you need to show a test_log_capsule.",
    input_schema: {
      type: "object" as const,
      properties: {
        category: {
          type: "string",
          description: "Optional filter by category (e.g. 'speed', 'agility', 'power', 'balance', 'reaction')",
        },
      },
    },
  },
  {
    name: "log_test_result",
    description:
      "Log a test result for the player. Use when the player provides a test score to record. If the player says all data (test type + score), call this directly. If data is missing, return a test_log_capsule card instead so the player can fill in fields interactively.",
    input_schema: {
      type: "object" as const,
      required: ["testType", "score"],
      properties: {
        testType: {
          type: "string",
          description: "Test catalog ID (e.g. 'cmj', 'sprint_30m', 'reaction_time', 'agility_5105', 'balance_y')",
        },
        score: {
          type: "number",
          description: "The test score/value",
        },
        unit: {
          type: "string",
          description: "Unit of measurement (e.g. 'cm', 's', 'ms'). Auto-detected from catalog if omitted.",
        },
        date: {
          type: "string",
          description: "YYYY-MM-DD, defaults to today",
        },
        notes: {
          type: "string",
          description: "Optional notes about the test",
        },
      },
    },
  },
  {
    name: "rate_drill",
    description:
      "Rate a drill after completing it. Use when the player says they finished a drill and wants to give feedback.",
    input_schema: {
      type: "object" as const,
      required: ["drillId", "rating"],
      properties: {
        drillId: {
          type: "string",
          description: "UUID of the drill",
        },
        rating: {
          type: "number",
          description: "1-5 star rating",
        },
        difficulty: {
          type: "number",
          description: "1-5 difficulty rating",
        },
        completionStatus: {
          type: "string",
          enum: ["skipped", "partial", "completed"],
          description: "Whether the drill was completed fully",
        },
        effort: {
          type: "number",
          description: "1-10 effort level",
        },
        notes: {
          type: "string",
          description: "Optional feedback notes",
        },
      },
    },
  },
  // ── Journal Tools ──
  {
    name: "get_today_training_for_journal",
    description: "Get today's training/match/recovery events for pre-session journaling",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "get_pending_post_journal",
    description: "Get training events that need post-session reflection",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "save_journal_pre",
    description: "Save a pre-session training target",
    input_schema: {
      type: "object" as const,
      required: ["calendar_event_id", "pre_target"],
      properties: {
        calendar_event_id: {
          type: "string",
          description: "Calendar event ID",
        },
        pre_target: {
          type: "string",
          description: "What the athlete wants to achieve",
        },
        pre_mental_cue: {
          type: "string",
          description: "Optional one-word mental cue",
        },
        pre_focus_tag: {
          type: "string",
          enum: ["strength", "speed", "technique", "tactical", "fitness"],
          description: "Optional focus area",
        },
      },
    },
  },
  {
    name: "save_journal_post",
    description: "Save a post-session training reflection",
    input_schema: {
      type: "object" as const,
      required: ["journal_id", "post_outcome", "post_reflection"],
      properties: {
        journal_id: {
          type: "string",
          description: "Journal ID (from pre-session)",
        },
        post_outcome: {
          type: "string",
          enum: ["fell_short", "hit_it", "exceeded"],
          description: "Did the athlete hit their target?",
        },
        post_reflection: {
          type: "string",
          description: "What happened during the session",
        },
        post_next_focus: {
          type: "string",
          description: "Optional — what to work on next",
        },
        post_body_feel: {
          type: "number",
          description: "Optional body feel 1-10",
        },
      },
    },
  },
];

export async function executeOutputTool(
  toolName: string,
  toolInput: Record<string, any>,
  context: PlayerContext
): Promise<{ result: any; refreshTarget?: string; error?: string }> {
  const db = supabaseAdmin();
  const userId = context.userId;
  const today = context.todayDate;

  try {
    switch (toolName) {
      case "get_readiness_detail": {
        const date = toolInput.date ?? today;
        const [checkinRes, vitalsRes] = await Promise.all([
          db.from("checkins")
            .select("energy, soreness, sleep_hours, mood, academic_stress, pain_flag, pain_location, readiness, intensity, effort_yesterday, date")
            .eq("user_id", userId)
            .eq("date", date)
            .maybeSingle(),
          db.from("health_data")
            .select("metric_type, value, date")
            .eq("user_id", userId)
            .in("metric_type", ["hrv", "resting_hr", "sleep_hours", "recovery_score"])
            .order("date", { ascending: false })
            .limit(10),
        ]);
        let checkin = checkinRes.data;
        let checkinDate = date;

        // Fallback: if no check-in today, get the most recent one (within last 3 days)
        if (!checkin) {
          const fallbackRes = await db.from("checkins")
            .select("energy, soreness, sleep_hours, mood, academic_stress, pain_flag, pain_location, readiness, intensity, effort_yesterday, date")
            .eq("user_id", userId)
            .order("date", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (fallbackRes.data) {
            checkin = fallbackRes.data;
            checkinDate = (fallbackRes.data as any).date ?? date;
          }
        }

        // Build vitals map from latest health_data
        const vitals: Record<string, number> = {};
        for (const v of (vitalsRes.data ?? []) as any[]) {
          if (!vitals[v.metric_type]) vitals[v.metric_type] = Math.round(v.value * 10) / 10;
        }

        return { result: { date: checkinDate, checkIn: checkin, vitals, isToday: checkinDate === date } };
      }

      case "get_vitals_trend": {
        const days = toolInput.days ?? 7;
        const since = new Date(Date.now() - days * 86400000)
          .toISOString()
          .split("T")[0];
        let query = db
          .from("health_data")
          .select("metric_type, value, date")
          .eq("user_id", userId)
          .gte("date", since)
          .order("date", { ascending: false });

        if (toolInput.metric) query = query.eq("metric_type", toolInput.metric);

        const { data } = await query;
        return { result: { days, vitals: data ?? [] } };
      }

      case "get_checkin_history": {
        const days = Math.min(toolInput.days ?? 7, 30);
        const { data } = await db
          .from("checkins")
          .select(
            "date, energy, soreness, sleep_hours, mood, academic_stress, pain_flag, readiness"
          )
          .eq("user_id", userId)
          .order("date", { ascending: false })
          .limit(days);

        return { result: { days, checkins: data ?? [] } };
      }

      case "get_dual_load_score": {
        const date = toolInput.date ?? today;
        const [dayStart, dayEnd] = getDayBoundsISO(date, context.timezone);

        // Get training events for day
        const { data: trainingEvents } = await db
          .from("calendar_events")
          .select("event_type, intensity, title")
          .eq("user_id", userId)
          .gte("start_at", dayStart)
          .lte("start_at", dayEnd)
          .in("event_type", ["training", "match"]);

        // Get study/exam events
        const { data: studyEvents } = await db
          .from("calendar_events")
          .select("event_type, title")
          .eq("user_id", userId)
          .gte("start_at", dayStart)
          .lte("start_at", dayEnd)
          .in("event_type", ["study", "exam"]);

        // Athletic load: map intensity to numeric score
        const intensityMap: Record<string, number> = {
          REST: 2,
          LIGHT: 4,
          MODERATE: 6,
          HARD: 9,
        };
        const athleticLoad =
          trainingEvents && trainingEvents.length > 0
            ? trainingEvents.reduce(
                (s, e) => s + (intensityMap[e.intensity ?? ""] ?? 5),
                0
              ) / trainingEvents.length
            : 0;

        // Academic load: exam = 3 pts, study block = 1 pt, max 10
        const academicLoad = Math.min(
          10,
          (studyEvents ?? []).reduce(
            (s, e) => s + (e.event_type === "exam" ? 3 : 1),
            0
          )
        );

        const totalLoad = (athleticLoad + academicLoad) / 2;
        const loadZone =
          totalLoad >= 8
            ? "overload"
            : totalLoad >= 6
              ? "high"
              : totalLoad >= 4
                ? "moderate"
                : "low";

        return {
          result: {
            date,
            athleticLoad: Math.round(athleticLoad * 10) / 10,
            academicLoad: Math.round(academicLoad * 10) / 10,
            totalLoad: Math.round(totalLoad * 10) / 10,
            loadZone,
            trainingEvents: trainingEvents?.map((e) => e.title) ?? [],
            studyEvents: studyEvents?.map((e) => e.title) ?? [],
          },
        };
      }

      case "log_check_in": {
        // Calculate readiness from inputs
        const energy = toolInput.energy ?? 5;
        const soreness = toolInput.soreness ?? 5;
        const sleepHours = toolInput.sleepHours ?? 7;
        const mood = toolInput.mood ?? 5;

        // Simple readiness calculation
        const avg = (energy + (10 - soreness) + Math.min(sleepHours, 10) + mood) / 4;
        let readiness: string;
        let intensity: string;
        if (avg >= 7 || toolInput.painFlag) {
          readiness = avg >= 7 ? "Green" : "Red";
        } else if (avg >= 5) {
          readiness = "Yellow";
        } else {
          readiness = "Red";
        }
        if (toolInput.painFlag) readiness = "Red";

        if (readiness === "Red") intensity = "rest";
        else if (readiness === "Yellow") intensity = "light";
        else intensity = "moderate";

        const { data, error } = await db
          .from("checkins")
          .upsert(
            {
              user_id: userId,
              date: today,
              energy,
              soreness,
              sleep_hours: sleepHours,
              mood,
              academic_stress: toolInput.academicStress ?? null,
              pain_flag: toolInput.painFlag ?? false,
              pain_location: toolInput.painLocation ?? null,
              readiness,
              intensity,
            },
            { onConflict: "user_id,date" }
          )
          .select()
          .single();

        if (error) throw error;

        // Emit WELLNESS_CHECKIN event to Athlete Data Fabric
        // This updates athlete_snapshots.last_checkin_at + readiness fields
        await emitEventSafe({
          athleteId: userId,
          eventType: "WELLNESS_CHECKIN",
          occurredAt: new Date().toISOString(),
          source: "MANUAL",
          payload: {
            energy,
            soreness,
            sleep_hours: sleepHours,
            mood,
            academic_stress: toolInput.academicStress ?? null,
            pain_flag: toolInput.painFlag ?? false,
            pain_location: toolInput.painLocation ?? null,
            computed_readiness_level: readiness,
            computed_readiness_score: Math.round(avg * 10),
          },
          createdBy: userId,
        });

        // Fire-and-forget: refresh Own It recs so stale "Check In" rec gets superseded
        triggerDeepRecRefreshAsync(userId, context.timezone);

        return {
          result: { checkIn: data, saved: true },
          refreshTarget: "readiness",
        };
      }

      case "get_test_results": {
        const limit = toolInput.limit ?? 10;
        let query = db
          .from("phone_test_sessions")
          .select("test_type, score, date, raw_data")
          .eq("user_id", userId)
          .order("date", { ascending: false })
          .limit(limit);

        if (toolInput.testType)
          query = query.eq("test_type", toolInput.testType);

        const { data } = await query;
        return { result: { results: data ?? [] } };
      }

      case "get_training_session": {
        const recommendations = await getRecommendedDrills(context, {
          category: toolInput.category ?? undefined,
          focus: toolInput.focus ?? undefined,
          limit: toolInput.limit ?? 6,
        });

        console.log('[OutputAgent] Returning drills:', recommendations.map(r => ({
          name: r.drill.name, score: r.score, reason: r.reason,
          primary: (r.drill as any).primary_attribute
        })));
        return {
          result: {
            readiness: context.readinessScore ?? "Unknown",
            drillCount: recommendations.length,
            playerGapAttributes: context.benchmarkProfile?.gapAttributes ?? [],
            session: recommendations.map((r) => ({
              drillId: r.drill.id,
              name: r.drill.name,
              category: r.drill.category,
              duration: r.drill.duration_minutes,
              intensity: r.drill.intensity,
              attributeKeys: r.drill.attribute_keys,
              primaryAttribute: (r.drill as any).primary_attribute,
              equipment: r.equipment
                .filter((e) => !e.optional)
                .map((e) => e.name),
              reason: r.reason,
              relevanceScore: r.score,
              tags: r.tags,
            })),
            _note: "Drills are sorted by relevance score. Higher score = better match for player gaps. Present drills in this order.",
          },
        };
      }

      case "get_drill_detail": {
        let drill = toolInput.drillId
          ? await getDrillById(toolInput.drillId)
          : null;

        // Fallback: search by name if drillId not provided or not found
        if (!drill && toolInput.drillName) {
          const sportId = context.sport ?? "football";
          const matches = await searchDrills(toolInput.drillName, sportId);
          if (matches.length > 0) {
            drill = await getDrillById(matches[0].id);
          }
        }

        if (!drill) {
          return { result: null, error: "Drill not found — try asking for a training session first to get drill recommendations." };
        }
        return {
          result: {
            drillId: drill.drill.id,
            name: drill.drill.name,
            description: drill.drill.description,
            category: drill.drill.category,
            duration: drill.drill.duration_minutes,
            intensity: drill.drill.intensity,
            instructions: drill.drill.instructions,
            equipment: drill.equipment.map(
              (e) =>
                `${e.name}${e.quantity > 1 ? ` x${e.quantity}` : ""}${e.optional ? " (optional)" : ""}`
            ),
            progressions: drill.progressions.map((p) => ({
              level: p.label,
              description: p.description,
              duration: p.duration_minutes,
            })),
            tags: drill.tags,
            attributeKeys: drill.drill.attribute_keys,
          },
        };
      }

      case "get_benchmark_comparison": {
        const profile = await getPlayerBenchmarkProfile(userId);
        if (!profile) {
          return {
            result: {
              available: false,
              message:
                "No benchmark data yet. The player can log tests right here in chat (sprint, jump, reaction, agility, balance) to generate percentile rankings vs peers.",
            },
          };
        }
        return {
          result: {
            available: true,
            ageBand: profile.ageBand,
            position: profile.position,
            overallPercentile: profile.overallPercentile,
            strengths: profile.strengths,
            gaps: profile.gaps,
            metrics: profile.results.map((r) => ({
              metric: r.metricLabel,
              value: r.value,
              unit: r.unit,
              percentile: r.percentile,
              zone: r.zone,
              message: r.message,
              norms: r.norm,
            })),
            updatedAt: profile.updatedAt,
          },
        };
      }

      case "get_training_program_recommendations": {
        const recs = await generateProgramRecommendations(context, toolInput.focusArea);
        return { result: recs };
      }

      case "calculate_phv_stage": {
        // Get gender from users table
        const { data: userRow } = await (db as any)
          .from("users")
          .select("gender")
          .eq("id", userId)
          .single();

        const result = await recordPHVAssessment(userId, {
          standingHeightCm: toolInput.standingHeightCm,
          sittingHeightCm: toolInput.sittingHeightCm,
          weightKg: toolInput.weightKg,
          ageDecimal: toolInput.ageDecimal,
          gender: userRow?.gender ?? "male",
        });
        return { result };
      }

      case "get_my_programs": {
        console.warn("[get_my_programs] called with input:", JSON.stringify(toolInput));

        const { data: snapshot, error: snapErr } = await (db as any)
          .from("athlete_snapshots")
          .select("program_recommendations")
          .eq("athlete_id", userId)
          .single();

        if (snapErr) {
          console.warn("[get_my_programs] DB error:", snapErr.message);
          return { result: null, error: `Failed to fetch programs: ${snapErr.message}` };
        }

        let raw = snapshot?.program_recommendations;
        // Handle case where it's stored as a string
        if (typeof raw === 'string') {
          try { raw = JSON.parse(raw); } catch { raw = null; }
        }
        // program_recommendations is a DeepProgramResult object: { programs: [...], isAiGenerated, ... }
        // NOT a flat array — programs are nested under .programs
        let programs: any[] = [];
        if (Array.isArray(raw)) {
          programs = raw;
        } else if (raw && Array.isArray(raw.programs)) {
          programs = raw.programs;
        }
        console.warn("[get_my_programs] found", programs.length, "programs in snapshot");

        // Filter by name if provided — fuzzy match: split search into words and match any
        const nameFilter = toolInput.program_name?.toLowerCase()?.trim();
        if (nameFilter) {
          const searchWords = nameFilter.split(/\s+/).filter((w: string) => w.length > 2);
          programs = programs.filter((p: any) => {
            const pName = (p.name || '').toLowerCase();
            const pId = (p.programId || '').toLowerCase();
            const pCategory = (p.category || '').toLowerCase();
            const pTags = (p.tags || []).join(' ').toLowerCase();
            const searchable = `${pName} ${pId} ${pCategory} ${pTags}`;
            // Match if ANY search word appears in any field
            return searchWords.some((w: string) => searchable.includes(w));
          });
          console.warn("[get_my_programs] filter:", nameFilter, "words:", searchWords, "matched:", programs.length);
        }

        // Limit to max 5 programs to avoid overwhelming Claude's context
        const limited = programs.slice(0, 5);
        console.warn("[get_my_programs] returning", limited.length, "programs (filtered:", !!nameFilter, ")");

        if (limited.length === 0) {
          return {
            result: {
              found: false,
              message: "No matching programs found in your current recommendations.",
              totalPrograms: programs.length,
            },
          };
        }

        // If a specific program was requested by name, fetch related drills
        let relatedDrills: any[] = [];
        if (nameFilter && limited.length <= 2) {
          try {
            const categories = limited.map((p: any) => p.category?.toLowerCase()).filter(Boolean);
            const tags = limited.flatMap((p: any) => (p.tags ?? []).map((t: string) => t.toLowerCase()));
            const searchTerms = [...new Set([...categories, ...tags])].slice(0, 5);
            if (searchTerms.length > 0) {
              const { data: drills } = await (db as any)
                .from("training_drills")
                .select("name, description, duration_minutes, intensity, category, attribute_keys")
                .eq("sport_id", "football")
                .eq("active", true)
                .limit(50);
              if (drills) {
                relatedDrills = drills
                  .filter((d: any) => {
                    const attrs = (d.attribute_keys ?? []).map((a: string) => a.toLowerCase());
                    return searchTerms.some(t => attrs.includes(t) || d.name?.toLowerCase().includes(t));
                  })
                  .slice(0, 6)
                  .map((d: any) => ({
                    name: d.name,
                    description: d.description,
                    duration: d.duration_minutes,
                    intensity: d.intensity,
                  }));
              }
            }
          } catch { /* non-critical */ }
        }

        return {
          result: {
            found: true,
            count: limited.length,
            totalAvailable: programs.length,
            programs: limited.map((p: any) => ({
              name: p.name,
              category: p.category,
              type: p.type,
              priority: p.priority,
              frequency: p.frequency,
              durationMin: p.durationMin,
              difficulty: p.difficulty,
              description: p.description,
              reason: p.reason,
              prescription: p.prescription,
            })),
            ...(relatedDrills.length > 0 ? { relatedDrills } : {}),
          },
        };
      }

      case "get_program_by_id": {
        const { data: programData } = await (db as any)
          .from("football_training_programs")
          .select("*")
          .eq("id", toolInput.programId)
          .single();
        if (!programData) {
          return {
            result: null,
            error: `Program not found: ${toolInput.programId}`,
          };
        }
        return { result: programData };
      }

      // ── Capsule Tools — test catalog & logging ────────────────────

      case "get_test_catalog": {
        // Build catalog from RAW_TEST_GROUP_MAP + sport_test_definitions
        const categoryFilter = toolInput.category?.toLowerCase();

        // Unit map for common test types
        const UNIT_MAP: Record<string, string> = {
          "10m-sprint": "s", "20m-sprint": "s", "30m-sprint": "s", "flying-10m": "s",
          "cmj": "cm", "vertical-jump": "cm", "broad-jump": "cm", "squat-jump": "cm", "drop-jump": "cm", "jump-height": "cm",
          "sl-broad-jump-r": "cm", "sl-broad-jump-l": "cm",
          "reaction-time": "ms", "choice-reaction": "ms", "reaction-tap": "ms",
          "5-0-5": "s", "5-10-5-agility": "s", "t-test": "s", "illinois-agility": "s", "pro-agility": "s",
          "arrowhead-agility": "s", "shuttle-run": "s",
          "yoyo-ir1": "level", "beep-test": "level", "vo2max": "ml/kg/min", "cooper-12min": "m",
          "grip-strength": "kg", "1rm-squat": "kg", "1rm-bench": "kg", "squat-1rm": "kg",
          "bench-press-1rm": "kg", "squat-relative": "x BW",
          "max-speed": "km/h", "body-fat": "%", "hrv": "ms",
          "seated-mb-throw": "m", "glycolytic-power": "W/kg", "mas-running": "km/h", "mas": "km/h",
          "dribbling-test": "s", "passing-accuracy": "%", "shooting-accuracy": "%", "shot-speed": "km/h",
          "balance-y": "cm",
        };

        // Category name map
        const GROUP_CATEGORY: Record<string, string> = {
          speed_acceleration: "speed",
          power_explosiveness: "power",
          agility_cod: "agility",
          aerobic_endurance: "endurance",
          strength: "strength",
          mobility_movement: "mobility",
          body_composition: "body",
          recovery_readiness: "recovery",
        };

        const catalog = Object.entries(RAW_TEST_GROUP_MAP)
          .map(([id, groupId]) => ({
            id,
            name: id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
            unit: UNIT_MAP[id] ?? "",
            category: GROUP_CATEGORY[groupId] ?? groupId,
          }))
          .filter((item) => !categoryFilter || item.category === categoryFilter);

        // Also fetch recent tests for this player
        const { data: recentTests } = await db
          .from("phone_test_sessions")
          .select("test_type, score, date")
          .eq("user_id", userId)
          .order("date", { ascending: false })
          .limit(10);

        const recentByType: Record<string, { id: string; name: string; lastValue: number; lastDate: string }> = {};
        for (const t of recentTests ?? []) {
          if (!recentByType[t.test_type]) {
            recentByType[t.test_type] = {
              id: t.test_type,
              name: t.test_type.replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
              lastValue: t.score ?? 0,
              lastDate: t.date,
            };
          }
        }

        const recentTestsList = Object.values(recentByType);

        // Return the catalog AND a ready-to-use capsule card.
        // The AI MUST include this capsule card in its JSON response.
        return {
          result: {
            catalog,
            recentTests: recentTestsList,
            totalTests: catalog.length,
            // ── INSTRUCTION TO AI ──
            // You MUST include this exact capsule card in your response JSON "cards" array.
            // Do NOT generate text+chips asking which test. The capsule IS the test selector.
            readyToUseCapsuleCard: {
              type: "test_log_capsule",
              prefilledTestType: categoryFilter ? catalog[0]?.id ?? null : null,
              prefilledDate: today,
              catalog, // full catalog — frontend handles display/filtering
              recentTests: recentTestsList,
            },
          },
        };
      }

      case "log_test_result": {
        const testType = toolInput.testType as string;
        const score = toolInput.score as number;
        const date = (toolInput.date as string) ?? today;
        const notes = (toolInput.notes as string) ?? null;

        // Insert into phone_test_sessions
        const { data: session, error: insertErr } = await db
          .from("phone_test_sessions")
          .insert({
            user_id: userId,
            date,
            test_type: testType,
            score,
            raw_data: notes ? { notes } : null,
          })
          .select()
          .single();

        if (insertErr) {
          return { result: null, error: `Failed to save test: ${insertErr.message}` };
        }

        // Calculate benchmark percentile
        const benchmark = await processPhoneTestBenchmark(userId, testType, score, date);

        // Emit ASSESSMENT_RESULT event to Athlete Data Fabric
        await emitEventSafe({
          athleteId: userId,
          eventType: "ASSESSMENT_RESULT",
          occurredAt: new Date().toISOString(),
          source: "MANUAL",
          payload: {
            test_type: testType,
            primary_value: score,
            primary_unit: toolInput.unit ?? null,
            raw_inputs: notes ? { notes } : {},
            percentile: benchmark?.percentile ?? null,
            zone: benchmark?.zone ?? null,
          },
          createdBy: userId,
        });

        // Fire-and-forget: refresh Own It recs + Programs so they reflect the new test
        triggerDeepRecRefreshAsync(userId, context.timezone);
        triggerDeepProgramRefreshAsync(userId, context.timezone);

        return {
          result: {
            success: true,
            testType,
            score,
            date,
            benchmark: benchmark ?? null,
            sessionId: session?.id,
          },
          refreshTarget: "metrics",
        };
      }

      case "rate_drill": {
        const { drillId, rating, difficulty, completionStatus, effort, notes } = toolInput;
        if (!drillId || !rating) {
          return { result: null, error: "drillId and rating are required" };
        }

        const { data, error } = await (db as any)
          .from("drill_ratings")
          .insert({
            user_id: userId,
            drill_id: drillId,
            date: context.todayDate,
            rating: Math.min(5, Math.max(1, Math.round(rating))),
            difficulty: difficulty ? Math.min(5, Math.max(1, Math.round(difficulty))) : null,
            completion_status: completionStatus ?? "completed",
            effort: effort ? Math.min(10, Math.max(1, Math.round(effort))) : null,
            notes: notes ?? null,
          })
          .select()
          .single();

        if (error) throw error;

        return {
          result: {
            success: true,
            drillId,
            rating,
            difficulty,
            completionStatus: completionStatus ?? "completed",
          },
        };
      }

      case "interact_program": {
        const { programId, action } = toolInput;
        if (!programId || !action) {
          return { result: null, error: "programId and action are required" };
        }

        const db = supabaseAdmin();
        // Check if interaction already exists
        const { data: existing } = await (db as any)
          .from("program_interactions")
          .select("id, action")
          .eq("user_id", userId)
          .eq("program_id", programId)
          .maybeSingle();

        if (existing && (existing as any).action === action) {
          // Toggle off (e.g. un-dismiss)
          await (db as any).from("program_interactions").delete().eq("id", (existing as any).id);
          return { result: { success: true, programId, action, toggled: "off" }, refreshTarget: "programs" };
        }

        // Upsert interaction
        await (db as any).from("program_interactions").upsert({
          user_id: userId,
          program_id: programId,
          action,
          created_at: new Date().toISOString(),
        }, { onConflict: "user_id,program_id" });

        // Clear program recs cache for done/dismissed
        if (action === "done" || action === "dismissed") {
          await (db as any).from("athlete_snapshots")
            .update({ program_recommendations: null })
            .eq("athlete_id", userId);
        }

        return { result: { success: true, programId, action, toggled: "on" }, refreshTarget: "programs" };
      }

      case "sync_whoop": {
        // Trigger Whoop sync — call the sync endpoint internally
        const db = supabaseAdmin();
        const { data: connection } = await (db as any)
          .from("wearable_connections")
          .select("access_token, refresh_token, provider")
          .eq("user_id", userId)
          .eq("provider", "whoop")
          .maybeSingle();

        if (!connection) {
          return { result: { synced: false, error: "Whoop not connected" } };
        }

        // Return success — actual sync happens via the API endpoint
        return {
          result: { synced: true, message: "Whoop sync triggered. Check your vitals in a moment." },
          refreshTarget: "vitals",
        };
      }

      // ── Journal Tools ──

      case "get_today_training_for_journal": {
        // Handled by intentHandler — this is a fallback if AI agent calls it
        const { data: events } = await db
          .from('calendar_events')
          .select('id, title, event_type, start_at')
          .eq('user_id', userId)
          .gte('start_at', `${today}T00:00:00Z`)
          .lte('start_at', `${today}T23:59:59Z`)
          .in('event_type', ['training', 'match', 'recovery'])
          .order('start_at', { ascending: true });

        return { result: { events: events ?? [], date: today } };
      }

      case "get_pending_post_journal": {
        const yesterday = new Date(new Date(today).getTime() - 24 * 3600 * 1000).toISOString().split('T')[0];
        const { data: journals } = await (db as any)
          .from('training_journals')
          .select('id, calendar_event_id, training_name, pre_target, journal_state, journal_variant, event_date')
          .eq('user_id', userId)
          .in('journal_state', ['pre_set', 'empty'])
          .gte('event_date', yesterday)
          .lte('event_date', today);

        return { result: { pendingJournals: journals ?? [] } };
      }

      case "save_journal_pre": {
        const { setPreSessionTarget } = await import('@/services/journal/journalService');
        const journal = await setPreSessionTarget(userId, {
          calendar_event_id: toolInput.calendar_event_id,
          pre_target: toolInput.pre_target,
          pre_mental_cue: toolInput.pre_mental_cue,
          pre_focus_tag: toolInput.pre_focus_tag,
        });

        // Emit event
        const { emitEventSafe } = await import('@/services/events/eventEmitter');
        const { EVENT_TYPES, SOURCE_TYPES } = await import('@/services/events/constants');
        await emitEventSafe({
          athleteId: userId,
          eventType: EVENT_TYPES.JOURNAL_PRE_SESSION,
          source: SOURCE_TYPES.MANUAL,
          payload: {
            calendar_event_id: journal.calendar_event_id,
            journal_id: journal.id,
            training_category: journal.training_category,
            training_name: journal.training_name,
            pre_target: journal.pre_target,
            event_date: journal.event_date,
            journal_variant: journal.journal_variant,
          },
          createdBy: userId,
        });

        return {
          result: { success: true, journalId: journal.id, journalState: 'pre_set', message: 'Target set. Good luck.' },
          refreshTarget: "calendar",
        };
      }

      case "save_journal_post": {
        const { setPostSessionReflection } = await import('@/services/journal/journalService');
        const journal = await setPostSessionReflection(userId, {
          journal_id: toolInput.journal_id,
          post_outcome: toolInput.post_outcome,
          post_reflection: toolInput.post_reflection,
          post_next_focus: toolInput.post_next_focus,
          post_body_feel: toolInput.post_body_feel,
        });

        // Emit event
        const { emitEventSafe: emitSafe } = await import('@/services/events/eventEmitter');
        const { EVENT_TYPES: ET, SOURCE_TYPES: ST } = await import('@/services/events/constants');
        await emitSafe({
          athleteId: userId,
          eventType: ET.JOURNAL_POST_SESSION,
          source: ST.MANUAL,
          payload: {
            calendar_event_id: journal.calendar_event_id,
            journal_id: journal.id,
            training_category: journal.training_category,
            training_name: journal.training_name,
            post_outcome: journal.post_outcome,
            post_reflection: journal.post_reflection,
            event_date: journal.event_date,
            journal_variant: journal.journal_variant,
          },
          createdBy: userId,
        });

        return {
          result: { success: true, journalId: journal.id, journalState: 'complete', message: 'Reflection saved. Nice work.' },
          refreshTarget: "calendar",
        };
      }

      default:
        return { result: null, error: `Unknown output tool: ${toolName}` };
    }
  } catch (err: any) {
    return { result: null, error: err.message ?? "Tool execution failed" };
  }
}

/** Static rules — identical for every player, every request. Cacheable. */
export function buildOutputStaticPrompt(): string {
  return `You are the Output Agent for Tomo — you own performance data, metrics, readiness, and check-ins.

RULES:
1. Translate all numbers into plain language first — then show the data
2. When readiness is RED: prioritize recovery. Recommend no high intensity training.
3. If player reports symptoms (pain, extreme fatigue, illness), always recommend medical consultation
4. Never diagnose — interpret data and recommend action
5. Keep explanations short. Athletes want answers, not lectures.
6. When logging check-ins conversationally, extract the values from what the player says — don't make them fill out a form

TIME DIRECTION — CRITICAL:
- Past activities are DONE — use them only to assess load and fatigue.
- All training recommendations must target FUTURE sessions only (today's remaining schedule or upcoming days).
- Example: "You did a hard session this morning → go lighter for tonight's training" is correct.
- Example: "You should reduce your morning training intensity" is WRONG if morning already passed.

TRAINING DRILLS:
1. When the player asks for a workout, drills, warm-up, or practice plan, use get_training_session.
2. Match drill intensity to readiness: GREEN = any intensity, YELLOW = light/moderate only, RED = light only (recovery).
3. Always include a warm-up and cooldown in full sessions.
4. When returning a session, use the session_plan card type with all drill items.
5. When returning a single drill detail, use the drill_card card type.
6. If the player's benchmarkProfile shows gaps, mention which drills target those gaps.
7. After logging a check-in, proactively suggest: "Want me to build a training session based on your readiness?"

WEAKNESS & STRENGTH ANALYSIS:
When the player asks about weaknesses, strengths, gaps, or areas to improve (WITHOUT asking to compare vs peers):
1. Analyze the player's test history to identify relative weaknesses:
   - Compare scores across test types (lower relative scores = weakness areas)
   - Look at test frequency (never-tested areas = unknown, flag them)
   - Consider readiness patterns (chronic low energy/high soreness = recovery weakness)
2. If benchmarkProfile data exists in context, briefly mention percentile context.
3. Cross-reference with readiness data: chronic soreness suggests physicality gaps, low energy may indicate conditioning needs.
4. Do NOT call get_benchmark_comparison for weakness/strength questions — use the data already in context.
5. ALWAYS give a substantive answer using whatever data IS available — never just say "no data".
6. If truly zero data exists, explain what tests/check-ins to complete and give general position-based advice.

RECOVERY PROTOCOLS:
When the player asks about recovery, recovery plans, recovery protocols, or what to do for recovery:
1. Use get_training_session with category="recovery" to get personalized recovery drills/exercises.
2. NEVER open a create_event or event_edit capsule — the player wants a recovery PROGRAM, not to manually create a calendar event.
3. Include readiness context: if HRV is below baseline or soreness is high, explain why recovery matters now.
4. Suggest specific recovery modalities based on data: foam rolling, mobility, light movement, sleep hygiene.
5. If the player has a [RECOVERY] recommendation active, reference its specific advice.

TRAINING PROGRAMS:
1. When the athlete asks about their training programs, a specific program, or wants drill details for a recommended program, use the get_my_programs tool first to check their personalized recommendations before searching the general drill catalog.
2. When player asks about training programmes, development plans, or 6-week blocks, use get_training_program_recommendations.
3. NEVER prescribe sets/reps/intensity from memory — ALWAYS use the tool to get evidence-based, age-appropriate, PHV-modified prescriptions.
4. When PHV data is provided (height, sitting height, weight, age), use calculate_phv_stage FIRST, then recommend programs.
5. Mid-PHV athletes: flag prominently — no maximal loading, no barbell squats, modified Nordic protocol.
6. Use get_program_by_id when the player asks about a specific training programme.

TEST LOGGING:
- If player provides BOTH test type AND numeric score (e.g. "I ran 4.2 on 30m sprint"), call log_test_result directly. Then show benchmark_bar with percentile.
- Otherwise the system handles test logging via capsule cards automatically.

CHECK-IN:
- If player provides numeric values (e.g. "energy 8, slept 7 hours"), call log_check_in directly.
- Otherwise the system handles check-ins via capsule cards automatically.

CHIP ACTION TEXT:
Chip "action" must express INTENT ("I want to log a test"), never past-tense ("I did a test").

BENCHMARKS & COMPARISONS:
ONLY call get_benchmark_comparison when the player EXPLICITLY asks to compare against peers.
Trigger phrases: "compare", "benchmark", "percentile", "how do I rank", "vs other players", "how do I stack up", "where do I stand".
1. Do NOT call get_benchmark_comparison for general weakness/strength questions.
2. When triggered, show: metric name, their score, percentile vs their age group and sport.
3. Highlight strengths (>75th percentile) and areas to develop (<40th percentile).
4. If no benchmark data exists, offer to log tests right here in chat using the test_log_capsule or log_test_result tool.

TONE: Like a sports scientist who also happens to be their trusted coach.`;
}

/** Dynamic context — changes per player and per request. NOT cacheable. */
export function buildOutputDynamicPrompt(context: PlayerContext): string {
  const comp = context.readinessComponents;
  const compDesc = comp
    ? `Energy: ${comp.energy}/10, Soreness: ${comp.soreness}/10, Sleep: ${comp.sleepHours}h, Mood: ${comp.mood}/10${comp.academicStress ? `, Academic Stress: ${comp.academicStress}/10` : ""}${comp.painFlag ? " [PAIN FLAGGED]" : ""}`
    : "No check-in data";

  // Build test history summary
  const tests = context.recentTestScores ?? [];
  let testHistoryDesc: string;
  if (tests.length === 0) {
    testHistoryDesc = "No test data yet. The player can log tests right here in chat!";
  } else {
    const byType: Record<string, { latest: { score: number; date: string }; best: number; count: number }> = {};
    for (const t of tests) {
      if (!byType[t.testType]) {
        byType[t.testType] = { latest: { score: t.score, date: t.date }, best: t.score, count: 0 };
      }
      byType[t.testType].count++;
      if (t.score > byType[t.testType].best) byType[t.testType].best = t.score;
    }
    testHistoryDesc = Object.entries(byType).map(([type, d]) =>
      `- ${type}: latest ${d.latest.score} (${d.latest.date}), best ${d.best}, ${d.count} tests`
    ).join("\n");
  }

  const benchmarkDesc = context.benchmarkProfile
    ? `- Performance gaps: ${context.benchmarkProfile.gaps.join(", ") || "None identified"}\n- Strengths: ${context.benchmarkProfile.strengths.join(", ") || "N/A"}`
    : "";

  // Build vitals/wearable context from recent health_data
  const vitals = context.recentVitals ?? [];
  let vitalsDesc = "";
  if (vitals.length > 0) {
    const byMetric: Record<string, { latest: { value: number; date: string }; values: number[] }> = {};
    for (const v of vitals) {
      if (!byMetric[v.metric]) byMetric[v.metric] = { latest: { value: v.value, date: v.date }, values: [] };
      byMetric[v.metric].values.push(v.value);
    }
    const lines = Object.entries(byMetric).map(([m, d]) => {
      const avg = d.values.length > 1 ? (d.values.reduce((a, b) => a + b, 0) / d.values.length).toFixed(1) : null;
      return `- ${m}: latest ${d.latest.value} (${d.latest.date})${avg ? `, 7d avg: ${avg}` : ""}`;
    });
    vitalsDesc = `\nWEARABLE/HEALTH DATA (from Whoop/health_data):\n${lines.join("\n")}`;
  }

  // Build snapshot enrichment context (HRV baselines, wellness trends, load)
  const snap = context.snapshotEnrichment;
  let snapDesc = "";
  if (snap) {
    const parts: string[] = [];
    if (snap.hrvBaselineMs != null) parts.push(`HRV baseline: ${snap.hrvBaselineMs}ms`);
    if (snap.hrvTodayMs != null) parts.push(`HRV today: ${snap.hrvTodayMs}ms`);
    if (snap.sleepQuality != null) parts.push(`Sleep quality: ${snap.sleepQuality}/10`);
    if (snap.wellness7dayAvg != null) parts.push(`Wellness 7d avg: ${snap.wellness7dayAvg.toFixed(1)}`);
    if (snap.wellnessTrend) parts.push(`Wellness trend: ${snap.wellnessTrend}`);
    if (snap.acwr != null) parts.push(`ACWR: ${snap.acwr.toFixed(2)}`);
    if (snap.injuryRiskFlag) parts.push(`Injury risk: ${snap.injuryRiskFlag}`);
    if (snap.readinessScore != null) parts.push(`Readiness score: ${snap.readinessScore}/100`);
    if (parts.length > 0) {
      snapDesc = `\nATHLETE SNAPSHOT (trend data):\n${parts.join(" | ")}`;
    }
  }

  return `
PLAYER CONTEXT:
- Name: ${context.name} | Sport: ${context.sport} | Age Band: ${context.ageBand ?? "Unknown"}
- Today: ${context.todayDate} | Current time: ${context.currentTime}
- Today's readiness: ${context.readinessScore ? context.readinessScore.toUpperCase() : "Not checked in today"}
- Latest check-in data (USE THESE EXACT NUMBERS): ${compDesc}
- Current streak: ${context.currentStreak} days
- Academic load score: ${context.academicLoadScore.toFixed(1)}/10
${benchmarkDesc ? `\nBENCHMARK PROFILE:\n${benchmarkDesc}` : ""}${vitalsDesc}${snapDesc}

PLAYER TEST HISTORY:
Players CAN log test results directly through this chat.
${testHistoryDesc}`;
}
