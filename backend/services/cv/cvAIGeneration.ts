/**
 * CV AI Generation — Personal statements, trajectory narratives, dual-role narratives.
 *
 * Uses trackedClaudeCall() for telemetry. All generation is idempotent and
 * stored in cv_profiles. Change detection determines when to re-generate.
 *
 * Cost summary:
 *   Personal statement (Sonnet): ~$0.003 per generation
 *   Trajectory narrative (Haiku): ~$0.00005 per generation
 *   Dual-role narrative (Sonnet): ~$0.002 per generation
 */

import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { trackedClaudeCall } from "@/lib/trackedClaudeCall";
import { assembleCVBundle } from "./cvAssembler";
import type { FullCVBundle } from "./cvAssembler";
import { shouldRegenerateStatement, buildDataSnapshotForChangeDetection } from "./changeDetection";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  return client;
}

const SONNET = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";
const HAIKU = process.env.ANTHROPIC_HAIKU_MODEL || "claude-haiku-4-5-20251001";
const db = () => supabaseAdmin();

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Generate or regenerate all CV narratives for an athlete.
 * Returns which narratives were generated.
 */
export async function generateCVNarratives(
  athleteId: string,
  options: { force?: boolean; cvType?: "club" | "university" | "both" } = {}
): Promise<{ club_statement: boolean; uni_statement: boolean; trajectory: boolean; dual_role: boolean }> {
  const force = options.force ?? false;
  const cvType = options.cvType ?? "both";

  const cv = await assembleCVBundle(athleteId);

  // Check existing cv_profile
  const { data: existing } = await (db() as any)
    .from("cv_profiles")
    .select("*")
    .eq("athlete_id", athleteId)
    .single();

  const results = { club_statement: false, uni_statement: false, trajectory: false, dual_role: false };

  // ── Club Personal Statement ──
  if ((cvType === "club" || cvType === "both") &&
      (force || shouldRegenerateStatement(existing, cv, "club"))) {
    const statement = await generateClubStatement(athleteId, cv);
    if (statement) {
      await upsertCVProfile(athleteId, {
        personal_statement_club: statement,
        statement_status: "draft",
        statement_last_generated: new Date().toISOString(),
        statement_data_snapshot: buildDataSnapshotForChangeDetection(cv),
      });
      results.club_statement = true;
    }
  }

  // ── University Personal Statement ──
  if ((cvType === "university" || cvType === "both") &&
      (force || shouldRegenerateStatement(existing, cv, "university"))) {
    const statement = await generateUniStatement(athleteId, cv);
    if (statement) {
      await upsertCVProfile(athleteId, {
        personal_statement_uni: statement,
        statement_status: existing?.statement_status === "approved" ? "needs_update" : "draft",
        statement_last_generated: new Date().toISOString(),
        statement_data_snapshot: buildDataSnapshotForChangeDetection(cv),
      });
      results.uni_statement = true;
    }
  }

  // ── Trajectory Narrative ──
  if (cv.trajectory.metric_trends.length >= 1 &&
      (force || !existing?.trajectory_narrative || daysSince(existing?.trajectory_last_generated) > 30)) {
    const narrative = await generateTrajectoryNarrative(athleteId, cv);
    if (narrative) {
      await upsertCVProfile(athleteId, {
        trajectory_narrative: narrative,
        trajectory_last_generated: new Date().toISOString(),
      });
      results.trajectory = true;
    }
  }

  // ── Dual-Role Narrative (university only) ──
  if (cv.dual_role.dual_load_index != null &&
      (force || !existing?.dual_role_narrative || daysSince(existing?.dual_role_last_generated) > 30)) {
    const narrative = await generateDualRoleNarrative(athleteId, cv);
    if (narrative) {
      await upsertCVProfile(athleteId, {
        dual_role_narrative: narrative,
        dual_role_last_generated: new Date().toISOString(),
      });
      results.dual_role = true;
    }
  }

  return results;
}

// ── Statement Generators ───────────────────────────────────────────────

