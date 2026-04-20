-- ════════════════════════════════════════════════════════════════════════════
-- Reset Dashboard Sections to Canonical Layout
-- ════════════════════════════════════════════════════════════════════════════
--
-- Resets the `dashboard_sections` table to the 14 canonical sections that the
-- mobile SignalDashboardScreen renderer supports. Matches the component
-- registry in mobile/src/components/dashboard/sections/DashboardSectionRenderer.tsx.
--
-- Screen-level sections (handled directly by SignalDashboardScreen):
--   signal_hero, daily_recs, up_next
--
-- CMS-driven sections (rendered by DashboardSectionRenderer):
--   status_ring, kpi_row, sparkline_row, dual_load, benchmark,
--   rec_list, event_list, growth_card, engagement_bar, protocol_banner,
--   custom_card
--
-- USAGE:
--   1. Backup current rows (optional but recommended):
--        SELECT * FROM dashboard_sections;   -- copy to clipboard first
--   2. Paste this entire script into Supabase SQL Editor
--   3. Run
--   4. Reload the mobile app (shake → Reload)
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── Step 1: Wipe existing rows ───────────────────────────────────────────
-- Removes every current dashboard_section row, including any custom entries,
-- so the table ends in a known state.
DELETE FROM dashboard_sections;

-- ─── Step 2: Re-seed the 14 canonical sections ────────────────────────────
-- Sort order reserved in 50–100 increments so admins can slot new custom
-- sections between canonical entries without re-shuffling.

-- 10 · Custom Welcome Card (optional — disable per-user via is_active if you want)
INSERT INTO dashboard_sections (
  section_key, display_name, component_type, sort_order,
  visibility, config, coaching_text
) VALUES (
  'welcome_card', 'Welcome', 'custom_card', 10,
  NULL,
  '{"headline_template": "Hey {first_name}", "body_template": "Your readiness is {readiness_score}. {coaching_summary}", "cta_label": null, "cta_route": null}'::jsonb,
  NULL
);

-- 50 · Active Protocol banner (visibility-gated: only when has_active_protocol)
INSERT INTO dashboard_sections (
  section_key, display_name, component_type, sort_order,
  visibility, config, coaching_text
) VALUES (
  'active_protocol', 'Active Protocol', 'protocol_banner', 50,
  '{"match": "all", "conditions": [{"field": "has_active_protocol", "operator": "eq", "value": true}]}'::jsonb,
  '{"show_severity": true, "show_actions": true}'::jsonb,
  NULL
);

-- 100 · Signal Hero (screen-level — renders the MODE card)
INSERT INTO dashboard_sections (
  section_key, display_name, component_type, sort_order,
  visibility, config, coaching_text
) VALUES (
  'signal_hero', 'Readiness Signal', 'signal_hero', 100,
  NULL,
  '{"show_adapted_plan": true, "show_urgency_badge": true}'::jsonb,
  NULL
);

-- 150 · Daily Recommendations (screen-level — TODAY · FOR YOU cards)
INSERT INTO dashboard_sections (
  section_key, display_name, component_type, sort_order,
  visibility, config, coaching_text
) VALUES (
  'daily_recommendations', 'Daily Recommendations', 'daily_recs', 150,
  NULL,
  '{"max_items": 5}'::jsonb,
  NULL
);

-- 200 · Status Ring (Readiness 73 circular)
INSERT INTO dashboard_sections (
  section_key, display_name, component_type, sort_order,
  visibility, config, coaching_text
) VALUES (
  'readiness_ring', 'Readiness Score', 'status_ring', 200,
  NULL,
  '{"metric": "readiness_score", "max_value": 100, "label": "Readiness", "show_trend": true}'::jsonb,
  NULL
);

-- 300 · KPI Row (Sleep / Soreness / Energy / Mood tiles)
INSERT INTO dashboard_sections (
  section_key, display_name, component_type, sort_order,
  visibility, config, coaching_text
) VALUES (
  'core_vitals', 'Core Vitals', 'kpi_row', 300,
  NULL,
  '{"chips": [{"metric": "sleep_hours", "label": "Sleep", "unit": "h", "target": 8, "positive_when": "above"}, {"metric": "soreness", "label": "Soreness", "unit": "/5", "target": 2, "positive_when": "below"}, {"metric": "energy", "label": "Energy", "unit": "/5", "target": 4, "positive_when": "above"}, {"metric": "mood", "label": "Mood", "unit": "/5", "target": 4, "positive_when": "above"}]}'::jsonb,
  NULL
);

