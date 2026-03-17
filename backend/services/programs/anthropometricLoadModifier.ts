/**
 * Anthropometric Load Modifier
 *
 * Adjusts training program prescriptions based on player body composition:
 * height, weight, BMI, and limb proportions.
 *
 * Taller/heavier athletes need specific cue modifications and load adjustments
 * for sprint, strength, plyometric, and Nordic protocols.
 */

// ── Types ───────────────────────────────────────────────────────────────

export interface AnthropometricProfile {
  heightCm: number | null;
  weightKg: number | null;
  ageDecimal?: number;
  gender?: "male" | "female";
}

export interface LoadModification {
  setsMultiplier: number;
  intensityMultiplier: number;
  restMultiplier: number;
  heightCue: string | null;
  weightCue: string | null;
  absoluteStrengthTarget: string | null;
  specialConsiderations: string[];
}

// ── Height/Weight Reference Ranges ──────────────────────────────────────

const HEIGHT_BANDS = {
  short: { maxCm: 165 },
  average: { maxCm: 180 },
  tall: { maxCm: 195 },
  veryTall: { maxCm: Infinity },
} as const;

const WEIGHT_BANDS = {
  light: { maxKg: 60 },
  average: { maxKg: 80 },
  heavy: { maxKg: 95 },
  veryHeavy: { maxKg: Infinity },
} as const;

function getHeightBand(cm: number): keyof typeof HEIGHT_BANDS {
  if (cm <= HEIGHT_BANDS.short.maxCm) return "short";
  if (cm <= HEIGHT_BANDS.average.maxCm) return "average";
  if (cm <= HEIGHT_BANDS.tall.maxCm) return "tall";
  return "veryTall";
}

function getWeightBand(kg: number): keyof typeof WEIGHT_BANDS {
  if (kg <= WEIGHT_BANDS.light.maxKg) return "light";
  if (kg <= WEIGHT_BANDS.average.maxKg) return "average";
  if (kg <= WEIGHT_BANDS.heavy.maxKg) return "heavy";
  return "veryHeavy";
}

function getBMI(heightCm: number, weightKg: number): number {
  const heightM = heightCm / 100;
  return weightKg / (heightM * heightM);
}

// ── Category-Specific Modifiers ─────────────────────────────────────────

const CATEGORY_MODIFIERS: Record<
  string,
  (profile: AnthropometricProfile) => Partial<LoadModification>
