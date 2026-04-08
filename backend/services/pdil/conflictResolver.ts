/**
 * ════════════════════════════════════════════════════════════════════════════
 * PDIL Conflict Resolver
 * ════════════════════════════════════════════════════════════════════════════
 *
 * When multiple PD protocols fire for the same athlete, their outputs must
 * be merged into a single PDContext. This module defines the conflict
 * resolution strategy for each output domain.
 *
 * ── RESOLUTION PRINCIPLES ──
 *
 * SAFETY ALWAYS WINS. When in doubt, the most restrictive value prevails.
 *
 *   Domain 1 — Training Modifiers:
 *     load_multiplier:    MIN across all protocols (most restrictive)
 *     intensity_cap:      Most restrictive cap (rest < light < moderate < full)
 *     contraindications:  UNION of all blocked exercises
 *     required_elements:  UNION of all mandated exercises
 *     session_cap:        MIN across all caps
 *
 *   Domain 2 — Recommendation Guardrails:
 *     blocked_categories:   UNION of all blocked
 *     mandatory_categories: UNION of all mandated
 *     priority_override:    Highest rank (P0 > P1 > P2 > P3)
 *     override_message:     From highest-priority protocol
 *
 *   Domain 3 — RAG Overrides:
 *     forced_domains:   UNION of all forced
 *     blocked_domains:  UNION of all blocked
 *     condition_tags:   Merged, higher-priority protocol wins on key conflicts
 *
 *   Domain 4 — AI Coaching Context:
 *     system_injection:  Concatenated in priority order (P1 first = highest attention)
 *     safety_critical:   OR across all protocols (if ANY is critical, all is)
 *     model_tier:        Derived from safety_critical
 * ══════════════════════════════════════════════════════════════════════════
 */

import type {
  PDProtocol,
  PDContext,
  ActiveProtocol,
  PDTrainingModifiers,
  PDRecGuardrails,
  PDRagOverrides,
  PDAiContext,
  PDAuditEntry,
  IntensityCap,
  PriorityOverride,
} from './types';
import { DEFAULT_PD_CONTEXT } from './types';
import type { ConditionResult } from './conditionEvaluator';

// ============================================================================
// TYPES
// ============================================================================

/** A protocol that matched, with its evaluation details. */
export interface TriggeredProtocol {
  protocol:         PDProtocol;
  conditionResults: ConditionResult[];
  conditionValues:  Record<string, unknown>;
}


// ============================================================================
// MAIN RESOLVER
// ============================================================================

/**
 * Resolve conflicts across all triggered protocols into a single PDContext.
 *
 * @param triggered - Protocols that matched, already sorted by priority ASC
 * @returns Merged PDContext with all conflicts resolved
 */
export function resolveConflicts(triggered: TriggeredProtocol[]): PDContext {
  if (triggered.length === 0) {
    return {
      ...DEFAULT_PD_CONTEXT,
      evaluatedAt: new Date().toISOString(),
    };
  }

  const protocols = triggered.map(t => t.protocol);

  return {
    activeProtocols:          buildActiveProtocols(protocols),
    highestPriorityProtocol:  buildActiveProtocol(protocols[0]),

    trainingModifiers:  resolveTrainingModifiers(protocols),
    recGuardrails:      resolveRecGuardrails(protocols),
    ragOverrides:       resolveRagOverrides(protocols),
    aiContext:          resolveAiContext(protocols),

    auditTrail:         buildAuditTrail(triggered),
    evaluatedAt:        new Date().toISOString(),
  };
}


// ============================================================================
// DOMAIN 1: TRAINING MODIFIERS
// ============================================================================

/** Intensity cap hierarchy — lower number = more restrictive. */
const INTENSITY_RANK: Record<IntensityCap, number> = {
  rest:     0,
  light:    1,
  moderate: 2,
  full:     3,
};

/**
 * Resolve training modifiers across all triggered protocols.
 * Safety-first: most restrictive value always wins.
 */
function resolveTrainingModifiers(protocols: PDProtocol[]): PDTrainingModifiers {
  // Load multiplier: MIN across all protocols (most restrictive)
  const multipliers = protocols
    .map(p => p.load_multiplier)
    .filter((m): m is number => m !== null && m !== undefined);

  const loadMultiplier = multipliers.length > 0
    ? Math.min(...multipliers)
    : 1.0;

  // Intensity cap: most restrictive (lowest rank)
  const caps = protocols
    .map(p => p.intensity_cap)
    .filter((c): c is IntensityCap => c !== null && c !== undefined);

  const intensityCap: IntensityCap = caps.length > 0
    ? caps.sort((a, b) => INTENSITY_RANK[a] - INTENSITY_RANK[b])[0]
    : 'full';

  // Contraindications: UNION of all blocked exercises
  const contraindications = uniqueArray(
    protocols.flatMap(p => p.contraindications ?? [])
  );

  // Required elements: UNION of all mandated exercises
  const requiredElements = uniqueArray(
    protocols.flatMap(p => p.required_elements ?? [])
  );

  // Session cap: MIN across all caps
  const sessionCaps = protocols
    .map(p => p.session_cap_minutes)
    .filter((c): c is number => c !== null && c !== undefined);

  const sessionCapMinutes = sessionCaps.length > 0
    ? Math.min(...sessionCaps)
    : null;

  return {
    load_multiplier:      loadMultiplier,
    intensity_cap:        intensityCap,
    contraindications,
    required_elements:    requiredElements,
    session_cap_minutes:  sessionCapMinutes,
  };
}


