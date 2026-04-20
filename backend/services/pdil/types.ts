/**
 * ════════════════════════════════════════════════════════════════════════════
 * PERFORMANCE DIRECTOR INTELLIGENCE LAYER (PDIL) — Type Definitions
 * ════════════════════════════════════════════════════════════════════════════
 *
 * The PDIL is Tomo's core IP layer. These types define:
 *
 *   1. PDContext        — The output object every downstream consumer reads.
 *                         Contains training modifiers, rec guardrails, RAG overrides,
 *                         and AI coaching context. Never null — defaults when no
 *                         protocols fire.
 *
 *   2. Condition DSL    — Bounded vocabulary for protocol activation conditions.
 *                         The CMS Protocol Builder renders dropdowns from this type.
 *                         No free-text JSON entry — every field maps to a known
 *                         AthleteState path.
 *
 *   3. PDProtocol       — The database row shape for pd_protocols table.
 *
 *   4. Audit types      — Execution log shapes for pd_protocol_audit.
 *
 * ── KEY PRINCIPLE ─────────────────────────────────────────────────────────
 * The Performance Director's domain expertise is always the baseline.
 * AI operates within PD-defined boundaries — never above or around them.
 * If a protocol says "block barbell back squats", no AI agent, no program
 * recommender, no chat response can suggest barbell back squats.
 * ══════════════════════════════════════════════════════════════════════════
 */

// ============================================================================
// SECTION 1: CONDITION DSL — Bounded Vocabulary
// ============================================================================
//
// Every field the PD can reference in protocol conditions.
// Resolved from AthleteState (snapshot + vitals + calendar) only.
// The evaluator maps each field to an exact data path — no arbitrary access.
//
// WHY BOUNDED: Prevents the CMS from becoming an arbitrary code runner.
// The PD gets maximum flexibility within a safe, validated vocabulary.
// Adding a new condition field requires a one-line addition here + resolver.

/**
 * All fields available for protocol conditions.
 *
 * Each field maps to a specific AthleteState path:
 *   - snapshot.*     → athlete_snapshots table (pre-computed, O(1) read)
 *   - vitals.*       → today's daily vitals (check-in + wearable)
 *   - calendar.*     → upcoming events (matches, exams)
 *   - derived.*      → computed at evaluation time from other fields
 *
 * To add a new field:
 *   1. Add it to this union type
 *   2. Add the resolver in conditionEvaluator.ts → resolveField()
 *   3. The CMS Protocol Builder dropdown auto-updates from this type
 */
export type PDConditionField =
  // ── Snapshot fields (pre-computed, always available) ──
  | 'acwr'                        // Acute:Chronic Workload Ratio (0.0–3.0+)
  | 'atl_7day'                    // Acute Training Load (7-day weighted avg)
  | 'ctl_28day'                   // Chronic Training Load (28-day weighted avg)
  | 'injury_risk_flag'            // 'GREEN' | 'AMBER' | 'RED'
  | 'phv_stage'                   // 'pre' | 'mid' | 'post' | null
  | 'dual_load_index'             // 0–100 (academic + athletic combined)
  | 'training_age_weeks'          // Weeks since athlete started structured training
  | 'streak_length'               // Current consecutive check-in days
  | 'cv_completeness'             // 0–100 (Athletic CV completeness %)
  | 'season_phase'                // 'pre_season' | 'in_season' | 'off_season'
  | 'wellness_7day_avg'           // 1.0–5.0 (7-day rolling wellness average)
  | 'consecutive_red_days'        // Number of consecutive RED readiness days
  | 'ccrs'                        // Cascading Confidence Readiness Score (0–100)
  | 'ccrs_recommendation'         // 'full_load' | 'moderate' | 'reduced' | 'recovery' | 'blocked'
  | 'ccrs_confidence'             // 'very_high' | 'high' | 'medium' | 'low' | 'estimated'

  // ── Daily vitals (today's check-in + wearable data) ──
  | 'readiness_score'             // 0–100 (computed readiness)
  | 'readiness_rag'               // 'GREEN' | 'AMBER' | 'RED'
  | 'hrv_morning_ms'              // Morning HRV in milliseconds
  | 'sleep_hours'                 // Last night's sleep duration
  | 'sleep_quality'               // 0–10 sleep quality score
  | 'energy'                      // 1–5 (self-reported energy)
  | 'soreness'                    // 1–5 (self-reported soreness, 5 = worst)
  | 'mood'                        // 1–5 (self-reported mood)
  | 'pain_flag'                   // true/false (any pain reported)

  // ── Calendar-derived (computed at evaluation time) ──
  | 'days_to_next_match'          // Days until next match/competition (null if none)
  | 'days_to_next_exam'           // Days until next exam (null if none)
  | 'has_match_today'             // true/false
  | 'sessions_today'              // Number of training sessions scheduled today
  | 'days_since_last_session'     // Days since last completed session

  // ── Derived / computed at eval time ──
  | 'hrv_ratio'                   // today_hrv / baseline_hrv (suppression detection)
  | 'load_trend_7d'               // this_week_load / last_week_load
  | 'session_count_7day'          // Number of sessions in last 7 days
  | 'sleep_debt_3d'               // Cumulative deficit: SUM(7.5 - sleep[0..2])

  // ── Academic fields ──
  | 'academic_stress'             // Self-reported academic stress level (1-5)
  | 'has_exam_today'              // Whether there is an exam scheduled today
  | 'study_load_7day';            // Academic study load in the past 7 days (AU)

