-- ════════════════════════════════════════════════════════════════════════════
-- Migration 096: Pulse Dashboard — CMS rows + ordering cleanup
-- ════════════════════════════════════════════════════════════════════════════
-- Aligns screen-level `dashboard_sections` with the mobile Pulse layout:
--   hero → daily recs → what's next → protocol → sleep → benchmarks →
--   weekly pulse → … existing analytics … → Tomo's take → (end)
--
-- Disables duplicate readiness ring when the hero already shows the score.
-- ════════════════════════════════════════════════════════════════════════════

-- Pulse-specific blocks (panel_key NULL = main Dashboard scroll)
INSERT INTO dashboard_sections (
  section_key, display_name, component_type, sort_order, visibility, config, coaching_text, panel_key
) VALUES
  (
    'pulse_sleep_trend',
    'Sleep · 7 nights',
    'sleep_trend',
    240,
    NULL,
    '{"target_hours": 8.5}'::jsonb,
    NULL,
    NULL
  ),
  (
    'pulse_benchmark_panel',
    'Growth',
    'benchmark_panel',
    260,
    NULL,
    '{}'::jsonb,
    NULL,
    NULL
  ),
  (
    'pulse_weekly_pulse',
    'Week so far',
    'weekly_pulse',
    280,
    NULL,
    '{}'::jsonb,
    NULL,
    NULL
  ),
  (
    'pulse_tomo_take',
    'Tomo''s take',
    'tomo_take',
    9800,
    NULL,
    '{}'::jsonb,
    NULL,
    NULL
  )
ON CONFLICT (section_key) DO NOTHING;

-- “What’s next” sits just after daily recs in the Pulse handoff HTML order
UPDATE dashboard_sections
SET sort_order = 35
WHERE section_key = 'up_next_timeline';

-- Avoid double readiness ring (hero already includes the ring)
UPDATE dashboard_sections
SET is_enabled = false
WHERE section_key = 'readiness_ring';

-- Welcome card overlaps hero messaging for most athletes — off by default
UPDATE dashboard_sections
SET is_enabled = false
WHERE section_key = 'welcome_card';
