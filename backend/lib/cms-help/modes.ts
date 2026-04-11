import type { PageHelp } from "./types";

/** Consumed by: modes/page.tsx, ModeForm.tsx */
export const modesHelp: Record<string, PageHelp> = {
  list: {
    page: {
      summary:
        "Athlete Modes control how the entire system behaves for each athlete. When an athlete switches mode, it changes schedule constraints, recommendation thresholds, AI coaching tone, and training load caps across the platform.",
      details: [
        "Each mode adjusts the Planning Intelligence engine: ACWR thresholds, dual load sensitivity, session caps, and recovery priority are all mode-dependent.",
        "The recommendation computers (academic, load warning, recovery) read the active mode from the athlete snapshot and shift their decision thresholds accordingly.",
        "Modes are surfaced in the mobile app as a horizontal selector on the My Rules screen. The athlete taps to switch, which triggers a MODE_CHANGE event through the data fabric.",
        "Focus on getting the params right: 'Max Hard Sessions/Week' and 'Load Cap Multiplier' have the highest impact on an athlete's weekly training volume.",
        "Sport Filter lets you restrict a mode to specific sports. Leave empty to make it available for all athletes.",
      ],
      examples: [
        "Balanced (default): No special overrides. Standard ACWR thresholds (1.5 P1, 1.3 P2). Good for regular training blocks.",
        "League: Recovery is forced after every match. Add Recovery After Match = ON. AI coaching tone shifts to 'performance'. Load cap stays at 1.0.",
        "Study: Dual load thresholds drop by ~20%. Intensity capped on exam days. Study duration multiplier increases. AI tone becomes 'academic'.",
        "Rest: ACWR danger threshold drops from 1.5 to 1.2. Load cap at 0.7. Personal dev sessions dropped. Used during off-season or injury recovery.",
      ],
      impact:
        "Without a well-configured mode system, the AI plans training as if every week is the same — no exam awareness, no match congestion awareness. Modes are how Tomo understands the full context of an athlete's life.",
      warning:
        "Every mode you enable should have corresponding planning protocols configured. A mode without protocols activates but has no effect on AI planning.",
      storageKey: "modes-list",
    },
  },

  form: {
    page: {
      summary:
        "Each mode defines a complete behavior profile that affects scheduling, load thresholds, AI coaching tone, and recommendation priorities. When an athlete activates this mode, every downstream system reads these parameters.",
      details: [
        "Identity: The Mode ID is used in code and the data fabric. Pick a clear snake_case name — it cannot be changed after creation.",
        "Schedule Parameters: These directly control the Planning Intelligence engine. 'Max Hard Sessions/Week' caps high-intensity days. 'Load Cap Multiplier' scales the athlete's allowable training load (0.7 = 30% reduction).",
        "Intensity Cap on Exam Days: When set, the schedule engine blocks sessions above this intensity on any day with a logged exam. REST = no training, LIGHT = technique only, MODERATE = normal but no maximal efforts.",
        "AI Coaching Tone: Changes how the chat agent communicates. 'Academic' emphasizes study-training balance. 'Performance' focuses on competition prep. 'Supportive' prioritizes wellbeing.",
        "Priority Boosts: These shift recommendation ranking. A +2 delta on 'recovery' means recovery recs appear higher in the athlete's feed when this mode is active.",
      ],
      examples: [
        "For an Exam Mode: Set maxHardPerWeek=1, loadCapMultiplier=0.6, intensityCapOnExamDays=LIGHT, studyDurationMultiplier=1.5, aiCoachingTone=academic. This dramatically reduces training load while boosting study time.",
        "For a League Mode: Set addRecoveryAfterMatch=ON, maxSessionsPerDay=1, aiCoachingTone=performance. Add a priority boost of +2 for 'recovery'. This ensures match recovery is always prioritized.",
        "For a Rest/Off-Season Mode: Set maxHardPerWeek=0, loadCapMultiplier=0.3, dropPersonalDev=ON. The system will only allow light active recovery sessions.",
      ],
      storageKey: "modes-form",
    },
    fields: {
      modeId: {
        text: "Unique identifier (snake_case). Cannot be changed after creation.",
        example: 'e.g. "exam_mode", "league_active", "rest_week"',
      },
      label: {
        text: "The name the athlete sees when selecting their current situation in the app. Use plain language they will immediately understand.",
        example: '"Normal Training", "Match Week", "Exam Period", "Rest Week", "Returning from Injury"',
      },
      description: {
        text: "A one-sentence explanation shown to athletes in the app when they select this mode. Helps them choose correctly.",
        example: '"Exam Period: Tomo will reduce training intensity to protect your study time and mental energy."',
      },
      sportFilter: {
        text: "Restrict this mode to specific sports. Leave empty to make the mode available across all sports.",
      },
      studyDurationMultiplier: {
        text: "Multiplier applied to study session durations. Values above 1.0 extend recommended study time.",
        example: "1.5 = 50% longer study blocks recommended.",
      },
      reduceGymDaysTo: {
        text: "Reduce weekly gym sessions to this number. Leave empty for no change.",
      },
      intensityCapOnExamDays: {
        text: "Maximum training intensity allowed on days with a logged exam. REST = no training, LIGHT = technique only, MODERATE = no maximal efforts.",
        warning: "If left unset, athletes can train at full intensity on exam days.",
      },
      studyTrainingBalanceRatio: {
        text: "The balance between study and training time. 0.0 = all training, 1.0 = all study.",
        example: "0.6 means 60% of available time goes to study.",
      },
      loadCapMultiplier: {
        text: "Caps overall training load relative to baseline. 1.0 = no cap, 0.7 = 30% reduction.",
        warning: "Setting below 0.5 severely restricts training — only appropriate for injury recovery or exam periods.",
      },
      dropPersonalDev: {
        text: "Remove personal development sessions from the schedule when this mode is active.",
      },
      addRecoveryAfterMatch: {
        text: "Auto-schedule a recovery session the day after every match.",
      },
      aiCoachingTone: {
        text: "How the AI coach adjusts its communication style when this mode is active.",
        example: '"Academic" emphasizes study-training balance. "Performance" focuses on competition prep. "Supportive" prioritizes wellbeing.',
      },
      priorityBoosts: {
        text: "Boost priority for specific recommendation categories when this mode is active. A +2 delta on 'recovery' means recovery recs appear higher in the athlete's feed.",
      },
    },
    sections: {
      identity: {
        text: "Basic mode information. The Mode ID is permanent — choose carefully.",
      },
      scheduleParams: {
        text: "These parameters directly control the Planning Intelligence engine. 'Max Hard Sessions/Week' and 'Load Cap Multiplier' have the highest impact on weekly training volume.",
      },
      aiCoaching: {
        text: "Controls how the AI coach adjusts tone and recommendations when this mode is active.",
      },
      priorityBoosts: {
        text: "Shift recommendation ranking for specific categories. Higher deltas push those recommendation types to the top of the athlete's feed.",
      },
    },
  },
};