/**
 * Condition operators.
 * The CMS renders these as human-readable dropdowns:
 *   gt → "is greater than"
 *   gte → "is greater than or equal to"
 *   lt → "is less than"
 *   lte → "is less than or equal to"
 *   eq → "equals"
 *   neq → "does not equal"
 *   in → "is one of"
 *   not_in → "is not one of"
 */
export type PDConditionOperator =
  | 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'neq' | 'in' | 'not_in';

/**
 * A single condition in a protocol rule.
 * e.g. { field: 'acwr', operator: 'gte', value: 1.5 }
 */
export interface PDRuleCondition {
  field:    PDConditionField;
  operator: PDConditionOperator;
  value:    number | string | boolean | (number | string)[];
}

/**
 * The conditions block stored in pd_protocols.conditions JSONB.
 * Supports AND ('all') or OR ('any') logic across conditions.
 *
 * Example:
 *   { match: 'all', conditions: [
 *       { field: 'acwr', operator: 'gte', value: 1.5 },
 *       { field: 'readiness_rag', operator: 'eq', value: 'RED' }
 *   ]}
 *   → Protocol fires when ACWR ≥ 1.5 AND readiness is RED
 */
export interface PDRuleConditions {
  match:      'all' | 'any';
  conditions: PDRuleCondition[];
}


// ============================================================================
// SECTION 2: PROTOCOL — Database Row Shape
// ============================================================================

/** Protocol categories — matches CHECK constraint in pd_protocols table. */
export type PDProtocolCategory =
  | 'safety'
  | 'development'
  | 'recovery'
  | 'performance'
  | 'academic';

/** Intensity cap levels — ordered from most restrictive to least. */
export type IntensityCap = 'rest' | 'light' | 'moderate' | 'full';

/** Recommendation priority override levels. */
export type PriorityOverride = 'P0' | 'P1' | 'P2' | 'P3';

/** Evidence quality grade. */
export type EvidenceGrade = 'A' | 'B' | 'C';

/**
 * A single PD Protocol — maps 1:1 to a pd_protocols table row.
 * This is what the protocol loader returns from the database.
 */
export interface PDProtocol {
  protocol_id:    string;
  name:           string;
  description:    string | null;
  category:       PDProtocolCategory;
  conditions:     PDRuleConditions;
  priority:       number;

  // Output Domain 1: Training Modifiers
  load_multiplier:      number | null;
  intensity_cap:        IntensityCap | null;
  contraindications:    string[] | null;
  required_elements:    string[] | null;
  session_cap_minutes:  number | null;

  // Output Domain 2: Recommendation Guardrails
  blocked_rec_categories:   string[] | null;
  mandatory_rec_categories: string[] | null;
  priority_override:        PriorityOverride | null;
  override_message:         string | null;

  // Output Domain 3: RAG Overrides
  forced_rag_domains:   string[] | null;
  blocked_rag_domains:  string[] | null;
  rag_condition_tags:   Record<string, string> | null;

  // Output Domain 4: AI Coaching Context
  ai_system_injection:  string | null;
  safety_critical:      boolean;

  // Scope Filters
  sport_filter:     string[] | null;
  phv_filter:       string[] | null;
  age_band_filter:  string[] | null;
  position_filter:  string[] | null;