-- 400 · Sparkline Row (Weekly Trends — 7-day sparklines)
INSERT INTO dashboard_sections (
  section_key, display_name, component_type, sort_order,
  visibility, config, coaching_text
) VALUES (
  'weekly_trends', 'Weekly Trends', 'sparkline_row', 400,
  NULL,
  '{"metrics": ["readiness_score", "sleep_hours", "hrv_morning_ms"], "days": 7, "show_delta": true}'::jsonb,
  NULL
);

-- 500 · Dual Load Index (visibility-gated: only when dual_load_index > 0)
INSERT INTO dashboard_sections (
  section_key, display_name, component_type, sort_order,
  visibility, config, coaching_text
) VALUES (
  'dual_load', 'Dual Load Index', 'dual_load', 500,
  '{"match": "all", "conditions": [{"field": "dual_load_index", "operator": "gt", "value": 0}]}'::jsonb,
  '{"show_exam_countdown": true, "show_study_hours": true}'::jsonb,
  'Balancing training and academics — {dual_load_index}% combined load.'
);

-- 600 · Benchmark Progress (Sprint / Agility percentile ranks)
INSERT INTO dashboard_sections (
  section_key, display_name, component_type, sort_order,
  visibility, config, coaching_text
) VALUES (
  'benchmark_gaps', 'Benchmark Progress', 'benchmark', 600,
  NULL,
  '{"max_items": 4, "show_percentile": true, "sort_by": "gap_desc"}'::jsonb,
  NULL
);

-- 700 · AI Recommendations (deep RIE list)
INSERT INTO dashboard_sections (
  section_key, display_name, component_type, sort_order,
  visibility, config, coaching_text
) VALUES (
  'ai_recommendations', 'AI Recommendations', 'rec_list', 700,
  NULL,
  '{"max_items": 3, "priority_filter": ["P1", "P2"], "show_reasoning": true}'::jsonb,
  NULL
);

-- 800 · Upcoming Events (compact event list)
INSERT INTO dashboard_sections (
  section_key, display_name, component_type, sort_order,
  visibility, config, coaching_text
) VALUES (
  'upcoming_events', 'Upcoming Events', 'event_list', 800,
  NULL,
  '{"max_items": 5, "days_ahead": 7, "show_type_icon": true}'::jsonb,
  NULL
);

-- 900 · Growth Tracking (visibility-gated: only when phv_stage != 'none')
INSERT INTO dashboard_sections (
  section_key, display_name, component_type, sort_order,
  visibility, config, coaching_text
) VALUES (
  'growth_tracking', 'Growth Tracking', 'growth_card', 900,
  '{"match": "all", "conditions": [{"field": "phv_stage", "operator": "neq", "value": "none"}]}'::jsonb,
  '{"show_predicted_height": true, "show_growth_velocity": true}'::jsonb,
  'PHV stage: {phv_stage}. Growth-aware training adjustments active.'
);

-- 1000 · Engagement / Consistency Streak
INSERT INTO dashboard_sections (
  section_key, display_name, component_type, sort_order,
  visibility, config, coaching_text
) VALUES (
  'engagement', 'Consistency Streak', 'engagement_bar', 1000,
  NULL,
  '{"metric": "current_streak", "milestones": [7, 14, 30, 60, 90], "show_freeze_tokens": true}'::jsonb,
  NULL
);

-- 1100 · Up Next / Today's Plan (screen-level)
INSERT INTO dashboard_sections (
  section_key, display_name, component_type, sort_order,
  visibility, config, coaching_text
) VALUES (
  'up_next_timeline', 'Up Next / Today''s Plan', 'up_next', 1100,
  NULL,
  '{"show_adapted_plan": true, "show_hints": true, "show_intensity": true}'::jsonb,
  NULL
);

COMMIT;

-- ─── Verify ─────────────────────────────────────────────────────────────
-- Final state after reset. Should return exactly 14 rows in sort_order.
SELECT section_key, display_name, component_type, sort_order, visibility IS NOT NULL AS is_gated
FROM dashboard_sections
ORDER BY sort_order;
