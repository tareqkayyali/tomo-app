/**
 * Training Plan Generator Service
 * Generates personalized, archetype-aware training plans.
 * Uses Green/Yellow/Red system with rest/light/moderate/hard intensities.
 */

import { getTemplate } from "../templates";
import {
  calculateReadiness,
  recommendIntensity,
  getPainGuidance,
  Intensity,
  DISCLAIMER,
} from "./readinessCalculator";
import {
  ArchetypeInfo,
  type Archetype,
  type ReadinessLevel,
  type IntensityLevel,
  type CheckinInput,
  type Exercise,
  type DecisionExplanation,
  type ArchetypeMessage,
  type GeneratedPlan,
} from "../types";

interface RecentPlan {
  workoutType: string;
}

/**
 * Generate a training plan based on check-in data and user profile.
 */
export function generatePlan(
  checkinData: Partial<CheckinInput>,
  user: { sport: string; archetype?: Archetype | null },
  daysSinceRest = 0,
  recentPlans: RecentPlan[] = []
): GeneratedPlan {
  const readinessResult = calculateReadiness(checkinData);
  const { readiness, alerts, recommendations, metrics } = readinessResult;

  const intensity = recommendIntensity({
    readiness,
    painFlag: metrics.painFlag,
    daysSinceRest,
    effortYesterday: metrics.effortYesterday,
    soreness: metrics.soreness,
    sleepHours: metrics.sleepHours,
    academicStress: metrics.academicStress,
  });

  let painGuidance: { message: string; alternatives: string[] } | null = null;
  if (metrics.painFlag) {
    painGuidance = getPainGuidance(metrics.painLocation);
  }

  const decisionExplanation = generateDecisionExplanation(
    readiness,
    intensity,
    metrics,
    daysSinceRest,
    user.archetype ?? undefined
  );

  const archetypeMessage = generateArchetypeMessage(
    user.archetype ?? undefined,
    readiness,
    intensity
  );

  if (intensity === Intensity.REST) {
    return generateRestDayPlan(
      readiness,
      alerts,
      recommendations,
      user,
      painGuidance,
      decisionExplanation,
      archetypeMessage
    );
  }

  const workoutType = determineWorkoutType(intensity, recentPlans);
  const template = getTemplate(user.sport);

  const workoutTemplate = template.workouts[workoutType];
  if (!workoutTemplate || !workoutTemplate[intensity]) {
    const generalTemplate = getTemplate("general");
    return generateFromTemplate(
      generalTemplate, workoutType, intensity, readiness,
      alerts, recommendations, user, painGuidance, decisionExplanation, archetypeMessage
    );
  }

  return generateFromTemplate(
    template, workoutType, intensity, readiness,
    alerts, recommendations, user, painGuidance, decisionExplanation, archetypeMessage
  );
}

