// Triangle — conflict detection.
//
// Pure function. Zero I/O. Given the set of annotations on an event,
// decides whether there's a coach/parent disagreement worth surfacing
// the "Ask Tomo" pill for (P3.1, 2026-04-18).
//
// Detection rules (in priority order):
//   1. annotation_type='conflict_flag' in ANY author's annotation
//      → hasConflict=true with axis='explicit'. System-authored
//      conflict flags (e.g. from parent-supersedes-coach in P2.2)
//      short-circuit here.
//   2. Two or more distinct author_roles present AND at least one
//      pair of (coach, parent) annotations with OPPOSING polarity:
//        "push" vs "rest"  → axis='intent'
//        "push"/"rest" across different training-ish domains → axis='load'
//      Polarity is a light-weight keyword classifier; embedding-
//      similarity v2 is planned after 1k labelled samples.
//   3. Two author_roles present with "timing" / "schedule" keywords
//      disagreeing on WHEN something happens → axis='timing'.
//   4. Otherwise no conflict.
//
// Intentionally conservative. False negatives (missed conflicts) are
// preferable to false positives (triggering mediation UI on amicable
// notes). Every detection writes a log entry at the call site for
// offline labelling.

export type Axis = "intent" | "timing" | "load" | "explicit" | "unknown";
export type AuthorRole = "coach" | "parent" | "athlete" | "system";

export interface AnnotationForConflict {
  id: string;
  author_id: string;
  author_role: AuthorRole;
  domain: string;
  body: string;
  annotation_type?: string;
  created_at: string;
}

export interface ConflictResult {
  hasConflict: boolean;
  authors: string[];   // user_ids involved in the conflict
  roles: AuthorRole[]; // distinct author_roles involved
  domains: string[];
  axis: Axis;
  rationale: string;
}

// ── Keyword classifiers ─────────────────────────────────────────────
// Tight regex with word boundaries on each side so 'pushover' doesn't
// match 'push' and 'restaurant' doesn't match 'rest'.

const PUSH_PATTERNS: RegExp[] = [
  /\bpush\b/i,
  /\bpushing\b/i,
  /\bintensify\b/i,
  /\bstep up\b/i,
  /\bstep it up\b/i,
  /\bharder\b/i,
  /\bmax\b/i,
  /\bcompete\b/i,
  /\bgo hard\b/i,
  /\bgive more\b/i,
  /\bhit it\b/i,
  /\bgrind\b/i,
  /\bbust\b/i,
];

const REST_PATTERNS: RegExp[] = [
  /\brest\b/i,
  /\brest day\b/i,
  /\bskip\b/i,
  /\btake (?:it|the day) (?:easy|off)\b/i,
  /\blighter\b/i,
  /\blight session\b/i,
  /\blight week\b/i,
  /\brecovery\b/i,
  /\brecover\b/i,
  /\bback off\b/i,
  /\bdeload\b/i,
  /\bhold off\b/i,
  /\bslow down\b/i,
  /\bease (?:up|off)\b/i,
  /\breduce\b/i,
];

const TIMING_PATTERNS: RegExp[] = [
  /\bmove (?:it|this) (?:to|earlier|later)\b/i,
  /\breschedule\b/i,
  /\bcan't (?:make|attend)\b/i,
  /\bafter exam\b/i,
  /\bbefore exam\b/i,
  /\bnot this week\b/i,
  /\btomorrow instead\b/i,
];

function hasAny(body: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(body));
}

// Polarity classifier — returns 'push' | 'rest' | 'neutral'. Returns
// 'neutral' when both are present (mixed message); the caller treats
// neutral as non-opposing.
export type Polarity = "push" | "rest" | "neutral";

export function classifyPolarity(body: string): Polarity {
  const push = hasAny(body, PUSH_PATTERNS);
  const rest = hasAny(body, REST_PATTERNS);
  if (push && rest) return "neutral";
  if (push) return "push";
  if (rest) return "rest";
  return "neutral";
}

function classifyTiming(body: string): boolean {
  return hasAny(body, TIMING_PATTERNS);
}

// ── Main entry ───────────────────────────────────────────────────────

const TRAINING_DOMAINS = new Set(["training", "wellbeing", "safety"]);

export function detectConflict(
  annotations: AnnotationForConflict[]
): ConflictResult {
  // Filter to live annotations only — callers should already have
  // excluded retracted/hidden rows, but be defensive here.
  const live = annotations.filter((a) => a && a.body && a.body.trim().length > 0);

  // Rule 1: explicit conflict_flag
  const flag = live.find((a) => a.annotation_type === "conflict_flag");
  if (flag) {
    const authors = Array.from(new Set(live.map((a) => a.author_id)));
    const roles = Array.from(new Set(live.map((a) => a.author_role)));
    const domains = Array.from(new Set(live.map((a) => a.domain)));
    return {
      hasConflict: true,
      authors,
      roles,
      domains,
      axis: "explicit",
      rationale: "annotation_type=conflict_flag set",
    };
  }

  // Partition by author_role; only coach+parent disagreement counts
  // as a Triangle conflict. Athlete-authored notes inform context but
  // don't themselves trigger mediation.
  const coachAnns = live.filter((a) => a.author_role === "coach");
  const parentAnns = live.filter((a) => a.author_role === "parent");
  if (coachAnns.length === 0 || parentAnns.length === 0) {
    return empty("less than two distinct guardian roles");
  }

  // Rule 2: opposing polarity pairs
  for (const c of coachAnns) {
    const cp = classifyPolarity(c.body);
    if (cp === "neutral") continue;
    for (const p of parentAnns) {
      const pp = classifyPolarity(p.body);
      if (pp === "neutral") continue;
      if (cp !== pp) {
        const axis: Axis =
          TRAINING_DOMAINS.has(c.domain) && TRAINING_DOMAINS.has(p.domain)
            ? "load"
            : "intent";
        return {
          hasConflict: true,
          authors: [c.author_id, p.author_id],
          roles: ["coach", "parent"],
          domains: Array.from(new Set([c.domain, p.domain])),
          axis,
          rationale: `coach(${cp}) vs parent(${pp}) on ${c.domain}/${p.domain}`,
        };
      }
    }
  }

  // Rule 3: timing disagreements (both authors mention schedule changes
  // but no polarity conflict — surface softly)
  const coachTiming = coachAnns.find((a) => classifyTiming(a.body));
  const parentTiming = parentAnns.find((a) => classifyTiming(a.body));
  if (coachTiming && parentTiming) {
    return {
      hasConflict: true,
      authors: [coachTiming.author_id, parentTiming.author_id],
      roles: ["coach", "parent"],
      domains: Array.from(new Set([coachTiming.domain, parentTiming.domain])),
      axis: "timing",
      rationale: "coach + parent both proposed schedule changes",
    };
  }

  return empty("no opposing polarity or timing signal");
}

function empty(reason: string): ConflictResult {
  return {
    hasConflict: false,
    authors: [],
    roles: [],
    domains: [],
    axis: "unknown",
    rationale: reason,
  };
}
