/**
 * ════════════════════════════════════════════════════════════════════════════
 * Signal Loader — methodology-resolver backed (Phase 7)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Hard cutover: legacy `pd_signals` table is no longer read at runtime.
 * The `signal_definition` directives in the live methodology snapshot
 * are the only source. The Phase 7.0a migration seeded the snapshot
 * with the equivalent of every legacy row, so behaviour is preserved
 * on flip day.
 *
 * Cache lives inside `services/instructions/resolver` (60s TTL); this
 * module just adapts the resolver output to the existing SignalConfig
 * shape so `evaluateSignal` doesn't change.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { resolveInstructions } from '@/services/instructions/resolver';
import type { SignalConfig } from './types';

/** Returns enabled signals sorted by priority ASC. */
export async function loadActiveSignals(): Promise<SignalConfig[]> {
  const set = await resolveInstructions({ audience: 'athlete' });
  const directives = set.byType('signal_definition');

  const out: SignalConfig[] = [];
  for (const d of directives) {
    const p = d.payload as Record<string, any>;
    if (p.is_enabled === false) continue;
    out.push({
      signal_id:          d.id,
      key:                String(p.signal_key ?? ''),
      display_name:       String(p.display_name ?? ''),
      subtitle:           String(p.subtitle ?? ''),
      conditions:         (p.conditions as any) ?? { match: 'all', conditions: [] },
      priority:           typeof p.priority === 'number' ? p.priority : d.priority,
      color:              String(p.color ?? ''),
      hero_background:    String(p.hero_background ?? ''),
      arc_opacity:        (p.arc_opacity as any) ?? { default: 1 },
      pill_background:    String(p.pill_background ?? ''),
      bar_rgba:           String(p.bar_rgba ?? ''),
      coaching_color:     String(p.coaching_color ?? ''),
      coaching_text:      String(p.coaching_text_template ?? p.coaching_text ?? ''),
      pill_config:        (p.pill_config as any) ?? [],
      trigger_config:     (p.trigger_config as any) ?? [],
      adapted_plan_name:  (p.adapted_plan_name as string | null) ?? null,
      adapted_plan_meta:  typeof p.adapted_plan_meta === 'string'
                            ? (p.adapted_plan_meta as string)
                            : (p.adapted_plan_meta && typeof p.adapted_plan_meta === 'object'
                                && typeof (p.adapted_plan_meta as any).raw === 'string'
                                ? (p.adapted_plan_meta as any).raw as string
                                : null),
      show_urgency_badge: Boolean(p.show_urgency_badge),
      urgency_label:      (p.urgency_label as string | null) ?? null,
      is_built_in:        false,
      is_enabled:         p.is_enabled !== false,
      created_at:         (d.updated_at as string | null) ?? new Date().toISOString(),
      updated_at:         (d.updated_at as string | null) ?? new Date().toISOString(),
    });
  }

  // Already priority-sorted by `byType`, but be defensive.
  out.sort((a, b) => a.priority - b.priority);
  return out;
}

/** Phase 7: signal cache lives inside the resolver. Kept as a no-op so
 *  callers (CMS admin pages) compile without changes. */
export function clearSignalCache(): void {
  // No-op since Phase 7
}

export function getSignalCacheStatus(): { cached: boolean; age_ms: number; count: number } {
  return { cached: false, age_ms: 0, count: 0 };
}