function generateDecisionExplanation(
  readiness: ReadinessLevel,
  intensity: IntensityLevel,
  metrics: CheckinInput,
  daysSinceRest: number,
  archetype?: Archetype
): DecisionExplanation {
  const reasons: string[] = [];

  if (readiness === "Red") {
    if (metrics.painFlag) {
      reasons.push(`Pain reported${metrics.painLocation ? ` in ${metrics.painLocation}` : ""} - safety first.`);
    }
    if (metrics.energy <= 2 && metrics.soreness >= 7) {
      reasons.push("Very low energy combined with high soreness indicates overreach.");
    }
    if (metrics.sleepHours < 5) {
      reasons.push(`Only ${metrics.sleepHours}h sleep - severe rest deficit needs recovery.`);
    }
  } else if (readiness === "Yellow") {
    if (metrics.energy <= 5) reasons.push(`Energy at ${metrics.energy}/10 - moderate fatigue detected.`);
    if (metrics.soreness >= 7) reasons.push(`Soreness at ${metrics.soreness}/10 - muscles need recovery time.`);
    if (metrics.sleepHours < 6) reasons.push(`Only ${metrics.sleepHours}h sleep - prioritize recovery.`);
  } else {
    reasons.push(`Energy ${metrics.energy}/10, soreness ${metrics.soreness}/10, sleep ${metrics.sleepHours}h - good recovery indicators.`);
  }

  if (intensity === "rest" && daysSinceRest >= 6) {
    reasons.push(`${daysSinceRest} days since last rest - scheduled recovery day.`);
  } else if (intensity === "light" && metrics.effortYesterday >= 8) {
    reasons.push(`Yesterday's effort was ${metrics.effortYesterday}/10 - allowing adaptation.`);
  } else if (intensity === "hard") {
    reasons.push("Fresh and recovered - good day to push.");
  }

  if (metrics.academicStress != null && metrics.academicStress >= 7) {
    reasons.push(`Academic stress at ${metrics.academicStress}/10 — training intensity adjusted to support your study load.`);
  }

  if (archetype) {
    const info = ArchetypeInfo[archetype];
    if (info) reasons.push(`As a ${info.name}: ${info.calmMessage}`);
  }

  return {
    summary: `Recommended ${intensity.toUpperCase()} based on ${readiness} readiness.`,
    factors: reasons,
    readinessLevel: readiness,
    intensityLevel: intensity,
  };
}

function generateArchetypeMessage(
  archetype: Archetype | undefined,
  readiness: ReadinessLevel,
  intensity: IntensityLevel
): ArchetypeMessage | null {
  if (!archetype) {
    return {
      hasArchetype: false,
      message: "Complete 14 days of check-ins to discover your athletic archetype.",
    };
  }

  const info = ArchetypeInfo[archetype];
  if (!info) return null;

  let message = "";

  switch (archetype) {
    case "phoenix":
      if (readiness === "Red" || intensity === "rest") {
        message = "Your fire recovers fast, but today isn't the day to test it. Smart rest keeps you explosive for when it matters.";
      } else if (intensity === "hard") {
        message = "You're cleared for intensity. Channel your fire wisely - one great session beats two mediocre ones.";
      } else {
        message = "Build your base today. Your explosiveness is an asset - don't spend it cheaply.";
      }
      break;
    case "titan":
      if (readiness === "Red") {
        message = "Even mountains need to settle. Your strength is in steady accumulation - today, accumulate rest.";
      } else if (intensity === "rest") {
        message = "Rest isn't weakness for you - it's where your gains consolidate. Trust the process.";
      } else {
        message = "Steady progress, not peaks. Your volume tolerance is your superpower - use it wisely.";
      }
      break;
    case "blade":
      if (readiness === "Red" || intensity === "rest") {
        message = "Sharpness requires rest. Quality is your edge - never train dull.";
      } else if (intensity === "hard") {
        message = "You're sharp today. Make each rep count, and stop before quality fades.";
      } else {
        message = "Precision over volume. One perfect session > three sloppy ones.";
      }
      break;
    case "surge":
      if (readiness === "Red") {
        message = "Even waves need to retreat. Your energy will surge again - let it rebuild.";
      } else if (intensity === "light") {
        message = "Low tide today. Add variety to your recovery - try something different, not harder.";
      } else {
        message = "Ride the wave, but don't chase the next one. Novelty is your friend, overtraining is not.";
      }
      break;
  }

  return {
    hasArchetype: true,
    archetype,
    emoji: info.emoji,
    name: info.name,
    rarity: info.rarity,
    message,
    fatalFlaw: info.fatalFlaw,
  };
}

