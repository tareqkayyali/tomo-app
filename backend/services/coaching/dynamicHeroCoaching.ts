/**
 * Dynamic Hero Coaching — picks the one-sentence coaching line that appears
 * on the Signal Dashboard's FocusHero card.
 *
 * NO AI. The previous Haiku-driven version kept drifting toward "step on
 * the pitch" copy regardless of context. The new model is calendar-tied:
 * the line is selected from curated category-specific pools based on what
 * just happened or what's coming up next on the athlete's calendar.
 *
 * Resolution order (first match wins):
 *
 *   1. Safety override — CCRS critical bands (blocked / recovery). Hardcoded
 *      strings, no randomness. The athlete is hurt or in mandated recovery
 *      and we don't want any motivational vibe to dilute that.
 *
 *   2. Sleep nearing — Sleep is up next within 2 hours. Wind-down pool.
 *
 *   3. Just finished an event (last 30 min) — POST_EVENT_VIBES per category.
 *      "Well done", "great work", "brain's earned a break", etc.
 *
 *   4. Coming into an event (next 60 min) — PRE_EVENT_VIBES per category.
 *      Ramp-up energy specific to the activity type.
 *
 *   5. Default — NEUTRAL_VIBES. Light encouragement, no calendar context.
 *
 * Within each pool, a deterministic seed (context hash) picks the same line
 * as long as the situation hasn't changed. When the next event-handler
 * fires (check-in, session complete, wearable sync) the hash shifts and a
 * fresh line is picked from the pool.
 *
 * Call sites:
 *   • wellnessHandler    — after every check-in
 *   • sessionHandler     — after a SESSION_LOG completes
 *   • vitalHandler       — after a wearable sync lands
 *   • boot (lazy)        — if the stored copy is >6h old
 *
 * All writes go to athlete_snapshots.dynamic_coaching (see migration 090).
 */

import crypto from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

// ── Safety band copy — deterministic, never randomised ───────────────────
const SAFETY_COPY = {
  ccrs_blocked:
    'Injury watch \u2014 stop here. Recovery only today. No intensity, no testing. Log how you feel on your next check-in.',
  ccrs_recovery:
    'Injury watch \u2014 ease off. Mobility, easy cardio, technique only. Save the hard work for when you\u2019re cleared.',
};

// ── Per-category pools ──────────────────────────────────────────────────
// Each line stays under ~140 chars. Tone: peer-level, slightly playful,
// never patronising. Categories follow the calendar_events.event_type
// vocabulary: training, match, study_block, exam, recovery, other.

const POST_EVENT_VIBES: Record<string, string[]> = {
  training: [
    'Great session — body\u2019s adapting. Hydrate up.',
    'Big work logged. Tomorrow\u2019s sharper for what you just did.',
    'Well done — the work goes in the bank. Refuel and reset.',
    'Solid effort. That\u2019s another brick in the wall.',
    'Session done, body\u2019s thanking you. Stretch, drink, breathe.',
  ],
  match: [
    'Match in the books \u2014 walk it off, hydrate, replay the good moments.',
    'You showed up. That\u2019s what matters. Recover well.',
    'Game done. Win or lose, the experience is yours to keep.',
    'Big day logged. Slow it down now.',
  ],
  study_block: [
    'Brain\u2019s earned a break. Stretch, breathe, drink water.',
    'Books closed. Switch the focus off, give the body a few easy minutes.',
    'Study\u2019s done \u2014 well done sticking with it. Reset before the next thing.',
    'Solid focus. Now move a little, let the mind soften.',
    'Good work. The repetition adds up even when you can\u2019t see it.',
  ],
  exam: [
    'Exam\u2019s done \u2014 you walked in and got it done. That\u2019s the win.',
    'However it went, it\u2019s behind you now. Breathe out.',
    'Exam logged. Now switch off properly \u2014 you\u2019ve earned it.',
    'Big test done. Whatever happens next, you showed up.',
  ],
  recovery: [
    'Recovery\u2019s logged. Quiet wins matter as much as the loud ones.',
    'Body got what it needed. Smart move.',
    'Recovery done \u2014 you\u2019re building the platform for the harder days.',
  ],
  other: [
    'Block done. Nice pacing.',
    'Logged. On to the next one.',
    'Well done getting that done.',
  ],
};

