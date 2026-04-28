/**
 * Methodology buckets — Phase 8.
 *
 * The PD's methodology library is partitioned into 14 buckets. Each bucket
 * owns a disjoint slice of directive types so that a methodology document
 * authored against a bucket cannot produce directives that compete across
 * buckets. This eliminates cross-bucket conflicts by construction.
 *
 * SINGLE SOURCE OF TRUTH for:
 *   - bucket slugs (matches DB CHECK constraint in migration 109)
 *   - which directive types each bucket owns
 *   - plain-English label + description
 *   - parser starter prompt template per bucket
 *
 * Mirror in DB: methodology_documents.bucket CHECK constraint.
 */

import type { DirectiveType } from "@/lib/validation/admin/directiveSchemas";

export type BucketSlug =
  | "voice"
  | "safety"
  | "training_science"
  | "calendar"
  | "programs"
  | "knowledge_memory"
  | "athlete_dashboard"
  | "coach_parent"
  | "nutrition"
  | "routing"
  | "wellbeing"
  | "injury"
  | "career"
  | "sleep";

export interface Bucket {
  slug: BucketSlug;
  /** Display name in CMS. */
  label: string;
  /** One-line summary the PD reads when picking a bucket. */
  summary: string;
  /** What's *in scope* for this bucket — bullet list. */
  scope: string[];
  /** What's *not* this bucket's job — pointer to the right bucket. */
  not_this_bucket: string[];
  /** Directive types this bucket exclusively owns. */
  owns: DirectiveType[];
  /** Suggested update cadence — informational. */
  cadence: string;
  /** Starter prose template the PD edits. Empty = no template yet. */
  starter_template: string;
}

