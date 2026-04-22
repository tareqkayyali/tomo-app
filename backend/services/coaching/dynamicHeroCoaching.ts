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
// These are intentionally direct + respectful. We never paraphrase safety
// messages through a model.
const SAFETY_COPY = {
  ccrs_blocked:
    'Recovery first today. Full stop on intensity. Walk, stretch, hydrate — log how you feel on your next check-in.',
  ccrs_recovery:
    'Recovery day. Low-intensity only — mobility, easy cardio, technique work. No hard efforts.',
  readiness_red:
    'Body\u2019s telling you to ease off. Shift today toward recovery or light technical — intensity can wait.',
  injury_amber:
    'Injury watch active. Reduce volume, avoid the aggravating movement pattern, and log how it feels.',
  sleep_debt_severe:
    'Sleep debt is heavy. Prioritise 9+ hours tonight — adaptation only happens when you actually sleep.',
};

// ── System prompt (cached) — brand voice + invariants ──────────────────
const SYSTEM_PROMPT = `You are Tomo, an elite-level AI coach for young athletes (13\u201317yo).

Write ONE coaching sentence for the athlete\u2019s dashboard. Not a paragraph. ONE sentence.

Rules:
- Max 140 characters, including punctuation.
- Plain text only \u2014 no emojis, no markdown, no quotation marks around the output.
- Positive-push tone: celebrate work done, or nudge toward the next right action. Never scold.
- Reference ONE specific input from the context (the most recent event, a readiness number, a trend) \u2014 do not list multiple.
- Sport-aware: tailor phrasing to the athlete\u2019s sport and position when relevant.
- Age-aware: conversational, peer-level. Never patronising.
- Never mention Tomo by name. Speak directly to the athlete as "you".
- If context includes a just-completed event, acknowledge it briefly and offer a forward cue.
- If nothing meaningful happened recently, offer a micro-insight based on the readiness state.

Output: the sentence only. No preamble, no sign-off, no trailing period emoji.`;

// ── Types ────────────────────────────────────────────────────────────────

export interface HeroCoachingContext {
  // Athlete identity
  athleteId: string;
  sport: string | null;
  position: string | null;
  ageBand: string | null;              // e.g. 'U17'
  firstName: string | null;

  // Safety inputs
  ccrsRecommendation: string | null;   // 'full_load'|'moderate'|'reduced'|'recovery'|'blocked'
  readinessRag: string | null;         // 'GREEN'|'AMBER'|'RED'
  injuryFlag: string | null;           // 'GREEN'|'AMBER'|'RED' | null
  sleepDebt3d: number | null;          // hours

  // Contextual inputs
  readinessScore: number | null;       // 0-100
  hrvDeltaPct: number | null;          // vs baseline
  lastCompletedEventType: string | null; // 'training'|'match'|'study_block'|...
  lastCompletedEventName: string | null;
  minutesSinceLastEvent: number | null;
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
  await persistCoaching(athleteId, result, hash);
  return { ...result, contextHash: hash };
}

// ── Resolution — safety → AI → fallback ─────────────────────────────────

export function resolveSafetyOverride(ctx: HeroCoachingContext): string | null {
  // Priority order within safety tier.
  if (ctx.ccrsRecommendation === 'blocked') return SAFETY_COPY.ccrs_blocked;
  if (ctx.injuryFlag === 'RED' || ctx.injuryFlag === 'AMBER') return SAFETY_COPY.injury_amber;
  if (ctx.ccrsRecommendation === 'recovery') return SAFETY_COPY.ccrs_recovery;
  if (ctx.readinessRag === 'RED') return SAFETY_COPY.readiness_red;
  if (ctx.sleepDebt3d != null && ctx.sleepDebt3d >= 8) return SAFETY_COPY.sleep_debt_severe;
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
  if (ctx.ageBand) lines.push(`- Age band: ${ctx.ageBand}`);
  if (ctx.readinessScore != null) lines.push(`- Readiness: ${ctx.readinessScore}/100 (${ctx.readinessRag ?? '—'})`);
  if (ctx.ccrsRecommendation) lines.push(`- CCRS recommendation: ${ctx.ccrsRecommendation}`);
  if (ctx.hrvDeltaPct != null) {
    const sign = ctx.hrvDeltaPct >= 0 ? '+' : '';
    lines.push(`- HRV vs baseline: ${sign}${Math.round(ctx.hrvDeltaPct)}%`);
  }
  if (ctx.sleepDebt3d != null) lines.push(`- Sleep debt (3d): ${ctx.sleepDebt3d.toFixed(1)}h`);

  if (ctx.lastCompletedEventType && ctx.minutesSinceLastEvent != null && ctx.minutesSinceLastEvent <= 180) {
    const eventLabel = ctx.lastCompletedEventName ?? ctx.lastCompletedEventType;
    lines.push(
      `- Just completed: ${eventLabel} (${ctx.lastCompletedEventType}) \u2014 ${ctx.minutesSinceLastEvent} min ago`,
    );
  } else {
    lines.push('- No recently completed event.');
  }

  lines.push('');
  lines.push('Write the one-sentence coaching line now.');
  return lines.join('\n');
}

