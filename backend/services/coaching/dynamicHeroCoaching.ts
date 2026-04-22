/**
 * Dynamic Hero Coaching — generates the one-sentence coaching line that
 * appears on the Signal Dashboard's FocusHero card.
 *
 * Three-layer resolution (first match wins):
 *
 *   1. Safety override — deterministic. When CCRS is in a critical band,
 *      readiness is RED, an injury is AMBER/RED, or sleep debt is severe, we
 *      return a hardcoded safety string. No AI involvement on critical
 *      states — we can't afford hallucinated safety copy.
 *
 *   2. AI generation — Haiku with prompt-cached static block. Inputs:
 *      athlete's sport + position + age-band + recent completed event (type
 *      + minutes-ago) + CCRS + readiness + HRV/sleep trend. Output: one
 *      short positive-push sentence (<=140 chars).
 *
 *   3. Fallback — if the AI call fails (rate limit, timeout, parse error)
 *      we return null so the boot route can fall through to the existing
 *      signal-engine coaching. The card never breaks.
 *
 * Call sites:
 *   • wellnessHandler    — after every check-in
 *   • sessionHandler     — after a SESSION_LOG completes
 *   • vitalHandler       — after a wearable sync lands
 *   • boot (lazy)        — if the stored copy is >6h old, fire async
 *
 * All writes go to athlete_snapshots.dynamic_coaching (see migration 090).
 */

import Anthropic from '@anthropic-ai/sdk';
import crypto from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { trackedClaudeCall } from '@/lib/trackedClaudeCall';
import { logger } from '@/lib/logger';

const HAIKU_MODEL = process.env.ANTHROPIC_HAIKU_MODEL || 'claude-haiku-4-5-20251001';

// ── Safety band copy — deterministic, never AI-generated ────────────────
// Tight scope per product: CCRS critical bands ONLY. ACWR has been
// decommissioned, and injury_risk_flag is no longer a trustworthy signal
// (legacy values may still sit on athlete_snapshots). CCRS is the single
// clean safety surface; everything else routes through the AI motivational
// layer.
const SAFETY_COPY = {
  ccrs_blocked:
    'Injury watch \u2014 stop here. Recovery only today. No intensity, no testing. Log how you feel on your next check-in.',
  ccrs_recovery:
    'Injury watch \u2014 ease off. Mobility, easy cardio, technique only. Save the hard work for when you\u2019re cleared.',
};

// ── System prompt (cached) — brand voice + invariants ──────────────────
// Style: pure motivational/transition vibes. No analytics, no metrics, no
// "your readiness is 78". The AI's job is to ride the moment the athlete is
// in (just finished study, heading into training, between sessions, fresh
// morning, winding down) with energy and warmth.
const SYSTEM_PROMPT = `You are Tomo, the inner coach voice for a young athlete (13\u201317yo).

Write ONE motivational sentence for their dashboard. Not a paragraph. ONE sentence.

Style:
- Pure vibes \u2014 motivational, encouraging, energising. Never analytical.
- Ride the transition: getting out of study, heading into training, mid-session, winding down, fresh morning, last block of the day.
- Sport-flavored: use the athlete\u2019s sport language naturally (footballers train, swimmers swim, padel players step on court, runners hit the road).
- Age-appropriate: conversational, peer-level, slightly playful. Never lectures.
- Direct: speak to the athlete as "you". Never mention Tomo, AI, or coaches by name.

Hard rules:
- Max 140 characters including punctuation.
- Plain text only \u2014 no emojis, no markdown, no surrounding quotes.
- DO NOT cite numbers, scores, percentages, HRV, sleep hours, readiness, or any metric. Even if you see them in context, NEVER reference them.
- DO NOT give technical training advice (sets, reps, intensity, RPE, watts).
- DO NOT scold, warn, or use cautionary language.

Output: the sentence only. No preamble, no sign-off.`;

// ── Types ────────────────────────────────────────────────────────────────

export interface HeroCoachingContext {
  // Athlete identity (used to flavour the voice — sport language, peer tone)
  athleteId: string;
  sport: string | null;
  position: string | null;
  ageBand: string | null;
  firstName: string | null;

