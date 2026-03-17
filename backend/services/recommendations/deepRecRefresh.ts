/**
 * Deep Rec Refresh — Claude-Powered Holistic Recommendations
 *
 * Uses the full PlayerContext (same 10 parallel fetches as AI Chat) to
 * generate rich, personalized recommendations via Claude. This bridges
 * the gap between the snapshot-only RIE computers and the richer context
 * available in the chat pipeline.
 *
 * Trigger points:
 *   1. After daily check-in (fire-and-forget, non-blocking)
 *   2. On Own It page visit when data is stale (>6h since last refresh)
 *
 * Architecture:
 *   - Keeps existing event-triggered RIE for real-time signals (P1 urgent)
 *   - Adds daily Claude analysis for P2–P4 recs with cross-referenced evidence
 *   - Supersedes only DEEP_REFRESH recs, never event-triggered ones
 */

import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { buildPlayerContext, type PlayerContext } from '@/services/agents/contextBuilder';
import { supersedeExisting } from './supersedeExisting';
import { REC_EXPIRY_HOURS } from './constants';
import type { RecType, RecPriority, RecommendationInsert } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DeepRecOutput {
  rec_type: RecType;
  priority: 1 | 2 | 3 | 4;
  title: string;
  body_short: string;
  body_long: string;
  confidence_score: number;
  evidence_basis: Record<string, unknown>;
  visible_to_coach: boolean;
  visible_to_parent: boolean;
}

// ---------------------------------------------------------------------------
// Claude client (singleton)
// ---------------------------------------------------------------------------

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

// ---------------------------------------------------------------------------
// Staleness Check
// ---------------------------------------------------------------------------

const DEEP_REFRESH_STALE_HOURS = 6;

/**
 * Check whether the athlete's deep recommendations are stale (>6h old).
 * Returns true if a refresh is needed.
 */
