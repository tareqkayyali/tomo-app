-- ════════════════════════════════════════════════════════════════════════════
-- Migration 053: dashboard_sections — CMS-Managed Dashboard Layout
-- ════════════════════════════════════════════════════════════════════════════
--
-- Extends the CMS with a dynamic dashboard section system.
-- Each section maps to a React Native component type on the mobile dashboard.
-- Admins control layout order, visibility conditions (same DSL as pd_signals),
-- coaching text with {field} interpolation, and per-component config JSONB.
--
-- Component types:
--   signal_hero       — Main readiness signal card (PHV_GATE, OVERLOADED, etc.)
--   status_ring       — Circular readiness score ring
--   kpi_row           — Horizontal KPI chips (e.g. sleep, HRV, soreness)
--   sparkline_row     — Mini trend sparklines (7-day rolling)
--   dual_load         — Academic + athletic load gauge
--   benchmark         — Gap-to-benchmark progress bars
--   rec_list          — AI recommendation cards
--   event_list        — Upcoming events / schedule preview
--   growth_card       — PHV growth tracking card
--   engagement_bar    — Streak / consistency progress
--   protocol_banner   — Active protocol alert banner
--   custom_card       — Freeform headline + body + optional CTA
--
-- Visibility uses the same condition DSL as pd_signals / pd_protocols:
--   {"match": "all"|"any", "conditions": [{"field": "...", "operator": "...", "value": ...}]}
-- When visibility is NULL, the section is always shown.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS dashboard_sections (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity (unique key for code references + admin UI)
  section_key       TEXT NOT NULL UNIQUE,
  display_name      TEXT NOT NULL,

  -- Component discriminator — determines which RN component renders this section
  component_type    TEXT NOT NULL CHECK (component_type IN (
    'signal_hero', 'status_ring', 'kpi_row', 'sparkline_row',
    'dual_load', 'benchmark', 'rec_list', 'event_list',
    'growth_card', 'engagement_bar', 'protocol_banner', 'custom_card'
  )),

  -- Layout ordering (lower = higher on screen)
  sort_order        INT NOT NULL DEFAULT 0,

  -- Visibility conditions (same DSL as pd_signals / pd_protocols)
  -- NULL = always visible
  visibility        JSONB DEFAULT NULL,

  -- Per-component configuration (shape depends on component_type)
  config            JSONB NOT NULL DEFAULT '{}',

  -- Optional coaching text (supports {field} interpolation against snapshot)
  coaching_text     TEXT DEFAULT NULL,

  -- Sport scoping — NULL = all sports, array = only these sports
  sport_filter      TEXT[] DEFAULT NULL,

  -- Admin controls
  is_enabled        BOOLEAN NOT NULL DEFAULT TRUE,

  -- Audit
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by        UUID DEFAULT NULL
);

-- Index: fast loading of enabled sections in display order
CREATE INDEX IF NOT EXISTS idx_dashboard_sections_enabled_order
  ON dashboard_sections (is_enabled, sort_order ASC)
  WHERE is_enabled = TRUE;

-- Index: lookup by section_key
CREATE INDEX IF NOT EXISTS idx_dashboard_sections_key
  ON dashboard_sections (section_key);

-- ── RLS ──
ALTER TABLE dashboard_sections ENABLE ROW LEVEL SECURITY;

-- Service role has full access (admin panel uses service role key)
CREATE POLICY dashboard_sections_service_all ON dashboard_sections
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- SEED: Default Dashboard Layout
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Signal Hero — always first, always visible
INSERT INTO dashboard_sections (section_key, display_name, component_type, sort_order, visibility, config, coaching_text) VALUES (
  'signal_hero',
  'Readiness Signal',
  'signal_hero',
  100,
  NULL,
  '{"show_adapted_plan": true, "show_urgency_badge": true}',
  NULL
);

-- 2. Status Ring — readiness score visualization
INSERT INTO dashboard_sections (section_key, display_name, component_type, sort_order, visibility, config, coaching_text) VALUES (
  'readiness_ring',
  'Readiness Score',
  'status_ring',
  200,
  NULL,
  '{"metric": "readiness_score", "max_value": 100, "label": "Readiness", "show_trend": true}',
  NULL
);