  // Behavior
  is_built_in:      boolean;
  is_enabled:       boolean;
  version:          number;

  // Metadata
  evidence_source:  string | null;
  evidence_grade:   EvidenceGrade | null;
  created_by:       string | null;
  updated_by:       string | null;
  created_at:       string;
  updated_at:       string;
}


// ============================================================================
// SECTION 3: PDContext — The Output Every Consumer Reads
// ============================================================================
//
// PDContext is appended to AthleteState. It is NEVER null — when no protocols
// fire, a default context is returned (full autonomy for AI, no restrictions).
//
// Each consumer reads exactly ONE output domain:
//   - Program recommender → trainingModifiers
//   - RIE computers       → recGuardrails
//   - RAG retriever       → ragOverrides
//   - Chat orchestrator   → aiContext
//   - All consumers       → activeProtocols (for display/audit)

/**
 * An active protocol in the current evaluation.
 * Used for audit display and athlete-facing messaging.
 */
export interface ActiveProtocol {
  protocol_id:     string;
  name:            string;
  category:        PDProtocolCategory;
  priority:        number;
  safety_critical: boolean;
}

/**
 * Training Modifiers — controls what training the athlete can do.
 *
 * Read by: Program recommender, session builder, load calculator.
 *
 * Conflict resolution (when multiple protocols fire):
 *   - load_multiplier:    MIN across all protocols (most restrictive)
 *   - intensity_cap:      Most restrictive cap (rest < light < moderate < full)
 *   - contraindications:  UNION of all blocked exercises
 *   - required_elements:  UNION of all mandated exercises
 *   - session_cap_minutes: MIN across all caps
 */
export interface PDTrainingModifiers {
  load_multiplier:      number;           // 0.0–1.0 (1.0 = no restriction)
  intensity_cap:        IntensityCap;     // 'full' = no restriction
  contraindications:    string[];         // Exercise types blocked
  required_elements:    string[];         // Exercise types mandated
  session_cap_minutes:  number | null;    // Max session duration (null = no cap)
}

/**
 * Recommendation Guardrails — controls what the RIE can generate.
 *
 * Read by: RIE computers, deepRecRefresh, recommendation dispatcher.
 *
 * Conflict resolution:
 *   - blocked_categories:   UNION of all blocked
 *   - mandatory_categories: UNION of all mandated
 *   - priority_override:    Highest rank (P0 > P1 > P2 > P3)
 *   - override_message:     From highest-priority protocol
 */
export interface PDRecGuardrails {
  blocked_categories:   string[];
  mandatory_categories: string[];
  priority_override:    PriorityOverride | null;
  override_message:     string | null;
}

/**
 * RAG Overrides — controls knowledge retrieval for AI coaching.
 *
 * Read by: conditionedRetriever, ragChatRetriever.
 *
 * Conflict resolution:
 *   - forced_domains:   UNION of all forced
 *   - blocked_domains:  UNION of all blocked
 *   - condition_tags:   Merged (higher priority protocol wins on key conflicts)
 */
export interface PDRagOverrides {
  forced_domains:    string[];
  blocked_domains:   string[];
  condition_tags:    Record<string, string>;
}

/**
 * AI Coaching Context — injected into the AI system prompt.
 *
 * Read by: orchestrator.ts, chatAgent, all AI agents.
 *
 * Conflict resolution:
 *   - system_injection:  Concatenated in priority order (P1 → P2 → ...)
 *                        Higher priority = first in prompt = highest attention
 *   - safety_critical:   OR across all protocols (if ANY is critical, all is)
 *   - model_tier:        Derived from safety_critical
 */
export interface PDAiContext {
  system_injection:   string;             // Injected into system prompt
  safety_critical:    boolean;            // Forces Sonnet model
  model_tier:         'sonnet' | 'haiku'; // Resolved from safety_critical
}

/**
 * Audit trail entry — which protocol fired and why.
 * Stored in PDContext for immediate introspection,
 * AND written to pd_protocol_audit for historical queries.
 */
