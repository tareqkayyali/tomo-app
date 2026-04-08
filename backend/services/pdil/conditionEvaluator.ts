/**
 * ════════════════════════════════════════════════════════════════════════════
 * PDIL Condition Evaluator
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Evaluates protocol conditions against the athlete's current state.
 * Two responsibilities:
 *
 *   1. FIELD RESOLVER — Maps each PDConditionField to an actual value
 *      from the athlete's snapshot, vitals, calendar, or derived computation.
 *
 *   2. OPERATOR EVALUATOR — Applies the condition operator (gt, gte, eq, etc.)
 *      to compare the resolved value against the condition's target value.
 *
 * ── DESIGN PRINCIPLES ──
 *
 *   - BOUNDED: Only fields in PDConditionField are resolvable. Arbitrary
 *     field access is impossible — the CMS cannot become a code runner.
 *
 *   - NULL-SAFE: If a field cannot be resolved (missing data), the condition
 *     evaluates to FALSE. Protocols never fire on missing data — fail safe.
 *
 *   - PURE: No side effects. Given the same input, always returns the same
 *     result. Easy to test, easy to audit, easy to reason about.
 *
 *   - AUDITABLE: Returns the actual resolved values alongside match results,
 *     so the audit trail shows exactly what the athlete's values were.
 *
 * ── ADDING A NEW FIELD ──
 *
 *   1. Add the field to PDConditionField in types.ts
 *   2. Add a case to resolveField() below
 *   3. Add metadata to PD_FIELD_METADATA in types.ts
 *   4. The CMS dropdown auto-updates — no frontend changes needed
 * ══════════════════════════════════════════════════════════════════════════
 */

import type {
  PDConditionField,
  PDConditionOperator,
  PDRuleCondition,
  PDRuleConditions,
  PDEvaluationInput,
} from './types';

// ============================================================================
// TYPES
// ============================================================================

/** Result of evaluating a single condition. */
export interface ConditionResult {
  field:    PDConditionField;
  operator: PDConditionOperator;
  expected: unknown;
  actual:   unknown;
  matched:  boolean;
}

/** Result of evaluating all conditions in a protocol. */
export interface EvaluationResult {
  matched:     boolean;
  conditions:  ConditionResult[];
  /** Map of field → actual value (for audit log) */
  values:      Record<string, unknown>;
}


// ============================================================================
// FIELD RESOLVER
// ============================================================================
//
// Maps each PDConditionField to an actual value from the evaluation input.
// Returns undefined if the field cannot be resolved (missing data).
//
// The input structure:
//   - input.snapshot       → athlete_snapshots row (Layer 2)
//   - input.todayVitals    → today's vitals (check-in + wearable)
//   - input.upcomingEvents → calendar events for the next N days
//   - input.recentDailyLoad → last 14 days of daily load entries

/**
 * Resolve a condition field to its actual value from the athlete's state.
 *
 * @param field - The field to resolve (bounded to PDConditionField)
 * @param input - The athlete's current state data
 * @returns The resolved value, or undefined if unavailable
 */
