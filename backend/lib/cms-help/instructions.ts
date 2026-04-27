import type { PageHelp } from "./types";

/** Consumed by: pd/instructions/* pages */
export const instructionsHelp: Record<string, PageHelp> = {
  hub: {
    page: {
      summary:
        "This is your command center. Everything Tomo does — how it talks, what it recommends, what's safe, who hears about what — starts with the rules you set here.",
      details: [
        "Write your coaching methodology in plain language, or upload a document. Tomo turns it into a clear list of rules grouped into five everyday categories: Coaching Style, Safety Rules, Training Methodology, What Tomo Does & Suggests, and Audiences.",
        "Every rule you create or approve here flows directly into Tomo's day-to-day decisions: how it phrases responses, when to flag a coach, what training to suggest, what to never recommend, and what each audience (athlete, coach, parent) sees.",
        "Nothing goes live until you publish a snapshot. You can always go back to a previous version with one click.",
      ],
      examples: [
        "Set the coaching tone to 'warm and direct, no clichés' so Tomo never says 'great effort' or 'fantastic work'.",
        "Tell Tomo to never recommend max-effort lifts to athletes going through a growth spurt.",
        "Auto-alert a coach when an athlete logs three nights of poor sleep in a row.",
      ],
      impact:
        "Your methodology becomes Tomo's brain. The clearer your rules, the more consistent and on-message every athlete's experience will be.",
      storageKey: "pd-instructions-hub",
    },
  },

  library: {
    page: {
      summary:
        "Your methodology library — every document you've written or uploaded that defines how Tomo coaches. Each document can target athletes, coaches, parents, or all three.",
      details: [
        "Documents are the source of truth in your own words. They get parsed into machine-applicable rules (called Directives) which Tomo follows at runtime.",
        "Statuses are simple: Draft (working copy, only you see it), Ready for Review (others can comment), Live (rules from this document are applied), Archived (kept for history but not applied).",
        "You can keep multiple living documents — for example, one general methodology, one specific to U15 athletes, and one for exam season. Tomo merges them at runtime using the conflict rules you set.",
      ],
      examples: [
        "'Tomo Coaching Methodology v1' — your overall philosophy. Audience: All.",
        "'U15 Conservative Defaults' — extra-cautious rules for younger athletes. Audience: Athlete. Age scope: U13, U15.",
        "'Exam Season Adjustments' — temporary load reductions during school exams.",
      ],
      impact:
        "Documents are your audit trail. Every directive can be traced back to the exact sentence in the exact document that produced it.",
      storageKey: "pd-instructions-library",
    },
  },

  document_editor: {
    page: {
      summary:
        "Write or paste your methodology in plain language. When you're ready, the next step is to extract the rules from this text — that turns your prose into a structured set of directives Tomo can act on.",
      details: [
        "Use natural language. You don't need to format anything special — just write the way you'd explain your philosophy to a new coach joining your staff.",
        "Be specific. 'Never recommend Olympic lifts to athletes mid-growth-spurt' is far more useful than 'be careful with young athletes'.",
        "Cover all five areas if you can: how Tomo should talk, what's safe, your training methodology, what Tomo does day-to-day, and what each audience sees.",
        "Save the working copy as often as you like — nothing is applied until you publish.",
      ],
      examples: [
        "'Tomo speaks like a steady, knowledgeable coach. Never use phrases like \"great effort\" or \"fantastic work\". Always pair recommendations with the reason.'",
        "'During exam season (last two weeks before exams), reduce training volume by 20% and never schedule hard sessions on the day before an exam.'",
        "'If an athlete logs more than three poor-sleep nights in a row, send the coach a notification with the athlete's name, the date range, and a recommended low-intensity adjustment.'",
      ],
      warning:
        "Editing a document doesn't change anything Tomo does until you publish a new snapshot. You can always come back and edit later.",
      storageKey: "pd-instructions-doc-editor",
    },
    fields: {
      title: {
        text: "A short name you'll recognise in the library.",
        example: "e.g. 'Tomo Coaching Methodology v1'.",
      },
      audience: {
        text: "Who this document affects. 'All' means every audience reads its rules.",
        example: "Pick a single audience to write rules that only apply to athletes, coaches, or parents.",
      },
      sport_scope: {
        text: "Leave empty to apply to every sport. Or list specific sports if these rules only apply to certain ones.",
        example: "e.g. football, basketball, tennis, padel, soccer.",
      },
      age_scope: {
        text: "Leave empty to apply to all ages. Or pick groups if these rules only apply to certain ages.",
        example: "e.g. U13, U15, U17, U19, U21, senior.",
      },
      source_text: {
        text: "Write or paste your methodology here. Plain language is best.",
        example: "Tomo will parse this into structured rules in the next step.",
      },
      status: {
        text: "'Draft' is your working copy. 'Ready for Review' means others can review and comment. 'Live' means rules from this document are being applied. 'Archived' keeps it for history but stops applying it.",
      },
    },
  },

  directive_list: {
    page: {
      summary:
        "These are the rules Tomo follows. They're grouped into five plain-English categories so it's easy to see at a glance what kind of rule does what.",
      details: [
        "Every rule has a status: Proposed (waiting for your review), Approved (you've signed off), Live (applied right now), or Retired (no longer applied).",
        "Approve rules one at a time as you review them. Edit anything that doesn't read right. When you're happy with a batch, publish a snapshot to make them live.",
        "Click a rule to see the exact source sentence from your document, what it does, and where it applies.",
      ],
      impact:
        "Live rules are what Tomo actually uses in every chat, recommendation, and notification. Treat the Approve button like signing your name to the rule.",
      storageKey: "pd-instructions-directives",
    },
  },

  directive_editor: {
    page: {
      summary:
        "Write or refine a single rule. Pick the kind of rule (Coaching Style, Safety, Training Methodology, etc.), then fill in the specifics.",
      details: [
        "Each rule type has its own form with the fields that matter for that kind of rule. There's a tooltip on every field explaining what it does and what happens if you change it.",
        "Scope fields (audience, sport, age group) let you target the rule precisely. Leave them open ('All') to apply broadly.",
        "Priority is used when two rules conflict. A lower number wins — so a priority of 10 beats a priority of 100.",
      ],
      examples: [
        "Type: Coaching Personality. Persona name: 'Tomo'. Voice: 'warm, direct, evidence-based'. Emoji policy: 'sparing'. Audience: All.",
        "Type: Safety Rules for Growing Athletes. Block: 'barbell squat at >70% 1RM'. Stage: mid-PHV. Severity: Advisory. Audience: Athlete.",
      ],
      warning:
        "If you're not sure what a field means, hover the (?) — every field has a plain-English explanation.",
      storageKey: "pd-instructions-directive-editor",
    },
    fields: {
      directive_type: {
        text: "What kind of rule is this?",
        example: "Coaching Style controls how Tomo talks. Safety Rules block unsafe recommendations. Training Methodology defines what good performance looks like.",
      },
      audience: {
        text: "Who this rule applies to. 'All' applies to athletes, coaches, and parents.",
        example: "Pick a specific audience to scope the rule.",
      },
      sport_scope: {
        text: "Leave empty to apply to every sport. Or list specific sports.",
        example: "e.g. football, basketball, tennis.",
      },
      age_scope: {
        text: "Leave empty to apply to all ages. Or list age groups for age-specific rules.",
        example: "e.g. U13, U15, U17, U19, U21, senior.",
      },
      phv_scope: {
        text: "PHV is the period of fastest growth in young athletes. Leave empty to apply at all stages.",
        example: "Or pick stages: pre-growth-spurt, mid-growth-spurt, post-growth-spurt.",
      },
      priority: {
        text: "Used when two rules disagree. A lower number wins.",
        example: "Default 100. Set to 10 for must-follow rules. Set to 200 for soft preferences.",
      },
      source_excerpt: {
        text: "Optional. The exact sentence from your methodology document that this rule came from.",
        example: "Helps you remember why the rule exists.",
      },
      status: {
        text: "'Proposed' = drafted but not yet signed off. 'Approved' = you've reviewed and signed off. 'Live' = currently being applied. 'Retired' = no longer applied.",
      },
    },
  },
};