async function generateClubStatement(athleteId: string, cv: FullCVBundle): Promise<string | null> {
  const topBenchmarks = cv.performance.benchmarks
    .sort((a, b) => b.percentile - a.percentile)
    .slice(0, 3);

  const currentCareer = cv.career.find(c => c.is_current);

  const prompt = `Write a 3-sentence football player profile for a professional club CV.
Rules:
- Sentence 1: position + training background + one key physical/technical strength with data
- Sentence 2: most notable benchmark or achievement with the specific number
- Sentence 3: what they bring to a club / what they are developing toward
- Tone: professional, confident, specific. No generic phrases like "hard-working" or "team player"
- Never use first person. Write in third person or as a professional summary.
- Output plain text only. No quotes around the text.

Player data:
Name: ${cv.identity.full_name}
Age: ${cv.identity.age ?? "unknown"} | Sport: ${cv.identity.sport} | Position: ${cv.identity.position ?? "unknown"}
Training age: ${cv.performance.training_age_months} months
Streak: ${cv.performance.streak_days} consecutive days
Top benchmarks: ${topBenchmarks.length > 0
    ? topBenchmarks.map(b => `${b.metric_label}: ${b.value}${b.unit} (${b.percentile}th percentile, ${b.age_band})`).join("; ")
    : "not enough test data yet"}
Sessions completed: ${cv.performance.sessions_total}
Most recent club: ${currentCareer ? `${currentCareer.club_name} (${currentCareer.league_level ?? "level not specified"})` : "not entered"}
Career stats: ${currentCareer
    ? [
        currentCareer.appearances != null ? `${currentCareer.appearances} appearances` : null,
        currentCareer.goals != null ? `${currentCareer.goals} goals` : null,
        currentCareer.assists != null ? `${currentCareer.assists} assists` : null,
      ].filter(Boolean).join(", ") || "not entered"
    : "not entered"}
Notable achievements: ${currentCareer?.achievements?.join("; ") ?? "none entered"}
Coachability index: ${cv.performance.coachability ? `${cv.performance.coachability.score}/5.0 (${cv.performance.coachability.label.split("—")[0].trim()})` : "not computed yet"}`;

  try {
    const response = await trackedClaudeCall(
      getClient(),
      { model: SONNET, max_tokens: 150, messages: [{ role: "user", content: prompt }] },
      { userId: athleteId, agentType: "cv_generation", intentId: "club_statement" }
    );
    const text = response.content[0];
    return text.type === "text" ? text.text.trim() : null;
  } catch (err) {
    console.error("[CV-AI] Club statement generation failed:", err);
    return null;
  }
}

async function generateUniStatement(athleteId: string, cv: FullCVBundle): Promise<string | null> {
  const topBenchmarks = cv.performance.benchmarks
    .sort((a, b) => b.percentile - a.percentile)
    .slice(0, 2);

  const currentAcademic = cv.academic.find(a => a.is_current);
  const currentCareer = cv.career.find(c => c.is_current);

  const prompt = `Write a 4-sentence student-athlete profile for a university/NCAA recruitment CV.
Rules:
- Sentence 1: athletic background + academic institution + GPA/predicted grade if available
- Sentence 2: evidence of dual-role management (training consistency, specific data)
- Sentence 3: leadership, character, or community contribution
- Sentence 4: academic and athletic ambitions combined
- Tone: character-forward, discipline-focused, growth-oriented. This is for university coaches.
- Never use first person. Write in third person.
- Output plain text only. No quotes around the text.

Player data:
Name: ${cv.identity.full_name}
Age: ${cv.identity.age ?? "unknown"} | Sport: ${cv.identity.sport} | Position: ${cv.identity.position ?? "unknown"}
Training age: ${cv.performance.training_age_months} months
Sessions completed: ${cv.performance.sessions_total} | Streak: ${cv.performance.streak_days} days
Top benchmarks: ${topBenchmarks.length > 0
    ? topBenchmarks.map(b => `${b.metric_label}: ${b.value}${b.unit} (${b.percentile}th percentile)`).join("; ")
    : "not enough test data yet"}
Current school: ${currentAcademic ? `${currentAcademic.institution}${currentAcademic.gpa ? ` (GPA: ${currentAcademic.gpa})` : ""}` : "not entered"}
Current club: ${currentCareer ? currentCareer.club_name : "not entered"}
Dual-load index: ${cv.dual_role.dual_load_index ?? "not available"}/100
Exam period training rate: ${cv.dual_role.exam_period_training_rate != null ? `${Math.round(cv.dual_role.exam_period_training_rate * 100)}%` : "not available"}
Coachability: ${cv.performance.coachability ? `${cv.performance.coachability.score}/5.0` : "not computed"}
Character traits: ${cv.character_traits.map(t => t.title).join(", ") || "none entered"}`;

  try {
    const response = await trackedClaudeCall(
      getClient(),
      { model: SONNET, max_tokens: 200, messages: [{ role: "user", content: prompt }] },
      { userId: athleteId, agentType: "cv_generation", intentId: "uni_statement" }
    );
    const text = response.content[0];
    return text.type === "text" ? text.text.trim() : null;
  } catch (err) {
    console.error("[CV-AI] University statement generation failed:", err);
    return null;
  }
}