export function resolveField(
  field: PDConditionField,
  input: PDEvaluationInput,
): unknown {
  const s = input.snapshot;        // Shorthand for snapshot
  const v = input.todayVitals;     // Shorthand for today's vitals
  const events = input.upcomingEvents;
  const loads = input.recentDailyLoad;

  switch (field) {
    // ── Snapshot fields ──────────────────────────────────────────────────
    case 'acwr':                  return s?.acwr ?? undefined;
    case 'atl_7day':              return s?.atl_7day ?? undefined;
    case 'ctl_28day':             return s?.ctl_28day ?? undefined;
    case 'injury_risk_flag':      return s?.injury_risk_flag ?? undefined;
    case 'phv_stage':             return s?.phv_stage ?? undefined;
    case 'dual_load_index':       return s?.dual_load_index ?? undefined;
    case 'training_age_weeks':    return s?.training_age_weeks ?? undefined;
    case 'streak_length':         return s?.streak_length ?? s?.streak_days ?? undefined;
    case 'cv_completeness':       return s?.cv_completeness ?? undefined;
    case 'season_phase':          return s?.season_phase ?? undefined;
    case 'wellness_7day_avg':     return s?.wellness_7day_avg ?? undefined;
    case 'consecutive_red_days':  return s?.consecutive_red_days ?? undefined;

    // ── Daily vitals (today's check-in + wearable) ───────────────────────
    case 'readiness_score':       return v?.readiness_score ?? s?.readiness_score ?? undefined;
    case 'readiness_rag':         return v?.readiness_rag ?? s?.readiness_rag ?? undefined;
    case 'hrv_morning_ms':        return v?.hrv_morning_ms ?? v?.hrv_ms ?? s?.hrv_today_ms ?? undefined;
    case 'sleep_hours':           return v?.sleep_hours ?? v?.sleep_duration_hours ?? undefined;
    case 'sleep_quality':         return v?.sleep_quality ?? v?.sleep_quality_score ?? undefined;
    case 'energy':                return v?.energy ?? undefined;
    case 'soreness':              return v?.soreness ?? undefined;
    case 'mood':                  return v?.mood ?? undefined;
    case 'pain_flag':             return v?.pain_flag ?? false;

    // ── Calendar-derived fields ──────────────────────────────────────────
    case 'days_to_next_match':
      return computeDaysToNextEventType(events, ['COMPETITION_RESULT', 'match', 'MATCH']);

    case 'days_to_next_exam':
      return computeDaysToNextEventType(events, ['ACADEMIC_EVENT', 'exam', 'EXAM']);

    case 'has_match_today':
      return hasEventToday(events, ['COMPETITION_RESULT', 'match', 'MATCH']);

    case 'sessions_today':
      return countEventsToday(events, ['SESSION_LOG', 'training', 'TRAINING']);

    case 'days_since_last_session': {
      const lastSession = s?.last_session_at as string | null;
      if (!lastSession) return undefined;
      return Math.floor((Date.now() - new Date(lastSession).getTime()) / 86400000);
    }

    // ── Derived / computed at evaluation time ────────────────────────────
    case 'hrv_ratio': {
      const todayHrv = (v?.hrv_morning_ms ?? v?.hrv_ms ?? s?.hrv_today_ms) as number | undefined;
      const baselineHrv = s?.hrv_baseline_ms as number | undefined;
      if (todayHrv == null || baselineHrv == null || baselineHrv === 0) return undefined;
      return Math.round((todayHrv / baselineHrv) * 100) / 100;
    }

    case 'load_trend_7d': {
      if (!loads || loads.length < 7) return undefined;
      const now = new Date();
      const thisWeekLoad = sumLoadInRange(loads, daysAgo(now, 7), now);
      const lastWeekLoad = sumLoadInRange(loads, daysAgo(now, 14), daysAgo(now, 7));
      if (lastWeekLoad === 0) return undefined;
      return Math.round((thisWeekLoad / lastWeekLoad) * 100) / 100;
    }

    case 'session_count_7day':
      return s?.session_count_7day ?? countRecentSessions(loads, 7);

    case 'sleep_debt_3d': {
      // This would ideally come from 3 days of daily vitals
      // For now, compute from snapshot if available
      return s?.sleep_debt_3d ?? undefined;
    }

    // ── Academic fields ─────────────────────────────────────────────────
    case 'academic_stress':
      return v?.academic_stress ?? s?.academic_stress ?? undefined;

    case 'has_exam_today':
      return hasEventToday(events, ['ACADEMIC_EVENT', 'exam', 'EXAM']);

    case 'study_load_7day': {
      // Sum academic load from the last 7 days of daily load entries
      if (s?.study_load_7day != null) return s.study_load_7day;
      if (!loads || loads.length === 0) return undefined;
      const cutoff = daysAgo(new Date(), 7);
      return loads
        .filter(l => new Date(l.load_date) >= cutoff)
        .reduce((sum, l) => sum + (l.academic_load_au || 0), 0) || undefined;
    }

    default:
      // TypeScript exhaustiveness check — if a new field is added to
      // PDConditionField but not handled here, this will be a compile error.
      const _exhaustive: never = field;
      console.warn(`[PDIL] Unknown condition field: ${_exhaustive}`);
      return undefined;
  }
}


// ============================================================================
// OPERATOR EVALUATOR
// ============================================================================

/**
 * Evaluate a single operator comparison.
 *
 * @param actual   - The athlete's actual field value (resolved)
 * @param operator - The comparison operator
 * @param expected - The condition's target value
 * @returns true if the condition matches
 */
export function evaluateOperator(
  actual: unknown,
  operator: PDConditionOperator,
  expected: unknown,
): boolean {
  // NULL-SAFE: If the actual value is null/undefined, the condition
  // does NOT match. Protocols never fire on missing data.
  if (actual === null || actual === undefined) return false;

  switch (operator) {
    case 'gt':
      return typeof actual === 'number' && typeof expected === 'number' && actual > expected;

    case 'gte':
      return typeof actual === 'number' && typeof expected === 'number' && actual >= expected;

    case 'lt':
      return typeof actual === 'number' && typeof expected === 'number' && actual < expected;

    case 'lte':
      return typeof actual === 'number' && typeof expected === 'number' && actual <= expected;

    case 'eq':
      // Support both strict equality and loose comparison for booleans
      if (typeof actual === 'boolean' || typeof expected === 'boolean') {
        return actual === expected || String(actual) === String(expected);
      }
      return actual === expected;

    case 'neq':
      if (typeof actual === 'boolean' || typeof expected === 'boolean') {
        return actual !== expected && String(actual) !== String(expected);
      }
      return actual !== expected;

    case 'in':
      if (!Array.isArray(expected)) return false;
      return expected.includes(actual);

    case 'not_in':
      if (!Array.isArray(expected)) return true;
      return !expected.includes(actual);

    default:
      console.warn(`[PDIL] Unknown operator: ${operator}`);
      return false;
  }
}


