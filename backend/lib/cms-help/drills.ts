import type { PageHelp } from "./types";

/** Consumed by: drills/page.tsx, DrillForm.tsx */
export const drillsHelp: Record<string, PageHelp> = {
  list: {
    page: {
      summary:
        "Drills are the individual exercises and activities that make up training sessions.",
      details: [
        "The AI selects drills from this catalog when building session plans for athletes. Every drill recommended to an athlete comes from here.",
        "A complete, well-tagged drill catalog gives the AI more options to create personalised, position-appropriate sessions.",
        "A drill tagged to the wrong sport or wrong intensity will be recommended to the wrong athletes.",
        'For example, a goalkeeper-specific drill incorrectly tagged as "All Positions" will appear in winger and striker session plans.',
      ],
      impact:
        'A drill tagged to the wrong sport or wrong intensity will be recommended to the wrong athletes. For example, a goalkeeper-specific drill incorrectly tagged as "All Positions" will appear in winger and striker session plans.',
      warning:
        "Setting a drill to inactive immediately removes it from all AI recommendations and from all active programs that include it. Only deactivate drills you are certain should no longer be used.",
      storageKey: "drills-list",
    },
    fields: {
      name: {
        text: "The drill's full name, as it will appear in the athlete's session plan in the app. Use the name athletes and coaches will recognise.",
        example:
          '"Nordic Hamstring Curl", "5-10-5 Pro Agility", "Single-Leg Box Jump", "Technical Passing Pattern B"',
      },
      sport: {
        text: "Which sport this drill belongs to. Only athletes in this sport will ever see this drill. If a drill applies to multiple sports (e.g. general strength work), create separate drill entries per sport or select the most relevant sport.",
      },
      category: {
        text: "The type of physical quality this drill develops. The AI uses category to match drills to the athlete's current training focus. Speed drills are selected when sprint development is the goal; strength drills when force production is the target.",
        example:
          '"Sprint work = "Speed". Landing mechanics = "Agility". Loaded carry = "Strength". 12-minute run = "Cardio".',
      },
      intensity: {
        text: "The physical demand of this drill, from LOW to MAX. This is critical for protocol compliance — when a protocol caps intensity at MODERATE, all drills above MODERATE are automatically excluded from recommendations.",
        example:
          "Low = walking, stretching, mobility. Medium = jogging, technical work, light strength. High = sprint intervals, heavy resistance. Max = match intensity, maximal effort testing.",
        warning:
          'Do not underrate intensity. A max-effort drill tagged as "Medium" will be recommended during recovery sessions and high-load days when the AI thinks it is within safe intensity limits.',
      },
      duration: {
        text: "How long this drill takes to complete in minutes, including set-up and rest periods. Used by the Planning Agent to build sessions that fit the athlete's available time window.",
      },
      age_bands: {
        text: "Which age groups this drill is appropriate for. This is your first line of age-appropriate safety filtering — drills not tagged to an athlete's age band will never be recommended to them.",
        warning:
          "Olympic weightlifting variations and maximal plyometrics should not be tagged to U13 or U14. These age groups require movement skill development, not maximum loading.",
      },
      positions: {
        text: 'Which playing positions benefit most from this drill. The AI uses position weighting to prioritise drills — a drill tagged to "Winger" will score higher for a winger than a generic "All Positions" drill.',
        example:
          'A crossing and finishing drill = "Winger, Forward". A shot-stopping drill = "Goalkeeper". A general conditioning run = "All Positions".',
      },
      video_url: {
        text: "A link to a video demonstration of the drill. This is shown to the athlete in the app when they tap on a drill to see how to perform it. Use a stable URL — if this video is removed, athletes will see a broken link.",
        example: "YouTube, Vimeo, or a private club media hosting URL.",
      },
      status: {
        text: "Active drills are available for AI recommendation. Inactive drills are hidden from all recommendations but remain in the database for historical records.",
        warning:
          "Deactivating a drill removes it from all ongoing program recommendations immediately. If athletes are mid-program, they will no longer see this drill in their plan.",
      },
    },
  },
};