async function generateTrajectoryNarrative(athleteId: string, cv: FullCVBundle): Promise<string | null> {
  const topTrend = cv.trajectory.metric_trends
    .filter(t => t.total_improvement_pct != null)
    .sort((a, b) => Math.abs(b.total_improvement_pct ?? 0) - Math.abs(a.total_improvement_pct ?? 0))[0];

  if (!topTrend) return null;

  const dataPoints = topTrend.data_points;
  const periodMonths = dataPoints.length >= 2
    ? Math.round((new Date(dataPoints[dataPoints.length - 1].date).getTime() - new Date(dataPoints[0].date).getTime()) / (30 * 86400000))
    : 0;

  const prompt = `Write 1-2 sentences describing this athlete's physical development trajectory.
Be specific and concrete. Plain text only. No quotes.

Primary improvement: ${topTrend.metric_label} improved ${topTrend.total_improvement_pct}% over ${periodMonths} months
Data points: ${dataPoints.length} measurements
First: ${dataPoints[0]?.value ?? "?"} (${dataPoints[0]?.zone ?? "?"} zone)
Latest: ${dataPoints[dataPoints.length - 1]?.value ?? "?"} (${dataPoints[dataPoints.length - 1]?.zone ?? "?"} zone)
Other trends: ${cv.trajectory.metric_trends.slice(1).map(t => `${t.metric_label}: ${t.total_improvement_pct ?? 0}%`).join("; ") || "none"}`;

  try {
    const response = await trackedClaudeCall(
      getClient(),
      { model: HAIKU, max_tokens: 80, messages: [{ role: "user", content: prompt }] },
      { userId: athleteId, agentType: "cv_generation", intentId: "trajectory_narrative" }
    );
    const text = response.content[0];
    return text.type === "text" ? text.text.trim() : null;
  } catch (err) {
    console.error("[CV-AI] Trajectory narrative generation failed:", err);
    return null;
  }
}

async function generateDualRoleNarrative(athleteId: string, cv: FullCVBundle): Promise<string | null> {
  const prompt = `Write 2-3 sentences demonstrating this student-athlete's ability to manage
academic and athletic demands simultaneously. Be specific with the data provided.
Never use generic phrases. Reference actual numbers. Output plain text only. No quotes.

Data:
Training sessions completed: ${cv.performance.sessions_total}
Training age: ${cv.performance.training_age_months} months
Current streak: ${cv.performance.streak_days} days
Dual-load index: ${cv.dual_role.dual_load_index ?? "not available"}/100
Exam period training rate: ${cv.dual_role.exam_period_training_rate != null ? `${Math.round(cv.dual_role.exam_period_training_rate * 100)}%` : "not available"}
Platform average exam training rate: 71%
Academic load (7-day): ${cv.dual_role.academic_load_7day ?? "not available"}`;

  try {
    const response = await trackedClaudeCall(
      getClient(),
      { model: SONNET, max_tokens: 120, messages: [{ role: "user", content: prompt }] },
      { userId: athleteId, agentType: "cv_generation", intentId: "dual_role_narrative" }
    );
    const text = response.content[0];
    return text.type === "text" ? text.text.trim() : null;
  } catch (err) {
    console.error("[CV-AI] Dual-role narrative generation failed:", err);
    return null;
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

async function upsertCVProfile(athleteId: string, updates: Record<string, unknown>) {
  await (db() as any)
    .from("cv_profiles")
    .upsert(
      { athlete_id: athleteId, ...updates, updated_at: new Date().toISOString() },
      { onConflict: "athlete_id" }
    );
}

function daysSince(dateStr: string | null | undefined): number {
  if (!dateStr) return Infinity;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}
