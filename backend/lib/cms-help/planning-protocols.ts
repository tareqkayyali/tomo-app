import type { PageHelp } from "./types";

/** Consumed by: planning-protocols/page.tsx, PlanningProtocolForm.tsx */
export const planningProtocolsHelp: Record<string, PageHelp> = {
  list: {
    page: {
      summary:
        "Planning Protocols are automated rules that fire when an athlete's data hits specific thresholds. They're the guardrails of the system — preventing overtraining, managing exam stress, and ensuring recovery happens when it should.",
      details: [
        "Each protocol has trigger conditions (IF) and actions (THEN). When all conditions are met, the action fires automatically. Think of them as 'if ACWR > 1.5, then reduce load by 40%'.",
        "Severity determines how aggressively the system enforces the protocol. MANDATORY rules block the athlete from overriding (e.g., growth phase load caps). ADVISORY rules suggest but allow override. INFO rules are educational.",
        "Category groups protocols for the recommendation engine. 'Safety' and 'load_management' protocols feed into the Load Warning computer. 'Academic' protocols feed the Academic computer. 'Recovery' protocols feed the Recovery computer.",
        "Conditions use snapshot fields — the same real-time data that powers the athlete dashboard. Common fields: ACWR, dual load index, exam proximity score, readiness score, active injury count.",
        "Sport Filter lets you create sport-specific protocols. A football protocol might trigger on match day + 1, while a tennis protocol might watch for consecutive match days.",
        "Scientific Basis is shown to coaches and parents when they ask 'why is this recommendation showing?' It builds trust in the system. Always reference peer-reviewed research when possible.",
      ],
      examples: [
        "PHV Load Reduction (MANDATORY, safety): IF phv_stage = mid_phv AND ACWR > 1.2, THEN reduce_load 40%. Scientific basis: Lloyd & Oliver (2012) youth periodization model.",
        "Exam Week Taper (ADVISORY, academic): IF exam_proximity_score > 80 AND dual_load_index > 60, THEN reduce_load 30% + suggest 'Front-load training early this week to free up exam prep time'.",
        "Post-Match Recovery (ADVISORY, recovery): IF days_since_last_session = 0 AND matches_next_7d >= 1, THEN schedule_recovery + suggest 'Recovery session recommended — you have another match this week'.",
        "Detraining Alert (INFO, performance): IF ACWR < 0.8 AND days_since_last_session > 5, THEN alert + suggest 'Your training has dropped significantly. Even light activity helps maintain your base'.",
      ],
      impact:
        "A correctly configured planning protocol library means the AI never schedules a hard sprint session the day before a match, never plans 6 training days in a row, and automatically protects study time during exam periods.",
      warning:
        "MANDATORY planning protocols are absolute — the AI cannot override them even when an athlete or coach requests it. Use MANDATORY only for genuine safety constraints.",
      storageKey: "planning-protocols-list",
    },
  },

  form: {
    page: {
      summary:
        "A planning protocol is an automated guardrail. Define the conditions that trigger it and the action the system takes. When the athlete's real-time snapshot data matches all conditions, the protocol fires and adjusts their training plan.",
      details: [
        "Name and Description: Make the name action-oriented so athletes and coaches instantly understand what it does when it appears as a recommendation card (e.g., 'Exam Week Taper' not 'Protocol 7').",
        "Severity: MANDATORY protocols cannot be dismissed by the athlete — use for safety-critical rules like growth phase load limits. ADVISORY protocols show as strong suggestions. INFO protocols are educational nudges.",
        "Category: Determines which recommendation computer processes this protocol. Safety and load_management go through the Load Warning engine. Academic goes through the Academic engine. Recovery through the Recovery engine.",
        "Trigger Conditions: All conditions must be true simultaneously (AND logic). Use snapshot fields like ACWR, readiness_score, dual_load_index, or exam_proximity_score. The operator compares the field's current value against your threshold.",
        "Actions: 'Reduce Load' scales down the athlete's planned training volume by the specified percentage. 'Block Intensity' prevents sessions above a certain RPE. 'Schedule Recovery' inserts a recovery session. 'Suggest' sends a coaching message.",
        "Scientific Basis: Shown to coaches and in the audit log. Reference peer-reviewed research to build trust. This is what separates data-driven coaching from guesswork.",
      ],
      examples: [
        "Trigger: ACWR > 1.5 (training spike). Action: Reduce Load 40%. This catches the most dangerous overtraining pattern — a sudden jump in training volume that the body isn't adapted to.",
        "Trigger: Exam Proximity Score > 80 AND Dual Load Index > 60. Action: Reduce Load 30% + Suggest 'Front-load training this week'. This proactively manages the study-training conflict.",
        "Trigger: Active Injury Count > 0 AND ACWR > 1.0. Action: Block Intensity + Suggest 'Modified training only while injury is active'. This prevents re-aggravation.",
        "Trigger: PHV Stage = mid_phv AND Days Since Last Session < 1. Action: Suggest 'Growth phase athletes need 48h between high-intensity sessions'. Safety-first for growing athletes.",
      ],
      storageKey: "planning-protocols-form",
    },
    fields: {
      name: {
        text: "A clear, specific name that describes what this protocol protects or enforces. Names appear in recommendation cards and audit logs.",
        example: 'Good: "Mid-PHV High-Impact Loading Block" | Weak: "Protocol 4"',
      },
      description: {
        text: "Explain what this protocol does in plain English. Shown to coaches auditing the system.",
      },
      severity: {
        text: "MANDATORY = absolute rule, AI cannot override. ADVISORY = strong default the AI follows but can adapt. INFO = background context for tone and framing only.",
        warning: "Setting too many rules to MANDATORY reduces the AI's ability to adapt to individual athletes. Reserve MANDATORY for genuine safety rules.",
      },
      category: {
        text: "Determines which recommendation computer processes this protocol. Safety/load_management → Load Warning engine. Academic → Academic engine. Recovery → Recovery engine.",
        example: 'A rule that prevents training when ACWR > 1.5 = "Safety". A rule reducing load during exam week = "Academic".',
      },
      triggerConditions: {
        text: "All conditions must be true simultaneously (AND logic). Use snapshot fields like ACWR, readiness_score, dual_load_index, exam_proximity_score.",
        example: "ACWR > 1.5 AND readiness_score < 40 → catches overtrained athletes who also feel fatigued.",
      },
      actions: {
        text: "What the AI must do when this protocol fires. Be specific — vague actions produce vague AI behaviour.",
        example: 'Good: "Cap session intensity at LOW, limit duration to 45 minutes, recommend only technical and mobility sessions." Weak: "Take it easy."',
      },
      scientificBasis: {
        text: "The sports science reasoning behind this rule. Shown to coaches and in the audit log. Reference peer-reviewed research to build trust.",
        example: '"High-intensity loading within 48h of competition increases accumulated fatigue (Smith et al., 2019)."',
      },
      sportFilter: {
        text: "Restrict this protocol to a specific sport. Leave empty to apply across all sports.",
      },
      version: {
        text: "Auto-increments each time you save. Version history allows you to track changes and audit when a rule was modified. Read-only.",
      },
    },
    sections: {
      basicInfo: {
        text: "Give protocols action-oriented names so athletes and coaches instantly understand them when they appear as recommendation cards.",
      },
      conditions: {
        text: "Define exactly when this protocol activates. The AI evaluates these conditions against the athlete's current snapshot (readiness, training load, growth stage, injury status).",
      },
      actions: {
        text: "Define what happens when the conditions are met. Be specific — 'Reduce Load 40%' is actionable, 'be careful' is not.",
      },
    },
  },
};