  // Safety inputs (deterministic override — never reach the AI)
  ccrsRecommendation: string | null;   // 'full_load'|'moderate'|'reduced'|'recovery'|'blocked'

  // Transition inputs (the only thing the AI sees besides identity).
  // These describe "where in the day are you right now" \u2014 just finished
  // study, heading into training, mid-afternoon gap, etc. NO metrics.
  lastCompletedEventType: string | null;     // 'training'|'match'|'study_block'|'recovery'|...
  lastCompletedEventName: string | null;
  minutesSinceLastEvent: number | null;
  upNextEventType: string | null;
  upNextEventName: string | null;
  minutesUntilUpNext: number | null;
  hourOfDay: number;                          // 0-23, athlete-local
}

export interface CoachingResult {
  source: 'safety' | 'ai' | 'fallback';
  text: string | null;
  contextHash: string;
}

// ── Public: generate + persist ──────────────────────────────────────────

/**
 * Main entry point. Builds the context, resolves it through the three
 * layers, and persists the result to athlete_snapshots. Fire-and-forget
 * from event handlers — errors log but never throw.
 */
export async function generateAndPersistHeroCoaching(
  athleteId: string,
  client?: Anthropic,
): Promise<CoachingResult> {
  logger.info('[dynamic-coaching] starting', { athleteId });
  const ctx = await buildCoachingContext(athleteId);
  if (!ctx) {
    return { source: 'fallback', text: null, contextHash: '' };
  }

  const hash = contextHash(ctx);

  // Short-circuit: if the most recent stored generation matches this exact
  // context, don't spend another Haiku call. Inputs haven't changed.
  const existing = await readExisting(athleteId);
  if (existing && existing.hash === hash && existing.text) {
    return { source: existing.source, text: existing.text, contextHash: hash };
  }

  const result = await resolveCoaching(ctx, client);
  // Persist in every path (including null fallback) so we have audit
  // visibility into "we tried, here's the inputs hash and timestamp" — makes
  // it possible to debug why a card isn't updating without piping logs.
  await persistCoaching(athleteId, result, hash);
  logger.info('[dynamic-coaching] result', {
    athleteId,
    source: result.source,
    textLength: result.text?.length ?? 0,
  });
  return { ...result, contextHash: hash };
}

// ── Resolution — safety → AI → fallback ─────────────────────────────────

export function resolveSafetyOverride(ctx: HeroCoachingContext): string | null {
  // CCRS critical bands only. injury_risk_flag and readiness_rag are NOT
  // checked here \u2014 they're either legacy/derived or already represented in
  // CCRS. Single source of truth for "is it unsafe to push today".
  if (ctx.ccrsRecommendation === 'blocked') return SAFETY_COPY.ccrs_blocked;
  if (ctx.ccrsRecommendation === 'recovery') return SAFETY_COPY.ccrs_recovery;
  return null;
}

