-- ════════════════════════════════════════════════════════════════════════════
-- Migration 055: Align dashboard section sort_orders with screen zones
-- ════════════════════════════════════════════════════════════════════════════
--
-- Problem: Screen-level components (signal_hero, daily_recs, up_next) render
-- in fixed JSX positions on the mobile dashboard (Zones 1, 2, 4 respectively),
-- but their sort_orders were seeded at arbitrary values (100, 150, 1100) that
-- didn't match their actual screen position. This caused the CMS admin table
-- to display a misleading order.
--
-- Fix: Assign sort_orders that match the true top-to-bottom rendering order:
--   Zone 1 (signal_hero)  → sort 10   (always first on screen)
--   Zone 2 (daily_recs)   → sort 20   (always second on screen)
--   Zone 3 (renderer)     → sort 100+ (CMS-reorderable sections)
--   Zone 4 (up_next)      → sort 9999 (always last on screen)
--
-- Zone 3 sections keep their relative order but are rebased to start at 100.
-- ════════════════════════════════════════════════════════════════════════════

-- Step 1: Pin screen-level sections to zone-correct sort_orders
UPDATE dashboard_sections SET sort_order = 10   WHERE component_type = 'signal_hero';
UPDATE dashboard_sections SET sort_order = 20   WHERE component_type = 'daily_recs';
UPDATE dashboard_sections SET sort_order = 9999 WHERE component_type = 'up_next';

-- Step 2: Rebase Zone 3 sections to start at 100, maintaining their
-- relative order. Uses a window function to assign sequential values.
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY sort_order ASC) AS rn
  FROM dashboard_sections
  WHERE component_type NOT IN ('signal_hero', 'daily_recs', 'up_next')
)
UPDATE dashboard_sections ds
SET sort_order = r.rn * 100
FROM ranked r
WHERE ds.id = r.id;
