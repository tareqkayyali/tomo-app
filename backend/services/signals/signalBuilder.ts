/**
 * ════════════════════════════════════════════════════════════════════════════
 * Signal Builder — Builds display-ready SignalContext from matched signal
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Takes a matched SignalConfig + live athlete data and produces a
 * SignalContext that the Dashboard renders directly. Handles:
 *
 *   1. Template interpolation — {field} → live value
 *   2. Pill generation — from pill_config + resolved metrics
 *   3. Trigger row generation — from trigger_config + resolved metrics
 *   4. Adapted plan — signal override or PDIL training modifiers
 *
 * ── DESIGN PRINCIPLES ──
 *
 *   - PURE: Given the same signal + input, always returns the same output.
 *   - SAFE: Missing template fields resolve to '—' (never crashes).
 *   - CMS-DRIVEN: All text comes from the signal's CMS templates.
 *
 * ══════════════════════════════════════════════════════════════════════════
 */

import { resolveField } from '../pdil/conditionEvaluator';
import type { PDEvaluationInput } from '../pdil/types';
import type {
  SignalConfig,
  SignalContext,
  SignalPill,
  SignalTriggerRow,
  SignalAdaptedPlan,
  SignalEvaluationInput,
  SignalPillConfig,
  SignalTriggerConfig,
} from './types';


/**
 * Build a display-ready SignalContext from a matched signal configuration.
 *
 * @param signal - The matched signal from pd_signals
 * @param input  - The athlete's current state (extends PDEvaluationInput)
 * @returns SignalContext ready for Dashboard rendering
 */
export function buildSignalContext(
  signal: SignalConfig,
  input: SignalEvaluationInput,
): SignalContext {
  // Build template interpolation context from live data
  const templateCtx = buildTemplateContext(input);

  return {
    // Identity
    key:            signal.key,
    displayName:    signal.display_name,
    subtitle:       signal.subtitle,

    // Visual config (pass through from CMS)
    color:          signal.color,
    heroBackground: signal.hero_background,
    arcOpacity:     signal.arc_opacity,
    pillBackground: signal.pill_background,
    barRgba:        signal.bar_rgba,
    coachingColor:  signal.coaching_color,

    // Content (interpolated)
    pills:          buildPills(signal.pill_config, templateCtx),
    coaching:       interpolate(signal.coaching_text, templateCtx),
    triggerRows:    buildTriggerRows(signal.trigger_config, templateCtx, input),
    adaptedPlan:    buildAdaptedPlan(signal, input),

    // Urgency
    showUrgencyBadge: signal.show_urgency_badge,
    urgencyLabel:     signal.urgency_label,

    // Metadata
    signalId:       signal.signal_id,
    priority:       signal.priority,
    evaluatedAt:    new Date().toISOString(),
  };
}


// ============================================================================
// TEMPLATE INTERPOLATION
// ============================================================================

/** Context object for template interpolation. All values as strings. */
type TemplateContext = Record<string, string>;

/**
 * Build a flat key→value map from the athlete's state for template interpolation.
 * Uses the PDIL resolveField() to get live values, plus computed deltas.
 */
