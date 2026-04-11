import type { PageHelp } from "./types";

/** Consumed by: sports/page.tsx, sports/[id]/attributes, sports/[id]/positions, sports/[id]/skills, sports/[id]/rating-levels */
export const sportsHelp: Record<string, PageHelp> = {
  list: {
    page: {
      summary:
        "This page controls the sports catalog.",
      details: [
        "Every drill, program, assessment, position, and protocol is scoped to a specific sport.",
        "Adding a new sport here creates a new namespace — you then build out its attributes, positions, skills, and rating levels separately.",
        "The mobile app uses the sport configuration to determine which content, coaching context, and benchmarks apply to each athlete.",
        "Setting a sport to unavailable (available = false) hides it from the mobile app's onboarding flow. Athletes cannot select that sport when creating their profile until it is set to available.",
      ],
      impact:
        "Setting a sport to unavailable (available = false) hides it from the mobile app's onboarding flow. Athletes cannot select that sport when creating their profile until it is set to available.",
      warning:
        "Do not delete a sport that has active athletes. Deletion removes all associated drills, programs, assessments, and normative data permanently. Instead, set it to unavailable.",
      storageKey: "sports-list",
    },
    fields: {
      label: {
        text: "The athlete-facing name for this sport as it appears throughout the app.",
        example: '"Football", "Padel", "Athletics", "Basketball", "Tennis"',
      },
      key: {
        text: "The internal code used in the database and API for this sport. Once set and live, do not change this — it will break all data linked to this sport.",
        example: '"football", "padel", "athletics"',
        warning:
          "Lowercase only, no spaces or special characters. Use the sport's common English name.",
      },
      icon_name: {
        text: "The name of the Phosphor icon to display for this sport in the app. Only use icons from the Tomo custom icon library. Enter the exact icon name as it appears in the icon system.",
      },
      color_hex: {
        text: "A brand colour associated with this sport used in some UI elements. Must be a valid hex code. Do not use orange (#c4623a) — this is reserved for the Tomo Chat button.",
        example: "Football: deep green. Athletics: amber. Padel: blue-grey.",
      },
      sort_order: {
        text: "The position of this sport in sport selection lists throughout the app. Set the most popular sports at lower numbers so they appear first.",
      },
      available: {
        text: "Only sports marked as available appear to athletes in the app. Set to false while building out a sport's content to prevent athletes from selecting it before it is ready.",
      },
    },
  },

  attributes: {
    page: {
      summary:
        "Attributes are the measurable physical qualities that define performance in this sport.",
      details: [
        "Examples include Speed, Agility, Strength, Endurance, and Power.",
        "Position weights determine how important each attribute is for each playing position. A centre-back needs different attribute emphasis than a winger.",
        "These weights directly affect which drills and programs the AI prioritises for each athlete.",
        "If a winger's Speed attribute weight is too low, the AI will not prioritise sprint drills for that position — even though sprint ability is critical for wingers.",
      ],
      impact:
        "If a winger's Speed attribute weight is too low, the AI will not prioritise sprint drills for that position — even though sprint ability is critical for wingers.",
      storageKey: "sport-attributes",
    },
    fields: {
      key: {
        text: "Internal identifier for this attribute. Lowercase snake_case. Must match the key used in drill scoring and mastery pillar metric mapping.",
        example:
          '"speed", "agility", "strength", "endurance", "power", "technical", "tactical"',
      },
      abbreviation: {
        text: "Short version used in compact UI views (e.g. the mastery radar).",
        example: 'Speed = "SPD", Agility = "AGI", Strength = "STR"',
      },
      position_weights: {
        text: "How important is this attribute for each playing position? Scale 0.0 to 1.0. 1.0 = this attribute is maximally important for this position. 0.3 = it matters but is not a priority.",
        example:
          "Speed for a Goalkeeper: 0.5 (moderate — needed for crosses but not primary quality). Speed for a Winger: 0.95 (critical — primary position quality).",
        warning:
          "Setting a weight to 0.0 means the AI completely ignores this attribute when building sessions for that position. Only use 0.0 for attributes that are genuinely irrelevant.",
      },
    },
  },

  positions: {
    page: {
      summary:
        "Positions define the roles athletes play in this sport.",
      details: [
        "Every drill recommendation, normative data lookup, and AI coaching context uses the athlete's position.",
        "A correctly configured position list means the AI gives position-specific coaching — a goalkeeper receives goalkeeper-relevant advice, not generic outfield player advice.",
      ],
      warning:
        "Every position you create here must have a matching normative data row for every assessment metric. Missing normative data for a position means athletes in that position see no percentile benchmarks for their test results.",
      storageKey: "sport-positions",
    },
  },

  skills: {
    page: {
      summary:
        "Skills are the sport-specific technical abilities within this sport.",
      details: [
        "For example, Dribbling, Passing, Shooting for football.",
        "Unlike physical attributes (which are measured by assessment tests), skills are assessed qualitatively by coaches.",
        "The AI references skill definitions when recommending drills that target specific technical weaknesses.",
      ],
      storageKey: "sport-skills",
    },
  },

  rating_levels: {
    page: {
      summary:
        "Rating levels translate numeric performance scores into meaningful labels athletes understand.",
      details: [
        'When an athlete\'s overall score is 73 out of 100, they see "Advanced" instead of a number.',
        "Configure bands that are motivating and realistic for your athlete population.",
      ],
      warning:
        "Ensure your min and max values create continuous, non-overlapping bands. A gap between bands (e.g. max of Intermediate = 70, min of Advanced = 75) means athletes who score 71-74 receive no label.",
      storageKey: "sport-rating-levels",
    },
    fields: {
      min_max_rating: {
        text: "The numeric score range for this band. Scores at or above min and below max fall into this level. Ensure every possible score (0 to 100) is covered by a band.",
        example:
          "Beginner: 0-39. Intermediate: 40-64. Advanced: 65-84. Elite: 85-100.",
      },
    },
  },
};
