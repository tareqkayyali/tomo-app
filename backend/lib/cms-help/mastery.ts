import type { PageHelp } from "./types";

/** Consumed by: mastery/page.tsx, MasteryPillarForm.tsx */
export const masteryHelp: Record<string, PageHelp> = {
  pillars: {
    page: {
      summary:
        "Mastery Pillars define the 5-7 performance dimensions shown in the athlete's performance radar chart in the app.",
      details: [
        "Each pillar represents a key physical or technical quality (e.g. Speed, Power, Endurance, Coachability).",
        "Each pillar is calculated as a weighted average of selected assessment metrics.",
        "The radar chart is one of the most motivating features in the athlete-facing app — athletes check it regularly to see how they are developing.",
        "Configure pillars to reflect the qualities that genuinely matter for your sport.",
        "The pillars you enable here determine which dimensions the AI discusses when coaching athletes on their strengths and weaknesses.",
        "A disabled pillar is invisible to the AI — it will not mention that quality in coaching conversations, even if the athlete has relevant data.",
      ],
      impact:
        "The pillars you enable here determine which dimensions the AI discusses when coaching athletes on their strengths and weaknesses. A disabled pillar is invisible to the AI — it will not mention that quality in coaching conversations, even if the athlete has relevant data.",
      warning:
        "Do not change pillar names or metric weights mid-season without communicating this to athletes and coaches. Changes cause the radar chart to visually shift, which can be confusing or demotivating if an athlete's scores appear to drop due to a weighting change.",
      storageKey: "mastery-pillars",
    },
    fields: {
      pillar_name: {
        text: "The athlete-facing name for this performance dimension. Keep it short (1-2 words) and use language the athlete understands. This label appears on the radar chart axes in the app.",
        example:
          '"Speed", "Power", "Endurance", "Agility", "Strength", "Technical", "Resilience". Avoid internal jargon like "ACWR" or "Neuromuscular Output".',
      },
      emoji: {
        text: "A single emoji shown alongside the pillar name in the app. Used purely for visual clarity and quick identification.",
      },
      color_theme: {
        text: "The colour used for this pillar's axis on the radar chart. Each pillar should have a distinct colour for visual clarity. Use the Tomo colour system — do not use orange (#c4623a) as it is reserved for the Tomo Chat button.",
      },
      metric_weights: {
        text: "Choose which assessment metrics contribute to this pillar and how much each one counts. Weights must add up to 100% per pillar. Higher weight = that metric has more influence on the pillar score.",
        example:
          '"Speed" pillar: 20m Sprint Time (50% weight) + 10m Split Time (30% weight) + 5-10-5 Agility (20% weight). An athlete\'s speed pillar score = weighted average of these three metrics.',
        warning:
          "Only include metrics where you have actual normative data configured. A metric added to a pillar without normative data will produce a null contribution and make the pillar score unreliable.",
      },
      enabled_toggle: {
        text: "Active pillars appear on the radar chart and in AI coaching context. Inactive pillars are hidden from athletes and ignored by the AI. Disable a pillar if you do not yet have enough athlete data to make it meaningful.",
        warning:
          "Disabling a pillar mid-season hides historical scores from athletes. Communicate any pillar changes to your team before making them.",
      },
      priority_order: {
        text: "The order in which pillars appear on the radar chart, starting from the top (12 o'clock position) and going clockwise. Place the most important qualities for your sport first.",
      },
    },
  },
};
