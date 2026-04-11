import type { PageHelp } from "./types";

/** Consumed by: protocols/page.tsx, protocols/builder/page.tsx, protocols/inheritance/page.tsx, protocols/test/page.tsx */
export const protocolsHelp: Record<string, PageHelp> = {
  list: {
    page: {
      summary:
        "Protocols are the rules that govern how the AI coaches athletes.",
      details: [
        "Every time an athlete checks in, logs a session, or asks Tomo a question, the AI evaluates all active protocols before generating any response.",
        'Think of protocols as the "standing orders" you have given the AI — your sports science rules made machine-executable.',
        "Some protocols are MANDATORY (the AI must always follow them, no exceptions). Others are ADVISORY (the AI uses them as guidance but can adapt).",
        'A MANDATORY protocol with category "Safety" will hard-block any recommendation that violates it, even if the AI\'s general reasoning would have suggested that recommendation.',
        "This is how PHV safety, injury prevention, and overload protection work in Tomo.",
      ],
      impact:
        'A MANDATORY protocol with category "Safety" will hard-block any recommendation that violates it, even if the AI\'s general reasoning would have suggested that recommendation. This is how PHV safety, injury prevention, and overload protection work in Tomo.',
      warning:
        'Do not disable or delete a protocol without understanding what it protects. A protocol labelled "PHV Loading Restriction" is almost certainly preventing dangerous recommendations for growth-stage athletes. Deleting it removes that protection entirely.',
      storageKey: "protocols-list",
    },
    fields: {
      severity_filter: {
        text: "Filter by how strictly the AI must follow this protocol. MANDATORY = non-negotiable, AI will always apply this. ADVISORY = default behaviour, but AI can adapt based on context. INFO = background guidance that informs tone and framing, not hard rules.",
      },
      source_tier_filter: {
        text: "Filter by where the protocol originates. Global = created by Tomo and applies to all institutions (safety protocols). Institution = created by your organisation's PD for your specific athletes. Group = applies to a specific sub-team within your institution.",
      },
      category_filter: {
        text: "Filter by what type of rule this protocol enforces. Safety = protects athlete health (must always be active). Development = guides long-term progression. Recovery = manages rest and regeneration. Performance = optimises training output. Academic = manages the balance between study and training.",
      },
    },
  },

  builder: {
    page: {
      summary:
        "The Protocol Builder is where you translate your sports science expertise into rules the AI will follow.",
      details: [
        'You build rules visually using conditions (IF...) and outputs (THEN...). For example: "IF the athlete\'s readiness is RED AND their training load is too high, THEN cap intensity to low and reduce session volume by 30%."',
        "The AI evaluates every active protocol every time it responds to an athlete.",
        "Every protocol you create here directly constrains what the AI can recommend.",
        "A well-built protocol means no athlete in your organisation will ever receive a recommendation that contradicts your sports science rules.",
      ],
      impact:
        "Every protocol you create here directly constrains what the AI can recommend. A well-built protocol means no athlete in your organisation will ever receive a recommendation that contradicts your sports science rules.",
      warning:
        "MANDATORY protocols cannot be undone mid-conversation by the AI, regardless of athlete preferences. Be certain a protocol should be MANDATORY before setting it. Use ADVISORY for rules you want the AI to follow by default but adapt when context warrants it.",
      storageKey: "protocol-builder",
    },
    fields: {
      name: {
        text: "A clear, specific name that describes what this protocol protects or enforces. Names appear in evaluation logs and audit reports.",
        example:
          'Good: "Mid-PHV High-Impact Loading Block" | Weak: "Protocol 4" | Weak: "Safety Rule"',
      },
      category: {
        text: "What type of rule is this? This determines how the protocol is grouped and filtered in the Protocols List, and which part of the AI's behaviour it influences.",
        example:
          'A rule that prevents training when ACWR > 1.5 = "Safety". A rule that prioritises recovery sessions after a match = "Recovery". A rule that reduces training load during exam week = "Academic".',
      },
      severity: {
        text: "How strictly must the AI follow this rule? MANDATORY = absolute rule, AI cannot override it under any circumstances. ADVISORY = strong default that the AI follows but can adapt with good reason. INFO = background context that shapes tone and framing only.",
        example:
          "PHV loading restrictions = MANDATORY. Post-match recovery session preference = ADVISORY. Reminder to ask about hydration after intense sessions = INFO.",
        warning:
          "Setting too many rules to MANDATORY reduces the AI's ability to adapt to individual athletes. Use MANDATORY only for genuine safety rules, not for preferences.",
      },
      condition_match_mode: {
        text: "ALL means every condition in the list must be true for the protocol to activate (AND logic). ANY means just one condition being true is enough to activate the protocol (OR logic).",
        example:
          '"Red readiness AND ACWR > 1.5" -> use ALL (both must apply). "Mid-PHV OR history of knee injury" -> use ANY (either alone is enough).',
      },
      condition_field: {
        text: "The athlete data point this condition checks. readiness_flag = their daily check-in readiness (GREEN/AMBER/RED). acwr = their acute:chronic workload ratio (safe = 0.8-1.3). phv_stage = their growth stage (pre_phv / mid_phv / post_phv). injury_status = whether they have an active injury on record.",
        example:
          "To protect mid-PHV athletes: field = phv_stage, operator = eq, value = mid_phv.",
      },
      intensity_cap: {
        text: "The maximum training intensity the AI is allowed to recommend when this protocol fires. Set this to the highest intensity that is safe given the protocol's conditions.",
        example:
          "For a RED readiness protocol: cap = LOW (light movement only). For a post-match recovery protocol: cap = MODERATE (technical work, no sprinting).",
      },
      load_multiplier: {
        text: "A multiplier applied to all session volume calculations when this protocol fires. 1.0 = no change. 0.7 = 30% volume reduction. 0.5 = half the normal session volume.",
        example:
          "Mid-PHV athletes: multiplier = 0.70 (30% volume reduction). High ACWR overload: multiplier = 0.50 (half volume). Exam period light training: multiplier = 0.80 (20% reduction).",
        warning:
          "Do not use a load_multiplier above 1.0. Loading above the athlete's baseline is managed by the progression system, not by protocols.",
      },
      blocked_categories: {
        text: "Types of training session or drill category that must not be recommended when this protocol fires. Be specific — block only what is genuinely unsafe, not entire categories unnecessarily.",
        example:
          'Mid-PHV protocol: block "olympic_lifting", "high_impact_plyometrics", "maximal_strength". Do NOT block "technical_drills" or "conditioning" — those remain safe.',
      },
      priority_chunks: {
        text: "Specific knowledge chunks that should be prioritised in AI responses when this protocol fires. Use the chunk ID from the Knowledge Base. This ensures the AI references the right evidence for this scenario.",
        example:
          'When the overload protocol fires, prioritise the chunk titled "ACWR Overload Recovery Protocol" so the AI explains why it is reducing load.',
      },
      ai_coaching_tone: {
        text: "How should the AI communicate when this protocol is active? This is the voice, not the content. Adjust tone to match the sensitivity of the situation.",
        example:
          'For a RED readiness day: tone = "supportive and encouraging, acknowledge the athlete is having a tough day." For a post-match recovery day: tone = "confident and reassuring, emphasise this rest is part of the plan."',
      },
    },
    sections: {
      metadata: {
        text: "Name and describe this protocol clearly. The name appears in the Protocols List and in evaluation reports. The description is shown to PDs auditing the system — write it so any qualified sports scientist can understand the intent.",
      },
      conditions: {
        text: "Define exactly when this protocol activates. The AI evaluates these conditions against the athlete's current snapshot (readiness, training load, growth stage, injury status, etc.). Use ALL (AND logic) when all conditions must be true. Use ANY (OR logic) when any one condition being true is enough to trigger the protocol.",
      },
      outputs: {
        text: "Define what happens when the conditions are met. There are four output categories, each controlling a different part of the AI's behaviour. You do not need to fill all four — only the ones relevant to this rule.",
      },
    },
  },

  inheritance: {
    page: {
      summary:
        "This page shows a tree diagram of how protocols flow down from Tomo's global rules to your institution's rules to specific sub-groups.",
      details: [
        "Global safety protocols (PHV protection, ACWR overload limits) are at the top and cannot be removed — they apply to every athlete.",
        "Your institution can add its own rules below, and specific sub-groups can add further rules.",
        "More specific rules take priority over general ones.",
        "Use this view when onboarding a new sub-group (e.g. U15s) to ensure they are inheriting the right rules from the institution level.",
      ],
      impact:
        "This view lets you verify that the correct protocols are active at every level. Use it when onboarding a new sub-group (e.g. U15s) to ensure they are inheriting the right rules from the institution level.",
      warning:
        'If a protocol shows as "Blocked" (grey strikethrough), it has been intentionally removed at a lower tier. Verify this was intentional. A blocked PHV protection protocol at a group level is a serious safety issue.',
      storageKey: "protocol-inheritance",
    },
  },

  simulator: {
    page: {
      summary:
        "The Protocol Simulator lets you test how your protocols behave against different athlete states — without touching any real athlete's data.",
      details: [
        "Select a preset athlete profile (or build a custom one) and see exactly which protocols activate, what combined output is produced, and whether the result is what you intended.",
        "Always test a new protocol here before saving it as active.",
        "A protocol that does not fire when it should (e.g. mid-PHV restriction not activating for a mid-PHV athlete) is a silent safety failure. The simulator catches this before it reaches athletes.",
      ],
      impact:
        "A protocol that does not fire when it should (e.g. mid-PHV restriction not activating for a mid-PHV athlete) is a silent safety failure. The simulator catches this before it reaches athletes.",
      warning:
        "Do not skip the simulator for any MANDATORY protocol. If a safety protocol does not fire correctly in the simulator, do not make it active. Fix the conditions first.",
      storageKey: "protocol-simulator",
    },
    fields: {
      readiness_flag: {
        text: "The athlete's daily readiness status from their check-in. GREEN = feeling good, ready to train. AMBER = some fatigue or soreness, proceed with caution. RED = significant fatigue, injury risk is elevated.",
      },
      acwr: {
        text: "Acute:Chronic Workload Ratio. This is calculated automatically in the real app. For testing, enter a value manually. Safe zone = 0.8 to 1.3. Amber zone = 1.3 to 1.5. Red zone (overload) = above 1.5.",
        example:
          "Test your overload protocols with ACWR = 1.6, and verify they fire and reduce intensity appropriately.",
      },
      sleep_score: {
        text: "A score from 1 to 10 representing last night's sleep quality. Below 6 is typically where sleep-related protocols should activate. Real data comes from wearables (WHOOP, Garmin, Apple Health).",
      },
      stress_score: {
        text: "A score from 1 to 10 representing perceived mental/academic stress. This feeds academic load protocols. Above 7 should typically trigger academic load protocols to reduce training intensity.",
      },
    },
    sections: {
      presets: {
        text: "These five profiles represent the most important test scenarios. Always run new protocols against all five — especially Mid-PHV Amber and Red Overloaded — to verify the correct rules activate and the combined output is appropriate.",
      },
      custom_snapshot: {
        text: "Build your own test athlete by setting each data point manually. Use this to test edge cases — for example, a mid-PHV athlete with a knee injury during exam period who also has RED readiness. Real athletes can combine multiple risk factors simultaneously.",
      },
    },
  },
};