function buildTemplateContext(input: SignalEvaluationInput): TemplateContext {
  const ctx: TemplateContext = {};
  const s = input.snapshot;
  const v = input.todayVitals;
  const y = input.yesterdayVitals;

  // ── Direct snapshot fields ──
  setIfPresent(ctx, 'acwr', s?.acwr);
  setIfPresent(ctx, 'atl_7day', s?.atl_7day);
  setIfPresent(ctx, 'ctl_28day', s?.ctl_28day);
  setIfPresent(ctx, 'dual_load_index', s?.dual_load_index);
  setIfPresent(ctx, 'phv_stage', s?.phv_stage);
  setIfPresent(ctx, 'readiness_score', s?.readiness_score ?? v?.readiness_score);
  setIfPresent(ctx, 'readiness_rag', s?.readiness_rag ?? v?.readiness_rag);
  setIfPresent(ctx, 'wellness_7day_avg', s?.wellness_7day_avg);
  setIfPresent(ctx, 'consecutive_red_days', s?.consecutive_red_days);
  setIfPresent(ctx, 'injury_risk_flag', s?.injury_risk_flag);

  // ── CCRS (Cascading Confidence Readiness Score) ──
  // Added April 2026 when ACWR was decommissioned from AI/UX surfaces.
  // Signals now key their narratives off CCRS instead of raw ACWR ratios.
  const sAny = s as unknown as Record<string, unknown> | undefined;
  setIfPresent(ctx, 'ccrs', sAny?.ccrs);
  setIfPresent(ctx, 'ccrs_recommendation', sAny?.ccrs_recommendation);
  setIfPresent(ctx, 'ccrs_confidence', sAny?.ccrs_confidence);
  // Friendly label derived from the recommendation for use in coaching text.
  const ccrsRec = typeof sAny?.ccrs_recommendation === 'string'
    ? (sAny.ccrs_recommendation as string)
    : null;
  if (ccrsRec) {
    const labels: Record<string, string> = {
      full_load: 'full load',
      moderate: 'moderate intensity',
      reduced: 'reduced load',
      recovery: 'recovery',
      blocked: 'recovery only',
    };
    ctx['ccrs_recommendation_label'] = labels[ccrsRec] ?? ccrsRec;
  }

  // ── Daily vitals ──
  setIfPresent(ctx, 'hrv_morning_ms', v?.hrv_morning_ms ?? v?.hrv_ms ?? s?.hrv_today_ms);
  setIfPresent(ctx, 'hrv_baseline_ms', s?.hrv_baseline_ms);
  setIfPresent(ctx, 'sleep_hours', v?.sleep_hours ?? v?.sleep_duration_hours);
  setIfPresent(ctx, 'sleep_quality', v?.sleep_quality);
  setIfPresent(ctx, 'energy', v?.energy);
  setIfPresent(ctx, 'soreness', v?.soreness);
  setIfPresent(ctx, 'mood', v?.mood);

  // ── Computed deltas ──
  const todayHrv = Number(v?.hrv_morning_ms ?? v?.hrv_ms ?? s?.hrv_today_ms);
  const baselineHrv = Number(s?.hrv_baseline_ms);
  if (!isNaN(todayHrv) && !isNaN(baselineHrv) && baselineHrv > 0) {
    const hrvRatio = todayHrv / baselineHrv;
    const hrvDeltaPct = Math.round((hrvRatio - 1) * 100);
    ctx['hrv_ratio'] = hrvRatio.toFixed(2);
    ctx['hrv_delta'] = (hrvDeltaPct >= 0 ? '+' : '') + hrvDeltaPct;
  }

  const todaySleep = Number(v?.sleep_hours ?? v?.sleep_duration_hours);
  const yesterdaySleep = y?.sleep_hours != null ? Number(y.sleep_hours) : NaN;
  if (!isNaN(todaySleep)) {
    ctx['sleep_hours'] = todaySleep.toFixed(1);
    const sleepDelta = todaySleep - 7.5; // vs recommended baseline
    ctx['sleep_delta'] = (sleepDelta >= 0 ? '+' : '') + sleepDelta.toFixed(1);
  }
  if (!isNaN(yesterdaySleep)) {
    ctx['yesterday_sleep_hours'] = yesterdaySleep.toFixed(1);
  }

  // ── Sleep debt (3-day) ──
  if (input.recentVitals && input.recentVitals.length >= 3) {
    const last3 = input.recentVitals.slice(0, 3);
    const sleepDebt = last3.reduce((acc, v) => {
      const hours = v.sleep_hours ?? 7.5;
      return acc + Math.max(0, 7.5 - hours);
    }, 0);
    ctx['sleep_debt_3d'] = sleepDebt.toFixed(1);
  }

  // ── Soreness delta vs yesterday ──
  const todaySoreness = Number(v?.soreness);
  if (!isNaN(todaySoreness) && y?.soreness != null) {
    const sorenessDelta = todaySoreness - Number(y.soreness);
    ctx['soreness_delta'] = (sorenessDelta >= 0 ? '+' : '') + sorenessDelta;
  }

  // ── ACWR zone label ──
  const acwr = Number(s?.acwr);
  if (!isNaN(acwr)) {
    if (acwr < 0.8) ctx['acwr_zone'] = 'Detraining';
    else if (acwr <= 1.3) ctx['acwr_zone'] = 'Sweet Spot';
    else if (acwr <= 1.5) ctx['acwr_zone'] = 'Caution';
    else ctx['acwr_zone'] = 'Danger';
  }

  // ── Calendar fields ──
  const daysToMatch = resolveField('days_to_next_match', input);
  const daysToExam = resolveField('days_to_next_exam', input);
  if (daysToMatch != null) ctx['days_to_next_match'] = String(daysToMatch);
  if (daysToExam != null) ctx['days_to_next_exam'] = String(daysToExam);

  // ── Load multiplier from PDIL ──
  if (input.trainingModifiers) {
    ctx['load_multiplier'] = String(Math.round(input.trainingModifiers.load_multiplier * 100));
    ctx['intensity_cap'] = input.trainingModifiers.intensity_cap;
  }

  return ctx;
}

/**
 * Interpolate {field} placeholders in a template string.
 * Missing fields resolve to '—' (never crashes or leaves {brackets}).
 */
function interpolate(template: string, ctx: TemplateContext): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => ctx[key] ?? '—');
}

