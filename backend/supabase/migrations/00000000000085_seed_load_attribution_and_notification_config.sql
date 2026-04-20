-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 085 — Seed load_attribution_v1 + notification_config_v1
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Pairs with PR 4 of the config-engine plan. Only two DEFAULT rows land
-- here; the completion state-machine schema (calendar_events.status,
-- completed_at, effective_intensity, …) and the notification cron are
-- queued for follow-up PRs.
--
-- load_attribution_v1:
--   - atl_ctl_includes_scheduled = TRUE intentionally — we do NOT change
--     ATL/CTL behaviour in this PR. The bridge continues sweeping
--     scheduled events as it does today. When the state-machine PR
--     lands, ops (or the migration) flips this flag to FALSE and the
--     bridge starts filtering on status='completed'.
--   - handler_au_fallback_enabled = TRUE is the one live behaviour
--     change PR 4 enables: sessionHandler now computes AU from
--     intensity + duration when payload.training_load_au is null,
--     instead of silently writing 0.
--
-- notification_config_v1:
--   - session_confirmation populated with DEFAULT cron settings. The
--     cron job itself doesn't exist yet, so this row is dormant until
--     the next PR lands. Shipping it early lets ops tune the schedule
--     (push_time_local, quiet_hours, suppression rules) before the
--     cron starts firing notifications.
--
-- Idempotent: ON CONFLICT DO NOTHING on both inserts.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO system_config (
  config_key,
  payload,
  schema_version,
  rollout_percentage,
  sport_filter,
  enabled,
  change_reason
) VALUES (
  'load_attribution_v1',
  '{
    "completion_triggers": {
      "manual_tap":               {"enabled": true, "confidence": 1.00},
      "checkin_effort_yesterday": {"enabled": true, "confidence": 0.70, "confirm_threshold": 4, "skip_threshold": 1},
      "wearable_match":           {"enabled": true, "confidence": 0.85, "window_minutes_before": 30, "window_minutes_after": 30}
    },
    "auto_skip_hours_after_end": 24,
    "event_types_tracked": ["training", "match", "recovery"],
    "projected_load_includes_scheduled": true,
    "atl_ctl_includes_scheduled": true,
    "handler_au_fallback_enabled": true
  }'::jsonb,
  1,
  100,
  NULL,
  TRUE,
  'seed: migration 085 — load attribution defaults (handler AU fallback enabled, state machine disabled)'
)
ON CONFLICT (config_key) DO NOTHING;


INSERT INTO system_config (
  config_key,
  payload,
  schema_version,
  rollout_percentage,
  sport_filter,
  enabled,
  change_reason
) VALUES (
  'notification_config_v1',
  '{
    "session_confirmation": {
      "enabled": true,
      "push_time_local": "18:00",
      "home_chip_time_local": "21:00",
      "checkin_inline_enabled": true,
      "max_nudges_per_day": 1,
      "quiet_hours": {"start": "22:00", "end": "07:00"},
      "suppress_on_match_days": true,
      "suppress_on_exam_days": true,
      "suppress_if_checkin_submitted": true,
      "suppress_if_wearable_confirmed_within_hours": 6,
      "template": {
        "title": "Did you complete {session_title}?",
        "body": "Tap to confirm or mark as skipped.",
        "action_buttons": ["Done", "Skipped", "Edit"]
      },
      "deeplink": "tomo://calendar/event/{event_id}?action=confirm"
    }
  }'::jsonb,
  1,
  100,
  NULL,
  TRUE,
  'seed: migration 085 — notification config defaults (cron not yet enabled)'
)
ON CONFLICT (config_key) DO NOTHING;
