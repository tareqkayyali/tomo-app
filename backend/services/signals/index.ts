/**
 * ════════════════════════════════════════════════════════════════════════════
 * SIGNAL LAYER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Extends PDIL with a display-ready signal system for the Dashboard.
 * Sits between the boot endpoint and the Dashboard screen.
 *
 * ── USAGE ──
 *
 *   import { evaluateSignal } from '@/services/signals';
 *
 *   // In boot route, after PDIL evaluation:
 *   const signalContext = await evaluateSignal({
 *     ...pdInput,
 *     recentVitals,
 *     yesterdayVitals,
 *     todaySession,
 *     trainingModifiers: pdContext?.trainingModifiers,
 *   });
 *
 * ── MODULE STRUCTURE ──
 *
 *   signals/
 *   ├── index.ts              ← This file (clean exports)
 *   ├── types.ts              ← SignalContext, SignalConfig, templates
 *   ├── evaluateSignal.ts     ← Main entry point
 *   ├── signalBuilder.ts      ← Template interpolation + display builder
 *   └── signalLoader.ts       ← DB loader with 5-min cache
 *
 * ══════════════════════════════════════════════════════════════════════════
 */

// ── Main entry point ────────────────────────────────────────────────────────
export { evaluateSignal } from './evaluateSignal';

// ── Types ───────────────────────────────────────────────────────────────────
export type {
  // Core output
  SignalContext,
  SignalPill,
  SignalTriggerRow,
  SignalAdaptedPlan,
  SignalArcOpacity,

  // Config (DB row shape)
  SignalConfig,
  SignalPillConfig,
  SignalTriggerConfig,

  // Input
  SignalEvaluationInput,
  RecentVitalEntry,
  YesterdayVitals,
} from './types';

// ── Constants ───────────────────────────────────────────────────────────────
export { DEFAULT_SIGNAL_CONTEXT } from './types';

// ── Cache management ────────────────────────────────────────────────────────
export { clearSignalCache, getSignalCacheStatus } from './signalLoader';
