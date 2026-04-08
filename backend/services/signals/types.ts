/**
 * ════════════════════════════════════════════════════════════════════════════
 * SIGNAL LAYER — Type Definitions
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Extends PDIL with a display-ready signal system for the Dashboard.
 * The Signal Layer is a pure renderer — the PD controls every signal name,
 * threshold, coaching message, and plan adaptation via CMS.
 *
 * ── KEY PRINCIPLE ─────────────────────────────────────────────────────────
 * Zero decision-making on the client. The Dashboard receives a SignalContext
 * from the server and renders it. The PD authors all signals, conditions,
 * colors, and coaching text through the CMS.
 * ══════════════════════════════════════════════════════════════════════════
 */

import type { PDRuleConditions, PDEvaluationInput } from '../pdil/types';


// ============================================================================
// SECTION 1: SIGNAL CONTEXT — The Output the Dashboard Renders
// ============================================================================

/**
 * A pill displayed in the SignalHero section.
 * e.g. { label: 'HRV +10%', subLabel: 'above baseline' }
 */
export interface SignalPill {
  label:    string;
  subLabel: string;
}

/**
 * A row in the "What triggered this signal" section.
 * Shows the metric, current value, baseline, and delta.
 */
export interface SignalTriggerRow {
  metric:     string;           // 'HRV', 'Sleep', 'ACWR'
  value:      string;           // '68ms', '5.2h', '1.62'
  baseline:   string;           // 'baseline 62ms'
  delta:      string;           // '+10%', '-1.3h', '+0.32'
  isPositive: boolean;          // Green = positive, Red = negative
}

/**
 * The adapted plan card for today.
 * Uses PDIL trainingModifiers + signal-specific overrides.
 */
export interface SignalAdaptedPlan {
  sessionName:  string;         // 'Upper Body Strength' or 'Recovery Walk / Rest Day'
  sessionMeta:  string;         // 'Week 4 · 4×5 @ 78% 1RM · ~45 min'
}

/**
 * Arc opacity configuration for the SignalArcIcon SVG.
 * Each arc has an opacity value (0.0 – 1.0).
 */
export interface SignalArcOpacity {
  large:  number;
  medium: number;
  small:  number;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * SignalContext — THE OUTPUT. The Dashboard renders this directly. Never null
 * when a signal matches — null means no signal conditions met (show default).
 * ════════════════════════════════════════════════════════════════════════════
 */
export interface SignalContext {
  /** Signal identity */
  key:            string;         // 'PRIMED', 'OVERLOADED', etc.
  displayName:    string;         // 'PRIMED', 'DUAL LOAD', 'PHV GATE'
  subtitle:       string;         // 'Peak performance window'

  /** Visual config (CMS-editable) */
  color:          string;         // '#7a9b76' — primary signal color
  heroBackground: string;         // '#101C14' — hero section background
  arcOpacity:     SignalArcOpacity;
  pillBackground: string;         // 'rgba(122,155,118,0.12)'
  barRgba:        string;         // 'rgba(122,155,118,0.5)'
  coachingColor:  string;         // '#567A5C'

  /** Content (interpolated from CMS templates + live data) */
  pills:          SignalPill[];
  coaching:       string;         // Interpolated coaching text
  triggerRows:    SignalTriggerRow[];
  adaptedPlan:    SignalAdaptedPlan | null;

  /** Urgency */
  showUrgencyBadge: boolean;
  urgencyLabel:     string | null;  // 'safety active'

  /** Metadata */
  signalId:       string;         // UUID from pd_signals
  priority:       number;         // Lower = higher priority
  evaluatedAt:    string;         // ISO timestamp
}


// ============================================================================
// SECTION 2: SIGNAL CONFIG — Database Row Shape (pd_signals table)
// ============================================================================

/**
 * A signal definition from the pd_signals table.
 * CMS-managed: the PD can edit conditions, colors, coaching text,
 * pill config, trigger config, and plan overrides.
 */
export interface SignalConfig {
  signal_id:       string;

  // Identity
  key:             string;        // 'PRIMED', 'OVERLOADED', etc.
  display_name:    string;
  subtitle:        string;

  // Conditions (same DSL as PDIL)
  conditions:      PDRuleConditions;

  // Priority (lower = checked first = wins if multiple match)
  priority:        number;

  // Visual config
  color:           string;
  hero_background: string;
  arc_opacity:     SignalArcOpacity;
  pill_background: string;
  bar_rgba:        string;
  coaching_color:  string;

