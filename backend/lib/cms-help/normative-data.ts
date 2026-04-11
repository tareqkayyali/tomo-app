import type { PageHelp } from "./types";

/** Consumed by: normative-data/page.tsx */
export const normativeDataHelp: Record<string, PageHelp> = {
  browser: {
    page: {
      summary:
        "Normative data is the reference database that tells Tomo what 'average', 'good', and 'elite' performance looks like for each test, by sport, position, and age band.",
      details: [
        "When an athlete logs a 20m sprint time, the system compares it against this data to tell them they are in the 65th percentile for U16 midfielders.",
        "This percentile score feeds the athlete's performance radar, their mastery benchmarks, and the AI's understanding of where they sit relative to their peers.",
        "Inaccurate normative data means athletes receive misleading percentile scores.",
        "An athlete told they are 90th percentile when they are actually 50th may under-train. An athlete told they are 10th percentile when they are actually average may become discouraged.",
      ],
      impact:
        "Inaccurate normative data means athletes receive misleading percentile scores. An athlete told they are 90th percentile when they are actually 50th may under-train. An athlete told they are 10th percentile when they are actually average may become discouraged.",
      warning:
        "Every assessment metric must have normative data rows for ALL 8 position groups (the ALL position + 7 individual positions) for every active age band. A metric with missing rows will silently return a null percentile — the athlete sees no benchmark for that test.",
      storageKey: "normative-data-browser",
    },
    fields: {
      percentile_values: {
        text: "Enter the performance value (not a percentage) that corresponds to each percentile threshold for this metric, sport, position, and age band combination. Use real-world data from research literature, national testing databases, or your own historical athlete data.",
        example:
          "For U16 male football midfielder, 20m sprint time: P10 = 3.4s (slowest 10%), P25 = 3.2s, P50 = 3.0s (median), P75 = 2.85s, P90 = 2.7s (fastest 10%). Lower times are better for sprint tests — the system automatically handles inverse scales.",
        warning:
          "Ensure the direction of the scale is correct. For timed tests (sprint, agility), lower values = better performance. For volume tests (reps, jump height), higher values = better. Entering values in the wrong direction inverts all percentiles for every athlete in this group.",
      },
      sport_selector: {
        text: "Select the sport to view and edit its normative data table. Each sport has a completely separate normative dataset. Data entered for Football does not affect Padel or Athletics.",
      },
      bulk_import: {
        text: "Upload a CSV file to add normative data for many metrics at once. Use this when setting up normative data for a new sport or importing data from an external database. Download the CSV template first to ensure correct column format.",
        warning:
          "Bulk import overwrites existing values for any matching metric/position/age-band combination. Back up existing normative data before running a bulk import on an active sport.",
      },
    },
  },
};
