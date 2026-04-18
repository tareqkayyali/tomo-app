// UGC moderation — pure wrapper around an injected classifier vendor.
//
// Every user-generated write (event annotations, coach notes, journal
// entries, chat messages that go coach/parent → athlete) must flow
// through this module. The wrapper is intentionally vendor-agnostic:
// the decision logic is pure and testable, the vendor call is injected.
// Today OpenAI Moderation API. Swap to Azure AI Content Safety when EU
// data residency is required.
//
// Contract:
//   moderate(input) → { severity, flags, autoHide, classifierScore? }
//
// Callers MUST:
//   1. call moderate() before writing the UGC row, and
//   2. write the returned moderation_state to the row.
//
// severity='critical' → autoHide=true → row written with
// moderation_state='hidden', queue row inserted with state='auto_hidden',
// author never sees the content echoed back.

import type { SupabaseClient } from "@supabase/supabase-js";

// ── Types ──────────────────────────────────────────────────────────

export type Severity = "low" | "med" | "high" | "critical";

export type ModerationFlag =
  | "harassment"
  | "sexual"
  | "sexual_minors"
  | "self_harm"
  | "violence"
  | "hate"
  | "illicit"
  | "spam_like";

export interface ModerationInput {
  body: string;
  targetType: "event_annotation" | "chat_message" | "coach_note" | "journal_entry" | "user_profile";
  targetId?: string;
  authorId: string;
  // Whether the recipient is a minor (<16) — tightens thresholds.
  recipientIsMinor?: boolean;
}

export interface ModerationResult {
  severity: Severity;
  flags: ModerationFlag[];
  autoHide: boolean;
  classifierScore?: Record<string, number>;
  moderationState: "pending" | "cleared" | "hidden";
}

// ── Classifier adapter ─────────────────────────────────────────────

export interface ClassifierResponse {
  flags: ModerationFlag[];
  scores: Record<string, number>; // 0..1 per category
}

export type ClassifierFn = (body: string) => Promise<ClassifierResponse>;

// Default classifier: OpenAI Moderation API.
// Docs: https://platform.openai.com/docs/guides/moderation
export const openAIClassifier: ClassifierFn = async (body: string) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // No key configured — fail open to severity low. Not silent: caller
    // logs the classifier outage so it shows up in observability.
    throw new Error("moderate: OPENAI_API_KEY not configured");
  }

  const response = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "omni-moderation-latest",
      input: body,
    }),
  });

  if (!response.ok) {
    throw new Error(`moderate: OpenAI ${response.status} ${await response.text()}`);
  }

  const json = (await response.json()) as {
    results: Array<{
      flagged: boolean;
      categories: Record<string, boolean>;
      category_scores: Record<string, number>;
    }>;
  };

  const r = json.results[0];
  if (!r) throw new Error("moderate: empty OpenAI result");

  // Map OpenAI category names to our ModerationFlag vocabulary.
  const flags: ModerationFlag[] = [];
  const s = r.category_scores;
  const c = r.categories;
  if (c["harassment"] || c["harassment/threatening"]) flags.push("harassment");
  if (c["sexual"]) flags.push("sexual");
  if (c["sexual/minors"]) flags.push("sexual_minors");
  if (c["self-harm"] || c["self-harm/intent"] || c["self-harm/instructions"]) flags.push("self_harm");
  if (c["violence"] || c["violence/graphic"]) flags.push("violence");
  if (c["hate"] || c["hate/threatening"]) flags.push("hate");
  if (c["illicit"] || c["illicit/violent"]) flags.push("illicit");

  return { flags, scores: s };
};

// ── Pure severity decision ─────────────────────────────────────────
// Zero I/O. Takes classifier output + context, returns severity +
// auto-hide decision. The SINGLE place this logic lives; swap vendor
// without rewriting it.

