/**
 * GET /api/v1/programs/recommend — Personalised program recommendations
 *
 * Builds lightweight PlayerContext from user profile and runs
 * the program recommendation engine.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { generateProgramRecommendations } from "@/services/programs/programRecommendationEngine";
import { getSnapshotState, applyInjuryGate } from "@/services/programs/programGuardrails";
import type { PlayerContext } from "@/services/agents/contextBuilder";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;

  const db = supabaseAdmin();
  const userId = auth.user.id;

  // Fetch user profile for lightweight context
  const { data: profile } = await (db as any)
    .from("users")
    .select("name, sport, age, position, role, current_streak")
    .eq("id", userId)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Derive age band
  let ageBand: string | null = null;
  if (profile.age) {
    const age = profile.age;
    if (age < 13) ageBand = "U13";
    else if (age < 15) ageBand = "U15";
    else if (age < 17) ageBand = "U17";
    else if (age < 19) ageBand = "U19";
    else if (age < 21) ageBand = "U21";
    else if (age < 30) ageBand = "SEN";
    else ageBand = "VET";
  }

  // Build minimal context for the recommendation engine
  const context: PlayerContext = {
    userId,
    name: profile.name ?? "Athlete",
    sport: profile.sport ?? "football",
    position: profile.position ?? null,
    ageBand,
    gender: null,
    heightCm: null,
    weightKg: null,
    role: (profile.role as PlayerContext["role"]) ?? "player",
    todayDate: new Date().toISOString().split("T")[0],
    currentTime: "12:00",
    todayEvents: [],
    readinessScore: null,
    checkinDate: null,
    readinessComponents: null,
    upcomingExams: [],
    upcomingEvents: [],
    academicLoadScore: 0,
    recentVitals: [],
    currentStreak: profile.current_streak ?? 0,
    benchmarkProfile: null,
    recentTestScores: [],
    historicalData: null,
    temporalContext: {
      timeOfDay: "afternoon",
      isMatchDay: false,
      matchDetails: null,
      daysToNextMatch: null,
      matchImportance: null,
      isExamProximity: false,
      examDetails: null,
      dayType: "training",
      suggestion: "",
      periodizationPhase: null,
    },
    schedulePreferences: {} as any,
    activeScenario: "default" as any,
    activeTab: "Chat",
    lastUserMessage: "",
    timezone: "UTC",
    snapshotEnrichment: null,
    activeRecommendations: [],
    planningContext: null,
    wearableStatus: null,
    ccrs7day: [],
    sleep7day: [],
  };

  try {
    const recommendations = await generateProgramRecommendations(context);

    // ── Active-injury gate ──
    // Filter program categories that load a flagged body region.
    // The snapshot is read live (post-capsule writes are awaited in
    // injuryHandler), so the very next call after a "Log this concern"
    // capsule sees the updated injury_risk_flag.
    const snapshot = await getSnapshotState(userId);
    let appliedRules: string[] = [];
    let blockedCategories: string[] = [];
    if (snapshot) {
      const m = applyInjuryGate(recommendations.mandatory, snapshot);
      const h = applyInjuryGate(recommendations.highPriority, snapshot);
      const t = applyInjuryGate(recommendations.technical, snapshot);
      const i = applyInjuryGate(recommendations.injuryPrevention, snapshot);
      recommendations.mandatory = m.programs;
      recommendations.highPriority = h.programs;
      recommendations.technical = t.programs;
      recommendations.injuryPrevention = i.programs;
      // appliedRules/blockedCategories are identical across calls (gate is
      // deterministic in snapshot), so dedupe via the first non-empty bucket.
      appliedRules = m.appliedRules;
      blockedCategories = m.blockedCategories;
    }

    return NextResponse.json({ ...recommendations, appliedRules, blockedCategories });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? "Failed to generate recommendations" },
      { status: 500 }
    );
  }
}
