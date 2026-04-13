/**
 * Deep Program Refresh — Claude-Powered Training Program Selection
 *
 * Analyzes the athlete's full context (tests, vitals, PHV, readiness, load,
 * benchmarks, position, sport) and selects + ranks the most suitable programs
 * from the existing 31-program catalog.
 *
 * Mirrors the Own It deep refresh pattern (deepRecRefresh.ts) but tuned
 * specifically for training program personalization.
 *
 * Cache: Results stored in athlete_snapshots.program_recommendations (JSONB)
 * Staleness: 24 hours (programs change less often than readiness recs)
 */

import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { buildPlayerContext, type PlayerContext } from '@/services/agents/contextBuilder';
import { FOOTBALL_PROGRAMS, POSITION_MATRIX, type InlineProgram } from './footballPrograms';
import { getInlinePrograms } from './footballPrograms';
import { getRecommendationConfig } from '@/services/recommendations/recommendationConfig';
import { withRetry } from '@/lib/aiRetry';
import { getSnapshotState, applyGuardrails, buildGuardrailSummary } from './programGuardrails';
import { evaluateProgramRules, type ProgramRuleGuidance } from './programRules';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AIProgramOutput {
  programId: string;
  priority: 'mandatory' | 'high' | 'medium';
  impact: string;
  reason: string;
  prescriptionOverrides?: {
    sets?: number;
    reps?: string;
    intensity?: string;
    rpe?: string;
    rest?: string;
    frequency?: string;
  };
  personalizedCues?: string[];
}