/** Set a context key if the value is present and not null. */
function setIfPresent(ctx: TemplateContext, key: string, value: unknown): void {
  if (value != null && value !== undefined) {
    ctx[key] = typeof value === 'number' ? String(Math.round(value * 100) / 100) : String(value);
  }
}


// ============================================================================
// PILL BUILDER
// ============================================================================

/**
 * Build SignalPill[] from the signal's pill_config + template context.
 */
function buildPills(pillConfigs: SignalPillConfig[], ctx: TemplateContext): SignalPill[] {
  if (!Array.isArray(pillConfigs)) return [];

  return pillConfigs.map(pc => ({
    label:    interpolate(pc.label_template, ctx),
    subLabel: interpolate(pc.sub_label, ctx),
  }));
}


// ============================================================================
// TRIGGER ROW BUILDER
// ============================================================================

/**
 * Build SignalTriggerRow[] from the signal's trigger_config + live data.
 */
function buildTriggerRows(
  triggerConfigs: SignalTriggerConfig[],
  ctx: TemplateContext,
  input: SignalEvaluationInput,
): SignalTriggerRow[] {
  if (!Array.isArray(triggerConfigs)) return [];

  return triggerConfigs.map(tc => {
    const rawValue = resolveField(tc.metric as any, input);
    const valueStr = rawValue != null ? String(rawValue) : '—';

    // Add the resolved value to context for template interpolation
    const localCtx: TemplateContext = { ...ctx, value: valueStr };

    // Compute delta for this metric if possible
    const delta = computeDelta(tc.metric, input);
    if (delta !== null) {
      localCtx['delta'] = (delta >= 0 ? '+' : '') + String(Math.round(delta));
    }

    const value = interpolate(tc.value_template, localCtx);
    const baseline = interpolate(tc.baseline_template, localCtx);
    const deltaStr = interpolate(tc.delta_template, localCtx);

    // Determine if the delta is positive (good) based on positive_when config
    const isPositive = delta !== null
      ? (tc.positive_when === 'above' ? delta >= 0 : delta < 0)
      : true; // Default to positive if no delta available

    return {
      metric:     tc.label,
      value,
      baseline,
      delta:      deltaStr,
      isPositive,
    };
  });
}

/**
 * Compute delta percentage for a metric.
 * Returns null if delta cannot be computed.
 */
function computeDelta(metric: string, input: SignalEvaluationInput): number | null {
  const s = input.snapshot;
  const v = input.todayVitals;
  const y = input.yesterdayVitals;

  switch (metric) {
    case 'hrv_morning_ms': {
      const today = Number(v?.hrv_morning_ms ?? v?.hrv_ms ?? s?.hrv_today_ms);
      const baseline = Number(s?.hrv_baseline_ms);
      if (isNaN(today) || isNaN(baseline) || baseline === 0) return null;
      return Math.round(((today / baseline) - 1) * 100);
    }
    case 'sleep_hours': {
      const today = Number(v?.sleep_hours ?? v?.sleep_duration_hours);
      if (isNaN(today)) return null;
      // Delta vs 7.5h recommended baseline
      return Math.round((today - 7.5) * 10) / 10;
    }
    case 'soreness': {
      const today = Number(v?.soreness);
      if (isNaN(today) || y?.soreness == null) return null;
      return today - Number(y.soreness);
    }
    case 'energy': {
      const today = Number(v?.energy);
      if (isNaN(today) || y?.energy == null) return null;
      return today - Number(y.energy);
    }
    case 'mood': {
      const today = Number(v?.mood);
      if (isNaN(today) || y?.mood == null) return null;
      return today - Number(y.mood);
    }
    case 'acwr': {
      // ACWR delta = current - 1.0 (sweet spot center)
      const acwr = Number(s?.acwr);
      if (isNaN(acwr)) return null;
      return Math.round((acwr - 1.0) * 100) / 100;
    }
    default:
      return null;
  }
}


// ============================================================================
// ADAPTED PLAN BUILDER
// ============================================================================

/**
 * Build the adapted plan for today.
 * Priority: signal override > today's session from boot > null
 */
function buildAdaptedPlan(
  signal: SignalConfig,
  input: SignalEvaluationInput,
): SignalAdaptedPlan | null {
  // Signal-level override (e.g., OVERLOADED forces "Recovery Walk / Rest Day")
  if (signal.adapted_plan_name) {
    return {
      sessionName: signal.adapted_plan_name,
      sessionMeta: signal.adapted_plan_meta ?? '',
    };
  }

  // Use today's session from boot data if available
  if (input.todaySession) {
    return {
      sessionName: input.todaySession.sessionName,
      sessionMeta: input.todaySession.sessionMeta,
    };
  }

  return null;
}
