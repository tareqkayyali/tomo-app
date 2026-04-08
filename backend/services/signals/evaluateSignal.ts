/**
 * ════════════════════════════════════════════════════════════════════════════
 * evaluateSignal() — Signal Layer Main Entry Point
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Evaluates all enabled signals against the athlete's current state.
 * Returns the highest-priority matching signal as a display-ready SignalContext.
 *
 * ── CALL FLOW ──
 *
 *   1. Load all enabled signals (cached 5 min, sorted by priority ASC)
 *   2. Evaluate each signal's conditions using PDIL conditionEvaluator
 *   3. First match wins (signals are priority-sorted)
 *   4. Build display-ready SignalContext from matched signal + live data
 *   5. Return SignalContext (or null if no signals match)
 *
 * ── FAIL-SAFE GUARANTEE ──
 *
 * If this function throws, it returns null (no signal).
 * The Dashboard shows a neutral state — never crashes, never shows wrong data.
 * Signal evaluation failure is NOT safety-critical (unlike PDIL).
 *
 * ── PERFORMANCE ──
 *
 * With 8 signals and a warm cache:
 *   - Signal load:          ~0ms (cached)
 *   - Condition eval:       ~1ms (reuses PDIL evaluator)
 *   - Signal build:         ~0.5ms (template interpolation)
 *   - Total blocking:       ~2ms
 *
 * ══════════════════════════════════════════════════════════════════════════
 */

import { evaluateConditions } from '../pdil/conditionEvaluator';
import { loadActiveSignals } from './signalLoader';
import { buildSignalContext } from './signalBuilder';
import type { SignalContext, SignalEvaluationInput } from './types';
import { DEFAULT_SIGNAL_CONTEXT } from './types';


/**
 * Evaluate all signals against the athlete's current state.
 *
 * Called in the boot route AFTER PDIL evaluation. Uses the same input data.
 * Returns the highest-priority matching signal as a display-ready SignalContext.
 *
 * @param input - The athlete's state (same as PDEvaluationInput + extras)
 * @returns SignalContext for Dashboard rendering, or null if no signals match
 *
 * @example
 * ```typescript
 * // In boot route, after PDIL evaluation:
 * const signalContext = await evaluateSignal({
 *   ...pdInput,
 *   recentVitals,
 *   yesterdayVitals,
 *   todaySession,
 *   trainingModifiers: pdContext?.trainingModifiers,
 * });
 * ```
 */
export async function evaluateSignal(
  input: SignalEvaluationInput,
): Promise<SignalContext | null> {
  try {
    // ── Step 1: Load signals (cached, sorted by priority ASC) ──────────
    const signals = await loadActiveSignals();

    if (signals.length === 0) {
      return null;
    }

    // ── Step 2 + 3: Evaluate conditions — first match wins ─────────────
    for (const signal of signals) {
      try {
        const result = evaluateConditions(signal.conditions, input);

        if (result.matched) {
          // ── Step 4: Build display-ready SignalContext ─────────────────
          const context = buildSignalContext(signal, input);

          console.log(
            `[Signal] Matched: ${signal.key} (priority ${signal.priority}) for athlete ${input.snapshot?.athlete_id ?? 'unknown'}`,
          );

          return context;
        }
      } catch (condErr) {
        // A single malformed signal should not crash the entire evaluation.
        console.error(
          `[Signal] Error evaluating signal "${signal.key}" (${signal.signal_id}):`,
          condErr,
        );
      }
    }

    // No signals matched — return null (Dashboard shows neutral state)
    return null;

  } catch (error) {
    // ═══════════════════════════════════════════════════════════════════
    // FAIL-SAFE: If ANYTHING goes wrong, return null.
    // The Dashboard shows a neutral state — never crashes.
    // Signal failure is NOT safety-critical (PDIL handles safety).
    // ═══════════════════════════════════════════════════════════════════
    console.error('[Signal] CRITICAL — evaluation failed, returning null:', error);
    return null;
  }
}
