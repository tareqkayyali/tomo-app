-- =========================================================================
-- Migration 093: ai_issues multi-source support
-- =========================================================================
-- Phase 3 (auto-heal close-the-loop) extends ai_issues beyond LangSmith
-- trace source to also carry:
--   - source='eval'       — eval runner failures per scenario
--   - source='cqe_drift'  — CQE drift alerts surfaced for unified review
--
-- The two trace-specific NOT NULL columns (`issue_type`, `week_start`) are
-- meaningless for eval/cqe rows. Relax both to NULLABLE. The existing CHECK
-- on `issue_type` values remains — NULL satisfies the CHECK by default
-- (Postgres: CHECK with NULL evaluates to NULL which passes).
--
-- Trace-source writers (Python admin_ai_health.py, LangSmith collector)
-- continue to populate both fields, so nothing breaks for that path.
--
-- Idempotent. Safe to re-run.
-- =========================================================================

BEGIN;

-- Relax NOT NULL — trace-source still populates; eval/cqe_drift leave NULL
DO $$ BEGIN
  ALTER TABLE ai_issues ALTER COLUMN issue_type DROP NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ai_issues ALTER COLUMN week_start DROP NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;

-- Index to accelerate the eval-source upsert lookup
-- (source='eval', target_file, target_symbol, status IN (...))
CREATE INDEX IF NOT EXISTS idx_ai_issues_eval_upsert
  ON ai_issues (target_file, target_symbol, status)
  WHERE source = 'eval';

-- Index to accelerate the cqe_drift-source upsert lookup
CREATE INDEX IF NOT EXISTS idx_ai_issues_cqe_drift_upsert
  ON ai_issues (target_file, target_symbol, status)
  WHERE source = 'cqe_drift';

COMMIT;