// ============================================================================
// DOMAIN 2: RECOMMENDATION GUARDRAILS
// ============================================================================

/** Priority override hierarchy — P0 is highest authority. */
const PRIORITY_RANK: Record<PriorityOverride, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
};

/**
 * Resolve recommendation guardrails across all triggered protocols.
 */
function resolveRecGuardrails(protocols: PDProtocol[]): PDRecGuardrails {
  // Blocked categories: UNION
  const blockedCategories = uniqueArray(
    protocols.flatMap(p => p.blocked_rec_categories ?? [])
  );

  // Mandatory categories: UNION
  const mandatoryCategories = uniqueArray(
    protocols.flatMap(p => p.mandatory_rec_categories ?? [])
  );

  // Priority override: highest rank (lowest number)
  const overrides = protocols
    .map(p => p.priority_override)
    .filter((o): o is PriorityOverride => o !== null && o !== undefined);

  const priorityOverride: PriorityOverride | null = overrides.length > 0
    ? overrides.sort((a, b) => PRIORITY_RANK[a] - PRIORITY_RANK[b])[0]
    : null;

  // Override message: from highest-priority protocol that has one
  const overrideMessage = protocols
    .map(p => p.override_message)
    .find(m => m !== null && m !== undefined) ?? null;

  return {
    blocked_categories:   blockedCategories,
    mandatory_categories: mandatoryCategories,
    priority_override:    priorityOverride,
    override_message:     overrideMessage,
  };
}


// ============================================================================
// DOMAIN 3: RAG OVERRIDES
// ============================================================================

/**
 * Resolve RAG overrides across all triggered protocols.
 */
function resolveRagOverrides(protocols: PDProtocol[]): PDRagOverrides {
  // Forced domains: UNION
  const forcedDomains = uniqueArray(
    protocols.flatMap(p => p.forced_rag_domains ?? [])
  );

  // Blocked domains: UNION
  const blockedDomains = uniqueArray(
    protocols.flatMap(p => p.blocked_rag_domains ?? [])
  );

  // Condition tags: merge, higher-priority protocol wins on key conflicts
  // Since protocols are sorted by priority ASC (lowest number first),
  // we spread in reverse order so higher-priority tags overwrite lower.
  const conditionTags: Record<string, string> = {};
  for (let i = protocols.length - 1; i >= 0; i--) {
    const tags = protocols[i].rag_condition_tags;
    if (tags) {
      Object.assign(conditionTags, tags);
    }
  }

  return {
    forced_domains:   forcedDomains,
    blocked_domains:  blockedDomains,
    condition_tags:   conditionTags,
  };
}


// ============================================================================
// DOMAIN 4: AI COACHING CONTEXT
// ============================================================================

/**
 * Resolve AI coaching context across all triggered protocols.
 *
 * System injection is concatenated in priority order — the AI model
 * pays highest attention to instructions placed earliest in the prompt.
 * Higher-priority protocols (lower number) are placed first.
 */
function resolveAiContext(protocols: PDProtocol[]): PDAiContext {
  // System injection: concatenate in priority order (already sorted)
  const injections = protocols
    .map(p => p.ai_system_injection)
    .filter((s): s is string => s !== null && s !== undefined && s.trim() !== '');

  const systemInjection = injections.join('\n\n---\n\n');

  // Safety critical: OR across all protocols
  const safetyCritical = protocols.some(p => p.safety_critical);

  return {
    system_injection: systemInjection,
    safety_critical:  safetyCritical,
    model_tier:       safetyCritical ? 'sonnet' : 'haiku',
  };
}


// ============================================================================
// AUDIT TRAIL BUILDER
// ============================================================================

/**
 * Build the audit trail from all triggered protocols.
 * This is the in-memory audit (returned in PDContext).
 * The persistent audit (pd_protocol_audit table) is written separately.
 */
function buildAuditTrail(triggered: TriggeredProtocol[]): PDAuditEntry[] {
  return triggered.map(({ protocol, conditionResults }) => ({
    protocol_id:          protocol.protocol_id,
    protocol_name:        protocol.name,
    category:             protocol.category,
    priority:             protocol.priority,
    triggered_conditions: conditionResults.map(c => ({
      field:    c.field,
      operator: c.operator,
      expected: c.expected,
      actual:   c.actual,
    })),
  }));
}


// ============================================================================
// HELPERS
// ============================================================================

/** Build ActiveProtocol from a PDProtocol. */
function buildActiveProtocol(p: PDProtocol): ActiveProtocol {
  return {
    protocol_id:     p.protocol_id,
    name:            p.name,
    category:        p.category,
    priority:        p.priority,
    safety_critical: p.safety_critical,
  };
}

/** Build ActiveProtocol array from PDProtocol array. */
function buildActiveProtocols(protocols: PDProtocol[]): ActiveProtocol[] {
  return protocols.map(buildActiveProtocol);
}

/** Deduplicate an array preserving order. */
function uniqueArray(arr: string[]): string[] {
  return [...new Set(arr)];
}
