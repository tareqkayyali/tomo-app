-- ════════════════════════════════════════════════════════════════════════════
-- Migration 066: dashboard panel sections (Wave 3b.1)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Extends the existing `dashboard_sections` CMS surface to cover the three
-- Dashboard slide-up panels (Program / Metrics / Progress). Previously the
-- panel contents were hardcoded in the mobile app — now each sub-section
-- can be toggled, reordered, and visibility-filtered from the admin panel.
--
-- Additive, idempotent, zero destructive ops. Existing rows are unchanged
-- (their `panel_key` defaults to NULL, so current "screen-level" behaviour
-- is preserved).
--
-- Tables touched:
--   dashboard_sections  — ADD COLUMN panel_key; extend component_type CHECK;
--                        new composite index; seed 15 rows (ON CONFLICT
--                        DO NOTHING keyed on section_key)
--
-- Related mobile/backend changes (not in this SQL):
--   • dashboardSectionLoader.resolveDashboardLayout now accepts an optional
--     panelKey arg; defaults to screen-level (panel_key IS NULL).
--   • /api/v1/boot fans out to 4 parallel resolveDashboardLayout calls and
--     returns `panelLayouts: { program, metrics, progress }` alongside the
--     existing `dashboardLayout`.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Add panel_key column ─────────────────────────────────────────────────
ALTER TABLE dashboard_sections
  ADD COLUMN IF NOT EXISTS panel_key TEXT DEFAULT NULL;

-- Check constraint on panel_key (NULL allowed; otherwise one of three panels)
ALTER TABLE dashboard_sections
  DROP CONSTRAINT IF EXISTS dashboard_sections_panel_key_check;
ALTER TABLE dashboard_sections
  ADD CONSTRAINT dashboard_sections_panel_key_check
  CHECK (panel_key IS NULL OR panel_key IN ('program', 'metrics', 'progress'));

-- ── 2. Drop the component_type CHECK entirely ──────────────────────────────
-- The original 053 migration enumerated ~12 component types. Over time, new
-- renderers were added (054/055 seeds, admin-authored rows) without
-- extending the CHECK — so prod contains values outside the original set.
-- Re-enumerating them here would just push the drift forward.
--
-- Validation is now enforced at the admin API boundary via the Zod enum in
-- `backend/lib/validation/dashboardSectionSchemas.ts` — the only write path.
-- Dropping the CHECK removes the enumeration-drift failure mode permanently.
ALTER TABLE dashboard_sections
  DROP CONSTRAINT IF EXISTS dashboard_sections_component_type_check;

-- ── 3. Composite index for per-panel fetches ───────────────────────────────
-- Existing `idx_dashboard_sections_enabled_order` still covers screen-level
-- loads (panel_key IS NULL). This index speeds up the three per-panel fetches.
CREATE INDEX IF NOT EXISTS idx_dashboard_sections_panel_order
  ON dashboard_sections (panel_key, sort_order ASC)
  WHERE is_enabled = TRUE AND panel_key IS NOT NULL;

-- ── 4. Seed: 15 default panel sub-sections ─────────────────────────────────
-- Sort orders mirror the current hardcoded order in the mobile panels so
-- visual behaviour is unchanged until Phase 3b.2 wires the mobile consumer.
-- ON CONFLICT (section_key) DO NOTHING — safe to re-run.

-- Program panel ─────────────────────────────────────────────────────────────
INSERT INTO dashboard_sections
  (section_key, display_name, component_type, panel_key, sort_order, visibility, config, coaching_text)
VALUES
  ('program_today_session', 'Today''s Adapted Session', 'program_today_session', 'program', 100, NULL, '{}', NULL),
  ('program_my_programs',   'My Programs',               'program_my_programs',   'program', 200, NULL, '{}', NULL),
  ('program_ai_recs',       'AI Recommendations',        'program_ai_recs',       'program', 300, NULL, '{}', NULL),
  ('program_week_strip',    'This Week',                 'program_week_strip',    'program', 400, NULL, '{}', NULL)
ON CONFLICT (section_key) DO NOTHING;

-- Metrics panel ─────────────────────────────────────────────────────────────
INSERT INTO dashboard_sections
  (section_key, display_name, component_type, panel_key, sort_order, visibility, config, coaching_text)
VALUES
  ('metrics_sync_row',          'Sync Vitals Row',    'metrics_sync_row',          'metrics', 100, NULL, '{}', NULL),
  ('metrics_hrv',               'HRV',                'metrics_hrv',               'metrics', 200, NULL, '{}', NULL),
  ('metrics_sleep',             'Sleep',              'metrics_sleep',             'metrics', 300, NULL, '{}', NULL),
  ('metrics_acwr',              'ACWR',               'metrics_acwr',              'metrics', 400, NULL, '{}', NULL),
  ('metrics_readiness_trend',   'Readiness Trend',    'metrics_readiness_trend',   'metrics', 500, NULL, '{}', NULL),
  ('metrics_wellness_trends',   'Wellness Trends',    'metrics_wellness_trends',   'metrics', 600, NULL, '{}', NULL),
  ('metrics_training_load',     'Training Load (7d)', 'metrics_training_load',     'metrics', 700, NULL, '{}', NULL)
ON CONFLICT (section_key) DO NOTHING;

-- Progress panel ────────────────────────────────────────────────────────────
INSERT INTO dashboard_sections
  (section_key, display_name, component_type, panel_key, sort_order, visibility, config, coaching_text)
VALUES
  ('progress_cv_ring',            'Performance Identity',  'progress_cv_ring',            'progress', 100, NULL, '{}', NULL),
  ('progress_this_month',         'This Month',            'progress_this_month',         'progress', 200, NULL, '{}', NULL),
  ('progress_training_load_28d',  'Training Load (28d)',   'progress_training_load_28d',  'progress', 300, NULL, '{}', NULL),
  ('progress_consistency',        'Consistency',           'progress_consistency',        'progress', 400, NULL, '{}', NULL),
  ('progress_benchmark',          'Benchmark Progress',    'progress_benchmark',          'progress', 500, NULL, '{}', NULL)
ON CONFLICT (section_key) DO NOTHING;
