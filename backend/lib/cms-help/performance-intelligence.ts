import type { PageHelp } from "./types";

/** Consumed by: performance-intelligence/page.tsx */
export const performanceIntelligenceHelp: Record<string, PageHelp> = {
  hub: {
    page: {
      summary:
        "This four-step wizard controls the core settings of Tomo's recommendation engine.",
      details: [
        "It decides which drills and programs to suggest to each athlete, and which AI model to use for each type of question.",
        "Changes here affect every recommendation the AI makes across your entire organisation.",
        "Complete all four steps before saving, and test using the Protocol Simulator after any changes.",
        "Setting an incorrect readiness weighting here means the AI may recommend high-intensity training to an athlete with RED readiness — overriding what your individual protocols should prevent.",
        "These are global defaults; protocols are the safety net.",
      ],
      impact:
        "Setting an incorrect readiness weighting here means the AI may recommend high-intensity training to an athlete with RED readiness — overriding what your individual protocols should prevent. These are global defaults; protocols are the safety net.",
      warning:
        "This is an advanced configuration page. Small changes here can significantly shift AI behaviour for all athletes in your organisation. Always test changes in your staging environment first, and review the Eval Dashboard after activation.",
      storageKey: "performance-intelligence-hub",
    },
    fields: {
      readiness_importance: {
        text: "How much weight the AI gives to an athlete's daily readiness score when selecting training content. Higher values = the AI is more conservative when readiness is low (fewer high-intensity recommendations on tough days).",
        example:
          "0.8 (high readiness importance): on a RED readiness day, the AI strongly avoids high-intensity content. 0.3 (low readiness importance): readiness has less influence — content selection relies more on programme phase.",
        warning:
          "Do not set below 0.5 for youth athletes (14-18). Low readiness importance increases the risk of overloading growing athletes.",
      },
      sport_specificity: {
        text: "How strongly the AI prioritises sport-specific content over general fitness content. High = the AI almost always selects sport-specific drills. Low = the AI considers general conditioning drills more often.",
      },
    },
    sections: {
      step1: {
        text: "Step 1 — Recommendation Priority Weights: These weights control how the AI scores and ranks training content for each athlete. Higher readiness importance means the AI is more conservative when an athlete's readiness is low. Higher position relevance means the AI strongly favours position-specific drills over general drills.",
      },
      step2: {
        text: "Step 2 — AI Model Selection per Intent Type: Tomo uses two AI models: Sonnet (more capable, higher cost) for complex advisory questions, and Haiku (faster, lower cost) for simple informational queries. This step lets you control which model handles which question types. The defaults are optimised for cost and quality — only change these if advised by Tomo support.",
      },
      step3: {
        text: 'Step 3 — Guardrail Configuration: The eight deterministic guardrails are the final safety checks before any program recommendation reaches an athlete. Each guardrail checks one specific condition (e.g. "is this program appropriate for this age band?"). Disable a guardrail only if you have a specific, documented reason — disabled guardrails create gaps in recommendation safety.',
      },
      step4: {
        text: "Step 4 — Review and Activate: Review all settings across Steps 1-3 before activating. Changes take effect immediately for all athletes after activation. There is no undo — if you need to reverse a change, return to this wizard and reconfigure.",
      },
    },
  },
};
