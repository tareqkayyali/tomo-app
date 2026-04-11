import type { PageHelp } from "./types";

/** Consumed by: feature-flags/page.tsx */
export const featureFlagsHelp: Record<string, PageHelp> = {
  list: {
    page: {
      summary:
        "Feature flags are on/off switches for major platform capabilities.",
      details: [
        "They allow Tomo to gradually roll out new features, run A/B tests, and instantly disable a feature if something goes wrong — without requiring a new software release.",
        "Super Admins use this page to control runtime behaviour across the entire platform.",
        'Toggling AI_SERVICE_ENABLED to "off" immediately switches all athletes to a backup AI system within 60 seconds.',
        "This is the emergency kill switch if the primary AI system has a critical failure. Athletes see no downtime — they continue to receive responses from the backup.",
      ],
      impact:
        'Toggling AI_SERVICE_ENABLED to "off" immediately switches all athletes to a backup AI system within 60 seconds. This is the emergency kill switch if the primary AI system has a critical failure. Athletes see no downtime — they continue to receive responses from the backup.',
      warning:
        "Feature flags affect all athletes on the platform globally unless a sport filter is set. Disabling RAG_ENABLED turns off knowledge retrieval for ALL AI responses — the AI falls back to general knowledge only. Only modify flags you understand fully.",
      storageKey: "feature-flags",
    },
    fields: {
      flag_key: {
        text: "The internal name of the feature controlled by this flag. Use snake_case. Once a flag is live and referenced in code, do not rename it.",
        example:
          '"AI_SERVICE_ENABLED", "RAG_ENABLED", "COGNITIVE_WINDOWS_ENABLED", "WHOOP_INTEGRATION", "DUAL_LOAD_DASHBOARD"',
      },
      description: {
        text: "Plain-English explanation of what this flag controls and what happens when it is disabled. Write this clearly — in an emergency, someone may need to understand this instantly.",
        example:
          '"Controls whether the primary Python AI service handles chat requests. When OFF, all chat routes to the backup TypeScript AI service. Toggle OFF in under 60 seconds if the Python service has a critical failure."',
      },
      enabled: {
        text: "Toggle to activate or deactivate this feature immediately across the platform. The mobile app reads all flags from the boot endpoint and applies changes within 60 seconds of a flag being toggled.",
      },
      sport_filter: {
        text: "Limit this flag to a specific sport only. Used for gradual rollouts — enable a new feature for Football first, then expand to Padel and Athletics once validated.",
        example:
          'If testing a new session layout only for Football athletes: set sport filter to "football". Athletes in other sports see the existing layout.',
      },
    },
  },
};
