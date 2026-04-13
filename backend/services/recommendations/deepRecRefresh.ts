/**
 * Deep Rec Refresh — Claude-Powered Holistic Recommendations
 *
 * Uses the full PlayerContext (same 10 parallel fetches as AI Chat) to
 * generate rich, personalized, ACTIONABLE recommendations via Claude.
 *
 * Trigger points:
 *   1. On Own It page visit when data is stale (>12h since last refresh)
 *   2. Manual refresh button (force=true bypasses staleness check)
 *
 * Architecture:
 *   - Keeps existing event-triggered RIE for real-time signals (P1 urgent)
 *   - Adds Claude analysis for diversified recs covering ALL app aspects
 *   - Each rec includes an ACTION deep-link to the relevant app screen
 *   - Supersedes only DEEP_REFRESH recs, never event-triggered ones
 */

import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { buildPlayerContext, type PlayerContext } from '@/services/agents/contextBuilder';
import { smartSupersede } from './supersedeExisting';
import { REC_EXPIRY_HOURS } from './constants';
import { getRecommendationConfig } from './recommendationConfig';
import type { RecType, RecPriority, RecommendationInsert } from './types';
import { withRetry } from '@/lib/aiRetry';
import { loadAthleteMemory } from '@/services/agents/longitudinalMemory';
import { buildSportContextSegment, buildToneProfile } from '@/services/ai/sportContext';