export async function isDeepRefreshStale(athleteId: string): Promise<boolean> {
  const db = supabaseAdmin();

  const { data } = await (db as any)
    .from('athlete_recommendations')
    .select('created_at')
    .eq('athlete_id', athleteId)
    .in('status', ['PENDING', 'DELIVERED'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return true; // No recs at all — definitely stale

  const hoursSince = (Date.now() - new Date(data.created_at).getTime()) / (1000 * 60 * 60);
  return hoursSince > DEEP_REFRESH_STALE_HOURS;
}

// ---------------------------------------------------------------------------
// System Prompt
// ---------------------------------------------------------------------------

const DEEP_REC_SYSTEM_PROMPT = `You are the Performance Intelligence Engine for Tomo, an AI coaching platform for young athletes (13–25).

You have access to the athlete's FULL context — far richer than any single metric. Your job is to analyze ALL the data holistically and generate 3–6 targeted recommendations that an elite performance director would give this specific athlete TODAY.

Your analysis framework:
1. READINESS STATE — What is this athlete's current physical/mental state? What drove it?
2. LOAD MANAGEMENT — Is their training load appropriate? Any spike or detraining risks?
3. RECOVERY NEEDS — What recovery interventions would help most right now?
4. DEVELOPMENT — Where are the biggest skill/performance gaps to address this week?
5. ACADEMIC BALANCE — Is dual-load (school + sport) managed well? Any pressure building?
6. CV / TALENT PATHWAY — What should this athlete work on for long-term development and talent visibility?
7. MOTIVATION — What psychological boost or acknowledgment would help this athlete today?

Rules:
- Generate between 3 and 6 recommendations. Quality over quantity.
- Each rec must reference SPECIFIC numbers from the athlete's data. Never be generic.
- Priority 1 = urgent (act now), 2 = important (today), 3 = this week, 4 = informational
- Only generate P1 if there's genuine urgency (RED readiness, dangerous load spike, injury risk)
- For young athletes (U15 and below): warm, encouraging tone. U17+: direct, peer-level.
- evidence_basis must contain the actual data points that drove this recommendation — this is displayed as pills in the UI
- body_short must be ≤140 characters, action-oriented
- body_long must be 2–4 sentences with specific numbers and clear reasoning
- Cross-reference data: e.g., poor sleep + high ACWR + exam in 2 days = compound risk worth calling out
- Never repeat what the existing event-triggered recs already cover (they're listed below)
- Acknowledge growth phases (PHV) explicitly when relevant

Respond with a JSON array of recommendation objects. No markdown, no explanation. Just the array.`;

// ---------------------------------------------------------------------------
// Main Refresh Function
// ---------------------------------------------------------------------------

/**
 * Run a deep recommendation refresh using the full PlayerContext + Claude.
 *
 * This is the core function — it:
 * 1. Builds full PlayerContext (same as AI Chat)
 * 2. Formats it into a comprehensive prompt
 * 3. Calls Claude for holistic analysis
 * 4. Parses structured output into recommendations
 * 5. Supersedes stale recs and inserts new ones
 *
 * Non-fatal: if Claude call fails, existing recs remain untouched.
 */
export async function deepRecRefresh(
  athleteId: string,
  timezone?: string
): Promise<{ count: number; error?: string }> {
  const startTime = Date.now();

  try {
    console.log(`[DeepRecRefresh] Starting for ${athleteId}`);

    // 1. Build full PlayerContext (10 parallel data fetches)
    const ctx = await buildPlayerContext(athleteId, 'OwnIt', '', timezone);

    // 2. Format context into a Claude-readable prompt
    const userPrompt = buildDeepRecPrompt(ctx);

    // 3. Call Claude
    const response = await getClient().messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      temperature: 0.5,
      system: DEEP_REC_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    // 4. Parse response
    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    const cleaned = text.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
    const recs = JSON.parse(cleaned) as DeepRecOutput[];

    if (!Array.isArray(recs) || recs.length === 0) {
      console.warn(`[DeepRecRefresh] Claude returned empty/invalid array for ${athleteId}`);
      return { count: 0, error: 'Empty response from Claude' };
    }

    // 5. Validate and insert recommendations
    const db = supabaseAdmin();
    const validRecTypes: RecType[] = [
      'READINESS', 'LOAD_WARNING', 'RECOVERY', 'DEVELOPMENT',
      'ACADEMIC', 'CV_OPPORTUNITY', 'TRIANGLE_ALERT', 'MOTIVATION',
    ];

    let inserted = 0;

    for (const rec of recs) {
      // Validate rec_type
      if (!validRecTypes.includes(rec.rec_type)) {
        console.warn(`[DeepRecRefresh] Invalid rec_type: ${rec.rec_type}, skipping`);
        continue;
      }

      // Clamp priority
      const priority = Math.max(1, Math.min(4, rec.priority)) as RecPriority;

      // Supersede existing recs of this type
      await supersedeExisting(athleteId, rec.rec_type);

      // Calculate expiry
      const expiryHours = REC_EXPIRY_HOURS[rec.rec_type] ?? 24;
      const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString();

      // Build context snapshot at creation time
      const contextSnapshot: Record<string, unknown> = {
        source: 'DEEP_REFRESH',
        readiness_score: ctx.snapshotEnrichment?.readinessScore ?? null,
        readiness_rag: ctx.snapshotEnrichment?.readinessRag ?? ctx.readinessScore ?? null,
        acwr: ctx.snapshotEnrichment?.acwr ?? null,
        atl_7day: ctx.snapshotEnrichment?.atl7day ?? null,
        ctl_28day: ctx.snapshotEnrichment?.ctl28day ?? null,
        dual_load_index: ctx.snapshotEnrichment?.dualLoadIndex ?? null,
        academic_load_score: ctx.academicLoadScore,
        wellness_7day_avg: ctx.snapshotEnrichment?.wellness7dayAvg ?? null,
        streak_days: ctx.currentStreak,
        cv_completeness: ctx.snapshotEnrichment?.cvCompleteness ?? null,
        phv_stage: ctx.snapshotEnrichment?.phvStage ?? null,
      };

      const insert: RecommendationInsert = {
        athlete_id: athleteId,
        rec_type: rec.rec_type,
        priority,
        title: rec.title.slice(0, 200),
        body_short: rec.body_short.slice(0, 200),
        body_long: rec.body_long || null,
        confidence_score: Math.max(0, Math.min(1, rec.confidence_score ?? 0.80)),
        evidence_basis: rec.evidence_basis || {},
        trigger_event_id: null, // Deep refresh is not event-triggered
        context: contextSnapshot,
        visible_to_athlete: true,
        visible_to_coach: rec.visible_to_coach !== false,
        visible_to_parent: rec.visible_to_parent !== false,
        expires_at: expiresAt,
      };

      const { error } = await (db as any)
        .from('athlete_recommendations')
        .insert(insert);

      if (error) {
        console.error(`[DeepRecRefresh] Insert failed for ${rec.rec_type}:`, error.message);
      } else {
        inserted++;
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(`[DeepRecRefresh] Completed for ${athleteId}: ${inserted}/${recs.length} recs inserted in ${elapsed}ms`);

    return { count: inserted };
  } catch (err) {
    const elapsed = Date.now() - startTime;
    const message = (err as Error).message;
    console.error(`[DeepRecRefresh] Failed for ${athleteId} after ${elapsed}ms:`, message);
    return { count: 0, error: message };
  }
}

// ---------------------------------------------------------------------------
// Non-blocking wrapper for fire-and-forget triggers
// ---------------------------------------------------------------------------

/**
 * Fire-and-forget deep refresh. Logs errors but never throws.
 * Use this from check-in routes and background triggers.
 */
export function triggerDeepRefreshAsync(athleteId: string, timezone?: string): void {
  deepRecRefresh(athleteId, timezone).catch((err) => {
    console.error(`[DeepRecRefresh] Async trigger failed for ${athleteId}:`, (err as Error).message);
  });
}

// ---------------------------------------------------------------------------
// Prompt Builder
// ---------------------------------------------------------------------------

function buildDeepRecPrompt(ctx: PlayerContext): string {
  const se = ctx.snapshotEnrichment;

  const sections: string[] = [];

  // Identity
  sections.push(`--- ATHLETE PROFILE ---
Name: ${ctx.name}
Sport: ${ctx.sport}
Position: ${ctx.position || 'N/A'}
Age band: ${ctx.ageBand || 'Unknown'}
Gender: ${ctx.gender || 'N/A'}
Height: ${ctx.heightCm ? `${ctx.heightCm}cm` : 'N/A'}
Weight: ${ctx.weightKg ? `${ctx.weightKg}kg` : 'N/A'}
PHV stage: ${se?.phvStage || 'Unknown'}
PHV offset: ${se?.phvOffsetYears != null ? `${se.phvOffsetYears.toFixed(1)} years` : 'N/A'}`);

  // Readiness
  sections.push(`--- READINESS STATE ---
Readiness: ${ctx.readinessScore || 'No check-in today'}
Readiness score (0-100): ${se?.readinessScore ?? 'N/A'}
Readiness RAG: ${se?.readinessRag ?? 'N/A'}
Last components: ${ctx.readinessComponents
    ? `Energy ${ctx.readinessComponents.energy}/5, Soreness ${ctx.readinessComponents.soreness}/5, Sleep ${ctx.readinessComponents.sleepHours}h, Mood ${ctx.readinessComponents.mood}/5, Academic stress ${ctx.readinessComponents.academicStress ?? 'N/A'}/5, Pain: ${ctx.readinessComponents.painFlag ? 'YES' : 'No'}`
    : 'No recent check-in'}`);

  // Load
  sections.push(`--- LOAD MANAGEMENT ---
ACWR: ${se?.acwr?.toFixed(2) ?? 'N/A'} (safe zone: 0.8–1.3)
ATL (7-day acute): ${se?.atl7day ?? 'N/A'} AU
CTL (28-day chronic): ${se?.ctl28day ?? 'N/A'} AU
Athletic load (7d): ${se?.athleticLoad7day ?? 'N/A'}
Academic load (7d): ${se?.academicLoad7day ?? 'N/A'}
Dual-load index: ${se?.dualLoadIndex ?? 'N/A'}/100
Projected load (7d): ${se?.projectedLoad7day ?? 'N/A'}
Projected ACWR: ${se?.projectedACWR?.toFixed(2) ?? 'N/A'}
Injury risk flag: ${se?.injuryRiskFlag ?? 'N/A'}`);

  // Health
  sections.push(`--- HEALTH & RECOVERY ---
HRV today: ${se?.hrvTodayMs ?? 'N/A'}ms (baseline: ${se?.hrvBaselineMs ?? 'N/A'}ms)
Sleep quality: ${se?.sleepQuality ?? 'N/A'}/10
Wellness 7-day avg: ${se?.wellness7dayAvg ?? 'N/A'}
Wellness trend: ${se?.wellnessTrend ?? 'N/A'}
Recent vitals: ${ctx.recentVitals.length > 0
    ? ctx.recentVitals.slice(0, 5).map(v => `${v.metric}: ${v.value} (${v.date})`).join(', ')
    : 'None'}`);

  // Performance
  sections.push(`--- PERFORMANCE & MASTERY ---
Sessions total: ${se?.sessionsTotal ?? 'N/A'}
Training age: ${se?.trainingAgeWeeks ?? 'N/A'} weeks
Streak: ${se?.streakDays ?? ctx.currentStreak} days
Mastery scores: ${se?.masteryScores && Object.keys(se.masteryScores).length > 0
    ? Object.entries(se.masteryScores).map(([k, v]) => `${k}: ${v}`).join(', ')
    : 'No mastery data'}
Speed profile: ${se?.speedProfile && Object.keys(se.speedProfile).length > 0
    ? Object.entries(se.speedProfile).map(([k, v]) => `${k}: ${v}`).join(', ')
    : 'No speed data'}
Strength benchmarks: ${se?.strengthBenchmarks && Object.keys(se.strengthBenchmarks).length > 0
    ? Object.entries(se.strengthBenchmarks).map(([k, v]) => `${k}: ${v}`).join(', ')
    : 'No strength data'}
Benchmark profile: ${ctx.benchmarkProfile
    ? `Overall P${ctx.benchmarkProfile.overallPercentile}, Strengths: [${ctx.benchmarkProfile.strengths.join(', ')}], Gaps: [${ctx.benchmarkProfile.gaps.join(', ')}]`
    : 'Not enough test data'}
Recent tests: ${ctx.recentTestScores.length > 0
    ? ctx.recentTestScores.slice(0, 5).map(t => `${t.testType}: ${t.score} (${t.date})`).join(', ')
    : 'None'}`);

  // CV
  sections.push(`--- CV & TALENT PATHWAY ---
CV completeness: ${se?.cvCompleteness != null ? `${se.cvCompleteness}%` : 'N/A'}
Coachability index: ${se?.coachabilityIndex ?? 'N/A'}`);

  // Schedule
  sections.push(`--- TODAY'S CONTEXT ---
Date: ${ctx.todayDate}
Time: ${ctx.currentTime}
Time of day: ${ctx.temporalContext.timeOfDay}
Day type: ${ctx.temporalContext.dayType}
Match day: ${ctx.temporalContext.isMatchDay ? `YES — ${ctx.temporalContext.matchDetails}` : 'No'}
Exam proximity: ${ctx.temporalContext.isExamProximity ? `YES — ${ctx.temporalContext.examDetails}` : 'No'}
Today's events: ${ctx.todayEvents.length > 0
    ? ctx.todayEvents.map(e => `${e.title} (${e.event_type}) ${e.start_at ? new Date(e.start_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''}`).join(', ')
    : 'Nothing scheduled'}
Academic load score: ${ctx.academicLoadScore}/10
Active scenario: ${ctx.activeScenario}`);

  // Upcoming exams
  if (ctx.upcomingExams.length > 0) {
    sections.push(`--- UPCOMING EXAMS (next 14 days) ---
${ctx.upcomingExams.map(e => `${e.title} — ${new Date(e.start_at).toLocaleDateString()}`).join('\n')}`);
  }

  // Existing event-triggered recs (so Claude doesn't duplicate)
  if (ctx.activeRecommendations.length > 0) {
    sections.push(`--- EXISTING EVENT-TRIGGERED RECOMMENDATIONS (DO NOT DUPLICATE) ---
${ctx.activeRecommendations.map(r => `[P${r.priority} ${r.recType}] ${r.title}: ${r.bodyShort}`).join('\n')}`);
  }

  // Task
  sections.push(`--- TASK ---
Analyze this athlete's full context holistically. Generate 3–6 recommendations that:
1. Cross-reference multiple data sources (don't just look at one metric)
2. Are specific to THIS athlete's situation TODAY
3. Include rich evidence_basis with the exact data points that support each rec
4. Don't duplicate the existing event-triggered recommendations listed above
5. Cover different aspects: physical readiness, load management, skill development, academic balance, motivation

For evidence_basis, include relevant fields as a JSON object. Examples:
- { "readiness_rag": "AMBER", "acwr": 1.35, "sleep_hours": 5.5, "contributing_factors": ["High load + poor sleep"] }
- { "cv_completeness": 45, "benchmark_gaps": ["sprint_10m", "agility_5_0_5"], "overall_percentile": 62 }
- { "wellness_trend": "DECLINING", "academic_load_score": 8, "exam_in_days": 3 }

Respond with ONLY a JSON array. Each object must have these exact fields:
rec_type, priority, title, body_short, body_long, confidence_score, evidence_basis, visible_to_coach, visible_to_parent`);

  return sections.join('\n\n');
}
