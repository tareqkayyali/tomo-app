/**
 * Readiness Calculator Service
 * Calculates training readiness based on daily check-in data.
 * Uses Green/Yellow/Red system as specified in Tomo plan.
 */

import type {
  CheckinInput,
  ReadinessLevel,
  IntensityLevel,
  Alert,
  ReadinessResult,
} from "../types";

export const Readiness: Record<string, ReadinessLevel> = {
  GREEN: "Green",
  YELLOW: "Yellow",
  RED: "Red",
};

export const Intensity: Record<string, IntensityLevel> = {
  REST: "rest",
  LIGHT: "light",
  MODERATE: "moderate",
  HARD: "hard",
};

export const DISCLAIMER =
  "This is general wellness guidance, not medical advice or coaching. Always listen to your body. Consult a healthcare provider for injuries or health concerns.";

/**
 * Calculate readiness status using Green/Yellow/Red system.
 *
 * RED if: painFlag==true OR (energy<=2 AND soreness>=7) OR sleepHours<5
 * YELLOW if: energy<=5 OR soreness>=7 OR sleepHours<6
 * GREEN if: energy>=7 AND soreness<3 AND not RED/YELLOW triggers
 * Else: YELLOW ("mixed signals")
 */
export function calculateReadiness(checkinData: Partial<CheckinInput>): ReadinessResult {
  const {
    energy = 5,
    soreness = 5,
    painFlag = false,
    painLocation = null,
    sleepHours = 7,
    effortYesterday = 5,
    mood = 5,
    academicStress = null,
  } = checkinData;

  let readiness: ReadinessLevel = Readiness.GREEN;
  const alerts: Alert[] = [];
  const recommendations: string[] = [];

  // RED conditions (highest priority)
  if (painFlag) {
    readiness = Readiness.RED;
    alerts.push({
      type: "pain",
      message: `You mentioned pain${painLocation ? ` in your ${painLocation}` : ""}. It's safest to rest or do gentle recovery. If pain persists or worsens for a week, please see a medical professional.`,
    });
  } else if (energy <= 2 && soreness >= 7) {
    readiness = Readiness.RED;
    alerts.push({
      type: "exhaustion",
      message:
        "Very low energy combined with high soreness detected. Your body needs rest to recover properly.",
    });
  } else if (sleepHours < 5) {
    readiness = Readiness.RED;
    alerts.push({
      type: "sleep_critical",
      message:
        "Severe sleep deprivation detected. Rest is essential - sleep is crucial for recovery and performance.",
    });
  }
  // YELLOW conditions (if not already Red)
  else if (energy <= 5 || soreness >= 7 || sleepHours < 6) {
    readiness = Readiness.YELLOW;

    if (energy <= 5) {
      recommendations.push(
        "Energy is moderate - focus on technique over intensity today."
      );
    }
    if (soreness >= 7) {
      recommendations.push(
        "Heavy soreness detected - let's do a light active recovery today so you bounce back stronger."
      );
    }
    if (sleepHours < 6) {
      recommendations.push(
        "Aim for an earlier bedtime tonight - consistent sleep helps your body recover and improves performance."
      );
    }
  }
  // GREEN conditions check
  else if (energy >= 7 && soreness < 3) {
    readiness = Readiness.GREEN;
  }
  // Mixed signals -> YELLOW
  else {
    readiness = Readiness.YELLOW;
    recommendations.push(
      "Mixed wellness signals today - we recommend a moderate approach."
    );
  }

  // Additional recommendations
  if (sleepHours < 7 && readiness !== Readiness.RED) {
    recommendations.push(
      "Wind down 30 min before bed - a quiet, cool, dark environment improves sleep quality."
    );
  }

  if (mood <= 3) {
    recommendations.push(
      "Some days are hard. Maybe a light workout or talking with a friend could help. Hang in there."
    );
  }

  if (academicStress != null && academicStress >= 7 && readiness !== Readiness.RED) {
    recommendations.push(
      "High academic stress detected. Consider a lighter or shorter session today — your brain needs recovery time too."
    );
  }
  if (academicStress != null && academicStress >= 9) {
    recommendations.push(
      "Very high academic load right now. Even a short walk or light stretching counts as a win today."
    );
  }

  return {
    readiness,
    alerts,
    recommendations,
    metrics: {
      energy,
      soreness,
      painFlag,
      painLocation: painLocation ?? undefined,
      sleepHours,
      effortYesterday,
      mood,
      academicStress: academicStress ?? undefined,
    } as CheckinInput,
  };
}

/**
 * Recommend training intensity based on readiness and training history.
 *
 * Priority order:
 * 1. pain -> REST (non-negotiable)
 * 2. daysSinceRest >= 6 -> REST
 * 3. RED readiness -> REST
 * 4. Never HARD if soreness >= 7 OR sleepHours < 6
 * 5. YELLOW OR effortYesterday >= 8 -> LIGHT
 * 6. GREEN -> MODERATE (HARD only if effortYesterday <= 5 AND daysSinceRest <= 3)
 */
export function recommendIntensity({
  readiness,
  painFlag,
  daysSinceRest,
  effortYesterday,
  soreness,
  sleepHours,
  academicStress = null,
}: {
  readiness: ReadinessLevel;
  painFlag: boolean;
  daysSinceRest: number;
  effortYesterday: number;
  soreness: number;
  sleepHours: number;
  academicStress?: number | null;
}): IntensityLevel {
  if (painFlag) return Intensity.REST;
  if (daysSinceRest >= 6) return Intensity.REST;
  if (readiness === Readiness.RED) return Intensity.REST;

  const hardBlocked = soreness >= 7 || sleepHours < 6;

  if (readiness === Readiness.YELLOW || effortYesterday >= 8) {
    return Intensity.LIGHT;
  }

  if (readiness === Readiness.GREEN) {
    const academicLoad = academicStress != null && academicStress >= 7;
    if (effortYesterday <= 5 && daysSinceRest <= 3 && !hardBlocked) {
      return academicLoad ? Intensity.MODERATE : Intensity.HARD;
    }
    return academicLoad ? Intensity.LIGHT : Intensity.MODERATE;
  }

  return Intensity.MODERATE;
}

/**
 * Get safety message for pain situations.
 */
export function getPainGuidance(painLocation?: string | null) {
  const guidance: { message: string; alternatives: string[] } = {
    message:
      "Pain reported - rest today and avoid aggravating it. Apply ice if needed and see a doctor if it doesn't improve.",
    alternatives: [],
  };

  if (painLocation) {
    const location = painLocation.toLowerCase();

    if (
      location.includes("leg") ||
      location.includes("ankle") ||
      location.includes("knee") ||
      location.includes("foot")
    ) {
      guidance.alternatives = [
        "Upper body mobility work",
        "Swimming (if accessible)",
        "Seated exercises",
      ];
      guidance.message += ` Try gentle exercises that don't involve your ${painLocation}.`;
    } else if (
      location.includes("arm") ||
      location.includes("shoulder") ||
      location.includes("wrist") ||
      location.includes("elbow")
    ) {
      guidance.alternatives = ["Lower body exercises", "Walking", "Core work"];
      guidance.message += ` Try gentle exercises that don't involve your ${painLocation}.`;
    } else if (location.includes("back")) {
      guidance.alternatives = ["Gentle walking", "Light stretching", "Swimming"];
      guidance.message += " Avoid any exercises that stress your back.";
    }
  }

  return guidance;
}