-- 3. KPI Row — core vitals
INSERT INTO dashboard_sections (section_key, display_name, component_type, sort_order, visibility, config, coaching_text) VALUES (
  'core_vitals',
  'Core Vitals',
  'kpi_row',
  300,
  NULL,
  '{"chips": [{"metric": "sleep_hours", "label": "Sleep", "unit": "h", "target": 8, "positive_when": "above"}, {"metric": "soreness", "label": "Soreness", "unit": "/5", "target": 2, "positive_when": "below"}, {"metric": "energy", "label": "Energy", "unit": "/5", "target": 4, "positive_when": "above"}, {"metric": "mood", "label": "Mood", "unit": "/5", "target": 4, "positive_when": "above"}]}',
  NULL
);

-- 4. Sparkline Row — 7-day trends
INSERT INTO dashboard_sections (section_key, display_name, component_type, sort_order, visibility, config, coaching_text) VALUES (
  'weekly_trends',
  'Weekly Trends',
  'sparkline_row',
  400,
  NULL,
  '{"metrics": ["readiness_score", "sleep_hours", "hrv_morning_ms"], "days": 7, "show_delta": true}',
  NULL
);

-- 5. Dual Load — only visible when academic data exists
INSERT INTO dashboard_sections (section_key, display_name, component_type, sort_order, visibility, config, coaching_text) VALUES (
  'dual_load',
  'Dual Load Index',
  'dual_load',
  500,
  '{"match": "all", "conditions": [{"field": "dual_load_index", "operator": "gt", "value": 0}]}',
  '{"show_exam_countdown": true, "show_study_hours": true}',
  'Balancing training and academics — {dual_load_index}% combined load.'
);

-- 6. Benchmark Gaps — show when benchmarks are available
INSERT INTO dashboard_sections (section_key, display_name, component_type, sort_order, visibility, config, coaching_text) VALUES (
  'benchmark_gaps',
  'Benchmark Progress',
  'benchmark',
  600,
  NULL,
  '{"max_items": 4, "show_percentile": true, "sort_by": "gap_desc"}',
  NULL
);

-- 7. AI Recommendations
INSERT INTO dashboard_sections (section_key, display_name, component_type, sort_order, visibility, config, coaching_text) VALUES (
  'ai_recommendations',
  'AI Recommendations',
  'rec_list',
  700,
  NULL,
  '{"max_items": 3, "priority_filter": ["P1", "P2"], "show_reasoning": true}',
  NULL
);

-- 8. Upcoming Events
INSERT INTO dashboard_sections (section_key, display_name, component_type, sort_order, visibility, config, coaching_text) VALUES (
  'upcoming_events',
  'Upcoming Events',
  'event_list',
  800,
  NULL,
  '{"max_items": 5, "days_ahead": 7, "show_type_icon": true}',
  NULL
);

-- 9. Growth Card — only for athletes with PHV data
INSERT INTO dashboard_sections (section_key, display_name, component_type, sort_order, visibility, config, coaching_text) VALUES (
  'growth_tracking',
  'Growth Tracking',
  'growth_card',
  900,
  '{"match": "all", "conditions": [{"field": "phv_stage", "operator": "neq", "value": "none"}]}',
  '{"show_predicted_height": true, "show_growth_velocity": true}',
  'PHV stage: {phv_stage}. Growth-aware training adjustments active.'
);

-- 10. Engagement Bar — streak and consistency
INSERT INTO dashboard_sections (section_key, display_name, component_type, sort_order, visibility, config, coaching_text) VALUES (
  'engagement',
  'Consistency Streak',
  'engagement_bar',
  1000,
  NULL,
  '{"metric": "current_streak", "milestones": [7, 14, 30, 60, 90], "show_freeze_tokens": true}',
  NULL
);

-- 11. Protocol Banner — only when active protocol exists
INSERT INTO dashboard_sections (section_key, display_name, component_type, sort_order, visibility, config, coaching_text) VALUES (
  'active_protocol',
  'Active Protocol',
  'protocol_banner',
  50,
  '{"match": "all", "conditions": [{"field": "has_active_protocol", "operator": "eq", "value": true}]}',
  '{"show_severity": true, "show_actions": true}',
  NULL
);

-- 12. Custom Welcome Card (example — admin can add more)
INSERT INTO dashboard_sections (section_key, display_name, component_type, sort_order, visibility, config, coaching_text) VALUES (
  'welcome_card',
  'Welcome',
  'custom_card',
  10,
  NULL,
  '{"headline_template": "Hey {first_name}", "body_template": "Your readiness is {readiness_score}. {coaching_summary}", "cta_label": null, "cta_route": null}',
  NULL
);
