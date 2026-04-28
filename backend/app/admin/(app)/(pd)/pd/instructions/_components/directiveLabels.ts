import type { DirectiveType } from "@/lib/validation/admin/directiveSchemas";

/** Plain-English label for every directive type — what the PD sees in UI. */
export const DIRECTIVE_TYPE_LABEL: Record<DirectiveType, string> = {
  identity: "Coaching personality",
  tone: "How Tomo talks",
  response_shape: "How Tomo replies",
  guardrail_phv: "Safety rules for growing athletes",
  guardrail_age: "Age-appropriate rules",
  guardrail_load: "Workload safety",
  safety_gate: "Hard stops (rare)",
  threshold: "Targets and zones",
  performance_model: "What 'good' looks like",
  mode_definition: "Training modes",
  planning_policy: "Season planning rules",
  scheduling_policy: "Calendar & school-life rules",
  routing_intent: "What Tomo does when asked X",
  routing_classifier: "How Tomo understands the question",
  recommendation_policy: "What Tomo can suggest",
  rag_policy: "What knowledge Tomo draws on",
  memory_policy: "What Tomo remembers about the athlete",
  surface_policy: "What each audience sees",
  escalation: "When to alert a coach or parent",
  coach_dashboard_policy: "Coach view rules",
  parent_report_policy: "Parent report rules",
  meta_parser: "Parser settings",
  meta_conflict: "Conflict resolution",
  // Phase 7
  dashboard_section: "Dashboard card",
  signal_definition: "Dashboard alert",
  program_rule: "Programs rule",
  // Phase 8: Bucketed verticals
  sleep_policy: "Sleep rule",
  nutrition_policy: "Nutrition rule",
  wellbeing_policy: "Mental health & performance rule",
  injury_policy: "Injury / return-to-play rule",
  career_policy: "Career & identity rule",
};

/** One-line description shown under each type label. */
export const DIRECTIVE_TYPE_DESCRIPTION: Record<DirectiveType, string> = {
  identity: "Persona, voice, register — who Tomo is when it speaks.",
  tone: "Phrases and patterns Tomo must avoid; required scaffolding.",
  response_shape: "Length, structure, opening/closing patterns, suggested chips.",
  guardrail_phv: "What's unsafe during a growth spurt; safe alternatives.",
  guardrail_age: "Age-band-specific blocks and load caps.",
  guardrail_load: "ACWR zones, dual-load thresholds, recovery gaps.",
  safety_gate: "Conditions that hard-stop a recommendation. Use sparingly.",
  threshold: "Numeric green/yellow/red zones for any signal.",
  performance_model: "The 4-layer model and per-position priorities.",
  mode_definition: "Build / Taper / Recovery / etc — and when to switch.",
  planning_policy: "Season phases, taper, peak, competition proximity.",
  scheduling_policy: "How sessions land in the calendar around school.",
  routing_intent: "When the user asks X, how does Tomo respond?",
  routing_classifier: "Examples and rules for understanding intent.",
  recommendation_policy: "Blocked, mandatory, and prioritised categories.",
  rag_policy: "Which knowledge sources Tomo searches and which to skip.",
  memory_policy: "What atoms to extract, how often, how to dedup.",
  surface_policy: "What to show / hide / translate per audience.",
  escalation: "Trigger conditions and notification templates.",
  coach_dashboard_policy: "Widgets, alerts, and roster sort rules for coaches.",
  parent_report_policy: "Frequency, template, and blocked topics for parents.",
  meta_parser: "Prompt and model used to parse your methodology.",
  meta_conflict: "How to merge two rules that disagree.",
  // Phase 7
  dashboard_section: "A card that appears on the athlete's dashboard, scoped to who should see it.",
  signal_definition: "A hero alert at the top of the dashboard — the colored block.",
  program_rule: "Rule for which programs Tomo recommends, blocks, or caps.",
  // Phase 8: Bucketed verticals
  sleep_policy: "Sleep duration, bedtime windows, hygiene, debt handling.",
  nutrition_policy: "What Tomo recommends to eat, drink, supplement; pre/post-session timing.",
  wellbeing_policy: "Mood, stress, motivation, focus, mindset, pre-match mental prep.",
  injury_policy: "How Tomo handles an athlete with an active injury and progresses them back.",
  career_policy: "CV coaching, recruitment visibility, scholarship paths, career transitions.",
};

