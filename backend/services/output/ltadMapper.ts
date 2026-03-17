/**
 * LTAD (Long-Term Athletic Development) Stage Mapper
 *
 * Maps PHV maturity offset → LTAD stage with Gen Z-friendly descriptions.
 * Based on Balyi & Hamilton's LTAD framework adapted for football.
 */

export interface LTADStage {
  stageName: string;
  stageKey: "fundamentals" | "learn_to_train" | "train_to_train" | "train_to_compete" | "train_to_win";
  emoji: string;
  description: string;
  trainingFocus: string[];
  ageRange: string;
  progressPercent: number; // 0-100 for visual indicator
}

export interface PHVDisplayData {
  maturityOffset: number;
  phvStage: string;
  ltad: LTADStage;
  summary: string; // one-liner for Gen Z
}

const STAGES: LTADStage[] = [
  {
    stageName: "FUNdamentals",
    stageKey: "fundamentals",
    emoji: "🎮",
    description: "All about having fun and learning to move. Try lots of different sports and activities — this builds your athletic base for everything that comes later.",
    trainingFocus: [
      "Try different sports",
      "Movement & coordination",
      "Speed games",
      "Having fun",
    ],
    ageRange: "~6-9",
    progressPercent: 10,
  },
  {
    stageName: "Learn to Train",
    stageKey: "learn_to_train",
    emoji: "📚",
    description: "Your brain is wired to pick up new skills right now. This is the golden window for learning technique — the moves you nail now will stick with you for life.",
    trainingFocus: [
      "Skill development",
      "Agility & balance",
      "Basic strength (bodyweight)",
      "Sport-specific technique",
    ],
    ageRange: "~9-12",
    progressPercent: 30,
  },
  {
    stageName: "Train to Train",
    stageKey: "train_to_train",
    emoji: "🔥",
    description: "Your body is growing fast right now. Focus on building your aerobic engine and maintaining the skills you've learned. Don't rush heavy training — your body needs time to catch up.",
    trainingFocus: [
      "Aerobic fitness base",
      "Flexibility (critical now)",
      "Core stability",
      "Skill maintenance",
    ],
    ageRange: "~12-15",
    progressPercent: 50,
  },
  {
    stageName: "Train to Compete",
    stageKey: "train_to_compete",
    emoji: "⚡",
    description: "Your body is ready for real training intensity. This is when you start building serious strength and power. Time to train like a competitor.",
    trainingFocus: [
      "Strength & power development",
      "Position-specific training",
      "Tactical understanding",
      "Competition preparation",
    ],
    ageRange: "~15-18",
    progressPercent: 75,
  },
  {
    stageName: "Train to Win",
    stageKey: "train_to_win",
    emoji: "🏆",
    description: "You're physically mature — all systems go. Training is now about maximizing performance, refining your game, and peaking for competitions.",
    trainingFocus: [
      "Peak performance training",
      "Advanced periodization",
      "Recovery optimization",
      "Mental performance",
    ],
    ageRange: "18+",
    progressPercent: 95,
  },
];

export function mapPHVToLTAD(maturityOffset: number): LTADStage {
  if (maturityOffset < -2.0) return STAGES[0]; // FUNdamentals
  if (maturityOffset < -1.0) return STAGES[1]; // Learn to Train
  if (maturityOffset <= 0.5) return STAGES[2];  // Train to Train
  if (maturityOffset <= 2.0) return STAGES[3];  // Train to Compete
  return STAGES[4];                              // Train to Win
}

export function buildPHVDisplay(
  maturityOffset: number,
  phvStage: string
): PHVDisplayData {
  const ltad = mapPHVToLTAD(maturityOffset);

  const summaryMap: Record<string, string> = {
    fundamentals: `Your growth stage: ${ltad.stageName} — focus on fun & movement`,
    learn_to_train: `Your growth stage: ${ltad.stageName} — golden window for skill learning`,
    train_to_train: `Your growth stage: ${ltad.stageName} — your body is growing fast, build your base`,
    train_to_compete: `Your growth stage: ${ltad.stageName} — ready for serious training`,
    train_to_win: `Your growth stage: ${ltad.stageName} — maximize your performance`,
  };

  return {
    maturityOffset,
    phvStage,
    ltad,
    summary: summaryMap[ltad.stageKey] ?? `Growth stage: ${ltad.stageName}`,
  };
}