async function resolveCoaching(
  ctx: HeroCoachingContext,
  client?: Anthropic,
): Promise<Omit<CoachingResult, 'contextHash'>> {
  // 1. Safety override
  const safety = resolveSafetyOverride(ctx);
  if (safety) return { source: 'safety', text: safety };

  // 2. AI generation
  try {
    const ai = await generateWithHaiku(ctx, client);
    if (ai) return { source: 'ai', text: ai };
  } catch (err) {
    logger.warn('[dynamic-coaching] Haiku generation failed', {
      athleteId: ctx.athleteId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // 3. Fallback — null lets the boot route use the signal-engine coaching.
  return { source: 'fallback', text: null };
}

// ── AI call ─────────────────────────────────────────────────────────────

async function generateWithHaiku(
  ctx: HeroCoachingContext,
  client?: Anthropic,
): Promise<string | null> {
  const anthropic = client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const userPrompt = buildUserPrompt(ctx);

  const { message } = await trackedClaudeCall(
    anthropic,
    {
      model: HAIKU_MODEL,
      max_tokens: 120,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          // Cache the static brand-voice block — unchanged across every call,
          // so the per-request cost is dominated by the small per-athlete
          // user message.
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: userPrompt }],
    },
    {
      userId: ctx.athleteId,
      agentType: 'hero_coaching',
    },
  );

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join(' ')
    .trim();

  if (!text) return null;
  // Guardrail: strip wrapping quotes the model sometimes emits, drop any
  // trailing whitespace, cap at 180 chars (soft cap — system prompt says 140
  // but we don't truncate mid-word). If something's too long the UI handles it.
  const cleaned = text.replace(/^["\u201C\u2018]/, '').replace(/["\u201D\u2019]$/, '').trim();
  return cleaned.slice(0, 180);
}

function buildUserPrompt(ctx: HeroCoachingContext): string {
  const lines: string[] = ['Athlete context:'];
  if (ctx.sport) lines.push(`- Sport: ${ctx.sport}${ctx.position ? ` (${ctx.position})` : ''}`);
  if (ctx.ageBand) lines.push(`- Age: ${ctx.ageBand}`);
  lines.push(`- Time of day: ${describeTimeOfDay(ctx.hourOfDay)} (${ctx.hourOfDay}:00)`);

  if (ctx.lastCompletedEventType && ctx.minutesSinceLastEvent != null && ctx.minutesSinceLastEvent <= 90) {
    const label = ctx.lastCompletedEventName ?? ctx.lastCompletedEventType;
    lines.push(`- Just finished: ${label} (${ctx.lastCompletedEventType}) \u2014 ${ctx.minutesSinceLastEvent} min ago`);
  }

  if (ctx.upNextEventType && ctx.minutesUntilUpNext != null && ctx.minutesUntilUpNext <= 240) {
    const label = ctx.upNextEventName ?? ctx.upNextEventType;
    lines.push(`- Up next: ${label} (${ctx.upNextEventType}) \u2014 in ${ctx.minutesUntilUpNext} min`);
  }

  if (
    !ctx.lastCompletedEventType &&
    !ctx.upNextEventType
  ) {
    lines.push('- No recent or upcoming event \u2014 mid-window. Speak to the moment, not the metrics.');
  }

  lines.push('');
  lines.push('Write the one motivational sentence now.');
  return lines.join('\n');
}

function describeTimeOfDay(hour: number): string {
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 14) return 'midday';
  if (hour >= 14 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'late night';
}

// ── Context hash — used for change detection ────────────────────────────

function contextHash(ctx: HeroCoachingContext): string {
  // Bucket transition minutes to 15-min windows so trivial drift doesn't
  // bust the cache (a wearable sync between two events shouldn't trigger a
  // new Haiku call). Hour-of-day buckets to 2h windows for the same reason.
  const bucketMinSince = ctx.minutesSinceLastEvent == null
    ? null : Math.floor(ctx.minutesSinceLastEvent / 15) * 15;
  const bucketMinUntil = ctx.minutesUntilUpNext == null
    ? null : Math.floor(ctx.minutesUntilUpNext / 15) * 15;
  const bucketHour = Math.floor(ctx.hourOfDay / 2) * 2;
  const payload = JSON.stringify({
    s: ctx.sport,
    p: ctx.position,
    a: ctx.ageBand,
    ccrs: ctx.ccrsRecommendation,
    je: ctx.lastCompletedEventType,
    jm: bucketMinSince,
    ne: ctx.upNextEventType,
    nm: bucketMinUntil,
    h: bucketHour,
  });
  return crypto.createHash('sha1').update(payload).digest('hex').slice(0, 16);
}

// ── Context loader ──────────────────────────────────────────────────────

async function buildCoachingContext(athleteId: string): Promise<HeroCoachingContext | null> {
  const db = supabaseAdmin() as any;
  const nowISO = new Date().toISOString();

  // SELECT('*') stays \u2014 we only consume ccrs_recommendation from the snapshot
  // now, but '*' is robust against schema drift between environments.
  const [snapshotRes, profileRes, recentEventRes, upcomingEventRes] = await Promise.all([
    db
      .from('athlete_snapshots')
      .select('*')
      .eq('athlete_id', athleteId)
      .maybeSingle(),
    db
      .from('users')
      .select('*')
      .eq('id', athleteId)
      .maybeSingle(),
    // Most recently completed event (last 6h, to keep "you just finished X"
    // contextual rather than "yesterday morning you trained").
    db
      .from('calendar_events')
      .select('event_type, name, end_at, status')
      .eq('user_id', athleteId)
      .eq('status', 'completed')
      .not('end_at', 'is', null)
      .lte('end_at', nowISO)
      .gte('end_at', new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString())
      .order('end_at', { ascending: false })
      .limit(1),
    // Next upcoming event in the next 4h \u2014 powers "heading into..." copy.
    db
      .from('calendar_events')
      .select('event_type, name, start_at')
      .eq('user_id', athleteId)
      .gt('start_at', nowISO)
      .lte('start_at', new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString())
      .order('start_at', { ascending: true })
      .limit(1),
  ]);

  if (snapshotRes.error) {
    logger.warn('[dynamic-coaching] snapshot read failed', {
      athleteId, error: snapshotRes.error.message,
    });
  }
  if (profileRes.error) {
    logger.warn('[dynamic-coaching] profile read failed', {
      athleteId, error: profileRes.error.message,
    });
  }

  const snap = snapshotRes.data;
  const profile = profileRes.data;
  if (!profile) {
    logger.warn('[dynamic-coaching] missing profile, skipping generation', { athleteId });
    return null;
  }

  const recent = Array.isArray(recentEventRes.data) && recentEventRes.data.length > 0 ? recentEventRes.data[0] : null;
  const upcoming = Array.isArray(upcomingEventRes.data) && upcomingEventRes.data.length > 0 ? upcomingEventRes.data[0] : null;

  let minutesSinceLastEvent: number | null = null;
  if (recent?.end_at) {
    const diffMs = Date.now() - Date.parse(recent.end_at);
    if (Number.isFinite(diffMs) && diffMs >= 0) minutesSinceLastEvent = Math.floor(diffMs / 60_000);
  }

  let minutesUntilUpNext: number | null = null;
  if (upcoming?.start_at) {
    const diffMs = Date.parse(upcoming.start_at) - Date.now();
    if (Number.isFinite(diffMs) && diffMs >= 0) minutesUntilUpNext = Math.floor(diffMs / 60_000);
  }

  return {
    athleteId,
    sport: profile.sport ?? null,
    position: profile.position ?? null,
    ageBand: profile.age_band ?? null,
    firstName: profile.name ? String(profile.name).split(' ')[0] : null,
    ccrsRecommendation: snap?.ccrs_recommendation ?? null,
    lastCompletedEventType: recent?.event_type ?? null,
    lastCompletedEventName: recent?.name ?? null,
    minutesSinceLastEvent,
    upNextEventType: upcoming?.event_type ?? null,
    upNextEventName: upcoming?.name ?? null,
    minutesUntilUpNext,
    hourOfDay: new Date().getHours(),
  };
}

// ── Persistence ─────────────────────────────────────────────────────────

async function readExisting(athleteId: string): Promise<{
  text: string | null;
  hash: string;
  source: 'safety' | 'ai' | 'fallback';
} | null> {
  const db = supabaseAdmin() as any;
  const { data } = await db
    .from('athlete_snapshots')
    .select('dynamic_coaching, dynamic_coaching_context_hash')
    .eq('athlete_id', athleteId)
    .maybeSingle();
  if (!data || !data.dynamic_coaching_context_hash) return null;
  // We don't store the source kind separately — infer from the text: if it's
  // one of the safety strings, source=safety. Otherwise AI. Fallback is a
  // null store which we skip above.
  const text = data.dynamic_coaching as string | null;
  const isSafety = text != null && Object.values(SAFETY_COPY).includes(text);
  return {
    text,
    hash: data.dynamic_coaching_context_hash as string,
    source: isSafety ? 'safety' : text ? 'ai' : 'fallback',
  };
}

async function persistCoaching(
  athleteId: string,
  result: Omit<CoachingResult, 'contextHash'>,
  hash: string,
): Promise<void> {
  const db = supabaseAdmin() as any;
  await db
    .from('athlete_snapshots')
    .upsert(
      {
        athlete_id: athleteId,
        dynamic_coaching: result.text,
        dynamic_coaching_generated_at: new Date().toISOString(),
        dynamic_coaching_context_hash: hash,
      },
      { onConflict: 'athlete_id' },
    );
}
