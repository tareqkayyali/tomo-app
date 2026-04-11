import type { PageHelp } from "./types";

/** Consumed by: assessments/page.tsx, AssessmentForm.tsx */
export const assessmentsHelp: Record<string, PageHelp> = {
  list: {
    page: {
      summary:
        "Assessments are the standardised tests athletes perform to measure physical qualities: sprint speed, jump height, strength levels, agility, and more.",
      details: [
        "When an athlete logs a test result in the app, it is matched to an assessment defined here, compared against normative data for their age and position, and stored in their performance history.",
        "The AI uses assessment results to understand an athlete's current physical level and personalise coaching accordingly.",
        "Assessment results feed directly into the athlete's performance radar chart and benchmarks visible in their Mastery tab.",
        "They also inform the AI's readiness snapshot — an athlete who tested poorly on a recent strength assessment will receive more conservative loading recommendations.",
      ],
      impact:
        "Assessment results feed directly into the athlete's performance radar chart and benchmarks visible in their Mastery tab. They also inform the AI's readiness snapshot — an athlete who tested poorly on a recent strength assessment will receive more conservative loading recommendations.",
      warning:
        "Every assessment's metric key must exist in ALL four mapping layers of the testing pipeline. If any mapping is missing, test results are silently discarded — the athlete's data does not save, and no error is shown. Always verify a new assessment works end-to-end in the staging environment before activating it in production.",
      storageKey: "assessments-list",
    },
    fields: {
      metric_key: {
        text: "The unique identifier for the measurement this assessment captures. This key must match exactly across four internal mapping tables. Use lowercase snake_case. Do not change this after an assessment is live — it will break all historical records for this test.",
        example:
          '"sprint_20m_seconds", "vertical_jump_cm", "max_push_ups_60s", "agility_505_seconds"',
        warning:
          "This is a technical field. If you are not certain about the correct key format, ask Tomo support before saving. An incorrect key means all athlete test data for this assessment is silently lost.",
      },
      input_definitions: {
        text: "What data the athlete enters when logging this test. Define each input clearly — the label the athlete sees, the unit of measurement, and whether it is required or optional.",
        example:
          'Sprint test: one input — "Time" in seconds, required. Jump test: one input — "Height" in centimetres, required. Push-up test: one input — "Repetitions" (no unit), required.',
      },
      derived_metrics: {
        text: "Calculations the system performs automatically from the raw inputs. Use these when the meaningful metric is computed from what the athlete enters, not entered directly.",
        example:
          'An athlete enters jump height (cm) and body weight (kg). Derived metric: "Power Index" = calculated from those two values. The derived metric is what appears in the athlete\'s performance profile.',
      },
      sort_order: {
        text: "The position of this assessment in the list when displayed to athletes in the app. Set higher-priority or more frequently used tests at lower numbers so they appear first.",
      },
    },
  },
};
