/**
 * RAG Generator — Professor-grade recommendation content
 *
 * Takes retrieved knowledge chunks + athlete snapshot data and generates
 * personalised, science-grounded recommendation copy via Claude.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { RecType, RecPriority } from '../types';
import type { KnowledgeChunk } from './ragRetriever';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AugmentedRecContent {
  body_short: string;
  body_long: string;
  body_coach: string;
  evidence_basis_text: string;
  action_cta: string;
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
// Professor System Prompt
// ---------------------------------------------------------------------------

const PROFESSOR_SYSTEM_PROMPT = `You are a Performance Science Advisor embedded inside Tomo, an athlete development platform.

Your academic and professional background:
- PhD in Exercise Physiology from a leading sports science university
- 20+ years working as a Performance Director across elite football academies, national youth teams, and professional clubs
- Published researcher in: youth athlete development, load management, HRV-guided training, dual-load (academic + athletic) stress, and long-term athletic development
- Deep understanding of the unique pressures on student-athletes: academic deadlines, social development, family dynamics, identity outside sport
- Professor of Sports Science — you know how to translate complex physiology into language a 15-year-old can immediately act on

Your communication principles:
1. Lead with what matters to the athlete right now, not the science
2. Use the science to explain WHY, after you've stated WHAT
3. Reference specific numbers from the athlete's data — never speak in abstractions
4. Be direct and confident — you've seen thousands of athletes at this stage
5. Acknowledge the human behind the data — a bad readiness score often has a real-world cause worth acknowledging
6. Never be patronising — these are serious athletes, not children being managed
7. Always end with one clear, specific action the athlete can take right now
8. When speaking to young athletes (U15 and below), simplify vocabulary but never simplify the respect for their intelligence

Tone calibration by age group:
- U13: warm, encouraging, simple language, celebrate effort over metrics
- U15: direct but supportive, start introducing the science simply
- U17: speak as you would to a dedicated adult athlete
- U19+: full technical language acceptable, peer-level respect

PHV stage awareness:
- Circa-PHV athletes are in the most vulnerable physical period of their development and often the most psychologically fragile (identity disruption, performance dips) — acknowledge this explicitly when relevant
- Never make a circa-PHV athlete feel that their current performance numbers define them

Retrieved knowledge context will be provided below. Use it to ground your response in evidence. Cite the key finding naturally — not as an academic reference, but as a fact a knowledgeable coach would share.

Athlete-specific data will be provided. Use every number you have.
Speak as if you have been coaching this specific athlete for two years.`;

// ---------------------------------------------------------------------------
// Generation function
// ---------------------------------------------------------------------------

/**
 * Generate augmented recommendation content using RAG + Claude.
 *
 * Falls back to null if generation fails — callers should use static content.
 */
export async function generateAugmentedContent(
  recType: RecType,
  title: string,
  priority: RecPriority,
  snapshot: Record<string, unknown>,
  phv: { phvStage: string; loadingMultiplier: number } | null,
  retrievedChunks: KnowledgeChunk[]
): Promise<AugmentedRecContent> {
  // Build the knowledge section
  const knowledgeSection = retrievedChunks
    .map((c, i) => (
      `[Knowledge ${i + 1}: ${c.title}] [Evidence Grade: ${c.evidence_grade}]\n` +
      `${c.content}\n` +
      `Source: ${c.primary_source}`
    ))
    .join('\n\n');

  // Build the athlete data section
  const athleteSection = [
    `PHV stage: ${phv?.phvStage ?? 'unknown'}`,
    `Readiness RAG: ${snapshot.readiness_rag ?? 'N/A'}`,
    `Readiness score: ${snapshot.readiness_score ?? 'N/A'}/100`,
    `ACWR: ${snapshot.acwr ?? 'N/A'}`,
    `ATL (7-day): ${snapshot.atl_7day ?? 'N/A'}`,
    `CTL (28-day): ${snapshot.ctl_28day ?? 'N/A'}`,
    `Dual-load index: ${snapshot.dual_load_index ?? 'N/A'}/100`,
    `HRV today: ${snapshot.hrv_today_ms ?? 'N/A'}ms vs baseline ${snapshot.hrv_baseline_ms ?? 'N/A'}ms`,
    `Sleep quality: ${snapshot.sleep_quality ?? 'N/A'}/10`,
    `Wellness 7-day avg: ${snapshot.wellness_7day_avg ?? 'N/A'}`,
    `Training age: ${snapshot.training_age_weeks ?? 'N/A'} weeks`,
    `Streak: ${snapshot.streak_days ?? 'N/A'} days`,
    `Loading multiplier: ${phv?.loadingMultiplier ?? 1.0}`,
  ].join('\n');

  const userPrompt = `--- RETRIEVED KNOWLEDGE (use to ground your response) ---
${knowledgeSection}

--- ATHLETE DATA ---
${athleteSection}

--- TASK ---
Generate recommendation content for type: ${recType}
Title: ${title}
Priority: P${priority} (1=urgent, 4=informational)

Produce a JSON object with exactly these 5 fields:
1. "body_short": ≤140 characters, athlete-facing, action-oriented, direct
2. "body_long": 3–5 sentences, uses the retrieved science naturally, references this athlete's specific numbers
3. "body_coach": 1–2 sentences, technical language for coach/parent dashboard
4. "evidence_basis_text": ≤80 characters, the key scientific fact grounding this recommendation
5. "action_cta": ≤50 characters, single action label for the CTA button

Respond ONLY with valid JSON matching these 5 fields. No markdown, no explanation.`;

  const response = await getClient().messages.create({
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
    max_tokens: 600,
    temperature: 0.7,
    system: PROFESSOR_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  // Extract text content
  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  // Parse JSON — strip any markdown fences if model wraps in ```json
  const cleaned = text.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
  const parsed = JSON.parse(cleaned) as AugmentedRecContent;

  // Validate required fields exist
  if (!parsed.body_short || !parsed.body_long) {
    throw new Error('Missing required body_short or body_long in Claude response');
  }

  return parsed;
}
