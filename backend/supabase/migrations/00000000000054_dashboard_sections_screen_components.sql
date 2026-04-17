-- ════════════════════════════════════════════════════════════════════════════
-- Migration 054: Add screen-level dashboard component types
-- ════════════════════════════════════════════════════════════════════════════
--
-- Adds two new component_type values for sections that were previously
-- hardcoded in SignalDashboardScreen and not CMS-controllable:
--
--   daily_recs  — Daily AI recommendation cards (RIE-driven)
--   up_next     — Today's Plan / Up Next timeline with contextual hints
--
-- With this migration, ALL visible sections on the mobile dashboard
-- can be toggled on/off via the CMS admin panel.
-- ════════════════════════════════════════════════════════════════════════════

-- Step 1: Drop the old inline CHECK constraint and recreate with new types
ALTER TABLE dashboard_sections DROP CONSTRAINT IF EXISTS dashboard_sections_component_type_check;

ALTER TABLE dashboard_sections ADD CONSTRAINT dashboard_sections_component_type_check
  CHECK (component_type IN (
    'signal_hero', 'status_ring', 'kpi_row', 'sparkline_row',
    'dual_load', 'benchmark', 'rec_list', 'event_list',
    'growth_card', 'engagement_bar', 'protocol_banner', 'custom_card',
    'daily_recs', 'up_next'
  ));

-- Step 2: Seed the two new screen-level sections

-- Daily Recommendations — rendered between Signal Hero and CMS sections
INSERT INTO dashboard_sections (
  section_key, display_name, component_type, sort_order, visibility, config, coaching_text
) VALUES (
  'daily_recommendations',
  'Daily Recommendations',
  'daily_recs',
  150,
  NULL,
  '{"max_items": 5}',
  NULL
)
ON CONFLICT (section_key) DO NOTHING;

-- Up Next / Today's Plan — rendered after CMS sections
INSERT INTO dashboard_sections (
  section_key, display_name, component_type, sort_order, visibility, config, coaching_text
) VALUES (
  'up_next_timeline',
  'Up Next / Today''s Plan',
  'up_next',
  1100,
  NULL,
  '{"show_adapted_plan": true, "show_hints": true, "show_intensity": true}',
  NULL
)
ON CONFLICT (section_key) DO NOTHING;
