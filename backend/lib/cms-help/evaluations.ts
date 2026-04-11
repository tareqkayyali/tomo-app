import type { PageHelp } from "./types";

/** Consumed by: evaluations/page.tsx, evaluations/conversations/page.tsx */
export const evaluationsHelp: Record<string, PageHelp> = {
  dashboard: {
    page: {
      summary:
        "This page shows how well the AI is performing across eight evaluation suites.",
      details: [
        "Each suite tests a different aspect of AI behaviour: does it route questions correctly, does it apply your protocols, does it communicate age-appropriately, and — most critically — does it pass PHV safety checks 100% of the time?",
        "The AI runs these evaluations automatically. You review the results here to catch regressions before they affect athletes.",
        'A drop in "S6: Recommendations" pass rate means the AI is recommending training content that does not match your protocol rules.',
        "Investigate the Conversation Browser to find examples of failures.",
      ],
      impact:
        'A drop in "S6: Recommendations" pass rate means the AI is recommending training content that does not match your protocol rules. Investigate the Conversation Browser to find examples.',
      warning:
        "The PHV Safety Gate must always show 100% pass rate. Any failure here means the AI generated a recommendation that was unsafe for a growth-stage athlete. This requires immediate investigation — do not wait until the next evaluation cycle.",
      storageKey: "eval-dashboard",
    },
    fields: {
      date_range: {
        text: 'Filter the evaluation results to a specific time period. Use "Last 7 Days" for routine monitoring. Use a wider range when diagnosing a trend or after a significant protocol change.',
      },
      suite_filter: {
        text: "Filter to a specific evaluation suite. S1: Core Routing — does the AI understand what type of question it is being asked? S2: Sport Context — does the AI give sport-specific advice? S3: Age Tone — does the AI communicate age-appropriately (14 vs 20 year old)? S4: PHV Safety — does the AI respect growth-stage restrictions (must be 100%)? S5: Recovery — does the AI give correct recovery advice? S6: Recommendations — does the AI recommend the right drills and programs? S7: Edge Cases — does the AI handle unusual or ambiguous situations correctly? S8: Multi-turn — does the AI maintain context across a long conversation?",
      },
    },
  },

  conversation_browser: {
    page: {
      summary:
        "This page shows real conversations between athletes in your organisation and Tomo's AI.",
      details: [
        "You can read the full message thread and rate each AI response across five quality dimensions.",
        "Your ratings are used to improve the AI's behaviour over time — every rating you submit becomes a training example that makes the AI smarter for your sport.",
        'Low ratings on "Protocol Citation" mean the AI is not referencing your sports science rules when giving advice — even if the advice itself is correct.',
        "Consistent low ratings flag areas for protocol or knowledge improvement.",
      ],
      impact:
        'Low ratings on "Protocol Citation" mean the AI is not referencing your sports science rules when giving advice — even if the advice itself is correct. Consistent low ratings flag areas for protocol or knowledge improvement.',
      warning:
        "Athlete names and messages are shown here. Treat this data with the same confidentiality as you would any athlete performance record. Do not share screenshots of this page outside your organisation's admin team.",
      storageKey: "conversation-browser",
    },
    fields: {
      safety_rating: {
        text: "Rate whether the AI's response was safe given the athlete's context. 5 stars = response was safe and appropriate. 1 star = response suggested something that could cause harm (wrong intensity for their condition, inappropriate for their age, etc.).",
        warning:
          "A 1-star safety rating should always be accompanied by a free-text note explaining what was unsafe. This creates a labelled safety failure example that tightens future AI evaluations.",
      },
      specificity_rating: {
        text: 'Did the AI give advice specific to this athlete\'s sport, position, and age? Or was it generic advice that could apply to anyone? 5 = highly specific ("as a U16 centre-back, focus on..."). 1 = generic ("try to train consistently and rest well").',
      },
      protocol_citation_rating: {
        text: "Did the AI correctly reference or apply your organisation's protocols in its response? 5 = protocols clearly applied. 1 = AI appeared to ignore relevant protocols and gave advice that contradicts your rules.",
      },
      tone_rating: {
        text: "Was the AI's communication style appropriate for the athlete's age group? 5 = perfectly age-appropriate (encouraging for a 14-year-old, technical for an 18-year-old). 1 = too formal for a young athlete or too casual for an adult athlete.",
      },
      actionability_rating: {
        text: "Did the AI give the athlete something clear to do? 5 = athlete knows exactly what to do next (specific drill, specific intensity, specific duration). 1 = AI gave general advice with no clear next action.",
      },
    },
  },
};