export interface DeepProgramResult {
  programs: InlineProgram[];
  weeklyPlanSuggestion: string;
  weeklyStructure: Record<string, number>;
  playerProfile: {
    ageBand: string;
    phvStage: string;
    position: string;
  };
  isAiGenerated: boolean;
  generatedAt: string;
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
const DEEP_PROGRAM_STALE_HOURS_DEFAULT = 24;

export async function isDeepProgramStale(athleteId: string): Promise<boolean> {
  const db = supabaseAdmin();
  const { data } = await (db as any)
    .from('athlete_snapshots')
    .select('program_recommendations')
    .eq('athlete_id', athleteId)
    .maybeSingle();

  if (!data?.program_recommendations) return true;

  const cached = data.program_recommendations as DeepProgramResult;
  if (!cached.generatedAt) return true;

  const cfg = await getRecommendationConfig();
  const staleHours = cfg.programRefresh.stalenessHours;
  const hoursSince = (Date.now() - new Date(cached.generatedAt).getTime()) / (1000 * 60 * 60);
  return hoursSince > staleHours;
}

/**
 * Get cached AI program recommendations from athlete_snapshots.
 * Returns null if no cached data or data is stale.
 */
export async function getCachedProgramRecommendations(
  athleteId: string
): Promise<DeepProgramResult | null> {
  const db = supabaseAdmin();
  const { data } = await (db as any)
    .from('athlete_snapshots')
    .select('program_recommendations')
    .eq('athlete_id', athleteId)
    .maybeSingle();

  if (!data?.program_recommendations) return null;

  const cached = data.program_recommendations as DeepProgramResult;
  if (!cached.generatedAt || !cached.isAiGenerated) return null;

  // Check staleness using CMS config
  const cfg = await getRecommendationConfig();
  const staleHours = cfg.programRefresh.stalenessHours;
  const hoursSince = (Date.now() - new Date(cached.generatedAt).getTime()) / (1000 * 60 * 60);
  if (hoursSince > staleHours) return null;

  return cached;
}

// ---------------------------------------------------------------------------
// System Prompt
// ---------------------------------------------------------------------------

const DEEP_PROGRAM_SYSTEM_PROMPT = `You are the Training Program Intelligence Engine for Tomo, an AI coaching platform for young athletes (13–25).

You have access to:
1. The athlete's FULL performance context — readiness, load, vitals, benchmarks, PHV stage, schedule
2. A catalog of 31 training programs (physical + technical) with detailed prescriptions

Your job is to SELECT and RANK the most suitable programs for THIS SPECIFIC athlete TODAY, using all available data to personalize the selection.

PROGRAM SELECTION RULES:
1. Select 8–15 programs from the catalog (not all 31 — curate the best ones)
2. Assign priority: "mandatory" (3-5 programs), "high" (3-5), "medium" (2-5)
3. MANDATORY programs must be genuinely essential for this athlete's position + current needs
4. Consider gaps from benchmark testing — programs targeting weak areas get elevated priority
5. Consider PHV stage — contraindicated programs must be excluded, warnings added
6. Consider readiness/load — if athlete is fatigued, reduce high-intensity programs
7. Consider training history — beginners need different priorities than experienced athletes

PERSONALIZATION REQUIREMENTS:
- "impact" field: Write a personalized 1-sentence impact statement that references the athlete's ACTUAL data
  - BAD: "Makes you faster"
  - GOOD: "Your 30m sprint is P42 — this program targets the acceleration phase to close that gap"
  - GOOD: "With ACWR at 1.4, include this at lower volume to manage load while building hamstring resilience"
- "reason" field: 2-3 sentences explaining WHY this program was selected for this athlete specifically
- Reference actual test scores, percentiles, readiness state, load metrics when available
- For sparse data, still personalize based on position, age band, and PHV stage

PRESCRIPTION OVERRIDES:
You may adjust prescriptions based on the athlete's current state:
- If readiness is RED/AMBER: reduce intensity, RPE, or sets
- If ACWR > 1.3: reduce volume (fewer sets, lower frequency)
- If ACWR < 0.8: may increase slightly to build fitness
- If mid-PHV: enforce all PHV restrictions
- Only override fields that need changing — omit fields to keep defaults

PERSONALIZED CUES:
Add 1-2 position-specific or situation-specific coaching cues beyond the program defaults.
Example: For a CB with poor aerial ability: "Focus on timing your jump at the highest point of the ball flight"

Respond with ONLY a JSON object with this structure:
{
  "selectedPrograms": [
    {
      "programId": "program_id_from_catalog",
      "priority": "mandatory" | "high" | "medium",
      "impact": "personalized impact statement",
      "reason": "personalized reason referencing athlete data",
      "prescriptionOverrides": { ... } or null,
      "personalizedCues": ["cue1", "cue2"] or null
    }
  ],
  "weeklyPlanSuggestion": "A 2-3 sentence personalized weekly plan that references the athlete's schedule, readiness, and goals",
  "weeklyStructureOverride": { "strength": 2, "technical": 3, ... } or null
}

No markdown, no explanation. Just the raw JSON object.`;

// ---------------------------------------------------------------------------
// Main Refresh Function
// ---------------------------------------------------------------------------

export async function deepProgramRefresh(
  athleteId: string,
  timezone?: string
): Promise<{ count: number; error?: string; result?: DeepProgramResult }> {
  const startTime = Date.now();

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[DeepProgramRefresh] ANTHROPIC_API_KEY not set');
    return { count: 0, error: 'ANTHROPIC_API_KEY not configured' };
  }