export interface PDAuditEntry {
  protocol_id:           string;
  protocol_name:         string;
  category:              PDProtocolCategory;
  priority:              number;
  triggered_conditions:  {
    field:    string;
    operator: string;
    expected: unknown;    // What the condition required
    actual:   unknown;    // What the athlete's value was
  }[];
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * PDContext — THE OUTPUT. Every consumer reads this. Never null.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * When no protocols fire, returns DEFAULT_PD_CONTEXT (full autonomy).
 * When evaluation throws an error, returns FAIL_SAFE_PD_CONTEXT (strictest).
 *
 * Appended to AthleteState as `state.pdContext`.
 */
export interface PDContext {
  /** Which protocols are currently active for this athlete */
  activeProtocols:          ActiveProtocol[];
  /** The highest-priority (most authoritative) active protocol */
  highestPriorityProtocol:  ActiveProtocol | null;

  /** Domain 1: Training load, intensity, exercise restrictions */
  trainingModifiers:  PDTrainingModifiers;
  /** Domain 2: What the recommendation engine can/must generate */
  recGuardrails:      PDRecGuardrails;
  /** Domain 3: What knowledge chunks RAG should include/exclude */
  ragOverrides:       PDRagOverrides;
  /** Domain 4: System prompt injection + model tier for AI coaching */
  aiContext:          PDAiContext;

  /** Full audit trail of every protocol that fired */
  auditTrail:         PDAuditEntry[];
  /** ISO timestamp of when this evaluation ran */
  evaluatedAt:        string;
}


// ============================================================================
// SECTION 4: DEFAULTS — When Nothing Fires / When Evaluation Fails
// ============================================================================

/**
 * Default PDContext — returned when no protocols match.
 * Full autonomy for AI, no restrictions on training or recommendations.
 */
export const DEFAULT_PD_CONTEXT: PDContext = {
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
    system_injection:   '',
    safety_critical:    false,
    model_tier:         'haiku',
  },

  auditTrail:   [],
  evaluatedAt:  new Date().toISOString(),
};

/**
 * FAIL-SAFE PDContext — returned when evaluatePDProtocols() throws an error.
 *
 * ── NON-NEGOTIABLE PRINCIPLE ──
 * If the PDIL cannot evaluate, we assume the WORST case:
 *   - Load capped at 85% (moderate restriction)
 *   - Intensity capped at moderate (no hard sessions)
 *   - Safety-critical = true (forces Sonnet model)
 *   - AI told to be cautious
 *
 * This ensures that a PDIL failure NEVER results in unsafe training advice.
 * Better to be slightly over-cautious than to miss a safety protocol.
 */
export const FAIL_SAFE_PD_CONTEXT: PDContext = {
  activeProtocols:          [],
  highestPriorityProtocol:  null,

  trainingModifiers: {
    load_multiplier:      0.85,
    intensity_cap:        'moderate',
    contraindications:    [],
    required_elements:    [],
    session_cap_minutes:  null,
  },

  recGuardrails: {
    blocked_categories:   [],
    mandatory_categories: ['recovery'],
    priority_override:    null,
    override_message:     null,
  },

  ragOverrides: {
    forced_domains:   [],
    blocked_domains:  [],
    condition_tags:   {},
  },

  aiContext: {
    system_injection: 'PDIL evaluation failed — exercise caution. Do not recommend high-intensity training until the athlete state is fully evaluated.',
    safety_critical:  true,
    model_tier:       'sonnet',
  },

  auditTrail:   [],
  evaluatedAt:  new Date().toISOString(),
};


// ============================================================================
// SECTION 5: EVALUATION INPUT — What evaluatePDProtocols() receives
// ============================================================================

/**
 * The input to evaluatePDProtocols().
 *
 * Contains the athlete's current state (facts only, no opinions)
 * plus metadata about what triggered this evaluation.
 */
export interface PDEvaluationInput {
  /** The athlete's snapshot (pre-computed Layer 2 state) */
  snapshot: Record<string, unknown>;

  /** Today's vitals (check-in + wearable data), if available */
  todayVitals: Record<string, unknown> | null;

  /** Upcoming events for calendar-derived fields */
  upcomingEvents: Array<{ event_type: string; start_at: string; [key: string]: unknown }>;

  /** Recent daily load entries for trend computation */
  recentDailyLoad: Array<{ load_date: string; training_load_au?: number; academic_load_au?: number; total_load?: number; [key: string]: unknown }>;

  /** What triggered this evaluation */
  trigger: 'boot' | 'chat' | 'event' | 'screen' | 'test' | 'refresh';

  /** If triggered by an event, the event ID for audit correlation */
  sourceEventId?: string;
}


// ============================================================================
// SECTION 6: PROTOCOL LOADER TYPES
// ============================================================================

