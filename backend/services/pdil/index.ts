/**
 * ════════════════════════════════════════════════════════════════════════════
 * PERFORMANCE DIRECTOR INTELLIGENCE LAYER (PDIL)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Tomo's core IP layer. Sits between the Unified Athlete State and ALL
 * downstream consumers. Every recommendation, coaching response, load
 * decision, and training program flows through PD-authored protocols.
 *
 * ── USAGE ──
 *
 * The PDIL is called INSIDE getAthleteState(). Consumers never call it
 * directly — they read pdContext from AthleteState.
 *
 *   import { evaluatePDProtocols } from '@/services/pdil';
 *
 *   // Inside getAthleteState():
 *   const pdContext = await evaluatePDProtocols({
 *     snapshot:         athleteSnapshot,
 *     todayVitals:      todayCheckIn,
 *     upcomingEvents:   calendarEvents,
 *     recentDailyLoad:  last14DaysLoad,
 *     trigger:          'boot',
 *   });
 *
 * ── CACHE MANAGEMENT ──
 *
 *   import { clearProtocolCache } from '@/services/pdil';
 *
 *   // After CMS save:
 *   await updateProtocol(id, data);
 *   clearProtocolCache();  // Next evaluation reads fresh from DB
 *
 * ── MODULE STRUCTURE ──
 *
 *   pdil/
 *   ├── index.ts                  ← This file (clean exports)
 *   ├── types.ts                  ← PDContext, condition DSL, protocol shape
 *   ├── evaluatePDProtocols.ts    ← Main entry point
 *   ├── conditionEvaluator.ts     ← Field resolver + operator logic
 *   ├── conflictResolver.ts       ← Most-restrictive-wins merge strategy
 *   ├── protocolLoader.ts         ← DB loader with 5-min cache
 *   └── auditWriter.ts            ← Async audit log writer
 *
 * ══════════════════════════════════════════════════════════════════════════
 */

// ── Main entry point ────────────────────────────────────────────────────────
export { evaluatePDProtocols } from './evaluatePDProtocols';

// ── Types ───────────────────────────────────────────────────────────────────
export type {
  // Core output
  PDContext,
  ActiveProtocol,
  PDTrainingModifiers,
  PDRecGuardrails,
  PDRagOverrides,
  PDAiContext,
  PDAuditEntry,

  // Input
  PDEvaluationInput,
  PDScopeFilter,

  // Protocol shape
  PDProtocol,
  PDProtocolCategory,
  IntensityCap,
  PriorityOverride,
  EvidenceGrade,

  // Condition DSL
  PDConditionField,
  PDConditionOperator,
  PDRuleCondition,
  PDRuleConditions,

  // CMS metadata
  PDFieldMetadata,

  // Audit
  PDAuditLogEntry,
} from './types';

// ── Constants ───────────────────────────────────────────────────────────────
export {
  DEFAULT_PD_CONTEXT,
  FAIL_SAFE_PD_CONTEXT,
  PD_FIELD_METADATA,
  PD_OPERATOR_LABELS,
} from './types';

// ── Cache management ────────────────────────────────────────────────────────
export { clearProtocolCache, getProtocolCacheStatus } from './protocolLoader';

// ── Condition evaluator (for CMS test/preview) ──────────────────────────────
export { evaluateConditions, resolveField } from './conditionEvaluator';
export type { EvaluationResult, ConditionResult } from './conditionEvaluator';

// ── Conflict resolver (for CMS preview) ─────────────────────────────────────
export { resolveConflicts } from './conflictResolver';
export type { TriggeredProtocol } from './conflictResolver';
