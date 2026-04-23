-- ============================================================================
-- Migration 095: CV Completeness column cleanup
-- ============================================================================
-- Migration 094 added athlete_snapshots.cv_completeness_pct, but the canonical
-- column cv_completeness already exists on athlete_snapshots (migration 012)
-- and is already consumed by contextBuilder, notificationTriggers, and
-- snapshot enrichment. This migration consolidates on the legacy name:
--   1. Backfill legacy cv_completeness from cv_completeness_pct where null
--   2. Drop cv_completeness_pct
-- Idempotent. Safe to re-run.
-- ============================================================================

-- Backfill legacy from 094's column (only if 094 ran and legacy is null)
UPDATE public.athlete_snapshots
SET cv_completeness = cv_completeness_pct
WHERE cv_completeness IS NULL
  AND cv_completeness_pct IS NOT NULL;

-- Drop the redundant column added in 094
ALTER TABLE public.athlete_snapshots
  DROP COLUMN IF EXISTS cv_completeness_pct;

-- ============================================================================
-- End of migration 095
-- ============================================================================