const PRE_EVENT_VIBES: Record<string, string[]> = {
  training: [
    'Pitch is calling \u2014 fuel up and bring the focus.',
    'Session up next. Trust your prep, switch on.',
    'Time to train. Show up like the work matters \u2014 because it does.',
    'You know what\u2019s coming. Get ready, then get after it.',
  ],
  match: [
    'Game day energy. Trust the work that got you here.',
    'Match incoming. Breathe, focus, do you.',
    'Pre-game window \u2014 settle the nerves, set the intent.',
    'You\u2019ve earned the right to be here. Now go play.',
  ],
  study_block: [
    'Books soon \u2014 clear the desk, pick the one thing to nail.',
    'Study coming up. Phone face-down, focus on for 30 minutes.',
    'Heads down soon. Set a small goal and chase it.',
    'Time to learn. Pick what matters most and start there.',
  ],
  exam: [
    'Exam coming up. Trust your prep \u2014 you\u2019ve put the work in.',
    'Big test soon. Steady breath, calm hands, you\u2019ve got this.',
    'Pre-exam window. Trust what you know and let it land.',
  ],
  recovery: [
    'Recovery coming up. Slow it down on purpose \u2014 this is part of the plan.',
    'Recovery time soon. Be present with it, not annoyed by it.',
  ],
  other: [
    'Up next \u2014 show up like you mean it.',
    'Something coming up. Get into the right headspace.',
  ],
};

const SLEEP_NEARING_VIBES: string[] = [
  'Long day\u2019s nearly logged. Wind it down.',
  'Tomorrow\u2019s built tonight. Sleep is the work.',
  'Slow it down \u2014 phone away, lights low, let the day soften.',
  'Wrap the day soft. Rest is where the adaptation happens.',
  'Good day done. Time to let the body rebuild.',
];

const NEUTRAL_VIBES: string[] = [
  'Quiet stretch \u2014 hydrate, move a little, stay sharp.',
  'In-between moment. Be where you are.',
  'Steady. The next thing comes when it comes.',
  'Drink water, take a breath, keep it simple.',
  'Reset and roll on.',
];

// ── Types ────────────────────────────────────────────────────────────────

export interface HeroCoachingContext {
  athleteId: string;
  ccrsRecommendation: string | null;
  lastCompletedEventType: string | null;
  minutesSinceLastEvent: number | null;
  upNextEventType: string | null;
  upNextEventName: string | null;
  minutesUntilUpNext: number | null;
}

export interface CoachingResult {
  source: 'safety' | 'sleep' | 'post_event' | 'pre_event' | 'neutral';
  text: string;
  contextHash: string;
}

function isSleepEvent(type: string | null, name: string | null): boolean {
  if (!type) return false;
  if (type === 'sleep') return true;
  if (type === 'other' && name && name.toLowerCase().includes('sleep')) return true;
  return false;
}

// ── Public entry point ──────────────────────────────────────────────────

export async function generateAndPersistHeroCoaching(
  athleteId: string,
): Promise<CoachingResult | { source: 'fallback'; text: null; contextHash: '' }> {
  logger.info('[dynamic-coaching] starting', { athleteId });
  const ctx = await buildCoachingContext(athleteId);
  if (!ctx) {
    return { source: 'fallback', text: null, contextHash: '' };
  }

  const hash = contextHash(ctx);

  const existing = await readExisting(athleteId);
  if (existing && existing.hash === hash && existing.text) {
    return {
      source: existing.source as CoachingResult['source'],
      text: existing.text,
      contextHash: hash,
    };
  }

  const result = resolveCoaching(ctx, hash);
  await persistCoaching(athleteId, result);
  logger.info('[dynamic-coaching] result', {
    athleteId,
    source: result.source,
    textLength: result.text.length,
  });
  return result;
}

// ── Resolver — picks the right pool based on calendar state ─────────────

function resolveCoaching(ctx: HeroCoachingContext, hash: string): CoachingResult {
  const safety = resolveSafetyOverride(ctx);
  if (safety) return { source: 'safety', text: safety, contextHash: hash };

  if (
    isSleepEvent(ctx.upNextEventType, ctx.upNextEventName) &&
    ctx.minutesUntilUpNext != null &&
    ctx.minutesUntilUpNext <= 120
  ) {
    return { source: 'sleep', text: pickFromPool(SLEEP_NEARING_VIBES, hash), contextHash: hash };
  }

  if (
    ctx.lastCompletedEventType &&
    ctx.minutesSinceLastEvent != null &&
    ctx.minutesSinceLastEvent <= 30
  ) {
    const pool = POST_EVENT_VIBES[ctx.lastCompletedEventType] ?? POST_EVENT_VIBES.other;
    return { source: 'post_event', text: pickFromPool(pool, hash), contextHash: hash };
  }

  if (
    ctx.upNextEventType &&
    ctx.minutesUntilUpNext != null &&
    ctx.minutesUntilUpNext <= 60 &&
    !isSleepEvent(ctx.upNextEventType, ctx.upNextEventName)
  ) {
    const pool = PRE_EVENT_VIBES[ctx.upNextEventType] ?? PRE_EVENT_VIBES.other;
    return { source: 'pre_event', text: pickFromPool(pool, hash), contextHash: hash };
  }

  return { source: 'neutral', text: pickFromPool(NEUTRAL_VIBES, hash), contextHash: hash };
}

