/**
 * Longitudinal Memory — Cross-session athlete context persistence.
 *
 * ADDITIVE ONLY — does not modify any existing orchestrator logic.
 *
 * Two functions:
 * 1. loadAthleteMemory() — called at session start, returns formatted prompt block
 * 2. updateAthleteMemory() — called at session end (5+ turns), generates summary via Haiku
 *
 * Memory structure (memory_json):
 * {
 *   currentGoals: string[],        // "Improve 10m sprint to under 1.75s"
 *   unresolvedConcerns: string[],  // "Left knee tightness after sprints"
 *   injuryHistory: string[],       // "Osgood-Schlatter diagnosed Jan 2026"
 *   behavioralPatterns: string[],  // "Tends to overtrain before matches"
 *   coachingPreferences: string[], // "Prefers data-driven feedback"
 *   lastTopics: string[],          // Last 5 session topics
 *   keyMilestones: string[],       // "Hit P75 on CMJ March 2026"
 * }
 */

import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

// ── Types ────────────────────────────────────────────────────────────

export interface AthleteMemory {
  currentGoals: string[];
  unresolvedConcerns: string[];
  injuryHistory: string[];
  behavioralPatterns: string[];
  coachingPreferences: string[];
  lastTopics: string[];
  keyMilestones: string[];
}

const EMPTY_MEMORY: AthleteMemory = {
  currentGoals: [],
  unresolvedConcerns: [],
  injuryHistory: [],
  behavioralPatterns: [],
  coachingPreferences: [],
  lastTopics: [],
  keyMilestones: [],
};

// ── Load Memory (session start) ──────────────────────────────────────

/**
 * Load athlete's longitudinal memory and format as a prompt block.
 * Returns empty string if no memory exists (graceful for new athletes).
 */
export async function loadAthleteMemory(athleteId: string): Promise<string> {
  try {
    const db = supabaseAdmin() as any;
    const { data, error } = await db
      .from('athlete_longitudinal_memory')
      .select('memory_json, session_count, last_session_summary')
      .eq('athlete_id', athleteId)
      .single();

    if (error || !data) return ''; // No memory yet — first-time athlete

    const memory = ((data as any).memory_json ?? {}) as AthleteMemory;
    const parts: string[] = [];

    if (memory.currentGoals?.length > 0) {
      parts.push(`Goals: ${memory.currentGoals.slice(-3).join('; ')}`);
    }
    if (memory.unresolvedConcerns?.length > 0) {
      parts.push(`⚠️ Open concerns: ${memory.unresolvedConcerns.slice(-3).join('; ')}`);
    }
    if (memory.injuryHistory?.length > 0) {
      parts.push(`🩹 Injury history: ${memory.injuryHistory.slice(-3).join('; ')}`);
    }
    if (memory.behavioralPatterns?.length > 0) {
      parts.push(`Patterns: ${memory.behavioralPatterns.slice(-2).join('; ')}`);
    }
    if (memory.coachingPreferences?.length > 0) {
      parts.push(`Prefers: ${memory.coachingPreferences.slice(-2).join('; ')}`);
    }
    if (memory.keyMilestones?.length > 0) {
      parts.push(`🏆 Recent milestones: ${memory.keyMilestones.slice(-2).join('; ')}`);
    }
    if (data.last_session_summary) {
      parts.push(`Last session: ${data.last_session_summary}`);
    }

    if (parts.length === 0) return '';

    return `\n\nATHLETE MEMORY (from ${data.session_count} previous sessions):
${parts.map(p => `- ${p}`).join('\n')}
Use this context naturally. Acknowledge returning topics. Don't repeat back the memory verbatim.`;
  } catch (err) {
    logger.warn('[Memory] Failed to load athlete memory:', { error: err instanceof Error ? err.message : String(err) });
    return ''; // graceful fallback
  }
}

// ── Update Memory (session end) ──────────────────────────────────────

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