/**
 * Scope filter for pre-filtering protocols before condition evaluation.
 * Passed to the protocol loader to narrow down which protocols to evaluate.
 */
export interface PDScopeFilter {
  sport?:     string;
  phv_stage?: string;
  age_band?:  string;
  position?:  string;
}


// ============================================================================
// SECTION 7: AUDIT TYPES
// ============================================================================

/**
 * Audit log entry written to pd_protocol_audit table.
 */
export interface PDAuditLogEntry {
  athlete_id:       string;
  protocol_id:      string;
  condition_values: Record<string, unknown>;
  context_applied:  Record<string, unknown>;
  resolution_rank:  number;
  was_overridden:   boolean;
  overridden_by:    string | null;
  source_trigger:   string;
  source_event_id:  string | null;
}


// ============================================================================
// SECTION 8: CMS ADMIN TYPES
// ============================================================================

/**
 * Human-readable metadata for each condition field.
 * Used by the CMS Protocol Builder to render dropdowns with descriptions.
 */
export interface PDFieldMetadata {
  field:       PDConditionField;
  label:       string;            // "ACWR (Acute:Chronic Workload Ratio)"
  description: string;            // "Ratio of recent load to long-term load..."
  type:        'number' | 'string' | 'boolean';
  unit?:       string;            // "ms", "hours", "%", "days"
  range?:      { min: number; max: number };
  options?:    string[];          // For enum fields: ['GREEN','AMBER','RED']
}

/**
 * Complete field metadata registry — the CMS reads this to build the
 * Protocol Builder form. Adding a field to PDConditionField automatically
 * requires adding it here (compile error otherwise — by design).
 */
