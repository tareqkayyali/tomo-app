-- ============================================================================
-- Migration 104: CV Completeness column cleanup (truly idempotent rewrite)
-- ============================================================================
-- History: this content was originally migration 095. Renamed to 104 because
-- v095's prefix collided with another migration. The original UPDATE statement
-- referenced cv_completeness_pct directly, which fails at parse time on any
-- environment where the column was already dropped (i.e. any environment
-- where v095 already ran). Wrapped in a DO block + EXECUTE so the statement
-- only parses + runs when the column is actually present.
--
-- Background: v094 added athlete_snapshots.cv_completeness_pct, but the
-- canonical column cv_completeness already existed (migration 012) and was
-- already consumed by contextBuilder, notificationTriggers, and snapshot
-- enrichment. This migration consolidates on the legacy name:
--   1. Backfill legacy cv_completeness from cv_completeness_pct where null
--   2. Drop cv_completeness_pct
-- Truly idempotent — safe to re-run on any environment regardless of state.
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'athlete_snapshots'
      AND column_name = 'cv_completeness_pct'
  ) THEN
    EXECUTE 'UPDATE public.athlete_snapshots
             SET cv_completeness = cv_completeness_pct
             WHERE cv_completeness IS NULL
               AND cv_completeness_pct IS NOT NULL';

    EXECUTE 'ALTER TABLE public.athlete_snapshots
             DROP COLUMN cv_completeness_pct';
  END IF;
END $$;

-- ============================================================================
-- End of migration 104
-- ============================================================================