  try {
    // 1. Build full PlayerContext
    const ctx = await buildPlayerContext(athleteId, 'Output', '', timezone);

    // 1b. Fetch dismissed/done program IDs to exclude
    const { data: interactions } = await (supabaseAdmin() as any)
      .from("program_interactions")
      .select("program_id")
      .eq("user_id", athleteId) as { data: Array<{ program_id: string }> | null };
    const excludedIds = (interactions || []).map((i) => i.program_id);

    // 2a. Get snapshot for guardrails
    const snapshot = await getSnapshotState(athleteId);
    const guardrailSummary = snapshot ? await buildGuardrailSummary(snapshot) : '';

    // 2b. Evaluate PD Program Rules — CMS-authored guidelines for program selection
    let programRuleGuidance: ProgramRuleGuidance | null = null;
    try {
      if (snapshot) {
        const se = ctx.snapshotEnrichment;
        programRuleGuidance = await evaluateProgramRules(
          {
            snapshot: snapshot as any,
            todayVitals: {
              readiness_score: se?.readinessScore ?? null,
              readiness_rag: se?.readinessRag ?? null,
              energy: ctx.readinessComponents?.energy ?? null,
              soreness: ctx.readinessComponents?.soreness ?? null,
              mood: ctx.readinessComponents?.mood ?? null,
              sleep_hours: ctx.readinessComponents?.sleepHours ?? null,
              hrv_morning_ms: se?.hrvTodayMs ?? null,
              pain_flag: false,
            },
            upcomingEvents: ctx.todayEvents as any[],
            recentDailyLoad: [],
            trigger: 'refresh',
          },
          {
            sport: ctx.sport,
            phv_stage: se?.phvStage ?? undefined,
            age_band: ctx.ageBand ?? undefined,
            position: ctx.position ?? undefined,
          },
          athleteId,
        );
      }
    } catch (err) {
      console.warn('[DeepProgramRefresh] Program rule evaluation failed (non-fatal):', (err as Error).message);
    }

    // 2c. Build prompt with athlete context + program catalog + guardrails + PD rules
    const userPrompt = buildDeepProgramPrompt(ctx, excludedIds, guardrailSummary, programRuleGuidance);

    // 3. Call Claude
    const response = await withRetry(
      () => getClient().messages.create({
        model: process.env.ANTHROPIC_PROGRAM_MODEL || 'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        temperature: 0.3,
        system: DEEP_PROGRAM_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      }),
      '[DeepProgramRefresh] Claude API'
    );

    // 4. Parse response
    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    const cleaned = text.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(cleaned) as {
      selectedPrograms: AIProgramOutput[];
      weeklyPlanSuggestion: string;
      weeklyStructureOverride?: Record<string, number> | null;
    };

    if (!parsed.selectedPrograms || !Array.isArray(parsed.selectedPrograms)) {
      console.warn(`[DeepProgramRefresh] Invalid response structure for ${athleteId}`);
      return { count: 0, error: 'Invalid response from Claude' };
    }

    // 5. Merge AI selections with program catalog data
    const position = ctx.position || 'ALL';
    const ageBand = ctx.ageBand || 'SEN';
    const phvStage = ctx.snapshotEnrichment?.phvStage || 'not_applicable';

    // Get base programs using existing engine (for prescriptions, descriptions, etc.)
    const baseResult = getInlinePrograms(position, ageBand, phvStage, ctx.benchmarkProfile?.gaps);
    const baseMap = new Map(baseResult.programs.map(p => [p.programId, p]));

    // Also index the raw program defs for fallback
    const defMap = new Map(FOOTBALL_PROGRAMS.map(p => [p.id, p]));

    let aiPrograms: InlineProgram[] = [];

    for (const aiProg of parsed.selectedPrograms) {
      const base = baseMap.get(aiProg.programId);
      const def = defMap.get(aiProg.programId);

      if (!base && !def) {
        console.warn(`[DeepProgramRefresh] Unknown programId: ${aiProg.programId}, skipping`);
        continue;
      }

      if (base) {
        // Merge AI overrides onto the base program
        const merged: InlineProgram = {
          ...base,
          priority: aiProg.priority,
          impact: aiProg.impact || base.impact,
          reason: aiProg.reason || base.reason,
          prescription: {
            ...base.prescription,
            ...(aiProg.prescriptionOverrides || {}),
            coachingCues: [
              ...base.prescription.coachingCues,
              ...(aiProg.personalizedCues || []),
            ],
          },
        };
        aiPrograms.push(merged);
      } else if (def) {
        // Build from raw def (program exists but wasn't in base result, e.g., filtered by position)
        const prescription = def.prescriptions[ageBand] || def.prescriptions.SEN;
        if (!prescription) continue;

        const phvWarnings: string[] = [];
        if (phvStage && phvStage !== 'not_applicable' && def.phv_guidance) {
          const stageGuidance = (def.phv_guidance as any)[phvStage];
          if (stageGuidance) {
            if (stageGuidance.contraindicated) continue;
            if (stageGuidance.warnings) phvWarnings.push(...stageGuidance.warnings);
            if (stageGuidance.modifiedPrescription) {
              Object.assign(prescription, stageGuidance.modifiedPrescription);
            }
          }
        }

        aiPrograms.push({
          programId: def.id,
          name: def.name,
          category: def.category,
          type: def.type,
          priority: aiProg.priority,
          durationMin: def.duration_minutes,
          durationWeeks: def.duration_weeks,
          description: def.description,
          impact: aiProg.impact,
          frequency: prescription.frequency,
          difficulty: def.difficulty,
          tags: def.tags,
          positionNote: '',
          reason: aiProg.reason,
          prescription: {
            ...prescription,
            ...(aiProg.prescriptionOverrides || {}),
            coachingCues: [
              ...(prescription.coachingCues || []),
              ...(aiProg.personalizedCues || []),
            ],
          },
          phvWarnings,
        });
      }
    }

    // Sort by priority
    const priorityOrder = { mandatory: 0, high: 1, medium: 2 };
    aiPrograms.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    // 5b. Apply PD program rules deterministically (blocked programs removed, mandatory added)
    if (programRuleGuidance && programRuleGuidance.activeRules.length > 0) {
      // Remove blocked programs
      const blockedSet = new Set(programRuleGuidance.blockedPrograms);
      const blockedCats = new Set(programRuleGuidance.blockCategories);
      const beforeCount = aiPrograms.length;
      aiPrograms = aiPrograms.filter(p =>
        !blockedSet.has(p.programId) && !blockedCats.has(p.category.toLowerCase())
      );
      if (aiPrograms.length < beforeCount) {
        console.log(`[DeepProgramRefresh] PD rules blocked ${beforeCount - aiPrograms.length} programs for ${athleteId}`);
      }

      // Ensure mandatory programs are included
      const existingIds = new Set(aiPrograms.map(p => p.programId));
      for (const mandatoryId of programRuleGuidance.mandatoryPrograms) {
        if (!existingIds.has(mandatoryId)) {
          const base = baseMap.get(mandatoryId);
          if (base) {
            aiPrograms.unshift({ ...base, priority: 'mandatory' });
          }
        } else {
          // Elevate existing to mandatory
          const prog = aiPrograms.find(p => p.programId === mandatoryId);
          if (prog) prog.priority = 'mandatory';
        }
      }

      // Elevate high-priority programs
      for (const highId of programRuleGuidance.highPriorityPrograms) {
        const prog = aiPrograms.find(p => p.programId === highId);
        if (prog && prog.priority === 'medium') prog.priority = 'high';
      }

      // Re-sort by priority
      aiPrograms.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
    }

    // 5c. Apply deterministic guardrails on top of AI selection
    let finalPrograms = aiPrograms;
    if (snapshot) {
      const guardrailed = await applyGuardrails(aiPrograms, snapshot);
      finalPrograms = guardrailed.programs;
      if (guardrailed.appliedRules.length > 0) {
        console.log(`[DeepProgramRefresh] Guardrails applied for ${athleteId}: ${guardrailed.appliedRules.join('; ')}`);
      }
    }

    // 6. Determine weekly structure
    const matrix = POSITION_MATRIX.find(m => m.position === position)
      || POSITION_MATRIX.find(m => m.position === 'ALL')!;
    const weeklyStructure = parsed.weeklyStructureOverride || matrix.weekly_structure;

    // 7. Build result
    const result: DeepProgramResult = {
      programs: finalPrograms,
      weeklyPlanSuggestion: parsed.weeklyPlanSuggestion || baseResult.weeklyPlanSuggestion,
      weeklyStructure,
      playerProfile: {
        ageBand,
        phvStage,
        position,
      },
      isAiGenerated: true,
      generatedAt: new Date().toISOString(),
    };

    // 8. Cache in athlete_snapshots (best-effort, non-blocking)
    const db = supabaseAdmin();
    (db as any)
      .from('athlete_snapshots')
      .update({ program_recommendations: result })
      .eq('athlete_id', athleteId)
      .then(({ error: dbErr }: any) => {
        if (dbErr) console.warn(`[DeepProgramRefresh] Cache write failed (non-fatal):`, dbErr.message);
      })
      .catch(() => {});

    const elapsed = Date.now() - startTime;
    return { count: aiPrograms.length, result };
  } catch (err) {
    const elapsed = Date.now() - startTime;
    const message = (err as Error).message;
    console.error(`[DeepProgramRefresh] Failed for ${athleteId} after ${elapsed}ms:`, message);
    return { count: 0, error: message };
  }
}