export function determineWorkoutType(
  intensity: IntensityLevel,
  recentPlans: RecentPlan[] = []
): string {
  if (intensity === Intensity.REST) return "rest";

  if (intensity === Intensity.LIGHT) {
    const lastType = recentPlans[0]?.workoutType;
    return lastType === "recovery" ? "skill" : "recovery";
  }

  const preferredTypes = ["skill", "cardio", "strength"];
  const recentTypes = recentPlans.slice(0, 3).map((p) => p.workoutType);
  const typeCount: Record<string, number> = {};
  recentTypes.forEach((t) => {
    typeCount[t] = (typeCount[t] || 0) + 1;
  });

  for (const type of preferredTypes) {
    if ((typeCount[type] || 0) < 2) return type;
  }

  return "skill";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function generateFromTemplate(
  template: any,
  workoutType: string,
  intensity: IntensityLevel,
  readiness: ReadinessLevel,
  alerts: { type: string; message: string }[],
  recommendations: string[],
  user: { sport: string },
  painGuidance: { message: string; alternatives: string[] } | null,
  decisionExplanation: DecisionExplanation,
  archetypeMessage: ArchetypeMessage | null
): GeneratedPlan {
  const workout = template.workouts[workoutType][intensity];
  const warmup: Exercise[] = template.warmup[intensity] || template.warmup.light || [];
  const cooldown: Exercise[] = template.cooldown?.standard || [];

  const modifications: string[] = [];
  if (template.modifications?.beginner) {
    modifications.push(template.modifications.beginner);
  }
  if (painGuidance) {
    modifications.push(painGuidance.message);
    if (painGuidance.alternatives?.length > 0) {
      modifications.push(`Alternatives: ${painGuidance.alternatives.join(", ")}`);
    }
  }

  const focusAreas = selectFocusAreas(template.focusAreas || [], workoutType);

  return {
    date: new Date().toISOString().slice(0, 10),
    readiness,
    intensity,
    sport: user.sport,
    workoutType: workoutType as GeneratedPlan["workoutType"],
    duration: workout?.duration || 30,
    warmup,
    mainWorkout: workout?.exercises || [],
    cooldown,
    focusAreas,
    alerts,
    modifications,
    recoveryTips: [...recommendations],
    decisionExplanation,
    archetypeMessage,
    disclaimer: DISCLAIMER,
  };
}

function selectFocusAreas(allFocusAreas: string[], workoutType: string): string[] {
  const selected: string[] = [];

  if (workoutType === "strength") selected.push("proper form", "mind-muscle connection");
  else if (workoutType === "cardio") selected.push("pacing", "breathing");
  else if (workoutType === "skill") selected.push("technique", "consistency");
  else if (workoutType === "recovery") selected.push("relaxation", "range of motion");

  if (allFocusAreas.length > 0) {
    const index = workoutType.length % allFocusAreas.length;
    selected.push(allFocusAreas[index]);
  }

  return [...new Set(selected)];
}

function generateRestDayPlan(
  readiness: ReadinessLevel,
  alerts: { type: string; message: string }[],
  recommendations: string[],
  user: { sport: string },
  painGuidance: { message: string; alternatives: string[] } | null,
  decisionExplanation: DecisionExplanation,
  archetypeMessage: ArchetypeMessage | null
): GeneratedPlan {
  const recoveryTips = [
    "Stay hydrated throughout the day",
    "Prioritize 7-9 hours of sleep tonight",
    "Light walking is fine if desired",
    "Focus on quality nutrition",
    ...recommendations,
  ];

  if (painGuidance) recoveryTips.push(painGuidance.message);

  return {
    date: new Date().toISOString().slice(0, 10),
    readiness,
    intensity: "rest",
    sport: user.sport,
    workoutType: "rest",
    duration: 0,
    warmup: [],
    mainWorkout: [
      {
        exercise: "Complete rest",
        notes: "Focus on recovery activities - your body needs time to rebuild and come back stronger.",
      },
    ],
    cooldown: [],
    focusAreas: ["recovery", "sleep", "nutrition"],
    alerts,
    modifications: [],
    recoveryTips,
    decisionExplanation,
    archetypeMessage,
    disclaimer: DISCLAIMER,
  };
}