// ── Context hash — used for change detection ────────────────────────────

function contextHash(ctx: HeroCoachingContext): string {
  // Round numeric inputs so trivial fluctuations (e.g. HRV +/-1%) don't bust
  // the cache. Event-type + bucketed minutes since = coarse activity state.
  const bucketMinutes =
    ctx.minutesSinceLastEvent == null
      ? null
      : Math.floor(ctx.minutesSinceLastEvent / 15) * 15;
  const payload = JSON.stringify({
    s: ctx.sport,
    p: ctx.position,
    a: ctx.ageBand,
    rag: ctx.readinessRag,
    rs: ctx.readinessScore != null ? Math.round(ctx.readinessScore / 5) * 5 : null,
    ccrs: ctx.ccrsRecommendation,
    inj: ctx.injuryFlag,
    hrv: ctx.hrvDeltaPct != null ? Math.round(ctx.hrvDeltaPct / 5) * 5 : null,
    sd: ctx.sleepDebt3d != null ? Math.round(ctx.sleepDebt3d) : null,
    evt: ctx.lastCompletedEventType,
    mb: bucketMinutes,
  });
  return crypto.createHash('sha1').update(payload).digest('hex').slice(0, 16);
}

// ── Context loader ──────────────────────────────────────────────────────

async function buildCoachingContext(athleteId: string): Promise<HeroCoachingContext | null> {
  const db = supabaseAdmin() as any;

  const [snapshotRes, profileRes, eventRes] = await Promise.all([
    db
      .from('athlete_snapshots')
      .select(
        'readiness_score, readiness_rag, hrv_today_ms, hrv_baseline_ms, sleep_debt_3d, injury_risk_flag, ccrs_recommendation',
      )
      .eq('athlete_id', athleteId)
      .maybeSingle(),
    db
      .from('users')
      .select('sport, position, age_band, name')
      .eq('id', athleteId)
      .maybeSingle(),
    db
      .from('calendar_events')
      .select('event_type, name, end_at, status')
      .eq('user_id', athleteId)
      .eq('status', 'completed')
      .not('end_at', 'is', null)
      .lte('end_at', new Date().toISOString())
      .order('end_at', { ascending: false })
      .limit(1),
  ]);

  const snap = snapshotRes.data;
  const profile = profileRes.data;
  if (!snap || !profile) return null;

  // Compute HRV delta
  let hrvDeltaPct: number | null = null;
  if (snap.hrv_today_ms && snap.hrv_baseline_ms && snap.hrv_baseline_ms > 0) {
    hrvDeltaPct = ((snap.hrv_today_ms - snap.hrv_baseline_ms) / snap.hrv_baseline_ms) * 100;
  }

  // Recent event
  const recent = Array.isArray(eventRes.data) && eventRes.data.length > 0 ? eventRes.data[0] : null;
  let minutesSinceLastEvent: number | null = null;
  if (recent?.end_at) {
    const diffMs = Date.now() - Date.parse(recent.end_at);
    if (Number.isFinite(diffMs) && diffMs >= 0) {
      minutesSinceLastEvent = Math.floor(diffMs / 60_000);
    }
  }

  return {
    athleteId,
    sport: profile.sport ?? null,
    position: profile.position ?? null,
    ageBand: profile.age_band ?? null,
    firstName: profile.name ? String(profile.name).split(' ')[0] : null,
    ccrsRecommendation: snap.ccrs_recommendation ?? null,
    readinessRag: snap.readiness_rag ?? null,
    injuryFlag: snap.injury_risk_flag ?? null,
    sleepDebt3d: snap.sleep_debt_3d ?? null,
    readinessScore: snap.readiness_score ?? null,
    hrvDeltaPct,
    lastCompletedEventType: recent?.event_type ?? null,
    lastCompletedEventName: recent?.name ?? null,
    minutesSinceLastEvent,
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