  // Content templates (support {field} interpolation)
  coaching_text:   string;
  pill_config:     SignalPillConfig[];
  trigger_config:  SignalTriggerConfig[];

  // Plan adaptation overrides (null = use PDIL trainingModifiers defaults)
  adapted_plan_name: string | null;
  adapted_plan_meta: string | null;

  // Urgency
  show_urgency_badge: boolean;
  urgency_label:      string | null;

  // Behavior
  is_built_in:     boolean;
  is_enabled:      boolean;

  // Metadata
  created_at:      string;
  updated_at:      string;
}


// ============================================================================
// SECTION 3: PILL & TRIGGER CONFIG — CMS Templates
// ============================================================================

/**
 * Configuration for a single pill in a signal.
 * Stored as JSONB in pd_signals.pill_config.
 *
 * Example:
 *   { metric: 'hrv_ratio', label_template: 'HRV {delta}%', sub_label: 'above baseline' }
 */
export interface SignalPillConfig {
  metric:          string;        // PDConditionField or derived metric name
  label_template:  string;        // 'HRV {delta}%' — supports {field} interpolation
  sub_label:       string;        // Static sub-label text
}

/**
 * Configuration for a trigger row in a signal.
 * Stored as JSONB in pd_signals.trigger_config.
 *
 * Example:
 *   { metric: 'hrv_morning_ms', label: 'HRV', value_template: '{value}ms',
 *     baseline_template: 'baseline {hrv_baseline_ms}ms', delta_template: '{delta}%',
 *     positive_when: 'above' }
 */
export interface SignalTriggerConfig {
  metric:             string;     // PDConditionField for value resolution
  label:              string;     // Display label: 'HRV', 'Sleep', 'ACWR'
  value_template:     string;     // '{value}ms'
  baseline_template:  string;     // 'baseline {hrv_baseline_ms}ms'
  delta_template:     string;     // '{delta}%'
  positive_when:      'above' | 'below';  // 'above' = higher is better, 'below' = lower is better
}


// ============================================================================
// SECTION 4: EVALUATION INPUT — Extends PDEvaluationInput
// ============================================================================

/**
 * Input to evaluateSignal(). Extends PDIL's input with boot-specific data
 * that the signal builder needs for template interpolation.
 */
export interface SignalEvaluationInput extends PDEvaluationInput {
  /** Recent vitals (last 7 days) for sparklines and trend calculations */
  recentVitals?: RecentVitalEntry[];

  /** Yesterday's vitals for delta calculations */
  yesterdayVitals?: YesterdayVitals | null;

  /** Today's active training session (from boot), for adapted plan display */
  todaySession?: {
    sessionName: string;
    sessionMeta: string;
  } | null;

  /** PDIL training modifiers — used for plan adaptation context */
  trainingModifiers?: {
    load_multiplier: number;
    intensity_cap: string;
  } | null;
}

/**
 * A single day's vitals entry (for 7-day history).
 * Sent to the frontend for sparklines and trends.
 */
export interface RecentVitalEntry {
  date:            string;        // 'YYYY-MM-DD'
  sleep_hours:     number | null;
  hrv_morning_ms:  number | null;
  energy:          number | null;
  soreness:        number | null;
  mood:            number | null;
  readiness_score?: number | null;
}

/**
 * Yesterday's vitals for delta calculations in trigger rows.
 */
export interface YesterdayVitals {
  readiness_score:  number | null;
  soreness:         number | null;
  hrv_morning_ms:   number | null;
  sleep_hours:      number | null;
  energy:           number | null;
  mood:             number | null;
}


// ============================================================================
// SECTION 5: DEFAULTS
// ============================================================================

/**
 * Default SignalContext — returned when no signals match.
 * The Dashboard shows a neutral "BASELINE" state.
 */
export const DEFAULT_SIGNAL_CONTEXT: SignalContext = {
  key:            'BASELINE',
  displayName:    'BASELINE',
  subtitle:       'No active signals',
  color:          '#8E8E93',
  heroBackground: '#0A0A0A',
  arcOpacity:     { large: 0.3, medium: 0.3, small: 0.3 },
  pillBackground: 'rgba(142,142,147,0.12)',
  barRgba:        'rgba(142,142,147,0.5)',
  coachingColor:  '#8E8E93',
  pills:          [],
  coaching:       'Check in to activate your daily signal.',
  triggerRows:    [],
  adaptedPlan:    null,
  showUrgencyBadge: false,
  urgencyLabel:   null,
  signalId:       'default',
  priority:       999,
  evaluatedAt:    new Date().toISOString(),
};
