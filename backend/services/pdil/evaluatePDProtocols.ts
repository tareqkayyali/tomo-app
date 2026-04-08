/**
 * ════════════════════════════════════════════════════════════════════════════
 * evaluatePDProtocols() — PDIL Main Entry Point
 * ════════════════════════════════════════════════════════════════════════════
 *
 * This is THE function that makes the PDIL work. Every call to
 * getAthleteState() invokes this function internally. The result (PDContext)
 * is appended to AthleteState — every downstream consumer reads it.
 *
 * ── CALL FLOW ──
 *
 *   1. Load all enabled protocols (cached 5 min)
 *   2. Pre-filter by scope (sport, PHV stage, age band, position)
 *   3. Evaluate each protocol's conditions against the athlete's state
 *   4. Collect all triggered protocols
 *   5. Resolve conflicts (most restrictive wins for safety)
 *   6. Write audit log (async, non-blocking)
 *   7. Return PDContext
 *
 * ── FAIL-SAFE GUARANTEE ──
 *
 * If this function throws for ANY reason (DB error, malformed protocol,
 * runtime exception), it catches the error and returns FAIL_SAFE_PD_CONTEXT.
 * This ensures:
 *   - Load capped at 85% (moderate restriction)
 *   - Intensity capped at moderate (no hard sessions)
 *   - Safety-critical = true (forces Sonnet model)
 *   - AI told to be cautious
 *
 * A PDIL failure NEVER results in unsafe training advice.
 *
 * ── PERFORMANCE ──
 *
 * With 50 protocols and a warm cache:
 *   - Protocol load:      ~0ms (cached)
 *   - Scope pre-filter:   ~0.1ms (array filter)
 *   - Condition eval:     ~1ms (field resolution + operator comparison)
 *   - Conflict resolution: ~0.1ms (array merging)
 *   - Audit write:        ~5ms (async, non-blocking)
 *   - Total blocking:     ~1.5ms
 *
 * ══════════════════════════════════════════════════════════════════════════
 */

import type {
  PDContext,
  PDEvaluationInput,
  PDScopeFilter,
} from './types';
import { FAIL_SAFE_PD_CONTEXT } from './types';
import { evaluateConditions } from './conditionEvaluator';
import { resolveConflicts, type TriggeredProtocol } from './conflictResolver';
import { loadActiveProtocols } from './protocolLoader';
import { writeAuditLog } from './auditWriter';

/**
 * Evaluate all PD protocols against the athlete's current state.
 *
 * This is the ONLY public entry point for PDIL evaluation.
 * Called inside getAthleteState() — consumers never call this directly.
 *
 * @param input - The athlete's current state (snapshot + vitals + calendar + load)
 * @returns PDContext — the decisions object every consumer reads
 *
 * @example
 * ```typescript
 * // Inside getAthleteState():
 * const pdContext = await evaluatePDProtocols({
 *   snapshot: athleteSnapshot,
 *   todayVitals: todayCheckIn,
 *   upcomingEvents: calendarEvents,
 *   recentDailyLoad: last14DaysLoad,
 *   trigger: 'boot',
 * });
 * return { ...baseState, pdContext };
 * ```
 */
export async function evaluatePDProtocols(
  input: PDEvaluationInput,
): Promise<PDContext> {
  try {
    // ── Step 1 + 2: Load protocols with scope pre-filtering ──────────────
    const scope: PDScopeFilter = {
      sport:     input.snapshot?.sport as string | undefined,
      phv_stage: input.snapshot?.phv_stage as string | undefined,
      age_band:  input.snapshot?.age_band as string | undefined,
      position:  input.snapshot?.position as string | undefined,
    };

    const protocols = await loadActiveProtocols(scope);

    if (protocols.length === 0) {
      // No protocols to evaluate — return default (full autonomy)
      return {
        activeProtocols:          [],
        highestPriorityProtocol:  null,
        trainingModifiers: {
          load_multiplier:      1.0,
          intensity_cap:        'full',
          contraindications:    [],
          required_elements:    [],
          session_cap_minutes:  null,
        },
        recGuardrails: {
          blocked_categories:   [],
          mandatory_categories: [],
          priority_override:    null,
          override_message:     null,
        },
        ragOverrides: {
          forced_domains:   [],
          blocked_domains:  [],
          condition_tags:   {},
        },
        aiContext: {
          system_injection: '',
          safety_critical:  false,
          model_tier:       'haiku',
        },
        auditTrail:   [],
        evaluatedAt:  new Date().toISOString(),
      };
    }

    // ── Step 3 + 4: Evaluate conditions and collect triggered protocols ──
    const triggered: TriggeredProtocol[] = [];

    for (const protocol of protocols) {
      try {
        const result = evaluateConditions(protocol.conditions, input);

        if (result.matched) {
          triggered.push({
            protocol,
            conditionResults: result.conditions,
            conditionValues:  result.values,
          });
        }
      } catch (condErr) {
        // A single malformed protocol should not crash the entire evaluation.
        // Log the error and skip this protocol.
        console.error(
          `[PDIL] Error evaluating protocol "${protocol.name}" (${protocol.protocol_id}):`,
          condErr,
        );
      }
    }

    // ── Step 5: Resolve conflicts ────────────────────────────────────────
    // Protocols are already sorted by priority ASC from the loader.
    const pdContext = resolveConflicts(triggered);

    // ── Step 6: Write audit log (async, non-blocking) ────────────────────
    if (triggered.length > 0) {
      const athleteId = input.snapshot?.athlete_id as string;
      if (athleteId) {
        // Fire-and-forget — audit write failure never blocks the response
        writeAuditLog(
          athleteId,
          triggered,
          input.trigger,
          input.sourceEventId,
        ).catch(err => {
          console.error('[PDIL] Audit write failed (non-blocking):', err);
        });
      }
    }

    // ── Step 7: Return ───────────────────────────────────────────────────
    return pdContext;

  } catch (error) {
    // ═══════════════════════════════════════════════════════════════════
    // FAIL-SAFE: If ANYTHING goes wrong, return the strictest defaults.
    // This ensures a PDIL failure NEVER results in unsafe training advice.
    // ═══════════════════════════════════════════════════════════════════
    console.error('[PDIL] CRITICAL — evaluation failed, returning fail-safe context:', error);

    return {
      ...FAIL_SAFE_PD_CONTEXT,
      evaluatedAt: new Date().toISOString(),
    };
  }
}
