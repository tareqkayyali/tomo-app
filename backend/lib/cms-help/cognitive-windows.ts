import type { PageHelp } from "./types";

/** Consumed by: cognitive-windows/page.tsx */
export const cognitiveWindowsHelp: Record<string, PageHelp> = {
  list: {
    page: {
      summary:
        "Cognitive windows define how each type of training session affects mental performance.",
      details: [
        "Research shows that moderate exercise boosts cognitive function for 1-2 hours, but exhaustive exercise temporarily suppresses it.",
        "Tomo uses this data to recommend optimal study timing relative to training.",
        'For example: "After a sprint session, your focus will peak in about 30 minutes — that is a good time to study."',
        "This is one of Tomo's most distinctive student-athlete features.",
        "Correctly configured cognitive windows allow Tomo to give student-athletes evidence-based advice about when to study after training — reducing the conflict between academic and athletic performance.",
      ],
      impact:
        "Correctly configured cognitive windows allow Tomo to give student-athletes evidence-based advice about when to study after training — reducing the conflict between academic and athletic performance. Incorrectly configured windows (e.g. marking exhaustive training as cognitively enhancing) will send athletes to study when their brain is in recovery mode.",
      storageKey: "cognitive-windows",
    },
    fields: {
      session_type: {
        text: "The training session type this cognitive profile applies to.",
        example:
          '"High-Intensity Sprint Session", "Technical Skills Training", "Max Strength Session", "Active Recovery Session", "Match / Game Day"',
      },
      cognitive_state: {
        text: "How this session type affects cognitive performance. Enhanced = brain works better than baseline after this session. Suppressed = brain is temporarily below baseline after this session. Neutral = no significant cognitive effect.",
        example:
          "Active Recovery (walking, light stretching): Enhanced. Max Strength (heavy compound lifts): Suppressed. Technical Skill Practice (light passing, ball work): Neutral to Enhanced.",
      },
      optimal_study_delay: {
        text: "How many minutes after this session type the athlete should wait before studying, to catch the peak cognitive window (or avoid the suppression window).",
        example:
          "After sprint training: 30 minutes (catch the post-exercise cognitive boost). After max strength: 90 minutes (allow the suppression to pass). After active recovery: 0 minutes (can study immediately).",
      },
    },
  },
};