/** The five plain-English sections the command center groups directives under. */
export const SECTIONS: { label: string; description: string; types: DirectiveType[]; accent: string }[] = [
  {
    label: "Coaching Style",
    description: "Personality, tone, and how Tomo replies.",
    types: ["identity", "tone", "response_shape"],
    accent: "border-blue-200 bg-blue-50/50",
  },
  {
    label: "Safety Rules",
    description: "What Tomo must never do or always do, and when to alert.",
    types: ["guardrail_phv", "guardrail_age", "guardrail_load", "safety_gate", "escalation"],
    accent: "border-red-200 bg-red-50/50",
  },
  {
    label: "Training Methodology",
    description: "What good performance looks like, modes, periodization, scheduling, targets.",
    types: ["performance_model", "threshold", "mode_definition", "planning_policy", "scheduling_policy"],
    accent: "border-emerald-200 bg-emerald-50/50",
  },
  {
    label: "What Tomo Does & Suggests",
    description: "Routing, recommendations, knowledge, memory.",
    types: ["routing_intent", "routing_classifier", "recommendation_policy", "rag_policy", "memory_policy"],
    accent: "border-amber-200 bg-amber-50/50",
  },
  {
    label: "Audiences",
    description: "What athletes, coaches, and parents each see.",
    types: ["surface_policy", "coach_dashboard_policy", "parent_report_policy"],
    accent: "border-violet-200 bg-violet-50/50",
  },
  // Phase 7
  {
    label: "What Athletes See on Dashboard",
    description: "Which cards and alerts appear on each athlete's dashboard, scoped to age, position, mode, and more.",
    types: ["dashboard_section", "signal_definition"],
    accent: "border-cyan-200 bg-cyan-50/50",
  },
  {
    label: "Programs & Recommendations",
    description: "Which training programs Tomo recommends, blocks, or load-caps for each athlete profile.",
    types: ["program_rule"],
    accent: "border-orange-200 bg-orange-50/50",
  },
  // Phase 8: Bucketed verticals
  {
    label: "Sleep",
    description: "Sleep windows, hygiene, pre-match minimums, debt handling.",
    types: ["sleep_policy"],
    accent: "border-indigo-200 bg-indigo-50/50",
  },
  {
    label: "Nutrition",
    description: "What Tomo recommends to eat, drink, supplement; pre/post-session windows; hydration.",
    types: ["nutrition_policy"],
    accent: "border-lime-200 bg-lime-50/50",
  },
  {
    label: "Mental Health & Performance",
    description: "Mood, stress, motivation, focus, mindset, pre-match mental prep.",
    types: ["wellbeing_policy"],
    accent: "border-fuchsia-200 bg-fuchsia-50/50",
  },
  {
    label: "Injury Management & Return-to-Play",
    description: "How Tomo handles an athlete with an active injury and progresses them back.",
    types: ["injury_policy"],
    accent: "border-rose-200 bg-rose-50/50",
  },
  {
    label: "Career & Identity",
    description: "CV coaching, recruitment visibility, scholarship paths, career transitions.",
    types: ["career_policy"],
    accent: "border-slate-200 bg-slate-50/50",
  },
];

/** Reverse lookup: directive_type -> section label. */
export function sectionForType(type: DirectiveType): string {
  for (const s of SECTIONS) if (s.types.includes(type)) return s.label;
  return "Advanced";
}

export const STATUS_LABEL: Record<"proposed" | "approved" | "published" | "retired", string> = {
  proposed: "Waiting for review",
  approved: "Approved",
  published: "Live",
  retired: "Retired",
};

export const AUDIENCE_LABEL: Record<"athlete" | "coach" | "parent" | "all", string> = {
  athlete: "Athletes",
  coach: "Coaches",
  parent: "Parents",
  all: "Everyone",
};