// ============================================================================
// CONDITION SET EVALUATOR
// ============================================================================

/**
 * Evaluate a full set of conditions against the athlete's state.
 *
 * @param conditions - The protocol's condition set (with match mode)
 * @param input      - The athlete's current state
 * @returns EvaluationResult with match status, individual condition results, and values
 */
export function evaluateConditions(
  conditions: PDRuleConditions,
  input: PDEvaluationInput,
): EvaluationResult {
  if (!conditions.conditions || conditions.conditions.length === 0) {
    // No conditions = always matches (useful for universal protocols)
    return { matched: true, conditions: [], values: {} };
  }

  const results: ConditionResult[] = [];
  const values: Record<string, unknown> = {};

  for (const condition of conditions.conditions) {
    const actual = resolveField(condition.field, input);
    const matched = evaluateOperator(actual, condition.operator, condition.value);

    values[condition.field] = actual;
    results.push({
      field:    condition.field,
      operator: condition.operator,
      expected: condition.value,
      actual,
      matched,
    });
  }

  // Apply match mode: 'all' = AND logic, 'any' = OR logic
  const overallMatch = conditions.match === 'all'
    ? results.every(r => r.matched)
    : results.some(r => r.matched);

  return {
    matched:    overallMatch,
    conditions: results,
    values,
  };
}


// ============================================================================
// HELPER FUNCTIONS — Calendar & Load Computations
// ============================================================================

/**
 * Compute days until the next event of a specific type.
 * Returns undefined if no matching events found.
 */
function computeDaysToNextEventType(
  events: PDEvaluationInput['upcomingEvents'],
  types: string[],
): number | undefined {
  if (!events || events.length === 0) return undefined;

  const now = Date.now();
  const typesLower = types.map(t => t.toLowerCase());

  let minDays: number | undefined;

  for (const event of events) {
    const eventType = (event.event_type || event.type || '').toString().toLowerCase();
    const category = (event.category || '').toString().toLowerCase();

    if (typesLower.includes(eventType) || typesLower.includes(category)) {
      const startAt = new Date(event.start_at).getTime();
      if (startAt > now) {
        const days = Math.ceil((startAt - now) / 86400000);
        if (minDays === undefined || days < minDays) {
          minDays = days;
        }
      }
    }
  }

  return minDays;
}

/**
 * Check if there's an event of a specific type today.
 */
function hasEventToday(
  events: PDEvaluationInput['upcomingEvents'],
  types: string[],
): boolean {
  if (!events || events.length === 0) return false;

  const today = new Date().toISOString().split('T')[0];
  const typesLower = types.map(t => t.toLowerCase());

  return events.some(e => {
    const eventType = (e.event_type || e.type || '').toString().toLowerCase();
    const category = (e.category || '').toString().toLowerCase();
    const eventDate = e.start_at?.split('T')[0];
    return (typesLower.includes(eventType) || typesLower.includes(category))
      && eventDate === today;
  });
}

/**
 * Count events of a specific type scheduled for today.
 */
function countEventsToday(
  events: PDEvaluationInput['upcomingEvents'],
  types: string[],
): number {
  if (!events || events.length === 0) return 0;

  const today = new Date().toISOString().split('T')[0];
  const typesLower = types.map(t => t.toLowerCase());

  return events.filter(e => {
    const eventType = (e.event_type || e.type || '').toString().toLowerCase();
    const category = (e.category || '').toString().toLowerCase();
    const eventDate = e.start_at?.split('T')[0];
    return (typesLower.includes(eventType) || typesLower.includes(category))
      && eventDate === today;
  }).length;
}

/**
 * Sum training load within a date range from daily load entries.
 */
function sumLoadInRange(
  loads: PDEvaluationInput['recentDailyLoad'],
  from: Date,
  to: Date,
): number {
  return loads
    .filter(l => {
      const d = new Date(l.load_date);
      return d >= from && d < to;
    })
    .reduce((sum, l) => sum + (l.total_load || l.training_load_au || 0), 0);
}

/**
 * Count sessions in the last N days from daily load entries.
 */
function countRecentSessions(
  loads: PDEvaluationInput['recentDailyLoad'],
  days: number,
): number {
  const cutoff = daysAgo(new Date(), days);
  return loads.filter(l => new Date(l.load_date) >= cutoff && (l.total_load || l.training_load_au || 0) > 0).length;
}

/** Helper: Date N days ago. */
function daysAgo(from: Date, days: number): Date {
  const d = new Date(from);
  d.setDate(d.getDate() - days);
  return d;
}
