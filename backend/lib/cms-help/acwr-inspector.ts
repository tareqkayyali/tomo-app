import type { PageHelp } from "./types";

/** Consumed by: acwr-inspector/page.tsx */
export const acwrInspectorHelp: Record<string, PageHelp> = {
  page: {
    page: {
      summary:
        "The ACWR Inspector shows the complete calculation breakdown behind an athlete's Acute:Chronic Workload Ratio. Enter a UUID to see every daily load entry, the intermediate sums, and the final risk classification.",
      details: [
        "ACWR = ATL (7-day average combined load) / CTL (28-day average combined load). It measures how much an athlete's recent training deviates from their established baseline.",
        "Combined load per day = Training AU + (Academic AU x 0.4). Academic stress contributes 40% of its raw value, reflecting its lower physical but real physiological impact.",
        "Training AU = RPE (1-10) x Session Duration (minutes). A 90-minute session at RPE 8 = 720 AU.",
        "The 7-day acute window is highlighted in the daily breakdown table. Days inside this window drive ATL. All 28 days drive CTL.",
        "Snapshot comparison shows whether the stored snapshot matches the live calculation. If they differ, the snapshot may be stale.",
      ],
      examples: [
        "ACWR 1.0 = athlete is training at exactly their usual level. Safe zone.",
        "ACWR 1.4 = athlete is training 40% harder than their 28-day average. Amber zone — building load.",
        "ACWR 1.8 = dangerous spike. The load warning computer fires a P1 recommendation.",
        "ACWR 0.6 = significant detraining. The athlete is doing much less than they're used to.",
      ],
      impact:
        "The ACWR calculation directly triggers MANDATORY safety protocols. An ACWR above 1.5 activates overload protection: intensity is capped, volume is reduced by 50%, and the AI explains why.",
      warning:
        "ACWR above 1.5 is a genuine injury risk signal — do not reassure athletes that it is fine and they can train through it. If the calculation appears incorrect, check whether all training events are being captured.",
      storageKey: "acwr-inspector",
    },
    fields: {
      athleteId: {
        text: "Enter the athlete's UUID to look up their current training load data.",
        warning: "ACWR data is athlete-confidential — only access it for legitimate sports science purposes.",
      },
      acwrRatio: {
        text: "Safe zone: 0.8–1.3 (GREEN). Caution zone: 1.3–1.5 (AMBER). Overload zone: above 1.5 (RED). Below 0.8: undertraining.",
      },
      loadSplit: {
        text: "Shows how the athlete's total load is distributed between physical training and academic load. High combined load is the primary risk factor for student-athlete burnout.",
      },
    },
  },
};
