/**
 * ════════════════════════════════════════════════════════════════════════════
 * Load Attribution — CMS Configuration
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Owns the policy that decides when a scheduled calendar event transitions
 * to "actually happened" (completed) vs "missed" (skipped), and therefore
 * whether its load counts toward ATL/CTL/ACWR.
 *
 * Three completion triggers are defined here; the state machine that
 * consumes them lands in a follow-up PR (migration 086 + calendar_events
 * state columns + the confirmation API + mobile UI). In this PR we only
 * ship the config surface and the DEFAULT row so the schema is already
 * in place when the state machine lands.
 *
 * Sequencing rule: `atl_ctl_includes_scheduled` starts TRUE in this PR
 * so behaviour is unchanged (the daily bridge keeps sweeping scheduled
 * events into load as it does today). When PR 6 lands, we flip this
 * flag in the DB to FALSE and the bridge starts filtering on
 * `status='completed'` instead — same row, new value, one admin click.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { z } from 'zod';
import { createConfigLoader } from '@/services/config/configLoader';

// ── Schema ─────────────────────────────────────────────────────────────────

const completionTrigger = z.object({
  enabled:    z.boolean(),
  confidence: z.number().min(0).max(1),
});

export const loadAttributionSchema = z.object({
  completion_triggers: z.object({
    manual_tap: completionTrigger,
    checkin_effort_yesterday: completionTrigger.extend({
      /** effort_yesterday ≥ this value on the next-day check-in auto-confirms. */
      confirm_threshold: z.number().int().min(1).max(10),
      /** effort_yesterday ≤ this value auto-skips. */
      skip_threshold:    z.number().int().min(1).max(10),
    }),
    wearable_match: completionTrigger.extend({
      /** How many minutes before the scheduled start a wearable workout can still match. */
      window_minutes_before: z.number().int().min(0).max(120),
      /** How many minutes after the scheduled end a wearable workout can still match. */
      window_minutes_after:  z.number().int().min(0).max(120),
    }),
  }),

  /**
   * How long after the scheduled end_at before a still-unconfirmed event
   * auto-flips to status='skipped'. 24h by default — teen athletes are
   * expected to confirm via either manual tap, check-in, or wearable
   * within one day.
   */
  auto_skip_hours_after_end: z.number().int().min(1).max(168),

  /** Which event types participate in the state machine. */
  event_types_tracked: z.array(z.string()).min(1),

  /** Scheduled events feed projected_load_7day on the snapshot. */
  projected_load_includes_scheduled: z.boolean(),

  /**
   * Scheduled events feed ATL/CTL/ACWR. TRUE in this PR (current behaviour).
   * Flipped to FALSE when the state-machine PR lands to stop skipped events
   * from polluting the readiness pipeline.
   */
  atl_ctl_includes_scheduled: z.boolean(),

  /**
   * Handler defense: when a SESSION_LOG event arrives with no
   * training_load_au but has intensity + duration, compute AU from the
   * intensity catalog and use that instead of silently writing 0. Fixes
   * the class of bug where calendar bridge / upstream emitters forget
   * to pre-compute load.
   */
  handler_au_fallback_enabled: z.boolean(),
});

export type LoadAttributionConfig = z.infer<typeof loadAttributionSchema>;

// ── DEFAULT ────────────────────────────────────────────────────────────────

export const LOAD_ATTRIBUTION_DEFAULT: LoadAttributionConfig = {
  completion_triggers: {
    manual_tap: {
      enabled:    true,
      confidence: 1.00,
    },
    checkin_effort_yesterday: {
      enabled:           true,
      confidence:        0.70,
      confirm_threshold: 4,
      skip_threshold:    1,
    },
    wearable_match: {
      enabled:             true,
      confidence:          0.85,
      window_minutes_before: 30,
      window_minutes_after:  30,
    },
  },
  auto_skip_hours_after_end: 24,
  event_types_tracked:       ['training', 'match', 'recovery'],

  // Current behaviour — bridge writes scheduled load, ATL/CTL includes it.
  // Flip the second flag to FALSE when the calendar_events status column
  // + mobile completion UX ship.
  projected_load_includes_scheduled: true,
  atl_ctl_includes_scheduled:        true,

  // The handler defense is the one behaviour change this PR actually
  // enables: if payload arrives without pre-computed AU, compute from
  // intensity + duration rather than writing 0.
  handler_au_fallback_enabled: true,
};

// ── Loader ─────────────────────────────────────────────────────────────────

export const getLoadAttributionConfig = createConfigLoader({
  key:     'load_attribution_v1',
  schema:  loadAttributionSchema,
  default: LOAD_ATTRIBUTION_DEFAULT,
});
