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
import { getPlayerBenchmarkProfile } from "@/services/benchmarkService";
import { generateProgramRecommendations } from "@/services/programs/programRecommendationEngine";
import {
  calculatePHV,
  recordPHVAssessment,
} from "@/services/programs/phvCalculator";

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
      "Get the player's phone test history — reaction time, jump, sprint, agility, balance. Use when asked about performance test scores or recent results.",
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
      "Get the athlete's current personalized training programs including AI-generated and coach-assigned programs. Use this when the athlete asks about their programs, a specific program by name, or wants details about a recommended training program.",
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
        const { data: checkin } = await db
          .from("checkins")
          .select(
            "energy, soreness, sleep_hours, mood, academic_stress, pain_flag, pain_location, readiness, intensity, effort_yesterday"
          )
          .eq("user_id", userId)
          .eq("date", date)
          .maybeSingle();

        return { result: { date, checkIn: checkin } };
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
                "No benchmark data yet. The player needs to complete phone tests (sprint, jump, reaction, agility, balance) to generate percentile rankings vs peers.",
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
        const recs = await generateProgramRecommendations(context);
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

      default:
        return { result: null, error: `Unknown output tool: ${toolName}` };
    }
  } catch (err: any) {
    return { result: null, error: err.message ?? "Tool execution failed" };
  }
}

export function buildOutputSystemPrompt(context: PlayerContext): string {
  const comp = context.readinessComponents;
  const compDesc = comp
    ? `Energy: ${comp.energy}/10, Soreness: ${comp.soreness}/10, Sleep: ${comp.sleepHours}h, Mood: ${comp.mood}/10${comp.academicStress ? `, Academic Stress: ${comp.academicStress}/10` : ""}${comp.painFlag ? " [PAIN FLAGGED]" : ""}`
    : "No check-in data";

  return `You are the Output Agent for Tomo — you own performance data, metrics, readiness, and check-ins.

PLAYER CONTEXT:
- Name: ${context.name} | Sport: ${context.sport} | Age Band: ${context.ageBand ?? "Unknown"}
- Today: ${context.todayDate} | Current time: ${context.currentTime}
- Today's readiness: ${context.readinessScore ? context.readinessScore.toUpperCase() : "Not checked in today"}
- Latest components: ${compDesc}
- Current streak: ${context.currentStreak} days
- Academic load score: ${context.academicLoadScore.toFixed(1)}/10

RULES:
1. Translate all numbers into plain language first — then show the data
2. When readiness is RED: prioritize recovery. Recommend no high intensity training.
3. If player reports symptoms (pain, extreme fatigue, illness), always recommend medical consultation
4. Never diagnose — interpret data and recommend action
5. Keep explanations short. Athletes want answers, not lectures.
6. When logging check-ins conversationally, extract the values from what the player says — don't make them fill out a form

TIME DIRECTION — CRITICAL:
- The current time is ${context.currentTime}. Past activities are DONE — use them only to assess load and fatigue.
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
${context.benchmarkProfile ? `- Performance gaps: ${context.benchmarkProfile.gaps.join(", ") || "None identified"}
- Strengths: ${context.benchmarkProfile.strengths.join(", ") || "N/A"}` : ""}

PLAYER TEST HISTORY:
${(() => {
  const tests = context.recentTestScores ?? [];
  if (tests.length === 0) return "No phone test data yet.";
  // Group by test type, show latest + best
  const byType: Record<string, { latest: { score: number; date: string }; best: number; count: number }> = {};
  for (const t of tests) {
    if (!byType[t.testType]) {
      byType[t.testType] = { latest: { score: t.score, date: t.date }, best: t.score, count: 0 };
    }
    byType[t.testType].count++;
    if (t.score > byType[t.testType].best) byType[t.testType].best = t.score;
  }
  return Object.entries(byType).map(([type, d]) =>
    `- ${type}: latest ${d.latest.score} (${d.latest.date}), best ${d.best}, ${d.count} tests`
  ).join("\n");
})()}

WEAKNESS & STRENGTH ANALYSIS:
When the player asks about weaknesses, strengths, gaps, or areas to improve (WITHOUT asking to compare vs peers):
1. Analyze the player's test history above to identify relative weaknesses:
   - Compare scores across test types (lower relative scores = weakness areas)
   - Look at test frequency (never-tested areas = unknown, flag them)
   - Consider readiness patterns (chronic low energy/high soreness = recovery weakness)
2. If benchmarkProfile data exists in context above, briefly mention percentile context.
3. Cross-reference with readiness data: chronic soreness suggests physicality gaps, low energy may indicate conditioning needs.
4. Do NOT call get_benchmark_comparison for weakness/strength questions — use the data already in context.
5. ALWAYS give a substantive answer using whatever data IS available — never just say "no data".
6. If truly zero data exists, explain what tests/check-ins to complete and give general position-based advice.

TRAINING PROGRAMS:
1. When the athlete asks about their training programs, a specific program, or wants drill details for a recommended program, use the get_my_programs tool first to check their personalized recommendations before searching the general drill catalog.
2. When player asks about training programmes, development plans, or 6-week blocks, use get_training_program_recommendations.
3. NEVER prescribe sets/reps/intensity from memory — ALWAYS use the tool to get evidence-based, age-appropriate, PHV-modified prescriptions.
4. When PHV data is provided (height, sitting height, weight, age), use calculate_phv_stage FIRST, then recommend programs.
5. Mid-PHV athletes: flag prominently — no maximal loading, no barbell squats, modified Nordic protocol.
6. Use get_program_by_id when the player asks about a specific training programme.

BENCHMARKS & COMPARISONS:
ONLY call get_benchmark_comparison when the player EXPLICITLY asks to compare against peers.
Trigger phrases: "compare", "benchmark", "percentile", "how do I rank", "vs other players", "how do I stack up", "where do I stand".
1. Do NOT call get_benchmark_comparison for general weakness/strength questions.
2. When triggered, show: metric name, their score, percentile vs ${context.ageBand ?? "their age group"} ${context.sport} players.
3. Highlight strengths (>75th percentile) and areas to develop (<40th percentile).
4. If no benchmark data exists, tell the player which phone tests to complete (sprint, jump, reaction, agility, balance).

TONE: Like a sports scientist who also happens to be their trusted coach.`;
}