export const PD_FIELD_METADATA: Record<PDConditionField, PDFieldMetadata> = {
  // Snapshot fields
  acwr:                   { field: 'acwr', label: 'ACWR', description: 'Acute:Chronic Workload Ratio — training load spike indicator', type: 'number', range: { min: 0, max: 3 } },
  atl_7day:               { field: 'atl_7day', label: 'Acute Training Load (7d)', description: '7-day exponentially weighted training load', type: 'number', unit: 'AU' },
  ctl_28day:              { field: 'ctl_28day', label: 'Chronic Training Load (28d)', description: '28-day exponentially weighted training load', type: 'number', unit: 'AU' },
  injury_risk_flag:       { field: 'injury_risk_flag', label: 'Injury Risk Flag', description: 'Computed injury risk level', type: 'string', options: ['GREEN', 'AMBER', 'RED'] },
  phv_stage:              { field: 'phv_stage', label: 'PHV Stage', description: 'Peak Height Velocity growth phase', type: 'string', options: ['pre', 'mid', 'post'] },
  dual_load_index:        { field: 'dual_load_index', label: 'Dual Load Index', description: 'Combined academic + athletic load (0–100)', type: 'number', unit: '%', range: { min: 0, max: 100 } },
  training_age_weeks:     { field: 'training_age_weeks', label: 'Training Age', description: 'Weeks since structured training began', type: 'number', unit: 'weeks' },
  streak_length:          { field: 'streak_length', label: 'Streak Length', description: 'Consecutive check-in days', type: 'number', unit: 'days' },
  cv_completeness:        { field: 'cv_completeness', label: 'CV Completeness', description: 'Athletic CV completion percentage', type: 'number', unit: '%', range: { min: 0, max: 100 } },
  season_phase:           { field: 'season_phase', label: 'Season Phase', description: 'Current phase of the competitive season', type: 'string', options: ['pre_season', 'in_season', 'off_season'] },
  wellness_7day_avg:      { field: 'wellness_7day_avg', label: 'Wellness 7-Day Avg', description: 'Rolling 7-day average wellness score', type: 'number', range: { min: 1, max: 5 } },
  consecutive_red_days:   { field: 'consecutive_red_days', label: 'Consecutive RED Days', description: 'Number of consecutive RED readiness days', type: 'number', unit: 'days' },
  ccrs:                   { field: 'ccrs', label: 'CCRS Score', description: 'Cascading Confidence Readiness Score (0–100)', type: 'number', range: { min: 0, max: 100 } },
  ccrs_recommendation:    { field: 'ccrs_recommendation', label: 'CCRS Recommendation', description: 'Authoritative readiness recommendation derived from CCRS', type: 'string', options: ['full_load', 'moderate', 'reduced', 'recovery', 'blocked'] },
  ccrs_confidence:        { field: 'ccrs_confidence', label: 'CCRS Confidence', description: 'Confidence tier for the CCRS score (data freshness)', type: 'string', options: ['very_high', 'high', 'medium', 'low', 'estimated'] },

  // Daily vitals
  readiness_score:        { field: 'readiness_score', label: 'Readiness Score', description: 'Computed readiness (0–100)', type: 'number', range: { min: 0, max: 100 } },
  readiness_rag:          { field: 'readiness_rag', label: 'Readiness RAG', description: 'RED/AMBER/GREEN readiness status', type: 'string', options: ['GREEN', 'AMBER', 'RED'] },
  hrv_morning_ms:         { field: 'hrv_morning_ms', label: 'Morning HRV', description: 'Heart rate variability (morning reading)', type: 'number', unit: 'ms' },
  sleep_hours:            { field: 'sleep_hours', label: 'Sleep Hours', description: 'Last night total sleep duration', type: 'number', unit: 'hours' },
  sleep_quality:          { field: 'sleep_quality', label: 'Sleep Quality', description: 'Sleep quality score (0–10)', type: 'number', range: { min: 0, max: 10 } },
  energy:                 { field: 'energy', label: 'Energy Level', description: 'Self-reported energy (1–5)', type: 'number', range: { min: 1, max: 5 } },
  soreness:               { field: 'soreness', label: 'Soreness Level', description: 'Self-reported soreness (1=none, 5=severe)', type: 'number', range: { min: 1, max: 5 } },
  mood:                   { field: 'mood', label: 'Mood', description: 'Self-reported mood (1–5)', type: 'number', range: { min: 1, max: 5 } },
  pain_flag:              { field: 'pain_flag', label: 'Pain Reported', description: 'Whether the athlete reported pain today', type: 'boolean' },

  // Calendar-derived
  days_to_next_match:     { field: 'days_to_next_match', label: 'Days to Next Match', description: 'Days until next match/competition', type: 'number', unit: 'days' },
  days_to_next_exam:      { field: 'days_to_next_exam', label: 'Days to Next Exam', description: 'Days until next exam', type: 'number', unit: 'days' },
  has_match_today:        { field: 'has_match_today', label: 'Match Today', description: 'Whether there is a match scheduled today', type: 'boolean' },
  sessions_today:         { field: 'sessions_today', label: 'Sessions Today', description: 'Number of training sessions scheduled today', type: 'number' },
  days_since_last_session: { field: 'days_since_last_session', label: 'Days Since Last Session', description: 'Days since last completed training session', type: 'number', unit: 'days' },

  // Derived / computed
  hrv_ratio:              { field: 'hrv_ratio', label: 'HRV Ratio', description: 'Today HRV / baseline HRV (below 1.0 = suppressed)', type: 'number', range: { min: 0, max: 2 } },
  load_trend_7d:          { field: 'load_trend_7d', label: 'Load Trend (7d)', description: 'This week load / last week load', type: 'number' },
  session_count_7day:     { field: 'session_count_7day', label: 'Sessions (7d)', description: 'Number of training sessions in last 7 days', type: 'number' },
  sleep_debt_3d:          { field: 'sleep_debt_3d', label: 'Sleep Debt (3d)', description: 'Cumulative sleep deficit over last 3 days (hours below 7.5)', type: 'number', unit: 'hours' },

  // Academic fields
  academic_stress:        { field: 'academic_stress', label: 'Academic Stress', description: 'Self-reported academic stress level (1-5)', type: 'number', range: { min: 1, max: 5 } },
  has_exam_today:         { field: 'has_exam_today', label: 'Exam Today', description: 'Whether there is an exam scheduled today', type: 'boolean' },
  study_load_7day:        { field: 'study_load_7day', label: 'Study Load (7-day)', description: 'Academic study load in the past 7 days', type: 'number', unit: 'AU' },
};

/**
 * Human-readable labels for condition operators.
 * The CMS Protocol Builder renders these in dropdown menus.
 */
export const PD_OPERATOR_LABELS: Record<PDConditionOperator, string> = {
  gt:      'is greater than',
  gte:     'is greater than or equal to',
  lt:      'is less than',
  lte:     'is less than or equal to',
  eq:      'equals',
  neq:     'does not equal',
  in:      'is one of',
  not_in:  'is not one of',
};
