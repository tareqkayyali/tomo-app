/**
 * ════════════════════════════════════════════════════════════════════════════
 * Notification — CMS Configuration
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Scope note: only `session_confirmation` is defined in this PR. Later
 * PRs will add `checkin_reminder`, `program_milestone`, etc. under the
 * same schema version so the admin UI and cron scaffolding build up
 * without breaking forward-compatibility.
 *
 * The cron that consumes this config ships in the completion state-machine
 * PR that follows. Shipping the config surface first means ops already has
 * a CMS row to tune before the cron starts firing notifications.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { z } from 'zod';
import { createConfigLoader } from '@/services/config/configLoader';

// ── Sub-schemas ────────────────────────────────────────────────────────────

const timeOfDay = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, {
  message: "time must be HH:MM in 24-hour format",
});

const quietHours = z.object({
  start: timeOfDay,
  end:   timeOfDay,
});

const notificationTemplate = z.object({
  title:          z.string().min(1).max(120),
  body:           z.string().min(1).max(300),
  action_buttons: z.array(z.string().min(1).max(40)).min(0).max(4),
});

const sessionConfirmation = z.object({
  enabled:         z.boolean(),

  /** Local-time HH:MM to fire the end-of-day confirmation push. */
  push_time_local: timeOfDay,

  /**
   * When to surface the home-screen chip on Dashboard — separate from
   * push, shows only when at least one event is still unconfirmed.
   */
  home_chip_time_local: timeOfDay,

  /** Whether to render the "Yesterday's training" inline section on the check-in screen. */
  checkin_inline_enabled: z.boolean(),

  /** Anti-nag ceiling: maximum session-confirmation nudges per athlete per day. */
  max_nudges_per_day: z.number().int().min(0).max(5),

  /** Local-time window inside which NO pushes fire, regardless of schedule. */
  quiet_hours: quietHours,

  /** Suppress the push on match days to avoid distracting an athlete on competition day. */
  suppress_on_match_days: z.boolean(),

  /** Suppress on exam days for the same reason. */
  suppress_on_exam_days: z.boolean(),

  /** Don't double-nudge if the athlete already submitted a check-in today. */
  suppress_if_checkin_submitted: z.boolean(),

  /** If a wearable auto-confirmed the session within this many hours, skip the push. */
  suppress_if_wearable_confirmed_within_hours: z.number().int().min(0).max(48),

  /** Push template. `{session_title}` substitutes the event title. */
  template: notificationTemplate,

  /** URL scheme template. `{event_id}` substitutes the calendar_events.id. */
  deeplink: z.string().min(1).max(200),
});

// ── Main schema ────────────────────────────────────────────────────────────

export const notificationConfigSchema = z.object({
  session_confirmation: sessionConfirmation,
});

export type NotificationConfig = z.infer<typeof notificationConfigSchema>;

// ── DEFAULT ────────────────────────────────────────────────────────────────

export const NOTIFICATION_CONFIG_DEFAULT: NotificationConfig = {
  session_confirmation: {
    enabled:              true,
    push_time_local:      "18:00",
    home_chip_time_local: "21:00",
    checkin_inline_enabled: true,
    max_nudges_per_day:   1,
    quiet_hours:          { start: "22:00", end: "07:00" },
    suppress_on_match_days: true,
    suppress_on_exam_days:  true,
    suppress_if_checkin_submitted:               true,
    suppress_if_wearable_confirmed_within_hours: 6,
    template: {
      title:          "Did you complete {session_title}?",
      body:           "Tap to confirm or mark as skipped.",
      action_buttons: ["Done", "Skipped", "Edit"],
    },
    deeplink: "tomo://calendar/event/{event_id}?action=confirm",
  },
};

// ── Loader ─────────────────────────────────────────────────────────────────

export const getNotificationConfig = createConfigLoader({
  key:     'notification_config_v1',
  schema:  notificationConfigSchema,
  default: NOTIFICATION_CONFIG_DEFAULT,
});
