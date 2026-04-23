/**
 * CV AI Generation — Single player-profile AI summary.
 *
 * Writes to cv_profiles.ai_summary (+status/timestamp) AND appends a new row
 * to cv_ai_summary_versions so the UI can render the generation log with
 * approval dots (mock 03).
 *
 * Uses trackedClaudeCall() for telemetry. ~$0.003 per generation (Sonnet).
 */

import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { trackedClaudeCall } from "@/lib/trackedClaudeCall";
import { assembleCVBundle } from "./cvAssembler";
import type { FullCVBundle } from "./cvAssembler";
import { shouldRegenerateSummary, buildSummaryDataSnapshot } from "./changeDetection";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  return client;
}

const SONNET = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const db = () => supabaseAdmin();

export interface GenerateResult {
  generated: boolean;
  version_number: number | null;
  content: string | null;
}

/**
 * Generate (or regenerate) the player profile AI summary.
 *
 * @param athleteId  Athlete UUID
 * @param force      Skip change-detection and always regenerate
 */
export async function generateAISummary(
  athleteId: string,
  force: boolean = false
): Promise<GenerateResult> {
  const cv = await assembleCVBundle(athleteId);

  const { data: existing } = await (db() as any)
    .from("cv_profiles")
    .select("ai_summary, ai_summary_status, ai_summary_last_generated")
    .eq("athlete_id", athleteId)
    .single();

  if (!force && !shouldRegenerateSummary(existing, cv)) {
    return { generated: false, version_number: null, content: existing?.ai_summary ?? null };
  }

  const content = await generateSummary(athleteId, cv);
  if (!content) {
    return { generated: false, version_number: null, content: null };
  }

  // Determine next version number
  const { data: latest } = await (db() as any)
    .from("cv_ai_summary_versions")
    .select("version_number")
    .eq("athlete_id", athleteId)
    .order("version_number", { ascending: false })
    .limit(1)
    .single();

  const nextVersion = (latest?.version_number ?? 0) + 1;

  // Write new version
  await (db() as any).from("cv_ai_summary_versions").insert({
    athlete_id: athleteId,
    version_number: nextVersion,
    content,
    data_snapshot: buildSummaryDataSnapshot(cv),
  });

  // Update cv_profiles head pointer
  const nextStatus =
    existing?.ai_summary_status === "approved" ? "needs_update" : "draft";

  await (db() as any)
    .from("cv_profiles")
    .upsert(
      {
        athlete_id: athleteId,
        ai_summary: content,
        ai_summary_status: nextStatus,
        ai_summary_last_generated: new Date().toISOString(),
        ai_summary_approved_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "athlete_id" }
    );

  return { generated: true, version_number: nextVersion, content };
}

/**
 * Approve the current AI summary — locks status to 'approved' and marks the
 * latest version row as approved.
 */
export async function approveAISummary(athleteId: string): Promise<void> {
  const now = new Date().toISOString();

  await (db() as any)
    .from("cv_profiles")
    .update({
      ai_summary_status: "approved",
      ai_summary_approved_at: now,
      updated_at: now,
    })
    .eq("athlete_id", athleteId);

  const { data: latest } = await (db() as any)
    .from("cv_ai_summary_versions")
    .select("version_number")
    .eq("athlete_id", athleteId)
    .order("version_number", { ascending: false })
    .limit(1)
    .single();

  if (latest?.version_number != null) {
    await (db() as any)
      .from("cv_ai_summary_versions")
      .update({ approved: true, approved_at: now })
      .eq("athlete_id", athleteId)
      .eq("version_number", latest.version_number);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// GENERATION
// ═══════════════════════════════════════════════════════════════════════════

async function generateSummary(athleteId: string, cv: FullCVBundle): Promise<string | null> {
  const topBenchmarks = cv.verified_performance.benchmarks
    .slice()
    .sort((a, b) => b.percentile - a.percentile)
    .slice(0, 3);

  const currentCareer = cv.career.find(c => c.is_current);
  const ageGroup = cv.identity.age_group ?? "youth";
  const position = cv.positions.primary_label ?? cv.identity.primary_position ?? "player";
  const phv = cv.physical.phv_stage
    ? `${cv.physical.phv_stage}-PHV${cv.physical.phv_offset_years != null ? ` (${cv.physical.phv_offset_years > 0 ? "+" : ""}${cv.physical.phv_offset_years}y)` : ""}`
    : "maturity unknown";

  const prompt = `Write a scout-facing profile paragraph for an ${ageGroup} ${cv.identity.sport} player.
Requirements:
- 4-5 sentences, third person
- Lead with position and a headline physical strength (specific number + percentile)
- Include maturity context (PHV stage) if it shapes readiness for senior load
- Reference verified training data (sessions, training age) as evidence of consistency
- Close with what they project toward at professional level
- Data-specific throughout. No generic phrases ("hard-working", "team player")
- Plain text only, no quotes, no markdown

Player:
Name: ${cv.identity.full_name || "Unknown"}
Age: ${cv.identity.age ?? "unknown"} · Age group: ${ageGroup}
Sport/Position: ${cv.identity.sport} · ${position}
Maturity: ${phv}
Preferred foot: ${cv.identity.preferred_foot ?? "unknown"}
Height/Weight: ${cv.physical.height_cm ?? "?"}cm / ${cv.physical.weight_kg ?? "?"}kg

Training record:
Sessions: ${cv.verified_performance.sessions_total} · Training age: ${cv.verified_performance.training_age_label} · Streak: ${cv.verified_performance.streak_days}d
ACWR: ${cv.verified_performance.acwr != null ? cv.verified_performance.acwr.toFixed(2) : "n/a"} (${cv.verified_performance.training_balance ?? "unknown"})
Overall percentile: ${cv.verified_performance.overall_percentile ?? "n/a"}

Top benchmarks:
${topBenchmarks.length === 0
  ? "None recorded yet"
  : topBenchmarks.map(b => `- ${b.metric_label}: ${b.value}${b.unit} (${Math.round(b.percentile)}th percentile, ${b.age_band} ${b.position})`).join("\n")}

Current club: ${currentCareer ? `${currentCareer.club_name} (${currentCareer.league_level ?? "level unspecified"})` : "not entered"}
${currentCareer ? `Career stats: ${[
  currentCareer.appearances != null ? `${currentCareer.appearances} apps` : null,
  currentCareer.goals != null ? `${currentCareer.goals} goals` : null,
  currentCareer.assists != null ? `${currentCareer.assists} assists` : null,
].filter(Boolean).join(", ") || "none"}` : ""}`;

  try {
    const { message: response } = await trackedClaudeCall(
      getClient(),
      { model: SONNET, max_tokens: 220, messages: [{ role: "user", content: prompt }] },
      { userId: athleteId, agentType: "cv_generation", intentId: "player_profile_summary" }
    );
    const text = response.content[0];
    return text.type === "text" ? text.text.trim() : null;
  } catch (err) {
    console.error("[CV-AI] Player profile summary generation failed:", err);
    return null;
  }
}