// ---------------------------------------------------------------------------
// Fire-and-forget wrapper
// ---------------------------------------------------------------------------

export function triggerDeepProgramRefreshAsync(athleteId: string, timezone?: string): void {
  deepProgramRefresh(athleteId, timezone).catch((err) => {
    console.error(`[DeepProgramRefresh] Async trigger failed:`, (err as Error).message);
  });
}

// ---------------------------------------------------------------------------
// Prompt Builder
// ---------------------------------------------------------------------------

function buildDeepProgramPrompt(ctx: PlayerContext, excludedProgramIds: string[] = [], guardrailSummary: string = '', programRuleGuidance: ProgramRuleGuidance | null = null): string {
  const se = ctx.snapshotEnrichment;
  const sections: string[] = [];

  // ── Athlete Profile
  sections.push(`--- ATHLETE PROFILE ---
Name: ${ctx.name}
Sport: ${ctx.sport}
Position: ${ctx.position || 'N/A'}
Age band: ${ctx.ageBand || 'Unknown'}
Gender: ${ctx.gender || 'N/A'}
Height: ${ctx.heightCm ? `${ctx.heightCm}cm` : 'N/A'}
Weight: ${ctx.weightKg ? `${ctx.weightKg}kg` : 'N/A'}
PHV stage: ${se?.phvStage || 'Unknown'}
PHV offset: ${se?.phvOffsetYears != null ? `${se.phvOffsetYears.toFixed(1)} years` : 'N/A'}
Training age: ${se?.trainingAgeWeeks ?? 'N/A'} weeks
Sessions total: ${se?.sessionsTotal ?? 'N/A'}
Streak: ${se?.streakDays ?? ctx.currentStreak} days`);

  // ── Readiness
  sections.push(`--- CURRENT READINESS ---
Readiness: ${ctx.readinessScore || 'No check-in today'}
Readiness score (0-100): ${se?.readinessScore ?? 'N/A'}
Readiness RAG: ${se?.readinessRag ?? 'N/A'}
Components: ${ctx.readinessComponents
    ? `Energy ${ctx.readinessComponents.energy}/10, Soreness ${ctx.readinessComponents.soreness}/10, Sleep ${ctx.readinessComponents.sleepHours}h, Mood ${ctx.readinessComponents.mood}/10`
    : 'No recent check-in'}`);

  // ── Load
  sections.push(`--- LOAD STATE ---
ACWR: ${se?.acwr?.toFixed(2) ?? 'N/A'} (safe: 0.8–1.3)
ATL 7-day: ${se?.atl7day ?? 'N/A'} AU
CTL 28-day: ${se?.ctl28day ?? 'N/A'} AU
Dual-load index: ${se?.dualLoadIndex ?? 'N/A'}/100
Injury risk: ${se?.injuryRiskFlag ?? 'N/A'}`);

  // ── Health
  sections.push(`--- HEALTH ---
HRV today: ${se?.hrvTodayMs ?? 'N/A'}ms (baseline: ${se?.hrvBaselineMs ?? 'N/A'}ms)
Sleep quality: ${se?.sleepQuality ?? 'N/A'}/10
Wellness 7-day avg: ${se?.wellness7dayAvg ?? 'N/A'}
Wellness trend: ${se?.wellnessTrend ?? 'N/A'}`);

  // ── Benchmarks
  sections.push(`--- BENCHMARK PROFILE ---
Overall percentile: ${ctx.benchmarkProfile ? `P${ctx.benchmarkProfile.overallPercentile}` : 'No tests yet'}
Strengths: ${ctx.benchmarkProfile?.strengths.join(', ') || 'N/A'}
Gaps: ${ctx.benchmarkProfile?.gaps.join(', ') || 'N/A'}
Recent tests: ${ctx.recentTestScores.length > 0
    ? ctx.recentTestScores.slice(0, 8).map(t => `${t.testType}: ${t.score} (${t.date})`).join(', ')
    : 'None'}`);

  // ── Performance
  sections.push(`--- PERFORMANCE DATA ---
Mastery scores: ${se?.masteryScores && Object.keys(se.masteryScores).length > 0
    ? Object.entries(se.masteryScores).map(([k, v]) => `${k}: ${v}`).join(', ')
    : 'No mastery data'}
Speed profile: ${se?.speedProfile && Object.keys(se.speedProfile).length > 0
    ? Object.entries(se.speedProfile).map(([k, v]) => `${k}: ${v}`).join(', ')
    : 'No speed data'}
Strength benchmarks: ${se?.strengthBenchmarks && Object.keys(se.strengthBenchmarks).length > 0
    ? Object.entries(se.strengthBenchmarks).map(([k, v]) => `${k}: ${v}`).join(', ')
    : 'No strength data'}`);

  // ── Schedule context
  sections.push(`--- SCHEDULE CONTEXT ---
Day type: ${ctx.temporalContext.dayType}
Match day: ${ctx.temporalContext.isMatchDay ? `YES — ${ctx.temporalContext.matchDetails}` : 'No'}
Exam proximity: ${ctx.temporalContext.isExamProximity ? 'YES' : 'No'}
Active scenario: ${ctx.activeScenario}
Today's events: ${ctx.todayEvents.length > 0
    ? ctx.todayEvents.map(e => `${e.title} (${e.event_type})`).join(', ')
    : 'Nothing scheduled'}`);

  // ── Excluded Programs (user dismissed or completed)
  if (excludedProgramIds.length > 0) {
    sections.push(`--- EXCLUDED PROGRAMS (DO NOT SELECT THESE — user marked as done/not relevant) ---
${excludedProgramIds.join(', ')}`);
  }

  // ── Program Catalog (compact format)
  const catalogLines: string[] = ['--- PROGRAM CATALOG (select from these) ---'];
  for (const p of FOOTBALL_PROGRAMS) {
    const phvNote = p.phv_guidance?.mid_phv?.contraindicated ? ' [CONTRAINDICATED mid-PHV]' : '';
    catalogLines.push(
      `ID: ${p.id} | ${p.name} | ${p.category} | ${p.type} | ${p.difficulty} | ${p.duration_minutes}min | Positions: ${p.position_emphasis.join(',')}${phvNote}`
    );
  }
  sections.push(catalogLines.join('\n'));

  // ── Position Matrix
  const pos = ctx.position || 'ALL';
  const matrix = POSITION_MATRIX.find(m => m.position === pos)
    || POSITION_MATRIX.find(m => m.position === 'ALL')!;
  sections.push(`--- POSITION TRAINING MATRIX (${pos}) ---
Mandatory programs: ${matrix.mandatory_programs.join(', ')}
Recommended programs: ${matrix.recommended_programs.join(', ')}
Weekly structure: ${JSON.stringify(matrix.weekly_structure)}`);

  // ── Guardrails (deterministic rules the AI MUST respect)
  if (guardrailSummary) {
    sections.push(`--- GUARDRAILS (MANDATORY — DO NOT OVERRIDE) ---\n${guardrailSummary}`);
  }

  // ── PD Program Rules (CMS-authored guidelines from Performance Director)
  if (programRuleGuidance && programRuleGuidance.activeRules.length > 0) {
    const pdLines: string[] = ['--- PD PROGRAM RULES (MANDATORY GUIDELINES — Performance Director authored) ---'];
    pdLines.push(`Active rules: ${programRuleGuidance.activeRules.map(r => `${r.name} (P${r.priority}${r.safety_critical ? ', SAFETY-CRITICAL' : ''})`).join(', ')}`);

    if (programRuleGuidance.mandatoryPrograms.length > 0) {
      pdLines.push(`\nMANDATORY PROGRAMS (MUST include these — non-negotiable):`);
      pdLines.push(programRuleGuidance.mandatoryPrograms.join(', '));
    }
    if (programRuleGuidance.highPriorityPrograms.length > 0) {
      pdLines.push(`\nHIGH PRIORITY PROGRAMS (should be included with "high" priority):`);
      pdLines.push(programRuleGuidance.highPriorityPrograms.join(', '));
    }
    if (programRuleGuidance.blockedPrograms.length > 0) {
      pdLines.push(`\nBLOCKED PROGRAMS (DO NOT select these — PD has explicitly blocked them):`);
      pdLines.push(programRuleGuidance.blockedPrograms.join(', '));
    }
    if (programRuleGuidance.prioritizeCategories.length > 0) {
      pdLines.push(`\nPRIORITIZE CATEGORIES: ${programRuleGuidance.prioritizeCategories.join(', ')}`);
    }
    if (programRuleGuidance.blockCategories.length > 0) {
      pdLines.push(`\nBLOCK CATEGORIES (DO NOT select programs from these categories): ${programRuleGuidance.blockCategories.join(', ')}`);
    }

    pdLines.push(`\nPrescription constraints:`);
    if (programRuleGuidance.loadMultiplier < 1.0) {
      pdLines.push(`  Load multiplier: ${programRuleGuidance.loadMultiplier} (apply to all program volumes)`);
    }
    if (programRuleGuidance.intensityCap !== 'full') {
      pdLines.push(`  Intensity cap: ${programRuleGuidance.intensityCap} (no programs above this intensity)`);
    }
    if (programRuleGuidance.sessionCapMinutes) {
      pdLines.push(`  Session cap: ${programRuleGuidance.sessionCapMinutes} minutes max`);
    }
    if (programRuleGuidance.frequencyCap) {
      pdLines.push(`  Frequency cap: ${programRuleGuidance.frequencyCap} sessions/week max`);
    }

    if (programRuleGuidance.aiGuidanceText) {
      pdLines.push(`\nPD GUIDANCE:\n${programRuleGuidance.aiGuidanceText}`);
    }

    if (programRuleGuidance.isSafetyCritical) {
      pdLines.push(`\nSAFETY-CRITICAL RULES ACTIVE -- These rules CANNOT be overridden. Any program that violates safety-critical rules must be excluded regardless of other considerations.`);
    }

    sections.push(pdLines.join('\n'));
  }

  // ── Task
  sections.push(`--- TASK ---
Analyze this athlete's full context and select 8–15 programs from the catalog above.
Personalize priority, impact statements, and reasons using their ACTUAL data.
If readiness is poor or load is high, adjust prescriptions accordingly.
If PHV stage is mid_phv, exclude contraindicated programs and enforce load reductions.
Reference specific numbers (percentiles, test scores, ACWR values) in impact and reason fields.

Respond with ONLY a JSON object. No markdown wrapping.`);

  return sections.join('\n\n');
}
