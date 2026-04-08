/**
 * ════════════════════════════════════════════════════════════════════════════
 * PDIL Audit Writer
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Writes protocol activation records to pd_protocol_audit.
 * Called asynchronously (fire-and-forget) after evaluation completes.
 *
 * ── DESIGN PRINCIPLES ──
 *
 *   - NON-BLOCKING: Audit writes never slow down the evaluation path.
 *     If the write fails, we log the error but don't throw.
 *
 *   - COMPLETE: Every field value that triggered a protocol is captured.
 *     The PD can see exactly what the athlete's state was when a protocol fired.
 *
 *   - CORRELATABLE: Each audit entry includes the source trigger (boot, chat,
 *     event, etc.) and optional event ID for cross-referencing with
 *     athlete_events.
 *
 *   - BATCH: All audit entries for a single evaluation are inserted in one
 *     batch operation (single DB round-trip).
 * ══════════════════════════════════════════════════════════════════════════
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import type { PDAuditLogEntry, PDProtocol } from './types';
import type { TriggeredProtocol } from './conflictResolver';

/**
 * Write audit log entries for all triggered protocols.
 *
 * @param athleteId  - The athlete being evaluated
 * @param triggered  - All protocols that matched (with condition values)
 * @param trigger    - What caused this evaluation
 * @param eventId    - Optional source event ID (for event-triggered evaluations)
 */
export async function writeAuditLog(
  athleteId: string,
  triggered: TriggeredProtocol[],
  trigger: string,
  eventId?: string,
): Promise<void> {
  if (triggered.length === 0) return;

  try {
    const db = supabaseAdmin();

    const entries: PDAuditLogEntry[] = triggered.map((t, index) => ({
      athlete_id:       athleteId,
      protocol_id:      t.protocol.protocol_id,
      condition_values: t.conditionValues,
      context_applied:  buildContextApplied(t.protocol as unknown as Record<string, unknown>),
      resolution_rank:  index + 1,      // 1 = highest priority (first in array)
      was_overridden:   false,           // TODO: detect per-domain overrides
      overridden_by:    null,
      source_trigger:   trigger,
      source_event_id:  eventId ?? null,
    }));

    const { error } = await (db as any)
      .from('pd_protocol_audit')
      .insert(entries);

    if (error) {
      console.error('[PDIL Audit] Write failed:', error.message);
    }
  } catch (err) {
    // Non-blocking — log and move on. Audit failure never blocks evaluation.
    console.error('[PDIL Audit] Unexpected error:', err);
  }
}

/**
 * Build a summary of what this protocol contributed to the PDContext.
 * Stored in context_applied for historical reconstruction.
 */
function buildContextApplied(protocol: Record<string, unknown>): Record<string, unknown> {
  const applied: Record<string, unknown> = {};

  // Domain 1
  if (protocol.load_multiplier != null) applied.load_multiplier = protocol.load_multiplier;
  if (protocol.intensity_cap) applied.intensity_cap = protocol.intensity_cap;
  if ((protocol.contraindications as string[] | undefined)?.length) applied.contraindications = protocol.contraindications;
  if ((protocol.required_elements as string[] | undefined)?.length) applied.required_elements = protocol.required_elements;
  if (protocol.session_cap_minutes != null) applied.session_cap_minutes = protocol.session_cap_minutes;

  // Domain 2
  if ((protocol.blocked_rec_categories as string[] | null)?.length) applied.blocked_rec_categories = protocol.blocked_rec_categories;
  if ((protocol.mandatory_rec_categories as string[] | null)?.length) applied.mandatory_rec_categories = protocol.mandatory_rec_categories;
  if (protocol.priority_override) applied.priority_override = protocol.priority_override;
  if (protocol.override_message) applied.override_message = protocol.override_message;

  // Domain 3
  if ((protocol.forced_rag_domains as string[] | null)?.length) applied.forced_rag_domains = protocol.forced_rag_domains;
  if ((protocol.blocked_rag_domains as string[] | null)?.length) applied.blocked_rag_domains = protocol.blocked_rag_domains;

  // Domain 4
  if (protocol.ai_system_injection) applied.ai_system_injection = '(present)';
  if (protocol.safety_critical) applied.safety_critical = true;

  return applied;
}