// RAG retriever — graceful degradation if unavailable (migrated to Python LlamaIndex)
type KnowledgeChunk = {
  content: string;
  chunk_id?: string;
  title?: string;
  evidence_grade?: string;
  athlete_summary?: string;
  primary_source?: string;
  metadata?: Record<string, unknown>;
};
let retrieveKnowledgeChunks: ((query: string, sport?: string, limit?: number) => Promise<KnowledgeChunk[]>) | null = null;
try {
  const ragMod = require('./rag/ragRetriever');
  retrieveKnowledgeChunks = ragMod.retrieveKnowledgeChunks;
} catch {
  // RAG module deleted in Phase 9 cleanup — knowledge retrieval now in Python
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RecAction {
  type: string;
  params?: Record<string, unknown>;
  label: string;
}

interface DeepRecOutput {
  rec_type: RecType;
  priority: 1 | 2 | 3 | 4;
  title: string;
  body_short: string;
  body_long: string;
  confidence_score: number;
  evidence_basis: Record<string, unknown>;
  action?: RecAction;
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

// Default — overridden by CMS config at runtime
const DEEP_REFRESH_STALE_HOURS_DEFAULT = 24;

/**
 * Check whether the athlete's deep recommendations are stale (>staleness hours).
 * Returns true if a refresh is needed.
 */
export async function isDeepRefreshStale(athleteId: string): Promise<boolean> {
  const cfg = await getRecommendationConfig();
  const staleHours = cfg.ownItRec.stalenessHours;
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
  return hoursSince > staleHours;
}

// ---------------------------------------------------------------------------
// System Prompt
// ---------------------------------------------------------------------------

const DEEP_REC_SYSTEM_PROMPT = `You are the Performance Intelligence Engine for Tomo, an AI coaching platform for young athletes (13–25).

You have access to the athlete's FULL context — far richer than any single metric. Your job is to analyze ALL the data holistically and generate 4–6 DIVERSE, ACTIONABLE recommendations that an elite performance director would give this specific athlete TODAY.

Your analysis framework — cover as many different aspects as possible:
1. TRAINING PLAN — Should they schedule a training session today/this week? What type and intensity?
2. STUDY PLAN — Any exams approaching? Should they schedule study blocks?
3. TEST / ASSESSMENT — ONLY recommend testing if a metric is TRULY MISSING (no score at all). If a score EXISTS but is low, recommend TRAINING PROGRAMS to improve it instead of retesting. Never suggest "complete X test" when the athlete already has a score for it — instead recommend drills or programs to improve that weak area.
4. VITALS & HEALTH — Are wearable metrics (HRV, sleep, HR) trending well or poorly?
5. METRICS & BENCHMARKS — How do they compare to peers? What's their strongest area? Where to improve?
6. PROGRAM — Do they have an active training program? Do they need a new one?
7. RECOVERY — Is a specific recovery protocol needed today based on load and readiness?
8. READINESS STATE — What is their current physical/mental state? What drove it?
9. LOAD MANAGEMENT — Is training load appropriate? Any spike or detraining risks?
10. ACADEMIC BALANCE — Is dual-load (school + sport) managed well?
11. CV / TALENT PATHWAY — What's missing from their athletic profile? If metrics exist but are weak, recommend PROGRAMS to improve them. Only suggest testing for metrics with NO data at all.
12. MOTIVATION — What psychological boost or acknowledgment would help today?

DIVERSIFICATION RULE: You MUST cover at least 4 DIFFERENT aspects from the list above. Do NOT generate 4 recs all about readiness. Spread across training, study, testing, metrics, recovery, etc.

SPARSE DATA HANDLING:
When many metrics show N/A, this means the athlete hasn't built enough history yet. In this case:
- STILL generate 4–6 useful recommendations using whatever data IS available
- Check-in data (energy, soreness, sleep, mood) is always useful if present
- Profile data (sport, position, age band) is always available — use it for sport-specific guidance
- When data is sparse, recommend ACTIONS to build the profile: "Run a sprint test", "Log your first session", "Check your vitals"
- IMPORTANT: If a metric has a score but is LOW (below 40th percentile), this is a TRAINING gap, NOT a testing gap. Recommend programs/drills to IMPROVE it. Only recommend testing when the metric is completely absent (no score at all).
- NEVER say "insufficient data" or "not enough info" — always provide actionable guidance
- Lower confidence to 0.5–0.7 when working from sparse data

ACTION FIELD (REQUIRED for every rec):
Every recommendation MUST include an "action" object that deep-links to a specific app screen. Use EXACTLY one of these action maps:

| Intent | action.type | action.params | Example action.label |
|--------|------------|---------------|---------------------|
| Run a phone test (sprint, jump, agility, etc.) | "Test" | { "initialTab": "metrics" } | "Run a Test" |
| Schedule a training session | "AddEvent" | { "initialType": "training" } | "Schedule Training" |
| Schedule a study block | "AddEvent" | { "initialType": "study_block" } | "Schedule Study" |
| Schedule recovery | "AddEvent" | { "initialType": "recovery" } | "Plan Recovery" |
| View vitals/health trends | "Test" | { "initialTab": "vitals" } | "Check Vitals" |
| View metrics/benchmarks | "Test" | { "initialTab": "metrics" } | "View Benchmarks" |
| Browse training programs | "Test" | { "initialTab": "programs" } | "Browse Programs" |
| Do a check-in | "Checkin" | (none) | "Check In" |
| Review schedule rules | "MyRules" | (none) | "Review Rules" |

Rules:
- Generate between 5 and 8 recommendations with DEEP context. Quality over quantity.
- Each rec must reference SPECIFIC numbers from the athlete's data. Be concrete, not generic.
- TWO time horizons only — you MUST use BOTH:
  - Priority 2 = TODAY section (default for most recs). What to do TODAY.
  - Priority 1 = TODAY section (urgent only — RED readiness, injury, dangerous load)
  - Priority 3 = TOMORROW section. What to plan for tomorrow and the next 2-3 days.
- MANDATORY DISTRIBUTION — you MUST follow this exactly:
  - AT LEAST 3 recs MUST be Priority 2 (Today). This is NON-NEGOTIABLE.
  - AT LEAST 2 recs MUST be Priority 3 (Tomorrow). This is NON-NEGOTIABLE.
  - Use Priority 1 only for genuine emergencies. Default to Priority 2 for today's actions.
  - Do NOT put all recs in one priority level. Split them.
- TODAY recs (P1-P2) — deep, actionable, specific to RIGHT NOW:
  - Reference specific readiness scores, load numbers, exam dates
  - Include actionable body_long with 3-4 sentences of personalized reasoning
  - Cross-reference multiple data points (e.g. "sleep was 6.2h + ACWR 1.1 + exam in 3 days = prioritize study over training")
- TOMORROW recs (P3) — forward planning for the next 1-3 days:
  - What to schedule or prepare for tomorrow
  - Study planning for upcoming exams
  - Training session recommendations for the next few days
  - Recovery protocols to plan ahead
- CRITICAL: P2 content must say "today"/"now"/"tonight". P3 content must say "tomorrow"/"next few days".
- For young athletes (U15 and below): warm, encouraging tone. U17+: direct, peer-level.
- title must be SHORT — max 35 characters. Be punchy: "Check In Now", "Log Training", "Plan Study Block"
- body_short must be ≤120 characters, action-oriented, specific
- body_long must be 2–4 sentences with specific numbers and clear reasoning
- Cross-reference data: e.g., poor sleep + high ACWR + exam in 2 days = compound risk
- Never repeat what the existing event-triggered recs already cover (they're listed below)
- Acknowledge growth phases (PHV) explicitly when relevant

CALENDAR DATA RULE:
Calendar events can be deleted or changed by the athlete at any time. When referencing today's events:
- Do NOT make the recommendation's core value depend on a specific calendar event existing
- Frame calendar-aware recs as "if you have a session planned" or "your scheduled training" rather than asserting it exists
- Focus on what the athlete SHOULD do today, not what they already have scheduled
- If no events are scheduled today, recommend SCHEDULING rather than referencing non-existent events

EVIDENCE_BASIS REQUIRED KEYS (the UI renders these as pills — use EXACT keys):
- READINESS: { readiness_rag: "GREEN"|"AMBER"|"RED", acwr: number, sleep_quality: number, contributing_factors: string[] }
- LOAD_WARNING: { acwr: number, atl_7day: number, ctl_28day: number, contributing_factors: string[] }
- RECOVERY: { soreness: number, sleep_quality: number, contributing_factors: string[] }
- DEVELOPMENT: { current_zone: string, benchmark_gaps: string[], overall_percentile: number }
- ACADEMIC: { dual_load_index: number, days_until_exam: number, academic_load_7day: number, nearest_exam_subject: string, upcoming_exam_count: number }
- MOTIVATION: { streak_days: number, sessions_total: number }
- CV_OPPORTUNITY: { cv_completeness: number, benchmark_gaps: string[], overall_percentile: number }
- TRIANGLE_ALERT: { severity: "HIGH"|"MEDIUM"|"LOW" }

If a value is unknown, OMIT the key (don't set it to null). Always include contributing_factors (1–3 brief reasons) for READINESS, LOAD_WARNING, RECOVERY, and ACADEMIC recs.

Respond with ONLY a JSON array of recommendation objects. No markdown, no explanation, no wrapping. Just the raw JSON array.`;

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

  // Guard: fail fast if API key is not configured
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[DeepRecRefresh] ANTHROPIC_API_KEY not set — cannot generate recommendations');
    return { count: 0, error: 'ANTHROPIC_API_KEY not configured' };
  }

  try {
    // 1. Build full PlayerContext (12 parallel data fetches)
    const ctx = await buildPlayerContext(athleteId, 'OwnIt', '', timezone);

    // ── Phase 3: Deterministic fast-paths ($0 — skip Claude for predictable recs) ──
    const fastPathRecs = buildFastPathRecs(ctx, athleteId);
    if (fastPathRecs.length > 0) {
      console.log(`[DeepRecRefresh] ${athleteId}: ${fastPathRecs.length} fast-path recs generated ($0)`);
    }

    // ── Phase 1: RAG retrieval — inject sports science knowledge into prompt ──
    let ragSection = '';
    let retrievedChunkIds: string[] = [];
    try {
      const se = ctx.snapshotEnrichment;
      // Determine which rec types are most relevant based on athlete state
      const ragRecTypes: RecType[] = [];
      if (se?.readinessRag === 'RED' || se?.readinessRag === 'AMBER') ragRecTypes.push('READINESS');
      if (se?.acwr != null && se.acwr > 1.2) ragRecTypes.push('LOAD_WARNING');
      if (se?.phvStage === 'CIRCA') ragRecTypes.push('DEVELOPMENT');
      if (ctx.upcomingExams.length > 0) ragRecTypes.push('ACADEMIC');
      if (ragRecTypes.length === 0) ragRecTypes.push('DEVELOPMENT'); // default

      // Retrieve chunks for the most relevant rec type (RAG migrated to Python)
      if (!retrieveKnowledgeChunks) throw new Error('RAG module unavailable (migrated to Python)');
      const chunks = await (retrieveKnowledgeChunks as any)({
        rec_type: ragRecTypes[0],
        phv_stage: (se?.phvStage as string) || 'POST',
        age_group: mapAgeBandToGroup(ctx.ageBand),
        acwr: se?.acwr as number | undefined,
        hrv_delta_pct: se?.hrvTodayMs && se?.hrvBaselineMs
          ? ((se.hrvTodayMs as number) - (se.hrvBaselineMs as number)) / (se.hrvBaselineMs as number) * 100
          : undefined,
        dual_load_index: se?.dualLoadIndex as number | undefined,
        sport: ctx.sport,
        top_k: 3,
      });

      if (chunks.length > 0) {
        retrievedChunkIds = chunks.map((c: KnowledgeChunk) => c.chunk_id);
        ragSection = formatRagSection(chunks);
        console.log(`[DeepRecRefresh] RAG: ${chunks.length} chunks retrieved for ${ragRecTypes[0]} (IDs: ${retrievedChunkIds.join(', ')})`);
      }
    } catch (ragErr) {
      console.warn('[DeepRecRefresh] RAG retrieval failed (graceful fallback):', ragErr);
      // Continue without RAG — baseline behavior preserved
    }

    // ── Phase 2: Athlete longitudinal memory ──
    let memorySection = '';
    try {
      memorySection = await loadAthleteMemory(athleteId);
    } catch (memErr) {
      console.warn('[DeepRecRefresh] Memory load failed (graceful fallback):', memErr);
    }

    // ── Phase 3 (Gap 3): Engagement feedback — inject acted/dismissed rates ──
    let engagementSection = '';
    try {
      engagementSection = await buildEngagementContext(athleteId);
    } catch (engErr) {
      console.warn('[DeepRecRefresh] Engagement context failed (graceful fallback):', engErr);
    }

    // 2. Format context into a Claude-readable prompt (with RAG + memory + engagement)
    // ── Gap 6: Sport/position context + age-band tone (reused from chat orchestrator) ──
    const sportContextSection = `\n\n--- SPORT & POSITION CONTEXT ---\n${buildSportContextSegment(ctx)}`;
    const toneSection = `\n\n--- ${buildToneProfile(ctx.ageBand)}`;

    const userPrompt = buildDeepRecPrompt(ctx) + sportContextSection + toneSection + ragSection + memorySection + engagementSection;

    // 3. Call Claude — route to Sonnet for high-stakes scenarios (Gap 4)
    const needsSonnet = shouldUseSonnet(ctx);
    const model = needsSonnet
      ? (process.env.ANTHROPIC_REC_SONNET_MODEL || 'claude-sonnet-4-20250514')
      : (process.env.ANTHROPIC_REC_MODEL || 'claude-haiku-4-5-20251001');
    if (needsSonnet) {
      console.log(`[DeepRecRefresh] ${athleteId}: routing to Sonnet (high-stakes context detected)`);
    }

    const response = await withRetry(
      () => getClient().messages.create({
        model,
        max_tokens: 4500,
        temperature: 0.5,
        system: DEEP_REC_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      }),
      '[DeepRecRefresh] Claude API'
    );

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

    // Log priority distribution for debugging
    const priorityCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const r of recs) {
      const p = Math.max(1, Math.min(4, r.priority)) as 1 | 2 | 3 | 4;
      priorityCounts[p]++;
    }
    console.log(`[DeepRecRefresh] ${athleteId}: ${recs.length} recs — P1:${priorityCounts[1]} P2:${priorityCounts[2]} P3:${priorityCounts[3]} P4:${priorityCounts[4]}`);

    // ── Post-processing: PHV safety filter (Gap 7) ──
    const phvStage = ctx.snapshotEnrichment?.phvStage as string | undefined;
    const safeRecs = filterPHVRecs(recs, phvStage);
    if (safeRecs.length < recs.length) {
      console.warn(`[DeepRecRefresh] PHV filter removed ${recs.length - safeRecs.length} contraindicated recs for ${athleteId} (stage: ${phvStage})`);
    }

    // ── Post-processing: Deterministic confidence scores (Gap 8) ──
    for (const rec of safeRecs) {
      rec.confidence_score = calculateDeterministicConfidence(rec.rec_type as RecType, ctx);
    }

    // 5. Smart supersede — only replace resolved/expired/regenerated recs (Gap 1)
    const db = supabaseAdmin();
    const validRecTypes: RecType[] = [
      'READINESS', 'LOAD_WARNING', 'RECOVERY', 'DEVELOPMENT',
      'ACADEMIC', 'CV_OPPORTUNITY', 'TRIANGLE_ALERT', 'MOTIVATION',
    ];

    const newRecTypes = safeRecs.map(r => r.rec_type).filter(t => validRecTypes.includes(t as RecType)) as RecType[];
    const { parentIds } = await smartSupersede(athleteId, newRecTypes, ctx);

    let inserted = 0;

    for (const rec of safeRecs) {
      // Validate rec_type
      if (!validRecTypes.includes(rec.rec_type)) {
        console.warn(`[DeepRecRefresh] Invalid rec_type: ${rec.rec_type}, skipping`);
        continue;
      }

      // Clamp priority
      const priority = Math.max(1, Math.min(4, rec.priority)) as RecPriority;

      // Calculate expiry
      const expiryHours = REC_EXPIRY_HOURS[rec.rec_type] ?? 24;
      const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString();

      // Build context snapshot at creation time — include action for frontend deep-links
      const contextSnapshot: Record<string, unknown> = {
        source: 'DEEP_REFRESH',
        generated_at: new Date().toISOString(),
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
        // Calendar snapshot for staleness validation
        calendar_event_titles: ctx.todayEvents.map(e => e.title),
        calendar_date: ctx.todayDate,
      };

      // Store action in context for frontend deep-linking
      if (rec.action) {
        contextSnapshot.action = rec.action;
      }

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
        parent_rec_id: parentIds[rec.rec_type] ?? null, // Link to superseded rec for continuity
        context: contextSnapshot,
        visible_to_athlete: true,
        visible_to_coach: rec.visible_to_coach !== false,
        visible_to_parent: rec.visible_to_parent !== false,
        expires_at: expiresAt,
        retrieved_chunk_ids: retrievedChunkIds.length > 0 ? retrievedChunkIds : undefined,
      };

      const { data: insertedRec, error } = await (db as any)
        .from('athlete_recommendations')
        .insert(insert)
        .select('id')
        .single();

      if (error) {
        console.error(`[DeepRecRefresh] Insert failed for ${rec.rec_type}:`, error.message);
      } else {
        inserted++;

        // Fire notification for P1/P2 recs (fire-and-forget)
        if (priority <= 2 && insertedRec?.id) {
          import('../notifications/notificationEngine').then(({ createNotification }) => {
            createNotification({
              athleteId,
              type: 'NEW_RECOMMENDATION',
              vars: {
                rec_title: rec.title.slice(0, 100),
                rec_body_short: rec.body_short.slice(0, 150),
                priority,
                rec_type: rec.rec_type,
                rec_id: insertedRec.id,
                expires_at: expiresAt,
              },
              sourceRef: { type: 'recommendation', id: insertedRec.id },
              expiresAt,
            });
          }).catch(() => {});
        }
      }
    }

    // Ensure at least one P3 (Tomorrow) rec exists — inject deterministic fallback
    const hasP3 = safeRecs.some(r => r.priority >= 3);

    if (!hasP3) {
      const fallbacks: RecommendationInsert[] = [];
      const fallbackContext: Record<string, unknown> = {
        source: 'DEEP_REFRESH',
        generated_at: new Date().toISOString(),
        calendar_date: ctx.todayDate,
        calendar_event_titles: ctx.todayEvents.map(e => e.title),
      };

      if (!hasP3) {
        const examsText = ctx.upcomingExams.length > 0
          ? `You have ${ctx.upcomingExams.length} exam${ctx.upcomingExams.length > 1 ? 's' : ''} coming up. Plan study blocks around your training schedule.`
          : 'Plan your training and study schedule for the next few days.';
        fallbacks.push({
          athlete_id: athleteId,
          rec_type: 'DEVELOPMENT',
          priority: 3,
          title: 'Plan Tomorrow\'s Schedule',
          body_short: 'Review your calendar and set up tomorrow\'s training and study blocks.',
          body_long: examsText,
          confidence_score: 0.7,
          evidence_basis: {},
          trigger_event_id: null,
          context: { ...fallbackContext, action: { type: 'AddEvent', params: { initialType: 'training' }, label: 'Plan Schedule' } },
          visible_to_athlete: true,
          visible_to_coach: true,
          visible_to_parent: true,
          expires_at: new Date(Date.now() + 24 * 3600000).toISOString(),
        });
      }

      for (const fb of fallbacks) {
        const { error } = await (db as any).from('athlete_recommendations').insert(fb);
        if (!error) inserted++;
      }
    }

    // Insert fast-path recs (generated without Claude)
    for (const fpRec of fastPathRecs) {
      // Only insert if Claude didn't already generate a rec of the same type
      const alreadyHasType = safeRecs.some(r => r.rec_type === fpRec.rec_type);
      if (!alreadyHasType) {
        const { error } = await (db as any).from('athlete_recommendations').insert(fpRec);
        if (!error) inserted++;
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(`[DeepRecRefresh] ${athleteId}: completed in ${elapsed}ms — ${inserted} recs total (${fastPathRecs.length} fast-path, ${retrievedChunkIds.length} RAG chunks, ${memorySection ? 'memory loaded' : 'no memory'})`);
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

  // Readiness — with freshness check
  const lastCheckinAt = se?.lastCheckinAt as string | null | undefined;
  const checkinAgeHours = lastCheckinAt
    ? (Date.now() - new Date(lastCheckinAt).getTime()) / 3600000
    : null;
  const hasStaleCheckin = checkinAgeHours == null || checkinAgeHours > 24;
  const hasTodayCheckin = checkinAgeHours != null && checkinAgeHours < 24;

  if (hasStaleCheckin) {
    sections.push(`--- READINESS STATE ---
NO FRESH CHECK-IN — Last check-in was ${checkinAgeHours != null ? `${Math.round(checkinAgeHours)}h ago` : 'NEVER'}.
The readiness values below are STALE and should NOT be used for training intensity or readiness recommendations.
DO NOT recommend specific training intensities or readiness-based actions from this data.
Instead: Your FIRST recommendation MUST be a READINESS rec telling the athlete to do their daily check-in (action: "Checkin", label: "Check In").
After the check-in rec, generate remaining recs from non-readiness data (schedule, tests, study, CV, etc.).
Stale readiness score: ${se?.readinessScore ?? 'N/A'} (DO NOT trust)
Stale readiness RAG: ${se?.readinessRag ?? 'N/A'} (DO NOT trust)
Stale components: ${ctx.readinessComponents
    ? `Energy ${ctx.readinessComponents.energy}/10, Soreness ${ctx.readinessComponents.soreness}/10, Sleep ${ctx.readinessComponents.sleepHours}h, Mood ${ctx.readinessComponents.mood}/10`
    : 'No components'}`);
  } else {
    sections.push(`--- READINESS STATE ---
Fresh check-in (${Math.round(checkinAgeHours!)}h ago)
Readiness: ${ctx.readinessScore || 'No check-in today'}
Readiness score (0-100): ${se?.readinessScore ?? 'N/A'}
Readiness RAG: ${se?.readinessRag ?? 'N/A'}
Last components: ${ctx.readinessComponents
    ? `Energy ${ctx.readinessComponents.energy}/10, Soreness ${ctx.readinessComponents.soreness}/10, Sleep ${ctx.readinessComponents.sleepHours}h, Mood ${ctx.readinessComponents.mood}/10, Academic stress ${ctx.readinessComponents.academicStress ?? 'N/A'}/10, Pain: ${ctx.readinessComponents.painFlag ? 'YES' : 'No'}`
    : 'No recent check-in'}`);
  }

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
    ? ctx.todayEvents.map(e => `${e.title} (${e.event_type}) ${e.start_at ? new Date(e.start_at).toLocaleTimeString('en-GB', { timeZone: ctx.timezone, hour: '2-digit', minute: '2-digit', hour12: false }) : ''}`).join(', ')
    : 'Nothing scheduled'}
Academic load score: ${ctx.academicLoadScore}/10
Active scenario: ${ctx.activeScenario}`);

  // Upcoming exams
  if (ctx.upcomingExams.length > 0) {
    sections.push(`--- UPCOMING EXAMS (next 14 days) ---
${ctx.upcomingExams.map(e => `${e.title} — ${new Date(e.start_at).toLocaleDateString('en-US', { timeZone: ctx.timezone, month: 'short', day: 'numeric' })}`).join('\n')}`);
  }

  // Upcoming events (next 7 days — includes study blocks, training, matches, etc.)
  if (ctx.upcomingEvents && ctx.upcomingEvents.length > 0) {
    const studyBlocks = ctx.upcomingEvents.filter((e: any) => e.event_type === 'study' || e.event_type === 'study_block');
    const otherEvents = ctx.upcomingEvents.filter((e: any) => e.event_type !== 'study' && e.event_type !== 'study_block');

    const lines: string[] = [];
    if (studyBlocks.length > 0) {
      lines.push(`Study blocks scheduled: ${studyBlocks.map((e: any) => `${e.title} — ${new Date(e.start_at).toLocaleDateString('en-US', { timeZone: ctx.timezone, weekday: 'short', month: 'short', day: 'numeric' })}`).join(', ')}`);
    } else {
      lines.push('Study blocks scheduled: NONE in the next 7 days');
    }
    if (otherEvents.length > 0) {
      lines.push(`Other events: ${otherEvents.map((e: any) => `${e.title} (${e.event_type}) — ${new Date(e.start_at).toLocaleDateString('en-US', { timeZone: ctx.timezone, weekday: 'short', month: 'short', day: 'numeric' })}`).join(', ')}`);
    }
    sections.push(`--- UPCOMING SCHEDULE (next 7 days) ---\n${lines.join('\n')}`);
  }

  // Data completeness assessment
  const available: string[] = [];
  const missing: string[] = [];

  if (hasTodayCheckin && ctx.readinessComponents) available.push('check-in (energy, soreness, sleep, mood) — fresh');
  else if (hasStaleCheckin && ctx.readinessComponents) missing.push('FRESH check-in data — last check-in is STALE (>24h). First rec must tell athlete to check in.');
  else missing.push('check-in data — never checked in');

  if (se?.acwr != null) available.push('load metrics (ACWR, ATL, CTL)');
  else missing.push('load metrics (ACWR, ATL, CTL)');

  if (se?.hrvTodayMs != null) available.push('HRV data');
  else missing.push('HRV data');

  if (ctx.benchmarkProfile) available.push(`benchmark profile (P${ctx.benchmarkProfile.overallPercentile})`);
  else missing.push('benchmark profile — recommend running tests');

  if (ctx.recentTestScores.length > 0) available.push(`${ctx.recentTestScores.length} recent test scores`);
  else missing.push('test scores — recommend running first test');

  if (ctx.upcomingExams.length > 0) available.push(`${ctx.upcomingExams.length} upcoming exams`);
  if (ctx.todayEvents.length > 0) available.push(`${ctx.todayEvents.length} events today`);

  if (se?.cvCompleteness != null) available.push(`CV ${se.cvCompleteness}% complete`);
  else missing.push('CV data');

  if (ctx.recentVitals.length > 0) available.push(`${ctx.recentVitals.length} recent vitals`);
  else missing.push('wearable vitals — recommend checking vitals tab');

  sections.push(`--- DATA COMPLETENESS ---
Available: ${available.join(', ') || 'Minimal data — profile only'}
Missing: ${missing.join(', ') || 'None — full data available'}
NOTE: Generate recommendations using available data. For missing data, recommend the ACTION that would fill the gap (e.g., "Run a sprint test" if no test scores exist).`);

  // Existing event-triggered recs (so Claude doesn't duplicate)
  if (ctx.activeRecommendations.length > 0) {
    sections.push(`--- EXISTING EVENT-TRIGGERED RECOMMENDATIONS (DO NOT DUPLICATE) ---
${ctx.activeRecommendations.map(r => `[P${r.priority} ${r.recType}] ${r.title}: ${r.bodyShort}`).join('\n')}`);
  }

  // Task
  sections.push(`--- TASK ---
Analyze this athlete's full context holistically. Generate 4–6 DIVERSE recommendations that:
1. Cover at least 4 DIFFERENT aspects (training, study, testing, metrics, recovery, vitals, motivation, etc.)
2. Are specific to THIS athlete's situation TODAY — reference actual numbers
3. Include rich evidence_basis with the EXACT KEYS listed in the system prompt for each rec_type
4. Include an ACTION object for every rec (see action map in system prompt)
5. Don't duplicate the existing event-triggered recommendations listed above
6. For missing data: recommend the action that fills the gap

Respond with ONLY a JSON array. Each object must have these exact fields:
rec_type, priority, title, body_short, body_long, confidence_score, evidence_basis, action, visible_to_coach, visible_to_parent

Where action = { type: string, params?: object, label: string } using EXACTLY the route names from the action map.`);

  return sections.join('\n\n');
}

// ---------------------------------------------------------------------------
// RAG helpers
// ---------------------------------------------------------------------------

function mapAgeBandToGroup(ageBand: string | null): string {
  if (!ageBand) return 'ADULT';
  if (ageBand === 'U13' || ageBand === 'U15') return 'U15';
  if (ageBand === 'U17') return 'U17';
  if (ageBand === 'U19') return 'U19';
  return 'ADULT';
}

// ---------------------------------------------------------------------------
// Gap 3: Engagement feedback — 30-day acted/dismissed rates per rec type
// ---------------------------------------------------------------------------

async function buildEngagementContext(athleteId: string): Promise<string> {
  const db = supabaseAdmin();

  const { data: engagement } = await (db as any)
    .from('athlete_recommendations')
    .select('rec_type, status')
    .eq('athlete_id', athleteId)
    .in('status', ['ACTED', 'DISMISSED', 'EXPIRED', 'SUPERSEDED'])
    .gte('created_at', new Date(Date.now() - 30 * 24 * 3600000).toISOString())
    .order('created_at', { ascending: false })
    .limit(100);

  if (!engagement || engagement.length === 0) return '';

  const byType: Record<string, { acted: number; dismissed: number; total: number }> = {};

  for (const row of engagement) {
    if (!byType[row.rec_type]) byType[row.rec_type] = { acted: 0, dismissed: 0, total: 0 };
    byType[row.rec_type].total++;
    if (row.status === 'ACTED') byType[row.rec_type].acted++;
    if (row.status === 'DISMISSED') byType[row.rec_type].dismissed++;
  }

  const lines = Object.entries(byType).map(([type, stats]) => {
    const actedPct = stats.total > 0 ? Math.round((stats.acted / stats.total) * 100) : 0;
    return `${type}: ${actedPct}% acted (${stats.acted}/${stats.total} last 30d)`;
  });

  if (lines.length === 0) return '';

  return `\n\n--- ENGAGEMENT HISTORY (last 30 days) ---
${lines.join('\n')}
NOTE: Deprioritise rec types with <20% acted rate. Increase priority for types with >60% acted rate. The athlete responds to what they find useful.`;
}

function formatRagSection(chunks: KnowledgeChunk[]): string {
  if (chunks.length === 0) return '';

  const formatted = chunks.map((c, i) => {
    return `[${i + 1}] ${c.title} (${c.evidence_grade})
${c.athlete_summary}
Source: ${c.primary_source}`;
  }).join('\n\n');

  return `\n\n--- SPORTS SCIENCE KNOWLEDGE (use to ground your recommendations) ---
The following evidence-based knowledge is relevant to this athlete's current state.
Reference specific findings when writing body_long. Do NOT copy verbatim — paraphrase and adapt to the athlete's context.

${formatted}`;
}

// ---------------------------------------------------------------------------
// Deterministic fast-path recs (Phase 3 — $0, no Claude)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Gap 7: PHV output validation — regex gate for contraindicated movements
// ---------------------------------------------------------------------------

const PHV_CONTRAINDICATED_PATTERNS = [
  /depth.?jump|drop.?jump/i,
  /barbell.?(back.?)?squat/i,
  /power.?clean|hang.?clean|snatch/i,
  /bounding|plyometric.*high.?impact/i,
  /maximal.?sprint|100%.?effort|all.?out/i,
  /1\s?rm|one.?rep.?max/i,
  /heavy.?deadlift/i,
  /max.?load|maximal.?load/i,
];

// ---------------------------------------------------------------------------
// Gap 4: Haiku/Sonnet model routing — use Sonnet for high-stakes scenarios
// ---------------------------------------------------------------------------

function shouldUseSonnet(ctx: PlayerContext): boolean {
  const se = ctx.snapshotEnrichment;

  // 1. ACWR in danger zone (>1.3) — load management advice is safety-critical
  if ((se?.acwr as number) > 1.3) return true;

  // 2. Readiness is RED — recovery guidance must be nuanced
  if (se?.readinessRag === 'RED' || ctx.readinessScore === 'Red') return true;

  // 3. Mid-PHV — training recommendations need extra care
  if (se?.phvStage === 'CIRCA' || se?.phvStage === 'mid_phv') return true;

  // 4. Injury risk flagged
  if (se?.injuryRiskFlag === 'RED' || se?.injuryRiskFlag === 'AMBER') return true;

  // 5. Dual load collision (>70) — academic + athletic stress
  if ((se?.dualLoadIndex as number) > 70) return true;

  // 6. Wellness declining
  if (se?.wellnessTrend === 'DECLINING') return true;

  // Default: Haiku is sufficient
  return false;
}

function filterPHVRecs(recs: DeepRecOutput[], phvStage?: string): DeepRecOutput[] {
  if (phvStage !== 'CIRCA' && phvStage !== 'mid_phv') return recs;

  return recs.filter(rec => {
    const text = `${rec.title} ${rec.body_short} ${rec.body_long ?? ''}`;
    const violation = PHV_CONTRAINDICATED_PATTERNS.find(p => p.test(text));
    if (violation) {
      console.warn(`[DeepRecRefresh] PHV VIOLATION filtered — rec "${rec.title}" matched pattern: ${violation.source}`);
      return false; // drop the rec entirely
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// Gap 8: Deterministic confidence scores — replace AI self-estimation
// ---------------------------------------------------------------------------

function calculateDeterministicConfidence(recType: RecType, ctx: PlayerContext): number {
  const se = ctx.snapshotEnrichment;

  switch (recType) {
    case 'LOAD_WARNING': {
      const acwr = (se?.acwr as number) ?? 0;
      if (acwr >= 1.5) return 1.0;
      if (acwr >= 1.4) return 0.85;
      if (acwr >= 1.3) return 0.65;
      return 0.40;
    }
    case 'RECOVERY': {
      const wellness = (se?.wellness7dayAvg as number) ?? 5;
      return wellness < 4 ? 0.95 : wellness < 6 ? 0.70 : 0.45;
    }
    case 'ACADEMIC': {
      const dl = (se?.dualLoadIndex as number) ?? 0;
      return dl > 75 ? 0.90 : dl > 65 ? 0.70 : 0.40;
    }
    case 'READINESS': {
      const score = (se?.readinessScore as number) ?? 50;
      return score < 40 ? 0.90 : score < 60 ? 0.70 : 0.40;
    }
    case 'MOTIVATION': {
      return 0.50; // Moderate confidence — engagement data needed for better scoring
    }
    case 'DEVELOPMENT': {
      // Higher confidence if benchmark data exists
      return ctx.benchmarkProfile ? 0.75 : 0.50;
    }
    case 'CV_OPPORTUNITY': {
      const cv = (se?.cvCompleteness as number) ?? 50;
      return cv < 30 ? 0.85 : cv < 60 ? 0.65 : 0.45;
    }
    case 'TRIANGLE_ALERT': {
      return 0.80; // Triangle alerts are always actionable
    }
    default:
      return 0.60;
  }
}

// ---------------------------------------------------------------------------
// Deterministic fast-path recs (Phase 3 — $0, no Claude)
// ---------------------------------------------------------------------------

function buildFastPathRecs(ctx: PlayerContext, athleteId: string): RecommendationInsert[] {
  const recs: RecommendationInsert[] = [];
  const se = ctx.snapshotEnrichment;
  const now = new Date().toISOString();
  const baseContext: Record<string, unknown> = {
    source: 'FAST_PATH',
    generated_at: now,
    calendar_date: ctx.todayDate,
  };

  // Check if checkin is stale (>24h)
  const lastCheckinAt = se?.lastCheckinAt as string | null | undefined;
  const checkinAgeHours = lastCheckinAt
    ? (Date.now() - new Date(lastCheckinAt).getTime()) / 3600000
    : null;
  const isStaleCheckin = checkinAgeHours == null || checkinAgeHours > 24;

  // Fast-path 1: No fresh checkin → deterministic "Check In" rec
  if (isStaleCheckin) {
    recs.push({
      athlete_id: athleteId,
      rec_type: 'READINESS',
      priority: 1,
      title: 'Check In to Unlock Your Day',
      body_short: 'Your daily check-in powers your readiness score, training recs, and load management.',
      body_long: `Your last check-in was ${checkinAgeHours != null ? `${Math.round(checkinAgeHours)} hours ago` : 'never completed'}. Without fresh data, Tomo can't assess your readiness or recommend the right training intensity. A quick 30-second check-in unlocks personalized guidance for today.`,
      confidence_score: 0.95,
      evidence_basis: { readiness_rag: null, contributing_factors: ['stale_checkin'] },
      trigger_event_id: null,
      context: { ...baseContext, action: { type: 'Checkin', label: 'Check In' } },
      visible_to_athlete: true,
      visible_to_coach: true,
      visible_to_parent: false,
      expires_at: new Date(Date.now() + 12 * 3600000).toISOString(),
    });
  }

  // Fast-path 2: Readiness RED → deterministic rest rec
  if (!isStaleCheckin && (se?.readinessRag === 'RED' || ctx.readinessScore === 'Red')) {
    recs.push({
      athlete_id: athleteId,
      rec_type: 'RECOVERY',
      priority: 1,
      title: 'Recovery Day — Protect Your Body',
      body_short: 'Your readiness is RED. Prioritize rest, hydration, and light movement today.',
      body_long: 'Your body is signaling it needs recovery. Skip high-intensity work today and focus on sleep quality, hydration (2-3L water), and gentle mobility. Research shows that training through red readiness increases injury risk by 3-5x and delays adaptation.',
      confidence_score: 0.95,
      evidence_basis: { readiness_rag: 'RED', soreness: ctx.readinessComponents?.soreness, sleep_quality: se?.sleepQuality, contributing_factors: ['red_readiness'] },
      trigger_event_id: null,
      context: { ...baseContext, readiness_rag: 'RED', action: { type: 'AddEvent', params: { initialType: 'recovery' }, label: 'Schedule Recovery' } },
      visible_to_athlete: true,
      visible_to_coach: true,
      visible_to_parent: true,
      expires_at: new Date(Date.now() + 12 * 3600000).toISOString(),
    });
  }

  // Fast-path 3: ACWR critically high
  if (se?.acwr != null && (se.acwr as number) > 1.5) {
    recs.push({
      athlete_id: athleteId,
      rec_type: 'LOAD_WARNING',
      priority: 1,
      title: 'Critical Load — Reduce Intensity',
      body_short: `Your ACWR is ${(se.acwr as number).toFixed(1)} — well above the 1.3 safe threshold. Injury risk is significantly elevated.`,
      body_long: `Your acute training load has spiked relative to your chronic load (ACWR ${(se.acwr as number).toFixed(2)}). Sports science research consistently shows injury risk increases 2-4x when ACWR exceeds 1.5. Scale back to 60-70% intensity for the next 2-3 sessions to let your chronic load catch up.`,
      confidence_score: 0.95,
      evidence_basis: { acwr: se.acwr, atl_7day: se.atl7day, ctl_28day: se.ctl28day, contributing_factors: ['acwr_spike'] },
      trigger_event_id: null,
      context: { ...baseContext, acwr: se.acwr, action: { type: 'MyRules', label: 'Adjust Schedule' } },
      visible_to_athlete: true,
      visible_to_coach: true,
      visible_to_parent: true,
      expires_at: new Date(Date.now() + 24 * 3600000).toISOString(),
    });
  }

  return recs;
}
