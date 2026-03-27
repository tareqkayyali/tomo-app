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
import { supersedeExisting } from './supersedeExisting';
import { REC_EXPIRY_HOURS } from './constants';
import { getRecommendationConfig } from './recommendationConfig';
import type { RecType, RecPriority, RecommendationInsert } from './types';
import { withRetry } from '@/lib/aiRetry';

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
    // 1. Build full PlayerContext (10 parallel data fetches)
    const ctx = await buildPlayerContext(athleteId, 'OwnIt', '', timezone);

    // 2. Format context into a Claude-readable prompt
    const userPrompt = buildDeepRecPrompt(ctx);

    // 3. Call Claude
    const response = await withRetry(
      () => getClient().messages.create({
        model: process.env.ANTHROPIC_REC_MODEL || 'claude-haiku-4-5-20251001',
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

    // 5. Supersede ALL existing DEEP_REFRESH recs before inserting new batch
    const db = supabaseAdmin();
    const validRecTypes: RecType[] = [
      'READINESS', 'LOAD_WARNING', 'RECOVERY', 'DEVELOPMENT',
      'ACADEMIC', 'CV_OPPORTUNITY', 'TRIANGLE_ALERT', 'MOTIVATION',
    ];

    // Supersede all existing deep refresh recs at once (not per-type)
    for (const recType of validRecTypes) {
      await supersedeExisting(athleteId, recType);
    }

    let inserted = 0;

    for (const rec of recs) {
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

    // Ensure at least one P3 (Tomorrow) rec exists — inject deterministic fallback
    const hasP3 = recs.some(r => r.priority >= 3);

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

    const elapsed = Date.now() - startTime;
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
⚠️ NO FRESH CHECK-IN — Last check-in was ${checkinAgeHours != null ? `${Math.round(checkinAgeHours)}h ago` : 'NEVER'}.
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
✅ Fresh check-in (${Math.round(checkinAgeHours!)}h ago)
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