> = {
  sprint: (p) => {
    const mods: Partial<LoadModification> = {};
    if (p.heightCm && p.heightCm > 185) {
      mods.intensityMultiplier = 0.9;
      mods.heightCue =
        "Tall sprinter: Focus on stride frequency over stride length in acceleration phase. " +
        "Use shorter sprint distances (10-20m) before progressing to full speed.";
    }
    if (p.weightKg && p.weightKg > 85) {
      mods.setsMultiplier = 0.85;
      mods.restMultiplier = 1.2;
      mods.weightCue =
        "Higher body mass: Extend rest periods between sprints. " +
        "Reduce total volume to protect joints from repeated high-force ground contacts.";
    }
    return mods;
  },

  sled: (p) => {
    const mods: Partial<LoadModification> = {};
    if (p.heightCm && p.heightCm > 185) {
      mods.intensityMultiplier = 0.85;
      mods.heightCue =
        "Tall athlete: Use lighter sled load (reduce by 10-15%). " +
        "Focus on maintaining forward lean angle — taller athletes naturally have higher center of mass.";
    }
    if (p.weightKg && p.weightKg > 85) {
      mods.setsMultiplier = 0.8;
      mods.weightCue =
        "Heavier athlete: Reduce sled sprint volume. " +
        "Already producing high absolute force — focus on rate of force development.";
    }
    return mods;
  },

  strength: (p) => {
    const mods: Partial<LoadModification> = {};
    if (p.heightCm && p.heightCm > 185) {
      mods.heightCue =
        "Tall lifter: Use box squats to manage range of motion. " +
        "Consider trap bar deadlifts over conventional. " +
        "Wider stance may be beneficial for squat mechanics.";
    }
    if (p.weightKg) {
      mods.absoluteStrengthTarget = `Target relative squat: 1.5x BW (${Math.round(p.weightKg * 1.5)}kg). ` +
        `Target relative deadlift: 2.0x BW (${Math.round(p.weightKg * 2.0)}kg).`;
    }
    return mods;
  },

  nordic: (p) => {
    const mods: Partial<LoadModification> = {};
    if (p.weightKg && p.weightKg > 85) {
      mods.setsMultiplier = 0.75;
      mods.weightCue =
        "Higher body mass increases eccentric load on hamstrings. " +
        "Reduce rep count and use band assistance if needed. " +
        "Progress slowly — Nordic injuries correlate with bodyweight.";
    }
    if (p.heightCm && p.heightCm > 185) {
      mods.heightCue =
        "Longer lever arm increases difficulty. " +
        "Use partial range and eccentric-only variants initially.";
    }
    return mods;
  },

  plyometric: (p) => {
    const mods: Partial<LoadModification> = {};
    if (p.weightKg && p.weightKg > 85) {
      mods.setsMultiplier = 0.8;
      mods.restMultiplier = 1.3;
      mods.weightCue =
        "Higher bodyweight = higher ground reaction forces. " +
        "Reduce total ground contacts per session. " +
        "Favor bilateral landings over unilateral for heavier athletes.";
    }
    return mods;
  },

  agility: (p) => {
    const mods: Partial<LoadModification> = {};
    if (p.heightCm && p.heightCm > 190) {
      mods.heightCue =
        "Taller athletes: higher center of gravity affects change-of-direction. " +
        "Focus on deceleration mechanics and lower body positioning.";
    }
    return mods;
  },

  endurance: (p) => {
    const mods: Partial<LoadModification> = {};
    if (p.heightCm && p.weightKg) {
      const bmi = getBMI(p.heightCm, p.weightKg);
      if (bmi > 27) {
        mods.intensityMultiplier = 0.85;
        mods.weightCue =
          "Elevated BMI: Reduce running intensity to protect joints. " +
          "Consider cross-training alternatives (cycling, swimming) for conditioning base.";
        mods.specialConsiderations = [
          "Joint-friendly conditioning alternatives recommended",
        ];
      }
    }
    return mods;
  },
};

// ── Main Function ───────────────────────────────────────────────────────

/**
 * Get anthropometric-based load modifications for a given program category.
 *
 * @param profile - Player's anthropometric data
 * @param programCategory - Program category (sprint, strength, nordic, etc.)
 * @returns LoadModification with multipliers, cues, and considerations
 */
export function getAnthropometricModifications(
  profile: AnthropometricProfile,
  programCategory: string
): LoadModification {
  const base: LoadModification = {
    setsMultiplier: 1.0,
    intensityMultiplier: 1.0,
    restMultiplier: 1.0,
    heightCue: null,
    weightCue: null,
    absoluteStrengthTarget: null,
    specialConsiderations: [],
  };

  // If no anthropometric data, return defaults
  if (!profile.heightCm && !profile.weightKg) return base;

  // Apply category-specific modifier
  const categoryKey = programCategory.toLowerCase();
  const modifier = CATEGORY_MODIFIERS[categoryKey];

  if (modifier) {
    const mods = modifier(profile);
    return {
      setsMultiplier: mods.setsMultiplier ?? base.setsMultiplier,
      intensityMultiplier:
        mods.intensityMultiplier ?? base.intensityMultiplier,
      restMultiplier: mods.restMultiplier ?? base.restMultiplier,
      heightCue: mods.heightCue ?? base.heightCue,
      weightCue: mods.weightCue ?? base.weightCue,
      absoluteStrengthTarget:
        mods.absoluteStrengthTarget ?? base.absoluteStrengthTarget,
      specialConsiderations:
        mods.specialConsiderations ?? base.specialConsiderations,
    };
  }

  // Generic BMI check for any category
  if (profile.heightCm && profile.weightKg) {
    const bmi = getBMI(profile.heightCm, profile.weightKg);
    if (bmi > 30) {
      base.specialConsiderations.push(
        "BMI > 30: Monitor joint stress, ensure adequate warm-up, " +
          "consider impact reduction strategies."
      );
      base.intensityMultiplier = 0.9;
    }
  }

  return base;
}