const MEMORY_EXTRACTION_PROMPT = `You are analyzing a chat session between a youth athlete and their AI coach (Tomo).
Extract structured memory from this conversation. Return JSON only.

{
  "sessionSummary": "1-sentence summary of what was discussed",
  "newGoals": ["any goals mentioned or set"],
  "newConcerns": ["any unresolved health/training concerns"],
  "injuryMentions": ["any injuries, pain, or soreness reported with location"],
  "patterns": ["any behavioral patterns observed (e.g. overtraining, skipping recovery)"],
  "preferences": ["any coaching style preferences expressed"],
  "milestones": ["any achievements or PBs celebrated"],
  "resolvedConcerns": ["any previously open concerns that were addressed"]
}

Only include fields with actual content. Empty arrays are fine. Be concise — max 10 words per item.`;

/**
 * Generate and save a memory update at end of session.
 * Only called for sessions with 5+ turns (meaningful conversations).
 * Uses Haiku for cost efficiency (~$0.0002 per call).
 */
export async function updateAthleteMemory(
  athleteId: string,
  conversationHistory: { role: string; content: string }[]
): Promise<void> {
  // Skip if conversation too short
  if (conversationHistory.length < 10) return; // 5 turns = 10 messages (user+assistant)

  try {
    const anthropic = getClient();
    const HAIKU_MODEL = process.env.ANTHROPIC_HAIKU_MODEL || 'claude-haiku-4-5-20251001';

    // Truncate history to last 20 messages to save tokens
    const recentHistory = conversationHistory.slice(-20);
    const transcript = recentHistory
      .map(m => `${m.role === 'user' ? 'Athlete' : 'Tomo'}: ${m.content.substring(0, 300)}`)
      .join('\n');

    const response = await anthropic.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 500,
      temperature: 0,
      system: MEMORY_EXTRACTION_PROMPT,
      messages: [{ role: 'user', content: transcript }],
    });

    const responseText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('');

    // Parse JSON from response
    let extracted: any;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      extracted = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      logger.warn('[Memory] Failed to parse Haiku extraction response');
      return;
    }

    if (!extracted) return;

    // Load existing memory
    const db = supabaseAdmin() as any;
    const { data: existing } = await db
      .from('athlete_longitudinal_memory')
      .select('memory_json, session_count')
      .eq('athlete_id', athleteId)
      .single();

    const currentMemory: AthleteMemory = (existing?.memory_json as AthleteMemory) ?? { ...EMPTY_MEMORY };
    const sessionCount = (existing?.session_count ?? 0) + 1;

    // Merge new extractions (keep last N items per field, deduplicate)
    const merge = (existing: string[], incoming: string[], max: number): string[] => {
      const combined = [...existing, ...incoming];
      const unique = [...new Set(combined)];
      return unique.slice(-max); // keep most recent
    };

    // Remove resolved concerns
    const resolvedSet = new Set((extracted.resolvedConcerns ?? []).map((s: string) => s.toLowerCase()));
    const filteredConcerns = currentMemory.unresolvedConcerns.filter(
      c => !resolvedSet.has(c.toLowerCase())
    );

    const updatedMemory: AthleteMemory = {
      currentGoals: merge(currentMemory.currentGoals, extracted.newGoals ?? [], 5),
      unresolvedConcerns: merge(filteredConcerns, extracted.newConcerns ?? [], 5),
      injuryHistory: merge(currentMemory.injuryHistory, extracted.injuryMentions ?? [], 8),
      behavioralPatterns: merge(currentMemory.behavioralPatterns, extracted.patterns ?? [], 4),
      coachingPreferences: merge(currentMemory.coachingPreferences, extracted.preferences ?? [], 4),
      lastTopics: [extracted.sessionSummary ?? 'General chat'].slice(-5),
      keyMilestones: merge(currentMemory.keyMilestones, extracted.milestones ?? [], 5),
    };

    // Upsert
    const { error } = await db
      .from('athlete_longitudinal_memory')
      .upsert({
        athlete_id: athleteId,
        memory_json: updatedMemory,
        session_count: sessionCount,
        last_session_summary: extracted.sessionSummary ?? null,
        last_updated: new Date().toISOString(),
      }, { onConflict: 'athlete_id' });

    if (error) {
      logger.error('[Memory] Failed to save athlete memory:', error.message);
    } else {
      console.log(`[Memory] Updated memory for athlete ${athleteId} (session #${sessionCount})`);
    }
  } catch (err) {
    logger.warn('[Memory] Memory update failed (non-critical):', { error: err instanceof Error ? err.message : String(err) });
  }
}