export function decideSeverity(
  classifier: ClassifierResponse,
  context: { recipientIsMinor: boolean }
): { severity: Severity; autoHide: boolean } {
  // sexual_minors is always critical regardless of score — this is
  // illegal content in virtually every jurisdiction and Apple 1.2
  // mandates automatic removal.
  if (classifier.flags.includes("sexual_minors")) {
    return { severity: "critical", autoHide: true };
  }

  // self_harm toward a minor recipient is critical (duty of care).
  if (
    context.recipientIsMinor &&
    (classifier.flags.includes("self_harm") || classifier.flags.includes("illicit"))
  ) {
    return { severity: "critical", autoHide: true };
  }

  const topScore = Math.max(...Object.values(classifier.scores || {}), 0);

  // Stricter thresholds when the recipient is a minor.
  const thresholds = context.recipientIsMinor
    ? { critical: 0.80, high: 0.50, med: 0.25, low: 0.05 }
    : { critical: 0.90, high: 0.70, med: 0.40, low: 0.10 };

  if (topScore >= thresholds.critical) return { severity: "critical", autoHide: true };
  if (topScore >= thresholds.high) return { severity: "high", autoHide: true };
  if (topScore >= thresholds.med) return { severity: "med", autoHide: false };
  if (topScore >= thresholds.low) return { severity: "low", autoHide: false };

  // No flag, no score above low — row is cleared immediately, no queue
  // entry created by the caller.
  return { severity: "low", autoHide: false };
}

// ── Main entry ─────────────────────────────────────────────────────

export async function moderate(
  input: ModerationInput,
  deps: { classifier?: ClassifierFn } = {}
): Promise<ModerationResult> {
  const classifierFn = deps.classifier ?? openAIClassifier;

  // Empty or whitespace-only bodies are always cleared.
  if (!input.body || !input.body.trim()) {
    return { severity: "low", flags: [], autoHide: false, moderationState: "cleared" };
  }

  const classifier = await classifierFn(input.body);
  const { severity, autoHide } = decideSeverity(classifier, {
    recipientIsMinor: input.recipientIsMinor ?? false,
  });

  const moderationState: "pending" | "cleared" | "hidden" = autoHide
    ? "hidden"
    : severity === "low"
      ? "cleared"
      : "pending";

  return {
    severity,
    flags: classifier.flags,
    autoHide,
    classifierScore: classifier.scores,
    moderationState,
  };
}

// ── Queue writer ───────────────────────────────────────────────────
// Writes a moderation_queue row when severity >= med OR autoHide=true.
// Pure function version of the write (db is injected) so callers can
// compose it with their own insert-in-transaction pattern.

type UntypedDb = { from: (table: string) => any };

export async function writeQueueRow(
  db: UntypedDb,
  targetType: ModerationInput["targetType"],
  targetId: string,
  result: ModerationResult,
  trigger: "classifier" | "report" | "keyword" | "first_post" = "classifier"
): Promise<void> {
  if (result.severity === "low" && !result.autoHide) return;

  await db.from("ugc_moderation_queue").insert({
    target_type: targetType,
    target_id: targetId,
    trigger,
    classifier_score: result.classifierScore ?? null,
    severity: result.severity,
    state: result.autoHide ? "auto_hidden" : "pending",
  });
}

// ── Block filter ───────────────────────────────────────────────────
// Drop rows authored by users the viewer has blocked (or who have
// blocked the viewer). Used by every UGC read site.

export async function blockFilter<T extends { author_id: string }>(
  db: UntypedDb,
  viewerId: string,
  rows: T[]
): Promise<T[]> {
  if (rows.length === 0) return rows;

  const authorIds = Array.from(new Set(rows.map((r) => r.author_id)));
  const { data: blocks } = await db
    .from("ugc_blocks")
    .select("blocker_id, blocked_id")
    .or(
      `and(blocker_id.eq.${viewerId},blocked_id.in.(${authorIds.join(",")})),` +
        `and(blocked_id.eq.${viewerId},blocker_id.in.(${authorIds.join(",")}))`
    );

  if (!blocks || blocks.length === 0) return rows;

  const hidden = new Set<string>();
  for (const b of blocks as Array<{ blocker_id: string; blocked_id: string }>) {
    if (b.blocker_id === viewerId) hidden.add(b.blocked_id);
    if (b.blocked_id === viewerId) hidden.add(b.blocker_id);
  }

  return rows.filter((r) => !hidden.has(r.author_id));
}
