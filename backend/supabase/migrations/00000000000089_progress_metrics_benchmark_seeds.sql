-- ─────────────────────────────────────────────────────────────────────────
-- Progress Metrics — athlete-measured (benchmark) seeds
-- ─────────────────────────────────────────────────────────────────────────
-- Populates the Signal > Progress grid with sport-specific physical-test
-- cards driven by the `phone_test_sessions` table (via source_kind =
-- 'benchmark', source_field = <test_type kebab-case key>).
--
-- Direction:
--   • sprints + agility tests → lower_better (seconds, faster = progress)
--   • jumps + reaction time   → lower_better for ms, higher_better for cm
--
-- sport_filter restricts each row to the sports where the test is meaningful.
-- Admin can add more via /admin/progress-metrics; this is just the starter
-- set.
--
-- Idempotent via ON CONFLICT DO NOTHING on metric_key.
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO progress_metrics (
  id, metric_key, display_name, display_unit, category,
  source_kind, source_field, direction,
  value_min, value_max, sort_order, sport_filter, is_enabled
) VALUES
  -- Football / soccer — the standard acceleration + CoD + jump cohort
  (gen_random_uuid(), 'sprint_10m',  '10m Sprint',  's',  'performance',
   'benchmark', '10m-sprint',      'lower_better',
   1.2, 2.5, 1000, ARRAY['football','soccer']::text[], TRUE),

  (gen_random_uuid(), 'sprint_30m',  '30m Sprint',  's',  'performance',
   'benchmark', '30m-sprint',      'lower_better',
   3.5, 6.0, 1010, ARRAY['football','soccer','athletics']::text[], TRUE),

  (gen_random_uuid(), 'agility_505', '5-0-5 Agility','s', 'performance',
   'benchmark', '5-0-5',           'lower_better',
   2.0, 3.5, 1020, ARRAY['football','soccer','basketball','tennis','padel']::text[], TRUE),

  (gen_random_uuid(), 'cmj',         'Jump Height', 'cm', 'performance',
   'benchmark', 'cmj',             'higher_better',
   20, 80, 1030, ARRAY['football','soccer','basketball','athletics']::text[], TRUE),

  -- Basketball — extra variant for court-specific tempo
  (gen_random_uuid(), 'sprint_20m',  '20m Sprint',  's',  'performance',
   'benchmark', '20m-sprint',      'lower_better',
   2.5, 4.5, 1040, ARRAY['basketball']::text[], TRUE),

  -- Racket sports — reaction + lateral agility
  (gen_random_uuid(), 'reaction_time','Reaction',   'ms', 'performance',
   'benchmark', 'reaction',        'lower_better',
   150, 500, 1050, ARRAY['tennis','padel','basketball']::text[], TRUE),

  (gen_random_uuid(), 'agility_5105','5-10-5 Agility','s','performance',
   'benchmark', '5-10-5-agility',  'lower_better',
   4.0, 7.0, 1060, ARRAY['tennis','padel','basketball']::text[], TRUE),

  -- Athletics-specific power
  (gen_random_uuid(), 'broad_jump',  'Broad Jump',  'cm', 'performance',
   'benchmark', 'broad-jump',      'higher_better',
   150, 310, 1070, ARRAY['athletics','football','soccer']::text[], TRUE)

ON CONFLICT (metric_key) DO NOTHING;