export const BUCKETS: Bucket[] = [
  {
    slug: "voice",
    label: "Coaching Voice",
    summary: "Who Tomo is when it speaks. Persona, register, banned phrases, sentence shape.",
    scope: [
      "Persona description and voice attributes",
      "Banned phrases and patterns",
      "Required scaffolds (e.g. always explain ACWR before using it)",
      "Reply length, structure, bullet policy, emoji density",
    ],
    not_this_bucket: [
      "Recommended exercises or programs → Programs & Training Recommendations",
      "What Tomo must never recommend → Safety & Escalation",
    ],
    owns: ["identity", "tone", "response_shape"],
    cadence: "Quarterly",
    starter_template: `# Coaching Voice — Tomo

## Persona
Tomo speaks like a steady, knowledgeable older sibling — credible but not corporate.
[Describe persona: tone, age-appropriateness, register]

## Required behaviors
- Address every athlete by their first name, never as "user" or "athlete".
- Pair every recommendation with a one-sentence reason.

## Banned phrases
- "great effort"
- "you got this"
- [Add more]

## Reply shape
- 2 to 4 short sentences by default.
- Bullets only when listing 3 or more items.
- No emoji.

## Scaffolded acronyms
- Always explain ACWR the first time it's used in a session: "ACWR — your acute-to-chronic workload ratio".`,
  },

  {
    slug: "safety",
    label: "Safety & Escalation",
    summary: "What Tomo must never do, hard-stop conditions, when to alert a coach or parent.",
    scope: [
      "PHV, age, and load guardrails (blocked exercises, caps)",
      "Safety gates that hard-stop a recommendation",
      "Escalation triggers and notification targets",
    ],
    not_this_bucket: [
      "Active-injury handling and return-to-play → Injury Management",
      "Mental health crisis handling → Mental Health & Performance",
    ],
    owns: ["guardrail_phv", "guardrail_age", "guardrail_load", "safety_gate", "escalation"],
    cadence: "Whenever new evidence or incident — always with clinician/legal review",
    starter_template: `# Safety & Escalation

## PHV (growth spurt) blocks
Athletes mid-PHV must never receive recommendations for:
- Max-effort lifts
- Depth jumps
- [Add more]
Reason: [evidence reference]

## Age-band restrictions
- Athletes under 14: no plyometric program recommendations.
- [Add more]

## Load caps
- ACWR > 1.5: cap weekly load at 80% of last week.
- [Add more]

## Hard stops
Tomo halts training advice and escalates immediately when:
- Athlete reports pain at 4+/10
- Athlete reports a crisis-level mood signal
- [Add more]

## Escalation
- Crisis signals → notify on-call coach within 5 minutes via [channel].
- ACWR > 1.5 for 7+ days → notify head coach in next daily digest.`,
  },

  {
    slug: "training_science",
    label: "Training Science",
    summary: "What 'good' looks like, thresholds, training modes, periodization.",
    scope: [
      "Performance model — what attributes matter for each sport/position",
      "Green/yellow/red thresholds for any signal",
      "Training modes (Build / Taper / Recovery / Pre-match)",
      "Season planning, taper, peak rules",
    ],
    not_this_bucket: [
      "When training fits around school/sleep → Calendar & Life Balance",
      "Specific programs and recommendations → Programs & Training Recommendations",
    ],
    owns: ["performance_model", "threshold", "mode_definition", "planning_policy"],
    cadence: "Seasonal",
    starter_template: `# Training Science

## Performance model
For [sport], the four-layer model is:
1. [Layer 1 — e.g. Aerobic capacity]
2. [Layer 2]
3. [Layer 3]
4. [Layer 4]

Per position priorities:
- Striker: [priority order]
- Defender: [priority order]

## Thresholds
For U17 strikers in Build mode:
- CCRS green: ≥ 75
- CCRS yellow: 60–74
- CCRS red: < 60

## Training modes
- Build: 3 weeks progressive load, 1 week deload.
- Taper: 7 days pre-competition, 50% load reduction.
- Recovery: [definition]
- Pre-match: [definition]

## Periodization
- [Macro-cycle structure]
- [Peak windows]`,
  },

  {
    slug: "calendar",
    label: "Calendar & Life Balance",
    summary: "When training fits around school, sleep, exams.",
    scope: [
      "School-hours blocks",
      "Exam-period training caps",
      "Recovery gaps between sessions",
      "Double-session rules",
    ],
    not_this_bucket: [
      "Sleep duration and bedtime windows → Sleep",
      "What training to do → Training Science / Programs",
    ],
    owns: ["scheduling_policy"],
    cadence: "Per academic term",
    starter_template: `# Calendar & Life Balance

## School-hours blocks
- Weekdays 08:00–15:00: no training sessions scheduled.
- [Other school-related blocks]

## Exam-period rules
- 3 days before a major exam: no high-intensity sessions.
- During exam week: training volume capped at 50%.

## Session spacing
- Minimum 36 hours between two high-intensity sessions for athletes under 16.
- [Other rules]

## Double-session rules
- Athletes under 14: no double-session days.
- [Other rules]`,
  },

  {
    slug: "programs",
    label: "Programs & Training Recommendations",
    summary: "What Tomo can suggest in chat, which programs to recommend or block.",
    scope: [
      "Blocked categories of recommendations",
      "Mandatory clauses (always pair recommendation with a reason)",
      "Max counts per reply",
      "Programs to recommend, block, or load-cap per athlete profile",
    ],
    not_this_bucket: [
      "Nutrition recommendations → Nutrition",
      "Mental performance drills → Mental Health & Performance",
      "What Tomo says when it recommends → Coaching Voice",
    ],
    owns: ["recommendation_policy", "program_rule"],
    cadence: "Monthly",
    starter_template: `# Programs & Training Recommendations

## Always
- Every recommendation pairs with a one-sentence reason.
- Maximum 3 specific exercise recommendations per reply.

## Never
- [List blocked categories — e.g. unverified supplements, max-effort lifts for U14]

## Programs
- Recommend "Tempo intervals U17" for athletes in Build mode.
- Block "High-volume plyometric" for athletes under 14.
- Load-cap "Sprint repeat" at 80% volume for athletes returning from injury.`,
  },

  {
    slug: "knowledge_memory",
    label: "Knowledge & Memory",
    summary: "Which knowledge sources Tomo searches, what to extract from athlete chats.",
    scope: [
      "Allowed RAG sources",
      "Blocked sources",
      "What atoms to extract from athlete check-ins",
      "Memory expiration and dedup rules",
    ],
    not_this_bucket: [
      "Family/peer context — sensitive — handled here via memory_policy + surface_policy in Coach & Parent.",
    ],
    owns: ["rag_policy", "memory_policy"],
    cadence: "Quarterly",
    starter_template: `# Knowledge & Memory

## Knowledge sources
Tomo searches:
- The curated coaching library
- The athlete's own check-ins and journal
Tomo never searches:
- Public social media
- Unverified supplement / training forums

## Memory atoms
Tomo extracts atoms about:
- Goals (with dates)
- Active and historical injuries
- Family context
Tomo never extracts:
- Body-image-adjacent language
- Peer-shaming content

## Persistence
- Atoms expire after 90 days unless re-confirmed.
- Goals persist until met or explicitly retired.`,
  },

  {
    slug: "athlete_dashboard",
    label: "Athlete Dashboard",
    summary: "Which cards and alerts appear on each athlete's dashboard.",
    scope: [
      "Dashboard cards by audience scope",
      "Hero alerts (the colored block at the top)",
      "Card ordering and visibility per athlete profile",
    ],
    not_this_bucket: [
      "Coach dashboard widgets → Coach & Parent Views",
    ],
    owns: ["dashboard_section", "signal_definition"],
    cadence: "Monthly",
    starter_template: `# Athlete Dashboard

## Cards every athlete sees
- Today's session
- Readiness score
- Streak

## Cards by athlete profile
- U17+ also see: 7-day load chart, Coachability index.
- Strikers in pre-match mode also see: Sprint readiness card.

## Hero alerts
- Red signal alert when CCRS < 50 with streak loss.
- [Add more signals]`,
  },

  {
    slug: "coach_parent",
    label: "Coach & Parent Views",
    summary: "What coaches see (alerts, roster), what parents see (reports, blocked topics).",
    scope: [
      "Coach dashboard widgets and alert priority",
      "Parent report cadence and template",
      "Surface rules: translate jargon, hide PHV from coach chat, etc.",
      "Triangle coordination — how info flows between athlete, coach, parent",
    ],
    not_this_bucket: [
      "Crisis escalation — that's Safety & Escalation; this bucket only routes the message.",
    ],
    owns: ["coach_dashboard_policy", "parent_report_policy", "surface_policy"],
    cadence: "Quarterly",
    starter_template: `# Coach & Parent Views

## Coach dashboard
- Roster sorts by readiness ascending — at-risk first.
- Coach alerts fire for: ACWR > 1.5, missed check-ins ≥ 3, mood-flag signals.

## Parent reports
- Frequency: weekly digest every Sunday 18:00 — never daily.
- Template: [reference]
- Blocked topics in parent reports: load metrics, ACWR, PHV stage, body-image-adjacent content.

## Surface rules
- Parents see plain-English summaries only — translate jargon.
- Coaches see PHV stage; parents do not.`,
  },

  {
    slug: "nutrition",
    label: "Nutrition",
    summary: "What Tomo recommends to eat, drink, supplement; pre/post-session timing; hydration.",
    scope: [
      "Recommended food / hydration / supplement categories",
      "Blocked nutrition categories",
      "Pre / post-session fueling windows",
      "Dietary patterns Tomo respects (halal, vegetarian, etc.)",
    ],
    not_this_bucket: [
      "Disordered-eating signals → Mental Health & Performance",
      "Hard-stop on calorie restriction → Safety & Escalation",
    ],
    owns: ["nutrition_policy"],
    cadence: "Quarterly",
    starter_template: `# Nutrition

## Recommended categories
- Whole foods
- Recovery shakes within 30 minutes post-session
- [Add more]

## Blocked categories
- Calorie restriction below RMR
- Unverified supplements
- Fad diets
- [Add more]

## Pre / post-session windows
- Pre-session fueling window: 60–90 minutes before.
- Post-session window: 30 minutes for recovery shake; 2 hours for full meal.

## Hydration
- 500–700 ml per hour of training.

## Dietary patterns Tomo respects
- Halal, vegetarian, vegan, gluten-free, dairy-free.`,
  },

  {
    slug: "routing",
    label: "Routing & Intent",
    summary: "How Tomo classifies what the athlete is asking and which intent gets which response.",
    scope: [
      "Intent classifier examples and disambiguation rules",
      "What Tomo does when asked specific intents (log_pain, log_session, ask_for_recommendation)",
      "Parser settings (LLM tier, prompts)",
    ],
    not_this_bucket: [
      "What Tomo says — Coaching Voice",
      "What Tomo can recommend — Programs",
    ],
    owns: ["routing_classifier", "routing_intent", "meta_parser", "meta_conflict"],
    cadence: "Rare — usually preset by engineering",
    starter_template: `# Routing & Intent

## Intent: log_pain
- Trigger phrases: "my [body part] hurts", "I'm sore", "pain in my…"
- Response: confirm location + 0–10 scale, log to journal, route to safety check.

## Intent: ask_for_recommendation
- Trigger phrases: "what should I do today", "any recs", "what now"
- Response: pull readiness + mode, recommend within bucket 5 rules.

## Conflict resolution
- When two intent rules tie, prefer the more specific (more trigger phrases match).`,
  },

  {
    slug: "wellbeing",
    label: "Mental Health & Performance",
    summary: "Mood, stress, motivation, focus, mindset, pre-match mental prep.",
    scope: [
      "Trigger conditions (athlete reports anxiety, missed check-ins, pre-match nerves)",
      "Response actions — tone shifts, suggested drills, escalations",
      "Blocked topics (body-image, weight talk for U16)",
      "Reflection prompts Tomo can offer",
    ],
    not_this_bucket: [
      "Crisis-level escalation → Safety & Escalation",
      "Recommendations for sleep / nutrition as part of mental recovery → Sleep / Nutrition",
    ],
    owns: ["wellbeing_policy"],
    cadence: "Quarterly — with sport-psych review when significant",
    starter_template: `# Mental Health & Performance

## Triggers
- Athlete reports anxiety or stress.
- Athlete misses 3+ check-ins.
- Pre-match nerves.
- [Add more]

## Response actions
- Soften tone, drop training advice for the turn.
- Offer one reflection prompt.
- Suggest a 4-7-8 breathing or visualization micro-drill.

## Blocked topics
- Body image and weight talk for athletes under 16.
- Comparison to teammates.

## Reflection prompts
- "What's one thing that went well this week, even on a tough day?"
- [Add more]

## Pre-match mental prep
- 24h before: visualization drill.
- Match day: 3-deep-breath cue 5 minutes before warm-up.`,
  },

  {
    slug: "injury",
    label: "Injury Management & Return-to-Play",
    summary: "How Tomo handles an athlete with an active injury and progresses them back.",
    scope: [
      "Active-injury handling — what Tomo recommends and blocks",
      "RTP stage definitions and progression criteria",
      "Clinician sign-off requirements",
      "Coordination with physio / medical team",
    ],
    not_this_bucket: [
      "Preventive PHV blocks → Safety & Escalation",
      "Pain reporting routing → Routing & Intent",
    ],
    owns: ["injury_policy"],
    cadence: "Whenever new physio/medical evidence",
    starter_template: `# Injury Management & Return-to-Play

## Active injury
While an injury is active:
- Tomo blocks training recommendations for the affected region.
- Tomo recommends mobility / rehab options instead.
- Tomo escalates to physio if athlete reports pain > 4/10.

## RTP stages — example for hamstring strain
- Stage 1: pain-free walk, minimum 3 days.
- Stage 2: light jog, minimum 5 days.
- Stage 3: contact training at 70%, minimum 7 days.
- Stage 4: full match clearance — requires clinician sign-off.

## Clinician sign-off
Required before progressing past stage 3 for:
- Hamstring strains
- Ankle sprains > grade 2
- Concussions (always — full RTP1-7 protocol)

## Defaults
- Minimum days per stage: 3.`,
  },

  {
    slug: "career",
    label: "Career & Identity",
    summary: "CV statement coaching, recruitment visibility, scholarship paths, transitions.",
    scope: [
      "What to write in the CV statement",
      "Recruitment visibility recommendations (private / scout-visible)",
      "Scholarship and university selection guidance",
      "Career-transition support (out of sport, dual-career)",
    ],
    not_this_bucket: [
      "Training programs and progressions → Training Science / Programs",
      "Mental wellbeing during career transitions → Mental Health & Performance",
    ],
    owns: ["career_policy"],
    cadence: "Quarterly — with career-advisor review",
    starter_template: `# Career & Identity

## CV statement guidance
- Keep statements outcome-focused, not goal-focused.
- Avoid superlatives without evidence.
- 60–90 words for U17+, shorter for younger athletes.

## Visibility
- Default: private until U16.
- Scout-visible only after parent/guardian consent.

## Scholarship paths
- [Document by region / sport]

## Defer to advisor
Tomo does not give specific advice on:
- Choosing one university over another.
- Negotiating with agents.
- Specific scholarship dollar amounts.
Tomo recommends booking a session with the human career advisor in these cases.`,
  },

  {
    slug: "sleep",
    label: "Sleep",
    summary: "Sleep windows, hygiene, pre-match sleep rules, debt handling.",
    scope: [
      "Recommended sleep duration by age band",
      "Bedtime windows (local time)",
      "Pre-match sleep minimums",
      "Sleep hygiene rules (blue-light cutoff, wind-down rituals)",
      "Sleep-debt handling",
    ],
    not_this_bucket: [
      "When to schedule training around sleep → Calendar & Life Balance",
      "Recovery cards on dashboard → Athlete Dashboard",
    ],
    owns: ["sleep_policy"],
    cadence: "Quarterly",
    starter_template: `# Sleep

## Recommended duration
- U13–U15: 9–11 hours.
- U17+: 8–10 hours.
- Senior: 7–9 hours.

## Bedtime window
- School nights: 21:30–23:00 local.
- Match-eve: 21:00 lights out for U17+.

## Pre-match sleep
- Minimum 8 hours the night before competition.
- If under threshold, Tomo flags to coach in pre-match readiness.

## Sleep hygiene
- Blue-light cutoff: 60 minutes before bed.
- Caffeine cutoff: 14:00 local.
- No phone in bed for U17 and below.

## Sleep debt
- 2 nights below 6 hours: drop next day's intensity by one level.
- 3 nights below 6 hours: full rest day.`,
  },
];

export const BUCKET_BY_SLUG: Record<BucketSlug, Bucket> = Object.fromEntries(
  BUCKETS.map((b) => [b.slug, b]),
) as Record<BucketSlug, Bucket>;

/** Reverse lookup: directive type → bucket slug. Disjoint by construction. */
export const BUCKET_FOR_TYPE: Partial<Record<DirectiveType, BucketSlug>> = (() => {
  const map: Partial<Record<DirectiveType, BucketSlug>> = {};
  for (const bucket of BUCKETS) {
    for (const t of bucket.owns) {
      map[t] = bucket.slug;
    }
  }
  return map;
})();

/** All bucket slugs — for DB CHECK parity. */
export const BUCKET_SLUGS: BucketSlug[] = BUCKETS.map((b) => b.slug);