export function resolveSafetyOverride(ctx: HeroCoachingContext): string | null {
  if (ctx.ccrsRecommendation === 'blocked') return SAFETY_COPY.ccrs_blocked;
  if (ctx.ccrsRecommendation === 'recovery') return SAFETY_COPY.ccrs_recovery;
  return null;
}

function pickFromPool(pool: string[], hash: string): string {
  if (pool.length === 0) return '';
  const idx = parseInt(hash.slice(0, 8), 16) % pool.length;
  return pool[idx];
}

// ── Context loader ──────────────────────────────────────────────────────

async function buildCoachingContext(athleteId: string): Promise<HeroCoachingContext | null> {
  const db = supabaseAdmin() as any;
  const nowISO = new Date().toISOString();

  const [snapshotRes, recentEventRes, upcomingEventRes] = await Promise.all([
    db
      .from('athlete_snapshots')
      .select('*')
      .eq('athlete_id', athleteId)
      .maybeSingle(),
    // calendar_events column reality (from types/database.ts):
    //   - `title` (not `name`)
    //   - `completed: boolean` + `completed_at: timestamp` (no `status` text)
    // Earlier queries used `name` + `status='completed'` which silently
    // errored on the SELECT, returning empty results, falling resolver
    // through to NEUTRAL_VIBES even when Sleep/study events existed.
    db
      .from('calendar_events')
      .select('event_type, title, end_at, completed')
      .eq('user_id', athleteId)
      .eq('completed', true)
      .not('end_at', 'is', null)
      .lte('end_at', nowISO)
      .gte('end_at', new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString())
      .order('end_at', { ascending: false })
      .limit(1),
    db
      .from('calendar_events')
      .select('event_type, title, start_at')
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

  const snap = snapshotRes.data;
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
    ccrsRecommendation: snap?.ccrs_recommendation ?? null,
    lastCompletedEventType: recent?.event_type ?? null,
    minutesSinceLastEvent,
    upNextEventType: upcoming?.event_type ?? null,
    upNextEventName: upcoming?.title ?? null,
    minutesUntilUpNext,
  };
}

// ── Context hash ────────────────────────────────────────────────────────

function contextHash(ctx: HeroCoachingContext): string {
  const bucketMinSince = ctx.minutesSinceLastEvent == null
    ? null : Math.floor(ctx.minutesSinceLastEvent / 15) * 15;
  const bucketMinUntil = ctx.minutesUntilUpNext == null
    ? null : Math.floor(ctx.minutesUntilUpNext / 15) * 15;
  const payload = JSON.stringify({
    ccrs: ctx.ccrsRecommendation,
    je: ctx.lastCompletedEventType,
    jm: bucketMinSince,
    ne: ctx.upNextEventType,
    nsleep: isSleepEvent(ctx.upNextEventType, ctx.upNextEventName),
    nm: bucketMinUntil,
  });
  return crypto.createHash('sha1').update(payload).digest('hex').slice(0, 16);
}

// ── Persistence ─────────────────────────────────────────────────────────

async function readExisting(athleteId: string): Promise<{
  text: string | null;
  hash: string;
  source: string;
} | null> {
  const db = supabaseAdmin() as any;
  const { data } = await db
    .from('athlete_snapshots')
    .select('dynamic_coaching, dynamic_coaching_context_hash')
    .eq('athlete_id', athleteId)
    .maybeSingle();
  if (!data || !data.dynamic_coaching_context_hash) return null;
  return {
    text: data.dynamic_coaching as string | null,
    hash: data.dynamic_coaching_context_hash as string,
    source: 'cached',
  };
}

async function persistCoaching(
  athleteId: string,
  result: CoachingResult,
): Promise<void> {
  const db = supabaseAdmin() as any;
  await db
    .from('athlete_snapshots')
    .upsert(
      {
        athlete_id: athleteId,
        dynamic_coaching: result.text,
        dynamic_coaching_generated_at: new Date().toISOString(),
        dynamic_coaching_context_hash: result.contextHash,
      },
      { onConflict: 'athlete_id' },
    );
}
